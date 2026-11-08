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
}

export interface OceanState {
  lat: number | null
  lon: number | null
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
}
