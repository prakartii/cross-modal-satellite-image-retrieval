import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { generateId } from '@/lib/utils'
import type { CopilotMessage } from '@/types'
import ChatMessage from './ChatMessage'
import SuggestedPrompts from './SuggestedPrompts'

const MOCK_RESPONSES: Record<string, CopilotMessage['content']> = {
  default: 'I\'m searching the ISRO Bhuvan and Copernicus archive for relevant observations. Let me process that for you.',
  flood: 'Found 12 observations matching flood inundation signatures in the Brahmaputra basin (Jun–Oct 2024).\n\n**Key findings:**\n· Peak inundation: 15 Aug 2024 (26.2°N, 91.8°E)\n· Area affected: ~4,200 km²\n· 8 of 12 results are SAR-derived\n\nHighlighting on globe and populating results dock now.',
  optical: 'Retrieving optical equivalents for your SAR query. Cross-modal alignment confidence: 89.3%.\n\nTop 3 Sentinel-2 matches found with vegetation similarity above 85%. Results are appearing in the dock.',
  agricultural: 'Located 9 similar agricultural zones with matching crop pattern signatures (post-monsoon phenology).\n\nFiltered by: Oct–Dec temporal window · NDVI similarity > 78% · Resolution ≤ 30m',
  explain: 'Result #3 scored **88.5%** similarity. Primary drivers:\n\n1. Vegetation structure (82%) — matching riparian corridor morphology\n2. Water body pattern (72%) — both show braided channel characteristics\n3. Surface texture (68%) — similar alluvial deposit signatures\n\nLower cloud score (48%) due to seasonal cloud cover in multispectral bands — expected for October acquisition.',
}

function getResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('flood') || lower.includes('inundation') || lower.includes('brahmaputra')) return MOCK_RESPONSES.flood
  if (lower.includes('optical') || lower.includes('sar')) return MOCK_RESPONSES.optical
  if (lower.includes('agricultural') || lower.includes('crop') || lower.includes('farm')) return MOCK_RESPONSES.agricultural
  if (lower.includes('explain') || lower.includes('why') || lower.includes('result')) return MOCK_RESPONSES.explain
  return MOCK_RESPONSES.default
}

export default function CopilotPanel() {
  const messages   = useAppStore((s) => s.messages)
  const isTyping   = useAppStore((s) => s.isTyping)
  const suggestionsVisible = useAppStore((s) => s.suggestionsVisible)
  const addMessage = useAppStore((s) => s.addMessage)
  const setTyping  = useAppStore((s) => s.setTyping)
  const startSearch = useAppStore((s) => s.startSearch)

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = async (text: string) => {
    if (!text.trim()) return

    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    addMessage(userMsg)
    setInput('')
    setTyping(true)

    // Simulate AI response
    await new Promise((r) => setTimeout(r, 1400))

    const response = getResponse(text)
    const assistantMsg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      actions: [
        { type: 'fly_to', label: 'View on Earth', payload: { lat: 26.12, lng: 91.74 } },
        { type: 'show_results', label: 'Show in Results Dock', payload: {} },
      ],
    }
    addMessage(assistantMsg)
    setTyping(false)

    // If the response is about search, trigger a search
    if (text.toLowerCase().includes('find') || text.toLowerCase().includes('retrieve')) {
      setTimeout(() => startSearch(), 800)
    }
  }

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {/* Welcome */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-teal-surface/30 border border-teal-primary/20 rounded-xl"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-primary" />
              <span className="text-body-s text-teal-primary font-medium">AI Earth Copilot</span>
            </div>
            <p className="text-body-s text-text-secondary leading-relaxed">
              How can I help you search the archive? Ask me to find regions, retrieve cross-modal matches, or explain any result.
            </p>
          </motion.div>
        )}

        {suggestionsVisible && messages.length === 0 && (
          <SuggestedPrompts onSelect={sendMessage} />
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-2"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-teal-primary"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 0.9, delay: i * 0.15, repeat: Infinity }}
                />
              ))}
            </div>
            <span className="text-caption text-text-tertiary">Copilot is thinking...</span>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Ask about your results or search the archive..."
            rows={2}
            className="flex-1 input-field resize-none text-body-s leading-relaxed"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className="p-2.5 rounded-lg bg-teal-primary hover:bg-teal-dim text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}
