import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  RetrievalResult, QueryImage, FullPipelineStage,
  ViewMode, CopilotMessage, Mission, MissionReport, PipelineStageData,
  MissionData, MissionAnalytics, MissionTimelineItem, GraphNode, GraphEdge,
} from '@/types'
import { runRetrieval, PIPELINE_STAGES } from '@/services/pipeline'
import type { SearchResponse } from '@/services/api'
import { mockResults } from '@/data/mockResults'

// ── Mission data builder ───────────────────────────────────────────────────────
// Constructs a full MissionData from results (works with real or demo data).
// All pages read from this object — it is the single source of truth.

function _buildMissionData(queryImage: QueryImage, results: RetrievalResult[]): MissionData {
  const now = new Date()

  // ── Graph ──────────────────────────────────────────────────────────────────
  const nodes: GraphNode[] = [
    {
      id: 'query',
      label: queryImage.name.split('.')[0].slice(0, 20),
      type: 'query',
      sensorType: queryImage.sensorType,
      description: 'Uploaded mission image — Brahmaputra flood scene',
      coords: { lat: 26.12, lng: 91.74 },
    },
    {
      id: 'region-brahmaputra',
      label: 'Brahmaputra Basin',
      type: 'cluster',
      description: 'Active flood monitoring AOI · Assam, India',
      coords: { lat: 26.5, lng: 92.0 },
    },
    {
      id: 'event-flood',
      label: 'Flood Event 2024',
      type: 'event',
      eventType: 'Flood',
      description: 'Active flood signature detected in Brahmaputra corridor',
    },
  ]

  const satMap = new Map<string, RetrievalResult>()
  results.slice(0, 6).forEach((r) => { if (!satMap.has(r.satellite)) satMap.set(r.satellite, r) })
  const satKeys = [...satMap.keys()].slice(0, 3)
  const satIds = new Map<string, string>()
  satKeys.forEach((sat, i) => {
    const r = satMap.get(sat)!
    const id = `sat-${i}`
    satIds.set(sat, id)
    nodes.push({
      id, label: sat.split(' ')[0], type: 'satellite', sensorType: r.sensorType,
      agency: r.archiveSource.includes('ISRO') ? 'ISRO' : r.archiveSource.includes('ESA') ? 'ESA' : 'JAXA',
      description: `${r.sensorType} satellite platform`,
    })
  })

  results.slice(0, 5).forEach((r) => {
    nodes.push({
      id: r.id,
      label: r.location.name.split(',')[0].trim(),
      type: 'result',
      sensorType: r.sensorType,
      similarityScore: r.similarityScore,
      timestamp: r.timestamp,
      coords: r.location.coords,
      description: `${r.satellite} · ${r.similarityScore.toFixed(1)}% match`,
    })
  })

  const edges: GraphEdge[] = [
    { id: 'q-region', source: 'query', target: 'region-brahmaputra', strength: 0.92, relationshipType: 'spatial', label: 'monitors' },
    { id: 'flood-q', source: 'event-flood', target: 'query', strength: 0.88, relationshipType: 'event', label: 'detected' },
  ]
  results.slice(0, 5).forEach((r) => {
    edges.push({ id: `q-${r.id}`, source: 'query', target: r.id, strength: r.similarityScore / 100, relationshipType: 'semantic', label: `${r.similarityScore.toFixed(0)}%` })
    const satId = satIds.get(r.satellite)
    if (satId) edges.push({ id: `prov-${r.id}`, source: satId, target: r.id, strength: 0.7, relationshipType: 'provenance', label: 'acquired' })
    if (r.location.region === 'Northeast India') edges.push({ id: `geo-${r.id}`, source: r.id, target: 'region-brahmaputra', strength: 0.6, relationshipType: 'spatial', label: 'in region' })
  })

  // ── Timeline ───────────────────────────────────────────────────────────────
  const timeline: MissionTimelineItem[] = []

  // Historical archive matches
  ;[...results]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .forEach((r) => {
      timeline.push({
        timestamp:   r.timestamp,
        event_type:  'historical',
        title:       `${r.satellite} — ${r.sensorType} Acquisition`,
        description: `${r.location.name} · ${r.similarityScore.toFixed(1)}% similarity`,
        category:    r.sensorType,
        data:        { score: r.similarityScore, satellite: r.satellite } as Record<string, unknown>,
      })
    })

  // Current upload event
  timeline.push({
    timestamp:   now.toISOString(),
    event_type:  'upload',
    title:       'Mission Image Uploaded',
    description: `${queryImage.name} accepted for intelligence analysis`,
    category:    'Mission Start',
    data:        { sensor: queryImage.sensorType } as Record<string, unknown>,
  })

  // Pipeline completion
  timeline.push({
    timestamp:   new Date(now.getTime() + 7500).toISOString(),
    event_type:  'pipeline',
    title:       'Intelligence Pipeline Complete',
    description: `${results.length} archive scenes retrieved · AKSHA v3.0`,
    category:    'Pipeline',
    data:        { results: results.length } as Record<string, unknown>,
  })

  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // ── Analytics ──────────────────────────────────────────────────────────────
  const scores = results.map((r) => r.similarityScore)
  const avg = (fn: (r: RetrievalResult) => number) => results.length ? results.reduce((s, r) => s + fn(r), 0) / results.length : 0
  const avgWater  = avg((r) => r.featureSimilarity.water)
  const avgVeg    = avg((r) => r.featureSimilarity.vegetation)
  const avgUrban  = avg((r) => r.featureSimilarity.urban)
  const avgCloud  = avg((r) => r.cloudCover)

  const sensorDist: Record<string, number> = {}
  const satDist: Record<string, number>    = {}
  results.forEach((r) => {
    sensorDist[r.sensorType] = (sensorDist[r.sensorType] ?? 0) + 1
    satDist[r.satellite]     = (satDist[r.satellite] ?? 0) + 1
  })

  const waterPct = Math.round(avgWater * 0.65)
  const vegPct   = Math.round(avgVeg   * 0.55)
  const urbanPct = Math.round(avgUrban * 0.35)
  const cloudPct = Math.round(avgCloud)

  const analytics: MissionAnalytics = {
    coverage: {
      water_pct:      waterPct,
      vegetation_pct: vegPct,
      urban_pct:      urbanPct,
      cloud_pct:      cloudPct,
      bare_soil_pct:  Math.max(0, 100 - waterPct - vegPct - urbanPct - cloudPct),
      dominant_cover: avgWater > avgVeg ? 'Water / Inundated' : 'Vegetation',
    },
    spectral:  { mean_brightness: 0.42, mean_ndwi: 0.61, mean_ndvi: 0.38 },
    texture:   { complexity: 'Moderate', mean_entropy: 3.41, mean_contrast: 0.286 },
    retrieval: {
      total_results:       results.length,
      top_similarity:      scores.length ? Math.max(...scores) : 0,
      mean_similarity:     scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0,
      sensor_distribution: sensorDist,
      satellite_distribution: satDist,
      category_distribution: {
        Flood:      results.filter((r) => r.featureSimilarity.water      > 70).length,
        Vegetation: results.filter((r) => r.featureSimilarity.vegetation > 80).length,
      },
      location_spread_km:  450,
      dominant_event_type: 'Flood',
      archive_size:        50,
    },
    confidence: { overall: 78, level: 'Medium', components: { similarity: 85, spatial: 72, temporal: 74 } },
    features:   { water_index: 0.61, vegetation_index: 0.38, edge_density: 0.42, brightness: 0.35 },
    processing: {
      total_ms:   7200,
      total_seconds: 7.2,
      stage_breakdown: {
        metadata_extraction: 800, preprocessing: 700, feature_extraction: 1200,
        embedding_generation: 600, semantic_search: 900, graph_reranking: 800,
        event_detection: 700, confidence_estimation: 600, report_generation: 900,
      },
      slowest_stage: 'feature_extraction',
      embedding_dim: 14,
    },
    scene_info: { region: 'Brahmaputra River Basin', country: 'India', sensor: queryImage.sensorType },
  }

  const missionId = `AKSHA-${Date.now()}`
  return {
    id:                   missionId,
    created_at:           now.toISOString(),
    filename:             queryImage.name,
    query_thumbnail_b64:  '',
    metadata: { satellite: queryImage.satellite ?? 'RISAT-2B', sensor_type: queryImage.sensorType, region: 'Brahmaputra River Basin', acquisition_date: now.toISOString() },
    preprocessing: { normalized_size: '512×512', histogram_equalized: true },
    features: { water_index: 0.61, vegetation_index: 0.38, edge_density: 0.42, brightness: 0.35 },
    feature_vector:       Array.from({ length: 14 }, (_, i) => parseFloat(Math.abs(Math.sin(i * 1.5)).toFixed(4))),
    feature_vector_names: ['brightness','red_mean','green_mean','blue_mean','std_dev','water_index','vegetation_index','urban_fraction','edge_density','texture_contrast','homogeneity','entropy','spatial_freq','spectral_slope'],
    scene_type:           'Flood',
    embedding:            Array.from({ length: 14 }, (_, i) => parseFloat(Math.abs(Math.sin(i * 1.5)).toFixed(4))),
    retrieval_results:    results,
    graph:                { nodes, edges, stats: { node_count: nodes.length, edge_count: edges.length } },
    events: [{
      event_type:         'Flood',
      severity:           'High',
      confidence:         0.78,
      explanation:        'Water index (0.61) consistent with active inundation. Brahmaputra corridor flood signature confirmed across SAR and optical modalities.',
      recommended_action: 'Initiate ground-truth verification. Alert district disaster management. Continue SAR monitoring at 6-hour intervals.',
      feature_evidence:   { water_index: 0.61, edge_density: 0.42, brightness: 0.35 },
      triggered_rules:    ['NDWI > 0.50', 'SAR σ⁰ < −15 dB', 'Historical flood pattern match > 85%'],
    }],
    confidence: {
      overall:     78,
      level:       'Medium',
      components:  { similarity: 85, spatial: 72, temporal: 74 },
      explanation: 'Medium confidence: 85% cross-modal similarity, 72% spatial coherence, 74% historical agreement.',
      limitations: ['No optical ground-truth available', 'Archive limited to 50 scenes'],
    },
    timeline,
    analytics,
    report:  null as unknown as MissionReport,
    logs: [
      { stage: 'metadata_extraction', duration_ms: 800,  summary: { satellite: queryImage.satellite ?? 'RISAT-2B', region: 'NE India' }, timestamp: now.toISOString() },
      { stage: 'feature_extraction',  duration_ms: 1200, summary: { features: 14, water_index: 0.61 }, timestamp: now.toISOString() },
      { stage: 'semantic_search',     duration_ms: 900,  summary: { results: results.length, top: scores[0] ?? 0 }, timestamp: now.toISOString() },
    ],
  }
}

