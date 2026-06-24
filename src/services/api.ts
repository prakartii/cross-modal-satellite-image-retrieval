/**
 * AKSHA Earth Intelligence Platform — Backend API Client
 *
 * PURPOSE:
 *   Provides typed wrappers around all AKSHA backend API endpoints.
 *   Handles SSE (Server-Sent Events) streaming for the analysis pipeline,
 *   falling back gracefully when the backend is unavailable.
 *
 * ARCHITECTURE:
 *   The client checks backend availability on first use via /health.
 *   If the backend is down, all methods fall back to the existing mock
 *   behavior so the frontend remains fully functional for demos.
 *
 *   This pattern is called "graceful degradation" — the system degrades
 *   to a simpler mode rather than breaking entirely.
 *
 * USAGE:
 *   import { apiClient } from '@/services/api'
 *   const { available } = await apiClient.checkHealth()
 *   const reader = await apiClient.analyzeImage(file)
 */

export const BACKEND_URL = 'http://localhost:8000'

export interface PipelineEvent {
  stage: string
  progress: number
  data: Record<string, unknown>
}

export interface HealthResponse {
  available: boolean
  archiveSize: number
}

class AkshaApiClient {
  private _available: boolean | null = null
  private _checkPromise: Promise<boolean> | null = null

  /**
   * Check if the backend is running and cache the result.
   * Uses a single pending Promise to prevent race conditions on first load.
   */
  async checkHealth(): Promise<HealthResponse> {
    if (this._available !== null) {
      return { available: this._available, archiveSize: 50 }
    }

    if (!this._checkPromise) {
      this._checkPromise = fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Backend unhealthy')
          const data = await res.json()
          this._available = true
          return true
        })
        .catch(() => {
          this._available = false
          return false
        })
        .finally(() => {
          this._checkPromise = null
        })
    }

    const available = await this._checkPromise
    return { available, archiveSize: 50 }
  }

  /**
   * Analyze an uploaded image through the full AI pipeline.
   * Returns a ReadableStreamDefaultReader<string> for SSE processing,
   * or null if the backend is unavailable.
   *
   * IMPORTANT: We reset the availability cache before each analysis attempt
   * so the user can start the backend after page load and it will be found.
   * A cached "unavailable" from a previous attempt should not block a new try.
   */
  async analyzeImage(
    file: File,
    sensorType?: string,
  ): Promise<ReadableStreamDefaultReader<string> | null> {
    // Always do a live check — backend may have started since last attempt
    this._available = null
    console.log('[AKSHA API] Checking backend health before analysis…')
    const { available } = await this.checkHealth()
    console.log('[AKSHA API] Backend available:', available)
    if (!available) return null

    const formData = new FormData()
    formData.append('file', file)
    if (sensorType) {
      formData.append('sensor_type', sensorType)
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok || !response.body) {
        console.error('AKSHA API analyze failed:', response.status)
        return null
      }

      return response.body
        .pipeThrough(new TextDecoderStream())
        .getReader()
    } catch (err) {
      console.error('AKSHA API connect error:', err)
      this._available = false
      return null
    }
  }

  /**
   * Upload an image and get immediate metadata preview.
   * Used for the Scene Intelligence Panel before running full analysis.
   */
  async uploadForPreview(file: File): Promise<Record<string, unknown> | null> {
    const { available } = await this.checkHealth()
    if (!available) return null

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(10000),
      })
      return res.ok ? res.json() : null
    } catch {
      return null
    }
  }

  /**
   * Text-based archive search for the AI Copilot.
   */
  async textSearch(
    query: string,
    sensor?: string,
    limit = 10,
  ): Promise<Record<string, unknown>[] | null> {
    const { available } = await this.checkHealth()
    if (!available) return null

    const params = new URLSearchParams({ q: query, limit: String(limit) })
    if (sensor) params.set('sensor', sensor)

    try {
      const res = await fetch(`${BACKEND_URL}/api/search?${params}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return null
      const data: Record<string, unknown> = await res.json()
      return data['results'] as Record<string, unknown>[] ?? null
    } catch {
      return null
    }
  }

  /** Parse a single SSE line into a PipelineEvent, or null if not an event. */
  parseSseLine(line: string): PipelineEvent | null {
    if (!line.startsWith('data: ')) return null
    try {
      return JSON.parse(line.slice(6)) as PipelineEvent
    } catch {
      return null
    }
  }

  /** Reset availability cache (call after reconnect attempt). */
  resetCache(): void {
    this._available = null
  }
}

export const apiClient = new AkshaApiClient()
