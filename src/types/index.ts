// ── Sensor & view types ────────────────────────────────────────────────────
export type SensorType = 'SAR' | 'Optical' | 'Multispectral';

export type ViewMode = 'gallery' | 'earth' | 'timeline' | 'compare';

// ── Full 10-stage pipeline ─────────────────────────────────────────────────
export type FullPipelineStage =
  | 'idle'
  | 'metadata_extraction'
  | 'preprocessing'
  | 'feature_extraction'
  | 'embedding_generation'
  | 'semantic_search'
  | 'graph_reranking'
  | 'event_detection'
  | 'confidence_estimation'
  | 'report_generation'
  | 'complete';

export type PipelineStage = FullPipelineStage;

// ── Coordinate & spatial types ─────────────────────────────────────────────
export interface Coordinates {
  lat: number;
  lng: number;
  alt?: number;
}

// ── Feature similarity for radar chart ────────────────────────────────────
export interface FeatureSimilarity {
  vegetation: number;
  water:      number;
  texture:    number;
  urban:      number;
  cloud:      number;
}

// ── Retrieval result ───────────────────────────────────────────────────────
export interface RetrievalResult {
  id:             string;
  rank:           number;
  similarityScore:number;
  sensorType:     SensorType;
  satellite:      string;
  location: {
    name:    string;
    coords:  Coordinates;
    region:  string;
    country: string;
  };
  timestamp:        string;
  resolution:       string;
  cloudCover:       number;
  bands?:           string;
  thumbnailUrl:     string;
  featureSimilarity:FeatureSimilarity;
  embeddingDistance:number;
  archiveSource:    string;
  orbitNumber?:     number;
  acquisitionMode?: string;
  processingLevel?: string;
  sceneId?:         string;
  eventType?:       string;
  matchExplanation?:string;
  category?:        string;
  finalScore?:      number;
}

// ── Query image ────────────────────────────────────────────────────────────
export interface QueryImage {
  id:              string;
  file?:           File;
  name:            string;
  sensorType:      SensorType;
  satellite?:      string;
  resolution?:     string;
  detectedRegion?: string;
  coords?:         Coordinates;
  acquisitionDate?:string;
  thumbnailUrl:    string;
  fileSize?:       string;
}

// ── Pipeline stage data snapshot ───────────────────────────────────────────
export interface PipelineStageData {
  stage:    FullPipelineStage;
  progress: number;
  message:  string;
  result?:  Record<string, unknown>;
  timestamp:string;
}

// ── Detected event ─────────────────────────────────────────────────────────
export interface DetectedEvent {
  event_type:         string;
  severity:           'Low' | 'Moderate' | 'High' | 'Critical';
  confidence:         number;
  explanation:        string;
  recommended_action: string;
  feature_evidence:   Record<string, number>;
  triggered_rules?:   string[];
}

// ── Mission Intelligence Report ────────────────────────────────────────────
export interface MissionReport {
  generated_at:      string;
  mission_id:        string;
  executive_summary: string;
  scene_metadata: {
    satellite:        string;
    sensor_type:      string;
    acquisition_date: string;
    region:           string;
    coordinates:      Coordinates;
    resolution:       string;
    cloud_cover_pct:  number;
    scene_id:         string;
    archive_source:   string;
    processing_level: string;
    bands?:           number;
    file_size_kb?:    number;
  };
  detected_events: DetectedEvent[];
  search_summary: {
    total_matches:   number;
    top_match_score: number;
    archive_size:    number;
    top_matches: Array<{
      rank:        number;
      similarity:  number;
      satellite:   string;
      location:    string;
      date:        string;
      event_type:  string;
      event_label: string;
      thumbnail?:  string;
    }>;
  };
  confidence: {
    overall:     number;
    level:       'Low' | 'Medium' | 'High';
    components:  Record<string, number>;
    explanation: string;
    limitations: string[];
  };
  feature_analysis: {
    water_coverage_pct:      number;
    vegetation_coverage_pct: number;
    edge_density_pct:        number;
    brightness_level:        string;
    texture_complexity:      string;
    dominant_surface:        string;
    homogeneity?:            number;
    entropy?:                number;
  };
  historical_context: {
    dominant_historical_type: string;
    notable_analogues: Array<{
      event:      string;
      satellite:  string;
      date:       string;
      similarity: number;
      category?:  string;
    }>;
    archive_coverage_years?: string;
    archive_scene_count?:    number;
  };
  recommended_actions: Array<{
    priority: string;
    action:   string;
  }>;
  pipeline_timeline: Array<{
    stage:        string;
    description:  string;
    duration_ms?: number;
  }>;
}

