import { useRef, useMemo, useEffect, Suspense, Component, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '@/store/useAppStore'
import { latLngToVector3 } from '@/lib/utils'
import { globeHotspots, satelliteOrbits } from '@/data/satellites'
import type { RetrievalResult } from '@/types'
import EarthErrorBoundary from './EarthErrorBoundary'
import {
  createEarthDayTexture,
  createEarthNightTexture,
  createCloudTexture,
} from './earthTextures'
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from './atmosphereShader'

const EARTH_RADIUS  = 1.45
const ORBIT_RADIUS  = EARTH_RADIUS * 1.17
const CLOUD_RADIUS  = EARTH_RADIUS + 0.007
const ATMO_RADIUS   = EARTH_RADIUS + 0.11
const TRAIL_STEPS   = 22  // number of trail dots

class TextureErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { err: boolean }
> {
  constructor(p: { children: ReactNode; fallback: ReactNode }) {
    super(p)
    this.state = { err: false }
  }
  static getDerivedStateFromError() { return { err: true } }
  componentDidCatch(e: Error) { console.warn('[TextureErrorBoundary]', e.message) }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}

interface EarthMeshCoreProps {
  isRotating: boolean
  dayTex:    THREE.Texture
  normalTex: THREE.Texture | null
  specTex:   THREE.Texture | null
}

function EarthMeshCore({ isRotating, dayTex, normalTex, specTex }: EarthMeshCoreProps) {
  const meshRef  = useRef<THREE.Mesh>(null)
  const cloudRef = useRef<THREE.Mesh>(null)

  const nightTex = useMemo(() => createEarthNightTexture(), [])
  const cloudTex = useMemo(() => createCloudTexture(), [])

  const earthMat = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial({
      map:               dayTex,
      emissiveMap:       nightTex,
      emissive:          new THREE.Color(0.48, 0.36, 0.10),
      emissiveIntensity: 0.38,
      // Reduce specular drastically — less plastic/metallic look
      specular:          new THREE.Color(0.08, 0.12, 0.22),
      shininess:         6,
    })
    if (normalTex) {
      mat.normalMap   = normalTex
      mat.normalScale = new THREE.Vector2(0.65, 0.65)
    }
    if (specTex) {
      mat.specularMap = specTex
    }
    return mat
  }, [dayTex, normalTex, specTex, nightTex])

  const cloudMat = useMemo(() => new THREE.MeshPhongMaterial({
    alphaMap:    cloudTex,
    transparent: true,
    depthWrite:  false,
    opacity:     0.72,
    color:       new THREE.Color(1, 1, 1),
  }), [cloudTex])

  useEffect(() => () => {
    nightTex.dispose(); cloudTex.dispose()
    earthMat.dispose(); cloudMat.dispose()
  }, [nightTex, cloudTex, earthMat, cloudMat])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (meshRef.current  && isRotating) meshRef.current.rotation.y  = t * 0.04
    if (cloudRef.current && isRotating) cloudRef.current.rotation.y = t * 0.046
  })

  return (
    <group>
      <mesh ref={meshRef} material={earthMat} receiveShadow castShadow>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
      </mesh>
      <mesh ref={cloudRef} material={cloudMat}>
        <sphereGeometry args={[CLOUD_RADIUS, 64, 64]} />
      </mesh>
    </group>
  )
}

function TexturedEarth({ isRotating }: { isRotating: boolean }) {
  const [dayTex, normalTex, specTex] = useLoader(THREE.TextureLoader, [
    '/textures/earth_day.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth_specular.jpg',
  ])
  dayTex.anisotropy    = 8
  normalTex.anisotropy = 4
  specTex.anisotropy   = 4
  return <EarthMeshCore isRotating={isRotating} dayTex={dayTex} normalTex={normalTex} specTex={specTex} />
}

function ProceduralEarth({ isRotating }: { isRotating: boolean }) {
  const dayTex = useMemo(() => createEarthDayTexture(), [])
  useEffect(() => () => dayTex.dispose(), [dayTex])
  return <EarthMeshCore isRotating={isRotating} dayTex={dayTex} normalTex={null} specTex={null} />
}

