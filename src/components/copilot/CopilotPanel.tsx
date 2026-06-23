import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, CheckCircle2, Loader2, Database, Search, GitMerge, Star } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { generateId } from '@/lib/utils'
import type { CopilotMessage } from '@/types'
import ChatMessage from './ChatMessage'
import SuggestedPrompts from './SuggestedPrompts'

interface ReasoningStep {
  icon: React.ElementType
  label: string
  detail: string
  done: boolean
}

const MOCK_RESPONSES: Record<string, CopilotMessage['content']> = {
  default: 'Searching the ISRO Bhuvan and Copernicus archive for relevant observations.',
  flood: 'Found **12 observations** matching flood inundation signatures in the Brahmaputra basin (2022–2024).\n\n**Key findings:**\n· Peak inundation: 15 Aug 2024 — 26.2°N, 91.8°E\n· Area affected: ~4,200 km²\n· 8 of 12 results are SAR-derived (C-band, σ⁰ VV)\n· Confidence: 94.2%\n\nResults highlighted on globe. Opening Intelligence Timeline now.',
  sar: 'Retrieving optical equivalents for your SAR query using cross-modal embedding alignment.\n\n**Cross-modal confidence: 89.3%**\n\nTop 3 Sentinel-2 matches found with vegetation similarity above 85%. SAR backscatter → spectral reflectance translation applied via shared embedding space.',
  vegetation: 'Located **9 similar scenes** with matching vegetation stress signatures (post-monsoon phenology).\n\n**Filter criteria:**\n· Temporal window: Oct–Dec\n· NDVI similarity > 78%\n· Resolution ≤ 30m\n· Sensor: Sentinel-2A MSI L2A\n\nConfidence: 82.1%',
  explain: 'Result #3 scored **88.5%** similarity. Primary retrieval drivers:\n\n1. **Vegetation structure** (82%) — matching riparian corridor morphology\n2. **Water body pattern** (72%) — both show braided channel characteristics\n3. **Surface texture** (68%) — similar alluvial deposit signatures\n4. **Spatial correlation** (91%) — high geometric alignment in embedding space\n\nLower cloud score (48%) expected for October acquisition. Embedding distance: 0.118.',
}

const REASONING_STEPS: Record<string, ReasoningStep[]> = {
  flood: [
    { icon: Search,    label: 'Parsing query intent',      detail: 'Flood + location + temporal range detected', done: true },
    { icon: Database,  label: 'Archive search',             detail: 'Scanning ISRO Bhuvan · Copernicus · JAXA', done: true },
    { icon: GitMerge,  label: 'Cross-modal alignment',      detail: 'SAR → Optical embedding translation',        done: true },
    { icon: Star,      label: 'Ranking results',            detail: 'Graph re-ranking applied · 12 matches',       done: true },
  ],
  sar: [
    { icon: Search,    label: 'Analyzing SAR modality',     detail: 'C-band backscatter signature extracted',      done: true },
    { icon: GitMerge,  label: 'Cross-modal translation',    detail: 'SAR → Optical alignment (89.3% conf.)',       done: true },
    { icon: Database,  label: 'Optical archive search',     detail: 'Sentinel-2, Cartosat-3 scanned',              done: true },
    { icon: Star,      label: 'Feature matching',           detail: 'Vegetation + water similarity applied',       done: true },
  ],
  default: [
    { icon: Search,    label: 'Parsing intent',             detail: 'Query analyzed',                              done: true },
    { icon: Database,  label: 'Archive search',             detail: 'ISRO Bhuvan · Copernicus',                   done: true },
    { icon: Star,      label: 'Ranking',                    detail: 'Results scored and ranked',                   done: true },
  ],
}

function getResponseKey(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('flood') || lower.includes('inundation') || lower.includes('brahmaputra') || lower.includes('assam')) return 'flood'
  if (lower.includes('sar') || lower.includes('optical') || lower.includes('similar') || lower.includes('find')) return 'sar'
  if (lower.includes('vegetation') || lower.includes('stress') || lower.includes('multispectral')) return 'vegetation'
  if (lower.includes('explain') || lower.includes('why') || lower.includes('result') || lower.includes('rank')) return 'explain'
  return 'default'
}

