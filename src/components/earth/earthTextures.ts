import * as THREE from 'three'

// ─── Shared terrain height function ────────────────────────────────────────
function h(lon: number, lat: number): number {
  return (
    Math.sin(lon * 1.7 + 0.9) * Math.cos(lat * 2.3 + 0.4) +
    Math.sin(lon * 3.1 - 0.7) * Math.sin(lat * 4.2 + 1.1) * 0.5 +
    Math.cos(lon * 5.3 + 1.4) * Math.cos(lat * 3.8 - 0.6) * 0.25 +
    Math.sin(lon * 7.9 - 1.2) * Math.sin(lat * 6.7 + 0.8) * 0.125
  ) / 1.875
}

// ─── Day texture (2048×1024) — richer ocean depth + land detail ─────────────
export function createEarthDayTexture(): THREE.CanvasTexture {
  const W = 2048, H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2 - Math.PI
      const lat = (y / H) * Math.PI - Math.PI / 2
      const t   = h(lon, lat)
      const la  = Math.abs(lat)
      const latDeg = (lat / Math.PI) * 180

      let r = 0, g = 0, b = 0

      // Polar ice caps
      if (la > 1.28) {
        const fade = Math.min(1, (la - 1.28) / 0.28)
        r = Math.round(210 + fade * 35)
        g = Math.round(225 + fade * 25)
        b = Math.round(240 + fade * 12)
      } else if (t > 0.06) {
        const elev = (t - 0.06) / 0.55
        const desert = Math.sin(lon * 0.9 + 1.1) > 0.33 && la < 0.52
        const subtropic = Math.abs(latDeg) > 20 && Math.abs(latDeg) < 35

        if (la > 1.05) {
          // Sub-polar tundra
          r = 110; g = 128; b = 110
        } else if (elev > 0.72) {
          // High mountains / snow
          r = 208; g = 206; b = 204
        } else if (elev > 0.52) {
          // Mountain rock
          r = 128; g = 96; b = 68
        } else if (elev > 0.42) {
          // Hill / brown terrain
          r = 118; g = 88; b = 60
        } else if (desert && subtropic) {
          // Subtropical desert (Rajasthan, Sahara)
          r = 198; g = 168; b = 106
        } else if (desert) {
          r = 182; g = 152; b = 92
        } else if (la < 0.28) {
          // Tropical rainforest
          r = 24; g = 96; b = 28
        } else if (la < 0.45) {
          // Tropical to subtropical
          r = 34; g = 108; b = 36
        } else {
          // Temperate
          r = 52; g = 102; b = 42
        }
      } else {
        // Ocean — depth-based coloring
        const depth = Math.max(0, (0.06 - t) / 0.40)
        const shelf = depth < 0.15  // continental shelf
        if (shelf) {
          // Shallow coastal — lighter teal-blue
          r = Math.round(18 + depth * 20)
          g = Math.round(62 + depth * 30)
          b = Math.round(110 + depth * 40)
        } else {
          // Deep ocean — rich dark blue
          r = Math.round(6  + depth * 8)
          g = Math.round(20 + depth * 30)
          b = Math.round(70 + depth * 58)
        }
      }

      const i = (y * W + x) * 4
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

// ─── City light positions [lat_deg, lon_deg, intensity] ────────────────────
const CITY_LIGHTS: [number, number, number][] = [
  // India subcontinent
  [ 28.6,  77.2, 1.00], // Delhi
  [ 19.1,  72.9, 0.90], // Mumbai
  [ 22.6,  88.4, 0.82], // Kolkata
  [ 13.0,  80.3, 0.80], // Chennai
  [ 12.9,  77.6, 0.72], // Bengaluru
  [ 17.4,  78.5, 0.70], // Hyderabad
  [ 23.0,  72.6, 0.60], // Ahmedabad
  [ 26.9,  80.9, 0.55], // Lucknow
  [ 26.1,  91.7, 0.50], // Guwahati
  // SE & E Asia
  [ 31.2, 121.5, 0.92], // Shanghai
  [ 39.9, 116.4, 0.90], // Beijing
  [ 22.3, 114.2, 0.85], // Hong Kong
  [ 35.7, 139.7, 0.95], // Tokyo
  [ 37.6, 126.9, 0.82], // Seoul
  [ 14.1, 100.5, 0.72], // Bangkok
  [  1.4, 103.8, 0.80], // Singapore
  [ 21.0, 105.8, 0.65], // Hanoi
  // Middle East
  [ 24.5,  54.4, 0.70], // Abu Dhabi
  [ 25.2,  55.3, 0.72], // Dubai
  [ 30.0,  31.2, 0.75], // Cairo
  [ 24.7,  46.7, 0.68], // Riyadh
  // Europe
  [ 48.9,   2.4, 0.88], // Paris
  [ 51.5,  -0.1, 0.90], // London
  [ 52.5,  13.4, 0.82], // Berlin
  [ 55.8,  37.6, 0.85], // Moscow
  [ 41.0,  28.9, 0.75], // Istanbul
  [ 40.4,  -3.7, 0.72], // Madrid
  [ 45.5,   9.2, 0.75], // Milan
  // Americas
  [ 40.7, -74.0, 0.95], // New York
  [ 34.1,-118.2, 0.90], // Los Angeles
  [ 41.9, -87.6, 0.88], // Chicago
  [ 29.8, -95.4, 0.80], // Houston
  [ 43.7, -79.4, 0.75], // Toronto
  [-23.6, -46.6, 0.85], // São Paulo
  [-34.6, -58.4, 0.78], // Buenos Aires
  // Africa
  [ -26.2,  28.0, 0.75], // Johannesburg
  [  6.5,   3.4, 0.68], // Lagos
  // Australia
  [-33.9, 151.2, 0.80], // Sydney
  [-37.8, 145.0, 0.72], // Melbourne
]

function latLonToPx(latDeg: number, lonDeg: number, W: number, H: number): [number, number] {
  const x = Math.round(((lonDeg + 180) / 360) * W)
  const y = Math.round(((90 - latDeg) / 180) * H)
  return [x, y]
}

// ─── Night / city-lights texture (1024×512) — actual city positions ─────────
export function createEarthNightTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data

  // Pre-compute city light contribution for each pixel
  const lightBuf = new Float32Array(W * H)

  for (const [latDeg, lonDeg, cityIntensity] of CITY_LIGHTS) {
    const [cx, cy] = latLonToPx(latDeg, lonDeg, W, H)
    const sigma = 12 // spread radius in pixels
    const spread = Math.ceil(sigma * 3)

    for (let dy = -spread; dy <= spread; dy++) {
      for (let dx = -spread; dx <= spread; dx++) {
        const px = (cx + dx + W) % W
        const py = cy + dy
        if (py < 0 || py >= H) continue
        const dist2 = dx * dx + dy * dy
        const gauss = Math.exp(-dist2 / (2 * sigma * sigma))
        lightBuf[py * W + px] += gauss * cityIntensity
      }
    }
  }

  // Also add a subtle land-based glow (road network, scattered settlements)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2 - Math.PI
      const lat = (y / H) * Math.PI - Math.PI / 2
      const t   = h(lon, lat)
      const isLand = t > 0.06 && Math.abs(lat) < 1.22

      let glow = lightBuf[y * W + x]

      if (isLand && glow < 0.04) {
        // Scattered rural/highway light at low level
        const noise = (Math.sin(x * 47.1) * Math.cos(y * 31.7) + 1) * 0.5
        const landElev = Math.max(0, t - 0.06)
        const scatter = noise * landElev * 0.06
        glow += scatter
      }

      glow = Math.min(1.0, glow)

      // Convert to warm city-light orange-amber color
      const r = Math.round(Math.min(255, glow * 255))
      const g = Math.round(Math.min(255, glow * 195))
      const b = Math.round(Math.min(255, glow * 65))

      const i = (y * W + x) * 4
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

// ─── Cloud texture with FBM value noise (1024×512) ─────────────────────────

function hash21(px: number, py: number): number {
  const v = Math.sin(px * 127.1 + py * 311.7) * 43758.5453123
  return v - Math.floor(v)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3.0 - 2.0 * fx)
  const uy = fy * fy * (3.0 - 2.0 * fy)
  const a = hash21(ix,     iy)
  const b = hash21(ix + 1, iy)
  const c = hash21(ix,     iy + 1)
  const dd = hash21(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + dd) * ux * uy
}

function fbm(x: number, y: number): number {
  let val = 0, amp = 0.5, freq = 1.0, total = 0
  for (let i = 0; i < 6; i++) {
    val   += valueNoise(x * freq, y * freq) * amp
    total += amp
    amp   *= 0.5
    freq  *= 2.1
  }
  return val / total
}

export function createCloudTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const nx = (i / W) * 9.0
      const ny = (j / H) * 4.5

      const raw = fbm(nx, ny)

      // Latitude factor: fewer clouds near poles
      const lat = Math.abs((j / H) - 0.5) * 2.0
      const latWeight = 1.0 - lat * lat * 0.5

      // Extra weight in ITCZ band (tropical ~10° lat)
      const itcz = Math.exp(-((lat - 0.08) * (lat - 0.08)) / (2 * 0.12 * 0.12)) * 0.15

      const c = raw * latWeight + itcz
      const threshold = 0.48
      const edge      = 0.22
      const alpha     = c > threshold
        ? Math.min(1.0, (c - threshold) / edge) * 0.82
        : 0.0

      const v = Math.round(alpha * 255)
      const idx = (j * W + i) * 4
      d[idx]     = v
      d[idx + 1] = v
      d[idx + 2] = v
      d[idx + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}
