import type { AnalyticsMetric } from '@/types'

export const analyticsMetrics: AnalyticsMetric[] = [
  {
    label: 'Retrieval Precision@5',
    value: 91.2,
    unit: '%',
    trend: 2.3,
    history: [
      { time: 'Jan', value: 84.1 }, { time: 'Feb', value: 85.7 }, { time: 'Mar', value: 87.2 },
      { time: 'Apr', value: 88.9 }, { time: 'May', value: 89.4 }, { time: 'Jun', value: 91.2 },
    ],
  },
  {
    label: 'Cross-Modal F1@10',
    value: 87.3,
    unit: '%',
    trend: 1.8,
    history: [
      { time: 'Jan', value: 80.2 }, { time: 'Feb', value: 81.9 }, { time: 'Mar', value: 83.4 },
      { time: 'Apr', value: 84.8 }, { time: 'May', value: 86.1 }, { time: 'Jun', value: 87.3 },
    ],
  },
  {
    label: 'Query Latency P95',
    value: 1.8,
    unit: 's',
    trend: -0.3,
    history: [
      { time: 'Jan', value: 2.8 }, { time: 'Feb', value: 2.6 }, { time: 'Mar', value: 2.4 },
      { time: 'Apr', value: 2.2 }, { time: 'May', value: 2.0 }, { time: 'Jun', value: 1.8 },
    ],
  },
  {
    label: 'Cross-Modal Accuracy',
    value: 84.7,
    unit: '%',
    trend: 3.1,
    history: [
      { time: 'Jan', value: 74.1 }, { time: 'Feb', value: 76.4 }, { time: 'Mar', value: 78.9 },
      { time: 'Apr', value: 80.3 }, { time: 'May', value: 82.8 }, { time: 'Jun', value: 84.7 },
    ],
  },
]

export const crossModalMatrix = [
  { from: 'SAR → Optical',           precision5: 91.2, recall10: 83.4, f1: 87.1 },
  { from: 'SAR → Multispectral',     precision5: 88.7, recall10: 80.1, f1: 84.2 },
  { from: 'Optical → SAR',           precision5: 84.7, recall10: 78.9, f1: 81.7 },
  { from: 'Optical → Multispectral', precision5: 93.1, recall10: 89.2, f1: 91.1 },
  { from: 'Multi → SAR',             precision5: 82.3, recall10: 76.4, f1: 79.2 },
  { from: 'Multi → Optical',         precision5: 90.4, recall10: 87.1, f1: 88.7 },
]

export const queryVolumeData = [
  { time: '00:00', queries: 12 }, { time: '02:00', queries: 8  },
  { time: '04:00', queries: 6  }, { time: '06:00', queries: 18 },
  { time: '08:00', queries: 47 }, { time: '10:00', queries: 89 },
  { time: '12:00', queries: 112 },{ time: '14:00', queries: 98 },
  { time: '16:00', queries: 134 },{ time: '18:00', queries: 87 },
  { time: '20:00', queries: 52 }, { time: '22:00', queries: 31 },
]

export const sensorDistribution = [
  { name: 'Optical',       value: 50.2, color: '#22C55E' },
  { name: 'SAR',           value: 35.9, color: '#3B82F6' },
  { name: 'Multispectral', value: 13.9, color: '#F59E0B' },
]

// ─── Mission-specific data ──────────────────────────────────────────────────

export const acquisitionThroughput = [
  { day: 'Mon 17', sar: 84,  optical: 127, multi: 41 },
  { day: 'Tue 18', sar: 91,  optical: 143, multi: 38 },
  { day: 'Wed 19', sar: 103, optical: 156, multi: 44 },
  { day: 'Thu 20', sar: 78,  optical: 131, multi: 35 },
  { day: 'Fri 21', sar: 89,  optical: 148, multi: 42 },
  { day: 'Sat 22', sar: 112, optical: 167, multi: 49 },
  { day: 'Sun 23', sar: 96,  optical: 152, multi: 43 },
]

export const activeRegions = [
  { region: 'Brahmaputra Basin',        country: 'India',       scenes: 247, alerts: 3, type: 'flood',   lastSat: 'RISAT-2B',       severity: 'HIGH'   },
  { region: 'Western Ghats',            country: 'India',       scenes: 198, alerts: 1, type: 'forest',  lastSat: 'Sentinel-2A',    severity: 'MEDIUM' },
  { region: 'Rajasthan Plains',         country: 'India',       scenes: 143, alerts: 2, type: 'drought', lastSat: 'Landsat-9',      severity: 'MEDIUM' },
  { region: 'Tamil Nadu Coast',         country: 'India',       scenes: 189, alerts: 1, type: 'cyclone', lastSat: 'Sentinel-1A',    severity: 'LOW'    },
  { region: 'Sundarbans Delta',         country: 'Bangladesh',  scenes: 211, alerts: 2, type: 'flood',   lastSat: 'ResourceSat-2A', severity: 'HIGH'   },
  { region: 'California Wildfire Zone', country: 'USA',         scenes: 312, alerts: 4, type: 'fire',    lastSat: 'MODIS Terra',    severity: 'HIGH'   },
]

export const disasterTimeline = [
  { date: '17 Jun', flood: 1, fire: 0, cyclone: 0 },
  { date: '18 Jun', flood: 2, fire: 1, cyclone: 0 },
  { date: '19 Jun', flood: 1, fire: 2, cyclone: 0 },
  { date: '20 Jun', flood: 3, fire: 1, cyclone: 1 },
  { date: '21 Jun', flood: 2, fire: 3, cyclone: 0 },
  { date: '22 Jun', flood: 4, fire: 2, cyclone: 1 },
  { date: '23 Jun', flood: 3, fire: 1, cyclone: 0 },
]

export const latencyBreakdown = [
  { stage: 'Feature Extract', p50: 0.18, p95: 0.42, color: '#3B82F6' },
  { stage: 'Cross-Modal Align', p50: 0.14, p95: 0.38, color: '#14B8A6' },
  { stage: 'Archive Search',  p50: 0.31, p95: 0.67, color: '#F59E0B' },
  { stage: 'Graph Re-rank',   p50: 0.11, p95: 0.31, color: '#22C55E' },
]

export const sensorUtilization = [
  { name: 'RISAT-2B',       util: 78, agency: 'ISRO', color: '#F59E0B' },
  { name: 'Sentinel-1A',    util: 65, agency: 'ESA',  color: '#14B8A6' },
  { name: 'Cartosat-3',     util: 84, agency: 'ISRO', color: '#EF4444' },
  { name: 'ResourceSat-2A', util: 42, agency: 'ISRO', color: '#8B5CF6' },
  { name: 'Sentinel-2A',    util: 71, agency: 'ESA',  color: '#22C55E' },
  { name: 'ALOS-2',         util: 55, agency: 'JAXA', color: '#3B82F6' },
]

export const missionKPIs = [
  { label: 'Scenes Today',       value: '1,283',  sub: '+127 vs yesterday',  color: '#14B8A6', up: true  },
  { label: 'Regions Active',     value: '6',      sub: '3 with active alerts',color: '#EF4444', up: false },
  { label: 'Disaster Detections',value: '3',      sub: 'Last 24 hours',       color: '#F59E0B', up: false },
  { label: 'Archive Coverage',   value: '92.4%',  sub: 'India subcontinent',  color: '#22C55E', up: true  },
]