// ── Earth State ────────────────────────────────────────────────────────────
interface EarthState {
  isLoaded:     boolean
  isRotating:   boolean
  focusedCoords:{ lat: number; lng: number } | null
  showHotspots: boolean
  showOrbits:   boolean
  showArcs:     boolean
  showPins:     boolean
}

// ── Search/Pipeline State ──────────────────────────────────────────────────
interface SearchState {
  query:            string
  uploadedImage:    QueryImage | null
  pipelineStage:    FullPipelineStage
  pipelineProgress: number
  pipelineEvents:   PipelineStageData[]
  isSearching:      boolean
  searchComplete:   boolean
  backendAvailable: boolean | null
  pipelineError:    string | null  // Set when backend is unavailable — no fake fallback
}

// ── Results State ──────────────────────────────────────────────────────────
interface ResultsState {
  results:        RetrievalResult[]
  selectedResult: RetrievalResult | null
  hoveredResult:  RetrievalResult | null
  viewMode:       ViewMode
  dockOpen:       boolean
  compareIds:     string[]
  missionReport:  MissionReport | null
}

// ── Mission State (the central data object from the backend) ──────────────
// Every page reads from currentMission instead of hardcoded data files
interface MissionState {
  currentMission:    MissionData | null
  missionGraphNodes: GraphNode[]
  missionGraphEdges: GraphEdge[]
  missionTimeline:   MissionTimelineItem[]
  missionAnalytics:  MissionAnalytics | null
  queryThumbnailB64: string | null   // For Compare view (uploaded image)
}

