import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Satellite } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import { archiveStats } from '@/data/mockResults'
import { globeHotspots } from '@/data/satellites'

const MISSION_FEED = [
  { text: 'Flood signature detected',         sub: 'Brahmaputra Basin, Assam',   ago: '2m',  color: '#EF4444' },
  { text: 'SAR batch ingested — 847 scenes',  sub: 'RISAT-2B · ISTRAC Bangalore', ago: '12m', color: '#3B82F6' },
  { text: 'Retrieval complete · 94.2% match', sub: 'Query RISAT-2B_SAR_240912',  ago: '1h',  color: '#14B8A6' },
  { text: 'Sentinel-1A overpass commenced',   sub: 'NE India corridor',           ago: '2h',  color: '#22C55E' },
  { text: 'Cloud cover alert · 78%',          sub: 'Tamil Nadu coast',            ago: '3h',  color: '#F59E0B' },
  { text: 'Cartosat-3 optical acquired',      sub: 'Mumbai Metropolitan Region',  ago: '4h',  color: '#3B82F6' },
]

const ACTIVE_SENSORS = [
  { name: 'RISAT-2B',        agency: 'ISRO', mode: 'FRS-1',   pass: '4m',    live: true  },
  { name: 'Sentinel-1A',     agency: 'ESA',  mode: 'IW',      pass: '14:32', live: true  },
  { name: 'Cartosat-3',      agency: 'ISRO', mode: 'PAN',     pass: 'NOW',   live: true  },
  { name: 'ALOS-2 PALSAR-2', agency: 'JAXA', mode: 'SM',      pass: '42m',   live: false },
  { name: 'Sentinel-2A',     agency: 'ESA',  mode: 'MSI L2A', pass: '1h 8m', live: true  },
]

const HOTSPOT_COLORS: Record<string, string> = {
  flood: '#3B82F6', agriculture: '#22C55E',
  urban: '#F59E0B', disaster: '#EF4444', monitoring: '#14B8A6',
}

const fadeSlideLeft = {
  initial: { opacity: 0, x: -18 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
}
const fadeSlideRight = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
}

