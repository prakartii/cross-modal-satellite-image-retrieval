import { useState, useEffect } from 'react'
import TopBar from './TopBar'
import LeftPanel from './LeftPanel'
import RightPanel from './RightPanel'
import BottomBar from './BottomBar'
import CommandPalette from '@/components/ui/CommandPalette'
import { useAppStore } from '@/store/useAppStore'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [leftSection, setLeftSection]   = useState('search')
  const [rightSection, setRightSection] = useState('insights')
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)
  const setCommandPalette   = useAppStore((s) => s.setCommandPalette)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPalette(true)
      }
      if (e.key === 'Escape') {
        setCommandPalette(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandPalette])

  return (
    <div className="fixed inset-0 bg-canvas overflow-hidden">
      <TopBar />
      <LeftPanel  activeSection={leftSection}  onSectionChange={setLeftSection} />
      <RightPanel activeSection={rightSection} onSectionChange={setRightSection} />

      {/* Main content area */}
      <main className="absolute inset-0 top-13">
        {children}
      </main>

      <BottomBar />

      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPalette(false)} />
      )}
    </div>
  )
}
