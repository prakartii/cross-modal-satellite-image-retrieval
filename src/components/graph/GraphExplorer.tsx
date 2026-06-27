import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as d3 from 'd3'
import { X, ZoomIn, ZoomOut, RotateCcw, Filter, Focus, Satellite, Activity, AlertTriangle, Clock, Globe, ChevronRight, Network, Radio } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { mockGraphNodes, mockGraphEdges } from '@/data/mockGraph'
import { getSensorColor, cn } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import type { GraphNode, GraphEdge } from '@/types'

interface SimNode extends GraphNode { x: number; y: number; vx: number; vy: number }
interface SimLink {
  source: SimNode; target: SimNode
  id: string; strength: number; relationshipType: string; label?: string
}

const EDGE_COLORS: Record<string, string> = {
  semantic:   '#3B82F6',
  spatial:    '#14B8A6',
  temporal:   '#F59E0B',
  event:      '#EF4444',
  provenance: '#8B5CF6',
}

const EDGE_LABELS: Record<string, string> = {
  semantic:   'Semantic Similarity',
  spatial:    'Spatial Relationship',
  temporal:   'Temporal Evolution',
  event:      'Event Linkage',
  provenance: 'Satellite Provenance',
}

function nodeRadius(d: SimNode): number {
  if (d.type === 'query')     return 26
  if (d.type === 'satellite') return 18
  if (d.type === 'cluster')   return 22
  if (d.type === 'event')     return 18
  return 12 + (d.similarityScore ?? 70) / 12
}

function nodeColor(d: SimNode): string {
  if (d.type === 'query')     return '#3B82F6'
  if (d.type === 'satellite') return '#8B5CF6'
  if (d.type === 'cluster')   return '#EF4444'
  if (d.type === 'event')     return '#F59E0B'
  if (d.sensorType)           return getSensorColor(d.sensorType)
  return '#64748B'
}

