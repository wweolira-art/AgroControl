import type { GeoJsonProperties, TalhaoFeature, TalhaoInfo } from '../types/geo';

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

/**
 * Normaliza propriedades de GeoJSON de origens diferentes.
 * Novos arquivos podem usar nomes de campo distintos — acrescente o mapeamento aqui.
 */
export function normalizeFeature(feature: TalhaoFeature): TalhaoInfo {
  const p: GeoJsonProperties = feature.properties ?? {};

  const nomeFazenda = asString(
    p.Fazenda ?? p.nome_fazenda ?? p.NOME_FAZENDA ?? p.nomeFazenda,
    'Desconhecida',
  );
  const codigoFazenda = asNumber(p.Cod_fazend ?? p.codigo_fazenda ?? p.CD_FAZENDA ?? p.codigoFazenda);
  const codigoTalhao = asNumber(p.Lote ?? p.talhao ?? p.codigo_talhao ?? p.TALHAO ?? p.codigoTalhao);
  const campo = asString(p.Campo ?? p.campo, '') || undefined;
  const produtor = asString(p.Produtor ?? p.produtor, '') || undefined;
  const secId = asString(p.sec_Id ?? p.secId, '') || undefined;
  const id = asString(p.id ?? secId ?? `${codigoFazenda}_${codigoTalhao}`);

  return {
    id,
    nomeFazenda,
    codigoFazenda,
    codigoTalhao,
    campo,
    produtor,
    secId,
    propriedades: p,
    feature,
  };
}
