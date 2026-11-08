export class SlewLimiter {
  current: number
  private rate: number

  constructor(initial: number, timeMs: number, sampleRate: number) {
    this.current = initial
    this.rate = 1 / (timeMs * sampleRate / 1000)
  }

  tick(target: number): number {
    const diff = target - this.current
    const step = Math.sign(diff) * Math.min(Math.abs(diff), this.rate)
    this.current += step
    return this.current
  }
}
