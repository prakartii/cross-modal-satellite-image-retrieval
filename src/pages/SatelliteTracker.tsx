import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio, Satellite, Clock, Eye, Signal, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type MissionStatus = 'ACTIVE' | 'PROCESSING' | 'ALERT' | 'ARCHIVED'

interface SatelliteData {
  id: string
  name: string
  agency: string
  type: string
  altitude: number
  inclination: number
  period: number
  status: MissionStatus
  mode: string
  nextPass: string
  passOver: string
  acquisitionStatus: string
  lastContact: string
  color: string
  lat: number
  lng: number
  speed: number
}

const SATELLITES: SatelliteData[] = [
  {
    id: 'risat2b',
    name: 'RISAT-2B',
    agency: 'ISRO',
    type: 'SAR',
    altitude: 557,
    inclination: 37.0,
    period: 95.6,
    status: 'ACTIVE',
    mode: 'FRS-1 (Fine Resolution Strip)',
    nextPass: '04m 22s',
    passOver: 'Northeast India — Brahmaputra corridor',
    acquisitionStatus: 'Acquiring — flood monitoring tasking active',
    lastContact: 'ISTRAC Bangalore · 2m ago',
    color: '#F59E0B',
    lat: 28.4,
    lng: 84.2,
    speed: 7.6,
  },
  {
    id: 'cartosat3',
    name: 'Cartosat-3',
    agency: 'ISRO',
    type: 'Optical',
    altitude: 509,
    inclination: 97.5,
    period: 94.6,
    status: 'ACTIVE',
    mode: 'PAN (0.25m) + Multi-Spectral',
    nextPass: 'NOW',
    passOver: 'Delhi NCR — Urban mapping pass',
    acquisitionStatus: 'Imaging — urban expansion survey',
    lastContact: 'NRSC Hyderabad · now',
    color: '#22C55E',
    lat: 31.2,
    lng: 77.5,
    speed: 7.7,
  },
  {
    id: 'resourcesat2a',
    name: 'Resourcesat-2A',
    agency: 'ISRO',
    type: 'Multispectral',
    altitude: 817,
    inclination: 98.7,
    period: 101.3,
    status: 'PROCESSING',
    mode: 'LISS-IV · 5.8m MX',
    nextPass: '1h 14m',
    passOver: 'Central India — agricultural corridor',
    acquisitionStatus: 'Downlinking — previous pass data',
    lastContact: 'SAC Ahmedabad · 18m ago',
    color: '#3B82F6',
    lat: 18.7,
    lng: 95.1,
    speed: 7.5,
  },
  {
    id: 'sentinel1a',
    name: 'Sentinel-1A',
    agency: 'ESA',
    type: 'SAR',
    altitude: 693,
    inclination: 98.18,
    period: 98.6,
    status: 'ACTIVE',
    mode: 'IW (Interferometric Wide)',
    nextPass: '32m',
    passOver: 'Bay of Bengal — cyclone monitoring',
    acquisitionStatus: 'Standby — tasking queue: 3 requests',
    lastContact: 'Matera · 8m ago',
    color: '#14B8A6',
    lat: 12.3,
    lng: 105.4,
    speed: 7.6,
  },
  {
    id: 'sentinel2a',
    name: 'Sentinel-2A',
    agency: 'ESA',
    type: 'Multispectral',
    altitude: 786,
    inclination: 98.62,
    period: 100.6,
    status: 'ACTIVE',
    mode: 'MSI L2A — 13 spectral bands',
    nextPass: '2h 08m',
    passOver: 'Western Ghats — vegetation stress',
    acquisitionStatus: 'In pass — NDVI acquisition ongoing',
    lastContact: 'Svalbard · 42m ago',
    color: '#22C55E',
    lat: -4.2,
    lng: 118.7,
    speed: 7.5,
  },
  {
    id: 'alos2',
    name: 'ALOS-2 PALSAR-2',
    agency: 'JAXA',
    type: 'SAR',
    altitude: 628,
    inclination: 97.9,
    period: 97.2,
    status: 'ARCHIVED',
    mode: 'SM (Spotlight Mode) — 1m',
    nextPass: '6h 22m',
    passOver: 'Indian Ocean — off-schedule',
    acquisitionStatus: 'Inactive — next window 06:22 UTC',
    lastContact: 'Hatoyama · 3h ago',
    color: '#64748B',
    lat: -22.5,
    lng: 132.8,
    speed: 7.5,
  },
]

