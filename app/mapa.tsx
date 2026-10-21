import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '../src/components/Header';
import { LocationPanel } from '../src/components/LocationPanel';
import { useAuth } from '../src/auth/AuthProvider';
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';
import { useTalhaoDetection } from '../src/hooks/useTalhaoDetection';
import { useUserLocation } from '../src/hooks/useUserLocation';
import { GeoJsonMap } from '../src/maps/GeoJsonMap';
import { iniciarDesenho } from '../src/maps/desenho-sessao';
import type { MapCameraHandle } from '../src/maps/map-types';
import { carregarMapa, getMapCollection } from '../src/maps/registry';
import { geometryToGeoJson } from '../src/maps/ords-geometry';
import { findTalhaoAtPoint, getCollectionBounds } from '../src/maps/spatial';
import { colors } from '../src/theme/colors';
import type { Coordenada, FeatureCollection, MapRegion, TalhaoInfo } from '../src/types/geo';

const EMPTY_MAP: FeatureCollection = { type: 'FeatureCollection', features: [] };
const REGIAO_INICIAL: MapRegion = { latitude: -9.85, longitude: -36.05, latitudeDelta: 0.12, longitudeDelta: 0.18 };

export default function MapaScreen() {
  const router = useRouter();
  const { usuario, pronto, isAdmin, sair } = useAuth();
  const { pode } = useDeviceAccess();
  const mapRef = useRef<MapCameraHandle>(null);
  const [collection, setCollection] = useState<FeatureCollection>(EMPTY_MAP);
  const [carregandoMapa, setCarregandoMapa] = useState(true);
  const [erroMapa, setErroMapa] = useState<string | null>(null);
  const bounds = useMemo(() => getCollectionBounds(collection), [collection]);

  const buscarMapa = useCallback((force = false) => {
    const cached = getMapCollection();
    if (!force && cached.features.length > 0) {
      setCollection(cached);
      setCarregandoMapa(false);
      setErroMapa(null);
      return;
    }
    setCarregandoMapa(true);
    setErroMapa(null);
    void carregarMapa(force)
      .then((mapa) => {
        setCollection(mapa);
        if (mapa.features.length === 0) {
          setErroMapa('Nenhum talhão na API mapa_talhao. Importe os polígonos na tabela e tente de novo.');
        }
      })
      .catch((erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : 'Não foi possível carregar o mapa.';
        setErroMapa(mensagem);
      })
      .finally(() => {
        setCarregandoMapa(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      buscarMapa(false);
    }, [buscarMapa]),
  );

  const { coordenada, loading, error, permission } = useUserLocation();
  const [imagery, setImagery] = useState<'satellite' | 'street'>('satellite');
  const [pontoConsulta, setPontoConsulta] = useState<Coordenada | null>(null);
  const [origemConsulta, setOrigemConsulta] = useState<'gps' | 'mapa'>('gps');

  const consulta = origemConsulta === 'mapa' ? pontoConsulta : coordenada;
  const mapaPronto = collection.features.length > 0;
  const { resultado, detecting } = useTalhaoDetection(mapaPronto ? consulta : null);

  const selectedTalhao: TalhaoInfo | null = useMemo(() => {
    if (!resultado?.encontrado || !consulta) {
      return null;
    }
    return findTalhaoAtPoint(collection, consulta.latitude, consulta.longitude);
  }, [collection, consulta, resultado?.encontrado]);

  const centralizarUsuario = () => {
    if (!coordenada) {
      return;
    }
    setOrigemConsulta('gps');
    setPontoConsulta(null);
    mapRef.current?.animateToRegion(
      {
        latitude: coordenada.latitude,
        longitude: coordenada.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      400,
    );
  };

  const verTalhoes = () => {
    mapRef.current?.animateToRegion(bounds, 500);
  };

  const abrirApontamento = () => {
    if (!resultado?.encontrado || !resultado.fazenda || !resultado.talhao) {
      return;
    }
    router.push({
      pathname: '/apontamento',
      params: {
        nomeFazenda: resultado.fazenda.nome,
        codigoFazenda: String(resultado.fazenda.codigo),
        talhao: String(resultado.talhao.codigo),
      },
    });
  };

  const abrirDesenho = () => {
    if (selectedTalhao) {
      const props = selectedTalhao.feature.properties ?? {};
      const idTalhao = Number(props.id_talhao);
      iniciarDesenho({
        modo: Number.isFinite(idTalhao) && idTalhao > 0 ? 'editar' : 'novo',
        idTalhao: Number.isFinite(idTalhao) && idTalhao > 0 ? idTalhao : undefined,
        idExterno: Number.isFinite(Number(props.id)) ? Number(props.id) : null,
        fazenda: selectedTalhao.nomeFazenda,
        codFazenda: selectedTalhao.codigoFazenda,
        lote: selectedTalhao.codigoTalhao,
        campo: selectedTalhao.campo ?? '',
        produtor: selectedTalhao.produtor ?? '',
        secId: selectedTalhao.secId ?? '',
        geojson: JSON.stringify(geometryToGeoJson(selectedTalhao.feature.geometry)),
        dataCadastro: null,
      });
    } else {
      iniciarDesenho({
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
      });
    }
    router.push('/desenhar-talhao');
  };

  useEffect(() => {
    if (pronto && !usuario) {
      router.replace('/login');
    }
  }, [pronto, router, usuario]);

  if (!pronto || !usuario) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingAuth}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header
        subtitle={isAdmin ? `Admin · ${usuario.nome}` : usuario.nome}
        right={
          <View style={styles.headerAcoes}>
            <Pressable onPress={() => router.replace('/')}>
              <Text style={styles.sair}>Início</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void sair().then(() => router.replace('/login'));
              }}
            >
              <Text style={styles.sair}>Sair</Text>
            </Pressable>
          </View>
        }
      />
      <View style={styles.mapWrap}>
        <GeoJsonMap
          ref={mapRef}
          collection={collection}
          initialRegion={REGIAO_INICIAL}
          selected={selectedTalhao}
          imagery={imagery}
          userCoordinate={coordenada}
          onLongPress={(latitude, longitude) => {
            setPontoConsulta({ latitude, longitude });
            setOrigemConsulta('mapa');
          }}
        />

        <View style={styles.fabs}>
          <Pressable
            style={styles.fab}
            onPress={() => setImagery((atual) => (atual === 'satellite' ? 'street' : 'satellite'))}
          >
            <Text style={styles.fabLabel}>{imagery === 'satellite' ? 'Mapa' : 'Satélite'}</Text>
          </Pressable>
          <Pressable style={styles.fab} onPress={verTalhoes}>
            <Text style={styles.fabLabel}>Ver talhões</Text>
          </Pressable>
          {isAdmin && pode('talhoes-admin') ? (
            <Pressable style={styles.fab} onPress={() => router.push('/mapa-admin')}>
              <Text style={styles.fabLabel}>Talhões</Text>
            </Pressable>
          ) : null}
          {isAdmin && pode('talhoes-admin') && selectedTalhao ? (
            <Pressable style={styles.fab} onPress={abrirDesenho}>
              <Text style={styles.fabLabel}>Desenhar</Text>
            </Pressable>
          ) : null}
        </View>

        {carregandoMapa ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Carregando talhões da API…</Text>
          </View>
        ) : null}

        {erroMapa ? (
          <Pressable style={[styles.banner, styles.bannerError]} onPress={() => buscarMapa(true)}>
            <Text style={styles.bannerText}>{erroMapa}</Text>
            <Text style={styles.bannerHint}>Toque para tentar de novo</Text>
          </Pressable>
        ) : null}

        {!carregandoMapa && !erroMapa && loading ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Obtendo localização GPS…</Text>
          </View>
        ) : null}

        {permission === 'denied' || (error && !erroMapa) ? (
          <View style={[styles.banner, styles.bannerError]}>
            <Text style={styles.bannerText}>{error ?? 'Permissão de localização necessária.'}</Text>
          </View>
        ) : null}
      </View>

      <LocationPanel
        resultado={resultado}
        detecting={detecting}
        origemConsulta={origemConsulta}
        isAdmin={isAdmin}
        onMinhaLocalizacao={centralizarUsuario}
        onApontamento={pode('insumos') ? abrirApontamento : undefined}
        onDesenhar={abrirDesenho}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  mapWrap: {
    flex: 1,
    backgroundColor: '#d7e0d4',
  },
  loadingAuth: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sair: {
    color: colors.gold,
    fontWeight: '800',
    marginTop: 6,
  },
  headerAcoes: {
    alignItems: 'flex-end',
    gap: 8,
  },
  fabs: {
    position: 'absolute',
    right: 12,
    top: 12,
    gap: 8,
    maxWidth: '46%',
  },
  fab: {
    backgroundColor: colors.forest,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  fabLabel: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 12,
  },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    padding: 10,
  },
  bannerError: {
    backgroundColor: 'rgba(198, 40, 40, 0.92)',
  },
  bannerText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  bannerHint: {
    color: colors.cream,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
  },
});
