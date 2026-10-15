export type Position = [number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface GeoJsonProperties {
  id?: number | string;
  Fazenda?: string;
  Lote?: number | string;
  Cod_fazend?: number | string;
  Campo?: string;
  Produtor?: string;
  sec_Id?: string;
  [key: string]: unknown;
}

export interface TalhaoFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: GeoJsonProperties | null;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: TalhaoFeature[];
}

export interface TalhaoInfo {
  id: string;
  nomeFazenda: string;
  codigoFazenda: number;
  codigoTalhao: number;
  campo?: string;
  produtor?: string;
  secId?: string;
  propriedades: GeoJsonProperties;
  feature: TalhaoFeature;
}

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
