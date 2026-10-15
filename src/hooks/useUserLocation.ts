import { useCallback, useEffect, useRef, useState } from 'react';

import type { Coordenada } from '../types/geo';
import {
  ensureLocationServices,
  getCurrentCoordinate,
  requestLocationPermission,
  watchUserLocation,
  type LocationPermissionStatus,
} from '../services/location';

interface UseUserLocationResult {
  coordenada: Coordenada | null;
  permission: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUserLocation(): UseUserLocationResult {
  const [coordenada, setCoordenada] = useState<Coordenada | null>(null);
  const [permission, setPermission] = useState<LocationPermissionStatus>('undetermined');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const ligado = await ensureLocationServices();
      if (!ligado) {
        setError('Ative o GPS do celular para identificar o talhão.');
        return;
      }
      const current = await getCurrentCoordinate();
      if (current) {
        setCoordenada(current);
        setError(null);
      }
    } catch {
      setError('Não foi possível obter a localização GPS.');
    }
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    let subscription: { remove: () => void } | undefined;

    (async () => {
      const status = await requestLocationPermission();
      setPermission(status);

      if (status !== 'granted') {
        setLoading(false);
        setError('Permissão de localização negada. Ative o GPS para identificar o talhão.');
        return;
      }

      const ligado = await ensureLocationServices();
      if (!ligado) {
        setLoading(false);
        setError('Ative o GPS do celular para identificar o talhão.');
        return;
      }

      try {
        const current = await getCurrentCoordinate();
        if (current) {
          setCoordenada(current);
          setError(null);
        }
      } catch {
        setError('Não foi possível obter a localização. Ative o GPS e tente de novo.');
      } finally {
        setLoading(false);
      }

      try {
        subscription = await watchUserLocation((atual) => {
          setCoordenada(atual);
          setError(null);
        });
      } catch {
        // Mantém o último ponto se o acompanhamento contínuo falhar.
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  return { coordenada, permission, loading, error, refresh };
}
