import { fetchOceanState, buildOceanFallback } from './data/marineApi'
import { FAMOUS_SPOTS, getRandomOceanSpot } from './data/marineSpots'
import { mapToAudioParams } from './mapping/animalToAudio'
import { AudioEngine } from './audio/AudioEngine'
import { OceanCanvas } from './ui/OceanCanvas'
import type { FishRenderData } from './ui/OceanCanvas'
import { TelemetryHUD } from './ui/TelemetryHUD'
import { WhaleAutopilot } from './data/WhaleAutopilot'
import type { OceanState, AnimalState, AudioParams, MarineSpot } from './types'

// ─── Peces Luminosos ──────────────────────────────────────────────────────────
interface LumiFish {
  x: number; y: number
  vx: number; vy: number
  vxBias: number
  note: number; color: string; size: number
  phase: number; age: number; maxAge: number
  leaving: boolean
  gainNode: GainNode | null
  oscNode: OscillatorNode | null
  filterNode: BiquadFilterNode | null
}

interface FishTimbre {
  name: string
  oscType: OscillatorType
  filterType?: BiquadFilterType
  filterFreq?: number
  filterQ?: number
}

const FISH_TIMBRES: FishTimbre[] = [
  { name: 'Flauta',     oscType: 'sine' },
  { name: 'Clarinete',  oscType: 'square',   filterType: 'lowpass',  filterFreq: 800,  filterQ: 1   },
  { name: 'Violín',     oscType: 'sawtooth', filterType: 'lowpass',  filterFreq: 2000, filterQ: 1   },
  { name: 'Cello',      oscType: 'sawtooth', filterType: 'lowpass',  filterFreq: 500,  filterQ: 2   },
  { name: 'Oboe',       oscType: 'square',   filterType: 'bandpass', filterFreq: 1200, filterQ: 5   },
  { name: 'Theremin',   oscType: 'triangle', filterType: 'lowpass',  filterFreq: 2500, filterQ: 0.5 },
  { name: 'Campana',    oscType: 'sine',     filterType: 'highpass', filterFreq: 600,  filterQ: 0.7 },
  { name: 'Órgano',     oscType: 'square',   filterType: 'lowpass',  filterFreq: 1500, filterQ: 3   },
  { name: 'Glass',      oscType: 'triangle', filterType: 'bandpass', filterFreq: 900,  filterQ: 8   },
  { name: 'Pad',        oscType: 'sawtooth', filterType: 'lowpass',  filterFreq: 350,  filterQ: 0.5 },
]

let currentTimbreIdx = 0

function applyTimbre(idx: number): void {
  currentTimbreIdx = Math.max(0, idx)
  const timbre = FISH_TIMBRES[currentTimbreIdx]
  if (!timbre) return
  // Actualiza los peces ya vivos
  for (const f of lumiFish) {
    if (f.oscNode) f.oscNode.type = timbre.oscType
    if (f.filterNode && timbre.filterFreq) {
      f.filterNode.frequency.value = timbre.filterFreq
      f.filterNode.Q.value = timbre.filterQ ?? 1
    }
  }
}

const FISH_COLORS = [
  '#ff9de2', '#a0ffcc', '#ffe48a', '#b8d4ff', '#ffa8b0',
  '#d4b8ff', '#a0ffe0', '#ffcf9e', '#c8ff9e', '#9ec8ff',
]

const NOTE_FREQS: Record<string, number> = {
  'Do': 261.63, 'Re': 293.66, 'Mi': 329.63, 'Fa': 349.23,
  'Sol': 392.00, 'La': 440.00, 'Si': 493.88,
}
const SCALE_INTERVALS: Record<string, number[]> = {
  'Mayor':         [0, 2, 4, 5, 7, 9, 11, 12],
  'Menor':         [0, 2, 3, 5, 7, 8, 10, 12],
  'Pent. Mayor':   [0, 2, 4, 7, 9, 12],
  'Pent. Menor':   [0, 3, 5, 7, 10, 12],
  'Blues':         [0, 3, 5, 6, 7, 10, 12],
  'Dórica':        [0, 2, 3, 5, 7, 9, 10, 12],
  'Frigia':        [0, 1, 3, 5, 7, 8, 10, 12],
}

