import { describe, it, expect } from 'vitest'
import { mapToAudioParams } from './animalToAudio'
import type { AnimalState, OceanState } from '../types'

const baseAnimal: AnimalState = {
  animalId: 'test', species: 'Physeter macrocephalus', provenance: 'synthetic',
  timestamp: 0, lat: -45, lon: -60, depthM: 500, speedMS: 2, headingDeg: 90,
}
const baseOcean: OceanState = {
  lat: -45, lon: -60, waveHeightM: 3, peakPeriodS: 12,
  waveDirectionDeg: 270, windSpeedMS: 10, waterTempC: 15, fetchedAt: 1,
}

it('peakPeriodS 12s → swellFreq cercano a 96 Hz (55*4^0.4)', () => {
  const p = mapToAudioParams(baseAnimal, baseOcean)
  expect(p.swellFreq).toBeCloseTo(95.76, 0)
})

it('depthM null → depthMix 0', () => {
  const p = mapToAudioParams({ ...baseAnimal, depthM: null }, baseOcean)
  expect(p.depthMix).toBe(0)
})

it('windSpeedMS 20 → foamAmp > 0', () => {
  const p = mapToAudioParams(baseAnimal, { ...baseOcean, windSpeedMS: 20 })
  expect(p.foamAmp).toBeGreaterThan(0)
})

it('windSpeedMS 10 → foamAmp 0 (por debajo del umbral 15)', () => {
  const p = mapToAudioParams(baseAnimal, { ...baseOcean, windSpeedMS: 10 })
  expect(p.foamAmp).toBe(0)
})

it('waterTempC 1 → filterCutoffNorm 1', () => {
  const p = mapToAudioParams(baseAnimal, { ...baseOcean, waterTempC: 1 })
  expect(p.filterCutoffNorm).toBeCloseTo(1, 2)
})

it('waterTempC 32 → filterCutoffNorm cercano a 0.3', () => {
  const p = mapToAudioParams(baseAnimal, { ...baseOcean, waterTempC: 32 })
  expect(p.filterCutoffNorm).toBeCloseTo(0.3, 1)
})

it('todos null → valores por defecto válidos sin NaN', () => {
  const nullOcean: OceanState = {
    lat: null, lon: null, waveHeightM: null, peakPeriodS: null,
    waveDirectionDeg: null, windSpeedMS: null, waterTempC: null, fetchedAt: 0,
  }
  const p = mapToAudioParams(
    { ...baseAnimal, depthM: null, speedMS: null, headingDeg: null, lon: null },
    nullOcean,
  )
  Object.values(p).forEach(v => expect(Number.isNaN(v)).toBe(false))
})

it('lon -180 → panNorm 0, lon 180 → panNorm 1', () => {
  const left = mapToAudioParams({ ...baseAnimal, lon: -180 }, baseOcean)
  const right = mapToAudioParams({ ...baseAnimal, lon: 180 }, baseOcean)
  expect(left.panNorm).toBeCloseTo(0, 3)
  expect(right.panNorm).toBeCloseTo(1, 3)
})