function AtmosphereGlow() {
  const atmoMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    side:           THREE.BackSide,
    blending:       THREE.AdditiveBlending,
    transparent:    true,
    depthWrite:     false,
  }), [])
  useEffect(() => () => atmoMat.dispose(), [atmoMat])
  return (
    <mesh material={atmoMat}>
      <sphereGeometry args={[ATMO_RADIUS, 32, 32]} />
    </mesh>
  )
}

// ─── Satellite orbit with animated trail ─────────────────────────────────────
interface SatelliteOrbitPathProps {
  inclination: number
  phaseOffset: number
  color: string
  period: number
  name?: string
}

function SatelliteOrbitPath({ inclination, phaseOffset, color, period, name }: SatelliteOrbitPathProps) {
  const dotRef = useRef<THREE.Mesh>(null)

  // Pre-build trail geometry with mutable positions buffer
  const trailPositions = useRef(new Float32Array(TRAIL_STEPS * 3))
  const trailGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_STEPS * 3), 3))
    return geo
  }, [])

  const trailLine = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.62 })
    return new THREE.Line(trailGeo, mat)
  }, [trailGeo, color])

  // Full orbit ring
  const orbitPts = useMemo(() => {
    const incRad = (inclination * Math.PI) / 180
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(
        Math.cos(a) * ORBIT_RADIUS,
        Math.sin(a) * Math.sin(incRad) * ORBIT_RADIUS,
        Math.sin(a) * Math.cos(incRad) * ORBIT_RADIUS,
      ))
    }
    return pts
  }, [inclination])

  const orbitGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(orbitPts), [orbitPts])
  const orbitLine = useMemo(() => new THREE.Line(
    orbitGeo,
    new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.13 })
  ), [orbitGeo, color])

  // Dot material (slightly larger, brighter)
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.92,
  }), [color])

  // Pulsing ring
  const ringRef    = useRef<THREE.Mesh>(null)
  const ringMat    = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.5, side: THREE.FrontSide }), [color])
  const ringGeo    = useMemo(() => new THREE.RingGeometry(0.016, 0.022, 12), [])

  useEffect(() => () => {
    trailGeo.dispose(); trailLine.material.dispose()
    orbitGeo.dispose(); orbitLine.material.dispose()
    dotMat.dispose(); ringMat.dispose(); ringGeo.dispose()
  }, [trailGeo, trailLine, orbitGeo, orbitLine, dotMat, ringMat, ringGeo])

  useFrame(({ clock, camera }) => {
    const incRad = (inclination * Math.PI) / 180
    const t      = clock.getElapsedTime()
    const angle  = ((t * 0.6 / period + phaseOffset) % 1) * Math.PI * 2

    // Satellite dot position
    const sx = Math.cos(angle) * ORBIT_RADIUS
    const sy = Math.sin(angle) * Math.sin(incRad) * ORBIT_RADIUS
    const sz = Math.sin(angle) * Math.cos(incRad) * ORBIT_RADIUS

    if (dotRef.current) {
      dotRef.current.position.set(sx, sy, sz)
    }

    // Pulsing ring billboard toward camera
    if (ringRef.current) {
      ringRef.current.position.set(sx, sy, sz)
      ringRef.current.quaternion.copy(camera.quaternion)
      const pulse = 0.5 + Math.sin(t * 2.8) * 0.5
      const s     = 1 + pulse * 0.6
      ringRef.current.scale.setScalar(s)
      ringMat.opacity = (1 - pulse) * 0.55
    }

    // Trail: arc spanning 0.45 radians behind current position
    const TRAIL_SPAN = 0.45
    const buf = trailPositions.current
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const trailAngle = angle - (i / (TRAIL_STEPS - 1)) * TRAIL_SPAN
      const tx = Math.cos(trailAngle) * ORBIT_RADIUS
      const ty = Math.sin(trailAngle) * Math.sin(incRad) * ORBIT_RADIUS
      const tz = Math.sin(trailAngle) * Math.cos(incRad) * ORBIT_RADIUS
      const idx = (TRAIL_STEPS - 1 - i) * 3
      buf[idx]     = tx
      buf[idx + 1] = ty
      buf[idx + 2] = tz
    }
    const posAttr = trailGeo.attributes.position as THREE.BufferAttribute
    posAttr.array.set(buf)
    posAttr.needsUpdate = true
    trailGeo.setDrawRange(0, TRAIL_STEPS)
  })

  return (
    <group>
      <primitive object={orbitLine} />
      <primitive object={trailLine} />
      <mesh ref={dotRef} material={dotMat}>
        <sphereGeometry args={[0.014, 10, 10]} />
      </mesh>
      <mesh ref={ringRef} geometry={ringGeo} material={ringMat} />
    </group>
  )
}

