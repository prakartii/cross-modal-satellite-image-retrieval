import { ArrowRight } from 'lucide-react'

const PROMPTS = [
  'Show flood progression in Assam between 2022 and 2024',
  'Find SAR scenes similar to this query',
  'Show multispectral matches with vegetation stress',
  'Retrieve optical equivalents of this SAR image',
  'Explain why result #3 ranked so high',
]

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="space-y-1.5">
      <div className="overline-label mb-2">Example Queries</div>
      {PROMPTS.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg
                     hover:border-teal-primary/40 hover:bg-teal-surface/10 transition-all text-left group"
          style={{ background: 'rgba(17,24,39,0.5)', border: '1px solid rgba(45,55,72,0.3)' }}
        >
          <span className="text-body-s text-text-secondary group-hover:text-text-primary transition-colors leading-tight">
            "{p}"
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 group-hover:text-teal-primary transition-colors" />
        </button>
      ))}
    </div>
  )
}
