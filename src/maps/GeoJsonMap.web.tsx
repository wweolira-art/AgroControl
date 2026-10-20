import { forwardRef, useImperativeHandle } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import type { GeoJsonMapProps, MapCameraHandle } from './map-types';

export type { MapCameraHandle, GeoJsonMapProps } from './map-types';

export const GeoJsonMap = forwardRef<MapCameraHandle, GeoJsonMapProps>(function GeoJsonMap(
  { initialRegion, onLongPress },
  ref,
) {
  useImperativeHandle(ref, () => ({
    animateToRegion() {
      // O mapa nativo não existe no navegador.
    },
    undoDraft() {},
    clearDraft() {},
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Elejotaagro</Text>
      <Text style={styles.text}>
        O mapa GPS funciona no celular (Expo Go / Android), não no navegador.
      </Text>
      <Text style={styles.coords}>
        Centro do mapa: {initialRegion.latitude.toFixed(5)}, {initialRegion.longitude.toFixed(5)}
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => onLongPress?.(initialRegion.latitude, initialRegion.longitude)}
      >
        <Text style={styles.buttonText}>Testar identificação neste ponto</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.forestMid,
    gap: 12,
  },
  title: {
    color: colors.cream,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  text: {
    color: colors.accent,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  coords: {
    color: colors.cream,
    fontSize: 12,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.leaf,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
  },
});
