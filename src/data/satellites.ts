import type { SatelliteOrbit, GlobeHotspot } from '@/types'

export const satelliteOrbits: SatelliteOrbit[] = [
  { id: 'iss',        name: 'ISS',         inclination: 51.6,  altitude: 408,   color: '#3B82F6', period: 92.9,  phaseOffset: 0    },
  { id: 'sentinel1a', name: 'Sentinel-1A', inclination: 98.18, altitude: 693,   color: '#14B8A6', period: 98.6,  phaseOffset: 1.0  },
  { id: 'sentinel2a', name: 'Sentinel-2A', inclination: 98.62, altitude: 786,   color: '#22C55E', period: 100.6, phaseOffset: 2.1  },
  { id: 'risat2b',    name: 'RISAT-2B',    inclination: 37.0,  altitude: 557,   color: '#F59E0B', period: 95.6,  phaseOffset: 3.7  },
]

export const globeHotspots: GlobeHotspot[] = [
  { id: 'h1',  coords: { lat: 26.12, lng: 91.74 }, label: 'Brahmaputra Basin — Active Monitoring',     type: 'flood',       intensity: 1.0 },
  { id: 'h2',  coords: { lat: 20.59, lng: 78.96 }, label: 'Central India — Agricultural Monitoring',   type: 'agriculture', intensity: 0.7 },
  { id: 'h3',  coords: { lat: 28.61, lng: 77.23 }, label: 'Delhi NCR — Urban Expansion Analysis',      type: 'urban',       intensity: 0.6 },
  { id: 'h4',  coords: { lat: 13.08, lng: 80.27 }, label: 'Chennai — Cyclone Monitoring Zone',         type: 'disaster',    intensity: 0.8 },
  { id: 'h5',  coords: { lat: 22.57, lng: 88.36 }, label: 'Kolkata — Delta Monitoring',                type: 'monitoring',  intensity: 0.5 },
  { id: 'h6',  coords: { lat: 19.08, lng: 72.88 }, label: 'Mumbai — Coastal Change Detection',        type: 'monitoring',  intensity: 0.6 },
  { id: 'h7',  coords: { lat: 12.97, lng: 77.59 }, label: 'Bangalore — Urban Heat Island',             type: 'urban',       intensity: 0.4 },
  { id: 'h8',  coords: { lat: 35.69, lng: 139.69 }, label: 'Tokyo — Seismic Monitoring',              type: 'monitoring',  intensity: 0.5 },
  { id: 'h9',  coords: { lat: 37.77, lng: -122.41 }, label: 'San Francisco — Wildfire Watch',          type: 'disaster',    intensity: 0.6 },
  { id: 'h10', coords: { lat: -23.55, lng: -46.63 }, label: 'São Paulo — Deforestation Watch',         type: 'agriculture', intensity: 0.7 },
  { id: 'h11', coords: { lat: 51.51, lng: -0.12 }, label: 'London — Flood Plain Analysis',             type: 'flood',       intensity: 0.4 },
  { id: 'h12', coords: { lat: 30.04, lng: 31.24 }, label: 'Cairo — Nile Delta Monitoring',             type: 'monitoring',  intensity: 0.5 },
]

export const groundStations = [
  { id: 'gs1', name: 'ISRO Master Control',     coords: { lat: 12.97, lng: 77.59 }, type: 'primary' },
  { id: 'gs2', name: 'ISTRAC Bangalore',         coords: { lat: 13.07, lng: 77.50 }, type: 'primary' },
  { id: 'gs3', name: 'SAC Ahmedabad',            coords: { lat: 23.02, lng: 72.57 }, type: 'secondary' },
  { id: 'gs4', name: 'NRSC Hyderabad',           coords: { lat: 17.39, lng: 78.47 }, type: 'secondary' },
  { id: 'gs5', name: 'Mauritius Ground Station', coords: { lat: -20.17, lng: 57.49 }, type: 'secondary' },
  { id: 'gs6', name: 'Bearslake Ground Station', coords: { lat: 62.70, lng: 30.07 }, type: 'secondary' },
]
