export type SensorType = 'SAR' | 'Optical' | 'Multispectral';

export type ViewMode = 'gallery' | 'earth' | 'timeline' | 'compare';

export type PipelineStage =
  | 'idle'
  | 'feature_extraction'
  | 'cross_modal_alignment'
  | 'archive_search'
  | 'graph_reranking'
  | 'complete';

export interface Coordinates {
  lat: number;
  lng: number;
  alt?: number;
}

export interface FeatureSimilarity {
  vegetation: number;
  water: number;
  texture: number;
  urban: number;
  cloud: number;
}

export interface RetrievalResult {
  id: string;
  rank: number;
  similarityScore: number;
  sensorType: SensorType;
  satellite: string;
  location: {
    name: string;
    coords: Coordinates;
    region: string;
    country: string;
  };
  timestamp: string;
  resolution: string;
  cloudCover: number;
  bands?: string;
  thumbnailUrl: string;
  featureSimilarity: FeatureSimilarity;
  embeddingDistance: number;
  archiveSource: string;
  orbitNumber?: number;
  acquisitionMode?: string;
}

export interface QueryImage {
  id: string;
  file?: File;
  name: string;
  sensorType: SensorType;
  satellite?: string;
  resolution?: string;
  detectedRegion?: string;
  coords?: Coordinates;
  acquisitionDate?: string;
  thumbnailUrl: string;
  fileSize?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'query' | 'result' | 'historical' | 'event';
  sensorType?: SensorType;
  similarityScore?: number;
  coords?: Coordinates;
  timestamp?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  strength: number;
  relationshipType: 'semantic' | 'spatial' | 'temporal' | 'event';
  label?: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: CopilotAction[];
}

export interface CopilotAction {
  type: 'fly_to' | 'show_results' | 'open_panel' | 'filter_results';
  label: string;
  payload: Record<string, unknown>;
}

export interface SatelliteOrbit {
  id: string;
  name: string;
  inclination: number;
  altitude: number;
  color: string;
  period: number;
  phaseOffset: number;
}

export interface GlobeHotspot {
  id: string;
  coords: Coordinates;
  label: string;
  type: 'flood' | 'agriculture' | 'urban' | 'disaster' | 'monitoring';
  intensity: number;
}

export interface AnalyticsMetric {
  label: string;
  value: number;
  unit: string;
  trend: number;
  history: { time: string; value: number }[];
}

export interface Mission {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  resultCount: number;
  queryImage?: QueryImage;
}
