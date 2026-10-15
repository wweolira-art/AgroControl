import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { parseGeoJsonArquivo } from '../src/maps/geojson-import';
import { iniciarDesenho } from '../src/maps/desenho-sessao';
import { lerTextoDocumento } from '../src/maps/ler-documento';
import { carregarMapa, limparCacheMapa } from '../src/maps/registry';
import {
  atualizarTalhao,
  excluirTalhao,
  excluirTodosTalhoes,
  importarTalhoes,
  listarTalhoesAdmin,
  SQL_HABILITAR_ADMIN_MAPA,
  type MapaTalhaoAdmin,
} from '../src/services/mapa-talhao';
import { colors } from '../src/theme/colors';
import type { FeatureCollection, TalhaoFeature } from '../src/types/geo';

export default function MapaAdminScreen() {
  const router = useRouter();
  const { isAdmin, pronto } = useAuth();
  const [linhas, setLinhas] = useState<MapaTalhaoAdmin[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [mostrarSql, setMostrarSql] = useState(false);
  const [editando, setEditando] = useState<MapaTalhaoAdmin | null>(null);

  useEffect(() => {
    if (pronto && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, pronto, router]);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await listarTalhoesAdmin());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível listar os talhões.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void recarregar();
      }
    }, [isAdmin, recarregar]),
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) {
      return linhas;
    }
    return linhas.filter((item) =>
      `${item.fazenda} ${item.lote} ${item.codFazenda} ${item.campo} ${item.produtor} ${item.secId}`
        .toLowerCase()
        .includes(termo),
    );
  }, [busca, linhas]);

  const atualizarCacheMapa = async () => {
    limparCacheMapa();
    await carregarMapa(true);
  };

  const importarFeatures = async (features: TalhaoFeature[], substituir: boolean) => {
    setTrabalhando(true);
    setErro(null);
    setStatus(substituir ? 'Substituindo mapa…' : `Importando ${features.length} talhões…`);
    try {
      const resultado = await importarTalhoes(features, {
        substituir,
        onProgresso: (feitos, total) => setStatus(`Gravando ${feitos}/${total}…`),
      });
      await atualizarCacheMapa();
      await recarregar();
      setStatus(`${resultado.gravados} talhões gravados na API mapa_talhao.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha na importação.');
      setMostrarSql(true);
      setStatus(null);
    } finally {
      setTrabalhando(false);
    }
  };

  const importarArquivo = async (substituir: boolean) => {
    const pick = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/geo+json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      base64: false,
    });
    if (pick.canceled || !pick.assets[0]) {
      return;
    }
    try {
      setStatus(`Lendo ${pick.assets[0].name}…`);
      const texto = await lerTextoDocumento(pick.assets[0]);
      const features = parseGeoJsonArquivo(texto);
      if (features.length === 0) {
        throw new Error('O arquivo não tem polígonos Polygon/MultiPolygon.');
      }
      if (substituir) {
        Alert.alert(
          'Substituir mapa',
          `Isso apaga os ${linhas.length} lotes atuais e importa ${features.length} do arquivo. Continuar?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Substituir', style: 'destructive', onPress: () => void importarFeatures(features, true) },
          ],
        );
        return;
      }
      await importarFeatures(features, false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler o GeoJSON.');
      setStatus(null);
    }
  };

  const importarDoApp = (substituir: boolean) => {
    const collection = require('../assets/maps/talhoes.json') as FeatureCollection;
    const features = collection.features ?? [];
    const rodar = () => void importarFeatures(features, substituir);
    if (substituir) {
      Alert.alert(
        'Substituir mapa',
        `Apaga os ${linhas.length} lotes da API e importa os ${features.length} talhões do aplicativo. Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Substituir', style: 'destructive', onPress: rodar },
        ],
      );
      return;
    }
    rodar();
  };

  const abrirDesenho = (item?: MapaTalhaoAdmin) => {
    iniciarDesenho(
      item
        ? {
            modo: 'editar',
            idTalhao: item.idTalhao,
            idExterno: item.idExterno,
            fazenda: item.fazenda,
            codFazenda: item.codFazenda,
            lote: item.lote,
            campo: item.campo,
            produtor: item.produtor,
            secId: item.secId,
            geojson: item.geojson,
            dataCadastro: item.dataCadastro,
          }
        : {
            modo: 'novo',
            idExterno: null,
            fazenda: '',
            codFazenda: 0,
            lote: 0,
            campo: '',
            produtor: '',
            secId: '',
            geojson: null,
            dataCadastro: null,
          },
    );
    router.push('/desenhar-talhao');
  };

  const confirmarExclusao = (item: MapaTalhaoAdmin) => {
    Alert.alert('Excluir lote', `${item.fazenda} · talhão ${item.lote} será removido da API.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setTrabalhando(true);
            setErro(null);
            try {
              await excluirTalhao(item.idTalhao);
              if (editando?.idTalhao === item.idTalhao) {
                setEditando(null);
              }
              await atualizarCacheMapa();
              await recarregar();
              setStatus(`Lote ${item.lote} excluído.`);
            } catch (falha) {
              setErro(falha instanceof Error ? falha.message : 'Não foi possível excluir.');
            } finally {
              setTrabalhando(false);
            }
          })();
        },
      },
    ]);
  };

  const confirmarExcluirTodos = () => {
    Alert.alert('Apagar todos os lotes', `Isso remove ${linhas.length} registros da tabela mapa_talhao.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar tudo',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setTrabalhando(true);
            setErro(null);
            try {
              await excluirTodosTalhoes((feitos, total) => setStatus(`Excluindo ${feitos}/${total}…`));
              setEditando(null);
              await atualizarCacheMapa();
              await recarregar();
              setStatus('Todos os lotes foram excluídos.');
            } catch (falha) {
              setErro(falha instanceof Error ? falha.message : 'Não foi possível excluir os lotes.');
            } finally {
              setTrabalhando(false);
            }
          })();
        },
      },
    ]);
  };

  const salvarEdicao = async () => {
    if (!editando) {
      return;
    }
    setTrabalhando(true);
    setErro(null);
    try {
      await atualizarTalhao(editando.idTalhao, {
        idExterno: editando.idExterno,
        codFazenda: Number(editando.codFazenda),
        fazenda: editando.fazenda,
        lote: Number(editando.lote),
        campo: editando.campo,
        produtor: editando.produtor,
        secId: editando.secId,
        geojson: editando.geojson,
        dataCadastro: editando.dataCadastro,
      });
      await atualizarCacheMapa();
      await recarregar();
      setStatus(`Talhão ${editando.lote} atualizado.`);
      setEditando(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar.');
      setMostrarSql(true);
    } finally {
      setTrabalhando(false);
    }
  };

  const trocarPoligono = async () => {
    if (!editando) {
      return;
    }
    const pick = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/geo+json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      base64: false,
    });
    if (pick.canceled || !pick.assets[0]) {
      return;
    }
    try {
      const texto = await lerTextoDocumento(pick.assets[0]);
      const [feature] = parseGeoJsonArquivo(texto);
      if (!feature) {
        throw new Error('O arquivo não tem polígono.');
      }
      setEditando({
        ...editando,
        geojson: JSON.stringify({ type: feature.geometry.type, coordinates: feature.geometry.coordinates }),
      });
      setStatus('Polígono carregado. Toque em Salvar área para gravar.');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler o polígono.');
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header subtitle="Talhões · importar, editar e excluir" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Pressable onPress={() => router.replace('/')} style={styles.back}>
          <Text style={styles.backText}>← Início</Text>
        </Pressable>

        <Text style={styles.section}>Como importar</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>
            1. No Database Actions, execute uma vez o SQL de habilitação (obrigatório: a API ainda não tem a coluna geojson).
          </Text>
          <Text style={styles.meta}>
            2. Depois toque em Importar mapa do app (já é o arquivo Mapa SHP (3).json) ou Importar GeoJSON no celular.
          </Text>
          <Pressable onPress={() => setMostrarSql((atual) => !atual)}>
            <Text style={styles.link}>{mostrarSql ? 'Ocultar SQL' : 'Ver SQL de habilitação'}</Text>
          </Pressable>
          {mostrarSql ? (
            <Text selectable style={styles.sql}>
              {SQL_HABILITAR_ADMIN_MAPA}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.botoes}>
            <ActionButton
              label="Importar GeoJSON"
              onPress={() => void importarArquivo(false)}
              disabled={trabalhando}
            />
          </View>
          <View style={styles.botoes}>
            <ActionButton
              label="Importar mapa do app"
              variant="secondary"
              onPress={() => importarDoApp(false)}
              disabled={trabalhando}
            />
          </View>
          <View style={styles.botoes}>
            <ActionButton
              label="Substituir pelo arquivo"
              variant="ghost"
              onPress={() => void importarArquivo(true)}
              disabled={trabalhando}
            />
          </View>
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        </View>

        {editando ? (
          <>
            <Text style={styles.section}>Editar área</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Fazenda</Text>
              <TextInput
                value={editando.fazenda}
                onChangeText={(fazenda) => setEditando({ ...editando, fazenda })}
                style={styles.input}
              />
              <Text style={styles.label}>Código da fazenda</Text>
              <TextInput
                value={String(editando.codFazenda)}
                onChangeText={(valor) => setEditando({ ...editando, codFazenda: Number(valor) || 0 })}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Lote / talhão</Text>
              <TextInput
                value={String(editando.lote)}
                onChangeText={(valor) => setEditando({ ...editando, lote: Number(valor) || 0 })}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Campo</Text>
              <TextInput
                value={editando.campo}
                onChangeText={(campo) => setEditando({ ...editando, campo })}
                style={styles.input}
              />
              <Text style={styles.label}>Produtor</Text>
              <TextInput
                value={editando.produtor}
                onChangeText={(produtor) => setEditando({ ...editando, produtor })}
                style={styles.input}
              />
              <Text style={styles.label}>sec_id</Text>
              <TextInput
                value={editando.secId}
                onChangeText={(secId) => setEditando({ ...editando, secId })}
                style={styles.input}
              />
              <Text style={styles.meta}>
                Área calculada:{' '}
                {editando.areaHa != null && editando.areaHa > 0 ? `${editando.areaHa.toFixed(2)} ha` : 'sem polígono'}
              </Text>
              <View style={styles.botoes}>
                <ActionButton label="Trocar polígono" variant="ghost" onPress={() => void trocarPoligono()} />
              </View>
              <View style={styles.botoes}>
                <ActionButton label="Desenhar mapa" variant="secondary" onPress={() => abrirDesenho(editando)} />
              </View>
              <View style={styles.botoes}>
                <ActionButton label="Salvar área" onPress={() => void salvarEdicao()} loading={trabalhando} />
                <ActionButton label="Cancelar" variant="ghost" onPress={() => setEditando(null)} />
              </View>
            </View>
          </>
        ) : null}

        <Text style={styles.section}>Lotes na API ({linhas.length})</Text>
        <View style={styles.botoes}>
          <ActionButton label="Novo talhão" onPress={() => abrirDesenho()} disabled={trabalhando} />
        </View>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar fazenda, lote, produtor…"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.busca]}
        />
        <View style={styles.card}>
          {carregando ? (
            <Text style={styles.meta}>Carregando…</Text>
          ) : filtradas.length === 0 ? (
            <Text style={styles.meta}>Nenhum lote na API mapa_talhao.</Text>
          ) : (
            filtradas.map((item) => (
              <View key={item.idTalhao} style={styles.item}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>
                    {item.fazenda} · {item.lote}
                  </Text>
                  <Text style={styles.badge}>{item.codFazenda}</Text>
                </View>
                <Text style={styles.meta}>
                  {item.produtor || 'Sem produtor'}
                  {item.campo ? ` · campo ${item.campo}` : ''}
                  {item.areaHa != null && item.areaHa > 0 ? ` · ${item.areaHa.toFixed(1)} ha` : ''}
                </Text>
                <View style={styles.itemActions}>
                  <Pressable onPress={() => setEditando(item)}>
                    <Text style={styles.link}>Editar</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmarExclusao(item)} disabled={trabalhando}>
                    <Text style={styles.linkDanger}>Excluir</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        {linhas.length > 0 ? (
          <View style={styles.botoes}>
            <ActionButton
              label="Apagar todos os lotes"
              variant="danger"
              onPress={confirmarExcluirTodos}
              disabled={trabalhando}
            />
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  back: {
    marginBottom: 16,
  },
  backText: {
    color: colors.leaf,
    fontWeight: '700',
  },
  section: {
    fontWeight: '800',
    color: colors.forest,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 20,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  busca: {
    marginBottom: 10,
  },
  botoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  meta: {
    color: colors.muted,
    fontWeight: '600',
    lineHeight: 20,
  },
  status: {
    color: colors.success,
    fontWeight: '700',
  },
  erro: {
    color: colors.danger,
    fontWeight: '700',
  },
  link: {
    color: colors.leaf,
    fontWeight: '800',
  },
  linkDanger: {
    color: colors.danger,
    fontWeight: '800',
  },
  sql: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.ink,
    backgroundColor: colors.cream,
    padding: 10,
    borderRadius: 8,
  },
  item: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.creamDark,
    gap: 4,
  },
  itemHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    color: colors.forest,
    fontWeight: '800',
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 4,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    color: colors.leaf,
    backgroundColor: colors.creamDark,
  },
});
