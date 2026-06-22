import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  RetrievalResult, QueryImage, PipelineStage,
  ViewMode, CopilotMessage, Mission,
} from '@/types'
import { mockResults, mockQueryImage } from '@/data/mockResults'

interface EarthState {
  isLoaded: boolean
  isRotating: boolean
  focusedCoords: { lat: number; lng: number } | null
  showHotspots: boolean
  showOrbits: boolean
  showArcs: boolean
  showPins: boolean
}

interface SearchState {
  query: string
  uploadedImage: QueryImage | null
  pipelineStage: PipelineStage
  pipelineProgress: number
  isSearching: boolean
  searchComplete: boolean
}

interface ResultsState {
  results: RetrievalResult[]
  selectedResult: RetrievalResult | null
  hoveredResult: RetrievalResult | null
  viewMode: ViewMode
  dockOpen: boolean
  compareIds: string[]
}

interface UIState {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  copilotOpen: boolean
  explainabilityOpen: boolean
  graphExplorerOpen: boolean
  commandPaletteOpen: boolean
  activeView: 'command-center' | 'search' | 'results' | 'graph' | 'copilot' | 'analytics'
  activeMission: Mission | null
}

interface CopilotState {
  messages: CopilotMessage[]
  isTyping: boolean
  suggestionsVisible: boolean
}

interface AppStore extends EarthState, SearchState, ResultsState, UIState, CopilotState {
  // Earth actions
  setEarthLoaded: (v: boolean) => void
  setFocusedCoords: (c: { lat: number; lng: number } | null) => void
  toggleOrbits: () => void
  toggleHotspots: () => void

  // Search actions
  setQuery: (q: string) => void
  setUploadedImage: (img: QueryImage | null) => void
  startSearch: () => void
  advancePipeline: () => void
  resetSearch: () => void

  // Results actions
  setResults: (r: RetrievalResult[]) => void
  selectResult: (r: RetrievalResult | null) => void
  hoverResult: (r: RetrievalResult | null) => void
  setViewMode: (m: ViewMode) => void
  toggleDock: () => void
  addToCompare: (id: string) => void
  removeFromCompare: (id: string) => void

  // UI actions
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleCopilot: () => void
  openExplainability: (result: RetrievalResult) => void
  closeExplainability: () => void
  toggleGraphExplorer: () => void
  setCommandPalette: (open: boolean) => void
  setActiveView: (v: UIState['activeView']) => void

  // Copilot actions
  addMessage: (msg: CopilotMessage) => void
  setTyping: (v: boolean) => void
  clearMessages: () => void
}

const PIPELINE_STAGES: PipelineStage[] = [
  'feature_extraction',
  'cross_modal_alignment',
  'archive_search',
  'graph_reranking',
  'complete',
]

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // Earth
    isLoaded: false,
    isRotating: true,
    focusedCoords: null,
    showHotspots: true,
    showOrbits: true,
    showArcs: false,
    showPins: false,

    // Search
    query: '',
    uploadedImage: null,
    pipelineStage: 'idle',
    pipelineProgress: 0,
    isSearching: false,
    searchComplete: false,

    // Results
    results: [],
    selectedResult: null,
    hoveredResult: null,
    viewMode: 'gallery',
    dockOpen: false,
    compareIds: [],

    // UI
    leftPanelOpen: false,
    rightPanelOpen: false,
    copilotOpen: false,
    explainabilityOpen: false,
    graphExplorerOpen: false,
    commandPaletteOpen: false,
    activeView: 'command-center',
    activeMission: null,

    // Copilot
    messages: [],
    isTyping: false,
    suggestionsVisible: true,

    // Earth actions
    setEarthLoaded: (v) => set({ isLoaded: v }),
    setFocusedCoords: (c) => set({ focusedCoords: c }),
    toggleOrbits: () => set((s) => ({ showOrbits: !s.showOrbits })),
    toggleHotspots: () => set((s) => ({ showHotspots: !s.showHotspots })),

    // Search actions
    setQuery: (q) => set({ query: q }),
    setUploadedImage: (img) => set({ uploadedImage: img }),

    startSearch: () => {
      set({
        isSearching: true,
        searchComplete: false,
        pipelineStage: 'feature_extraction',
        pipelineProgress: 0,
        showArcs: false,
        showPins: false,
        dockOpen: false,
      })

      let stageIndex = 0
      const advance = () => {
        stageIndex++
        if (stageIndex >= PIPELINE_STAGES.length) {
          set({
            pipelineStage: 'complete',
            pipelineProgress: 100,
            isSearching: false,
            searchComplete: true,
            results: mockResults,
            showArcs: true,
            showPins: true,
            dockOpen: true,
            activeView: 'results',
          })
          return
        }
        set({
          pipelineStage: PIPELINE_STAGES[stageIndex],
          pipelineProgress: (stageIndex / (PIPELINE_STAGES.length - 1)) * 100,
        })
        const delay = [1800, 2200, 1600, 1400][stageIndex - 1] ?? 1500
        setTimeout(advance, delay)
      }
      setTimeout(advance, 1800)
    },

    advancePipeline: () => {
      const { pipelineStage } = get()
      const idx = PIPELINE_STAGES.indexOf(pipelineStage)
      if (idx < PIPELINE_STAGES.length - 1) {
        set({ pipelineStage: PIPELINE_STAGES[idx + 1] })
      }
    },

    resetSearch: () => set({
      pipelineStage: 'idle',
      pipelineProgress: 0,
      isSearching: false,
      searchComplete: false,
      results: [],
      selectedResult: null,
      showArcs: false,
      showPins: false,
      dockOpen: false,
    }),

    // Results actions
    setResults: (r) => set({ results: r }),
    selectResult: (r) => set({
      selectedResult: r,
      focusedCoords: r?.location.coords ?? null,
    }),
    hoverResult: (r) => set({ hoveredResult: r }),
    setViewMode: (m) => set({ viewMode: m }),
    toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
    addToCompare: (id) => set((s) => ({
      compareIds: s.compareIds.includes(id)
        ? s.compareIds
        : [...s.compareIds.slice(-1), id],
    })),
    removeFromCompare: (id) => set((s) => ({
      compareIds: s.compareIds.filter((c) => c !== id),
    })),

    // UI actions
    toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
    toggleCopilot: () => set((s) => ({
      copilotOpen: !s.copilotOpen,
      rightPanelOpen: !s.copilotOpen ? true : s.rightPanelOpen,
    })),
    openExplainability: (result) => set({
      selectedResult: result,
      explainabilityOpen: true,
      rightPanelOpen: true,
    }),
    closeExplainability: () => set({ explainabilityOpen: false }),
    toggleGraphExplorer: () => set((s) => ({ graphExplorerOpen: !s.graphExplorerOpen })),
    setCommandPalette: (open) => set({ commandPaletteOpen: open }),
    setActiveView: (v) => set({ activeView: v }),

    // Copilot actions
    addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    setTyping: (v) => set({ isTyping: v }),
    clearMessages: () => set({ messages: [] }),
  }))
)
