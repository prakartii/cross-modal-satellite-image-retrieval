import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, BarChart3, FolderOpen, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import ExplainabilityPanel from '@/components/explainability/ExplainabilityPanel'
import CopilotPanel from '@/components/copilot/CopilotPanel'

const PANEL_ITEMS = [
  { id: 'copilot',  icon: Sparkles,   label: 'AI Copilot'   },
  { id: 'insights', icon: BarChart3,  label: 'Insights'     },
  { id: 'missions', icon: FolderOpen, label: 'Missions'     },
]

interface RightPanelProps {
  activeSection: string
  onSectionChange: (id: string) => void
}

export default function RightPanel({ activeSection, onSectionChange }: RightPanelProps) {
  const rightPanelOpen    = useAppStore((s) => s.rightPanelOpen)
  const toggleRightPanel  = useAppStore((s) => s.toggleRightPanel)
  const copilotOpen       = useAppStore((s) => s.copilotOpen)
  const toggleCopilot     = useAppStore((s) => s.toggleCopilot)
  const explainabilityOpen = useAppStore((s) => s.explainabilityOpen)
  const closeExplainability = useAppStore((s) => s.closeExplainability)
  const selectedResult    = useAppStore((s) => s.selectedResult)

  const showExplainability = explainabilityOpen && selectedResult

  const handleItemClick = (id: string) => {
    onSectionChange(id)
    if (id === 'copilot') {
      toggleCopilot()
    } else {
      if (!rightPanelOpen) toggleRightPanel()
    }
  }

  const panelBg = {
    background: 'rgba(10, 15, 26, 0.96)',
    borderLeft: '1px solid rgba(45, 55, 72, 0.35)',
  }

  return (
    <motion.aside className="fixed right-0 top-13 bottom-0 z-40 flex flex-row-reverse" initial={false}>
      {/* Icon rail */}
      <div
        className="w-14 flex flex-col items-center py-3 gap-0.5 flex-shrink-0"
        style={{
          background: 'rgba(8, 13, 22, 0.97)',
          borderLeft: '1px solid rgba(45, 55, 72, 0.35)',
        }}
      >
        {PANEL_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleItemClick(id)}
            title={label}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150',
              (activeSection === id && rightPanelOpen) || (id === 'copilot' && copilotOpen)
                ? 'text-blue-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
            style={
              (activeSection === id && rightPanelOpen) || (id === 'copilot' && copilotOpen)
                ? { background: 'rgba(59,130,246,0.12)' }
                : undefined
            }
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      {/* Explainability panel */}
      <AnimatePresence>
        {showExplainability && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex-shrink-0"
            style={panelBg}
          >
            <div className="w-[380px] h-full flex flex-col">
              <PanelHeader
                title="Explainability"
                onClose={closeExplainability}
              />
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <ExplainabilityPanel result={selectedResult} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Copilot panel */}
      <AnimatePresence>
        {copilotOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex-shrink-0"
            style={panelBg}
          >
            <div className="w-[360px] h-full flex flex-col">
              <PanelHeader
                title="AI Earth Copilot"
                icon={<Sparkles className="w-3.5 h-3.5 text-teal-primary" />}
                onClose={toggleCopilot}
              />
              <CopilotPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generic right panel */}
      <AnimatePresence>
        {rightPanelOpen && !copilotOpen && !showExplainability && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden flex-shrink-0"
            style={panelBg}
          >
            <div className="w-[300px] h-full flex flex-col">
              <PanelHeader
                title={PANEL_ITEMS.find(p => p.id === activeSection)?.label ?? 'Insights'}
                onClose={toggleRightPanel}
              />
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5">
                <InsightsContent />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

function PanelHeader({
  title,
  icon,
  onClose,
}: {
  title: string
  icon?: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="overline-label">{title}</span>
      </div>
      <button onClick={onClose} className="btn-ghost p-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function InsightsContent() {
  const results = useAppStore((s) => s.results)

  return (
    <div className="space-y-6">
      <div>
        <div className="overline-label mb-3">Archive Status</div>
        <div>
          {[
            { label: 'Total Observations', value: '2.48M',  color: 'text-text-primary' },
            { label: 'SAR Coverage',        value: '891K',   color: 'text-blue-primary' },
            { label: 'Optical Coverage',    value: '1.25M',  color: 'text-success' },
            { label: 'Multispectral',       value: '345K',   color: 'text-warning' },
          ].map(({ label, value, color }) => (
            <div key={label} className="data-row">
              <span className="text-body-s text-text-secondary">{label}</span>
              <span className={cn('font-mono text-caption font-medium', color)}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <div>
          <div className="overline-label mb-3">Current Retrieval</div>
          <div>
            {[
              { label: 'Results',    value: `${results.length} matches`,                                        color: 'text-text-primary' },
              { label: 'Top Score',  value: `${results[0]?.similarityScore.toFixed(1)}%`,                      color: 'text-blue-primary' },
              { label: 'Avg Score',  value: `${(results.reduce((a, r) => a + r.similarityScore, 0) / results.length).toFixed(1)}%`, color: 'text-text-secondary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="data-row">
                <span className="text-body-s text-text-secondary">{label}</span>
                <span className={cn('font-mono text-caption font-medium', color)}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="overline-label mb-3">Ground Stations</div>
        <div className="space-y-2.5">
          {['ISTRAC Bangalore', 'SAC Ahmedabad', 'NRSC Hyderabad'].map((gs) => (
            <div key={gs} className="flex items-center gap-2.5">
              <div className="status-live" />
              <span className="text-body-s text-text-secondary">{gs}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
