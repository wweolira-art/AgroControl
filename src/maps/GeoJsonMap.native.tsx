import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors } from '../theme/colors';
import { featureToMapCoordinates, simplifyCoordinates } from './spatial';
import { buildMapHtml, jsFlyTo, jsHighlight, jsSetDraft, jsSetDrawMode, jsSetImagery, jsSetPolygons, jsSetUser, jsUndoDraft, jsClearDraft } from './leaflet-html';
import type { GeoJsonMapProps, MapCameraHandle } from './map-types';
import type { FeatureCollection, MapRegion, TalhaoFeature } from '../types/geo';

export type { MapCameraHandle, GeoJsonMapProps } from './map-types';

function toLightCollection(collection: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature, index) => {
      const ring = simplifyCoordinates(featureToMapCoordinates(feature), 16).map((point) => [
        point.longitude,
        point.latitude,
      ]);
      return {
        type: 'Feature',
        properties: {
          id: feature.properties?.id ?? index,
          sec_Id: feature.properties?.sec_Id,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      } as TalhaoFeature;
    }),
  };
}

export const GeoJsonMap = forwardRef<MapCameraHandle, GeoJsonMapProps>(function GeoJsonMap(
  {
    collection,
    initialRegion,
    selected,
    onLongPress,
    onRegionChange,
    imagery = 'satellite',
    userCoordinate,
    drawMode = false,
    initialDraft,
    onDraftChange,
  },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const ready = useRef(false);
  const lightCollection = useMemo(() => toLightCollection(collection), [collection]);
  const lightRef = useRef(lightCollection);
  lightRef.current = lightCollection;
  const userRef = useRef(userCoordinate);
  userRef.current = userCoordinate;
  const html = useMemo(() => buildMapHtml(initialRegion), []);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion(region) {
      webRef.current?.injectJavaScript(
        jsFlyTo(region.latitude, region.longitude, region.longitudeDelta, region.latitudeDelta),
      );
    },
    undoDraft() {
      webRef.current?.injectJavaScript(jsUndoDraft());
    },
    clearDraft() {
      webRef.current?.injectJavaScript(jsClearDraft());
    },
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready.current) {
        setAviso('O mapa precisa de internet na primeira abertura. Verifique o Wi-Fi e tente de novo.');
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready.current || lightCollection.features.length === 0) {
      return;
    }
    webRef.current?.injectJavaScript(jsSetPolygons(lightCollection));
  }, [lightCollection]);

  useEffect(() => {
    if (!ready.current || !userCoordinate) {
      return;
    }
    webRef.current?.injectJavaScript(jsSetUser(userCoordinate.latitude, userCoordinate.longitude));
  }, [userCoordinate?.latitude, userCoordinate?.longitude]);

  useEffect(() => {
    if (!ready.current) {
      return;
    }
    webRef.current?.injectJavaScript(jsSetImagery(imagery));
  }, [imagery]);

  useEffect(() => {
    if (!ready.current) {
      return;
    }
    if (!selected) {
      webRef.current?.injectJavaScript(jsHighlight(null));
      return;
    }
    const ring = simplifyCoordinates(featureToMapCoordinates(selected.feature), 20).map((point) => [
      point.longitude,
      point.latitude,
    ]);
    webRef.current?.injectJavaScript(
      jsHighlight({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      }),
    );
  }, [selected]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        latitude?: number;
        longitude?: number;
        latitudeDelta?: number;
        longitudeDelta?: number;
        points?: Array<{ latitude?: number; longitude?: number }>;
      };
      if (data.type === 'ready') {
        ready.current = true;
        setMapaPronto(true);
        setAviso(null);
        if (drawMode) {
          webRef.current?.injectJavaScript(jsSetDrawMode(true));
        }
        const atual = lightRef.current;
        if (atual.features.length > 0) {
          webRef.current?.injectJavaScript(jsSetPolygons(atual));
        }
        if (initialDraft && initialDraft.length > 0) {
          webRef.current?.injectJavaScript(jsSetDraft(initialDraft));
        }
        if (userRef.current) {
          webRef.current?.injectJavaScript(jsSetUser(userRef.current.latitude, userRef.current.longitude));
        }
        return;
      }
      if (data.type === 'draft' && Array.isArray(data.points)) {
        onDraftChange?.(
          data.points.filter(
            (point): point is { latitude: number; longitude: number } =>
              Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
          ),
        );
        return;
      }
      if (data.type === 'region' && data.latitude != null && data.longitude != null) {
        const region: MapRegion = {
          latitude: data.latitude,
          longitude: data.longitude,
          latitudeDelta: data.latitudeDelta ?? 0.02,
          longitudeDelta: data.longitudeDelta ?? 0.02,
        };
        onRegionChange?.(region);
        return;
      }
      if (data.type === 'press' && data.latitude !== undefined && data.longitude !== undefined) {
        if (drawMode) {
          return;
        }
        onLongPress?.(data.latitude, data.longitude);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        style={styles.web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        nestedScrollEnabled
        onMessage={onMessage}
        onError={() => {
          setAviso('Não foi possível carregar o mapa. Confira a internet do celular e abra de novo.');
        }}
      />
      {!mapaPronto ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>{aviso ?? 'Carregando mapa…'}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.forestMid,
  },
  web: {
    flex: 1,
    backgroundColor: '#cfd8dc',
    opacity: 0.99,
  },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forestMid,
    paddingHorizontal: 28,
    gap: 14,
  },
  loadingText: {
    color: colors.cream,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
