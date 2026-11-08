// SlewLimiter duplicado inline — no puede importarse desde el hilo de audio
class InlineSlewLimiter {
  current: number
  private rate: number
  constructor(initial: number, timeMs: number, sampleRate: number) {
    this.current = initial
    this.rate = 1 / (timeMs * sampleRate / 1000)
  }
  tick(target: number): number {
    const diff = target - this.current
    this.current += Math.sign(diff) * Math.min(Math.abs(diff), this.rate)
    return this.current
  }
}

const SR = 48000
const SLEW_MS = 500
const MAX_DELAY_SAMPLES = Math.ceil(SR * 0.5) // 500ms

class OceanSynthProcessor extends AudioWorkletProcessor {
  private phase = 0
  private fmPhase = 0
  private foamEnv = 0
  private delayBuf: Float32Array
  private delayPtr = 0
  private biquadX1 = 0
  private biquadX2 = 0
  private biquadY1 = 0
  private biquadY2 = 0
  private biquadCoeffs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
  private filterDirty = true
  private filterUpdateCounter = 0

  // Slew limiters for all params
  private sl = {
    swellFreq:       new InlineSlewLimiter(110,  SLEW_MS, SR),
    swellAmp:        new InlineSlewLimiter(0.4,  SLEW_MS, SR),
    fmIndex:         new InlineSlewLimiter(0.5,  SLEW_MS, SR),
    fmFreqRatio:     new InlineSlewLimiter(2,    SLEW_MS, SR),
    foamAmp:         new InlineSlewLimiter(0,    SLEW_MS, SR),
    foamDecay:       new InlineSlewLimiter(0.003,SLEW_MS, SR),
    depthMix:        new InlineSlewLimiter(0,    SLEW_MS, SR),
    depthFeedback:   new InlineSlewLimiter(0.2,  SLEW_MS, SR),
    depthDelayMs:    new InlineSlewLimiter(30,   SLEW_MS, SR),
    filterCutoffNorm:new InlineSlewLimiter(0.7,  SLEW_MS, SR),
    panNorm:         new InlineSlewLimiter(0.5,  SLEW_MS, SR),
  }

  // Targets updated by postMessage
  private targets = {
    swellFreq: 110, swellAmp: 0.4, fmIndex: 0.5, fmFreqRatio: 2,
    foamAmp: 0, foamDecay: 0.003, depthMix: 0, depthFeedback: 0.2,
    depthDelayMs: 30, filterCutoffNorm: 0.7, panNorm: 0.5,
  }

  constructor() {
    super()
    this.delayBuf = new Float32Array(MAX_DELAY_SAMPLES)
    this.port.onmessage = (e) => {
      const p = e.data
      if (!p) return
      for (const k of Object.keys(this.targets) as Array<keyof typeof this.targets>) {
        if (k in p && typeof p[k] === 'number' && !Number.isNaN(p[k])) {
          this.targets[k] = p[k]
        }
      }
      this.filterDirty = true
    }
  }

  private updateBiquadLP(cutoffNorm: number): void {
    const freq = Math.max(80, Math.min(20000, cutoffNorm * 20000))
    const w0 = 2 * Math.PI * freq / SR
    const cosW = Math.cos(w0)
    const sinW = Math.sin(w0)
    const alpha = sinW / (2 * 0.707) // Q=0.707 (Butterworth)
    const b0 = (1 - cosW) / 2
    const b1 = 1 - cosW
    const b2 = (1 - cosW) / 2
    const a0 = 1 + alpha
    this.biquadCoeffs = {
      b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
      a1: (-2 * cosW) / a0, a2: (1 - alpha) / a0,
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1]
    if (!outL || !outR) return true

    const len = outL.length

    for (let i = 0; i < len; i++) {
      // Slew all params
      const swellFreq     = this.sl.swellFreq.tick(this.targets.swellFreq)
      const swellAmp      = this.sl.swellAmp.tick(this.targets.swellAmp)
      const fmIndex       = this.sl.fmIndex.tick(this.targets.fmIndex)
      const fmFreqRatio   = this.sl.fmFreqRatio.tick(this.targets.fmFreqRatio)
      const foamAmpT      = this.sl.foamAmp.tick(this.targets.foamAmp)
      const foamDecay     = this.sl.foamDecay.tick(this.targets.foamDecay)
      const depthMix      = this.sl.depthMix.tick(this.targets.depthMix)
      const depthFeedback = this.sl.depthFeedback.tick(this.targets.depthFeedback)
      const depthDelayMs  = this.sl.depthDelayMs.tick(this.targets.depthDelayMs)
      const cutoffNorm    = this.sl.filterCutoffNorm.tick(this.targets.filterCutoffNorm)
      const panNorm       = this.sl.panNorm.tick(this.targets.panNorm)

      // Swell oscillator
      const phaseInc = (swellFreq * 2 * Math.PI) / SR
      this.phase += phaseInc
      if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2

      // Surface FM
      const fmPhaseInc = (swellFreq * fmFreqRatio * 2 * Math.PI) / SR
      this.fmPhase += fmPhaseInc
      if (this.fmPhase > Math.PI * 2) this.fmPhase -= Math.PI * 2

      const modulated = Math.sin(this.phase + Math.sin(this.fmPhase) * fmIndex) * swellAmp

      // Foam layer (noise burst)
      this.foamEnv = this.foamEnv * (1 - foamDecay) + foamAmpT * foamDecay
      const foam = (Math.random() * 2 - 1) * this.foamEnv * 0.3

      // Depth resonator (comb/delay)
      const delaySamples = Math.min(MAX_DELAY_SAMPLES - 1, Math.max(1, Math.round(depthDelayMs * SR / 1000)))
      const readIdx = (this.delayPtr - delaySamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES
      const delayRead = this.delayBuf[readIdx]
      this.delayBuf[this.delayPtr] = modulated + delayRead * depthFeedback * 0.5
      this.delayPtr = (this.delayPtr + 1) % MAX_DELAY_SAMPLES
      const depth = delayRead * depthMix * 0.6

      // Mix
      let mixed = modulated + foam + depth

      // Biquad LP filter (recalc every 128 samples or when dirty)
      this.filterUpdateCounter++
      if (this.filterDirty || this.filterUpdateCounter >= 128) {
        this.updateBiquadLP(cutoffNorm)
        this.filterDirty = false
        this.filterUpdateCounter = 0
      }
      const { b0, b1, b2, a1, a2 } = this.biquadCoeffs
      const filtered = b0 * mixed + b1 * this.biquadX1 + b2 * this.biquadX2
                     - a1 * this.biquadY1 - a2 * this.biquadY2
      this.biquadX2 = this.biquadX1
      this.biquadX1 = mixed
      this.biquadY2 = this.biquadY1
      this.biquadY1 = filtered
      mixed = filtered

      // Hard limiter
      const safe = Math.max(-0.95, Math.min(0.95, mixed))

      // Pan (equal power)
      outL[i] = safe * Math.sqrt(1 - panNorm)
      outR[i] = safe * Math.sqrt(panNorm)
    }

    return true
  }
}

registerProcessor('ocean-synth', OceanSynthProcessor)