function ReasoningPanel({ steps, confidence }: { steps: ReasoningStep[]; confidence: number }) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(8,13,22,0.8)', border: '1px solid rgba(45,55,72,0.3)' }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}
      >
        <div className="flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 text-teal-primary" />
          <span className="text-overline text-text-tertiary">REASONING CHAIN</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-overline text-text-tertiary hover:text-text-secondary"
        >
          HIDE
        </button>
      </div>
      <div className="p-3 space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="flex-shrink-0 mt-0.5">
              {step.done
                ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-primary" />
                : <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-primary font-medium">{step.label}</div>
              <div className="text-overline text-text-tertiary mt-0.5">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}
      >
        <span className="text-overline text-text-tertiary">Confidence</span>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${confidence}%`, background: confidence > 85 ? '#14B8A6' : confidence > 70 ? '#3B82F6' : '#F59E0B' }}
            />
          </div>
          <span
            className="font-mono text-caption font-semibold"
            style={{ color: confidence > 85 ? '#14B8A6' : confidence > 70 ? '#3B82F6' : '#F59E0B' }}
          >
            {confidence.toFixed(1)}%
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function CopilotPanel() {
  const messages   = useAppStore((s) => s.messages)
  const isTyping   = useAppStore((s) => s.isTyping)
  const suggestionsVisible = useAppStore((s) => s.suggestionsVisible)
  const addMessage = useAppStore((s) => s.addMessage)
  const setTyping  = useAppStore((s) => s.setTyping)
  const startSearch = useAppStore((s) => s.startSearch)

  const [input, setInput] = useState('')
  const [reasoningPanels, setReasoningPanels] = useState<Map<string, { steps: ReasoningStep[]; confidence: number }>>(new Map())
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

    await new Promise((r) => setTimeout(r, 1600))

    const key = getResponseKey(text)
    const response = MOCK_RESPONSES[key] ?? MOCK_RESPONSES.default
    const steps = REASONING_STEPS[key] ?? REASONING_STEPS.default
    const confidence = key === 'flood' ? 94.2 : key === 'sar' ? 89.3 : key === 'vegetation' ? 82.1 : key === 'explain' ? 88.5 : 78.0

    const msgId = generateId()
    const assistantMsg: CopilotMessage = {
      id: msgId,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      actions: [
        { type: 'fly_to',      label: 'View on Earth',        payload: { lat: 26.12, lng: 91.74 } },
        { type: 'show_results', label: 'Show in Results Dock', payload: {} },
      ],
    }
    addMessage(assistantMsg)
    setTyping(false)

    setReasoningPanels((prev) => {
      const next = new Map(prev)
      next.set(msgId, { steps, confidence })
      return next
    })

    if (text.toLowerCase().includes('find') || text.toLowerCase().includes('retrieve') ||
        text.toLowerCase().includes('show') || text.toLowerCase().includes('flood')) {
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
            className="p-3 rounded-xl"
            style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.18)' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-primary" />
              <span className="text-body-s text-teal-primary font-semibold">AKSHA Copilot</span>
              <span className="mission-badge mission-badge-active ml-auto">ACTIVE</span>
            </div>
            <p className="text-body-s text-text-secondary leading-relaxed">
              Earth Intelligence interface. Ask me to retrieve cross-modal observations, analyze temporal change, or explain any result with full reasoning.
            </p>
          </motion.div>
        )}

        {suggestionsVisible && messages.length === 0 && (
          <SuggestedPrompts onSelect={sendMessage} />
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <div key={msg.id}>
              <ChatMessage message={msg} />
              {msg.role === 'assistant' && reasoningPanels.has(msg.id) && (
                <div className="mt-2 ml-2">
                  <ReasoningPanel
                    steps={reasoningPanels.get(msg.id)!.steps}
                    confidence={reasoningPanels.get(msg.id)!.confidence}
                  />
                </div>
              )}
            </div>
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
            <span className="text-caption text-text-tertiary">AKSHA Copilot is reasoning…</span>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(45,55,72,0.3)' }}>
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
            placeholder="Ask about observations, locations, or temporal change…"
            rows={2}
            className="flex-1 input-field resize-none text-body-s leading-relaxed"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className="p-2.5 rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
            style={{ background: '#14B8A6' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}
