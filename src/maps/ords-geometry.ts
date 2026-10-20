import type { Geometry, Position } from '../types/geo';

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && asNumber(value[0]) != null && asNumber(value[1]) != null;
}

function isRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 3 && value.every(isPosition);
}

function isPolygonCoords(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function isMultiPolygonCoords(value: unknown): value is Position[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(isPolygonCoords);
}

function fromGeoJsonObject(value: unknown): Geometry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as { type?: unknown; coordinates?: unknown; geometry?: unknown };
  if (obj.type === 'Feature') {
    return fromGeoJsonObject(obj.geometry);
  }
  if (obj.type === 'Polygon' && isPolygonCoords(obj.coordinates)) {
    return { type: 'Polygon', coordinates: obj.coordinates };
  }
  if (obj.type === 'MultiPolygon' && isMultiPolygonCoords(obj.coordinates)) {
    return { type: 'MultiPolygon', coordinates: obj.coordinates };
  }
  return null;
}

function ordinatesToRing(ordinates: number[]): Position[] {
  const ring: Position[] = [];
  for (let i = 0; i + 1 < ordinates.length; i += 2) {
    const lng = ordinates[i];
    const lat = ordinates[i + 1];
    if (lng == null || lat == null) {
      continue;
    }
    ring.push([lng, lat]);
  }
  if (ring.length >= 3) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([first[0], first[1]]);
    }
  }
  return ring;
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length < 3) {
    return ring;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    return [...ring, [first[0], first[1]]];
  }
  return ring;
}

function datapointsToRing(value: unknown): Position[] | null {
  if (!Array.isArray(value) || value.length < 3 || !value.every(isPosition)) {
    return null;
  }
  const ring = closeRing(value.map((point) => [Number(point[0]), Number(point[1])]));
  return ring.length >= 4 ? ring : null;
}

function ringsFromBoundary(boundary: unknown): Position[][] | null {
  if (!Array.isArray(boundary) || boundary.length === 0) {
    return null;
  }
  const rings: Position[][] = [];
  for (const part of boundary) {
    if (!part || typeof part !== 'object') {
      return null;
    }
    const line = (part as { line?: { datapoints?: unknown } }).line;
    const ring = datapointsToRing(line?.datapoints);
    if (!ring) {
      return null;
    }
    rings.push(ring);
  }
  return rings;
}

function fromOrdsSpatial(value: unknown): Geometry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as {
    polygon?: { boundary?: unknown };
    multipolygon?: { polygons?: Array<{ boundary?: unknown }> };
  };
  if (obj.polygon?.boundary) {
    const rings = ringsFromBoundary(obj.polygon.boundary);
    if (rings) {
      return { type: 'Polygon', coordinates: rings };
    }
  }
  if (Array.isArray(obj.multipolygon?.polygons)) {
    const polygons: Position[][][] = [];
    for (const polygon of obj.multipolygon.polygons) {
      const rings = ringsFromBoundary(polygon?.boundary);
      if (!rings) {
        return null;
      }
      polygons.push(rings);
    }
    if (polygons.length > 0) {
      return { type: 'MultiPolygon', coordinates: polygons };
    }
  }
  return null;
}

function fromSdoObject(value: unknown): Geometry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as {
    sdo_gtype?: unknown;
    SDO_GTYPE?: unknown;
    sdo_ordinates?: unknown;
    SDO_ORDINATES?: unknown;
  };
  const gtype = asNumber(obj.sdo_gtype ?? obj.SDO_GTYPE);
  const ordinatesRaw = obj.sdo_ordinates ?? obj.SDO_ORDINATES;
  if (gtype == null || !Array.isArray(ordinatesRaw)) {
    return null;
  }
  const ordinates = ordinatesRaw.map(asNumber).filter((n): n is number => n != null);
  const ring = ordinatesToRing(ordinates);
  if (ring.length < 4) {
    return null;
  }
  const tipo = gtype % 100;
  if (tipo === 7) {
    return { type: 'MultiPolygon', coordinates: [[ring]] };
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function parseWktRing(text: string): Position[] | null {
  const pairs = [...text.matchAll(/(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)];
  const ring: Position[] = pairs.map((match) => [Number(match[1]), Number(match[2])]);
  return ring.length >= 4 ? ring : null;
}

function innermostRings(wkt: string): Position[][] {
  const rings: Position[][] = [];
  const re = /\(([^()]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(wkt))) {
    const ring = parseWktRing(match[1] ?? '');
    if (ring) {
      rings.push(ring);
    }
  }
  return rings;
}

function fromWkt(wkt: string): Geometry | null {
  const semSrid = wkt.replace(/^SRID\s*=\s*\d+\s*;/i, '').trim();
  const rings = innermostRings(semSrid);
  if (rings.length === 0) {
    return null;
  }
  if (/^MULTIPOLYGON\b/i.test(semSrid)) {
    return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
  }
  if (/^POLYGON\b/i.test(semSrid)) {
    return { type: 'Polygon', coordinates: rings };
  }
  return null;
}

function fromSdoConstructor(text: string): Geometry | null {
  const match = text.match(/SDO_ORDINATE_ARRAY\s*\(([\s\S]+)\)\s*\)\s*$/i);
  if (!match?.[1]) {
    return null;
  }
  const ordinates = match[1]
    .split(',')
    .map((part) => asNumber(part.trim()))
    .filter((n): n is number => n != null);
  const ring = ordinatesToRing(ordinates);
  if (ring.length < 4) {
    return null;
  }
  return { type: 'Polygon', coordinates: [ring] };
}

export function parseOrdsGeometry(value: unknown): Geometry | null {
  if (value == null) {
    return null;
  }
  const geojson = fromGeoJsonObject(value);
  if (geojson) {
    return geojson;
  }
  const ordsSpatial = fromOrdsSpatial(value);
  if (ordsSpatial) {
    return ordsSpatial;
  }
  const sdo = fromSdoObject(value);
  if (sdo) {
    return sdo;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return parseOrdsGeometry(JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
  return fromWkt(text) ?? fromSdoConstructor(text);
}

export function geometryToGeoJson(geometry: Geometry): { type: Geometry['type']; coordinates: Geometry['coordinates'] } {
  return { type: geometry.type, coordinates: geometry.coordinates };
}
