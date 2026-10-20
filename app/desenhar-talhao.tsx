import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { ActionButton } from '../src/components/ActionButton';
import { Header } from '../src/components/Header';
import {
  geojsonParaVertices,
  limparDesenho,
  obterDesenho,
  verticesParaGeojson,
  type DesenhoSessao,
} from '../src/maps/desenho-sessao';
import { GeoJsonMap } from '../src/maps/GeoJsonMap';
import type { MapCameraHandle } from '../src/maps/map-types';
import { carregarMapa, getMapCollection, limparCacheMapa } from '../src/maps/registry';
import { featureAreaHectares, getCollectionBounds } from '../src/maps/spatial';
import { atualizarTalhao, criarTalhao } from '../src/services/mapa-talhao';
import { colors } from '../src/theme/colors';
import type { Coordenada, MapRegion, TalhaoFeature } from '../src/types/geo';

const REGIAO_PADRAO: MapRegion = {
  latitude: -9.85,
  longitude: -36.05,
  latitudeDelta: 0.12,
  longitudeDelta: 0.18,
};

function regionDosPontos(pontos: Coordenada[]): MapRegion | null {
  if (pontos.length === 0) {
    return null;
  }
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const ponto of pontos) {
    minLat = Math.min(minLat, ponto.latitude);
    maxLat = Math.max(maxLat, ponto.latitude);
    minLng = Math.min(minLng, ponto.longitude);
    maxLng = Math.max(maxLng, ponto.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.008, (maxLat - minLat) * 1.8 || 0.02),
    longitudeDelta: Math.max(0.008, (maxLng - minLng) * 1.8 || 0.02),
  };
}

