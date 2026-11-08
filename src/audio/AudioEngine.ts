import type { AudioParams } from '../types'

// Worklet inline como Blob — evita problemas de Vite HMR en contexto AudioWorklet
const WORKLET_CODE = `
class InlineSlewLimiter {
  constructor(initial, timeMs, sampleRate) {
    this.current = initial;
    this.rate = 1 / (timeMs * sampleRate / 1000);
  }
  tick(target) {
    const diff = target - this.current;
    this.current += Math.sign(diff) * Math.min(Math.abs(diff), this.rate);
    return this.current;
  }
}

const SR = 48000;
const SLEW_MS = 500;
const MAX_DELAY_SAMPLES = Math.ceil(SR * 0.5);

class OceanSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.fmPhase = 0;
    this.foamEnv = 0;
    this.delayBuf = new Float32Array(MAX_DELAY_SAMPLES);
    this.delayPtr = 0;
    this.biquadX1 = 0; this.biquadX2 = 0;
    this.biquadY1 = 0; this.biquadY2 = 0;
    this.biquadCoeffs = { b0:1, b1:0, b2:0, a1:0, a2:0 };
    this.filterCounter = 0;

    this.targets = {
      swellFreq:110, swellAmp:0.4, fmIndex:0.5, fmFreqRatio:2,
      foamAmp:0, foamDecay:0.003, depthMix:0, depthFeedback:0.2,
      depthDelayMs:30, filterCutoffNorm:0.7, panNorm:0.5,
    };

    this.sl = {};
    for (const [k, v] of Object.entries(this.targets)) {
      this.sl[k] = new InlineSlewLimiter(v, SLEW_MS, SR);
    }

    this.port.onmessage = (e) => {
      const p = e.data;
      if (!p) return;
      for (const k of Object.keys(this.targets)) {
        if (k in p && typeof p[k] === 'number' && !Number.isNaN(p[k])) {
          this.targets[k] = p[k];
        }
      }
    };
  }

  updateBiquadLP(cutoffNorm) {
    const freq = Math.max(80, Math.min(20000, cutoffNorm * 20000));
    const w0 = 2 * Math.PI * freq / SR;
    const cosW = Math.cos(w0);
    const sinW = Math.sin(w0);
    const alpha = sinW / (2 * 0.707);
    const a0 = 1 + alpha;
    this.biquadCoeffs = {
      b0: (1 - cosW) / 2 / a0,
      b1: (1 - cosW) / a0,
      b2: (1 - cosW) / 2 / a0,
      a1: (-2 * cosW) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  process(_inputs, outputs) {
    const outL = outputs[0]?.[0];
    const outR = outputs[0]?.[1];
    if (!outL || !outR) return true;

    for (let i = 0; i < outL.length; i++) {
      const swellFreq     = this.sl.swellFreq.tick(this.targets.swellFreq);
      const swellAmp      = this.sl.swellAmp.tick(this.targets.swellAmp);
      const fmIndex       = this.sl.fmIndex.tick(this.targets.fmIndex);
      const fmFreqRatio   = this.sl.fmFreqRatio.tick(this.targets.fmFreqRatio);
      const foamAmpT      = this.sl.foamAmp.tick(this.targets.foamAmp);
      const foamDecay     = this.sl.foamDecay.tick(this.targets.foamDecay);
      const depthMix      = this.sl.depthMix.tick(this.targets.depthMix);
      const depthFeedback = this.sl.depthFeedback.tick(this.targets.depthFeedback);
      const depthDelayMs  = this.sl.depthDelayMs.tick(this.targets.depthDelayMs);
      const cutoffNorm    = this.sl.filterCutoffNorm.tick(this.targets.filterCutoffNorm);
      const panNorm       = this.sl.panNorm.tick(this.targets.panNorm);

      this.phase += (swellFreq * 2 * Math.PI) / SR;
      if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

      this.fmPhase += (swellFreq * fmFreqRatio * 2 * Math.PI) / SR;
      if (this.fmPhase > Math.PI * 2) this.fmPhase -= Math.PI * 2;

      const modulated = Math.sin(this.phase + Math.sin(this.fmPhase) * fmIndex) * swellAmp;

      this.foamEnv = this.foamEnv * (1 - foamDecay) + foamAmpT * foamDecay * 10;
      const foam = (Math.random() * 2 - 1) * Math.min(1, this.foamEnv) * 0.25;

      const delaySamples = Math.min(MAX_DELAY_SAMPLES - 1, Math.max(1, Math.round(depthDelayMs * SR / 1000)));
      const readIdx = (this.delayPtr - delaySamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES;
      const delayRead = this.delayBuf[readIdx];
      this.delayBuf[this.delayPtr] = modulated + delayRead * depthFeedback * 0.5;
      this.delayPtr = (this.delayPtr + 1) % MAX_DELAY_SAMPLES;
      const depth = delayRead * depthMix * 0.6;

      let mixed = modulated + foam + depth;

      this.filterCounter++;
      if (this.filterCounter >= 128) {
        this.updateBiquadLP(cutoffNorm);
        this.filterCounter = 0;
      }
      const { b0, b1, b2, a1, a2 } = this.biquadCoeffs;
      const filtered = b0*mixed + b1*this.biquadX1 + b2*this.biquadX2
                     - a1*this.biquadY1 - a2*this.biquadY2;
      this.biquadX2 = this.biquadX1; this.biquadX1 = mixed;
      this.biquadY2 = this.biquadY1; this.biquadY1 = filtered;
      mixed = filtered;

      const safe = Math.max(-0.95, Math.min(0.95, mixed));
      outL[i] = safe * Math.sqrt(1 - panNorm);
      outR[i] = safe * Math.sqrt(panNorm);
    }
    return true;
  }
}

registerProcessor('ocean-synth', OceanSynthProcessor);
`

export class AudioEngine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private gain: GainNode | null = null

  async start(): Promise<void> {
    this.ctx = new AudioContext({ sampleRate: 48000 })
    await this.ctx.resume()

    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    try {
      await this.ctx.audioWorklet.addModule(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }

    this.node = new AudioWorkletNode(this.ctx, 'ocean-synth')
    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0.8
    this.node.connect(this.gain)
    this.gain.connect(this.ctx.destination)
  }

  updateParams(params: AudioParams): void {
    this.node?.port.postMessage(params)
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v))
  }

  stop(): void {
    this.ctx?.close()
    this.ctx = null
    this.node = null
    this.gain = null
  }
}
