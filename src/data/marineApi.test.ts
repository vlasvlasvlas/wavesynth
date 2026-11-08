import { describe, it, expect } from 'vitest'
import { buildOceanFallback } from './marineApi'

describe('buildOceanFallback', () => {
  it('devuelve OceanState con lat/lon y todos los demás campos null', () => {
    const state = buildOceanFallback(-45, -60)
    expect(state.lat).toBe(-45)
    expect(state.lon).toBe(-60)
    expect(state.waveHeightM).toBeNull()
    expect(state.peakPeriodS).toBeNull()
    expect(state.waveDirectionDeg).toBeNull()
    expect(state.windSpeedMS).toBeNull()
    expect(state.waterTempC).toBeNull()
    expect(state.fetchedAt).toBe(0)
  })
})