let currentTonic = 'Do'
let currentMode  = 'Mayor'

function getScale(): number[] {
  const root = NOTE_FREQS[currentTonic] ?? 261.63
  const ivs  = SCALE_INTERVALS[currentMode] ?? SCALE_INTERVALS['Mayor']
  return ivs.map(i => root * Math.pow(2, i / 12))
}

const lumiFish: LumiFish[] = []
let fishVolume = 0.5

// ─── Setup ───────────────────────────────────────────────────────────────────
const engine = new AudioEngine()
const whale  = new WhaleAutopilot()

const canvasEl    = document.getElementById('ocean') as HTMLCanvasElement
const hudEl       = document.getElementById('hud') as HTMLDivElement
const startBtn    = document.getElementById('start') as HTMLButtonElement
const startScreen = document.getElementById('start-screen') as HTMLDivElement
const hintEl      = document.getElementById('hint') as HTMLDivElement

const oceanCanvas = new OceanCanvas(canvasEl)
const hud         = new TelemetryHUD(hudEl)

const initialSpot = FAMOUS_SPOTS[1] // Pipeline, Hawái
let currentSpotName = initialSpot.name
let activeLat = initialSpot.lat
let activeLon = initialSpot.lon

let lastOcean: OceanState = {
  ...buildOceanFallback(activeLat, activeLon),
  spotName: currentSpotName,
  waveHeightM: 5.0,   // olas grandes por defecto (visual) — el audio arranca en 0 igual
  peakPeriodS: 12,
  windSpeedMS: 0,
  waterTempC: 20,
}

let fetchPending = false
const fx = { brilloMult: 1.0, vientoFmMult: 1.0 }

// Referencias de UI para actualizar controles desde código
let selectWaveFn: ((idx: number) => void) | null = null

// ─── Control del Barco ────────────────────────────────────────────────────────
let surfXNorm       = 0.45  // posición horizontal del barco (0=izq, 1=der)
let surfXVel        = 0.0   // velocidad horizontal (inercia)
let surfPitchMult   = 0.0   // arranca en 0 → silencio / mar quieto
let pitchMultSmooth = 0.0   // valor suavizado con portamento (ease in/out)
let surfLFOMult     = 1.0
let currentWaveType = 0
let pitchActive     = false  // tecla ↑↓ presionada ahora

let mouseActive = false
const keysHeld = new Set<string>()
const waveBuffer = new Float32Array(1024)

// ─── Auto-asignación de parámetros desde datos oceánicos reales ───────────────
function applyOceanParams(ocean: OceanState): void {
  const tp   = ocean.peakPeriodS   ?? 12
  const hs   = ocean.waveHeightM   ?? 1
  const wind = ocean.windSpeedMS   ?? 10
  const temp = ocean.waterTempC    ?? 20

  // Período → pitch: Tp largo = frecuencia grave, Tp corto = frecuencia aguda
  surfPitchMult = Math.max(0.3, Math.min(10.0, 15 / tp))

  // Altura de ola → tipo de onda
  if (hs < 1.0)       currentWaveType = 0  // sine: mar calmo
  else if (hs < 2.5)  currentWaveType = 3  // triangle: oleaje moderado
  else if (hs < 5.0)  currentWaveType = 2  // sawtooth: oleaje importante
  else                currentWaveType = 1  // square: mar bravo

  // Viento → FM intensity
  fx.vientoFmMult = Math.max(0.2, Math.min(3.0, 0.2 + wind / 10))

  // Temperatura del agua → brillo del filtro
  fx.brilloMult = Math.max(0.4, Math.min(2.0, 0.4 + temp / 20))

  // Actualizar botones de forma de onda en la UI
  selectWaveFn?.(currentWaveType)
}

