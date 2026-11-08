import type { AnimalState, OceanState } from '../types'

export class TelemetryHUD {
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = container
    this.el.style.cssText = `
      position:absolute;top:16px;left:16px;
      font-family:'Courier New',monospace;font-size:12px;
      color:#00f5d4;background:rgba(2,11,20,0.75);
      padding:12px;border:1px solid rgba(0,245,212,0.15);
      pointer-events:none;white-space:pre;line-height:1.6;
      min-width:220px;
    `
  }

  update(animal: AnimalState, ocean: OceanState): void {
    const fmt = (v: number | null, d = 1) =>
      v !== null ? v.toFixed(d) : '—'

    this.el.textContent = [
      `${animal.species}`,
      `ID  ${animal.animalId}`,
      `────────────────────`,
      `LAT  ${fmt(animal.lat, 3)}°`,
      `LON  ${fmt(animal.lon, 3)}°`,
      `DEP  ${fmt(animal.depthM, 0)} m`,
      `SPD  ${fmt(animal.speedMS, 1)} m/s`,
      `HDG  ${fmt(animal.headingDeg, 0)}°`,
      `────────────────────`,
      `Hs   ${fmt(ocean.waveHeightM, 1)} m`,
      `Tp   ${fmt(ocean.peakPeriodS, 0)} s`,
      `WIND ${fmt(ocean.windSpeedMS, 1)} m/s`,
      `TEMP ${fmt(ocean.waterTempC, 1)} °C`,
      ocean.fetchedAt > 0
        ? `DATA live`
        : `DATA synth`,
    ].join('\n')
  }
}
