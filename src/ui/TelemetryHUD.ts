import type { AnimalState, OceanState } from '../types'

export class TelemetryHUD {
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = container
    this.el.style.cssText = `
      position:absolute;top:16px;left:16px;
      font-family:'Courier New',monospace;font-size:11px;
      color:#00f5d4;background:rgba(2,11,20,0.85);
      padding:14px 18px;border:1px solid rgba(0,245,212,0.25);
      pointer-events:none;white-space:pre;line-height:1.6;
      min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.5);
      backdrop-filter:blur(8px);
    `
  }

  update(animal: AnimalState, ocean: OceanState): void {
    const fmt = (v: number | null | undefined, d = 1) =>
      v !== null && v !== undefined ? v.toFixed(d) : '—'

    const spotTitle = ocean.spotName ?? 'Atlántico Sur (Cuenca Abisal)'
    const zone = animal.surfZone ?? 'face'

    const zoneDescriptions = {
      lip: '⚡ Cresta: saturación armónica (Wavefolding)',
      barrel: '🌀 Tubo: resonancia hueca cavernosa',
      face: '🌊 Pared: sinewave pura & barrido FM',
      trough: '⚓ Valle: sub-graves profundos & eco',
    }

    this.el.textContent = [
      `🌊 WAVESYNTH · TELEMETRÍA MARINA`,
      `📍 ${spotTitle}`,
      `──────────────────────────────────────`,
      `LAT  ${fmt(animal.lat, 2)}°   LON  ${fmt(animal.lon, 2)}°`,
      `──────────────────────────────────────`,
      `DATOS METEOROLÓGICOS DEL AGUA:`,
      `• OLA (Hs)    ${fmt(ocean.waveHeightM, 1)} m   → Amplitud y altura de la onda`,
      `• PERÍODO (Tp)${fmt(ocean.peakPeriodS, 0)} s   → Tono oscilador fundamental`,
      `• VIENTO      ${fmt(ocean.windSpeedMS, 1)} m/s → Modulación FM (arruga la onda)`,
      `• TEMPERATURA ${fmt(ocean.waterTempC, 1)} °C  → Brillo / Filtro resonante`,
      `──────────────────────────────────────`,
      `ESTADO DEL SURFISTA EN LA OLA:`,
      `• Posición: ${zone.toUpperCase()}`,
      `  ${zoneDescriptions[zone]}`,
      `• Inclinación ola: ${fmt(animal.waveSlopeDeg, 0)}°`,
      `──────────────────────────────────────`,
      ocean.fetchedAt > 0 ? `🟢 DATOS EN VIVO (Open-Meteo Marine)` : `⚡ SÍNTESIS MODELADA (Offline)`,
    ].join('\n')
  }
}
