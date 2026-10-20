import type { Coordenada } from '../types/geo';

import { parseOrdsGeometry } from './ords-geometry';

export type DesenhoModo = 'editar' | 'novo';

export interface DesenhoSessao {
  modo: DesenhoModo;
  idTalhao?: number;
  idExterno: number | null;
  fazenda: string;
  codFazenda: number;
  lote: number;
  campo: string;
  produtor: string;
  secId: string;
  geojson: string | null;
  dataCadastro: string | null;
}

let sessao: DesenhoSessao | null = null;

export function iniciarDesenho(proxima: DesenhoSessao) {
  sessao = proxima;
}

export function obterDesenho(): DesenhoSessao | null {
  return sessao;
}

export function limparDesenho() {
  sessao = null;
}

export function verticesParaGeojson(vertices: Coordenada[]): string {
  if (vertices.length < 3) {
    throw new Error('O polígono precisa de pelo menos 3 pontos.');
  }
  const ring = vertices.map((ponto) => [ponto.longitude, ponto.latitude]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] });
}

export function geojsonParaVertices(geojson: string | null): Coordenada[] {
  if (!geojson) {
    return [];
  }
  const geometry = parseOrdsGeometry(geojson);
  if (!geometry) {
    return [];
  }
  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;
  if (!ring || ring.length < 3) {
    return [];
  }
  const pontos = ring
    .map((pos) => ({ longitude: Number(pos[0]), latitude: Number(pos[1]) }))
    .filter((ponto) => Number.isFinite(ponto.latitude) && Number.isFinite(ponto.longitude));
  const first = pontos[0];
  const last = pontos[pontos.length - 1];
  if (
    pontos.length >= 2 &&
    first &&
    last &&
    first.latitude === last.latitude &&
    first.longitude === last.longitude
  ) {
    pontos.pop();
  }
  return pontos;
}
