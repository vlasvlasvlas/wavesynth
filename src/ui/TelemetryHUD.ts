import type { AnimalState, OceanState } from '../types'

function logBar(value: number, min: number, max: number, bars = 12): string {
  const norm = (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))
  const filled = Math.round(Math.max(0, Math.min(1, norm)) * bars)
  return '█'.repeat(filled) + '░'.repeat(bars - filled)
}

function lfoWave(phase: number, bars = 12): string {
  const pos = Math.round(((Math.sin(phase) + 1) / 2) * (bars - 1))
  return '·'.repeat(pos) + '◉' + '·'.repeat(bars - 1 - pos)
}

// Calcula nota musical más cercana a partir de Hz
function hzToNoteName(hz: number): string {
  if (hz < 16) return 'Sub-audio'
  const notes = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
  const midi = Math.round(69 + 12 * Math.log2(hz / 440))
  const note = notes[((midi % 12) + 12) % 12]
  const oct = Math.floor(midi / 12) - 1
  return `${note}${oct}`
}

export class TelemetryHUD {
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = container
    this.el.style.cssText = `
      position:absolute;top:16px;left:16px;
      font-family:'Courier New',monospace;font-size:11px;
      color:#00f5d4;background:rgba(2,11,20,0.92);
      padding:14px 18px;border:1px solid rgba(0,245,212,0.28);
      pointer-events:none;white-space:pre;line-height:1.7;
      min-width:270px;box-shadow:0 8px 30px rgba(0,0,0,0.65);
      backdrop-filter:blur(8px);
      max-height:calc(100vh - 120px);overflow-y:auto;
    `
  }

  update(
    animal: AnimalState,
    ocean: OceanState,
    freqHz   = 110,
    pitchMult = 1,
    panNorm   = 0.5,
    lfoPhase  = 0,
    lfoRate   = 0.08,
    waveType  = 0,
  ): void {
    const fmt = (v: number | null | undefined, d = 1) =>
      v !== null && v !== undefined ? v.toFixed(d) : '—'

    const waveNames = ['SINE ∿', 'SQUARE ⊓', 'SAW /', 'TRIANGLE ∧']
    const waveName  = waveNames[Math.round(waveType) % 4] ?? waveNames[0]

    const noteName = hzToNoteName(freqHz)
    const freqDisplay = freqHz < 1000
      ? `${freqHz.toFixed(1)} Hz (${noteName})`
      : `${(freqHz / 1000).toFixed(2)} kHz (${noteName})`

    const pitchArrow = pitchMult > 1.05 ? '▲ AGUDO' : pitchMult < 0.95 ? '▼ GRAVE' : '● BASE'

    const zone = animal.surfZone ?? 'face'
    const zoneEffect = {
      lip:    'Cresta · wavefolding & saturación',
      barrel: 'Tubo · resonancia hueca Q',
      face:   'Pared · onda pura',
      trough: 'Valle · sub-bass abisal',
    }[zone]

    this.el.textContent = [
      `🌊 WAVESYNTH · ${waveName}`,
      `────────────────────────────────`,
      `FRECUENCIA [↑ arriba / ↓ abajo]`,
      `  ${logBar(freqHz, 20, 8000)}`,
      `  ${freqDisplay}  ${pitchArrow}`,
      `  (más agudo = ola apretada / más grave = ola grande)`,
      ``,
      `RESPIRACIÓN LFO (FILTRO & MAREA)`,
      `  ${lfoWave(lfoPhase)}  ${lfoRate.toFixed(2)} Hz`,
      ``,
      `BARCO: ${zone.toUpperCase()}`,
      `  ${zoneEffect}`,
      `  Inclinación: ${fmt(animal.waveSlopeDeg, 0)}°`,
      `────────────────────────────────`,
      `TELEMETRÍA MARINA EN VIVO:`,
      `  Tp ${fmt(ocean.peakPeriodS, 0)}s · Oleaje ${fmt(ocean.waveHeightM, 1)}m`,
      `  Viento ${fmt(ocean.windSpeedMS, 1)}m/s · Temp ${fmt(ocean.waterTempC, 1)}°C`,
      ocean.fetchedAt > 0 ? `🟢 Open-Meteo Marine` : `⚡ Síntesis local`,
    ].join('\n')
  }
}
