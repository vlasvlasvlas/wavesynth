import type { AnimalState, OceanState, AudioParams } from '../types'

function mapPeriodToSwellFreq(periodS: number | null): number {
  if (periodS === null) return 110
  const norm = (periodS - 4) / (24 - 4) // 4–24s → 0–1
  return 55 * Math.pow(4, Math.max(0, Math.min(1, norm)))
}

function mapHeightToSwellAmp(heightM: number | null): number {
  if (heightM === null) return 0.4
  return Math.max(0.1, Math.min(0.8, (heightM - 0.2) / (18 - 0.2) * 0.7 + 0.1))
}

function mapWindToFmIndex(windMS: number | null): number {
  if (windMS === null) return 0
  return Math.min(1.0, windMS / 33)
}

function mapHeadingToFmRatio(headingDeg: number | null): number {
  if (headingDeg === null) return 2
  return 1.0 + (headingDeg / 360) * 3.0
}

function mapWindToFoamAmp(windMS: number | null): number {
  if (windMS === null || windMS < 15) return 0
  return Math.min(0.4, (windMS - 15) / (33 - 15) * 0.4)
}

function mapDepthToMix(depthM: number | null): number {
  if (depthM === null || depthM <= 0) return 0
  return Math.log1p(depthM) / Math.log1p(2000)
}

function mapTempToFilterCutoff(tempC: number | null): number {
  if (tempC === null) return 0.7
  return 1 - ((tempC - 1) / 31) * 0.7
}

function mapLonToPan(lon: number | null): number {
  if (lon === null) return 0.5
  return (lon + 180) / 360
}

export function mapToAudioParams(animal: AnimalState, ocean: OceanState): AudioParams {
  const depthMix = mapDepthToMix(animal.depthM)

  // Mapeo gestual del animal surfeando sobre la forma de onda
  let harmonicFold = 0.0
  let resonanceQ = 0.7
  if (animal.surfZone === 'lip') {
    harmonicFold = 0.55 // Distorsión y plegado de armónicos al cortar la cresta
  } else if (animal.surfZone === 'barrel') {
    resonanceQ = 2.8 // Resonancia hueca y tubular
  }

  return {
    swellFreq: mapPeriodToSwellFreq(ocean.peakPeriodS),
    swellAmp: mapHeightToSwellAmp(ocean.waveHeightM),
    fmIndex: mapWindToFmIndex(ocean.windSpeedMS),
    fmFreqRatio: mapHeadingToFmRatio(animal.headingDeg),
    foamAmp: mapWindToFoamAmp(ocean.windSpeedMS),
    foamDecay: 0.003,
    depthMix,
    depthFeedback: Math.min(0.85, 0.2 + depthMix * 0.65),
    depthDelayMs: 30 + depthMix * 470,
    filterCutoffNorm: mapTempToFilterCutoff(ocean.waterTempC),
    panNorm: mapLonToPan(animal.lon),
    harmonicFold,
    resonanceQ,
  }
}