// ─── Spot Loading ─────────────────────────────────────────────────────────────
async function loadSpot(spot: MarineSpot): Promise<void> {
  currentSpotName = spot.name
  activeLat = spot.lat
  activeLon  = spot.lon
  lastOcean  = { ...lastOcean, lat: activeLat, lon: activeLon, spotName: currentSpotName }
  fetchPending = true
  try {
    const fresh = await fetchOceanState(activeLat, activeLon)
    lastOcean = { ...fresh, spotName: currentSpotName }
    applyOceanParams(lastOcean)
  } finally {
    fetchPending = false
  }
}

// ─── Teclado ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    keysHeld.add(e.key)
  }
if (e.key === 'Escape') keysHeld.clear()
})
document.addEventListener('keyup', (e) => keysHeld.delete(e.key))


function tickArrows(): void {
  if (keysHeld.size === 0) { pitchActive = false; return }

  // ←→ mueve el barco con inercia — izq oscurece el filtro, der lo abre
  if (keysHeld.has('ArrowLeft'))  surfXVel -= 0.00008
  if (keysHeld.has('ArrowRight')) surfXVel += 0.00008
  surfXVel  *= 0.97  // fricción suave — más inercia, movimiento lentísimo
  surfXNorm  = Math.max(0.04, Math.min(0.96, surfXNorm + surfXVel))

  // ↑↓ controla el pitch — arranca desde 0 con un kick mínimo para no quedar pegado
  if (keysHeld.has('ArrowUp')) {
    const base = surfPitchMult < 0.05 ? 0.1 : surfPitchMult
    surfPitchMult = Math.min(10.0, base * 1.009)
    pitchActive = true
  }
  if (keysHeld.has('ArrowDown')) {
    const next = surfPitchMult / 1.009
    surfPitchMult = next < 0.05 ? 0 : next
    pitchActive = true
  }
  if (!keysHeld.has('ArrowUp') && !keysHeld.has('ArrowDown')) pitchActive = false
}

// Portamento: ease-in suave al subir frecuencia, ease-out largo al soltar (glide pronunciado)
function tickPortamento(): void {
  const rate = pitchActive ? 0.05 : 0.018
  pitchMultSmooth += (surfPitchMult - pitchMultSmooth) * rate
}

// ─── Control por Mouse / Touch en Ejes X e Y ──────────────────────────────────
function updateSurfPointer(clientX: number, clientY: number): void {
  const rect = canvasEl.getBoundingClientRect()
  surfXNorm = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width))
  const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  surfPitchMult = Math.pow(2, (1 - normY) * 6 - 2.5)
  pitchActive = true
}

canvasEl.addEventListener('click', (e) => {
  const H = window.innerHeight
  if (e.clientY > H * 0.35) spawnFish(e.clientX, e.clientY)
})

// Control táctil fluido para celular
let touchStartX = 0
let touchStartY = 0
let touchHasMoved = false

canvasEl.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0]
    touchStartX = t.clientX
    touchStartY = t.clientY
    touchHasMoved = false
    updateSurfPointer(t.clientX, t.clientY)
  }
}, { passive: true })

canvasEl.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0]
    if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) > 6) {
      touchHasMoved = true
    }
    updateSurfPointer(t.clientX, t.clientY)
  }
}, { passive: true })

canvasEl.addEventListener('touchend', () => {
  pitchActive = false
  if (!touchHasMoved) {
    const H = window.innerHeight
    if (touchStartY > H * 0.35) spawnFish(touchStartX, touchStartY)
  }
})

