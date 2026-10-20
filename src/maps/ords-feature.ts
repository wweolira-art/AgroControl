import type { GeoJsonProperties, TalhaoFeature } from '../types/geo';

import { parseOrdsGeometry } from './ords-geometry';

export interface MapaTalhaoRow {
  id_talhao?: number;
  id_externo?: number | null;
  cod_fazenda?: number | null;
  fazenda?: string | null;
  lote?: number | null;
  campo?: string | null;
  produtor?: string | null;
  sec_id?: string | null;
  geometria?: unknown;
  geojson?: string | null;
  data_cadastro?: string | null;
}

function trimText(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

export function rowToTalhaoFeature(row: MapaTalhaoRow): TalhaoFeature | null {
  const geometry = parseOrdsGeometry(row.geojson) ?? parseOrdsGeometry(row.geometria);
  if (!geometry) {
    return null;
  }

  const idExterno = row.id_externo ?? row.id_talhao;
  const properties: GeoJsonProperties = {
    id: idExterno ?? undefined,
    id_talhao: row.id_talhao,
    Fazenda: trimText(row.fazenda) || undefined,
    Lote: row.lote ?? undefined,
    Cod_fazend: row.cod_fazenda ?? undefined,
    Campo: trimText(row.campo) || undefined,
    Produtor: trimText(row.produtor) || undefined,
    sec_Id: trimText(row.sec_id) || undefined,
  };

  return {
    type: 'Feature',
    geometry,
    properties,
  };
}
