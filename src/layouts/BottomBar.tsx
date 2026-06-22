import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import ResultsDock from '@/components/retrieval/ResultsDock'

const PLACEHOLDERS = [
  'Query satellite archives, describe a region, or upload imagery...',
  'Find flood-affected regions in the Brahmaputra basin...',
  'Retrieve optical equivalents of this SAR acquisition...',
  'Show agricultural zones with post-monsoon spectral signatures...',
]

export default function BottomBar() {
  const dockOpen      = useAppStore((s) => s.dockOpen)
  const toggleDock    = useAppStore((s) => s.toggleDock)
  const query         = useAppStore((s) => s.query)
  const setQuery      = useAppStore((s) => s.setQuery)
  const startSearch   = useAppStore((s) => s.startSearch)
  const isSearching   = useAppStore((s) => s.isSearching)
  const results       = useAppStore((s) => s.results)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const [focused, setFocused] = useState(false)

  const handleSearch = () => {
    if (!query.trim()) { setActiveView('search'); return }
    startSearch()
  }

  return (
    <motion.div
      className="fixed bottom-0 left-14 right-14 z-40"
      initial={false}
    >
      {/* Results dock */}
      <AnimatePresence>
        {dockOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.0, 0.0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ResultsDock />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command bar */}
      <div
        className="px-4 py-2.5 flex items-center gap-3"
        style={{
          background: 'rgba(7, 11, 20, 0.97)',
          borderTop: '1px solid rgba(45, 55, 72, 0.32)',
        }}
      >
        {/* Dock toggle */}
        {results.length > 0 && (
          <button
            onClick={toggleDock}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s transition-all flex-shrink-0 font-mono"
            style={{
              background: 'rgba(26,35,51,0.7)',
              border: '1px solid rgba(45,55,72,0.45)',
              color: '#94A3B8',
            }}
          >
            {dockOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            <span>{results.length} results</span>
          </button>
        )}

        {/* Query input */}
        <div
          className="flex-1 flex items-center gap-2.5 px-3.5 py-2 rounded-lg transition-all duration-150"
          style={{
            background: focused ? 'rgba(15, 32, 64, 0.5)' : 'rgba(26, 35, 51, 0.6)',
            border: focused
              ? '1px solid rgba(59, 130, 246, 0.45)'
              : '1px solid rgba(45, 55, 72, 0.4)',
          }}
        >
          <Search className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={PLACEHOLDERS[0]}
            className="flex-1 bg-transparent text-body-m text-text-primary placeholder:text-text-tertiary outline-none min-w-0"
          />
        </div>

        {/* Search action */}
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-body-s transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#3B82F6',
            color: '#fff',
            boxShadow: '0 1px 6px rgba(59,130,246,0.28)',
          }}
        >
          {isSearching ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5" />
          )}
          <span>{isSearching ? 'Searching…' : 'Search'}</span>
        </button>
      </div>
    </motion.div>
  )
}