export default function DesenharTalhaoScreen() {
  const router = useRouter();
  const { isAdmin, pronto } = useAuth();
  const mapRef = useRef<MapCameraHandle>(null);
  const sessaoInicial = useMemo(() => obterDesenho(), []);
  const [sessao, setSessao] = useState<DesenhoSessao | null>(sessaoInicial);
  const [vertices, setVertices] = useState<Coordenada[]>(() => geojsonParaVertices(sessaoInicial?.geojson ?? null));
  const [etapa, setEtapa] = useState<'desenhar' | 'dados'>('desenhar');
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [collection, setCollection] = useState(() => getMapCollection());
  const rascunhoInicial = useMemo(
    () => geojsonParaVertices(sessaoInicial?.geojson ?? null),
    [sessaoInicial],
  );

  const initialRegion = useMemo(() => {
    const doPoligono = regionDosPontos(rascunhoInicial);
    if (doPoligono) {
      return doPoligono;
    }
    return collection.features.length > 0 ? getCollectionBounds(collection) : REGIAO_PADRAO;
  }, [collection, rascunhoInicial]);

  useEffect(() => {
    if (pronto && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, pronto, router]);

  useEffect(() => {
    void carregarMapa(true).then(setCollection);
  }, []);

  const voltar = useCallback(() => {
    limparDesenho();
    router.back();
  }, [router]);

  const areaHa = useMemo(() => {
    if (vertices.length < 3) {
      return null;
    }
    try {
      const feature: TalhaoFeature = {
        type: 'Feature',
        geometry: JSON.parse(verticesParaGeojson(vertices)),
        properties: {},
      };
      return featureAreaHectares(feature);
    } catch {
      return null;
    }
  }, [vertices]);

  const gravar = async (dados: DesenhoSessao, geojson: string) => {
    setGravando(true);
    setErro(null);
    try {
      if (!dados.fazenda.trim() || !dados.codFazenda || !dados.lote) {
        throw new Error('Preencha fazenda, código da fazenda e talhão.');
      }
      const secId = dados.secId.trim() || `${dados.codFazenda}_${dados.lote}`;
      if (dados.modo === 'editar' && dados.idTalhao != null) {
        await atualizarTalhao(dados.idTalhao, {
          idExterno: dados.idExterno,
          codFazenda: dados.codFazenda,
          fazenda: dados.fazenda,
          lote: dados.lote,
          campo: dados.campo,
          produtor: dados.produtor,
          secId,
          geojson,
          dataCadastro: dados.dataCadastro,
        });
      } else {
        await criarTalhao({
          id_externo: dados.idExterno,
          cod_fazenda: dados.codFazenda,
          fazenda: dados.fazenda.trim(),
          lote: dados.lote,
          campo: dados.campo.trim(),
          produtor: dados.produtor.trim(),
          sec_id: secId,
          geojson,
        });
      }
      limparCacheMapa();
      await carregarMapa(true);
      limparDesenho();
      Alert.alert('Polígono gravado', 'O talhão foi atualizado na API mapa_talhao.', [
        { text: 'OK', onPress: () => router.replace('/mapa-admin') },
      ]);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar o polígono.');
    } finally {
      setGravando(false);
    }
  };

  const concluirDesenho = () => {
    if (!sessao) {
      return;
    }
    if (vertices.length < 3) {
      Alert.alert('Polígono incompleto', 'Toque no mapa para marcar pelo menos 3 pontos.');
      return;
    }
    let geojson: string;
    try {
      geojson = verticesParaGeojson(vertices);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Polígono inválido.');
      return;
    }
    if (sessao.modo === 'novo') {
      setEtapa('dados');
      return;
    }
    Alert.alert(
      'Gravar polígono',
      `Atualizar o talhão ${sessao.lote} de ${sessao.fazenda || 'esta fazenda'} com o desenho?`,
      [
        { text: 'Continuar desenhando', style: 'cancel' },
        { text: 'Gravar', onPress: () => void gravar(sessao, geojson) },
      ],
    );
  };

  const salvarNovo = () => {
    if (!sessao) {
      return;
    }
    try {
      void gravar(sessao, verticesParaGeojson(vertices));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Polígono inválido.');
    }
  };

  if (!isAdmin || !sessao) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header subtitle="Desenhar polígono" />
        <View style={styles.vazio}>
          <Text style={styles.meta}>Abra esta tela pelo cadastro de talhões.</Text>
          <ActionButton label="Voltar" variant="ghost" onPress={() => router.replace('/mapa-admin')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header subtitle={sessao.modo === 'novo' ? 'Novo talhão · desenhar' : `Desenhar · talhão ${sessao.lote}`} />
      {etapa === 'desenhar' ? (
        <>
          <View style={styles.mapWrap}>
            <GeoJsonMap
              ref={mapRef}
              collection={collection}
              initialRegion={initialRegion}
              imagery="satellite"
              drawMode
              initialDraft={rascunhoInicial}
              onDraftChange={setVertices}
            />
            <View style={styles.hint}>
              <Text style={styles.hintText}>
                Toque no mapa para marcar os vértices. {vertices.length} ponto{vertices.length === 1 ? '' : 's'}
                {areaHa != null ? ` · ${areaHa.toFixed(2)} ha` : ''}
              </Text>
            </View>
          </View>
          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          <View style={styles.barra}>
            <ActionButton
              label="Desfazer"
              variant="ghost"
              onPress={() => mapRef.current?.undoDraft?.()}
              disabled={vertices.length === 0 || gravando}
            />
            <ActionButton
              label="Limpar"
              variant="ghost"
              onPress={() => mapRef.current?.clearDraft?.()}
              disabled={vertices.length === 0 || gravando}
            />
          </View>
          <View style={styles.barra}>
            <ActionButton label="Cancelar" variant="ghost" onPress={voltar} disabled={gravando} />
            <ActionButton
              label="Concluir desenho"
              onPress={concluirDesenho}
              disabled={vertices.length < 3}
              loading={gravando}
            />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.meta}>
            Polígono com {vertices.length} pontos
            {areaHa != null ? ` · ${areaHa.toFixed(2)} ha` : ''}. Preencha os dados do talhão para gravar.
          </Text>
          <Text style={styles.label}>Fazenda</Text>
          <TextInput
            value={sessao.fazenda}
            onChangeText={(fazenda) => setSessao({ ...sessao, fazenda })}
            style={styles.input}
          />
          <Text style={styles.label}>Código da fazenda</Text>
          <TextInput
            value={sessao.codFazenda ? String(sessao.codFazenda) : ''}
            onChangeText={(valor) => setSessao({ ...sessao, codFazenda: Number(valor) || 0 })}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={styles.label}>Talhão</Text>
          <TextInput
            value={sessao.lote ? String(sessao.lote) : ''}
            onChangeText={(valor) => setSessao({ ...sessao, lote: Number(valor) || 0 })}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={styles.label}>Campo</Text>
          <TextInput
            value={sessao.campo}
            onChangeText={(campo) => setSessao({ ...sessao, campo })}
            style={styles.input}
          />
          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          <View style={styles.barra}>
            <ActionButton label="Voltar ao desenho" variant="ghost" onPress={() => setEtapa('desenhar')} />
            <ActionButton label="Gravar talhão" onPress={salvarNovo} loading={gravando} />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  mapWrap: {
    flex: 1,
    backgroundColor: '#d7e0d4',
  },
  hint: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    padding: 10,
  },
  hintText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '700',
  },
  barra: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  form: {
    padding: 20,
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
  },
  erro: {
    color: colors.danger,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  vazio: {
    padding: 24,
    gap: 16,
  },
});
