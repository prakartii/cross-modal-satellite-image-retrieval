import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Command, HelpCircle, ChevronDown,
  Globe, Satellite, LayoutGrid, Network, BarChart2, Radio,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'command-center',    label: 'Command Center',     icon: Globe       },
  { id: 'search',            label: 'Intelligence Search', icon: Satellite   },
  { id: 'results',           label: 'Retrieved Scenes',   icon: LayoutGrid  },
  { id: 'graph',             label: 'Semantic Graph',     icon: Network     },
  { id: 'analytics',         label: 'Mission Intel',      icon: BarChart2   },
  { id: 'satellite-tracker', label: 'Sat. Tracker',       icon: Radio       },
] as const

export default function TopBar() {
  const activeView        = useAppStore((s) => s.activeView)
  const setActiveView     = useAppStore((s) => s.setActiveView)
  const setCommandPalette = useAppStore((s) => s.setCommandPalette)
  const activeMission     = useAppStore((s) => s.activeMission)
  const currentMission    = useAppStore((s) => s.currentMission)
  const uploadedImage     = useAppStore((s) => s.uploadedImage)
  const isSearching       = useAppStore((s) => s.isSearching)
  const searchComplete    = useAppStore((s) => s.searchComplete)
  const backendAvailable  = useAppStore((s) => s.backendAvailable)
  const [missionDropdown, setMissionDropdown] = useState(false)

  const missionLabel =
    activeMission?.name
    ?? (isSearching   ? 'Processing…'
      : uploadedImage ? `${uploadedImage.name.split('.')[0].slice(0, 26)} — Ready`
      : 'No mission active')

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-13 topbar-glass">
      <div className="flex items-center h-full px-5 gap-5">

        {/* Wordmark — AKSHA */}
        <button
          onClick={() => setActiveView('command-center')}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity flex-shrink-0"
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}
          >
            <Globe className="w-3.5 h-3.5 text-blue-primary" />
          </div>
          <span className="font-display font-bold text-sm tracking-tight">
            <span className="text-text-primary">AKSHA</span>
          </span>
          <span className="text-overline text-text-tertiary tracking-widest hidden xl:block">
            EARTH INTELLIGENCE
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(45,55,72,0.6)' }} />

        {/* Primary nav */}
        <nav className="flex items-center gap-0.5 flex-shrink-0">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as typeof activeView)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 text-body-s rounded-md transition-all duration-150 font-medium',
                activeView === id
                  ? 'text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
              style={activeView === id ? { background: 'rgba(255,255,255,0.05)' } : {}}
            >
              <Icon className={cn('w-3.5 h-3.5', activeView === id ? 'text-blue-primary' : '')} />
              {label}
              {activeView === id && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute bottom-0 left-3 right-3 h-px rounded-full"
                  style={{ background: '#3B82F6' }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Mission selector */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMissionDropdown(!missionDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-body-s transition-all duration-150"
            style={{ background: 'rgba(26,35,51,0.8)', border: '1px solid rgba(45,55,72,0.5)' }}
          >
            <div className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              isSearching          ? 'bg-warning animate-pulse' :
              searchComplete       ? 'bg-success' :
              uploadedImage        ? 'bg-blue-primary' : 'bg-text-tertiary'
            )} />
            <span className="text-text-secondary font-medium truncate max-w-[200px]">
              {missionLabel}
            </span>
            <ChevronDown className="w-3 h-3 text-text-tertiary" />
          </button>
        </div>

        {/* ISRO BHUVAN / backend status */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {backendAvailable === false ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
              <span className="text-overline tracking-widest" style={{ color: '#F59E0B' }}>DEMO MODE</span>
            </>
          ) : (
            <>
              {/* Heartbeat blink at 1.2 s — matches human resting heart rate */}
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: '#14B8A6', flexShrink: 0,
                boxShadow: '0 0 6px rgba(20,184,166,0.6)',
                animation: 'heartbeat 1.2s ease-in-out infinite',
              }} />
              <span className="text-overline text-text-tertiary tracking-widest">LIVE</span>
              <span className="text-overline tracking-widest" style={{ color: '#2D3748' }}>·</span>
              <span className="text-overline text-text-tertiary tracking-widest">BHUVAN</span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-4 flex-shrink-0" style={{ background: 'rgba(45,55,72,0.5)' }} />

        {/* Command palette trigger */}
        <button
          onClick={() => setCommandPalette(true)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-body-s transition-all duration-150 flex-shrink-0"
          style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)' }}
        >
          <Command className="w-3 h-3 text-text-tertiary" />
          <span className="text-text-tertiary font-mono text-caption">K</span>
        </button>

        <button className="btn-ghost p-1.5 flex-shrink-0">
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