export default function CommandCenter() {
  const isLoaded       = useAppStore((s) => s.isLoaded)
  const setEarthLoaded = useAppStore((s) => s.setEarthLoaded)
  const setActiveView  = useAppStore((s) => s.setActiveView)
  const toggleCopilot  = useAppStore((s) => s.toggleCopilot)
  const toggleOrbits   = useAppStore((s) => s.toggleOrbits)
  const toggleHotspots = useAppStore((s) => s.toggleHotspots)
  const showOrbits     = useAppStore((s) => s.showOrbits)
  const showHotspots   = useAppStore((s) => s.showHotspots)
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setEarthLoaded(true), 5000)
    return () => clearTimeout(t)
  }, [setEarthLoaded])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const now    = new Date()
  const utcStr = now.toUTCString().slice(17, 25)

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── Earth — fills viewport ─────────────────────────────── */}
      <div className="absolute inset-0">
        <EarthGlobe />
      </div>

      {/* ── Loading screen ─────────────────────────────────────── */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-50"
            style={{ background: '#0B1220' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.75, ease: [0, 0, 0.2, 1] }}
              className="flex flex-col items-center gap-7"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center relative"
                style={{ border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.06)' }}
              >
                <div
                  className="absolute inset-1 rounded-full border animate-spin"
                  style={{
                    borderColor: 'rgba(59,130,246,0.15)',
                    borderTopColor: '#3B82F6',
                  }}
                />
              </div>
              <div className="text-center">
                <div className="font-display text-display-xl font-bold text-text-primary tracking-tight">
                  TerraBridge X
                </div>
                <div className="text-body-m text-text-tertiary mt-1.5">
                  Earth Intelligence Operating System
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-teal-primary animate-pulse" />
                <span className="text-caption text-text-tertiary">Initializing ISRO Bhuvan connection…</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Globe overlays ─────────────────────────────────────── */}
      <AnimatePresence>
        {isLoaded && (
          <>
            {/* ── Left: Archive Status + Mission Feed ────────── */}
            <motion.div
              {...fadeSlideLeft}
              transition={{ ...fadeSlideLeft.transition, delay: 0.3 }}
              className="absolute top-3 left-16 w-56 flex flex-col gap-2 z-10"
            >
              {/* Archive stats */}
              <div className="glass-panel rounded-xl px-4 py-3.5">
                <div className="overline-label mb-3">Archive Status</div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="font-mono font-bold text-heading-2 text-text-primary">
                    {(archiveStats.totalObservations / 1_000_000).toFixed(2)}M
                  </span>
                  <span className="text-caption text-text-tertiary">observations</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'SAR',          count: archiveStats.sarCount,           color: '#3B82F6' },
                    { label: 'Optical',       count: archiveStats.opticalCount,       color: '#22C55E' },
                    { label: 'Multispectral', count: archiveStats.multispectralCount, color: '#F59E0B' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span className="text-caption text-text-tertiary">{label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: Math.round((count / archiveStats.totalObservations) * 40),
                            background: color,
                            opacity: 0.5,
                          }}
                        />
                        <span className="font-mono text-caption" style={{ color }}>
                          {(count / 1000).toFixed(0)}K
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mission feed */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Mission Feed</div>
                  <div className="status-live" />
                </div>
                {MISSION_FEED.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white-3 cursor-pointer"
                    style={i < MISSION_FEED.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                      style={{ background: item.color, boxShadow: i === 0 ? `0 0 5px ${item.color}88` : 'none' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary leading-snug">{item.text}</div>
                      <div className="text-overline text-text-tertiary mt-0.5 truncate">{item.sub}</div>
                    </div>
                    <div className="text-overline text-text-tertiary flex-shrink-0 ml-1">{item.ago}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Right: Live Time + Sensors + Monitoring ─────── */}
            <motion.div
              {...fadeSlideRight}
              transition={{ ...fadeSlideRight.transition, delay: 0.45 }}
              className="absolute top-3 right-16 w-52 flex flex-col gap-2 z-10"
            >
              {/* UTC clock */}
              <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-text-secondary">{utcStr} UTC</span>
                </div>
                <span className="overline-label">LIVE</span>
              </div>

              {/* Active sensor passes */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Active Sensors</div>
                </div>
                {ACTIVE_SENSORS.map((s, i) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white-3 transition-colors"
                    style={i < ACTIVE_SENSORS.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: s.live ? '#14B8A6' : '#4A5568',
                        boxShadow: s.live ? '0 0 5px rgba(20,184,166,0.7)' : 'none',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-primary font-medium truncate">{s.name}</div>
                      <div className="text-overline text-text-tertiary">{s.agency} · {s.mode}</div>
                    </div>
                    <div
                      className="font-mono text-overline flex-shrink-0"
                      style={{ color: s.pass === 'NOW' ? '#14B8A6' : '#64748B' }}
                    >
                      {s.pass}
                    </div>
                  </div>
                ))}
              </div>

              {/* Active monitoring zones */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Monitoring Zones</div>
                </div>
                {globeHotspots.slice(0, 4).map((hs, i) => (
                  <div
                    key={hs.id}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white-3 transition-colors"
                    style={i < 3 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: HOTSPOT_COLORS[hs.type] ?? '#64748B' }}
                    />
                    <span className="text-caption text-text-secondary truncate">
                      {hs.label.split('—')[0].trim()}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Globe layer controls ─────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="absolute left-16 bottom-20 flex flex-col gap-1.5 z-10"
            >
              <button
                onClick={toggleOrbits}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showOrbits ? '#14B8A6' : '#64748B' }}
              >
                <Satellite className="w-3.5 h-3.5" />
                Orbits
              </button>
              <button
                onClick={toggleHotspots}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showHotspots ? '#3B82F6' : '#64748B' }}
              >
                <Layers className="w-3.5 h-3.5" />
                Hotspots
              </button>
            </motion.div>

            {/* ── Bottom coordinate bar ───────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10"
            >
              <div
                className="glass-panel rounded-xl px-6 py-2.5 flex items-center gap-5"
                style={{ whiteSpace: 'nowrap' }}
              >
                <div className="font-mono text-caption text-text-tertiary">26.120°N  91.740°E</div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="font-mono text-caption text-text-tertiary">WGS84 · UTM 45R</div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="flex items-center gap-1.5">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-teal-primary">LIVE</span>
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="font-mono text-caption text-text-tertiary">Alt 512m MSL</div>
              </div>
            </motion.div>

            {/* ── Quick actions ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.4 }}
              className="absolute bottom-20 right-16 flex flex-col gap-2 z-10"
            >
              <button
                onClick={() => setActiveView('search')}
                className="btn-primary px-5 py-2.5 text-body-s"
              >
                Upload & Search
              </button>
              <button
                onClick={toggleCopilot}
                className="glass-panel text-text-secondary text-body-s px-5 py-2.5 rounded-lg hover:text-text-primary transition-all"
              >
                Ask Copilot
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
