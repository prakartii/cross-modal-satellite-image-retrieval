import { motion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { CopilotMessage } from '@/types'

interface ChatMessageProps {
  message: CopilotMessage
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const setFocusedCoords = useAppStore((s) => s.setFocusedCoords)
  const toggleDock = useAppStore((s) => s.toggleDock)

  const handleAction = (action: NonNullable<CopilotMessage['actions']>[0]) => {
    if (action.type === 'fly_to') {
      const payload = action.payload as { lat: number; lng: number }
      setFocusedCoords({ lat: payload.lat, lng: payload.lng })
    }
    if (action.type === 'show_results') {
      toggleDock()
    }
  }

  // Parse markdown-style bold
  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-text-primary font-semibold">{part.slice(2, -2)}</strong>
      }
      return <span key={i}>{part}</span>
    })
  }

  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] px-3 py-2.5 bg-blue-surface border border-blue-primary/20 rounded-xl rounded-tr-sm">
          <p className="text-body-s text-text-secondary leading-relaxed">{message.content}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex gap-2.5"
    >
      <div className="w-6 h-6 rounded-full bg-teal-surface border border-teal-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3 h-3 text-teal-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="px-3 py-2.5 bg-card border border-border rounded-xl rounded-tl-sm">
          <p className="text-body-s text-text-secondary leading-relaxed whitespace-pre-line">
            {renderContent(message.content)}
          </p>
        </div>
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.actions.map((action) => (
              <button
                key={action.type}
                onClick={() => handleAction(action)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-lg
                           text-caption text-text-secondary hover:text-text-primary hover:border-border-hover
                           transition-all"
              >
                {action.label}
                <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
