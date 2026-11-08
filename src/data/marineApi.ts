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
    // Marine API: olas y swell. Wind speed requiere el endpoint de forecast por separado.
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_period,wave_direction`
    const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,temperature_2m`

    const [marineRes, windRes] = await Promise.all([fetch(marineUrl), fetch(windUrl)])

    const marine = marineRes.ok ? (await marineRes.json()).current ?? {} : {}
    const weather = windRes.ok ? (await windRes.json()).current ?? {} : {}

    return {
      lat,
      lon,
      waveHeightM: marine.wave_height ?? null,
      peakPeriodS: marine.wave_period ?? null,
      waveDirectionDeg: marine.wave_direction ?? null,
      windSpeedMS: weather.wind_speed_10m ?? null,
      waterTempC: weather.temperature_2m ?? null,
      fetchedAt: Date.now(),
    }
  } catch {
    return buildOceanFallback(lat, lon)
  }
}
