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
          <div className="font-display text-display-xl font-bold text-text-primary tracking-tight opacity-10">
            AKSHA
          </div>
          <div className="text-body-m text-text-tertiary opacity-30 mt-2">
            Copilot panel open on the right
          </div>
        </div>
      </div>
    </div>
  )
}
