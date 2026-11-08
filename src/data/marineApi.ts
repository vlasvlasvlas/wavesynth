import type { OceanState } from '../types'

export function buildOceanFallback(lat: number, lon: number): OceanState {
  return {
    lat,
    lon,
    waveHeightM: null,
    peakPeriodS: null,
    waveDirectionDeg: null,
    windSpeedMS: null,
    waterTempC: null,
    fetchedAt: 0,
  }
}

export async function fetchOceanState(lat: number, lon: number): Promise<OceanState> {
  try {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period`
    const res = await fetch(url)
    if (!res.ok) return buildOceanFallback(lat, lon)
    const json = await res.json()
    const c = json.current ?? {}
    return {
      lat,
      lon,
      waveHeightM: c.wave_height ?? null,
      peakPeriodS: c.wave_period ?? null,
      waveDirectionDeg: c.wave_direction ?? null,
      windSpeedMS: c.wind_wave_height ?? null,
      waterTempC: null,
      fetchedAt: Date.now(),
    }
  } catch {
    return buildOceanFallback(lat, lon)
  }
}
