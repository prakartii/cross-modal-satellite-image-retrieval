import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, Globe, GitCompare, Clock } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import GalleryView from '@/components/retrieval/GalleryView'
import TimelineView from '@/components/retrieval/TimelineView'
import ComparisonView from '@/components/retrieval/ComparisonView'
import { cn } from '@/lib/utils'

const VIEW_TABS = [
  { id: 'gallery',  label: 'Intelligence View',    icon: LayoutGrid },
  { id: 'earth',    label: 'Earth View',            icon: Globe      },
  { id: 'compare',  label: 'Sensor Fusion Swipe',  icon: GitCompare },
  { id: 'timeline', label: 'Intelligence Timeline', icon: Clock      },
] as const

export default function RetrievalResults() {
  const viewMode         = useAppStore((s) => s.viewMode)
  const setViewMode      = useAppStore((s) => s.setViewMode)
  const results          = useAppStore((s) => s.results)
  const activeMission    = useAppStore((s) => s.activeMission)
  const missionAnalytics = useAppStore((s) => s.missionAnalytics)
  const backendAvailable = useAppStore((s) => s.backendAvailable)

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-heading-3 text-text-secondary mb-2 font-semibold">No results</div>
          <div className="text-body-s text-text-tertiary">Upload an image on the Search screen to retrieve results</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* View mode bar */}
      <div
        className="flex items-center gap-1 px-5 py-2 flex-shrink-0"
        style={{
          background: 'rgba(7, 11, 20, 0.97)',
          borderBottom: '1px solid rgba(45, 55, 72, 0.3)',
        }}
      >
        {VIEW_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setViewMode(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s transition-all duration-150 font-medium',
              viewMode === id
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
            style={viewMode === id ? { background: 'rgba(255,255,255,0.05)' } : {}}
          >
            <Icon className={cn('w-3.5 h-3.5', viewMode === id ? 'text-blue-primary' : '')} />
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {activeMission && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-primary flex-shrink-0" />
              <span className="text-caption text-text-secondary font-medium truncate max-w-[220px]">
                {activeMission.name}
              </span>
            </div>
          )}
          {backendAvailable === false && (
            <span className="text-overline px-2 py-0.5 rounded font-medium"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
              DEMO MODE
            </span>
          )}
          {missionAnalytics && (
            <span className="font-mono text-caption" style={{ color: '#22C55E' }}>
              {missionAnalytics.confidence.overall}% confidence
            </span>
          )}
          <span className="font-mono text-caption text-text-tertiary">
            <span className="text-text-primary">{results.length}</span> archive scenes
          </span>
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'gallery' && (
            <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <GalleryView />
            </motion.div>
          )}
          {viewMode === 'earth' && (
            <motion.div key="earth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <EarthGlobe />
            </motion.div>
          )}
          {viewMode === 'compare' && (
            <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <ComparisonView />
            </motion.div>
          )}
          {viewMode === 'timeline' && (
            <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <TimelineView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