type EarthLayer = 'optical' | 'sar' | 'multispectral' | 'flood' | 'vegetation' | 'urban'

// ── UI State ───────────────────────────────────────────────────────────────
interface UIState {
  leftPanelOpen:      boolean
  rightPanelOpen:     boolean
  copilotOpen:        boolean
  explainabilityOpen: boolean
  graphExplorerOpen:  boolean
  commandPaletteOpen: boolean
  activeView: 'command-center' | 'search' | 'results' | 'graph' | 'copilot' | 'analytics' | 'satellite-tracker'
  activeMission:      Mission | null
  earthLayer:         EarthLayer
  showMissionReport:  boolean
}

// ── Copilot State ──────────────────────────────────────────────────────────
interface CopilotState {
  messages:           CopilotMessage[]
  isTyping:           boolean
  suggestionsVisible: boolean
}

// ── Full Store Interface ───────────────────────────────────────────────────
interface AppStore
  extends EarthState, SearchState, ResultsState, MissionState, UIState, CopilotState {

  // Earth actions
  setEarthLoaded:   (v: boolean) => void
  setFocusedCoords: (c: { lat: number; lng: number } | null) => void
  toggleOrbits:     () => void
  toggleHotspots:   () => void

  // Search actions
  setQuery:          (q: string) => void
  setUploadedImage:  (img: QueryImage | null) => void
  startSearch:       () => void
  advancePipeline:   () => void
  resetSearch:       () => void
  setBackendStatus:  (v: boolean) => void

  // Pipeline event recording
  addPipelineEvent:   (event: PipelineStageData) => void
  clearPipelineEvents:() => void

  // Results actions
  setResults:        (r: RetrievalResult[]) => void
  selectResult:      (r: RetrievalResult | null) => void
  hoverResult:       (r: RetrievalResult | null) => void
  setViewMode:       (m: ViewMode) => void
  toggleDock:        () => void
  addToCompare:      (id: string) => void
  removeFromCompare: (id: string) => void
  setMissionReport:  (report: MissionReport | null) => void

  // Mission actions (set from "complete" SSE event)
  setCurrentMission: (mission: MissionData | null) => void

  // UI actions
  toggleLeftPanel:    () => void
  toggleRightPanel:   () => void
  toggleCopilot:      () => void
  openExplainability: (result: RetrievalResult) => void
  closeExplainability:() => void
  toggleGraphExplorer:() => void
  setCommandPalette:  (open: boolean) => void
  setActiveView:      (v: UIState['activeView']) => void
  setEarthLayer:      (layer: EarthLayer) => void
  setShowMissionReport:(v: boolean) => void

  // Copilot actions
  addMessage:     (msg: CopilotMessage) => void
  setTyping:      (v: boolean) => void
  clearMessages:  () => void
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Earth ──────────────────────────────────────────────────────────────
    isLoaded:      false,
    isRotating:    true,
    focusedCoords: null,
    showHotspots:  true,
    showOrbits:    true,
    showArcs:      false,
    showPins:      false,

    // ── Search/Pipeline ────────────────────────────────────────────────────
    query:            '',
    uploadedImage:    null,
    pipelineStage:    'idle',
    pipelineProgress: 0,
    pipelineEvents:   [],
    isSearching:      false,
    searchComplete:   false,
    backendAvailable: null,
    pipelineError:    null,

    // ── Results ────────────────────────────────────────────────────────────
    results:        [],
    selectedResult: null,
    hoveredResult:  null,
    viewMode:       'gallery',
    dockOpen:       false,
    compareIds:     [],
    missionReport:  null,

    // ── Mission (central data object) ──────────────────────────────────────
    currentMission:    null,
    missionGraphNodes: [],
    missionGraphEdges: [],
    missionTimeline:   [],
    missionAnalytics:  null,
    queryThumbnailB64: null,

    // ── UI ─────────────────────────────────────────────────────────────────
    leftPanelOpen:      false,
    rightPanelOpen:     false,
    copilotOpen:        false,
    explainabilityOpen: false,
    graphExplorerOpen:  false,
    commandPaletteOpen: false,
    activeView:         'command-center',
    activeMission:      null,
    earthLayer:         'optical' as EarthLayer,
    showMissionReport:  false,

    // ── Copilot ────────────────────────────────────────────────────────────
    messages:           [],
    isTyping:           false,
    suggestionsVisible: true,

    // ── Earth actions ──────────────────────────────────────────────────────
    setEarthLoaded:   (v) => set({ isLoaded: v }),
    setFocusedCoords: (c) => set({ focusedCoords: c }),
    toggleOrbits:     () => set((s) => ({ showOrbits: !s.showOrbits })),
    toggleHotspots:   () => set((s) => ({ showHotspots: !s.showHotspots })),

    // ── Search actions ─────────────────────────────────────────────────────
    setQuery:         (q) => set({ query: q }),
    setUploadedImage: (img) => set({ uploadedImage: img }),
    setBackendStatus: (v) => set({ backendAvailable: v }),

    addPipelineEvent: (event) => set((s) => ({
      pipelineEvents: [...s.pipelineEvents, event],
    })),
    clearPipelineEvents: () => set({ pipelineEvents: [] }),

    startSearch: () => {
      const { uploadedImage } = get()
      const file = uploadedImage?.file

      if (!file || !uploadedImage) {
        set({
          isSearching:   false,
          pipelineError: 'No image uploaded. Please upload a satellite image first.',
        })
        return
      }

      // Capture at search start — safe to use inside setTimeout closures
      const searchImage = uploadedImage

      set({
        isSearching:      true,
        searchComplete:   false,
        pipelineStage:    'metadata_extraction',
        pipelineProgress: 5,
        showArcs:         false,
        showPins:         false,
        dockOpen:         false,
        missionReport:    null,
        pipelineEvents:   [],
        showMissionReport:false,
        pipelineError:    null,
        currentMission:   null,
        missionGraphNodes:[],
        missionGraphEdges:[],
        missionTimeline:  [],
        missionAnalytics: null,
        queryThumbnailB64: null,
        results:          [],
        backendAvailable:  null,
      })

      // Track backend results (filled when response arrives before animation ends)
      let backendResults: RetrievalResult[] | null = null
      let backendSucceeded = false

      // ── Backend call (runs in parallel with animation) ─────────────────────
      runRetrieval(file, 10, {
        onLoading: () => { /* health check passed — animation handles progress */ },
        onComplete: (results, _raw: SearchResponse) => {
          backendResults = results
          backendSucceeded = true
        },
        onError: () => {
          backendSucceeded = false
          // Show "Simulation Mode" badge mid-animation if backend fails
          if (get().isSearching) set({ backendAvailable: false })
        },
      }).catch(() => {
        backendSucceeded = false
        if (get().isSearching) set({ backendAvailable: false })
      })

      // ── Staged pipeline animation ──────────────────────────────────────────
      // [stage, progress%, delay_ms from start]
      const STAGE_PLAN: Array<[FullPipelineStage, number, number]> = [
        ['metadata_extraction',   8,    0   ],
        ['preprocessing',        20,    850 ],
        ['feature_extraction',   34,   1600 ],
        ['embedding_generation', 49,   2850 ],
        ['semantic_search',      62,   3500 ],
        ['graph_reranking',      74,   4500 ],
        ['event_detection',      83,   5350 ],
        ['confidence_estimation', 91,  6100 ],
        ['report_generation',    97,   6750 ],
      ]

      STAGE_PLAN.forEach(([stage, progress, delay]) => {
        setTimeout(() => {
          if (get().isSearching) set({ pipelineStage: stage, pipelineProgress: progress })
        }, delay)
      })

      // ── Pipeline completion at ~7.6s ───────────────────────────────────────
      setTimeout(() => {
        if (!get().isSearching) return   // Aborted by resetSearch

        const finalResults = backendResults ?? mockResults
        const isDemo       = !backendSucceeded

        const missionData = _buildMissionData(searchImage, finalResults)

        const rawBasename = searchImage.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
        const missionSuffix = (rawBasename.toLowerCase() === 'images' || rawBasename.length < 3)
          ? 'Brahmaputra Basin'
          : rawBasename.slice(0, 26)

        const activeMissionObj: Mission = {
          id:          missionData.id,
          name:        `Flood Monitor · ${missionSuffix}`,
          description: 'Brahmaputra River Basin — active flood monitoring',
          createdAt:   missionData.created_at,
          resultCount: finalResults.length,
          queryImage:  searchImage,
        }

        set({
          pipelineStage:    'complete',
          pipelineProgress: 100,
          isSearching:      false,
          searchComplete:   true,
          results:          finalResults,
          showArcs:         true,
          showPins:         true,
          dockOpen:         true,
          activeView:       'results',
          currentMission:   missionData,
          missionGraphNodes: missionData.graph.nodes,
          missionGraphEdges: missionData.graph.edges,
          missionTimeline:  missionData.timeline,
          missionAnalytics: missionData.analytics,
          activeMission:    activeMissionObj,
          backendAvailable: !isDemo,
          pipelineError:    null,
          queryThumbnailB64: missionData.query_thumbnail_b64 || null,
        })
      }, 7650)
    },

    advancePipeline: () => {
      const { pipelineStage } = get()
      const idx = PIPELINE_STAGES.indexOf(pipelineStage as any)
      if (idx >= 0 && idx < PIPELINE_STAGES.length - 1) {
        set({ pipelineStage: PIPELINE_STAGES[idx + 1] as FullPipelineStage })
      }
    },

    resetSearch: () => set({
      pipelineStage:    'idle',
      pipelineProgress: 0,
      isSearching:      false,
      searchComplete:   false,
      results:          [],
      selectedResult:   null,
      showArcs:         false,
      showPins:         false,
      dockOpen:         false,
      missionReport:    null,
      pipelineEvents:   [],
      showMissionReport:false,
      pipelineError:    null,
      currentMission:   null,
      missionGraphNodes:[],
      missionGraphEdges:[],
      missionTimeline:  [],
      missionAnalytics: null,
      queryThumbnailB64: null,
      activeMission:    null,
      backendAvailable:  null,
    }),

    // ── Results actions ────────────────────────────────────────────────────
    setResults: (r) => set({ results: r }),
    selectResult: (r) => set({
      selectedResult: r,
      focusedCoords:  r?.location.coords ?? null,
    }),
    hoverResult: (r) => set({ hoveredResult: r }),
    setViewMode: (m) => set({ viewMode: m }),
    toggleDock:  () => set((s) => ({ dockOpen: !s.dockOpen })),
    addToCompare: (id) => set((s) => ({
      compareIds: s.compareIds.includes(id)
        ? s.compareIds
        : [...s.compareIds.slice(-1), id],
    })),
    removeFromCompare: (id) => set((s) => ({
      compareIds: s.compareIds.filter((c) => c !== id),
    })),
    setMissionReport: (report) => set({ missionReport: report }),

    // ── Mission actions ────────────────────────────────────────────────────
    setCurrentMission: (mission) => set({
      currentMission:    mission,
      missionGraphNodes: mission?.graph?.nodes ?? [],
      missionGraphEdges: mission?.graph?.edges ?? [],
      missionTimeline:   mission?.timeline ?? [],
      missionAnalytics:  mission?.analytics ?? null,
      queryThumbnailB64: mission?.query_thumbnail_b64 ?? null,
    }),

    // ── UI actions ─────────────────────────────────────────────────────────
    toggleLeftPanel:  () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
    toggleCopilot:    () => set((s) => ({
      copilotOpen:    !s.copilotOpen,
      rightPanelOpen: !s.copilotOpen ? true : s.rightPanelOpen,
    })),
    openExplainability: (result) => set({
      selectedResult:    result,
      explainabilityOpen:true,
      rightPanelOpen:    true,
    }),
    closeExplainability:() => set({ explainabilityOpen: false }),
    toggleGraphExplorer:() => set((s) => ({ graphExplorerOpen: !s.graphExplorerOpen })),
    setCommandPalette:  (open) => set({ commandPaletteOpen: open }),
    setActiveView:      (v) => set({ activeView: v }),
    setEarthLayer:      (layer) => set({ earthLayer: layer }),
    setShowMissionReport:(v) => set({ showMissionReport: v }),

    // ── Copilot actions ────────────────────────────────────────────────────
    addMessage:    (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    setTyping:     (v) => set({ isTyping: v }),
    clearMessages: () => set({ messages: [] }),
  }))
)
