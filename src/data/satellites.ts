import type { SatelliteOrbit, GlobeHotspot } from '@/types'

export const satelliteOrbits: SatelliteOrbit[] = [
  { id: 'iss',         name: 'ISS',           inclination: 51.6,  altitude: 408,  color: '#3B82F6', period: 92.9,  phaseOffset: 0    },
  { id: 'sentinel1a',  name: 'Sentinel-1A',   inclination: 98.18, altitude: 693,  color: '#14B8A6', period: 98.6,  phaseOffset: 1.0  },
  { id: 'sentinel2a',  name: 'Sentinel-2A',   inclination: 98.62, altitude: 786,  color: '#22C55E', period: 100.6, phaseOffset: 2.1  },
  { id: 'risat2b',     name: 'RISAT-2B',      inclination: 37.0,  altitude: 557,  color: '#F59E0B', period: 95.6,  phaseOffset: 3.7  },
  { id: 'cartosat3',   name: 'Cartosat-3',    inclination: 97.5,  altitude: 509,  color: '#EF4444', period: 94.7,  phaseOffset: 0.8  },
  { id: 'resourcesat', name: 'ResourceSat-2A',inclination: 98.3,  altitude: 817,  color: '#8B5CF6', period: 101.4, phaseOffset: 2.7  },
]

export const satelliteHealth = [
  { name: 'RISAT-2B',       status: 'NOMINAL' as const,  bat: 87, comms: true,  mode: 'FRS-1',    orb: 18924, agency: 'ISRO', live: true,  color: '#F59E0B' },
  { name: 'Sentinel-1A',    status: 'NOMINAL' as const,  bat: 92, comms: true,  mode: 'IW',       orb: 49312, agency: 'ESA',  live: true,  color: '#14B8A6' },
  { name: 'Cartosat-3',     status: 'ACTIVE'  as const,  bat: 78, comms: true,  mode: 'PAN+MX',   orb: 23441, agency: 'ISRO', live: true,  color: '#EF4444' },
  { name: 'ResourceSat-2A', status: 'STANDBY' as const,  bat: 95, comms: false, mode: 'LISS-3',   orb: 12087, agency: 'ISRO', live: false, color: '#8B5CF6' },
  { name: 'ALOS-2',         status: 'NOMINAL' as const,  bat: 84, comms: true,  mode: 'SM HH',    orb: 37842, agency: 'JAXA', live: true,  color: '#3B82F6' },
  { name: 'Sentinel-2A',    status: 'NOMINAL' as const,  bat: 91, comms: true,  mode: 'MSI L2A',  orb: 23847, agency: 'ESA',  live: true,  color: '#22C55E' },
]

export const acquisitionQueue = [
  { satellite: 'Cartosat-3',     region: 'Mumbai MMR',    mode: 'PAN+MX',  eta: 'NOW',     priority: 'HIGH' as const, sceneId: 'CS3-24062401', orb: 23441 },
  { satellite: 'RISAT-2B',       region: 'Brahmaputra',   mode: 'FRS-1',   eta: '4m 12s',  priority: 'HIGH' as const, sceneId: 'R2B-24062402', orb: 18924 },
  { satellite: 'Sentinel-1A',    region: 'NE India',      mode: 'IW',      eta: '14m 32s', priority: 'STD'  as const, sceneId: 'S1A-24062403', orb: 49312 },
  { satellite: 'ResourceSat-2A', region: 'Tamil Nadu',    mode: 'LISS-3',  eta: '42m 15s', priority: 'STD'  as const, sceneId: 'RS2-24062404', orb: 12087 },
  { satellite: 'Sentinel-2A',    region: 'Central India', mode: 'MSI L2A', eta: '1h 08m',  priority: 'STD'  as const, sceneId: 'S2A-24062405', orb: 23847 },
]

export const activeDownlinks = [
  { satellite: 'RISAT-2B',   station: 'ISTRAC Bangalore', rate: '1.2 Gbps', progress: 0.64, total: '24.3 GB', rx: '15.6 GB', orb: 18924 },
  { satellite: 'Cartosat-3', station: 'NRSC Hyderabad',   rate: '843 Mbps', progress: 0.31, total: '18.7 GB', rx: '5.8 GB',  orb: 23441 },
]

