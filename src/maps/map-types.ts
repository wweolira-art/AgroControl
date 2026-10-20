import type { Coordenada, FeatureCollection, MapRegion, TalhaoInfo } from '../types/geo';

export interface MapCameraHandle {
  animateToRegion: (region: MapRegion, duration?: number) => void;
  undoDraft?: () => void;
  clearDraft?: () => void;
}

export interface GeoJsonMapProps {
  collection: FeatureCollection;
  initialRegion: MapRegion;
  selected?: TalhaoInfo | null;
  onLongPress?: (latitude: number, longitude: number) => void;
  onRegionChange?: (region: MapRegion) => void;
  imagery?: 'satellite' | 'street';
  userCoordinate?: { latitude: number; longitude: number } | null;
  drawMode?: boolean;
  initialDraft?: Coordenada[];
  onDraftChange?: (pontos: Coordenada[]) => void;
}