export default function GraphExplorer() {
  const toggleGraphExplorer  = useAppStore((s) => s.toggleGraphExplorer)
  const missionGraphNodes    = useAppStore((s) => s.missionGraphNodes)
  const missionGraphEdges    = useAppStore((s) => s.missionGraphEdges)
  const currentMission       = useAppStore((s) => s.currentMission)

  // Use real mission graph when a mission is active, otherwise show the static demo graph
  const activeNodes = missionGraphNodes.length > 0 ? missionGraphNodes : mockGraphNodes
  const activeEdges = missionGraphEdges.length > 0 ? missionGraphEdges : mockGraphEdges

  const svgRef          = useRef<SVGSVGElement>(null)
  const simRef          = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const nodeElsRef      = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null)
  const linkElsRef      = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null)
  const linkLabelElsRef = useRef<d3.Selection<SVGTextElement, SimLink, SVGGElement, unknown> | null>(null)
  const linksData       = useRef<SimLink[]>([])

  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null)
  const [focusMode, setFocusMode]       = useState(false)
  const [activeEdgeFilter, setActiveEdgeFilter] = useState<string | null>(null)
  const [dimensions, setDimensions]     = useState({ w: 900, h: 600 })

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setDimensions({ w: e.contentRect.width, h: e.contentRect.height })
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!nodeElsRef.current || !linkElsRef.current) return
    if (!selectedNode) {
      nodeElsRef.current.transition().duration(200).attr('opacity', 1)
      linkElsRef.current.transition().duration(200)
        .attr('stroke-opacity', (d: SimLink) => 0.28 + d.strength * 0.28)
        .attr('stroke-width',   (d: SimLink) => 0.8 + d.strength * 1.6)
      linkLabelElsRef.current?.transition().duration(150).attr('opacity', 0)
      return
    }
    const semanticIds    = new Set<string>([selectedNode.id])
    const allConnectedIds = new Set<string>([selectedNode.id])
    linksData.current.forEach((l) => {
      const connected = l.source.id === selectedNode.id || l.target.id === selectedNode.id
      if (connected) {
        allConnectedIds.add(l.source.id); allConnectedIds.add(l.target.id)
        if (l.relationshipType === 'semantic') {
          semanticIds.add(l.source.id); semanticIds.add(l.target.id)
        }
      }
    })
    nodeElsRef.current.transition().duration(220)
      .attr('opacity', (n: SimNode) => {
        if (n.id === selectedNode.id) return 1
        if (semanticIds.has(n.id)) return 1
        if (focusMode) return allConnectedIds.has(n.id) ? 0.45 : 0.07
        return allConnectedIds.has(n.id) ? 0.6 : 0.15
      })
    linkElsRef.current.transition().duration(220)
      .attr('stroke-opacity', (l: SimLink) => {
        const connected = l.source.id === selectedNode.id || l.target.id === selectedNode.id
        if (!connected) return 0.04
        return l.relationshipType === 'semantic' ? 0.9 : 0.28
      })
      .attr('stroke-width', (l: SimLink) => {
        const connected = l.source.id === selectedNode.id || l.target.id === selectedNode.id
        if (!connected) return 0.4
        return l.relationshipType === 'semantic' ? 2.5 + l.strength * 2 : 0.9 + l.strength * 0.8
      })
    // Show labels only on semantic connections of the selected node
    linkLabelElsRef.current?.transition().duration(200)
      .attr('opacity', (l: SimLink) => {
        const isSemanticConn = (l.source.id === selectedNode.id || l.target.id === selectedNode.id)
          && l.relationshipType === 'semantic'
        return isSemanticConn ? 0.85 : 0
      })
  }, [selectedNode, focusMode])

  useEffect(() => {
    if (!svgRef.current) return
    const { w, h } = dimensions
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Background dot grid
    const defs = svg.append('defs')
    const dotPat = defs.append('pattern').attr('id', 'dots').attr('width', 24).attr('height', 24).attr('patternUnits', 'userSpaceOnUse')
    dotPat.append('circle').attr('cx', 12).attr('cy', 12).attr('r', 0.8).attr('fill', 'rgba(45,55,72,0.35)')
    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#dots)')

    // Markers
    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -4 8 8').attr('refX', 22).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', color).attr('opacity', 0.55)
    })

    const nodes: SimNode[] = activeNodes.map((n) => ({
      ...n, x: w / 2 + (Math.random() - 0.5) * 400, y: h / 2 + (Math.random() - 0.5) * 300, vx: 0, vy: 0,
    }))
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const links: SimLink[] = activeEdges
      .map((e) => {
        const source = nodeMap.get(e.source); const target = nodeMap.get(e.target)
        if (!source || !target) return null
        return { ...e, source, target }
      }).filter(Boolean) as SimLink[]
    linksData.current = links

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 6])
      .on('zoom', ({ transform }) => g.attr('transform', transform.toString()))
    svg.call(zoom)
    const g = svg.append('g')

    // Edges
    const linkEls = g.append('g').selectAll<SVGLineElement, SimLink>('line').data(links).join('line')
      .attr('stroke', (d) => EDGE_COLORS[d.relationshipType] ?? '#2D3748')
      .attr('stroke-opacity', (d) => 0.28 + d.strength * 0.28)
      .attr('stroke-width', (d) => 0.8 + d.strength * 1.6)
      .attr('stroke-dasharray', (d) => d.relationshipType === 'temporal' ? '5 4' : d.relationshipType === 'provenance' ? '3 3' : undefined!)
      .attr('marker-end', (d) => `url(#arrow-${d.relationshipType})`)
      .attr('class', (d) => ['semantic', 'event'].includes(d.relationshipType) ? 'edge-pulse' : '')

    linkElsRef.current = linkEls as unknown as d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>

    // Edge relationship labels (shown when source/target node is selected)
    const linkLabelEls = g.append('g').attr('class', 'link-labels')
      .selectAll<SVGTextElement, SimLink>('text')
      .data(links).join('text')
      .attr('font-size', 7).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', (d) => EDGE_COLORS[d.relationshipType] ?? '#64748B')
      .attr('font-family', 'Geist Mono, monospace').attr('pointer-events', 'none')
      .attr('opacity', 0)  // hidden until a node is selected
      .text((d) => d.label ?? EDGE_LABELS[d.relationshipType] ?? d.relationshipType)
    linkLabelElsRef.current = linkLabelEls as unknown as d3.Selection<SVGTextElement, SimLink, SVGGElement, unknown>

    const rawNodeEls = g.append('g').selectAll<SVGGElement, SimNode>('g.node').data(nodes).join('g')
      .attr('class', 'node').style('cursor', 'pointer')

    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (evt, d) => { if (!evt.active) simRef.current?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (evt, d) => { d.fx = evt.x; d.fy = evt.y })
      .on('end', (evt, d) => { if (!evt.active) simRef.current?.alphaTarget(0); d.fx = null; d.fy = null })
    rawNodeEls.call(drag as unknown as Parameters<typeof rawNodeEls.call>[0])

    const nodeEls = rawNodeEls
      .on('click', (_evt, d) => setSelectedNode((prev) => prev?.id === d.id ? null : d))
      .on('mouseenter', function(_evt, d) {
        const r = nodeRadius(d)
        d3.select(this).select('.node-body').transition().duration(120).attr('r', r * 1.3).attr('fill-opacity', 0.28)
        d3.select(this).select('.node-ring').transition().duration(120).attr('r', r * 1.3 + 7).attr('stroke-opacity', 0.5)
        if (!focusMode) {
          linkElsRef.current?.attr('stroke-opacity', (l: SimLink) =>
            l.source.id === d.id || l.target.id === d.id ? 0.8 : 0.05
          ).attr('stroke-width', (l: SimLink) =>
            l.source.id === d.id || l.target.id === d.id ? 2.5 + l.strength * 1.5 : 0.4
          )
          nodeElsRef.current?.attr('opacity', (n: SimNode) => {
            if (n.id === d.id) return 1
            return linksData.current.some(l =>
              (l.source.id === d.id && l.target.id === n.id) || (l.target.id === d.id && l.source.id === n.id)
            ) ? 0.9 : 0.2
          })
        }
      })
      .on('mouseleave', function(_evt, d) {
        const r = nodeRadius(d)
        d3.select(this).select('.node-body').transition().duration(160).attr('r', r).attr('fill-opacity', 0.14)
        d3.select(this).select('.node-ring').transition().duration(160).attr('r', r + 6).attr('stroke-opacity', d.type === 'query' ? 0.25 : 0.1)
        if (!focusMode) {
          linkElsRef.current?.attr('stroke-opacity', (l: SimLink) => 0.28 + l.strength * 0.28).attr('stroke-width', (l: SimLink) => 0.8 + l.strength * 1.6)
          nodeElsRef.current?.attr('opacity', 1)
        }
      })

    nodeElsRef.current = nodeEls as unknown as d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>

    nodeEls.each(function(d) {
      const el = d3.select(this)
      const r = nodeRadius(d)
      const color = nodeColor(d)
      const isSat = d.type === 'satellite'
      const isCluster = d.type === 'cluster'

      // Outer ring / cluster dashes
      if (isCluster) {
        el.append('circle').attr('class', 'node-ring').attr('r', r + 14)
          .attr('fill', 'none').attr('stroke', color).attr('stroke-opacity', 0.25)
          .attr('stroke-width', 1.2).attr('stroke-dasharray', '5 4')
      } else {
        el.append('circle').attr('class', 'node-ring').attr('r', r + 6)
          .attr('fill', 'none').attr('stroke', color)
          .attr('stroke-opacity', d.type === 'query' ? 0.25 : 0.1)
          .attr('stroke-width', d.type === 'query' ? 1.5 : 1)
      }

      // Main shape — satellite nodes get a rotated rect (diamond)
      if (isSat) {
        el.append('rect')
          .attr('class', 'node-body')
          .attr('width', r * 1.9).attr('height', r * 1.9)
          .attr('x', -r * 0.95).attr('y', -r * 0.95)
          .attr('transform', 'rotate(45)')
          .attr('fill', color).attr('fill-opacity', 0.14)
          .attr('stroke', color).attr('stroke-width', 1.4).attr('stroke-opacity', 0.75)
          .attr('rx', 2)
      } else {
        const breathDur   = (2.4 + Math.random() * 2.0).toFixed(2) + 's'
        const breathDelay = (Math.random() * 2.0).toFixed(2) + 's'
        el.append('circle').attr('class', 'node-body node-breathing').attr('r', r)
          .attr('fill', color).attr('fill-opacity', 0.14)
          .attr('stroke', color).attr('stroke-width', 1.4).attr('stroke-opacity', 0.75)
          .style('--breath-dur', breathDur)
          .style('--breath-delay', breathDelay)
      }

      // Center symbol / label
      if (d.type === 'query') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 11).attr('fill', color).attr('opacity', 0.9).text('◆')
      } else if (d.type === 'satellite') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 9).attr('fill', color).attr('opacity', 0.9).text('▣')
      } else if (d.type === 'cluster') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 9).attr('fill', color).attr('opacity', 0.9).text('⬡')
      } else if (d.type === 'event') {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 9).attr('fill', color).attr('opacity', 0.9).text('▲')
      } else {
        el.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', 7.5).attr('font-weight', '600').attr('fill', color).attr('opacity', 0.85)
          .attr('font-family', 'Geist Mono, monospace')
          .text(d.id.replace('res-', '#'))
      }

      // Node label
      const labelY = isSat ? r * 1.3 + 14 : r + 14
      const short = d.label.length > 22 ? d.label.slice(0, 22) + '…' : d.label
      el.append('text').attr('y', labelY).attr('text-anchor', 'middle')
        .attr('font-size', 9).attr('fill', '#64748B').attr('font-family', 'Inter, sans-serif')
        .text(short)

      // Type badge below label (for satellite/cluster)
      if (isSat || isCluster) {
        el.append('text').attr('y', labelY + 12).attr('text-anchor', 'middle')
          .attr('font-size', 7.5).attr('fill', color).attr('opacity', 0.6)
          .attr('font-family', 'Geist Mono, monospace').attr('font-weight', '600')
          .text(d.type === 'satellite' ? `SAT · ${d.agency ?? ''}` : 'CLUSTER')
      }
    })

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => (d as SimNode).id).distance((l) => {
        const t = (l as SimLink).relationshipType
        if (t === 'provenance') return 90
        if (t === 'semantic')   return 130
        return 150
      }).strength((d) => (d as SimLink).strength * 0.45))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide(36))

    // ── Edge particle system ─────────────────────────────────────────────────
    const PARTICLE_TYPES = new Set(['semantic', 'event', 'spatial'])
    const particles: Array<{ link: SimLink; t: number; speed: number; color: string }> = []
    links.forEach((link) => {
      if (!PARTICLE_TYPES.has(link.relationshipType)) return
      const count = link.strength > 0.75 ? 2 : 1
      for (let k = 0; k < count; k++) {
        particles.push({
          link,
          t:     (k / count) + Math.random() * 0.15,
          speed: 0.0035 + link.strength * 0.003,
          color: EDGE_COLORS[link.relationshipType] ?? '#3B82F6',
        })
      }
    })

    const particleGroup = g.append('g').attr('class', 'particles').style('pointer-events', 'none')
    const particleEls = particleGroup.selectAll<SVGCircleElement, typeof particles[0]>('circle')
      .data(particles).join('circle').attr('r', 2.2).attr('opacity', 0.72)

    simRef.current = sim
    sim.on('tick', () => {
      linkEls.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      linkLabelEls
        .attr('x', (d) => (d.source.x + d.target.x) / 2)
        .attr('y', (d) => (d.source.y + d.target.y) / 2)
      nodeEls.attr('transform', (d) => `translate(${d.x},${d.y})`)

      // Advance particles
      particles.forEach((p) => {
        p.t += p.speed
        if (p.t > 1) p.t = 0
      })
      particleEls
        .attr('cx', (d) => d.link.source.x + (d.link.target.x - d.link.source.x) * d.t)
        .attr('cy', (d) => d.link.source.y + (d.link.target.y - d.link.source.y) * d.t)
        .attr('fill', (d) => d.color)
        .attr('opacity', (d) => 0.72 - d.t * 0.3)
    })
    return () => { sim.stop() }
  }, [dimensions, activeNodes, activeEdges])

  const satelliteCount = activeNodes.filter(n => n.type === 'satellite').length
  const eventCount     = activeNodes.filter(n => n.type === 'event' || n.type === 'cluster').length
  const resultCount    = activeNodes.filter(n => n.type === 'result' || n.type === 'historical').length
  const dateRange      = currentMission
    ? new Date(currentMission.created_at).getFullYear().toString()
    : '2022–2024'
  const missionLabel   = currentMission ? currentMission.id : 'BF2024-RISAT2B-001'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150]" style={{ background: '#080D16' }}>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 px-5 py-2.5 flex items-center justify-between z-10"
        style={{ background: 'rgba(7,11,20,0.97)', borderBottom: '1px solid rgba(45,55,72,0.35)', height: 52 }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-heading-3 text-text-primary font-semibold leading-none">Geo-Semantic Graph</div>
            <div className="font-mono text-caption text-text-tertiary mt-0.5">
              Mission {missionLabel} · {activeNodes.length} nodes · {activeEdges.length} edges · {dateRange}
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 pl-4" style={{ borderLeft: '1px solid rgba(45,55,72,0.35)' }}>
            {[
              { icon: Satellite, label: 'Satellites', value: satelliteCount, color: '#8B5CF6' },
              { icon: Activity,  label: 'Events',     value: eventCount,     color: '#F59E0B' },
              { icon: Activity,  label: 'Scenes',     value: resultCount,    color: '#14B8A6' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className="w-3 h-3" style={{ color }} />
                <span className="font-mono text-caption" style={{ color }}>{value}</span>
                <span className="text-overline text-text-tertiary">{label}</span>
              </div>
            ))}
          </div>

          {/* Edge type filter */}
          <div className="flex items-center gap-1 pl-4" style={{ borderLeft: '1px solid rgba(45,55,72,0.35)' }}>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <button key={type} onClick={() => setActiveEdgeFilter(activeEdgeFilter === type ? null : type)}
                className="flex items-center gap-1 px-2 py-1 rounded text-overline transition-all"
                style={activeEdgeFilter === type
                  ? { background: `${color}18`, border: `1px solid ${color}40`, color }
                  : { background: 'rgba(26,35,51,0.5)', border: '1px solid rgba(45,55,72,0.3)', color: '#64748B' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GraphControls svgRef={svgRef} />
          <button onClick={() => setFocusMode(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s transition-all', focusMode ? 'text-teal-primary' : 'text-text-secondary')}
            style={focusMode
              ? { background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)' }
              : { background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)' }}>
            <Focus className="w-3.5 h-3.5" />
            Focus
          </button>
          <div className="w-px h-5 mx-1" style={{ background: 'rgba(45,55,72,0.4)' }} />
          <button onClick={toggleGraphExplorer} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="absolute inset-0" style={{ top: 52 }}>
        <svg ref={svgRef} width="100%" height="100%" />
      </div>

      {/* Selected node intelligence panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.22 }}
            className="absolute right-5 z-10 overflow-y-auto scrollbar-thin"
            style={{ top: 64, bottom: 16, width: 268 }}>
            <div style={{ background: 'rgba(9,14,24,0.98)', border: '1px solid rgba(45,55,72,0.48)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.8)' }}>
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 rounded-full" style={{ background: nodeColor(selectedNode) }} />
                  <div>
                    <div className="overline-label">Node Intelligence</div>
                    <div className="font-mono text-overline text-text-tertiary mt-0.5">{selectedNode.id}</div>
                  </div>
                </div>
                <div className="px-2 py-0.5 rounded text-overline font-bold"
                  style={{ background: `${nodeColor(selectedNode)}18`, color: nodeColor(selectedNode), border: `1px solid ${nodeColor(selectedNode)}30` }}>
                  {selectedNode.type.toUpperCase()}
                </div>
              </div>

              <div className="px-4 py-3 space-y-4">
                {/* Node label */}
                <div>
                  <div className="text-body-s text-text-primary font-semibold leading-tight">{selectedNode.label}</div>
                  {selectedNode.sensorType && <div className="mt-1.5"><SensorChip type={selectedNode.sensorType} size="sm" /></div>}
                </div>

                {/* Type-specific intelligence */}
                {selectedNode.type === 'satellite' && <SatelliteNodePanel node={selectedNode} />}
                {selectedNode.type === 'cluster'   && <ClusterNodePanel   node={selectedNode} />}
                {(selectedNode.type === 'result' || selectedNode.type === 'historical') && <SceneNodePanel node={selectedNode} />}
                {selectedNode.type === 'event'     && <EventNodePanel     node={selectedNode} />}
                {selectedNode.type === 'query'     && <QueryNodePanel     node={selectedNode} />}

                {/* Common fields */}
                <div style={{ borderTop: '1px solid rgba(45,55,72,0.25)', paddingTop: 12 }}>
                  <div className="overline-label mb-2">Graph Metrics</div>
                  {selectedNode.coords && (
                    <div className="data-row mb-1.5">
                      <span className="text-caption text-text-tertiary flex items-center gap-1"><Globe className="w-3 h-3" /> Coords</span>
                      <span className="font-mono text-caption text-text-secondary">
                        {selectedNode.coords.lat.toFixed(2)}°N {selectedNode.coords.lng.toFixed(2)}°E
                      </span>
                    </div>
                  )}
                  {selectedNode.timestamp && (
                    <div className="data-row mb-1.5">
                      <span className="text-caption text-text-tertiary flex items-center gap-1"><Clock className="w-3 h-3" /> Date</span>
                      <span className="font-mono text-caption text-text-secondary">{selectedNode.timestamp}</span>
                    </div>
                  )}
                  <div className="data-row mb-1.5">
                    <span className="text-caption text-text-tertiary flex items-center gap-1"><Network className="w-3 h-3" /> Degree</span>
                    <span className="font-mono text-caption text-text-secondary">
                      {activeEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} edges
                    </span>
                  </div>
                </div>

                {/* Edge type breakdown */}
                <div style={{ borderTop: '1px solid rgba(45,55,72,0.2)', paddingTop: 10 }}>
                  <div className="overline-label mb-2">Edge Breakdown</div>
                  {Object.entries(EDGE_COLORS).map(([type, color]) => {
                    const count = activeEdges.filter(e =>
                      (e.source === selectedNode.id || e.target === selectedNode.id) && e.relationshipType === type
                    ).length
                    if (count === 0) return null
                    return (
                      <div key={type} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          <span className="text-caption text-text-secondary capitalize">{type}</span>
                        </div>
                        <span className="font-mono text-caption" style={{ color }}>{count}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Provenance chain */}
                <ProvenanceChain node={selectedNode} edges={activeEdges} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 z-10" style={{ width: 200 }}>
        <div style={{ background: 'rgba(10,15,26,0.96)', border: '1px solid rgba(45,55,72,0.4)', borderRadius: 10 }}>
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
            <div className="overline-label">Legend</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-overline text-text-tertiary mb-2">Node types</div>
            <div className="space-y-1.5 mb-3">
              {[
                { label: 'Query Image',   color: '#3B82F6', symbol: '◆' },
                { label: 'Satellite',     color: '#8B5CF6', symbol: '▣' },
                { label: 'Flood Cluster', color: '#EF4444', symbol: '⬡' },
                { label: 'Event',         color: '#F59E0B', symbol: '▲' },
                { label: 'Optical',       color: '#22C55E', symbol: '○' },
                { label: 'SAR',           color: '#3B82F6', symbol: '○' },
                { label: 'Multispectral', color: '#F59E0B', symbol: '○' },
              ].map(({ label, color, symbol }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span style={{ color, fontSize: 10, minWidth: 12, textAlign: 'center', lineHeight: 1 }}>{symbol}</span>
                  <span className="text-caption text-text-secondary">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-overline text-text-tertiary mb-2 pt-2" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>Relationships</div>
            <div className="space-y-1.5">
              {Object.entries(EDGE_LABELS).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2.5">
                  <div className="flex-shrink-0" style={{
                    width: 18, height: 1.5,
                    background: EDGE_COLORS[type],
                    opacity: 0.75,
                    borderTop: ['temporal', 'provenance'].includes(type) ? `1.5px dashed ${EDGE_COLORS[type]}` : 'none',
                  }} />
                  <span className="text-caption text-text-secondary" style={{ fontSize: 9 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Temporal scale indicator */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg"
          style={{ background: 'rgba(10,15,26,0.9)', border: '1px solid rgba(45,55,72,0.35)' }}>
          <span className="font-mono text-overline text-text-tertiary">2022</span>
          <div className="flex items-center gap-1">
            {[2022, 2023, 2024].map((yr, i) => (
              <div key={yr} className="flex items-center">
                <div className="w-16 h-px" style={{ background: 'rgba(245,158,11,0.35)' }} />
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B', opacity: 0.6 }} />
              </div>
            ))}
          </div>
          <span className="font-mono text-overline text-text-tertiary">2024</span>
          <span className="text-overline text-text-tertiary ml-1">· temporal axis</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Type-specific node intelligence panels ────────────────────────────────────

function DataRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(45,55,72,0.18)' }}>
      <span className="text-caption text-text-tertiary">{label}</span>
      <span className="font-mono text-caption" style={{ color: color ?? '#94A3B8' }}>{value}</span>
    </div>
  )
}

function SatelliteNodePanel({ node }: { node: SimNode }) {
  const SAT_DATA: Record<string, { alt: string; inc: string; period: string; status: string; passes: string[] }> = {
    'sat-r2b':  { alt: '576 km',   inc: '35.7°', period: '95.8 min', status: 'NOMINAL', passes: ['14:32 UTC', '16:04 UTC', '03:17 UTC+1'] },
    'sat-s1a':  { alt: '693 km',   inc: '98.2°', period: '98.6 min', status: 'ACTIVE',  passes: ['11:18 UTC', '22:51 UTC', '12:52 UTC+1'] },
  }
  const d = SAT_DATA[node.id] ?? { alt: '580 km', inc: '97.6°', period: '97.1 min', status: 'NOMINAL', passes: ['—'] }
  return (
    <div>
      <div className="overline-label mb-2">Orbital Parameters</div>
      <DataRow label="Altitude"   value={d.alt} />
      <DataRow label="Inclination" value={d.inc} />
      <DataRow label="Orbital period" value={d.period} />
      <DataRow label="Agency"     value={node.agency ?? '—'} />
      <DataRow label="Status"     value={d.status} color={d.status === 'NOMINAL' ? '#14B8A6' : '#22C55E'} />
      <div className="mt-3">
        <div className="overline-label mb-2">Next Passes — AOI</div>
        {d.passes.map((p, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5" style={i < d.passes.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.15)' } : {}}>
            <Radio className="w-3 h-3 text-text-tertiary" />
            <span className="font-mono text-caption text-text-secondary">{p}</span>
            {i === 0 && <span className="text-overline px-1.5 py-0.5 rounded" style={{ background: 'rgba(20,184,166,0.12)', color: '#14B8A6' }}>next</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ClusterNodePanel({ node: _ }: { node: SimNode }) {
  return (
    <div>
      <div className="overline-label mb-2">Cluster Summary</div>
      <DataRow label="Event type"   value="Flood (riverine)"     color="#3B82F6" />
      <DataRow label="Area affected" value="2,840 km²"           color="#EF4444" />
      <DataRow label="Date range"    value="Jun–Aug 2024"        />
      <DataRow label="Peak NDWI"     value="0.74 (20 Jun)"      color="#60A5FA" />
      <DataRow label="Severity"      value="CRITICAL"            color="#EF4444" />
      <DataRow label="Scenes"        value="247 archive scenes"  />
      <div className="mt-3 p-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-overline text-text-secondary leading-relaxed">
            NE India flood cluster — Brahmaputra + Barak basins. 3 sub-events aggregated by spatial proximity (&lt;50 km) and temporal overlap.
          </span>
        </div>
      </div>
    </div>
  )
}

function SceneNodePanel({ node }: { node: SimNode }) {
  const score = node.similarityScore ?? 0
  const color = score >= 90 ? '#22C55E' : score >= 80 ? '#3B82F6' : '#F59E0B'
  const embDist = score > 0 ? (1 - score / 100).toFixed(3) : '—'
  const satName = node.label.split('·')[0].trim()

  const waterSim  = score > 0 ? Math.min(99, Math.round(score * 0.98 + 2))  : 92
  const vegSim    = score > 0 ? Math.min(99, Math.round(score * 0.91))       : 84
  const terrainSim= score > 0 ? Math.min(99, Math.round(score * 0.93))       : 86
  const sarSim    = node.sensorType === 'SAR'
    ? Math.min(99, Math.round(score * 0.97))
    : Math.min(99, Math.round(score * 0.88 + 5))

  return (
    <div>
      <div className="overline-label mb-2">Scene Intelligence</div>

      {node.similarityScore != null && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-caption text-text-tertiary">Similarity score</span>
            <span className="font-mono text-caption font-bold" style={{ color }}>{score.toFixed(1)}%</span>
          </div>
          <div className="h-1 rounded-full mb-3" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
            <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
          </div>
        </>
      )}

      <DataRow label="Node Type"       value={node.type === 'historical' ? 'Historical Archive' : 'Retrieved Scene'} />
      <DataRow label="Satellite"        value={satName} color={color} />
      <DataRow label="Sensor"           value={node.sensorType ?? '—'} />
      {node.timestamp && <DataRow label="Acquisition"  value={node.timestamp} />}
      <DataRow label="Embed. Distance"  value={embDist} />
      <DataRow label="Land Cover"       value="Flood · Riparian" color="#3B82F6" />
      <DataRow label="Confidence"       value={score > 0 ? `${Math.round(score * 0.95)}%` : '87%'} color={color} />
      <DataRow label="Flood Event"      value="Brahmaputra Flood 2024" color="#F59E0B" />
      <DataRow label="Spatial Cluster"  value="NE India Flood Zone" />

      <div className="mt-3">
        <div className="overline-label mb-1.5">Explainability · Why this matched</div>
        {[
          { dim: 'NDWI / Water',      pct: waterSim,  color: '#3B82F6' },
          { dim: 'NDVI / Vegetation', pct: vegSim,    color: '#22C55E' },
          { dim: 'Terrain Morph.',    pct: terrainSim,color: '#14B8A6' },
          { dim: 'SAR Backscatter',   pct: sarSim,    color: '#8B5CF6' },
        ].map(({ dim, pct, color: c }) => (
          <div key={dim} className="mb-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-overline text-text-tertiary">{dim}</span>
              <span className="font-mono text-overline" style={{ color: c }}>{pct}%</span>
            </div>
            <div className="h-0.5 rounded-full" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(45,55,72,0.18)' }}>
        <div className="overline-label mb-1.5">Temporal Links</div>
        <div className="text-caption text-text-tertiary leading-relaxed">
          {node.type === 'historical'
            ? 'Pre-event baseline · monsoon cycle match'
            : 'Sep 2024 flood event · same monsoon season'}
        </div>
      </div>
    </div>
  )
}

function EventNodePanel({ node: _ }: { node: SimNode }) {
  return (
    <div>
      <div className="overline-label mb-2">Event Data</div>
      <DataRow label="Type"       value="Riverine Flood"   color="#3B82F6" />
      <DataRow label="Severity"   value="HIGH"             color="#EF4444" />
      <DataRow label="Orbit"      value="18924 (RISAT-2B)" />
      <DataRow label="σ⁰ anomaly" value="−7.4 dB vs baseline" color="#8B5CF6" />
      <DataRow label="NDWI"       value="0.62 (INUNDATION)" color="#60A5FA" />
      <div className="mt-3 p-2.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}>
        <span className="text-overline text-text-secondary leading-relaxed">
          Flood signature detected in SAR amplitude. Consistent with historical analogue Aug 2022. Sentinel-1 IW corroborates inundation extent.
        </span>
      </div>
    </div>
  )
}

function QueryNodePanel({ node: _ }: { node: SimNode }) {
  return (
    <div>
      <div className="overline-label mb-2">Query Parameters</div>
      <DataRow label="Scene ID"   value="R2B-20240912-18924" />
      <DataRow label="Sensor"     value="SAR · VV-VH dual-pol" />
      <DataRow label="Resolution" value="3m GSD" />
      <DataRow label="Modality"   value="Cross-Modal" color="#3B82F6" />
      <DataRow label="Retrieved"  value="10 results" color="#14B8A6" />
      <div className="mt-3">
        <div className="overline-label mb-1.5">Top features</div>
        {['Open water · σ⁰ −15.2 dB', 'NDWI 0.62 · inundation', 'Riparian texture pattern'].map((f, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5"
            style={i < 2 ? { borderBottom: '1px solid rgba(45,55,72,0.15)' } : {}}>
            <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#3B82F6' }} />
            <span className="text-caption text-text-secondary">{f}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProvenanceChain({ node, edges }: { node: SimNode; edges: typeof mockGraphEdges }) {
  const provEdges = edges.filter(e =>
    e.relationshipType === 'provenance' && (e.source === node.id || e.target === node.id)
  )
  if (provEdges.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid rgba(45,55,72,0.2)', paddingTop: 10 }}>
      <div className="overline-label mb-2">Provenance Chain</div>
      <div className="space-y-1">
        {provEdges.map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source
          return (
            <div key={edge.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md"
              style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)' }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8B5CF6' }} />
              <span className="text-caption text-text-secondary flex-1">{otherId}</span>
              <ChevronRight className="w-3 h-3 text-text-tertiary" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GraphControls({ svgRef }: { svgRef: React.RefObject<SVGSVGElement> }) {
  const applyZoom = useCallback((factor: number) => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zb = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 6])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg.transition().duration(280).call(zb.scaleBy as any, factor)
  }, [svgRef])

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => applyZoom(1.35)} className="btn-ghost p-1.5" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
      <button onClick={() => applyZoom(0.75)} className="btn-ghost p-1.5" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
      <button className="btn-ghost p-1.5" title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-s"
        style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)', color: '#94A3B8' }}>
        <Filter className="w-3.5 h-3.5" />
        Filter
      </div>
    </div>
  )
}
