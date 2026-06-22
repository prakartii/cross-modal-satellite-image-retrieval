import { formatCoordinates } from '@/lib/utils'
import type { Coordinates } from '@/types'

interface CoordinateDisplayProps {
  coords: Coordinates
  showAlt?: boolean
  className?: string
}

export default function CoordinateDisplay({ coords, showAlt = false, className = '' }: CoordinateDisplayProps) {
  return (
    <div className={`font-mono text-caption text-text-tertiary leading-relaxed ${className}`}>
      <div>{formatCoordinates(coords.lat, coords.lng)}</div>
      <div>WGS84 · UTM 45R{showAlt && coords.alt ? ` · ${coords.alt}m MSL` : ''}</div>
    </div>
  )
}
