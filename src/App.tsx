import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import AppLayout from '@/layouts/AppLayout'
import CommandCenter from '@/pages/CommandCenter'
import SearchWorkspace from '@/pages/SearchWorkspace'
import RetrievalResults from '@/pages/RetrievalResults'
import GeoSemanticGraphPage from '@/pages/GeoSemanticGraphPage'
import AICopilotPage from '@/pages/AICopilotPage'
import Analytics from '@/pages/Analytics'
import SatelliteTracker from '@/pages/SatelliteTracker'
import GraphExplorer from '@/components/graph/GraphExplorer'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import IntelligenceReveal from '@/components/ui/IntelligenceReveal'

const PAGE_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }

function AppInner() {
  const activeView       = useAppStore((s) => s.activeView)
  const graphExplorerOpen = useAppStore((s) => s.graphExplorerOpen)

  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        {activeView === 'command-center' && (
          <motion.div key="command-center" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <CommandCenter />
          </motion.div>
        )}
        {activeView === 'search' && (
          <motion.div key="search" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <SearchWorkspace />
          </motion.div>
        )}
        {activeView === 'results' && (
          <motion.div key="results" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <RetrievalResults />
          </motion.div>
        )}
        {activeView === 'graph' && (
          <motion.div key="graph" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <GeoSemanticGraphPage />
          </motion.div>
        )}
        {activeView === 'copilot' && (
          <motion.div key="copilot" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <AICopilotPage />
          </motion.div>
        )}
        {activeView === 'analytics' && (
          <motion.div key="analytics" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <Analytics />
          </motion.div>
        )}
        {activeView === 'satellite-tracker' && (
          <motion.div key="satellite-tracker" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={PAGE_TRANSITION}>
            <SatelliteTracker />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {graphExplorerOpen && activeView !== 'graph' && (
          <GraphExplorer />
        )}
      </AnimatePresence>

      <IntelligenceReveal />
    </AppLayout>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  )
}
