import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import GraphExplorer from '@/components/graph/GraphExplorer'

export default function GeoSemanticGraphPage() {
  const graphExplorerOpen = useAppStore((s) => s.graphExplorerOpen)
  const toggleGraphExplorer = useAppStore((s) => s.toggleGraphExplorer)

  useEffect(() => {
    if (!graphExplorerOpen) toggleGraphExplorer()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return <GraphExplorer />
}
