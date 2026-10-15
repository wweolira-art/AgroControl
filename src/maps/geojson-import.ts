import type { FeatureCollection, TalhaoFeature } from '../types/geo';

import { normalizeFeature } from './normalize';
import { parseOrdsGeometry, geometryToGeoJson } from './ords-geometry';

export interface MapaTalhaoPayload {
  id_externo: number | null;
  cod_fazenda: number;
  fazenda: string;
  lote: number;
  campo: string;
  produtor: string;
  sec_id: string;
  geojson: string;
}

function asFeature(value: unknown): TalhaoFeature | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as { type?: unknown; geometry?: unknown; properties?: unknown; coordinates?: unknown };
  if (obj.type === 'Feature') {
    const geometry = parseOrdsGeometry(obj.geometry);
    if (!geometry) {
      return null;
    }
    const properties =
      obj.properties && typeof obj.properties === 'object' ? (obj.properties as TalhaoFeature['properties']) : {};
    return { type: 'Feature', geometry, properties };
  }
  const geometry = parseOrdsGeometry(value);
  if (!geometry) {
    return null;
  }
  return { type: 'Feature', geometry, properties: {} };
}

export function parseGeoJsonArquivo(texto: string): TalhaoFeature[] {
  const parsed = JSON.parse(texto.replace(/^\uFEFF/, '')) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('O arquivo não é um GeoJSON válido.');
  }
  const obj = parsed as { type?: unknown; features?: unknown[] };
  if (obj.type === 'FeatureCollection') {
    return (obj.features ?? []).map(asFeature).filter((item): item is TalhaoFeature => item != null);
  }
  const unico = asFeature(parsed);
  if (!unico) {
    throw new Error('O GeoJSON precisa ser Feature ou FeatureCollection com polígonos.');
  }
  return [unico];
}

export function featureToPayload(feature: TalhaoFeature): MapaTalhaoPayload {
  const info = normalizeFeature(feature);
  if (!info.codigoFazenda || !info.codigoTalhao) {
    throw new Error('Cada talhão precisa de Cod_fazend e Lote no GeoJSON.');
  }
  const idExterno = Number(info.propriedades.id);
  return {
    id_externo: Number.isFinite(idExterno) ? idExterno : null,
    cod_fazenda: info.codigoFazenda,
    fazenda: info.nomeFazenda,
    lote: info.codigoTalhao,
    campo: info.campo ?? '',
    produtor: info.produtor ?? '',
    sec_id: info.secId ?? `${info.codigoFazenda}_${info.codigoTalhao}`,
    geojson: JSON.stringify(geometryToGeoJson(feature.geometry)),
  };
}

export function collectionToPayloads(collection: FeatureCollection | TalhaoFeature[]): MapaTalhaoPayload[] {
  const features = Array.isArray(collection) ? collection : collection.features;
  const payloads: MapaTalhaoPayload[] = [];
  for (const feature of features) {
    try {
      payloads.push(featureToPayload(feature));
    } catch {
      // Feature sem Cod_fazend/Lote ou geometria inválida.
    }
  }
  return payloads;
}