// ─── Peces Luminosos: Spawn y Tick ────────────────────────────────────────────
function spawnFish(canvasX?: number, canvasY?: number): void {
  if (lumiFish.length >= 10) return
  const actx = engine.getContext()
  if (!actx) return

  const W = window.innerWidth
  const H = window.innerHeight
  const surfaceY = H * 0.42

  let x: number, y: number, vx: number, vy: number

  if (canvasX !== undefined && canvasY !== undefined) {
    // Click de mouse: aparece exactamente donde se hizo click (en el agua)
    x = canvasX
    y = Math.max(canvasY, surfaceY + 30)
    vx = (Math.random() - 0.5) * 0.5
    vy = (Math.random() - 0.5) * 0.3
  } else {
    // Spacebar: entra nadando desde fuera de pantalla
    const side = Math.floor(Math.random() * 3) // 0=izq, 1=der, 2=abajo
    if (side === 0) {
      x = -70; y = surfaceY + 50 + Math.random() * H * 0.3
      vx = 0.3 + Math.random() * 0.3; vy = (Math.random() - 0.5) * 0.2
    } else if (side === 1) {
      x = W + 70; y = surfaceY + 50 + Math.random() * H * 0.3
      vx = -(0.3 + Math.random() * 0.3); vy = (Math.random() - 0.5) * 0.2
    } else {
      x = Math.random() * W; y = H + 70
      vx = (Math.random() - 0.5) * 0.3; vy = -(0.4 + Math.random() * 0.3)
    }
  }

  const scale = getScale()
  const usedFreqs = new Set(lumiFish.map(f => f.note))
  const unused = scale.filter(f => !usedFreqs.has(f))
  const pool = unused.length ? unused : scale
  const freq = pool[Math.floor(Math.random() * pool.length)]
  const color = FISH_COLORS[lumiFish.length % FISH_COLORS.length]

  const timbre = FISH_TIMBRES[currentTimbreIdx] ?? FISH_TIMBRES[0]
  const osc = actx.createOscillator()
  const gain = actx.createGain()
  osc.type = timbre.oscType
  osc.frequency.value = freq
  gain.gain.value = 0

  let filterNode: BiquadFilterNode | null = null
  if (timbre.filterType) {
    filterNode = actx.createBiquadFilter()
    filterNode.type = timbre.filterType
    filterNode.frequency.value = timbre.filterFreq ?? 1000
    filterNode.Q.value = timbre.filterQ ?? 1
    osc.connect(filterNode)
    filterNode.connect(gain)
  } else {
    osc.connect(gain)
  }
  gain.connect(actx.destination)
  osc.start()

  // dirección horizontal aleatoria por pez (algunos van izq, otros der)
  const vxBias = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2)

  lumiFish.push({
    x, y, vx, vy, vxBias,
    note: freq, color,
    size: 3 + Math.random() * Math.random() * 11,
    phase: Math.random() * Math.PI * 2,
    age: 0,
    maxAge: 10000 + Math.random() * 6000,
    leaving: false,
    gainNode: gain,
    oscNode: osc,
    filterNode,
  })
}

