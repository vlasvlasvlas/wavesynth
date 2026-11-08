export interface TrackPoint {
  timestamp: number
  lat: number
  lon: number
  depthM: number | null
  speedMS: number | null
  headingDeg: number | null
}

export interface AnimalTrack {
  animalId: string
  species: string
  points: TrackPoint[]
}

export interface AnimalState extends TrackPoint {
  animalId: string
  species: string
  provenance: 'synthetic' | 'live' | 'archive'
  // Propiedades de surf sobre la onda acústica
  waveXNorm?: number    // 0..1 posición horizontal sobre la forma de onda
  surfZone?: 'lip' | 'face' | 'barrel' | 'trough' // cresta, pared, tubo, valle
  waveSlopeDeg?: number // inclinación de la onda bajo el animal
}

export interface OceanState {
  lat: number | null
  lon: number | null
  spotName?: string
  waveHeightM: number | null
  peakPeriodS: number | null
  waveDirectionDeg: number | null
  windSpeedMS: number | null
  waterTempC: number | null
  fetchedAt: number
}

export interface AudioParams {
  swellFreq: number
  swellAmp: number
  fmIndex: number
  fmFreqRatio: number
  foamAmp: number
  foamDecay: number
  depthMix: number
  depthFeedback: number
  depthDelayMs: number
  filterCutoffNorm: number
  panNorm: number
  // Nuevos moduladores gestuales de surf
  harmonicFold?: number  // Distorsión / wavefolding al cortar la cresta
  resonanceQ?: number    // Resonancia de tubo (barrel)
}

export interface MarineSpot {
  id: string
  name: string
  region: string
  lat: number
  lon: number
  description: string
  icon: string
}
