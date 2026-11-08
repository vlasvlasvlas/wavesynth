import type { AnimalState, OceanState } from '../types'

const SURFACE_Y_RATIO = 0.30  // la línea de superficie está al 30% del alto
const BOTTOM_Y_RATIO  = 0.95  // el fondo está al 95%
const WATER_ZONE = BOTTOM_Y_RATIO - SURFACE_Y_RATIO
const MAX_DEPTH = 2000

export function latLonToCanvasX(lon: number, canvas: { width: number }): number {
  return ((lon + 180) / 360) * canvas.width
}

export function depthToCanvasY(depthM: number | null, canvas: { height: number }): number {
  const d = depthM ?? 0
  const norm = Math.max(0, Math.min(1, d / MAX_DEPTH))
  return canvas.height * (SURFACE_Y_RATIO + norm * WATER_ZONE)
}

interface TrailPoint { x: number; y: number }

export class OceanCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private trail: TrailPoint[] = []
  private readonly TRAIL_MAX = 60

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  render(animal: AnimalState, ocean: OceanState, t: number): void {
    const { canvas, ctx } = this
    const W = canvas.width
    const H = canvas.height

    // Background
    ctx.fillStyle = '#020b14'
    ctx.fillRect(0, 0, W, H)

    // Ocean waves (top zone)
    this.drawWaves(ocean, t, W, H)

    // Surface line
    ctx.strokeStyle = '#1a4a6b'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, H * SURFACE_Y_RATIO)
    ctx.lineTo(W, H * SURFACE_Y_RATIO)
    ctx.stroke()

    // Trail
    const ax = latLonToCanvasX(animal.lon ?? 0, canvas)
    const ay = depthToCanvasY(animal.depthM, canvas)
    this.trail.push({ x: ax, y: ay })
    if (this.trail.length > this.TRAIL_MAX) this.trail.shift()

    for (let i = 0; i < this.trail.length - 1; i++) {
      const alpha = (i / this.trail.length) * 0.4
      ctx.strokeStyle = `rgba(0,245,212,${alpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(this.trail[i].x, this.trail[i].y)
      ctx.lineTo(this.trail[i + 1].x, this.trail[i + 1].y)
      ctx.stroke()
    }

    // Animal dot
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur = 15
    ctx.fillStyle = '#00f5d4'
    ctx.beginPath()
    ctx.arc(ax, ay, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Depth guide line (vertical)
    ctx.strokeStyle = '#00f5d422'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(ax, H * SURFACE_Y_RATIO)
    ctx.lineTo(ax, ay)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawWaves(ocean: OceanState, t: number, W: number, H: number): void {
    const ctx = this.ctx
    const hs = ocean.waveHeightM ?? 1.0
    const tp = ocean.peakPeriodS ?? 10
    const ampPx = Math.min(H * SURFACE_Y_RATIO * 0.4, hs * 4)
    const baseY = H * SURFACE_Y_RATIO

    // Three overlapping wave components
    const components = [
      { freq: 2 * Math.PI / (W * 0.6),  speed: 0.0015 / tp, amp: ampPx * 0.6 },
      { freq: 2 * Math.PI / (W * 0.35), speed: 0.0025 / tp, amp: ampPx * 0.3 },
      { freq: 2 * Math.PI / (W * 0.2),  speed: 0.004 / tp,  amp: ampPx * 0.1 },
    ]

    const gradient = ctx.createLinearGradient(0, baseY - ampPx * 1.5, 0, baseY)
    gradient.addColorStop(0, 'rgba(0,100,160,0.0)')
    gradient.addColorStop(1, 'rgba(26,74,107,0.5)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(0, 0)

    for (let x = 0; x <= W; x += 2) {
      let y = baseY
      for (const c of components) {
        y += Math.sin(x * c.freq - t * c.speed) * c.amp
      }
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.lineTo(W, 0)
    ctx.closePath()
    ctx.fill()

    // Wave crest line
    ctx.strokeStyle = 'rgba(240,253,250,0.4)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= W; x += 2) {
      let y = baseY
      for (const c of components) {
        y += Math.sin(x * c.freq - t * c.speed) * c.amp
      }
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}
