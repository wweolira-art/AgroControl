import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import { enviarApontamentoOracle, entradaOracleDoRascunho } from '../src/services/apontamento';
import { enviarPerdaOracle } from '../src/services/perdas';
import {
  atualizarPerdaLocal,
  atualizarRascunhoLocal,
  carregarPerdasLocal,
  carregarRascunhosLocal,
  removerPerdaLocal,
  removerRascunhoLocal,
} from '../src/services/apontamento-local';
import { colors } from '../src/theme/colors';
import { materiaisDoRascunho, rotuloTipoOperacao, type ApontamentoRascunho } from '../src/types/apontamento';
import { entradaOracleDaPerdaRascunho, type PerdaRascunho } from '../src/types/perdas';

function dataBr(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) {
    return iso;
  }
  return data.toLocaleDateString('pt-BR');
}

export default function ApontamentosLocaisScreen() {
  const router = useRouter();
  const { usuario } = useAuth();
  const { pode } = useDeviceAccess();
  const [lista, setLista] = useState<ApontamentoRascunho[]>([]);
  const [perdas, setPerdas] = useState<PerdaRascunho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [rascunhos, perdasSalvas] = await Promise.all([carregarRascunhosLocal(), carregarPerdasLocal()]);
      setLista(rascunhos);
      setPerdas(perdasSalvas);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler os apontamentos salvos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  const enviarUm = async (rascunho: ApontamentoRascunho) => {
    setEnviandoId(rascunho.id);
    setErro(null);
    try {
      const gravado = await enviarApontamentoOracle(entradaOracleDoRascunho(rascunho, usuario?.nome));
      const patch = {
        syncStatus: 'enviado' as const,
        syncErro: undefined,
        anoApontamento: gravado.anoApontamento,
        nrApontamento: gravado.nrApontamento,
        nrApontamentoGerado: gravado.nrApontamentoGerado,
        itemApontamentoGerado: gravado.itemApontamentoGerado,
      };
      await atualizarRascunhoLocal(rascunho.id, patch);
      setLista((atual) => atual.map((item) => (item.id === rascunho.id ? { ...item, ...patch } : item)));
      Alert.alert(
        'Enviado',
        `Apontamento ${gravado.anoApontamento}/${gravado.nrApontamentoGerado} gravado. Ele continuará no histórico do celular.`,
      );
    } catch (falha) {
      const mensagem = falha instanceof Error ? falha.message : 'Falha ao enviar.';
      setErro(mensagem);
      await atualizarRascunhoLocal(rascunho.id, { syncStatus: 'erro', syncErro: mensagem });
      setLista((atual) =>
        atual.map((item) => (item.id === rascunho.id ? { ...item, syncStatus: 'erro', syncErro: mensagem } : item)),
      );
    } finally {
      setEnviandoId(null);
    }
  };

  const enviarPerda = async (rascunho: PerdaRascunho) => {
    setEnviandoId(rascunho.id);
    setErro(null);
    try {
      const gravado = await enviarPerdaOracle(entradaOracleDaPerdaRascunho(rascunho));
      const patch = {
        syncStatus: 'enviado' as const,
        syncErro: undefined,
        numeroAmostra: gravado.numeroAmostra,
      };
      await atualizarPerdaLocal(rascunho.id, patch);
      setPerdas((atual) => atual.map((item) => (item.id === rascunho.id ? { ...item, ...patch } : item)));
      Alert.alert('Enviado', `Perda ${gravado.numeroAmostra} gravada com ${gravado.itens} tipo(s).`);
    } catch (falha) {
      const mensagem = falha instanceof Error ? falha.message : 'Falha ao enviar.';
      setErro(mensagem);
      await atualizarPerdaLocal(rascunho.id, { syncStatus: 'erro', syncErro: mensagem });
      setPerdas((atual) =>
        atual.map((item) => (item.id === rascunho.id ? { ...item, syncStatus: 'erro', syncErro: mensagem } : item)),
      );
    } finally {
      setEnviandoId(null);
    }
  };

  const enviarTodos = () => {
    const pendentes = lista.filter((item) => item.syncStatus !== 'enviado');
    const perdasPendentes = perdas.filter((item) => item.syncStatus !== 'enviado');
    if (pendentes.length === 0 && perdasPendentes.length === 0) {
      Alert.alert('Sem pendentes', 'Não há apontamentos não enviados para enviar ao Oracle.');
      return;
    }
    const totalPendentes = pendentes.length + perdasPendentes.length;
    Alert.alert(
      'Enviar todos',
      `Enviar ${totalPendentes} lançamento(s) não enviado(s) ao Oracle? Os que forem gravados com sucesso ficam no histórico.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            setEnviandoTodos(true);
            setErro(null);
            let ok = 0;
            let falhou = 0;
            let ultimaFalha = '';
            let restantes = [...lista];
            let perdasRestantes = [...perdas];
            for (const rascunho of pendentes) {
              try {
                const gravado = await enviarApontamentoOracle(entradaOracleDoRascunho(rascunho, usuario?.nome));
                const patch = {
                  syncStatus: 'enviado' as const,
                  syncErro: undefined,
                  anoApontamento: gravado.anoApontamento,
                  nrApontamento: gravado.nrApontamento,
                  nrApontamentoGerado: gravado.nrApontamentoGerado,
                  itemApontamentoGerado: gravado.itemApontamentoGerado,
                };
                await atualizarRascunhoLocal(rascunho.id, patch);
                restantes = restantes.map((item) => (item.id === rascunho.id ? { ...item, ...patch } : item));
                setLista([...restantes]);
                ok += 1;
              } catch (falha) {
                falhou += 1;
                ultimaFalha = falha instanceof Error ? falha.message : 'Falha ao enviar.';
                await atualizarRascunhoLocal(rascunho.id, { syncStatus: 'erro', syncErro: ultimaFalha });
                const idx = restantes.findIndex((item) => item.id === rascunho.id);
                if (idx >= 0) {
                  restantes[idx] = { ...restantes[idx], syncStatus: 'erro', syncErro: ultimaFalha };
                  setLista([...restantes]);
                }
              }
            }
            for (const perda of perdasPendentes) {
              try {
                const gravado = await enviarPerdaOracle(entradaOracleDaPerdaRascunho(perda));
                const patch = {
                  syncStatus: 'enviado' as const,
                  syncErro: undefined,
                  numeroAmostra: gravado.numeroAmostra,
                };
                await atualizarPerdaLocal(perda.id, patch);
                perdasRestantes = perdasRestantes.map((item) => (item.id === perda.id ? { ...item, ...patch } : item));
                setPerdas([...perdasRestantes]);
                ok += 1;
              } catch (falha) {
                falhou += 1;
                ultimaFalha = falha instanceof Error ? falha.message : 'Falha ao enviar.';
                await atualizarPerdaLocal(perda.id, { syncStatus: 'erro', syncErro: ultimaFalha });
                const idx = perdasRestantes.findIndex((item) => item.id === perda.id);
                if (idx >= 0) {
                  perdasRestantes[idx] = { ...perdasRestantes[idx], syncStatus: 'erro', syncErro: ultimaFalha };
                  setPerdas([...perdasRestantes]);
                }
              }
            }
            setEnviandoTodos(false);
            if (falhou > 0) {
              setErro(ultimaFalha);
            }
            Alert.alert(
              'Envio concluído',
              falhou > 0
                ? `${ok} enviado(s) e mantido(s) no histórico. ${falhou} falhou(aram) e permanece(m) pendente(s).`
                : `${ok} lançamento(s) enviado(s) ao Oracle e mantido(s) no histórico.`,
            );
          },
        },
      ],
    );
  };

  const excluirPerda = (rascunho: PerdaRascunho) => {
    Alert.alert('Excluir', 'Remove esta perda do celular. Não altera nada no Oracle.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await removerPerdaLocal(rascunho.id);
          setPerdas((atual) => atual.filter((item) => item.id !== rascunho.id));
        },
      },
    ]);
  };

  const excluir = (rascunho: ApontamentoRascunho) => {
    Alert.alert('Excluir', 'Remove este apontamento do celular. Não altera nada no Oracle.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await removerRascunhoLocal(rascunho.id);
          setLista((atual) => atual.filter((item) => item.id !== rascunho.id));
        },
      },
    ]);
  };

  const limparEnviados = () => {
    const enviados = lista.filter((item) => item.syncStatus === 'enviado');
    const perdasEnviadas = perdas.filter((item) => item.syncStatus === 'enviado');
    if (enviados.length === 0 && perdasEnviadas.length === 0) {
      Alert.alert('Sem enviados', 'Não há apontamentos enviados para limpar.');
      return;
    }
    const total = enviados.length + perdasEnviadas.length;
    Alert.alert(
      'Limpar enviados',
      `Remover ${total} lançamento(s) enviado(s) deste celular? Isso não altera nada no Oracle.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            for (const item of enviados) {
              await removerRascunhoLocal(item.id);
            }
            for (const item of perdasEnviadas) {
              await removerPerdaLocal(item.id);
            }
            setLista((atual) => atual.filter((item) => item.syncStatus !== 'enviado'));
            setPerdas((atual) => atual.filter((item) => item.syncStatus !== 'enviado'));
          },
        },
      ],
    );
  };

  const alterar = (rascunho: ApontamentoRascunho) => {
    router.push({ pathname: '/apontamento', params: { editarId: rascunho.id } });
  };

  const ocupado = enviandoTodos || enviandoId != null;
  const totalEnviados = lista.filter((item) => item.syncStatus === 'enviado').length;
  const totalPerdasEnviadas = perdas.filter((item) => item.syncStatus === 'enviado').length;
  const totalNaoEnviados = lista.length - totalEnviados + perdas.length - totalPerdasEnviadas;
  const totalLancamentos = lista.length + perdas.length;
  const totalEnviadosGeral = totalEnviados + totalPerdasEnviadas;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header subtitle="Apontamentos salvos no celular" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>

        <Text style={styles.intro}>
          Aqui ficam os apontamentos gravados neste aparelho. O app não apaga mais automaticamente após enviar ao
          Oracle; você decide quando limpar os enviados.
        </Text>

        {totalLancamentos > 0 ? (
          <View style={styles.resumo}>
            <Text style={styles.resumoTexto}>Enviados: {totalEnviadosGeral}</Text>
            <Text style={styles.resumoTexto}>Não enviados: {totalNaoEnviados}</Text>
          </View>
        ) : null}

        {carregando ? <ActivityIndicator color={colors.leaf} style={styles.loader} /> : null}
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        {!carregando && totalLancamentos === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTitulo}>Nenhum apontamento salvo</Text>
            <Text style={styles.vazioTexto}>
              Preencha o novo apontamento ou uma perda de colheita e toque em “Salvar no celular”. Eles aparecem aqui
              para envio e histórico.
            </Text>
          </View>
        ) : null}

        {lista.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text
              style={[
                styles.cardKicker,
                item.syncStatus === 'enviado' && styles.cardKickerEnviado,
                item.syncStatus === 'erro' && styles.cardKickerErro,
              ]}
            >
              {item.syncStatus === 'enviado'
                ? 'Enviado'
                : item.syncStatus === 'erro'
                  ? 'Não enviado · falha'
                  : 'Não enviado · pendente'} · {dataBr(item.dataApontamento)}
            </Text>
            <Text style={styles.cardTitulo}>
              {item.nomeFazenda} · talhão {item.codTalhao}
            </Text>
            <Text style={styles.cardLinha}>{item.nomeOperacao}</Text>
            {materiaisDoRascunho(item).map((linha) => (
              <Text key={`${item.id}-${linha.codMaterial}`} style={styles.cardLinha}>
                {linha.nomeMaterial} · qtde {linha.quantidade} {linha.codUnidade}
              </Text>
            ))}
            <Text style={styles.cardLinha}>Área {item.areaAplicada} ha</Text>
            <Text style={styles.cardSub}>
              {item.nomeFuncionario} · {item.nomeMeioaplicacao} · {rotuloTipoOperacao(item.tipoOperacao)}
            </Text>
            {item.syncErro ? <Text style={styles.cardErro}>{item.syncErro}</Text> : null}
            {item.syncStatus === 'enviado' && item.nrApontamentoGerado ? (
              <Text style={styles.cardSub}>
                Oracle: {item.anoApontamento}/{item.nrApontamentoGerado}
              </Text>
            ) : null}
            <View style={styles.cardAcoes}>
              {item.syncStatus !== 'enviado' ? (
                <ActionButton
                  label={enviandoId === item.id ? 'Enviando…' : 'Enviar ao Oracle'}
                  onPress={() => void enviarUm(item)}
                  disabled={ocupado}
                  loading={enviandoId === item.id}
                />
              ) : null}
              {pode('insumos') && <ActionButton label="Alterar" variant="secondary" onPress={() => alterar(item)} disabled={ocupado} />}
              <ActionButton
                label="Excluir"
                variant="ghost"
                onPress={() => excluir(item)}
                disabled={ocupado}
              />
            </View>
          </View>
        ))}

        {perdas.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text
              style={[
                styles.cardKicker,
                item.syncStatus === 'enviado' && styles.cardKickerEnviado,
                item.syncStatus === 'erro' && styles.cardKickerErro,
              ]}
            >
              Perda ·{' '}
              {item.syncStatus === 'enviado'
                ? 'Enviada'
                : item.syncStatus === 'erro'
                  ? 'Não enviada · falha'
                  : 'Não enviada · pendente'}{' '}
              · {dataBr(item.dataAmostra)}
            </Text>
            <Text style={styles.cardTitulo}>
              {item.nomeFazenda} · talhão {item.codTalhao}
            </Text>
            <Text style={styles.cardLinha}>
              {item.nomeTipocorte} · turno {item.turno} · safra {item.codSafra}
            </Text>
            {item.itens.map((linha) => (
              <Text key={`${item.id}-${linha.codTipoperda}`} style={styles.cardLinha}>
                {linha.descricao} · {linha.quantidade} kg
              </Text>
            ))}
            <Text style={styles.cardSub}>
              {item.nomeFrente ?? 'Sem frente'} · {item.nomeEquipamento ?? 'Sem equipamento'}
              {item.nomeOperador ? ` · ${item.nomeOperador}` : ''}
            </Text>
            {item.syncErro ? <Text style={styles.cardErro}>{item.syncErro}</Text> : null}
            {item.syncStatus === 'enviado' && item.numeroAmostra ? (
              <Text style={styles.cardSub}>Oracle perdas: {item.numeroAmostra}</Text>
            ) : null}
            <View style={styles.cardAcoes}>
              {item.syncStatus !== 'enviado' ? (
                <ActionButton
                  label={enviandoId === item.id ? 'Enviando…' : 'Enviar ao Oracle'}
                  onPress={() => void enviarPerda(item)}
                  disabled={ocupado}
                  loading={enviandoId === item.id}
                />
              ) : null}
              <ActionButton
                label="Excluir"
                variant="ghost"
                onPress={() => excluirPerda(item)}
                disabled={ocupado}
              />
            </View>
          </View>
        ))}

        {totalLancamentos > 0 ? (
          <View style={styles.acoes}>
            <ActionButton
              label={
                enviandoTodos
                  ? 'Enviando…'
                  : `Enviar pendentes ao Oracle (${lista.filter((item) => item.syncStatus !== 'enviado').length + perdas.filter((item) => item.syncStatus !== 'enviado').length})`
              }
              variant="secondary"
              onPress={enviarTodos}
              disabled={
                ocupado ||
                (lista.every((item) => item.syncStatus === 'enviado') &&
                  perdas.every((item) => item.syncStatus === 'enviado'))
              }
              loading={enviandoTodos}
            />
            {pode('insumos') && <ActionButton
              label="Insumos"
              variant="ghost"
              onPress={() => router.push('/apontamento')}
              disabled={ocupado}
            />}
            <ActionButton
              label={`Limpar enviados (${totalEnviadosGeral})`}
              variant="danger"
              onPress={limparEnviados}
              disabled={ocupado || totalEnviadosGeral === 0}
            />
          </View>
        ) : (
          pode('insumos') ? <ActionButton label="Ir para Insumos" onPress={() => router.push('/apontamento')} /> : null
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  back: { marginBottom: 12 },
  backText: { color: colors.leaf, fontWeight: '700' },
  intro: { color: colors.muted, fontWeight: '600', lineHeight: 18, marginBottom: 16 },
  resumo: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.creamDark,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  resumoTexto: { color: colors.forest, fontWeight: '800' },
  loader: { marginBottom: 16 },
  erro: { color: colors.danger, fontWeight: '700', marginBottom: 12 },
  vazio: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  vazioTitulo: { color: colors.forest, fontWeight: '800', marginBottom: 6 },
  vazioTexto: { color: colors.muted, fontWeight: '600', lineHeight: 18 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  cardKicker: { color: colors.gold, fontWeight: '800', fontSize: 11, letterSpacing: 0.4 },
  cardKickerEnviado: { color: colors.success },
  cardKickerErro: { color: colors.danger },
  cardTitulo: { color: colors.forest, fontWeight: '800', fontSize: 16 },
  cardLinha: { color: colors.ink, fontWeight: '600' },
  cardSub: { color: colors.muted, fontWeight: '600', fontSize: 12, marginBottom: 8 },
  cardErro: { color: colors.danger, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  cardAcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  acoes: { gap: 10, marginTop: 8 },
});
