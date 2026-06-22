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
const ORBIT_RADIUS  = EARTH_RADIUS * 1.17   // ~1.70
const CLOUD_RADIUS  = EARTH_RADIUS + 0.007
const ATMO_RADIUS   = EARTH_RADIUS + 0.11

// ─── Inner class error boundary — falls back to procedural Earth mesh ───────
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

// ─── Shared earth geometry / material (textures passed as props) ─────────────
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
      map:              dayTex,
      emissiveMap:      nightTex,
      emissive:         new THREE.Color(0.5, 0.38, 0.12),
      emissiveIntensity: 0.5,
      specular:         new THREE.Color(0.35, 0.45, 0.68),
      shininess:        28,
    })
    if (normalTex) {
      mat.normalMap   = normalTex
      mat.normalScale = new THREE.Vector2(0.85, 0.85)
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
    opacity:     0.82,
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

// ─── Textured Earth: loads real high-res textures via Suspense ───────────────
function TexturedEarth({ isRotating }: { isRotating: boolean }) {
  const [dayTex, normalTex, specTex] = useLoader(THREE.TextureLoader, [
    '/textures/earth_day.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth_specular.jpg',
  ])

  // Enable anisotropy for sharper texture at oblique angles
  dayTex.anisotropy    = 8
  normalTex.anisotropy = 4
  specTex.anisotropy   = 4

  return (
    <EarthMeshCore
      isRotating={isRotating}
      dayTex={dayTex}
      normalTex={normalTex}
      specTex={specTex}
    />
  )
}

// ─── Procedural fallback Earth (zero network requests) ──────────────────────
function ProceduralEarth({ isRotating }: { isRotating: boolean }) {
  const dayTex = useMemo(() => createEarthDayTexture(), [])
  useEffect(() => () => dayTex.dispose(), [dayTex])
  return (
    <EarthMeshCore
      isRotating={isRotating}
      dayTex={dayTex}
      normalTex={null}
      specTex={null}
    />
  )
}

// ─── Fresnel atmosphere glow (custom GLSL, BackSide sphere) ─────────────────
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

// ─── Satellite orbit paths ──────────────────────────────────────────────────
function SatelliteOrbitPath({
  inclination, phaseOffset, color, period,
}: { inclination: number; phaseOffset: number; color: string; period: number }) {
  const dotRef = useRef<THREE.Mesh>(null)

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

  const orbitGeo = useMemo(() =>
    new THREE.BufferGeometry().setFromPoints(orbitPts), [orbitPts])

  const orbitMat = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.18,
  }), [color])

  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.8,
  }), [color])

  useEffect(() => () => {
    orbitGeo.dispose(); orbitMat.dispose(); dotMat.dispose()
  }, [orbitGeo, orbitMat, dotMat])

  useFrame(({ clock }) => {
    if (!dotRef.current) return
    const incRad = (inclination * Math.PI) / 180
    const angle  = ((clock.getElapsedTime() * 0.6 / period + phaseOffset) % 1) * Math.PI * 2
    dotRef.current.position.set(
      Math.cos(angle) * ORBIT_RADIUS,
      Math.sin(angle) * Math.sin(incRad) * ORBIT_RADIUS,
      Math.sin(angle) * Math.cos(incRad) * ORBIT_RADIUS,
    )
  })

  return (
    <group>
      <primitive object={new THREE.Line(orbitGeo, orbitMat)} />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.010, 8, 8]} />
        <primitive object={dotMat} />
      </mesh>
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

// ─── Smooth camera fly-to ───────────────────────────────────────────────────
function CameraController() {
  const { camera } = useThree()
  const focusedCoords = useAppStore((s) => s.focusedCoords)
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.25, 4.5))

  useEffect(() => {
    if (!focusedCoords) return
    const [tx, ty, tz] = latLngToVector3(focusedCoords.lat, focusedCoords.lng, 4.5)
    targetRef.current.set(tx, ty, tz)
  }, [focusedCoords])

  useFrame(() => {
    camera.position.lerp(targetRef.current, 0.035)
  })

  return null
}

// ─── Lighting — strong sun + very low ambient for real day/night ─────────────
function Lighting() {
  return (
    <>
      {/* Very low ambient — night side should be nearly dark */}
      <ambientLight intensity={0.04} color="#b8c8e8" />
      {/* Primary sun — warm, strong directional */}
      <directionalLight
        position={[8, 3, 5]}
        intensity={3.4}
        color="#FFF2E4"
        castShadow
      />
      {/* Subtle cool backfill — prevents total black on back hemisphere */}
      <pointLight position={[-7, -3, -6]} intensity={0.18} color="#0a0a28" />
    </>
  )
}

// ─── Full scene inside Canvas ───────────────────────────────────────────────
function EarthScene() {
  const results    = useAppStore((s) => s.results)
  const showOrbits = useAppStore((s) => s.showOrbits)
  const isRotating = useAppStore((s) => s.isRotating)

  const proceduralFallback = <ProceduralEarth isRotating={isRotating} />

  return (
    <>
      <Lighting />
      <Stars radius={280} depth={55} count={4000} factor={2.8} fade speed={0.2} />
      {/* Atmosphere glow rendered first (BackSide, no depth-write) */}
      <AtmosphereGlow />
      {/* Try real textures → fall back to procedural seamlessly */}
      <TextureErrorBoundary fallback={proceduralFallback}>
        <Suspense fallback={proceduralFallback}>
          <TexturedEarth isRotating={isRotating} />
        </Suspense>
      </TextureErrorBoundary>
      {showOrbits && satelliteOrbits.map((o) => (
        <SatelliteOrbitPath key={o.id} {...o} />
      ))}
      <Hotspots />
      <ResultArcs results={results} />
      <CameraController />
    </>
  )
}

// ─── Canvas wrapper ──────────────────────────────────────────────────────────
interface EarthGlobeProps {
  className?: string
}

export default function EarthGlobe({ className = '' }: EarthGlobeProps) {
  const setEarthLoaded = useAppStore((s) => s.setEarthLoaded)

  return (
    <EarthErrorBoundary>
      <div className={`w-full h-full ${className}`}>
        <Canvas
          camera={{ position: [0, 0.25, 4.5], fov: 44 }}
          dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
          gl={{
            antialias:                  true,
            alpha:                      true,
            powerPreference:            'high-performance',
            failIfMajorPerformanceCaveat: false,
          }}
          shadows
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              console.warn('[EarthGlobe] WebGL context lost')
            })
            gl.domElement.addEventListener('webglcontextrestored', () => {
              console.info('[EarthGlobe] WebGL context restored')
            })
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
