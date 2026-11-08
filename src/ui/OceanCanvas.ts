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

interface BoatPhysics {
  y: number
  vy: number
  angle: number
  vAngle: number
  prevT: number
  initialized: boolean
}

export class OceanCanvas {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sprayParticles: SprayParticle[] = []
  private waveformBuffer: Float32Array = new Float32Array(1024)

  private boatPhysics: BoatPhysics = {
    y: 0,
    vy: 0,
    angle: 0,
    vAngle: 0,
    prevT: 0,
    initialized: false,
  }

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

  render(
    surfer: AnimalState,
    ocean: OceanState,
    t: number,
    waveformInput?: Float32Array,
    waveType = 0,
    currentFreq = 110,
    lfoPhase = 0,
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
    const baseAmpPx = Math.min(H * 0.38, Math.max(45, hs * 42))

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
    waterGrad.addColorStop(0,    'rgba(0, 95, 135, 0.95)')
    waterGrad.addColorStop(0.18, 'rgba(0, 48, 82, 0.97)')
    waterGrad.addColorStop(0.5,  'rgba(1, 20, 40, 0.99)')
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

    // Puntos de flotación: proa (adelante) y popa (atrás)
    const yStern = waveYAt(ax - halfLen) // popa
    const yBow   = waveYAt(ax + halfLen) // proa
    const targetY     = (yStern + yBow) / 2
    const targetAngle = Math.atan2(yBow - yStern, boatLength)

    // Inicialización de la física del barco en el primer frame
    if (!this.boatPhysics.initialized) {
      this.boatPhysics.y = targetY
      this.boatPhysics.angle = targetAngle
      this.boatPhysics.initialized = true
      this.boatPhysics.prevT = t
    }

    const dtMs = Math.min(50, t - this.boatPhysics.prevT)
    this.boatPhysics.prevT = t

    // Sistema de resorte amortiguado de flotabilidad náutica
    const wt = Math.round(waveType) % 4
    const springK = [0.12, 0.32, 0.18, 0.14][wt]
    const damping = [0.88, 0.74, 0.80, 0.86][wt]

    const subSteps = Math.max(1, Math.round(dtMs / 8))
    for (let s = 0; s < subSteps; s++) {
      // Fuerza vertical de flotabilidad (empuje de Arquímedes dinámico)
      const forceY = springK * (targetY - this.boatPhysics.y)
      this.boatPhysics.vy = this.boatPhysics.vy * damping + forceY
      this.boatPhysics.y += this.boatPhysics.vy

      // Fuerza de cabeceo angular (pitch del barco sobre la ola)
      const diffAngle = targetAngle - this.boatPhysics.angle
      const forceAngle = springK * 1.1 * diffAngle
      this.boatPhysics.vAngle = this.boatPhysics.vAngle * damping + forceAngle
      this.boatPhysics.angle += this.boatPhysics.vAngle
    }

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

    // Render de spray y estela de agua
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

    // ── 6. RENDERIZADO DEL BARCO NÁUTICO INTERACTIVO ──────────────────────────
    ctx.save()
    ctx.translate(ax, ay)
    ctx.rotate(angleRad)

    // Estela de agua detrás de la popa
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.45)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-halfLen - 15, 3)
    ctx.lineTo(-halfLen + 2, 2)
    ctx.stroke()

    // CASCO DEL BARCO (Línea náutica estilizada)
    ctx.shadowColor = '#00f5d4'
    ctx.shadowBlur  = 12
    ctx.fillStyle   = '#0a2135' // Azul marino profundo
    ctx.strokeStyle = '#00f5d4' // Borde turquesa luminiscente
    ctx.lineWidth   = 1.8
    ctx.beginPath()
    ctx.moveTo(halfLen, -1)                      // Proa (puntiaguda arriba)
    ctx.lineTo(halfLen - 6, 8)                   // Descenso de proa
    ctx.lineTo(-halfLen + 5, 8)                  // Fondo del casco
    ctx.lineTo(-halfLen, 0)                      // Espejo de popa
    ctx.quadraticCurveTo(0, -3, halfLen, -1)     // Cubierta
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    // Franja decorativa ámbar de flotación
    ctx.fillStyle = '#ff9f1c'
    ctx.beginPath()
    ctx.moveTo(halfLen - 4, 3)
    ctx.lineTo(-halfLen + 2, 3)
    ctx.lineTo(-halfLen + 3, 5)
    ctx.lineTo(halfLen - 5, 5)
    ctx.closePath()
    ctx.fill()

    // MÁSTIL DEL BARCO
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(2, -2)
    ctx.lineTo(2, -32) // Mástil de 30px de alto
    ctx.stroke()

    // VELA TRIANGULAR LUMINISCENTE (Ondea suavemente con el viento)
    const sailFlutter = Math.sin(t * 0.008 + wind * 0.2) * 2.5
    ctx.fillStyle = 'rgba(240, 253, 250, 0.78)'
    ctx.strokeStyle = '#00f5d4'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(2, -30)                                    // Tope del mástil
    ctx.quadraticCurveTo(14 + sailFlutter, -16, 20, -6)  // Escota de la vela
    ctx.lineTo(2, -6)                                     // Base de la botavara
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Luz de navegación en la proa (luz verde/turquesa)
    ctx.fillStyle = '#00f5d4'
    ctx.beginPath()
    ctx.arc(halfLen - 2, 0, 2.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    // ── 7. Indicador Visual de Zona e Interacción ─────────────────────────────
    const zoneLabels = {
      lip:    '⚡ CRESTA · wavefolding & armónicos agudos',
      barrel: '🌀 TUBO · resonancia hueca cavernosa',
      face:   '🌊 PARED · forma de onda pura',
      trough: '⚓ VALLE · sub-graves profundos',
    }
    ctx.font = '10px "Courier New", monospace'
    ctx.fillStyle = 'rgba(0, 245, 212, 0.85)'
    ctx.fillText(zoneLabels[surfZone], ax - 85, ay - 42)

    // Línea guía vertical interactiva
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.moveTo(ax, 0)
    ctx.lineTo(ax, H)
    ctx.stroke()
    ctx.setLineDash([])

    return { surfZone, slopeDeg }
  }
}
