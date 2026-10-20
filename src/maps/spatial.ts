import type { Coordenada, FeatureCollection, MapRegion, TalhaoFeature, TalhaoInfo } from '../types/geo';
import { normalizeFeature } from './normalize';

type Ring = number[][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) {
      continue;
    }
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(lng, lat, outer)) {
    return false;
  }
  for (const hole of holes) {
    if (pointInRing(lng, lat, hole)) {
      return false;
    }
  }
  return true;
}

function featureContainsPoint(feature: TalhaoFeature, lng: number, lat: number): boolean {
  const geometry = feature.geometry;
  if (!geometry) {
    return false;
  }
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lng, lat, geometry.coordinates as Ring[]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon as Ring[]));
  }
  return false;
}

function ringArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] ?? [];
    const [x2, y2] = ring[i + 1] ?? [];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      continue;
    }
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function featureArea(feature: TalhaoFeature): number {
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') {
    return ringArea(geometry.coordinates[0] as Ring);
  }
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, polygon) => sum + ringArea(polygon[0] as Ring), 0);
  }
  return Number.POSITIVE_INFINITY;
}

function geodesicRingAreaHa(ring: Ring): number {
  if (!ring || ring.length < 3) {
    return 0;
  }
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const lng1 = ring[i]?.[0];
    const lat1 = ring[i]?.[1];
    const lng2 = ring[i + 1]?.[0];
    const lat2 = ring[i + 1]?.[1];
    if (lng1 == null || lat1 == null || lng2 == null || lat2 == null) {
      continue;
    }
    area +=
      ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((area * R * R) / 2) / 10_000;
}

/** Área geodésica aproximada do polígono, em hectares. */
export function featureAreaHectares(feature: TalhaoFeature): number {
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') {
    return geodesicRingAreaHa(geometry.coordinates[0] as Ring);
  }
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, polygon) => sum + geodesicRingAreaHa(polygon[0] as Ring), 0);
  }
  return 0;
}

/**
 * Identifica o talhão que contém o ponto GPS.
 * Em caso de sobreposição, escolhe o polígono de menor área (mais específico).
 *
 * Esta rotina simula localmente o que o Oracle Spatial fará no backend:
 * SDO_CONTAINS / SDO_RELATE sobre agricola.talhao.
 */
export function findTalhaoAtPoint(collection: FeatureCollection, latitude: number, longitude: number): TalhaoInfo | null {
  const matches = collection.features.filter((feature) => featureContainsPoint(feature, longitude, latitude));
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => featureArea(a) - featureArea(b));
  const best = matches[0];
  return best ? normalizeFeature(best) : null;
}

export function getCollectionBounds(collection: FeatureCollection): MapRegion {
  if (collection.features.length === 0) {
    return { latitude: -9.85, longitude: -36.05, latitudeDelta: 0.12, longitudeDelta: 0.18 };
  }

  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;

  const visit = (pos: number[]) => {
    const lng = pos[0];
    const lat = pos[1];
    if (lng === undefined || lat === undefined) {
      return;
    }
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  };

  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (geometry?.type === 'Polygon') {
      geometry.coordinates.flat().forEach(visit);
    } else if (geometry?.type === 'MultiPolygon') {
      geometry.coordinates.flat(2).forEach(visit);
    }
  }

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max(0.02, (maxLat - minLat) * 1.2);
  const longitudeDelta = Math.max(0.02, (maxLng - minLng) * 1.2);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export function featureToMapCoordinates(feature: TalhaoFeature): Coordenada[] {
  const geometry = feature.geometry;
  const ring =
    geometry?.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;

  if (!ring) {
    return [];
  }

  return ring
    .map((pos) => {
      const lng = pos[0];
      const lat = pos[1];
      if (lng === undefined || lat === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return { latitude: lat, longitude: lng };
    })
    .filter((item): item is Coordenada => item !== null);
}

export function simplifyCoordinates(coords: Coordenada[], maxPoints = 48): Coordenada[] {
  if (coords.length <= maxPoints) {
    return coords;
  }
  const step = Math.ceil(coords.length / maxPoints);
  const simplified = coords.filter((_, index) => index % step === 0);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first.latitude !== last.latitude || first.longitude !== last.longitude)) {
    simplified.push(first);
  }
  return simplified;
}

const bboxCache = new WeakMap<TalhaoFeature, [number, number, number, number]>();

export function featureBBox(feature: TalhaoFeature): [number, number, number, number] | null {
  const cached = bboxCache.get(feature);
  if (cached) {
    return cached;
  }

  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  let found = false;

  const visit = (pos: number[]) => {
    const lng = pos[0];
    const lat = pos[1];
    if (lng === undefined || lat === undefined) {
      return;
    }
    found = true;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  };

  const geometry = feature.geometry;
  const outer =
    geometry?.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;

  outer?.forEach(visit);

  if (!found) {
    return null;
  }

  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  bboxCache.set(feature, bbox);
  return bbox;
}

export function featuresForRegion(
  collection: FeatureCollection,
  region: MapRegion,
  selectedId?: string,
  limit = 40,
): TalhaoFeature[] {
  const minLat = region.latitude - region.latitudeDelta;
  const maxLat = region.latitude + region.latitudeDelta;
  const minLng = region.longitude - region.longitudeDelta;
  const maxLng = region.longitude + region.longitudeDelta;

  const scored: { feature: TalhaoFeature; dist: number; selected: boolean }[] = [];

  for (const feature of collection.features) {
    const bbox = featureBBox(feature);
    if (!bbox) {
      continue;
    }
    const [bMinLng, bMinLat, bMaxLng, bMaxLat] = bbox;
    const overlaps = bMaxLat >= minLat && bMinLat <= maxLat && bMaxLng >= minLng && bMinLng <= maxLng;
    const infoId = String(feature.properties?.sec_Id ?? feature.properties?.id ?? '');
    const selected = Boolean(selectedId && infoId === selectedId);
    if (!overlaps && !selected) {
      continue;
    }
    const centerLng = (bMinLng + bMaxLng) / 2;
    const centerLat = (bMinLat + bMaxLat) / 2;
    const dist = (centerLat - region.latitude) ** 2 + (centerLng - region.longitude) ** 2;
    scored.push({ feature, dist, selected });
  }

  scored.sort((a, b) => Number(b.selected) - Number(a.selected) || a.dist - b.dist);
  return scored.slice(0, limit).map((item) => item.feature);
}

export function geometryCentroid(geometry: TalhaoFeature['geometry']): { lng: number; lat: number } | null {
  if (!geometry) {
    return null;
  }
  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;
  if (!ring?.length) {
    return null;
  }
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (const coord of ring) {
    if (!Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) {
      continue;
    }
    lng += coord[0];
    lat += coord[1];
    n += 1;
  }
  return n > 0 ? { lng: lng / n, lat: lat / n } : null;
}
