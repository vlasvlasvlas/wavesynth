import type { AnimalState, OceanState } from '../types'

const SURFACE_Y_RATIO = 0.30
const BOTTOM_Y_RATIO  = 0.95
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

interface SprayParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

export class OceanCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sprayParticles: SprayParticle[] = []
  private waveformBuffer: Float32Array = new Float32Array(1024)

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

  setWaveformData(data: Float32Array): void {
    if (data.length === this.waveformBuffer.length) {
      this.waveformBuffer.set(data)
    } else {
      this.waveformBuffer = data.slice()
    }
  }

  render(animal: AnimalState, ocean: OceanState, t: number, waveformInput?: Float32Array): {
    surfZone: 'lip' | 'face' | 'barrel' | 'trough'
    slopeDeg: number
  } {
    if (waveformInput) {
      this.setWaveformData(waveformInput)
    }

    const { canvas, ctx } = this
    const W = canvas.width
    const H = canvas.height
    const surfaceY = H * SURFACE_Y_RATIO
    const bottomY  = H * BOTTOM_Y_RATIO

    // ── 1. Cielo marino / atmósfera nocturna ──────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, surfaceY)
    skyGrad.addColorStop(0, '#01060d')
    skyGrad.addColorStop(1, '#031424')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, W, surfaceY + 20)

    // Estrellas / datos de navegación sutiles en el cielo
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    for (let i = 0; i < 30; i++) {
      const sx = (Math.sin(i * 123.45) * 0.5 + 0.5) * W
      const sy = (Math.cos(i * 678.9) * 0.5 + 0.5) * (surfaceY - 40)
      ctx.fillRect(sx, sy, 1.2, 1.2)
    }

    // ── 2. Cálculo de la FORMA DE ONDA DE AUDIO en la superficie ───────────────
    const hs = ocean.waveHeightM ?? 1.8
    const tp = ocean.peakPeriodS ?? 12
    const wind = ocean.windSpeedMS ?? 12
    const baseAmpPx = Math.min(H * 0.16, Math.max(16, hs * 14))

    const wf = this.waveformBuffer
    const wfLen = wf.length

    // Función que evalúa la altura exacta del agua en cada punto x
    const waveYAt = (x: number): number => {
      // Mapear x a un índice en el buffer de audio en vivo
      const normX = Math.max(0, Math.min(1, x / W))
      const idx = Math.floor(normX * (wfLen - 1))
      const audioSample = wf[idx] ?? 0

      // Si el audio aún no arrancó o es plano, generamos una sinusoide modelada
      const synthSample = Math.sin(normX * Math.PI * 4 - t * (0.0018 / (tp * 0.1))) 
                        + Math.sin(normX * Math.PI * 8 + t * 0.001) * (wind / 35) * 0.35

      // Fusión: priorizamos la forma de onda real del oscilador audible
      const effectiveSample = Math.abs(audioSample) > 0.001 
        ? audioSample * 1.6 
        : synthSample * 0.7

      // Swell macroscópico suave que hace respirar la ola
      const macroSwell = Math.sin(normX * Math.PI * 2 - t * 0.0008) * (baseAmpPx * 0.25)

      return surfaceY - (effectiveSample * baseAmpPx) + macroSwell
    }

    // ── 3. Relleno del cuerpo de agua profundo (Water Column) ──────────────────
    ctx.beginPath()
    ctx.moveTo(0, H)
    ctx.lineTo(0, waveYAt(0))
    for (let x = 0; x <= W; x += 3) {
      ctx.lineTo(x, waveYAt(x))
    }
    ctx.lineTo(W, H)
    ctx.closePath()

    const waterGrad = ctx.createLinearGradient(0, surfaceY - baseAmpPx, 0, bottomY)
    waterGrad.addColorStop(0,    'rgba(0, 95, 135, 0.95)') // turquesa superficial
    waterGrad.addColorStop(0.18, 'rgba(0, 48, 82, 0.97)')
    waterGrad.addColorStop(0.5,  'rgba(1, 20, 40, 0.99)')
    waterGrad.addColorStop(1,    'rgba(0, 4, 10, 1.0)')   // negro abisal
    ctx.fillStyle = waterGrad
    ctx.fill()

    // Rayos cáusticos submarinos de luz
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.04)'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const rx = (W * 0.15 * i + Math.sin(t * 0.001 + i) * 60) % W
      ctx.beginPath()
      ctx.moveTo(rx, waveYAt(rx))
      ctx.lineTo(rx - 80, bottomY)
      ctx.stroke()
    }

    // ── 4. Línea de CRESTA DE LA ONDA (La Forma de Onda Acústica) ─────────────
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur = 12
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= W; x += 3) {
      const y = waveYAt(x)
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Línea secundaria de espuma blanca en los picos altos
    ctx.strokeStyle = 'rgba(240, 253, 250, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= W; x += 3) {
      const y = waveYAt(x)
      // Dibujar solo donde la ola rompe arriba de la superficie media
      if (y < surfaceY - baseAmpPx * 0.3) {
        ctx.lineTo(x, y)
      } else {
        ctx.moveTo(x, y)
      }
    }
    ctx.stroke()

    // ── 5. EL ANIMAL / SURFISTA EN LA SUPERFICIE DE LA ONDA ───────────────────
    // Posición horizontal del animal (puede venir de waveXNorm o de lon)
    let normX = animal.waveXNorm ?? (animal.lon !== null ? (animal.lon + 180) / 360 : 0.5)
    normX = Math.max(0.04, Math.min(0.96, normX))

    const ax = normX * W
    const ay = waveYAt(ax)

    // Tangente y pendiente de la ola en la posición del animal
    const deltaX = 6
    const yLeft  = waveYAt(ax - deltaX)
    const yRight = waveYAt(ax + deltaX)
    const dy = yRight - yLeft
    const angleRad = Math.atan2(dy, deltaX * 2)
    const slopeDeg = (angleRad * 180) / Math.PI

    // Detección de la zona de surf
    let surfZone: 'lip' | 'face' | 'barrel' | 'trough' = 'face'
    if (ay < surfaceY - baseAmpPx * 0.45) {
      surfZone = 'lip' // En la cresta más alta cortando el labio
    } else if (ay > surfaceY + baseAmpPx * 0.3) {
      surfZone = 'trough' // En el valle o seno de la ola
    } else if (Math.abs(slopeDeg) > 22) {
      surfZone = 'barrel' // En la pared curva y empinada
    }

    // Generar partículas de espuma marina/spray en la tabla del animal
    if (Math.random() < 0.6 || surfZone === 'lip') {
      this.sprayParticles.push({
        x: ax - Math.cos(angleRad) * 12,
        y: ay - Math.sin(angleRad) * 12,
        vx: -Math.cos(angleRad) * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        vy: -Math.sin(angleRad) * (2 + Math.random() * 3) - (1 + Math.random() * 3),
        life: 1.0,
        maxLife: 20 + Math.random() * 20,
        size: 1.5 + Math.random() * 2.5,
      })
    }

    // Renderizar y actualizar partículas de spray
    ctx.fillStyle = 'rgba(220, 250, 255, 0.75)'
    for (let i = this.sprayParticles.length - 1; i >= 0; i--) {
      const p = this.sprayParticles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.12 // gravedad
      p.life -= 1 / p.maxLife
      if (p.life <= 0) {
        this.sprayParticles.splice(i, 1)
        continue
      }
      ctx.globalAlpha = p.life * 0.8
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1.0

    // Dibujo del Animal / Surfista Criatura Marina
    ctx.save()
    ctx.translate(ax, ay)
    ctx.rotate(angleRad)

    // Estela de agua detrás de la tabla
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.4)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-35, 3)
    ctx.lineTo(0, 1)
    ctx.stroke()

    // 🏄‍♂️ TABLA DE SURF / QUILLA (Hydrofoil Vectorial)
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#ff9f1c' // Naranja surf boya
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    // Forma hidrodinámica de tabla (nose aplanado a la derecha, tail a la izquierda)
    ctx.moveTo(24, 0)
    ctx.quadraticCurveTo(0, -5, -22, -1)
    ctx.lineTo(-24, 3)
    ctx.quadraticCurveTo(0, 4, 24, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    // 🐬 CIENTÍFICO / CRIATURA SURFEADORA (Delfín / Criatura Marina estilizada)
    ctx.fillStyle = '#f0fdfa'
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth = 1.5

    // Cuerpo estilizado montado sobre la tabla
    ctx.beginPath()
    ctx.moveTo(-10, -3)
    ctx.quadraticCurveTo(-4, -20, 8, -12) // lomo y aleta
    ctx.lineTo(16, -4)                    // morro
    ctx.lineTo(6, -2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Ojo bio-luminiscente
    ctx.fillStyle = '#00f5d4'
    ctx.beginPath()
    ctx.arc(10, -7, 1.8, 0, Math.PI * 2)
    ctx.fill()

    // Aleta dorsal estilizada
    ctx.fillStyle = '#00f5d4'
    ctx.beginPath()
    ctx.moveTo(0, -16)
    ctx.lineTo(-6, -24)
    ctx.lineTo(-2, -15)
    ctx.closePath()
    ctx.fill()

    ctx.restore()

    // ── 6. Indicador de Zona de Surf y Resonancia ─────────────────────────────
    ctx.font = '10px "Courier New", monospace'
    ctx.fillStyle = 'rgba(0, 245, 212, 0.8)'
    const zoneLabels = {
      lip: '⚡ CRESTA (WAVEFOLDING / DISTORSIÓN ARMÓNICA)',
      barrel: '🌀 EN EL TUBO (RESONANCIA HUECA & Q)',
      face: '🌊 PARED DE LA OLA (SINEWAVE LIMPIA)',
      trough: '⚓ VALLE (SUB-BASS GRAVE PROFUNDO)',
    }
    ctx.fillText(`ZONA: ${zoneLabels[surfZone]}`, ax - 80, ay - 35)

    // Línea guía vertical sutil al cursor
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(ax, 0)
    ctx.lineTo(ax, H)
    ctx.stroke()
    ctx.setLineDash([])

    return { surfZone, slopeDeg }
  }
}
