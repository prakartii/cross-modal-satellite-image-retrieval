import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import AppLayout from '@/layouts/AppLayout'
import CommandCenter from '@/pages/CommandCenter'
import SearchWorkspace from '@/pages/SearchWorkspace'
import RetrievalResults from '@/pages/RetrievalResults'
import GeoSemanticGraphPage from '@/pages/GeoSemanticGraphPage'
import AICopilotPage from '@/pages/AICopilotPage'
import Analytics from '@/pages/Analytics'
import GraphExplorer from '@/components/graph/GraphExplorer'
import AppErrorBoundary from '@/components/AppErrorBoundary'

function AppInner() {
  const activeView = useAppStore((s) => s.activeView)
  const graphExplorerOpen = useAppStore((s) => s.graphExplorerOpen)

  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        {activeView === 'command-center' && (
          <motion.div key="command-center" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <CommandCenter />
          </motion.div>
        )}
        {activeView === 'search' && (
          <motion.div key="search" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <SearchWorkspace />
          </motion.div>
        )}
        {activeView === 'results' && (
          <motion.div key="results" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <RetrievalResults />
          </motion.div>
        )}
        {activeView === 'graph' && (
          <motion.div key="graph" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <GeoSemanticGraphPage />
          </motion.div>
        )}
        {activeView === 'copilot' && (
          <motion.div key="copilot" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <AICopilotPage />
          </motion.div>
        )}
        {activeView === 'analytics' && (
          <motion.div key="analytics" className="w-full h-full"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>
            <Analytics />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Graph explorer overlay — can be triggered from any page */}
      <AnimatePresence>
        {graphExplorerOpen && activeView !== 'graph' && (
          <GraphExplorer />
        )}
      </AnimatePresence>
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
