import type { AnimalState, OceanState } from '../types'

export interface FishRenderData {
  x: number; y: number
  vx: number; vy: number
  color: string; size: number
  phase: number; leaving: boolean
}

const SURFACE_Y_RATIO = 0.42
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

interface BoatPhysics {
  y: number
  angle: number
  prevT: number
  initialized: boolean
}

export class OceanCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private boatCanvas: HTMLCanvasElement
  private boatCtx: CanvasRenderingContext2D
  private sprayParticles: SprayParticle[] = []
  private waveformBuffer: Float32Array = new Float32Array(1024)
  private waveYAtFn: ((x: number) => number) | null = null

  getWaveYAt(): ((x: number) => number) | null { return this.waveYAtFn }

  private boatPhysics: BoatPhysics = {
    y: 0,
    angle: 0,
    prevT: 0,
    initialized: false,
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!

    // Canvas overlay exclusivo para el barco — se borra cada frame → sin efecto fantasma
    this.boatCanvas = document.createElement('canvas')
    this.boatCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;'
    document.body.appendChild(this.boatCanvas)
    this.boatCtx = this.boatCanvas.getContext('2d')!

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    this.canvas.width  = window.innerWidth
    this.canvas.height = window.innerHeight
    this.boatCanvas.width  = window.innerWidth
    this.boatCanvas.height = window.innerHeight
  }

  setWaveformData(data: Float32Array): void {
    if (data.length === this.waveformBuffer.length) {
      this.waveformBuffer.set(data)
    } else {
      this.waveformBuffer = data.slice()
    }
  }

  render(
    surfer: AnimalState,
    ocean: OceanState,
    t: number,
    waveformInput?: Float32Array,
    waveType = 0,
    currentFreq = 110,
    lfoPhase = 0,
    fish: FishRenderData[] = [],
  ): {
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
    skyGrad.addColorStop(0, '#01050a')
    skyGrad.addColorStop(1, '#031424')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, W, surfaceY + 20)

    // Estrellas sutiles en el fondo
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    for (let i = 0; i < 35; i++) {
      const sx = (Math.sin(i * 123.45) * 0.5 + 0.5) * W
      const sy = (Math.cos(i * 678.9) * 0.5 + 0.5) * (surfaceY - 35)
      ctx.fillRect(sx, sy, 1.2, 1.2)
    }

    // ── 2. FORMA DE ONDA REACTIVA A LA FRECUENCIA Y AL LFO ────────────────────
    const hs   = ocean.waveHeightM ?? 1.8
    const wind = ocean.windSpeedMS ?? 12
    const baseAmpPx = Math.min(H * 0.40, Math.max(45, hs * 42))

    // FÍSICA DE LA ONDA: Cantidad de ciclos visibles a lo largo de la pantalla
    // A frecuencia baja (ej. 40 Hz) = ~1.2 ciclos (ola gigante, ancha y espaciada)
    // A frecuencia media (ej. 220 Hz) = ~4.5 ciclos
    // A frecuencia alta (ej. 1200 Hz) = ~18 ciclos apretados (la onda se achica)
    const freq = Math.max(20, Math.min(8000, currentFreq))
    const visibleCycles = Math.min(28, Math.max(1.2, Math.pow(freq / 45, 0.72)))

    // Respiración del LFO oceánico (modula marea lenta y amplitud del mar)
    const lfoSwell = Math.sin(lfoPhase) * (baseAmpPx * 0.22)

    // Velocidad de propagación de la ola hacia la derecha
    const waveTravelPhase = (t * 0.0022 * Math.min(3, Math.max(0.5, freq / 120))) % (Math.PI * 2)

    const wf = this.waveformBuffer
    const wfLen = wf.length

    // Función matemática que calcula la altura Y de la superficie en cualquier píxel x
    // Se guarda la referencia para que código externo (peces) pueda constrainar su posición
    const waveYAt = (x: number): number => {
      const normX = Math.max(0, Math.min(1, x / W))
      
      // Fase angular espacial a lo largo de la pantalla
      const spatialPhase = (normX * visibleCycles * Math.PI * 2) - waveTravelPhase

      // Síntesis analítica según el tipo de onda elegido (SINE, SQUARE, SAW, TRIANGLE)
      const wt = Math.round(waveType) % 4
      const pMod = ((spatialPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const p01  = pMod / (Math.PI * 2)

      let shapeVal = 0
      if (wt === 0) {
        // ∿ SINE
        shapeVal = Math.sin(spatialPhase)
      } else if (wt === 1) {
        // ⊓ SQUARE (con bordes suaves para no generar artefactos visuales extremos)
        shapeVal = Math.tanh(Math.sin(spatialPhase) * 6)
      } else if (wt === 2) {
        // / SAWTOOTH
        shapeVal = 1 - 2 * p01
      } else {
        // ∧ TRIANGLE
        shapeVal = p01 < 0.5 ? 4 * p01 - 1 : 3 - 4 * p01
      }

      // Modulación de viento FM (arruga la forma de onda según los nudos de viento)
      const windTexture = Math.sin(spatialPhase * 3.5 + t * 0.003) * (wind / 40) * 0.25

      // Lectura del buffer de audio acústico en vivo
      const audioIdx = Math.floor(p01 * (wfLen - 1))
      const audioSample = wf[audioIdx] ?? 0
      
      // Combinamos la forma analítica con el buffer del oscilador audible en tiempo real
      const effectiveSample = (shapeVal * 0.75 + audioSample * 0.35 + windTexture)

      // Macro-swell del LFO que eleva y desciende suavemente la marea marina
      const macroSwell = Math.sin(normX * Math.PI * 1.5 - t * 0.0006) * (baseAmpPx * 0.18) + lfoSwell

      return surfaceY - (effectiveSample * baseAmpPx) + macroSwell
    }

    this.waveYAtFn = waveYAt

    // ── 3. Cuerpo de agua con gradiente abisal ─────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(0, H)
    ctx.lineTo(0, waveYAt(0))
    for (let x = 0; x <= W; x += 3) {
      ctx.lineTo(x, waveYAt(x))
    }
    ctx.lineTo(W, H)
    ctx.closePath()

    const waterGrad = ctx.createLinearGradient(0, surfaceY - baseAmpPx, 0, bottomY)
    waterGrad.addColorStop(0,    'rgba(0, 95, 135, 0.72)')
    waterGrad.addColorStop(0.18, 'rgba(0, 48, 82, 0.88)')
    waterGrad.addColorStop(0.5,  'rgba(1, 20, 40, 0.98)')
    waterGrad.addColorStop(1,    'rgba(0, 4, 10, 1.0)')
    ctx.fillStyle = waterGrad
    ctx.fill()

    // Rayos cáusticos de luz en la columna de agua
    ctx.lineWidth = 1.8
    for (let i = 0; i < 7; i++) {
      const rx = (W * 0.15 * i + Math.sin(t * 0.001 + i) * 60) % W
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.035)'
      ctx.beginPath()
      ctx.moveTo(rx, waveYAt(rx))
      ctx.lineTo(rx - 80, bottomY)
      ctx.stroke()
    }

    // Fondo del lecho marino
    ctx.fillStyle = '#000408'
    ctx.fillRect(0, bottomY, W, H - bottomY)

    // ── 4. Línea de Cresta de la Onda (Brillo y Espuma) ───────────────────────
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur  = 16
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth   = 2.8
    ctx.beginPath()
    for (let x = 0; x <= W; x += 2) {
      const y = waveYAt(x)
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Espuma blanca en los picos altos donde quiebra la onda
    ctx.strokeStyle = 'rgba(240, 253, 250, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= W; x += 3) {
      const y = waveYAt(x)
      if (y < surfaceY - baseAmpPx * 0.28) {
        ctx.lineTo(x, y)
      } else {
        ctx.moveTo(x, y)
      }
    }
    ctx.stroke()

    // ── 5. FÍSICA DEL BARCO FLOTANTE NÁUTICO ──────────────────────────────────
    let normX = surfer.waveXNorm ?? 0.5
    normX = Math.max(0.04, Math.min(0.96, normX))
    const ax = normX * W

    // Eslora (longitud) del barco para calcular flotación en dos puntos
    const boatLength = 44
    const halfLen = boatLength / 2

    // 5 puntos de flotación distribuidos a lo largo del casco para mejor lectura de la ola
    const probes = [-halfLen, -halfLen * 0.5, 0, halfLen * 0.5, halfLen]
    let sumProbeY = 0
    for (const dx of probes) sumProbeY += waveYAt(ax + dx)
    const targetY     = sumProbeY / probes.length
    const ySternPt    = waveYAt(ax - halfLen * 0.85)
    const yBowPt      = waveYAt(ax + halfLen * 0.85)
    const targetAngle = Math.atan2(yBowPt - ySternPt, boatLength * 1.7)

    const bp = this.boatPhysics

    // Inicialización del primer frame
    if (!bp.initialized) {
      bp.y = targetY; bp.angle = targetAngle
      bp.initialized = true; bp.prevT = t
    }

    const dtMs = Math.min(50, t - bp.prevT)
    bp.prevT = t

    // Seguimiento directo con lerp — sin rebote, el barco se pega a la ola
    const follow = 1 - Math.pow(0.04, dtMs / 16)  // frame-rate independiente
    bp.y     += (targetY     - bp.y)     * follow
    bp.angle += (targetAngle - bp.angle) * follow * 0.85


    const ay = this.boatPhysics.y
    const angleRad = this.boatPhysics.angle
    const slopeDeg = (angleRad * 180) / Math.PI

    // Detección de la zona de surf
    let surfZone: 'lip' | 'face' | 'barrel' | 'trough' = 'face'
    if (ay < surfaceY - baseAmpPx * 0.42) {
      surfZone = 'lip'
    } else if (ay > surfaceY + baseAmpPx * 0.28) {
      surfZone = 'trough'
    } else if (Math.abs(slopeDeg) > 18) {
      surfZone = 'barrel'
    }

    // Partículas de espuma marina en el casco del barco
    if (Math.random() < (surfZone === 'lip' ? 0.9 : 0.45)) {
      this.sprayParticles.push({
        x: ax - Math.cos(angleRad) * halfLen,
        y: ay - Math.sin(angleRad) * halfLen,
        vx: -Math.cos(angleRad) * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        vy: -Math.sin(angleRad) * (1 + Math.random() * 2) - (1.5 + Math.random() * 2.5),
        life: 1.0,
        maxLife: 22 + Math.random() * 18,
        size: 1.5 + Math.random() * 2.5,
      })
    }

    // ── 6 & 7. BARCO + SPRAY + GUÍA → canvas overlay (se borra cada frame → sin fantasma) ──
    const bc = this.boatCtx
    bc.clearRect(0, 0, W, H)

    // ── Peces luminosos (siempre debajo de la superficie del agua) ───────────
    for (const f of fish) {
      const minY = waveYAt(f.x) + 10
      const drawY = Math.max(f.y, minY)
      const angle = Math.atan2(f.vy, f.vx)
      const wiggle = Math.sin(f.phase) * f.size * 0.15
      const alpha = f.leaving ? 0.4 : 0.85

      bc.save()
      bc.translate(f.x, drawY)
      bc.rotate(angle)

      bc.shadowColor = f.color
      bc.shadowBlur = 14
      bc.globalAlpha = alpha
      bc.fillStyle = f.color
      // Cuerpo
      bc.beginPath()
      bc.ellipse(0, wiggle, f.size, f.size * 0.4, 0, 0, Math.PI * 2)
      bc.fill()
      // Cola
      bc.globalAlpha = alpha * 0.7
      bc.beginPath()
      bc.moveTo(-f.size * 0.85, wiggle)
      bc.lineTo(-f.size * 1.7, -f.size * 0.45)
      bc.lineTo(-f.size * 1.7, f.size * 0.45)
      bc.closePath()
      bc.fill()
      // Ojo
      bc.shadowBlur = 0
      bc.globalAlpha = f.leaving ? 0.4 : 1.0
      bc.fillStyle = '#ffffff'
      bc.beginPath()
      bc.arc(f.size * 0.5, wiggle - f.size * 0.1, f.size * 0.13, 0, Math.PI * 2)
      bc.fill()

      bc.restore()
    }
    bc.globalAlpha = 1.0
    bc.shadowBlur = 0
    bc.shadowColor = 'transparent'

    // Spray de espuma — redibujado íntegro cada frame sobre el overlay
    bc.fillStyle = 'rgba(220, 250, 255, 0.75)'
    for (let i = this.sprayParticles.length - 1; i >= 0; i--) {
      const p = this.sprayParticles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.12
      p.life -= 1 / p.maxLife
      if (p.life <= 0) { this.sprayParticles.splice(i, 1); continue }
      bc.globalAlpha = p.life * 0.8
      bc.beginPath()
      bc.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      bc.fill()
    }
    bc.globalAlpha = 1.0

    bc.save()
    bc.translate(ax, ay)
    bc.rotate(angleRad)

    // Estela de agua detrás de la popa
    bc.strokeStyle = 'rgba(0, 245, 212, 0.45)'
    bc.lineWidth = 3
    bc.beginPath()
    bc.moveTo(-halfLen - 15, 3)
    bc.lineTo(-halfLen + 2, 2)
    bc.stroke()

    // Casco
    bc.fillStyle   = '#0a2135'
    bc.strokeStyle = '#00f5d4'
    bc.lineWidth   = 1.8
    bc.beginPath()
    bc.moveTo(halfLen, -1)
    bc.lineTo(halfLen - 6, 8)
    bc.lineTo(-halfLen + 5, 8)
    bc.lineTo(-halfLen, 0)
    bc.quadraticCurveTo(0, -3, halfLen, -1)
    bc.closePath()
    bc.fill()
    bc.stroke()

    // Franja ámbar
    bc.fillStyle = '#ff9f1c'
    bc.beginPath()
    bc.moveTo(halfLen - 4, 3)
    bc.lineTo(-halfLen + 2, 3)
    bc.lineTo(-halfLen + 3, 5)
    bc.lineTo(halfLen - 5, 5)
    bc.closePath()
    bc.fill()

    // Mástil
    bc.strokeStyle = '#ffffff'
    bc.lineWidth = 2
    bc.beginPath()
    bc.moveTo(2, -2)
    bc.lineTo(2, -32)
    bc.stroke()

    // Vela
    const sailFlutter = Math.sin(t * 0.008 + wind * 0.2) * 2.5
    bc.fillStyle = 'rgba(240, 253, 250, 0.78)'
    bc.strokeStyle = '#00f5d4'
    bc.lineWidth = 1.2
    bc.beginPath()
    bc.moveTo(2, -30)
    bc.quadraticCurveTo(14 + sailFlutter, -16, 20, -6)
    bc.lineTo(2, -6)
    bc.closePath()
    bc.fill()
    bc.stroke()

    // Luz de proa
    bc.fillStyle = '#00f5d4'
    bc.beginPath()
    bc.arc(halfLen - 2, 0, 2.5, 0, Math.PI * 2)
    bc.fill()

    bc.restore()

    // Línea guía vertical
    bc.strokeStyle = 'rgba(0, 245, 212, 0.12)'
    bc.lineWidth = 1
    bc.setLineDash([2, 5])
    bc.beginPath()
    bc.moveTo(ax, 0)
    bc.lineTo(ax, H)
    bc.stroke()
    bc.setLineDash([])

    return { surfZone, slopeDeg }
  }
}
