import type { AnalyticsMetric } from '@/types'

export const analyticsMetrics: AnalyticsMetric[] = [
  {
    label: 'Precision@5',
    value: 91.2,
    unit: '%',
    trend: 2.3,
    history: [
      { time: 'Jan', value: 84.1 }, { time: 'Feb', value: 85.7 }, { time: 'Mar', value: 87.2 },
      { time: 'Apr', value: 88.9 }, { time: 'May', value: 89.4 }, { time: 'Jun', value: 91.2 },
    ],
  },
  {
    label: 'F1@10',
    value: 87.3,
    unit: '%',
    trend: 1.8,
    history: [
      { time: 'Jan', value: 80.2 }, { time: 'Feb', value: 81.9 }, { time: 'Mar', value: 83.4 },
      { time: 'Apr', value: 84.8 }, { time: 'May', value: 86.1 }, { time: 'Jun', value: 87.3 },
    ],
  },
  {
    label: 'Retrieval Latency',
    value: 1.8,
    unit: 's',
    trend: -0.3,
    history: [
      { time: 'Jan', value: 2.8 }, { time: 'Feb', value: 2.6 }, { time: 'Mar', value: 2.4 },
      { time: 'Apr', value: 2.2 }, { time: 'May', value: 2.0 }, { time: 'Jun', value: 1.8 },
    ],
  },
  {
    label: 'Cross-Modal Acc.',
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
  { from: 'SAR → Optical',          precision5: 91.2, recall10: 83.4, f1: 87.1 },
  { from: 'SAR → Multispectral',    precision5: 88.7, recall10: 80.1, f1: 84.2 },
  { from: 'Optical → SAR',          precision5: 84.7, recall10: 78.9, f1: 81.7 },
  { from: 'Optical → Multispectral',precision5: 93.1, recall10: 89.2, f1: 91.1 },
  { from: 'Multi → SAR',            precision5: 82.3, recall10: 76.4, f1: 79.2 },
  { from: 'Multi → Optical',        precision5: 90.4, recall10: 87.1, f1: 88.7 },
]

export const queryVolumeData = [
  { time: '00:00', queries: 12 }, { time: '02:00', queries: 8 },
  { time: '04:00', queries: 6  }, { time: '06:00', queries: 18 },
  { time: '08:00', queries: 47 }, { time: '10:00', queries: 89 },
  { time: '12:00', queries: 112}, { time: '14:00', queries: 98 },
  { time: '16:00', queries: 134}, { time: '18:00', queries: 87 },
  { time: '20:00', queries: 52 }, { time: '22:00', queries: 31 },
]

export const sensorDistribution = [
  { name: 'Optical',       value: 50.2, color: '#22C55E' },
  { name: 'SAR',           value: 35.9, color: '#3B82F6' },
  { name: 'Multispectral', value: 13.9, color: '#F59E0B' },
]