const STATUS_CONFIG: Record<MissionStatus, { label: string; color: string; dot: string }> = {
  ACTIVE:     { label: 'ACTIVE',     color: '#14B8A6', dot: 'bg-teal-primary' },
  PROCESSING: { label: 'PROCESSING', color: '#F59E0B', dot: 'bg-warning'      },
  ALERT:      { label: 'ALERT',      color: '#EF4444', dot: 'bg-danger'       },
  ARCHIVED:   { label: 'ARCHIVED',   color: '#4A5568', dot: 'bg-text-tertiary' },
}

function useLiveClock() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return tick
}

function OrbitCanvas({ satellites }: { satellites: SatelliteData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tick = useLiveClock()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2

    ctx.clearRect(0, 0, W, H)

    // Earth
    const earthRadius = Math.min(W, H) * 0.28
    const earthGrad = ctx.createRadialGradient(cx - earthRadius * 0.2, cy - earthRadius * 0.2, earthRadius * 0.1, cx, cy, earthRadius)
    earthGrad.addColorStop(0, 'rgba(30, 58, 95, 0.9)')
    earthGrad.addColorStop(0.5, 'rgba(15, 35, 65, 0.95)')
    earthGrad.addColorStop(1, 'rgba(8, 18, 40, 1)')
    ctx.beginPath()
    ctx.arc(cx, cy, earthRadius, 0, Math.PI * 2)
    ctx.fillStyle = earthGrad
    ctx.fill()

    // Earth grid lines
    ctx.strokeStyle = 'rgba(59,130,246,0.08)'
    ctx.lineWidth = 0.5
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.arc(cx, cy, earthRadius * (i / 3), 0, Math.PI * 2)
      ctx.stroke()
    }

    // Earth atmosphere glow
    const atmGrad = ctx.createRadialGradient(cx, cy, earthRadius * 0.95, cx, cy, earthRadius * 1.08)
    atmGrad.addColorStop(0, 'rgba(59,130,246,0.12)')
    atmGrad.addColorStop(1, 'rgba(59,130,246,0)')
    ctx.beginPath()
    ctx.arc(cx, cy, earthRadius * 1.08, 0, Math.PI * 2)
    ctx.fillStyle = atmGrad
    ctx.fill()

    // Orbit paths
    satellites.forEach((sat) => {
      const orbitR = earthRadius + (sat.altitude / 400) * earthRadius * 0.5
      const incRad = (sat.inclination * Math.PI) / 180
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(incRad * 0.3)
      ctx.beginPath()
      ctx.ellipse(0, 0, orbitR, orbitR * Math.cos(incRad * 0.5), 0, 0, Math.PI * 2)
      ctx.strokeStyle = sat.status === 'ARCHIVED' ? 'rgba(71,85,105,0.2)' : `${sat.color}30`
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Satellite dot
      if (sat.status !== 'ARCHIVED') {
        const t = (Date.now() / (sat.period * 600)) + sat.id.charCodeAt(0) * 0.5
        const orbitX = cx + orbitR * Math.cos(t) * Math.cos(incRad * 0.2)
        const orbitY = cy + orbitR * Math.sin(t) * 0.85

        // Glow
        const glow = ctx.createRadialGradient(orbitX, orbitY, 0, orbitX, orbitY, 8)
        glow.addColorStop(0, sat.color + '80')
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(orbitX, orbitY, 8, 0, Math.PI * 2)
        ctx.fill()

        // Dot
        ctx.beginPath()
        ctx.arc(orbitX, orbitY, 3, 0, Math.PI * 2)
        ctx.fillStyle = sat.color
        ctx.fill()
      }
    })
  }, [satellites, tick])

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={420}
      className="w-full h-full"
      style={{ maxWidth: 420, maxHeight: 420 }}
    />
  )
}

function StatusBadge({ status }: { status: MissionStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`mission-badge mission-badge-${status.toLowerCase()}`}>
      {cfg.label}
    </span>
  )
}

