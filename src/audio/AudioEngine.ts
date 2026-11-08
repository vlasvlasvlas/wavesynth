import type { AudioParams } from '../types'

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
    // ── Voice A: Surfista ─────────────────────────────────────────────
    this.phase = 0;
    this.fmPhase = 0;
    this.foamEnv = 0;
    this.delayBuf = new Float32Array(MAX_DELAY_SAMPLES);
    this.delayPtr = 0;
    this.biquadX1 = 0; this.biquadX2 = 0;
    this.biquadY1 = 0; this.biquadY2 = 0;
    this.biquadCoeffs = { b0:1, b1:0, b2:0, a1:0, a2:0 };
    this.filterCounter = 0;

    // ── Voice B: Ballena ──────────────────────────────────────────────
    this.whalePhase = 0;
    this.whaleLFO   = 0;
    this.whaleDelayBuf = new Float32Array(MAX_DELAY_SAMPLES);
    this.whaleDelayPtr = 0;

    this.targets = {
      // Voice A
      swellFreq:110, swellAmp:0.4, fmIndex:0, fmFreqRatio:2,
      foamAmp:0, foamDecay:0.003, depthMix:0, depthFeedback:0.2,
      depthDelayMs:30, filterCutoffNorm:0.7, panNorm:0.5,
      harmonicFold:0.0, resonanceQ:0.7, waveType:0,
      // Voice B
      whaleFreq:40, whaleAmp:0, whalePanNorm:0.5,
      whaleDepthMix:0.3, whaleFeedback:0.5, whaleDelayMs:200,
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

  updateBiquadLP(cutoffNorm, qVal = 0.7) {
    const freq  = Math.max(80, Math.min(20000, cutoffNorm * 20000));
    const q     = Math.max(0.5, Math.min(5.0, qVal));
    const w0    = 2 * Math.PI * freq / SR;
    const cosW  = Math.cos(w0);
    const sinW  = Math.sin(w0);
    const alpha = sinW / (2 * q);
    const a0    = 1 + alpha;
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
      // ── Voice A: Surfista ───────────────────────────────────────────
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
      const harmonicFold  = this.sl.harmonicFold.tick(this.targets.harmonicFold);
      const resonanceQ    = this.sl.resonanceQ.tick(this.targets.resonanceQ);
      const waveType      = this.sl.waveType.tick(this.targets.waveType);

      this.phase += (swellFreq * 2 * Math.PI) / SR;
      if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
      this.fmPhase += (swellFreq * fmFreqRatio * 2 * Math.PI) / SR;
      if (this.fmPhase > Math.PI * 2) this.fmPhase -= Math.PI * 2;

      const fmMod = Math.sin(this.fmPhase) * fmIndex;
      const p = this.phase + fmMod;
      const p01 = (p % (Math.PI * 2)) / (Math.PI * 2);
      let rawOsc;
      const wt = Math.round(waveType);
      if (wt === 1) {
        rawOsc = p % (Math.PI * 2) < Math.PI ? 1.0 : -1.0;  // square
      } else if (wt === 2) {
        rawOsc = 1.0 - 2.0 * p01;                             // sawtooth
      } else if (wt === 3) {
        rawOsc = p01 < 0.5 ? 4.0 * p01 - 1.0 : 3.0 - 4.0 * p01; // triangle
      } else {
        rawOsc = Math.sin(p);                                  // sine (default)
      }
      if (harmonicFold > 0.02) {
        rawOsc = Math.sin(rawOsc * (1.0 + harmonicFold * 2.8));
      }
      const modulated = rawOsc * swellAmp;

      this.foamEnv = this.foamEnv * (1 - foamDecay) + foamAmpT * foamDecay;
      const foam = (Math.random() * 2 - 1) * this.foamEnv * 0.08;

      const dSamples = Math.min(MAX_DELAY_SAMPLES - 1, Math.max(1, Math.round(depthDelayMs * SR / 1000)));
      const dReadIdx = (this.delayPtr - dSamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES;
      const dRead    = this.delayBuf[dReadIdx];
      this.delayBuf[this.delayPtr] = modulated + dRead * depthFeedback * 0.5;
      this.delayPtr = (this.delayPtr + 1) % MAX_DELAY_SAMPLES;
      let mixA = modulated + foam + dRead * depthMix * 0.6;

      this.filterCounter++;
      if (this.filterCounter >= 128) {
        this.updateBiquadLP(cutoffNorm, resonanceQ);
        this.filterCounter = 0;
      }
      const { b0, b1, b2, a1, a2 } = this.biquadCoeffs;
      const filtered = b0*mixA + b1*this.biquadX1 + b2*this.biquadX2
                     - a1*this.biquadY1 - a2*this.biquadY2;
      this.biquadX2 = this.biquadX1; this.biquadX1 = mixA;
      this.biquadY2 = this.biquadY1; this.biquadY1 = filtered;
      const safeA = Math.max(-0.9, Math.min(0.9, filtered));

      // ── Voice B: Ballena (sub-grave) ────────────────────────────────
      const whaleFreq     = this.sl.whaleFreq.tick(this.targets.whaleFreq);
      const whaleAmp      = this.sl.whaleAmp.tick(this.targets.whaleAmp);
      const whalePanNorm  = this.sl.whalePanNorm.tick(this.targets.whalePanNorm);
      const whaleDepthMix = this.sl.whaleDepthMix.tick(this.targets.whaleDepthMix);
      const whaleFeedback = this.sl.whaleFeedback.tick(this.targets.whaleFeedback);
      const whaleDelayMs  = this.sl.whaleDelayMs.tick(this.targets.whaleDelayMs);

      this.whalePhase += (whaleFreq * 2 * Math.PI) / SR;
      if (this.whalePhase > Math.PI * 2) this.whalePhase -= Math.PI * 2;
      this.whaleLFO += (0.07 * 2 * Math.PI) / SR; // LFO 0.07Hz — muy lento
      if (this.whaleLFO > Math.PI * 2) this.whaleLFO -= Math.PI * 2;

      // Sub-sine con modulación de amplitud lenta (respiración)
      const breathMod = 0.65 + 0.35 * Math.sin(this.whaleLFO);
      const whaleSine = Math.sin(this.whalePhase) * whaleAmp * breathMod;

      // Eco profundo (delay largo)
      const wSamples = Math.min(MAX_DELAY_SAMPLES - 1, Math.max(1, Math.round(whaleDelayMs * SR / 1000)));
      const wReadIdx = (this.whaleDelayPtr - wSamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES;
      const wRead    = this.whaleDelayBuf[wReadIdx];
      this.whaleDelayBuf[this.whaleDelayPtr] = whaleSine + wRead * whaleFeedback * 0.55;
      this.whaleDelayPtr = (this.whaleDelayPtr + 1) % MAX_DELAY_SAMPLES;
      const whaleOut = whaleSine + wRead * whaleDepthMix * 0.5;
      const safeB = Math.max(-0.6, Math.min(0.6, whaleOut));

      // ── Mezcla final estéreo ────────────────────────────────────────
      const aL = safeA * Math.sqrt(1 - panNorm);
      const aR = safeA * Math.sqrt(panNorm);
      const bL = safeB * Math.sqrt(1 - whalePanNorm);
      const bR = safeB * Math.sqrt(whalePanNorm);
      outL[i] = Math.max(-0.95, Math.min(0.95, aL + bL));
      outR[i] = Math.max(-0.95, Math.min(0.95, aR + bR));
    }
    return true;
  }
}

registerProcessor('ocean-synth', OceanSynthProcessor);
`

export class AudioEngine {
  private ctx:      AudioContext | null     = null
  private node:     AudioWorkletNode | null = null
  private gain:     GainNode | null         = null
  private analyser: AnalyserNode | null     = null

  async start(): Promise<void> {
    this.ctx = new AudioContext({ sampleRate: 48000 })
    await this.ctx.resume()

    const blob    = new Blob([WORKLET_CODE], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    try {
      await this.ctx.audioWorklet.addModule(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }

    this.node = new AudioWorkletNode(this.ctx, 'ocean-synth', { outputChannelCount: [2] })
    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0.8

    if (typeof this.ctx.createAnalyser === 'function') {
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.3
      this.node.connect(this.gain)
      this.gain.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } else {
      this.node.connect(this.gain)
      this.gain.connect(this.ctx.destination)
    }
  }

  updateParams(params: AudioParams): void {
    this.node?.port.postMessage(params)
  }

  getWaveformData(output?: Float32Array): Float32Array {
    const size = this.analyser?.fftSize ?? 1024
    const buf  = output && output.length === size ? output : new Float32Array(size)
    if (this.analyser && typeof this.analyser.getFloatTimeDomainData === 'function') {
      this.analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
    }
    return buf
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v))
  }

  stop(): void {
    this.ctx?.close()
    this.ctx     = null
    this.node    = null
    this.gain    = null
    this.analyser = null
  }
}
