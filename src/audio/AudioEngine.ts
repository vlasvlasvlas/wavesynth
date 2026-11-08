import type { AudioParams } from '../types'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null

  async start(): Promise<void> {
    this.ctx = new AudioContext({ sampleRate: 48000 })
    await this.ctx.audioWorklet.addModule(
      new URL('./worklet/OceanSynth.worklet.ts', import.meta.url).href,
    )
    this.node = new AudioWorkletNode(this.ctx, 'ocean-synth')
    this.node.connect(this.ctx.destination)
  }

  updateParams(params: AudioParams): void {
    this.node?.port.postMessage(params)
  }

  stop(): void {
    this.ctx?.close()
    this.ctx = null
    this.node = null
  }
}
