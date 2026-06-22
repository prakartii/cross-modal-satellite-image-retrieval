import { ArrowRight } from 'lucide-react'

const PROMPTS = [
  'Find flood-like regions in Northeast India',
  'Retrieve optical equivalents of this SAR image',
  'Show similar agricultural zones post-monsoon',
  'Explain why result #3 ranked so high',
]

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="space-y-1.5">
      <div className="overline-label mb-2">Suggested Queries</div>
      {PROMPTS.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-card border border-border
                     rounded-lg hover:border-teal-primary/40 hover:bg-teal-surface/10 transition-all text-left group"
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