// ─── Geospatial hotspots ────────────────────────────────────────────────────
function Hotspots() {
  const show = useAppStore((s) => s.showHotspots)
  if (!show) return null
  const typeColor: Record<string, string> = {
    flood: '#3B82F6', agriculture: '#22C55E',
    urban: '#F59E0B', disaster: '#EF4444', monitoring: '#14B8A6',
  }
  return (
    <group>
      {globeHotspots.map((hs) => {
        const [x, y, z] = latLngToVector3(hs.coords.lat, hs.coords.lng, EARTH_RADIUS + 0.012)
        return (
          <mesh key={hs.id} position={[x, y, z]}>
            <sphereGeometry args={[0.007 * hs.intensity, 8, 8]} />
            <meshBasicMaterial color={typeColor[hs.type] ?? '#94A3B8'} transparent opacity={0.85} />
          </mesh>
        )
      })}
    </group>
  )
}

// ─── Result arcs + pins ─────────────────────────────────────────────────────
function ResultArcs({ results }: { results: RetrievalResult[] }) {
  const showArcs      = useAppStore((s) => s.showArcs)
  const hoveredResult = useAppStore((s) => s.hoveredResult)
  const queryCoords   = useMemo(() => ({ lat: 26.12, lng: 91.74 }), [])

  const arcData = useMemo(() => results.map((r) => {
    const [sx, sy, sz] = latLngToVector3(queryCoords.lat, queryCoords.lng, EARTH_RADIUS + 0.015)
    const [ex, ey, ez] = latLngToVector3(r.location.coords.lat, r.location.coords.lng, EARTH_RADIUS + 0.015)
    const start = new THREE.Vector3(sx, sy, sz)
    const end   = new THREE.Vector3(ex, ey, ez)
    const mid   = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    mid.normalize().multiplyScalar(EARTH_RADIUS + 0.32 + (r.rank % 3) * 0.09)
    const curve  = new THREE.QuadraticBezierCurve3(start, mid, end)
    const geo    = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))
    return { r, geo, end: [ex, ey, ez] as [number, number, number] }
  }), [results, queryCoords])

  if (!showArcs || results.length === 0) return null

  const sensorColor = (type: string) =>
    type === 'SAR' ? '#3B82F6' : type === 'Optical' ? '#22C55E' : '#F59E0B'

  return (
    <group>
      {arcData.map(({ r, geo, end }) => {
        const col   = sensorColor(r.sensorType)
        const isHov = hoveredResult?.id === r.id
        const mat   = new THREE.LineBasicMaterial({
          color:       new THREE.Color(col),
          transparent: true,
          opacity:     isHov ? 0.9 : Math.max(0.12, 0.4 - r.rank * 0.025),
        })
        return (
          <group key={r.id}>
            <primitive object={new THREE.Line(geo, mat)} />
            <mesh position={end}>
              <sphereGeometry args={[isHov ? 0.018 : 0.011, 8, 8]} />
              <meshBasicMaterial color={col} transparent opacity={0.9} />
            </mesh>
          </group>
        )
      })}
      <mesh position={latLngToVector3(queryCoords.lat, queryCoords.lng, EARTH_RADIUS + 0.020) as [number, number, number]}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color="#3B82F6" />
      </mesh>
    </group>
  )
}

