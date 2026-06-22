import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Globe, Upload, BarChart3, Network, Sparkles, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

const COMMANDS = [
  { id: 'command-center', label: 'Go to Command Center', icon: Globe,      shortcut: '⌘1' },
  { id: 'search',         label: 'Open Search Workspace', icon: Search,     shortcut: '⌘2' },
  { id: 'upload',         label: 'Upload Imagery',         icon: Upload,     shortcut: '⌘U' },
  { id: 'copilot',        label: 'Open AI Earth Copilot',  icon: Sparkles,   shortcut: '⌘/' },
  { id: 'graph',          label: 'Open Graph Explorer',    icon: Network,    shortcut: '⌘G' },
  { id: 'analytics',      label: 'View Analytics',          icon: BarChart3,  shortcut: '⌘A' },
]

interface CommandPaletteProps {
  onClose: () => void
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const setActiveView = useAppStore((s) => s.setActiveView)
  const toggleCopilot = useAppStore((s) => s.toggleCopilot)
  const toggleGraphExplorer = useAppStore((s) => s.toggleGraphExplorer)

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase())
  )

  const execute = (id: string) => {
    if (id === 'copilot') { toggleCopilot(); onClose(); return }
    if (id === 'graph') { toggleGraphExplorer(); onClose(); return }
    setActiveView(id as Parameters<typeof setActiveView>[0])
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh] bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: -8 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-lg mx-4 panel-glass rounded-xl shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-body-m text-text-primary placeholder:text-text-tertiary outline-none"
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-text-tertiary">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-2">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => execute(cmd.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group text-left"
            >
              <div className="w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center flex-shrink-0">
                <cmd.icon className="w-3.5 h-3.5 text-text-secondary" />
              </div>
              <span className="flex-1 text-body-m text-text-secondary group-hover:text-text-primary transition-colors">
                {cmd.label}
              </span>
              <span className="font-mono text-caption text-text-tertiary">{cmd.shortcut}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-4 text-caption text-text-tertiary">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
