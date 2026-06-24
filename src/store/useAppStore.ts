import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  RetrievalResult, QueryImage, FullPipelineStage,
  ViewMode, CopilotMessage, Mission, MissionReport, PipelineStageData,
  MissionData, MissionAnalytics, MissionTimelineItem, GraphNode, GraphEdge,
} from '@/types'
import { runPipeline, PIPELINE_STAGES } from '@/services/pipeline'

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

      set({
        isSearching:      true,
        searchComplete:   false,
        pipelineStage:    'metadata_extraction',
        pipelineProgress: 0,
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
      })

      if (!file) {
        set({
          isSearching:   false,
          pipelineError: 'No image uploaded. Please upload a satellite image first.',
        })
        return
      }

      runPipeline(
        file,
        uploadedImage?.sensorType,
        {
          onStage: (stage, progress, data) => {
            const now = new Date().toISOString()
            set({
              pipelineStage:    stage,
              pipelineProgress: progress,
            })
            get().addPipelineEvent({
              stage,
              progress,
              message:   String((data as any)?.message ?? stage),
              result:    (data as any)?.result as Record<string, unknown> | undefined,
              timestamp: now,
            })
          },

          onComplete: (results, report, rawData) => {
            const raw = rawData as Record<string, unknown>

            // Extract mission data from the backend "complete" event
            const missionData: MissionData = {
              id:                   String(raw.mission_id ?? 'AKSHA-UNKNOWN'),
              created_at:           new Date().toISOString(),
              filename:             uploadedImage?.name ?? '',
              query_thumbnail_b64:  String(raw.query_thumbnail_b64 ?? ''),
              metadata:             (raw.metadata as Record<string, unknown>) ?? {},
              preprocessing:        (raw.preprocessing as Record<string, unknown>) ?? {},
              features:             (raw.features as Record<string, number>) ?? {},
              feature_vector:       (raw.feature_vector as number[]) ?? [],
              feature_vector_names: (raw.feature_vector_names as string[]) ?? [],
              scene_type:           String(raw.scene_type ?? 'unknown'),
              embedding:            (raw.embedding as number[]) ?? [],
              retrieval_results:    results,
              graph:                (raw.graph as any) ?? { nodes: [], edges: [], stats: {} },
              events:               (raw.events as any[]) ?? [],
              confidence:           (raw.confidence as any) ?? {},
              timeline:             (raw.timeline as any[]) ?? [],
              analytics:            (raw.analytics as any) ?? {} as MissionAnalytics,
              report:               report as any,
              logs:                 (raw.logs as any[]) ?? [],
            }

            set({
              pipelineStage:    'complete',
              pipelineProgress: 100,
              isSearching:      false,
              searchComplete:   true,
              results:          results,
              missionReport:    report,
              showArcs:         true,
              showPins:         true,
              dockOpen:         true,
              activeView:       'results',
              showMissionReport:true,

              // Populate the Mission-centric state (consumed by all pages)
              currentMission:    missionData,
              missionGraphNodes: missionData.graph?.nodes ?? [],
              missionGraphEdges: missionData.graph?.edges ?? [],
              missionTimeline:   missionData.timeline ?? [],
              missionAnalytics:  missionData.analytics ?? null,
              queryThumbnailB64: missionData.query_thumbnail_b64 || null,
            })

            // Focus the Earth globe on the query image coordinates
            const coords = (missionData.metadata as any)?.coordinates
            if (coords?.lat && coords?.lng) {
              set({ focusedCoords: { lat: coords.lat, lng: coords.lng } })
            }
          },

          onError: (message) => {
            // ARCHITECTURE NOTE: We do NOT fall back to mock data.
            // The error message tells the user to start the backend.
            // This is correct for a disaster monitoring system.
            set({
              isSearching:   false,
              pipelineStage: 'idle',
              pipelineError: message,
              searchComplete:false,
            })
          },
        },
      ).catch((err) => {
        set({
          isSearching:   false,
          pipelineError: String(err),
          searchComplete:false,
        })
      })
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
