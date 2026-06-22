import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Upload, SlidersHorizontal, Satellite,
  Clock, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const PANEL_ITEMS = [
  { id: 'search',  icon: Search,            label: 'Search & Query'   },
  { id: 'upload',  icon: Upload,            label: 'Upload Imagery'   },
  { id: 'filters', icon: SlidersHorizontal, label: 'Filters'          },
  { id: 'sensors', icon: Satellite,         label: 'Sensor Selection' },
  { id: 'history', icon: Clock,             label: 'Mission History'  },
]

interface LeftPanelProps {
  activeSection: string
  onSectionChange: (id: string) => void
}

export default function LeftPanel({ activeSection, onSectionChange }: LeftPanelProps) {
  const leftPanelOpen    = useAppStore((s) => s.leftPanelOpen)
  const toggleLeftPanel  = useAppStore((s) => s.toggleLeftPanel)
  const setActiveView    = useAppStore((s) => s.setActiveView)

  const handleItemClick = (id: string) => {
    onSectionChange(id)
    if (!leftPanelOpen) toggleLeftPanel()
    if (id === 'upload' || id === 'search') setActiveView('search')
  }

  return (
    <motion.aside
      className="fixed left-0 top-13 bottom-0 z-40 flex"
      initial={false}
    >
      {/* Icon rail */}
      <div
        className="w-14 flex flex-col items-center py-3 gap-0.5 flex-shrink-0"
        style={{
          background: 'rgba(8, 13, 22, 0.97)',
          borderRight: '1px solid rgba(45, 55, 72, 0.35)',
        }}
      >
        {PANEL_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleItemClick(id)}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150',
              activeSection === id && leftPanelOpen
                ? 'text-blue-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
            style={
              activeSection === id && leftPanelOpen
                ? { background: 'rgba(59,130,246,0.12)' }
                : undefined
            }
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      {/* Expandable panel */}
      <AnimatePresence>
        {leftPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex-shrink-0"
            style={{
              background: 'rgba(10, 15, 26, 0.96)',
              borderRight: '1px solid rgba(45, 55, 72, 0.35)',
            }}
          >
            <div className="w-[272px] h-full flex flex-col">
              <div
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}
              >
                <span className="overline-label">
                  {PANEL_ITEMS.find(p => p.id === activeSection)?.label ?? 'Panel'}
                </span>
                <button
                  onClick={toggleLeftPanel}
                  className="btn-ghost p-1"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5">
                <LeftPanelContent activeSection={activeSection} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

function LeftPanelContent({ activeSection }: { activeSection: string }) {
  if (activeSection === 'search')  return <SearchSection />
  if (activeSection === 'filters') return <FiltersSection />
  if (activeSection === 'sensors') return <SensorsSection />
  return <SearchSection />
}

function SearchSection() {
  const setQuery      = useAppStore((s) => s.setQuery)
  const query         = useAppStore((s) => s.query)
  const setActiveView = useAppStore((s) => s.setActiveView)

  return (
    <div className="space-y-5">
      <div>
        <label className="overline-label block mb-2.5">Natural Language Query</label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find flood-affected regions in the Brahmaputra basin..."
          className="input-field w-full h-24 resize-none text-body-s leading-relaxed"
        />
      </div>
      <button
        onClick={() => setActiveView('search')}
        className="btn-primary w-full"
      >
        Open Search Workspace
      </button>
    </div>
  )
}

function FiltersSection() {
  return (
    <div className="space-y-6">
      <div>
        <label className="overline-label block mb-3">Sensor Type</label>
        <div className="space-y-2.5">
          {['SAR', 'Optical', 'Multispectral'].map((s) => (
            <label key={s} className="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-blue-primary" />
              <span className="text-body-s text-text-secondary group-hover:text-text-primary transition-colors">{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="overline-label">Cloud Cover</label>
          <span className="mono-value">50%</span>
        </div>
        <input type="range" min="0" max="100" defaultValue="50" className="w-full accent-blue-primary" />
      </div>

      <div>
        <label className="overline-label block mb-3">Temporal Range</label>
        <div className="space-y-2">
          <input type="date" defaultValue="2020-01-01" className="input-field w-full text-body-s" />
          <input type="date" defaultValue="2026-06-22" className="input-field w-full text-body-s" />
        </div>
      </div>

      <div>
        <label className="overline-label block mb-3">Result Count</label>
        <div className="flex gap-1.5">
          {[5, 10, 20, 50].map((n) => (
            <button
              key={n}
              className={cn(
                'flex-1 py-1.5 text-body-s rounded-md border transition-all',
                n === 10
                  ? 'text-blue-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
              style={
                n === 10
                  ? { background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)' }
                  : { background: 'transparent', borderColor: 'rgba(45,55,72,0.5)' }
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SensorsSection() {
  const sensors = [
    { name: 'RISAT-2B',        type: 'SAR',           agency: 'ISRO', active: true  },
    { name: 'Sentinel-1A/B',   type: 'SAR',           agency: 'ESA',  active: true  },
    { name: 'ALOS-2 PALSAR-2', type: 'SAR',           agency: 'JAXA', active: true  },
    { name: 'Cartosat-3',      type: 'Optical',       agency: 'ISRO', active: true  },
    { name: 'Sentinel-2A/B',   type: 'Optical',       agency: 'ESA',  active: true  },
    { name: 'Landsat-9 OLI-2', type: 'Multispectral', agency: 'USGS', active: false },
    { name: 'ResourceSat-2A',  type: 'Multispectral', agency: 'ISRO', active: true  },
  ]

  return (
    <div>
      <div className="overline-label mb-4">Active Sensors</div>
      <div>
        {sensors.map((s) => (
          <div
            key={s.name}
            className="data-row"
          >
            <div>
              <div className="text-body-s text-text-primary font-medium">{s.name}</div>
              <div className="text-caption text-text-tertiary mt-0.5">{s.agency} · {s.type}</div>
            </div>
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: s.active ? '#22C55E' : '#4A5568' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
