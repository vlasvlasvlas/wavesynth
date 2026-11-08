// Autopilot autónomo del cachalote (Physeter macrocephalus)
// Ciclos de profundidad + movimiento horizontal lento

export interface WhaleState {
  depthM:    number  // 0-2000m
  panNorm:   number  // 0-1 posición horizontal
  // Params de audio derivados
  freq:      number  // 28-80 Hz sub-grave
  amp:       number  // 0-0.5
  delayMs:   number  // 100-480ms (eco de profundidad)
  feedback:  number  // 0.3-0.85
  depthMix:  number  // 0.2-0.7
}

const CYCLE_MS = 42000  // 42s = 20s bajada + 10s ascenso + 12s superficie
const MAX_DEPTH = 1800

export class WhaleAutopilot {
  private elapsed = Math.random() * CYCLE_MS  // empieza en fase aleatoria del ciclo
  private panBase = 0.4 + Math.random() * 0.2

  state: WhaleState = this.compute(0)

  tick(dt: number): void {
    this.elapsed = (this.elapsed + dt) % CYCLE_MS
    this.state = this.compute(this.elapsed)
  }

  private compute(elapsed: number): WhaleState {
    const cyclePct = elapsed / CYCLE_MS

    // Curva de profundidad: descenso suave (0-50%), ascenso (50-74%), superficie (74-100%)
    let depthNorm = 0
    if (cyclePct < 0.50) {
      // Inmersión: ease-in cuadrática
      const t = cyclePct / 0.50
      depthNorm = t * t
    } else if (cyclePct < 0.74) {
      // Ascenso: ease-out
      const t = (cyclePct - 0.50) / 0.24
      depthNorm = 1 - t
    }
    // cyclePct 0.74-1.0 = superficie (depthNorm = 0)

    const depthM   = depthNorm * MAX_DEPTH
    // Paneo: oscilación doble senoidal lenta (deriva natural)
    const panNorm  = Math.max(0.05, Math.min(0.95,
      this.panBase
      + Math.sin(elapsed * 0.00012) * 0.28
      + Math.cos(elapsed * 0.000073) * 0.10
    ))

    // Frecuencia sub-grave: 80Hz superficie → 28Hz en máxima profundidad
    const freq    = 80 - depthNorm * 52

    // Amplitud: inaudible en superficie, máximo en profundidad
    const amp     = depthM < 80 ? 0 : Math.min(0.42, 0.08 + depthNorm * 0.34)

    // Delay y eco: cortos en superficie, largos en profundidad
    const delayMs  = 110 + depthNorm * 370
    const feedback = 0.28 + depthNorm * 0.52
    const depthMix = 0.18 + depthNorm * 0.52

    return { depthM, panNorm, freq, amp, delayMs, feedback, depthMix }
  }
}
