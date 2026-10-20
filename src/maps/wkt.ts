import type { Geometry } from '../types/geo';

type Position = [number, number];

function ringParaWkt(ring: Position[]): string {
  const fechado =
    ring.length > 0 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const coords = fechado ? ring : [...ring, ring[0]];
  return coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
}

function poligonoParaWkt(rings: Position[][]): string {
  const partes = rings.map((ring) => `(${ringParaWkt(ring)})`);
  return `POLYGON(${partes.join(', ')})`;
}

export function geometryToWkt(geometry: Geometry, srid = 0): string {
  let wkt: string;
  if (geometry.type === 'Polygon') {
    wkt = poligonoParaWkt(geometry.coordinates);
  } else {
    const poligonos = geometry.coordinates.map((poly) => `(${poligonoParaWkt(poly)})`);
    wkt = `MULTIPOLYGON(${poligonos.join(', ')})`;
  }
  return srid > 0 ? `SRID=${srid};${wkt}` : wkt;
}

export function inicioDiaUnix(segundosDeslocamento = 0): number {
  const agora = new Date();
  agora.setHours(0, 0, 0, 0);
  return Math.floor(agora.getTime() / 1000) + segundosDeslocamento;
}
