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

// ─── Day texture (1024×512 canvas) ─────────────────────────────────────────
export function createEarthDayTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512
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

      let r = 0, g = 0, b = 0

      if (la > 1.28) {
        const fade = Math.min(1, (la - 1.28) / 0.3)
        r = Math.round(188 + fade * 40)
        g = Math.round(208 + fade * 30)
        b = Math.round(228 + fade * 20)
      } else if (t > 0.06) {
        const elev = (t - 0.06) / 0.55
        const desert = Math.sin(lon * 0.9 + 1.1) > 0.33 && la < 0.52
        if (la > 1.05) {
          r = 118; g = 138; b = 118
        } else if (elev > 0.72) {
          r = 198; g = 196; b = 194
        } else if (elev > 0.42) {
          r = 112; g = 82; b = 55
        } else if (desert) {
          r = 190; g = 158; b = 102
        } else if (la < 0.45) {
          r = 38; g = 108; b = 36
        } else {
          r = 52; g = 98; b = 42
        }
      } else {
        const depth = Math.max(0, (0.06 - t) / 0.35)
        r = Math.round(10  + depth * 6)
        g = Math.round(36  + depth * 14)
        b = Math.round(90  + depth * 48)
      }

      const i = (y * W + x) * 4
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

// ─── Night / city-lights texture (512×256) ─────────────────────────────────
export function createEarthNightTexture(): THREE.CanvasTexture {
  const W = 512, H = 256
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
      const isLand = t > 0.06 && Math.abs(lat) < 1.22
      let r = 0, g = 0, b = 0

      if (isLand) {
        const noise = (Math.sin(x * 23.7) * Math.cos(y * 17.3) + 1) * 0.5
        const intensity = Math.max(0, t - 0.06) * noise * 1.4
        r = Math.round(Math.min(255, intensity * 230))
        g = Math.round(Math.min(255, intensity * 185))
        b = Math.round(Math.min(255, intensity * 75))
      }

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
// Multi-octave fractal noise gives organic, wispy cloud patterns.

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
      // Stretch longitude more than latitude for horizontal banding
      const nx = (i / W) * 9.0
      const ny = (j / H) * 4.5

      const raw = fbm(nx, ny)

      // Latitude fade: fewer clouds near poles, denser in tropics/mid-lat
      const lat = Math.abs((j / H) - 0.5) * 2.0   // 0=equator, 1=pole
      const latWeight = 1.0 - lat * lat * 0.4

      const c = raw * latWeight
      const threshold = 0.50
      const edge      = 0.20
      const alpha     = c > threshold
        ? Math.min(1.0, (c - threshold) / edge) * 0.88
        : 0.0

      const v = Math.round(alpha * 255)
      const idx = (j * W + i) * 4
      // Write into all channels — alphaMap reads .g, but writing all is safe
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
