import type { GraphNode, GraphEdge } from '@/types'

export const mockGraphNodes: GraphNode[] = [
  // Query origin
  { id: 'query',     label: 'Query · RISAT-2B SAR',          type: 'query',     sensorType: 'SAR',          similarityScore: 100,  coords: { lat: 26.12, lng: 91.74 }, timestamp: '2024-09-12', agency: 'ISRO' },

  // Satellite provenance nodes
  { id: 'sat-r2b',  label: 'RISAT-2B · Orbit 18924',        type: 'satellite',  sensorType: 'SAR',          agency: 'ISRO',        coords: undefined, timestamp: undefined },
  { id: 'sat-s1a',  label: 'Sentinel-1A · Orbit 49312',     type: 'satellite',  sensorType: 'SAR',          agency: 'ESA',         coords: undefined, timestamp: undefined },

  // Top retrieval results
  { id: 'res-001',  label: 'Sentinel-2A · Sep 2024',         type: 'result',    sensorType: 'Optical',       similarityScore: 94.2, coords: { lat: 26.34, lng: 91.52 }, timestamp: '2024-09-14' },
  { id: 'res-002',  label: 'Sentinel-1A · Aug 2024',         type: 'result',    sensorType: 'SAR',           similarityScore: 91.8, coords: { lat: 27.01, lng: 94.21 }, timestamp: '2024-08-28' },
  { id: 'res-003',  label: 'ResourceSat-2A · Oct 2024',      type: 'result',    sensorType: 'Multispectral', similarityScore: 88.5, coords: { lat: 26.58, lng: 93.37 }, timestamp: '2024-10-03' },
  { id: 'res-004',  label: 'Cartosat-3 · Jul 2024',          type: 'result',    sensorType: 'Optical',       similarityScore: 85.3, coords: { lat: 27.48, lng: 94.91 }, timestamp: '2024-07-19' },
  { id: 'res-005',  label: 'ALOS-2 PALSAR · Sep 2023',       type: 'result',    sensorType: 'SAR',           similarityScore: 82.7, coords: { lat: 26.71, lng: 90.87 }, timestamp: '2023-09-07' },
  { id: 'res-006',  label: 'Landsat-9 OLI · Jun 2024',       type: 'result',    sensorType: 'Multispectral', similarityScore: 79.4, coords: { lat: 22.41, lng: 89.22 }, timestamp: '2024-06-11' },
  { id: 'res-007',  label: 'Sentinel-2B · Aug 2024',          type: 'result',    sensorType: 'Optical',       similarityScore: 76.1, coords: { lat: 24.89, lng: 91.87 }, timestamp: '2024-08-01' },

  // Flood event cluster
  { id: 'cluster-flood', label: 'NE India Flood Zone 2024',  type: 'cluster',   coords: { lat: 26.4, lng: 92.1 }, timestamp: '2024-09' },

  // Historical events
  { id: 'hist-001', label: 'Assam Flood Event 2022',          type: 'event',     coords: { lat: 26.20, lng: 91.80 }, timestamp: '2022-06-20' },
  { id: 'hist-002', label: 'RISAT-2B · Sep 2023 Baseline',   type: 'historical', sensorType: 'SAR',        similarityScore: 78.4, coords: { lat: 25.98, lng: 91.43 }, timestamp: '2023-09-18' },
  { id: 'hist-003', label: 'Landsat-9 · Aug 2022',            type: 'historical', sensorType: 'Multispectral', similarityScore: 71.2, coords: { lat: 26.45, lng: 91.68 }, timestamp: '2022-08-14' },
  { id: 'hist-004', label: 'NDMA Damage Assessment 2024',     type: 'event',     coords: { lat: 26.18, lng: 91.71 }, timestamp: '2024-08-30' },
]

export const mockGraphEdges: GraphEdge[] = [
  // Satellite provenance edges
  { id: 'ep1', source: 'sat-r2b', target: 'query',   strength: 1.0, relationshipType: 'provenance', label: 'Acquired' },
  { id: 'ep2', source: 'sat-s1a', target: 'res-002', strength: 0.9, relationshipType: 'provenance', label: 'Acquired' },

  // Semantic similarity edges (query → results)
  { id: 'e1',  source: 'query',   target: 'res-001', strength: 0.942, relationshipType: 'semantic', label: '94.2% match' },
  { id: 'e2',  source: 'query',   target: 'res-002', strength: 0.918, relationshipType: 'semantic', label: '91.8% match' },
  { id: 'e3',  source: 'query',   target: 'res-003', strength: 0.885, relationshipType: 'semantic', label: '88.5% match' },
  { id: 'e4',  source: 'query',   target: 'res-004', strength: 0.853, relationshipType: 'semantic', label: '85.3% match' },
  { id: 'e5',  source: 'query',   target: 'res-005', strength: 0.827, relationshipType: 'semantic', label: '82.7% match' },
  { id: 'e13', source: 'query',   target: 'res-006', strength: 0.794, relationshipType: 'semantic', label: '79.4% match' },
  { id: 'e14', source: 'query',   target: 'res-007', strength: 0.761, relationshipType: 'semantic', label: '76.1% match' },

  // Event linkage
  { id: 'e6',  source: 'query',    target: 'hist-001', strength: 0.71, relationshipType: 'event',    label: 'Flood event' },
  { id: 'e7',  source: 'query',    target: 'hist-004', strength: 0.68, relationshipType: 'event',    label: 'NDMA report' },

  // Temporal evolution
  { id: 'e8',  source: 'res-001',  target: 'hist-001',  strength: 0.65, relationshipType: 'temporal', label: 'Same monsoon season' },
  { id: 'e10', source: 'res-003',  target: 'hist-003',  strength: 0.62, relationshipType: 'temporal', label: 'Annual cycle' },
  { id: 'e11', source: 'hist-001', target: 'hist-002',  strength: 0.55, relationshipType: 'temporal', label: 'Pre-event baseline' },

  // Spatial relationships
  { id: 'e9',  source: 'res-002',  target: 'hist-002',  strength: 0.78, relationshipType: 'spatial',  label: 'Same NE India region' },
  { id: 'e12', source: 'res-001',  target: 'res-002',   strength: 0.44, relationshipType: 'spatial',  label: 'Adjacent region' },
  { id: 'e15', source: 'res-006',  target: 'res-007',   strength: 0.52, relationshipType: 'spatial',  label: 'Delta region' },

  // Cluster membership
  { id: 'ec1', source: 'cluster-flood', target: 'query',    strength: 0.85, relationshipType: 'spatial', label: 'In flood zone' },
  { id: 'ec2', source: 'cluster-flood', target: 'hist-001', strength: 0.80, relationshipType: 'spatial', label: 'Cluster event' },
  { id: 'ec3', source: 'cluster-flood', target: 'res-001',  strength: 0.72, relationshipType: 'spatial', label: 'Zone match' },
]
