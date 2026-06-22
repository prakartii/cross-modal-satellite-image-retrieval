import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as d3 from 'd3'
import { X, ZoomIn, ZoomOut, RotateCcw, Filter, Focus } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { mockGraphNodes, mockGraphEdges } from '@/data/mockGraph'
import { getSensorColor, cn } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import type { GraphNode, GraphEdge } from '@/types'

interface SimNode extends GraphNode {
  x: number; y: number; vx: number; vy: number
}
interface SimLink {
  source: SimNode; target: SimNode
  id: string; strength: number; relationshipType: string; label?: string
}

const EDGE_COLORS: Record<string, string> = {
  semantic: '#3B82F6',
  spatial:  '#14B8A6',
  temporal: '#F59E0B',
  event:    '#EF4444',
}

function nodeRadius(d: SimNode): number {
  if (d.type === 'query') return 28
  if (d.type === 'event') return 18
  return 14 + (d.similarityScore ?? 72) / 11
}

export default function GraphExplorer() {
  const toggleGraphExplorer = useAppStore((s) => s.toggleGraphExplorer)
  const svgRef       = useRef<SVGSVGElement>(null)
  const simRef       = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // refs for imperative D3 updates (hover / focus mode)
  const nodeElsRef  = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null)
  const linkElsRef  = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null)
  const linksData   = useRef<SimLink[]>([])

  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null)
  const [focusMode, setFocusMode]       = useState(false)
  const [dimensions, setDimensions]     = useState({ w: 900, h: 600 })

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Focus-mode: dim unconnected nodes/edges when selectedNode changes ──
  useEffect(() => {
    if (!nodeElsRef.current || !linkElsRef.current) return
    if (!selectedNode || !focusMode) {
      nodeElsRef.current.transition().duration(200).attr('opacity', 1)
      linkElsRef.current.transition().duration(200)
        .attr('stroke-opacity', (d: SimLink) => 0.28 + d.strength * 0.28)
        .attr('stroke-width',   (d: SimLink) => 0.8 + d.strength * 1.6)
      return
    }
    const connectedIds = new Set<string>([selectedNode.id])
    linksData.current.forEach((l) => {
      if (l.source.id === selectedNode.id || l.target.id === selectedNode.id) {
        connectedIds.add(l.source.id)
        connectedIds.add(l.target.id)
      }
    })
    nodeElsRef.current.transition().duration(220)
      .attr('opacity', (n: SimNode) => connectedIds.has(n.id) ? 1 : 0.12)
    linkElsRef.current.transition().duration(220)
      .attr('stroke-opacity', (l: SimLink) =>
        l.source.id === selectedNode.id || l.target.id === selectedNode.id ? 0.75 : 0.04
      )
      .attr('stroke-width', (l: SimLink) =>
        l.source.id === selectedNode.id || l.target.id === selectedNode.id
          ? 2 + l.strength * 2 : 0.5
      )
  }, [selectedNode, focusMode])

  useEffect(() => {
    if (!svgRef.current) return
    const { w, h } = dimensions

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Background grid
    const defs = svg.append('defs')
    const pattern = defs.append('pattern')
      .attr('id', 'grid-pattern')
      .attr('width', 32).attr('height', 32)
      .attr('patternUnits', 'userSpaceOnUse')
    pattern.append('path')
      .attr('d', 'M 32 0 L 0 0 0 32')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(45,55,72,0.18)')
      .attr('stroke-width', '0.5')
    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#grid-pattern)')

    // Arrow markers
    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -4 8 8').attr('refX', 22)
        .attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', color).attr('opacity', 0.5)
    })

    const nodes: SimNode[] = mockGraphNodes.map((n) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * 360,
      y: h / 2 + (Math.random() - 0.5) * 360,
      vx: 0, vy: 0,
    }))
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    const links: SimLink[] = mockGraphEdges
      .map((e) => {
        const source = nodeMap.get(e.source)
        const target = nodeMap.get(e.target)
        if (!source || !target) return null
        return { ...e, source, target }
      })
      .filter(Boolean) as SimLink[]

    linksData.current = links

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', ({ transform }) => g.attr('transform', transform.toString()))
    svg.call(zoom)

    const g = svg.append('g')

    // Edges
    const linkEls = g.append('g').selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => EDGE_COLORS[d.relationshipType] ?? '#2D3748')
      .attr('stroke-opacity', (d) => 0.28 + d.strength * 0.28)
      .attr('stroke-width', (d) => 0.8 + d.strength * 1.6)
      .attr('stroke-dasharray', (d) => d.relationshipType === 'temporal' ? '5 4' : undefined!)
      .attr('marker-end', (d) => `url(#arrow-${d.relationshipType})`)
      // Subtle animation on semantic/event edges
      .attr('class', (d) => d.relationshipType === 'semantic' || d.relationshipType === 'event' ? 'edge-pulse' : '')

    linkElsRef.current = linkEls as unknown as d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>

    // Node groups
    const rawNodeEls = g.append('g').selectAll<SVGGElement, SimNode>('g.node')
      .data(nodes).join('g').attr('class', 'node').style('cursor', 'pointer')

    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (evt, d) => {
        if (!evt.active) simRef.current?.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (evt, d) => { d.fx = evt.x; d.fy = evt.y })
      .on('end', (evt, d) => {
        if (!evt.active) simRef.current?.alphaTarget(0)
        d.fx = null; d.fy = null
      })

    rawNodeEls.call(drag as unknown as Parameters<typeof rawNodeEls.call>[0])

    const nodeEls = rawNodeEls
      .on('click', (_evt, d) => setSelectedNode((prev) => prev?.id === d.id ? null : d))
      .on('mouseenter', function(_evt, d) {
        const r = nodeRadius(d)
        const color = d.type === 'query' ? '#3B82F6' :
                      d.type === 'event' ? '#EF4444' :
                      d.sensorType ? getSensorColor(d.sensorType) : '#64748B'
        d3.select(this).select('.node-body')
          .transition().duration(120).attr('r', r * 1.28)
          .attr('fill-opacity', 0.22)
        d3.select(this).select('.node-ring')
          .transition().duration(120).attr('r', r * 1.28 + 6)
          .attr('stroke-opacity', 0.35)

        // Dim other nodes and non-connected edges if not in focus mode
        if (!focusMode) {
          linkElsRef.current
            ?.attr('stroke-opacity', (l: SimLink) =>
              l.source.id === d.id || l.target.id === d.id
                ? Math.min(0.85, 0.55 + l.strength * 0.3) : 0.06
            )
            .attr('stroke-width', (l: SimLink) =>
              l.source.id === d.id || l.target.id === d.id ? 2 + l.strength * 1.8 : 0.5
            )
          nodeElsRef.current?.attr('opacity', (n: SimNode) => {
            if (n.id === d.id) return 1
            const linked = linksData.current.some(
              (l) => (l.source.id === d.id && l.target.id === n.id) ||
                     (l.target.id === d.id && l.source.id === n.id)
            )
            return linked ? 0.9 : 0.25
          })
        }
      })
      .on('mouseleave', function(_evt, d) {
        const r = nodeRadius(d)
        d3.select(this).select('.node-body')
          .transition().duration(160).attr('r', r).attr('fill-opacity', 0.14)
        d3.select(this).select('.node-ring')
          .transition().duration(160).attr('r', r + 5)
          .attr('stroke-opacity', d.type === 'query' ? 0.22 : 0.08)

        // Restore unless focus mode is active and a node is selected
        if (!focusMode) {
          linkElsRef.current
            ?.attr('stroke-opacity', (l: SimLink) => 0.28 + l.strength * 0.28)
            .attr('stroke-width',   (l: SimLink) => 0.8 + l.strength * 1.6)
          nodeElsRef.current?.attr('opacity', 1)
        }
      })

    nodeElsRef.current = nodeEls as unknown as d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>

    nodeEls.each(function(d) {
      const el = d3.select(this)
      const r = nodeRadius(d)
      const color = d.type === 'query' ? '#3B82F6' :
                    d.type === 'event' ? '#EF4444' :
                    d.sensorType ? getSensorColor(d.sensorType) : '#64748B'

      // Outer ring
      el.append('circle').attr('class', 'node-ring').attr('r', r + 5)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-opacity', d.type === 'query' ? 0.22 : 0.08)
        .attr('stroke-width', d.type === 'query' ? 1.5 : 1)

      // Main circle
      el.append('circle').attr('class', 'node-body').attr('r', r)
        .attr('fill', color).attr('fill-opacity', 0.14)
        .attr('stroke', color).attr('stroke-width', 1.4)
        .attr('stroke-opacity', 0.75)

      // Center symbol
      if (d.type === 'query') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 12).attr('fill', color).attr('opacity', 0.9).text('◆')
      } else if (d.type === 'event') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 10).attr('fill', color).attr('opacity', 0.9).text('▲')
      } else {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 8).attr('font-weight', '600').attr('fill', color).attr('opacity', 0.85)
          .attr('font-family', 'Geist Mono, monospace')
          .text(d.id.replace('res-', '#'))
      }

      // Label
      el.append('text').attr('y', r + 15).attr('text-anchor', 'middle')
        .attr('font-size', 9.5).attr('fill', '#64748B').attr('font-family', 'Inter, sans-serif')
        .text(d.label.length > 22 ? d.label.slice(0, 22) + '…' : d.label)
    })

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => (d as SimNode).id).distance(120).strength((d) => (d as SimLink).strength * 0.5))
      .force('charge', d3.forceManyBody().strength(-380))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide(32))

    simRef.current = sim
    sim.on('tick', () => {
      linkEls
        .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      nodeEls.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [dimensions])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150]"
      style={{ background: '#080D16' }}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 px-6 py-3 flex items-center justify-between z-10"
        style={{ background: 'rgba(7, 11, 20, 0.97)', borderBottom: '1px solid rgba(45,55,72,0.35)' }}
      >
        <div>
          <h2 className="text-heading-3 text-text-primary font-semibold">Geo-Semantic Graph</h2>
          <p className="font-mono text-caption text-text-tertiary mt-0.5">
            {mockGraphNodes.length} nodes · {mockGraphEdges.length} relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GraphControls svgRef={svgRef} />
          <button
            onClick={() => setFocusMode((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s transition-all',
              focusMode
                ? 'text-teal-primary'
                : 'text-text-secondary'
            )}
            style={focusMode
              ? { background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)' }
              : { background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)' }
            }
          >
            <Focus className="w-3.5 h-3.5" />
            Focus
          </button>
          <div className="w-px h-5 mx-1" style={{ background: 'rgba(45,55,72,0.4)' }} />
          <button onClick={toggleGraphExplorer} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="absolute inset-0 top-13">
        <svg ref={svgRef} width="100%" height="100%" />
      </div>

      {/* Selected node panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="absolute right-5 top-18 w-60"
            style={{
              background: 'rgba(10, 15, 26, 0.97)',
              border: '1px solid rgba(45, 55, 72, 0.45)',
              borderRadius: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
              <div className="overline-label">Selected Node</div>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              <div className="text-body-s text-text-primary font-medium leading-tight">
                {selectedNode.label}
              </div>
              {selectedNode.sensorType && <SensorChip type={selectedNode.sensorType} size="sm" />}
              {selectedNode.similarityScore != null && (
                <div className="data-row">
                  <span className="text-caption text-text-tertiary">Similarity</span>
                  <span className="font-mono text-caption text-blue-primary">{selectedNode.similarityScore.toFixed(1)}%</span>
                </div>
              )}
              {selectedNode.timestamp && (
                <div className="data-row">
                  <span className="text-caption text-text-tertiary">Acquired</span>
                  <span className="font-mono text-caption text-text-secondary">{selectedNode.timestamp}</span>
                </div>
              )}
              {selectedNode.coords && (
                <div className="data-row">
                  <span className="text-caption text-text-tertiary">Coords</span>
                  <span className="font-mono text-caption text-text-secondary">
                    {selectedNode.coords.lat.toFixed(2)}°N · {selectedNode.coords.lng.toFixed(2)}°E
                  </span>
                </div>
              )}
              <div className="data-row">
                <span className="text-caption text-text-tertiary">Connections</span>
                <span className="font-mono text-caption text-text-secondary">
                  {mockGraphEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div
        className="absolute bottom-5 left-5 w-48"
        style={{
          background: 'rgba(10, 15, 26, 0.96)',
          border: '1px solid rgba(45, 55, 72, 0.4)',
          borderRadius: 10,
        }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
          <div className="overline-label">Legend</div>
        </div>
        <div className="px-4 py-3 space-y-4">
          <div className="space-y-2">
            {[
              { label: 'Query Image',   color: '#3B82F6' },
              { label: 'Optical',       color: '#22C55E' },
              { label: 'SAR',           color: '#3B82F6' },
              { label: 'Multispectral', color: '#F59E0B' },
              { label: 'Event',         color: '#EF4444' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.8 }} />
                <span className="text-caption text-text-secondary">{label}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2" style={{ paddingTop: 8, borderTop: '1px solid rgba(45,55,72,0.2)' }}>
            {[
              { label: 'Semantic',  color: '#3B82F6', dashed: false },
              { label: 'Spatial',   color: '#14B8A6', dashed: false },
              { label: 'Temporal',  color: '#F59E0B', dashed: true  },
              { label: 'Event',     color: '#EF4444', dashed: false },
            ].map(({ label, color, dashed }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div
                  className="flex-shrink-0"
                  style={{
                    width: 20, height: 1,
                    background: dashed ? 'none' : color,
                    borderTop: dashed ? `1px dashed ${color}` : 'none',
                    opacity: 0.7,
                  }}
                />
                <span className="text-caption text-text-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function GraphControls({ svgRef }: { svgRef: React.RefObject<SVGSVGElement> }) {
  const applyZoom = useCallback((factor: number) => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5])
    svg.transition().duration(280).call(zoomBehavior.scaleBy, factor)
  }, [svgRef])

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => applyZoom(1.3)} className="btn-ghost p-1.5" title="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => applyZoom(0.77)} className="btn-ghost p-1.5" title="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <button className="btn-ghost p-1.5" title="Reset view">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s transition-all"
        style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)', color: '#94A3B8' }}
      >
        <Filter className="w-3.5 h-3.5" />
        Filter
      </button>
    </div>
  )
}
