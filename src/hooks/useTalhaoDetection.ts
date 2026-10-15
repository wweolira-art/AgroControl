import { useEffect, useState } from 'react';

import { consultarLocalizacao } from '../services/api';
import type { Coordenada } from '../types/geo';
import type { LocalizacaoResponse } from '../types/api';

interface UseTalhaoDetectionResult {
  resultado: LocalizacaoResponse | null;
  detecting: boolean;
}

export function useTalhaoDetection(coordenada: Coordenada | null): UseTalhaoDetectionResult {
  const [resultado, setResultado] = useState<LocalizacaoResponse | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!coordenada) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setDetecting(true);
      try {
        const data = await consultarLocalizacao(coordenada.latitude, coordenada.longitude);
        if (!cancelled) {
          setResultado(data);
        }
      } finally {
        if (!cancelled) {
          setDetecting(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coordenada?.latitude, coordenada?.longitude]);

  return { resultado, detecting };
}