// ─── AOI pulse rings (Brahmaputra flood alert) ──────────────────────────────
function AoiPulse() {
  const activeMission = useAppStore((s) => s.activeMission)
  const rings = useRef<THREE.Mesh[]>([])
  const phases = useRef([0, 0.33, 0.66])

  // Brahmaputra basin: 26.12°N, 91.74°E
  const [cx, cy, cz] = latLngToVector3(26.12, 91.74, EARTH_RADIUS + 0.005)
  const center = useMemo(() => new THREE.Vector3(cx, cy, cz), [cx, cy, cz])

  // Normal vector pointing outward from earth surface at this location
  const normal = useMemo(() => center.clone().normalize(), [center])

  useFrame(({ clock }) => {
    if (!activeMission) return
    const t = clock.getElapsedTime()
    rings.current.forEach((mesh, i) => {
      if (!mesh) return
      const phase = ((t * 0.55 + phases.current[i]) % 1)
      const scale = 0.02 + phase * 0.22
      mesh.scale.setScalar(scale)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (1 - phase) * 0.65
    })
  })

  if (!activeMission) return null

  // Place ring geometry tangent to earth surface, oriented by the normal
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    return new THREE.Quaternion().setFromUnitVectors(up, normal)
  }, [normal])

  return (
    <group position={center} quaternion={quaternion}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { if (el) rings.current[i] = el }}>
          <ringGeometry args={[0.9, 1.0, 48]} />
          <meshBasicMaterial color="#3B82F6" transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Static center dot */}
      <mesh>
        <circleGeometry args={[0.018, 24]} />
        <meshBasicMaterial color="#60A5FA" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ─── Camera controller ──────────────────────────────────────────────────────
function CameraController() {
  const { camera } = useThree()
  const focusedCoords = useAppStore((s) => s.focusedCoords)
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.25, 4.5))

  useEffect(() => {
    if (!focusedCoords) return
    const [tx, ty, tz] = latLngToVector3(focusedCoords.lat, focusedCoords.lng, 4.5)
    targetRef.current.set(tx, ty, tz)
  }, [focusedCoords])

  useFrame(() => { camera.position.lerp(targetRef.current, 0.035) })
  return null
}

// ─── Lighting — sun + terminator-aware fill ──────────────────────────────────
function Lighting() {
  // Sun position drifts slowly to simulate Earth rotation relative to sun
  const sunRef = useRef<THREE.DirectionalLight>(null)
  useFrame(({ clock }) => {
    if (!sunRef.current) return
    const t = clock.getElapsedTime() * 0.008
    sunRef.current.position.set(
      Math.cos(t) * 8,
      2.5,
      Math.sin(t) * 6,
    )
  })

  return (
    <>
      {/* Very low ambient — night side stays dark */}
      <ambientLight intensity={0.038} color="#b0c0e0" />
      {/* Primary sun — warm, drifts with time */}
      <directionalLight ref={sunRef} position={[8, 2.5, 5]} intensity={3.8} color="#FFF4E8" castShadow />
      {/* Subtle cold backfill to prevent pitch-black back hemisphere */}
      <pointLight position={[-7, -2, -6]} intensity={0.14} color="#050520" />
    </>
  )
}

// ─── Full scene ─────────────────────────────────────────────────────────────
function EarthScene() {
  const results    = useAppStore((s) => s.results)
  const showOrbits = useAppStore((s) => s.showOrbits)
  const isRotating = useAppStore((s) => s.isRotating)

  const proceduralFallback = <ProceduralEarth isRotating={isRotating} />

  return (
    <>
      <Lighting />
      <Stars radius={300} depth={60} count={5000} factor={3.0} fade speed={0.15} saturation={0.1} />
      <AtmosphereGlow />
      <TextureErrorBoundary fallback={proceduralFallback}>
        <Suspense fallback={proceduralFallback}>
          <TexturedEarth isRotating={isRotating} />
        </Suspense>
      </TextureErrorBoundary>
      {showOrbits && satelliteOrbits.map((o) => (
        <SatelliteOrbitPath key={o.id} inclination={o.inclination} phaseOffset={o.phaseOffset}
          color={o.color} period={o.period} name={o.name} />
      ))}
      <Hotspots />
      <AoiPulse />
      <ResultArcs results={results} />
      <CameraController />
    </>
  )
}

// ─── Canvas wrapper ──────────────────────────────────────────────────────────
export default function EarthGlobe({ className = '' }: { className?: string }) {
  const setEarthLoaded = useAppStore((s) => s.setEarthLoaded)

  return (
    <EarthErrorBoundary>
      <div className={`w-full h-full ${className}`}>
        <Canvas
          camera={{ position: [0, 0.25, 4.5], fov: 44 }}
          dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
          shadows
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
            setTimeout(() => setEarthLoaded(true), 1200)
          }}
        >
          <Suspense fallback={null}>
            <EarthScene />
          </Suspense>
        </Canvas>
      </div>
    </EarthErrorBoundary>
  )
}
