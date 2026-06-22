import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { SensorType } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  const latDeg = Math.floor(Math.abs(lat))
  const latMin = Math.floor((Math.abs(lat) - latDeg) * 60)
  const latSec = Math.floor(((Math.abs(lat) - latDeg) * 60 - latMin) * 60)
  const lngDeg = Math.floor(Math.abs(lng))
  const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60)
  const lngSec = Math.floor(((Math.abs(lng) - lngDeg) * 60 - lngMin) * 60)
  return `${latDeg}°${latMin}'${latSec}"${latDir}  ${lngDeg}°${lngMin}'${lngSec}"${lngDir}`
}

export function formatDecimalCoords(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? 'E' : 'W'}`
}

export function getSensorColor(type: SensorType): string {
  switch (type) {
    case 'SAR':          return '#3B82F6'
    case 'Optical':      return '#22C55E'
    case 'Multispectral': return '#F59E0B'
    default:             return '#94A3B8'
  }
}

export function getSensorClass(type: SensorType): string {
  switch (type) {
    case 'SAR':          return 'sensor-sar'
    case 'Optical':      return 'sensor-optical'
    case 'Multispectral': return 'sensor-multi'
    default:             return ''
  }
}

export function getSimilarityColor(score: number): string {
  if (score >= 90) return '#3B82F6'
  if (score >= 75) return '#14B8A6'
  if (score >= 60) return '#F59E0B'
  return '#EF4444'
}

export function formatSimilarity(score: number): string {
  return `${score.toFixed(1)}%`
}

export function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC'
}

export function latLngToVector3(lat: number, lng: number, radius = 1): [number, number, number] {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
     (radius * Math.cos(phi)),
     (radius * Math.sin(phi) * Math.sin(theta)),
  ]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}