function tickFish(dt: number): void {
  const actx = engine.getContext()
  const W = window.innerWidth
  const H = window.innerHeight
  const surfaceY = H * 0.42

  for (let i = lumiFish.length - 1; i >= 0; i--) {
    const f = lumiFish[i]
    f.age += dt
    f.phase += 0.07 + Math.abs(f.vx + f.vy) * 0.015

    if (f.age > f.maxAge + 3500 || f.x < -180 || f.x > W + 180 || f.y > H + 100) {
      if (actx && f.gainNode) f.gainNode.gain.setTargetAtTime(0, actx.currentTime, 0.3)
      setTimeout(() => { try { f.oscNode?.stop(); f.filterNode?.disconnect() } catch { /* ya parado */ } }, 500)
      lumiFish.splice(i, 1)
      continue
    }

    if (!f.leaving && f.age > f.maxAge) f.leaving = true

    if (!f.leaving) {
      // Nada horizontalmente con sesgo propio + wandering suave
      f.vx += f.vxBias * 0.03 + (Math.random() - 0.5) * 0.06
      f.vy += (Math.random() - 0.5) * 0.025
      // Si el pez está demasiado cerca de la superficie, lo empuja suavemente hacia abajo
      const waveYFnMove = oceanCanvas.getWaveYAt()
      if (waveYFnMove) {
        const waveSurface = waveYFnMove(f.x)
        const tooClose = waveSurface + 20
        if (f.y < tooClose) f.vy += 0.04  // solo empuja hacia abajo si está muy arriba
      }
    } else {
      // Sale hacia el borde más cercano
      const toLeft  = f.x
      const toRight = W - f.x
      const goLeft  = toLeft < toRight
      f.vx += (goLeft ? -0.12 : 0.12) + (Math.random() - 0.5) * 0.05
      f.vy += 0.04
    }

    const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
    if (spd > 1.8) { f.vx *= 1.8 / spd; f.vy *= 1.8 / spd }
    f.vx *= 0.95
    f.vy *= 0.95
    f.x += f.vx
    f.y += f.vy
    if (f.y < surfaceY + 18) { f.y = surfaceY + 18; f.vy = Math.abs(f.vy) * 0.4 }

    // Constrainar pez por debajo de la superficie del agua real
    const waveYFn = oceanCanvas.getWaveYAt()
    if (waveYFn) {
      const minY = waveYFn(f.x) + 10
      if (f.y < minY) { f.y = minY; f.vy = Math.abs(f.vy) * 0.4 }
    }

    if (actx && f.gainNode) {
      const base = 0.12 * fishVolume
      const vol = f.leaving
        ? base * Math.max(0, 1 - (f.age - f.maxAge) / 3500)
        : base
      f.gainNode.gain.setTargetAtTime(vol, actx.currentTime, 0.15)
    }
  }
}

