import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'

export default function AICopilotPage() {
  const toggleCopilot = useAppStore((s) => s.toggleCopilot)
  const copilotOpen   = useAppStore((s) => s.copilotOpen)

  useEffect(() => {
    if (!copilotOpen) toggleCopilot()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full h-full relative">
      <EarthGlobe />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-heading-1 text-text-secondary/40 mb-2">AI Earth Copilot</div>
          <div className="text-body-m text-text-tertiary/40">Open the copilot panel on the right to interact</div>
        </div>
      </div>
    </div>
  )
}