export default function SatelliteTracker() {
  const [selected, setSelected] = useState<SatelliteData>(SATELLITES[0])
  const [expandedId, setExpandedId] = useState<string | null>(SATELLITES[0].id)
  const tick = useLiveClock()

  const now = new Date()
  const utcStr = now.toUTCString().slice(17, 25)

  const activeSats = SATELLITES.filter((s) => s.status !== 'ARCHIVED')

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Left: satellite list ─────────────────────────────────── */}
      <motion.div
        initial={{ x: -16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-88 flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          background: 'rgba(10,15,26,0.97)',
          borderRight: '1px solid rgba(45,55,72,0.35)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-7 pb-5" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.22)' }}
            >
              <Radio className="w-3.5 h-3.5 text-teal-primary" />
            </div>
            <h1 className="text-heading-3 text-text-primary font-semibold">Live Satellite Tracker</h1>
          </div>
          <p className="text-body-s text-text-tertiary leading-relaxed">
            Real-time orbital positions · ISRO, ESA, JAXA constellation
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            <div className="status-live" />
            <span className="font-mono text-caption text-text-tertiary">{utcStr} UTC</span>
            <span className="text-overline text-text-tertiary ml-2">{activeSats.length} ACTIVE</span>
          </div>
        </div>

        {/* Satellite list */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {SATELLITES.map((sat) => {
            const isExpanded = expandedId === sat.id
            const isSelected = selected.id === sat.id
            return (
              <div
                key={sat.id}
                style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}
              >
                <button
                  className="w-full flex items-center gap-3 px-5 py-3.5 transition-all text-left relative"
                  style={{
                    background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent',
                  }}
                  onClick={() => {
                    setSelected(sat)
                    setExpandedId(isExpanded ? null : sat.id)
                  }}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: '#3B82F6' }} />
                  )}
                  {/* Color dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: sat.color,
                      boxShadow: sat.status !== 'ARCHIVED' ? `0 0 6px ${sat.color}80` : 'none',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-body-s text-text-primary font-medium">{sat.name}</span>
                      <StatusBadge status={sat.status} />
                    </div>
                    <div className="text-caption text-text-tertiary">{sat.agency} · {sat.type} · {sat.altitude}km</div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    <span
                      className="font-mono text-caption font-semibold"
                      style={{ color: sat.nextPass === 'NOW' ? '#14B8A6' : '#64748B' }}
                    >
                      {sat.nextPass === 'NOW' ? '⬤ NOW' : sat.nextPass}
                    </span>
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-text-tertiary" /> : <ChevronDown className="w-3 h-3 text-text-tertiary" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-5 pb-4 pt-1 space-y-2"
                        style={{ background: 'rgba(8,12,22,0.5)' }}
                      >
                        <div className="data-row">
                          <span className="text-caption text-text-tertiary">Mode</span>
                          <span className="text-caption text-text-secondary font-medium">{sat.mode}</span>
                        </div>
                        <div className="data-row">
                          <span className="text-caption text-text-tertiary">Pass over</span>
                          <span className="text-caption text-text-secondary text-right max-w-[160px]">{sat.passOver}</span>
                        </div>
                        <div className="data-row">
                          <span className="text-caption text-text-tertiary">Last contact</span>
                          <span className="text-caption text-text-secondary">{sat.lastContact}</span>
                        </div>
                        <div className="pt-1">
                          <div
                            className="px-2.5 py-2 rounded text-caption leading-snug"
                            style={{
                              background: 'rgba(20,184,166,0.06)',
                              border: '1px solid rgba(20,184,166,0.15)',
                              color: '#94A3B8',
                            }}
                          >
                            {sat.acquisitionStatus}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* ── Center: Orbital visualization ───────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: '#080D16' }}
      >
        {/* Scan line effect */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-5"
          style={{
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(59,130,246,0.15), transparent)',
            animation: 'scanLine 8s linear infinite',
          }}
        />

        {/* Orbit canvas */}
        <div className="relative" style={{ width: 420, height: 420 }}>
          <OrbitCanvas satellites={SATELLITES} />

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center" style={{ marginTop: 4 }}>
              <div className="font-mono text-caption text-text-tertiary">EARTH</div>
              <div className="font-mono text-overline text-text-tertiary opacity-60">WGS84</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 mt-8">
          {SATELLITES.map((sat) => (
            <button
              key={sat.id}
              onClick={() => { setSelected(sat); setExpandedId(sat.id) }}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: selected.id === sat.id ? 1 : 0.45 }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: sat.color }}
              />
              <span className="text-overline text-text-tertiary">{sat.name}</span>
            </button>
          ))}
        </div>

        {/* Data stream lines */}
        {[20, 45, 70].map((pct, i) => (
          <div
            key={i}
            className="data-stream-line"
            style={{
              top: `${pct}%`,
              left: 0,
              right: 0,
              animationDelay: `${i * 1.2}s`,
              animationDuration: `${3 + i * 0.7}s`,
            }}
          />
        ))}

        {/* Bottom: mission telemetry */}
        <div
          className="absolute bottom-0 left-0 right-0 px-8 py-4 flex items-center gap-8"
          style={{ borderTop: '1px solid rgba(45,55,72,0.25)', background: 'rgba(8,13,22,0.9)' }}
        >
          <div>
            <div className="overline-label mb-0.5">Constellation Health</div>
            <div className="font-mono text-heading-3 text-success font-bold">98.4%</div>
          </div>
          <div className="w-px h-8" style={{ background: 'rgba(45,55,72,0.5)' }} />
          <div>
            <div className="overline-label mb-0.5">Active Passes Today</div>
            <div className="font-mono text-heading-3 text-text-primary font-bold">47</div>
          </div>
          <div className="w-px h-8" style={{ background: 'rgba(45,55,72,0.5)' }} />
          <div>
            <div className="overline-label mb-0.5">Data Downlinked</div>
            <div className="font-mono text-heading-3 text-text-primary font-bold">2.4 TB</div>
          </div>
          <div className="w-px h-8" style={{ background: 'rgba(45,55,72,0.5)' }} />
          <div>
            <div className="overline-label mb-0.5">Tasking Queue</div>
            <div className="font-mono text-heading-3 text-warning font-bold">12 req.</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <div className="status-live" />
            <span className="font-mono text-caption text-text-tertiary">LIVE · {utcStr} UTC</span>
          </div>
        </div>
      </div>

      {/* ── Right: Selected satellite detail ────────────────────── */}
      <motion.div
        initial={{ x: 16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          background: 'rgba(10,15,26,0.97)',
          borderLeft: '1px solid rgba(45,55,72,0.35)',
        }}
      >
        {/* Satellite identity */}
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                background: selected.color,
                boxShadow: selected.status !== 'ARCHIVED' ? `0 0 8px ${selected.color}80` : 'none',
              }}
            />
            <span className="font-display font-bold text-text-primary text-body-m">{selected.name}</span>
          </div>
          <StatusBadge status={selected.status} />
          <div className="text-caption text-text-tertiary mt-2">{selected.mode}</div>
        </div>

        {/* Orbital parameters */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
          <div className="overline-label mb-3">Orbital Parameters</div>
          {[
            { label: 'Altitude',      value: `${selected.altitude} km`           },
            { label: 'Inclination',   value: `${selected.inclination}°`          },
            { label: 'Period',        value: `${selected.period} min`            },
            { label: 'Ground Speed',  value: `${selected.speed} km/s`            },
            { label: 'Agency',        value: selected.agency                      },
            { label: 'Sensor Type',   value: selected.type                        },
          ].map(({ label, value }) => (
            <div key={label} className="data-row">
              <span className="text-caption text-text-tertiary">{label}</span>
              <span className="font-mono text-caption text-text-secondary font-medium">{value}</span>
            </div>
          ))}
        </div>

        {/* Next observation window */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
          <div className="overline-label mb-3">Next Observation Window</div>
          <div
            className="px-3 py-3 rounded-lg"
            style={{
              background: selected.nextPass === 'NOW'
                ? 'rgba(20,184,166,0.08)'
                : 'rgba(17,24,39,0.5)',
              border: selected.nextPass === 'NOW'
                ? '1px solid rgba(20,184,166,0.25)'
                : '1px solid rgba(45,55,72,0.3)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5" style={{ color: selected.nextPass === 'NOW' ? '#14B8A6' : '#64748B' }} />
              <span
                className="font-mono text-heading-3 font-bold"
                style={{ color: selected.nextPass === 'NOW' ? '#14B8A6' : '#F8FAFC' }}
              >
                {selected.nextPass === 'NOW' ? 'IN PASS NOW' : selected.nextPass}
              </span>
            </div>
            <div className="text-caption text-text-secondary leading-snug">{selected.passOver}</div>
          </div>
        </div>

        {/* Acquisition status */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
          <div className="overline-label mb-3">Acquisition Status</div>
          <div className="flex items-start gap-2">
            <Eye className="w-3.5 h-3.5 text-text-tertiary mt-0.5 flex-shrink-0" />
            <span className="text-body-s text-text-secondary leading-relaxed">{selected.acquisitionStatus}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <Signal className="w-3 h-3 text-teal-primary" />
            <span className="text-caption text-text-tertiary">{selected.lastContact}</span>
          </div>
        </div>

        {/* Ground station coverage */}
        <div className="px-5 py-4">
          <div className="overline-label mb-3">Ground Station Network</div>
          <div className="space-y-2">
            {[
              { name: 'ISTRAC Bangalore',  active: true  },
              { name: 'NRSC Hyderabad',    active: true  },
              { name: 'SAC Ahmedabad',     active: false },
              { name: 'Mauritius Station', active: false },
            ].map(({ name, active }) => (
              <div key={name} className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: active ? '#14B8A6' : '#2D3748',
                    boxShadow: active ? '0 0 5px rgba(20,184,166,0.6)' : 'none',
                  }}
                />
                <span className="text-caption" style={{ color: active ? '#94A3B8' : '#4A5568' }}>{name}</span>
                {active && <span className="text-overline text-teal-primary ml-auto">LINK</span>}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
