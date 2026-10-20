import { Platform } from 'react-native';
import * as Location from 'expo-location';

import type { Coordenada } from '../types/geo';

export type LocationPermissionStatus = 'undetermined' | 'granted' | 'denied';

function toCoordenada(position: Location.LocationObject): Coordenada {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('gps-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }
  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }
  return 'undetermined';
}

export async function ensureLocationServices(): Promise<boolean> {
  if (await Location.hasServicesEnabledAsync()) {
    return true;
  }
  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      return Location.hasServicesEnabledAsync();
    } catch {
      return false;
    }
  }
  return false;
}

export async function getCurrentCoordinate(): Promise<Coordenada | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return toCoordenada(last);
    }
  } catch {
    // segue para a leitura atual
  }

  const position = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      mayShowUserSettingsDialog: true,
    }),
    12_000,
  );
  return toCoordenada(position);
}

export function watchUserLocation(
  onUpdate: (coordenada: Coordenada) => void,
): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 4000,
      distanceInterval: 12,
      mayShowUserSettingsDialog: true,
    },
    (position) => {
      onUpdate(toCoordenada(position));
    },
  );
}
