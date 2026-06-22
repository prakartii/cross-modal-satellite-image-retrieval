interface ProgressRingProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
}

export default function ProgressRing({
  value, size = 72, strokeWidth = 5, color = '#3B82F6',
  label, sublabel,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#2D3748" strokeWidth={strokeWidth}
          />
          {/* Fill */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-caption font-semibold" style={{ color }}>
            {Math.round(value)}
          </span>
        </div>
      </div>
      {label && <span className="text-caption text-text-secondary text-center leading-tight">{label}</span>}
      {sublabel && <span className="text-overline text-text-tertiary text-center">{sublabel}</span>}
    </div>
  )
}