export const floodWatchRegions = [
  { region: 'Brahmaputra Basin',    level: 'ALERT'  as const, change: '+12.4%', sat: 'RISAT-2B',    color: '#EF4444' },
  { region: 'Ganga-Brahm. Delta',   level: 'MEDIUM' as const, change: '+3.2%',  sat: 'Sentinel-1A', color: '#F59E0B' },
  { region: 'Godavari Basin',       level: 'WATCH'  as const, change: '+1.8%',  sat: 'RS-2A',       color: '#F59E0B' },
  { region: 'Mahanadi River',       level: 'WATCH'  as const, change: '+0.9%',  sat: 'Sentinel-2A', color: '#64748B' },
]

export const globeHotspots: GlobeHotspot[] = [
  { id: 'h1',  coords: { lat: 26.12, lng: 91.74 },  label: 'Brahmaputra Basin — Active Flood',         type: 'flood',       intensity: 1.0 },
  { id: 'h2',  coords: { lat: 20.59, lng: 78.96 },  label: 'Central India — Agricultural Monitoring',  type: 'agriculture', intensity: 0.7 },
  { id: 'h3',  coords: { lat: 28.61, lng: 77.23 },  label: 'Delhi NCR — Urban Expansion Analysis',     type: 'urban',       intensity: 0.6 },
  { id: 'h4',  coords: { lat: 13.08, lng: 80.27 },  label: 'Chennai — Cyclone Monitoring Zone',        type: 'disaster',    intensity: 0.8 },
  { id: 'h5',  coords: { lat: 22.57, lng: 88.36 },  label: 'Kolkata — Delta Monitoring',               type: 'monitoring',  intensity: 0.5 },
  { id: 'h6',  coords: { lat: 19.08, lng: 72.88 },  label: 'Mumbai — Coastal Change Detection',        type: 'monitoring',  intensity: 0.6 },
  { id: 'h7',  coords: { lat: 12.97, lng: 77.59 },  label: 'Bangalore — Urban Heat Island',            type: 'urban',       intensity: 0.4 },
  { id: 'h8',  coords: { lat: 35.69, lng: 139.69 }, label: 'Tokyo — Seismic Monitoring',               type: 'monitoring',  intensity: 0.5 },
  { id: 'h9',  coords: { lat: 37.77, lng: -122.41 },label: 'California — Wildfire Watch',              type: 'disaster',    intensity: 0.6 },
  { id: 'h10', coords: { lat: -23.55, lng: -46.63 },label: 'São Paulo — Deforestation Watch',          type: 'agriculture', intensity: 0.7 },
  { id: 'h11', coords: { lat: 51.51, lng: -0.12 },  label: 'London — Flood Plain Analysis',            type: 'flood',       intensity: 0.4 },
  { id: 'h12', coords: { lat: 30.04, lng: 31.24 },  label: 'Cairo — Nile Delta Monitoring',            type: 'monitoring',  intensity: 0.5 },
]

export const groundStations = [
  { id: 'gs1', name: 'ISRO Master Control',     coords: { lat: 12.97, lng: 77.59 }, type: 'primary'   },
  { id: 'gs2', name: 'ISTRAC Bangalore',         coords: { lat: 13.07, lng: 77.50 }, type: 'primary'   },
  { id: 'gs3', name: 'SAC Ahmedabad',            coords: { lat: 23.02, lng: 72.57 }, type: 'secondary' },
  { id: 'gs4', name: 'NRSC Hyderabad',           coords: { lat: 17.39, lng: 78.47 }, type: 'secondary' },
  { id: 'gs5', name: 'Mauritius Ground Station', coords: { lat: -20.17, lng: 57.49 }, type: 'secondary' },
  { id: 'gs6', name: 'Bearslake Ground Station', coords: { lat: 62.70, lng: 30.07 }, type: 'secondary'  },
]