// ── Full Mission Data (from backend "complete" event) ──────────────────────
// This is the central object — every page reads from here.
export interface MissionData {
  id:                   string;
  created_at:           string;
  filename:             string;
  query_thumbnail_b64:  string;   // Base64 PNG for Compare view
  metadata:             Record<string, unknown>;
  preprocessing:        Record<string, unknown>;
  features:             Record<string, number>;
  feature_vector:       number[];
  feature_vector_names: string[];
  scene_type:           string;
  embedding:            number[];
  retrieval_results:    RetrievalResult[];
  graph:                { nodes: GraphNode[]; edges: GraphEdge[]; stats: Record<string, unknown> };
  events:               DetectedEvent[];
  confidence:           MissionReport['confidence'];
  timeline:             MissionTimelineItem[];
  analytics:            MissionAnalytics;
  report:               MissionReport;
  logs:                 Array<{ stage: string; duration_ms: number; summary: Record<string, unknown>; timestamp: string }>;
}

// ── Timeline item ──────────────────────────────────────────────────────────
export interface MissionTimelineItem {
  timestamp:  string;
  event_type: 'upload' | 'pipeline' | 'historical' | 'event';
  title:      string;
  description:string;
  category:   string;
  data:       Record<string, unknown>;
}

// ── Analytics ─────────────────────────────────────────────────────────────
export interface MissionAnalytics {
  coverage: {
    water_pct:      number;
    vegetation_pct: number;
    urban_pct:      number;
    cloud_pct:      number;
    bare_soil_pct:  number;
    dominant_cover: string;
  };
  spectral:  Record<string, number | Record<string, number>>;
  texture:   Record<string, number | string>;
  retrieval: {
    total_results:           number;
    top_similarity:          number;
    mean_similarity:         number;
    sensor_distribution:     Record<string, number>;
    satellite_distribution:  Record<string, number>;
    category_distribution:   Record<string, number>;
    location_spread_km:      number;
    dominant_event_type:     string;
    archive_size:            number;
  };
  confidence: { overall: number; level: string; components: Record<string, number> };
  features:   Record<string, number>;
  processing: {
    total_ms:       number;
    total_seconds:  number;
    stage_breakdown: Record<string, number>;
    slowest_stage:  string;
    embedding_dim:  number;
  };
  scene_info: Record<string, unknown>;
}

// ── Graph types ────────────────────────────────────────────────────────────
export interface GraphNode {
  id:              string;
  label:           string;
  type:            'query' | 'result' | 'historical' | 'event' | 'satellite' | 'cluster';
  sensorType?:     SensorType;
  similarityScore?:number;
  coords?:         Coordinates;
  timestamp?:      string;
  x?:              number;
  y?:              number;
  fx?:             number | null;
  fy?:             number | null;
  agency?:         string;
  description?:    string;
  aiExplanation?:  string;
  eventType?:      string;
}

export interface GraphEdge {
  id:               string;
  source:           string;
  target:           string;
  strength:         number;
  relationshipType: 'semantic' | 'spatial' | 'temporal' | 'event' | 'provenance';
  label?:           string;
  aiExplanation?:   string;
}

// ── Copilot types ──────────────────────────────────────────────────────────
export interface CopilotMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
  actions?:  CopilotAction[];
}

export interface CopilotAction {
  type:    'fly_to' | 'show_results' | 'open_panel' | 'filter_results';
  label:   string;
  payload: Record<string, unknown>;
}

// ── Satellite orbit types ──────────────────────────────────────────────────
export interface SatelliteOrbit {
  id:          string;
  name:        string;
  inclination: number;
  altitude:    number;
  color:       string;
  period:      number;
  phaseOffset: number;
}

export interface GlobeHotspot {
  id:        string;
  coords:    Coordinates;
  label:     string;
  type:      'flood' | 'agriculture' | 'urban' | 'disaster' | 'monitoring';
  intensity: number;
}

// ── Analytics types ────────────────────────────────────────────────────────
export interface AnalyticsMetric {
  label:   string;
  value:   number;
  unit:    string;
  trend:   number;
  history: { time: string; value: number }[];
}

// ── Mission types (legacy + new) ───────────────────────────────────────────
export interface Mission {
  id:          string;
  name:        string;
  description: string;
  createdAt:   string;
  resultCount: number;
  queryImage?: QueryImage;
}
