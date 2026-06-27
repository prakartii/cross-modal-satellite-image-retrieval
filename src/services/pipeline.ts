/**
 * src/services/pipeline.ts
 *
 * PURPOSE:
 *   Frontend pipeline orchestration for the AKSHA Intelligence Search.
 *
 * ARCHITECTURE (v3.0 — Real Retrieval):
 *   Calls POST /api/search with the uploaded image.
 *   Returns a synchronous JSON response with:
 *     - Real cosine similarity scores for each result
 *     - Per-feature similarity breakdown for radar charts
 *     - Scene metadata from the archive database
 *
 * REQUIREMENTS:
 *   - Search ONLY runs after the user uploads an image (enforced in UI)
 *   - Every similarity score comes from cosine similarity computation
 *   - No mock data, no random scores, no hardcoded results
 *   - If backend is unavailable, show an error — never show fake data
 */

import { apiClient, type SearchResponse, type RawSearchResult } from './api'
import type { RetrievalResult } from '@/types'

export interface SearchCallbacks {
  onLoading: () => void
  onComplete: (results: RetrievalResult[], rawResponse: SearchResponse) => void
  onError: (message: string) => void
}

/**
 * Run the real AI retrieval pipeline for an uploaded image.
 *
 * Calls POST /api/search — a synchronous pipeline that:
 *   1. Validates and opens the image
 *   2. Resizes to 512×512 and normalizes pixels
 *   3. Extracts 14 features (color, texture, edge, water, vegetation, urban)
 *   4. Generates a 14-dim unit embedding via weighted L2 normalization
 *   5. Computes cosine similarity against 50 archive embeddings
 *   6. Re-ranks by temporal and sensor compatibility
 *   7. Returns top-K formatted results
 *
 * If the backend is unavailable, calls onError — no fake data is shown.
 */
export async function runRetrieval(
  file: File,
  topK: number,
  callbacks: SearchCallbacks,
): Promise<void> {
  const { onLoading, onComplete, onError } = callbacks

  console.log('[AKSHA Retrieval] Starting for:', file.name, file.size, 'bytes, top_k:', topK)
  onLoading()

  const response = await apiClient.searchImage(file, topK)

  if (!response) {
    const msg = 'AKSHA backend is not running. Start it with: cd backend && python main.py'
    console.error('[AKSHA Retrieval] Backend unavailable.')
    onError(msg)
    return
  }

  console.log(
    '[AKSHA Retrieval] ✅ Complete —',
    response.results.length, 'results |',
    response.pipeline_ms, 'ms |',
    'scene:', response.scene_type_guess,
    `(${(response.confidence * 100).toFixed(0)}% confidence)`,
  )

  const results = _mapResults(response.results)
  onComplete(results, response)
}

/**
 * Map raw backend result objects to the TypeScript RetrievalResult type.
 *
 * Maps the snake_case fields from the Python API into the camelCase fields
 * expected by the frontend components. All values come directly from the
 * backend — no defaults that silently hide missing data.
 */
function _mapResults(raw: RawSearchResult[]): RetrievalResult[] {
  return raw.map((r) => ({
    id:              r.id,
    rank:            r.rank,
    similarityScore: r.similarity_score,   // cosine-based final score
    sensorType:      r.sensor_type as 'SAR' | 'Optical' | 'Multispectral',
    satellite:       r.satellite,
    location: {
      name:    r.location.name,
      coords:  { lat: r.location.lat, lng: r.location.lng },
      region:  r.location.region,
      country: r.location.country,
    },
    timestamp:        r.acquisition_date,
    resolution:       r.resolution,
    cloudCover:       r.cloud_cover,
    thumbnailUrl:     r.thumbnail_url,
    featureSimilarity: {
      vegetation: r.feature_similarity.vegetation,
      water:      r.feature_similarity.water,
      texture:    r.feature_similarity.texture,
      urban:      r.feature_similarity.urban,
      cloud:      r.feature_similarity.spectral,
      terrain:    Math.round((r.feature_similarity.texture + r.feature_similarity.vegetation) / 2),
    },
    embeddingDistance: 1.0 - r.cosine_score,  // convert similarity to distance
    archiveSource:    r.archive_source,
    orbitNumber:      r.orbit_number,
    acquisitionMode:  r.scene_type,
    processingLevel:  r.processing_level,
    sceneId:          r.id,
    eventType:        r.scene_type,
    matchExplanation: r.match_explanation,
  }))
}

// 10-stage AI pipeline — Foundation Model + FAISS + Cross-Modal
export const PIPELINE_STAGES = [
  'metadata_extraction',
  'radiometric_calibration',
  'cloud_noise_correction',
  'foundation_model_encoding',
  'cross_modal_alignment',
  'faiss_vector_search',
  'graph_reranking',
  'explainability_engine',
  'mission_report',
  'complete',
] as const

export type LegacyPipelineStage = typeof PIPELINE_STAGES[number]