// ─── Panel de Control Inferior ────────────────────────────────────────────────
function buildControls(): void {
  const CSS_BTN = `
    background:transparent; color:#00f5d4;
    border:1px solid rgba(0,245,212,0.38); padding:6px 10px;
    font-family:'Courier New',monospace; font-size:11px; cursor:pointer;
    border-radius:2px; transition:background 0.15s, color 0.15s;
  `
  function hoverBtn(b: HTMLButtonElement) {
    b.addEventListener('mouseenter', () => { b.style.background='#00f5d4'; b.style.color='#020b14' })
    b.addEventListener('mouseleave', () => { b.style.background='transparent'; b.style.color='#00f5d4' })
  }

  // ─── HUD toggle (ⓘ) — top-left ───────────────────────────────────────────
  hudEl.style.display = 'none'
  const infoBtn = document.createElement('button')
  infoBtn.textContent = 'ⓘ'
  infoBtn.title = 'Telemetría'
  infoBtn.style.cssText = `
    position:absolute; top:14px; left:14px; z-index:20;
    background:rgba(2,11,20,0.82); color:#00f5d4;
    border:1px solid rgba(0,245,212,0.35); padding:5px 9px;
    font-family:'Courier New',monospace; font-size:13px; cursor:pointer;
    border-radius:2px; backdrop-filter:blur(6px);
  `
  infoBtn.addEventListener('click', () => {
    hudEl.style.display = hudEl.style.display === 'none' ? 'block' : 'none'
  })
  document.body.appendChild(infoBtn)

  // ─── Modal de ayuda (?) ───────────────────────────────────────────────────
  const helpBtn = document.createElement('button')
  helpBtn.textContent = '?'
  helpBtn.title = '¿Qué es esto?'
  helpBtn.style.cssText = `
    position:absolute; top:14px; left:52px; z-index:20;
    background:rgba(2,11,20,0.82); color:#00f5d4;
    border:1px solid rgba(0,245,212,0.35); padding:5px 9px;
    font-family:'Courier New',monospace; font-size:13px; cursor:pointer;
    border-radius:2px; backdrop-filter:blur(6px);
  `
  document.body.appendChild(helpBtn)

  const modal = document.createElement('div')
  modal.style.cssText = `
    display:none; position:fixed; inset:0; background:rgba(0,0,0,0.80);
    z-index:200; justify-content:center; align-items:center;
  `
  const modalBox = document.createElement('div')
  modalBox.style.cssText = `
    font-family:'Courier New',monospace; color:#00f5d4; font-size:12px;
    background:#020b14; border:1px solid rgba(0,245,212,0.42);
    padding:30px 36px; max-width:400px; line-height:2;
    box-shadow:0 20px 60px rgba(0,0,0,0.9);
  `
  modalBox.innerHTML = `
    <strong style="font-size:14px;letter-spacing:2px">WAVESYNTH</strong><br>
    <span style="opacity:0.4">──────────────────────────</span><br>
    La superficie del mar <em>es</em> la forma de onda.<br>
    El barco surfea la síntesis en tiempo real.<br><br>
    <span style="opacity:0.7">↑ ↓</span> &nbsp;&nbsp;frecuencia (pitch)<br>
    <span style="opacity:0.7">← →</span> &nbsp;&nbsp;velocidad del LFO (filtro)<br>
    <span style="opacity:0.7">drag</span> &nbsp;posición y tono con el mouse<br><br>
    <span style="opacity:0.9">🎲 MAR ALEATORIO</span><br>
    &nbsp;&nbsp;carga datos oceánicos reales y<br>
    &nbsp;&nbsp;asigna todos los parámetros.<br><br>
    <span style="opacity:0.35;font-size:10px">Open-Meteo Marine API · TypeScript · Web Audio API</span>
  `
  modal.appendChild(modalBox)
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none' })
  modalBox.addEventListener('click', (e) => e.stopPropagation())
  document.body.appendChild(modal)
  helpBtn.addEventListener('click', () => { modal.style.display = 'flex' })

  // ─── Panel inferior ───────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.className = 'synth-bottom-bar'

  // Selector de forma de onda con iconos SVG
  const waveSvgs = [
    `<svg width="26" height="14" viewBox="0 0 26 14" fill="none"><path d="M1,7 C5,0 9,0 13,7 C17,14 21,14 25,7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    `<svg width="26" height="14" viewBox="0 0 26 14" fill="none"><path d="M1,11 L1,3 L9,3 L9,11 L17,11 L17,3 L25,3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="26" height="14" viewBox="0 0 26 14" fill="none"><path d="M1,11 L13,3 L13,11 L25,3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="26" height="14" viewBox="0 0 26 14" fill="none"><path d="M1,7 L7,3 L19,11 L25,7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ]
  const waveTitles = ['Sine', 'Square', 'Sawtooth', 'Triangle']
  const btnEls: HTMLButtonElement[] = []
  function selectWave(idx: number): void {
    currentWaveType = idx
    btnEls.forEach((b, i) => {
      b.style.background = i === idx ? '#00f5d4' : 'transparent'
      b.style.color      = i === idx ? '#020b14' : '#00f5d4'
      b.style.borderColor = i === idx ? '#00f5d4' : 'rgba(0,245,212,0.38)'
    })
  }
  selectWaveFn = selectWave
  const waveRow = document.createElement('div')
  waveRow.className = 'synth-group'
  waveRow.style.cssText = 'display:flex;gap:4px;flex-shrink:0;'
  waveSvgs.forEach((svg, i) => {
    const b = document.createElement('button')
    b.innerHTML = svg
    b.title = waveTitles[i]
    b.style.cssText = `
      background:transparent; color:#00f5d4; border:1px solid rgba(0,245,212,0.38);
      padding:6px 8px; cursor:pointer; border-radius:2px; transition:all 0.15s;
      display:inline-flex; align-items:center; justify-content:center;
      min-width:38px; min-height:34px; touch-action:manipulation;
    `
    b.addEventListener('click', () => selectWave(i))
    btnEls.push(b)
    waveRow.appendChild(b)
  })
  selectWave(0)
  panel.appendChild(waveRow)

  // Separador
  const sep = () => {
    const s = document.createElement('div')
    s.className = 'synth-group'
    s.style.cssText = 'width:1px;height:24px;background:rgba(0,245,212,0.18);margin:0 2px;flex-shrink:0;'
    return s
  }
  panel.appendChild(sep())

  // Sliders
  function slider(label: string, min: number, max: number, val: number, step: number, onChange: (v: number) => void): { wrap: HTMLDivElement; inp: HTMLInputElement } {
    const wrap = document.createElement('div')
    wrap.className = 'synth-group'
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:9px;opacity:0.5;letter-spacing:0.5px;white-space:nowrap;'
    lbl.textContent = label
    const inp = document.createElement('input')
    inp.type = 'range'; inp.min = String(min); inp.max = String(max)
    inp.step = String(step); inp.value = String(val)
    inp.style.cssText = `-webkit-appearance:none;width:68px;height:4px;background:#1a4a6b;outline:none;cursor:pointer;accent-color:#00f5d4;touch-action:manipulation;`
    inp.addEventListener('input', () => onChange(parseFloat(inp.value)))
    wrap.appendChild(lbl); wrap.appendChild(inp)
    return { wrap, inp }
  }

  panel.appendChild(slider('VOL', 0, 1, 0.8, 0.01, (v) => engine.setVolume(v)).wrap)
  panel.appendChild(slider('PECES', 0, 1, 0.5, 0.01, (v) => { fishVolume = v }).wrap)

  panel.appendChild(sep())

  // Botón MAR ALEATORIO
  const randomBtn = document.createElement('button')
  randomBtn.className = 'synth-group'
  randomBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:middle;margin-right:5px"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M4,7 Q7,3 10,7 Q7,11 4,7" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>RANDOM`
  randomBtn.style.cssText = CSS_BTN + 'padding:6px 12px;border-color:#00f5d4;flex-shrink:0;min-height:34px;touch-action:manipulation;white-space:nowrap;'
  hoverBtn(randomBtn)
  randomBtn.addEventListener('click', () => loadSpot(getRandomOceanSpot()))
  panel.appendChild(randomBtn)

  panel.appendChild(sep())

  function mkDropdown(label: string, options: string[], initial: string, onChange: (v: string) => void): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.className = 'synth-group'
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:9px;opacity:0.5;letter-spacing:0.5px;white-space:nowrap;'
    lbl.textContent = label
    const sel = document.createElement('select')
    sel.style.cssText = `
      background:#020b14;color:#00f5d4;border:1px solid rgba(0,245,212,0.38);
      font-family:'Courier New',monospace;font-size:11px;padding:4px 6px;
      cursor:pointer;border-radius:2px;outline:none;min-height:32px;
      touch-action:manipulation;max-width:110px;
    `
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt; o.textContent = opt
      if (opt === initial) o.selected = true
      sel.appendChild(o)
    }
    sel.addEventListener('change', () => onChange(sel.value))
    wrap.appendChild(lbl); wrap.appendChild(sel)
    return wrap
  }

  panel.appendChild(mkDropdown('TÓNICA', Object.keys(NOTE_FREQS), currentTonic, v => { currentTonic = v }))
  panel.appendChild(mkDropdown('ESCALA', Object.keys(SCALE_INTERVALS), currentMode, v => { currentMode = v }))

  panel.appendChild(sep())

  panel.appendChild(mkDropdown('TIMBRE', FISH_TIMBRES.map(t => t.name), FISH_TIMBRES[0].name, v => {
    applyTimbre(FISH_TIMBRES.findIndex(t => t.name === v))
  }))

  document.body.appendChild(panel)
}

// ─── Aplicación de Moduladores y FX ───────────────────────────────────────────
let lastSurfZone: 'lip' | 'face' | 'barrel' | 'trough' = 'face'
let currentFreq  = 110
let lfoPhase     = 0
let currentLFORate = 0.08

function applyFX(params: AudioParams, dt: number): AudioParams {
  // LFO: velocidad escalada por surfLFOMult (←→), profundidad también escala
  currentLFORate = 0.08 * surfLFOMult
  lfoPhase += (currentLFORate * 2 * Math.PI * dt) / 1000
  if (lfoPhase > Math.PI * 2) lfoPhase -= Math.PI * 2

  // Frecuencia con portamento — tope 1kHz, mínimo 0 (silencio cuando pitch=0)
  const freq = Math.min(1000, Math.max(0, params.swellFreq * pitchMultSmooth))
  currentFreq = freq

  // Posición X del barco → filtro pasa-bajos: izq = oscuro/cerrado, der = brillante/abierto
  const xCutoff  = Math.pow(surfXNorm, 1.3) * 1.1          // 0.04→~0.03, 0.5→0.41, 0.96→~1.0
  const lfoVal   = Math.sin(lfoPhase)
  const lfoDepth = 0.07
  const cutoff   = Math.min(1, Math.max(0.04, xCutoff * fx.brilloMult + lfoVal * lfoDepth))

  return {
    ...params,
    swellFreq:        freq,
    panNorm:          0.5,
    // FM mínimo de 0.07 siempre activo → da irregularidad orgánica a la forma de onda visual
    fmIndex:          Math.min(2.5, Math.max(0.07, params.fmIndex * fx.vientoFmMult)),
    filterCutoffNorm: cutoff,
    waveType:         currentWaveType,
    whaleFreq:        whale.state.freq,
    whaleAmp:         whale.state.amp,
    whalePanNorm:     0.5,
    whaleDepthMix:    whale.state.depthMix,
    whaleFeedback:    whale.state.feedback,
    whaleDelayMs:     whale.state.delayMs,
  }
}

// ─── Main Animation Loop ──────────────────────────────────────────────────────
let prevT = 0

function loop(t: number): void {
  const dt = t - prevT
  prevT = t

  tickArrows()
  tickPortamento()
  tickFish(dt)

  whale.tick(dt)

  // Leer forma de onda acústica en tiempo real del AudioWorklet
  engine.getWaveformData(waveBuffer)

  const surfer: AnimalState = {
    animalId: 'boat-01',
    species: 'Barco Oceanográfico',
    provenance: 'live',
    timestamp: Date.now(),
    lat: activeLat,
    lon: activeLon,
    depthM: 0,
    speedMS: 6.0,
    headingDeg: 90,
    waveXNorm: surfXNorm,
    surfZone: lastSurfZone,
    waveSlopeDeg: 0,
  }

  // RENDERIZAR OLA REACTIVA A LA FRECUENCIA Y LFO + FÍSICA DEL BARCO
  const fishRender: FishRenderData[] = lumiFish.map(f => ({
    x: f.x, y: f.y, vx: f.vx, vy: f.vy,
    color: f.color, size: f.size, phase: f.phase, leaving: f.leaving,
  }))
  const result = oceanCanvas.render(
    surfer,
    lastOcean,
    t,
    waveBuffer,
    currentWaveType,
    currentFreq,
    lfoPhase,
    fishRender,
  )
  lastSurfZone = result.surfZone
  surfer.surfZone = lastSurfZone
  surfer.waveSlopeDeg = result.slopeDeg

  // Actualizar parámetros DSP
  const rawParams = mapToAudioParams(surfer, lastOcean)
  engine.updateParams(applyFX(rawParams, dt))

  hud.update(surfer, lastOcean, currentFreq, pitchMultSmooth, surfXNorm, lfoPhase, currentLFORate, currentWaveType)

  requestAnimationFrame(loop)
}

// ─── Arranque al Click ────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  await engine.start()
  startScreen.style.display = 'none'
  buildControls()
  // No carga spot al inicio — el mar arranca calmo y silencioso (sinusoide, pitch 0)
  // Solo MAR ALEATORIO o selección manual activan el sonido
  requestAnimationFrame(loop)
})
