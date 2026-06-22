import { useRef } from 'react'
import { LayoutGrid, Globe, GitCompare, Clock, ArrowUpDown } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, cn } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'

const VIEW_TABS = [
  { id: 'gallery',  label: 'Intelligence', icon: LayoutGrid },
  { id: 'earth',    label: 'Earth',        icon: Globe      },
  { id: 'compare',  label: 'Compare',      icon: GitCompare },
  { id: 'timeline', label: 'Timeline',     icon: Clock      },
] as const

export default function ResultsDock() {
  const results       = useAppStore((s) => s.results)
  const viewMode      = useAppStore((s) => s.viewMode)
  const setViewMode   = useAppStore((s) => s.setViewMode)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const selectResult  = useAppStore((s) => s.selectResult)
  const selectedResult = useAppStore((s) => s.selectedResult)
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div
      style={{
        background: 'rgba(7, 11, 20, 0.97)',
        borderTop: '1px solid rgba(45, 55, 72, 0.32)',
      }}
    >
      {/* Dock header */}
      <div
        className="flex items-center gap-4 px-5 py-2.5"
        style={{ borderBottom: '1px solid rgba(45, 55, 72, 0.25)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-body-s text-text-primary font-medium">Retrieval Results</span>
          <span
            className="px-2 py-0.5 font-mono text-caption text-blue-primary"
            style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 4,
            }}
          >
            {results.length}
          </span>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-0.5">
          {VIEW_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setViewMode(id)
                setActiveView('results')
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption transition-all duration-150',
                viewMode === id ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
              )}
              style={viewMode === id ? { background: 'rgba(255,255,255,0.05)' } : {}}
            >
              <Icon className={cn('w-3 h-3', viewMode === id ? 'text-blue-primary' : '')} />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <button className="flex items-center gap-1.5 text-caption text-text-tertiary hover:text-text-secondary transition-colors">
            <ArrowUpDown className="w-3 h-3" />
            Similarity
          </button>
        </div>
      </div>

      {/* Scrollable compact cards */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 px-5 py-3 overflow-x-auto scrollbar-hide"
      >
        {results.map((r) => {
          const simColor  = getSimilarityColor(r.similarityScore)
          const isSelected = selectedResult?.id === r.id
          return (
            <button
              key={r.id}
              onClick={() => { selectResult(r); setActiveView('results') }}
              className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150"
              style={{
                background: isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(26,35,51,0.6)',
                border: isSelected ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(45,55,72,0.35)',
                minWidth: 200,
              }}
            >
              <img
                src={r.thumbnailUrl}
                alt={r.location.name}
                className="w-10 h-8 object-cover rounded flex-shrink-0"
              />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-caption text-text-primary font-medium truncate">{r.location.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <SensorChip type={r.sensorType} size="sm" />
                  <span className="font-mono text-caption font-semibold" style={{ color: simColor }}>
                    {r.similarityScore.toFixed(0)}%
                  </span>
                </div>
              </div>
            </button>
          )
        })}
        <div className="w-2 flex-shrink-0" />
      </div>
    </div>
  )
}
