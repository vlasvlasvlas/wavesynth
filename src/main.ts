import { loadTrack } from './data/TrackLoader'
import { fetchOceanState, buildOceanFallback } from './data/marineApi'
import { FAMOUS_SPOTS, getRandomOceanSpot } from './data/marineSpots'
import { mapToAudioParams } from './mapping/animalToAudio'
import { AudioEngine } from './audio/AudioEngine'
import { OceanCanvas } from './ui/OceanCanvas'
import { TelemetryHUD } from './ui/TelemetryHUD'
import { MiniMap } from './ui/MiniMap'
import { TrackPlayer } from './TrackPlayer'
import { WhaleAutopilot } from './data/WhaleAutopilot'
import type { OceanState, AnimalState, AudioParams, MarineSpot } from './types'

const PLAYBACK_RATE = 120

// ─── Setup Inicial ────────────────────────────────────────────────────────────
const track  = loadTrack()
const player = new TrackPlayer(track, PLAYBACK_RATE)
const engine = new AudioEngine()
const whale  = new WhaleAutopilot()

const canvasEl    = document.getElementById('ocean') as HTMLCanvasElement
const hudEl       = document.getElementById('hud') as HTMLDivElement
const startBtn    = document.getElementById('start') as HTMLButtonElement
const startScreen = document.getElementById('start-screen') as HTMLDivElement
const hintEl      = document.getElementById('hint') as HTMLDivElement

const oceanCanvas = new OceanCanvas(canvasEl)
const hud         = new TelemetryHUD(hudEl)
const minimap     = new MiniMap()

const initialSpot = FAMOUS_SPOTS[1] // Pipeline, Hawái
let currentSpotName = initialSpot.name
let activeLat = initialSpot.lat
let activeLon = initialSpot.lon

let lastOcean: OceanState = {
  ...buildOceanFallback(activeLat, activeLon),
  spotName: currentSpotName,
  waveHeightM: 2.8,
  peakPeriodS: 14,
  windSpeedMS: 14.0,
  waterTempC: 24.5,
}

let fetchPending = false
const fx = { brilloMult: 1.0, vientoFmMult: 1.0 }

// ─── Control mode del Barco / Surfista ─────────────────────────────────────────
type ControlMode = 'auto' | 'manual'
let controlMode: ControlMode = 'auto'
let surfXNorm     = 0.45 // 0..1 horizontal en la ola
let surfPitchMult = 1.0  // multiplicador de frecuencia (controlado por eje Y)
let surfLFOMult   = 1.0  // multiplicador de LFO
let currentWaveType = 0  // 0: Sine, 1: Square, 2: Saw, 3: Triangle

let mouseActive = false
const keysHeld = new Set<string>()
const waveBuffer = new Float32Array(1024)

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
  } finally {
    fetchPending = false
  }
}

// ─── Control por Teclado ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    controlMode = 'manual'
    keysHeld.add(e.key)
  }
  if (e.key === 'Escape') {
    controlMode = 'auto'
    keysHeld.clear()
  }
})
document.addEventListener('keyup', (e) => keysHeld.delete(e.key))

function tickArrows(): void {
  if (controlMode !== 'manual' || keysHeld.size === 0) return
  // ←→ Mueve el barco horizontalmente sobre la ola
  if (keysHeld.has('ArrowLeft'))  surfXNorm = Math.max(0.04, surfXNorm - 0.015)
  if (keysHeld.has('ArrowRight')) surfXNorm = Math.min(0.96, surfXNorm + 0.015)
  // ↑↓ Sube y baja la frecuencia (pitch)
  if (keysHeld.has('ArrowUp'))    surfPitchMult = Math.min(25.0, surfPitchMult * 1.03)
  if (keysHeld.has('ArrowDown'))  surfPitchMult = Math.max(0.18, surfPitchMult / 1.03)
}

// ─── Control por Mouse / Touch en Ejes X e Y ──────────────────────────────────
function updateSurfPointer(clientX: number, clientY: number): void {
  const rect = canvasEl.getBoundingClientRect()
  // Eje X: Posición del barco sobre la ola
  surfXNorm = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width))

  // Eje Y: ARRIBA = Agudo (frecuencia alta, achica la ola) / ABAJO = Grave (agranda la ola)
  const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  // Curva continua logarítmica: de ~0.2x (grave) a ~16x (agudo)
  surfPitchMult = Math.pow(2, (1 - normY) * 6 - 2.5)

  controlMode = 'manual'
}

canvasEl.addEventListener('mousedown', (e)  => { mouseActive = true;  updateSurfPointer(e.clientX, e.clientY) })
canvasEl.addEventListener('mousemove', (e)  => { if (mouseActive) updateSurfPointer(e.clientX, e.clientY) })
canvasEl.addEventListener('mouseup',   ()   => { mouseActive = false })
canvasEl.addEventListener('mouseleave',()   => { mouseActive = false })

canvasEl.addEventListener('touchstart', (e) => {
  e.preventDefault()
  mouseActive = true
  updateSurfPointer(e.touches[0].clientX, e.touches[0].clientY)
}, { passive: false })
canvasEl.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (mouseActive) updateSurfPointer(e.touches[0].clientX, e.touches[0].clientY)
}, { passive: false })
canvasEl.addEventListener('touchend', () => { mouseActive = false })

// ─── Panel de Control Inferior ────────────────────────────────────────────────
function buildControls(): void {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
    display:flex; gap:14px; align-items:center; flex-wrap:wrap; justify-content:center;
    font-family:'Courier New',monospace; font-size:11px; color:#00f5d4;
    background:rgba(2,11,20,0.94); padding:11px 22px;
    border:1px solid rgba(0,245,212,0.32); border-radius:4px;
    box-shadow:0 10px 32px rgba(0,0,0,0.7); backdrop-filter:blur(8px);
    user-select:none; max-width:94vw; z-index:10;
  `

  // Selector de Forma de Onda
  const waveWrap = document.createElement('div')
  waveWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;'
  const waveLbl = document.createElement('span')
  waveLbl.textContent = 'FORMA DE ONDA'
  waveLbl.style.cssText = 'font-size:9px;opacity:0.6;'
  const waveBtns = document.createElement('div')
  waveBtns.style.cssText = 'display:flex;gap:4px;'
  const waveTypes = [
    { label: '∿ SINE', value: 0 },
    { label: '⊓ SQ',   value: 1 },
    { label: '/ SAW',  value: 2 },
    { label: '∧ TRI',  value: 3 },
  ]
  const btnEls: HTMLButtonElement[] = []
  function selectWave(idx: number): void {
    currentWaveType = idx
    btnEls.forEach((b, i) => {
      b.style.background = i === idx ? '#00f5d4' : '#071a2d'
      b.style.color      = i === idx ? '#020b14' : '#00f5d4'
    })
  }
  waveTypes.forEach(({ label, value }) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = `background:#071a2d;color:#00f5d4;border:1px solid rgba(0,245,212,0.4);
      padding:4px 7px;font-family:'Courier New',monospace;font-size:10px;cursor:pointer;`
    b.addEventListener('click', () => selectWave(value))
    btnEls.push(b)
    waveBtns.appendChild(b)
  })
  selectWave(0)
  waveWrap.appendChild(waveLbl)
  waveWrap.appendChild(waveBtns)
  panel.appendChild(waveWrap)

  // Selector de Spots Oceánicos
  const spotWrap = document.createElement('div')
  spotWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;'
  const spotLbl = document.createElement('span')
  spotLbl.textContent = 'SPOT OCEÁNICO'
  spotLbl.style.cssText = 'font-size:9px;opacity:0.6;'
  const spotSelect = document.createElement('select')
  spotSelect.style.cssText = `
    background:#071a2d; color:#00f5d4; border:1px solid rgba(0,245,212,0.35);
    padding:4px 7px; font-family:'Courier New',monospace; font-size:10px;
    outline:none; cursor:pointer;
  `
  FAMOUS_SPOTS.forEach(s => {
    const opt = document.createElement('option')
    opt.value = s.id
    opt.textContent = `${s.icon} ${s.name}`
    if (s.id === initialSpot.id) opt.selected = true
    spotSelect.appendChild(opt)
  })
  spotSelect.addEventListener('change', () => {
    const chosen = FAMOUS_SPOTS.find(s => s.id === spotSelect.value)
    if (chosen) loadSpot(chosen)
  })
  spotWrap.appendChild(spotLbl)
  spotWrap.appendChild(spotSelect)
  panel.appendChild(spotWrap)

  // Botón Mar Aleatorio
  const randomBtn = document.createElement('button')
  randomBtn.textContent = '🎲 MAR ALEATORIO'
  randomBtn.style.cssText = `
    background:#0a2942; color:#00f5d4; border:1px solid #00f5d4;
    padding:5px 10px; font-family:'Courier New',monospace; font-size:10px;
    cursor:pointer; transition:all 0.2s;
  `
  randomBtn.addEventListener('mouseenter', () => { randomBtn.style.background = '#00f5d4'; randomBtn.style.color = '#020b14' })
  randomBtn.addEventListener('mouseleave', () => { randomBtn.style.background = '#0a2942'; randomBtn.style.color = '#00f5d4' })
  randomBtn.addEventListener('click', () => loadSpot(getRandomOceanSpot()))
  panel.appendChild(randomBtn)

  // Sliders
  function slider(label: string, min: number, max: number, val: number, step: number, onChange: (v: number) => void) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:9px;opacity:0.6;'
    lbl.textContent = label
    const inp = document.createElement('input')
    inp.type = 'range'
    inp.min = String(min)
    inp.max = String(max)
    inp.step = String(step)
    inp.value = String(val)
    inp.style.cssText = `-webkit-appearance:none;width:75px;height:3px;background:#1a4a6b;outline:none;cursor:pointer;`
    inp.addEventListener('input', () => onChange(parseFloat(inp.value)))
    wrap.appendChild(lbl)
    wrap.appendChild(inp)
    return wrap
  }

  panel.appendChild(slider('VOL', 0, 1, 0.8, 0.01, (v) => engine.setVolume(v)))
  panel.appendChild(slider('BRILLO', 0.2, 2.0, 1.0, 0.05, (v) => { fx.brilloMult = v }))
  panel.appendChild(slider('VIENTO FM', 0.2, 3.0, 1.0, 0.05, (v) => { fx.vientoFmMult = v }))

  // Toggle de Autopilot / Surf Manual
  const modeBtn = document.createElement('button')
  modeBtn.textContent = '🏄 AUTO'
  modeBtn.style.cssText = `background:transparent;color:#ff9f1c;border:1px solid #ff9f1c;
    padding:5px 9px;font-family:'Courier New',monospace;font-size:10px;cursor:pointer;`
  modeBtn.addEventListener('click', () => {
    controlMode = controlMode === 'auto' ? 'manual' : 'auto'
    modeBtn.textContent = controlMode === 'auto' ? '🏄 AUTO' : '🎮 MANUAL'
    modeBtn.style.color = controlMode === 'auto' ? '#ff9f1c' : '#00f5d4'
    modeBtn.style.borderColor = controlMode === 'auto' ? '#ff9f1c' : '#00f5d4'
  })
  panel.appendChild(modeBtn)

  const hint = document.createElement('span')
  hint.textContent = '↑↓ drag/teclas freq · ←→ surf · ESC=auto'
  hint.style.cssText = 'opacity:0.35;font-size:9px;'
  panel.appendChild(hint)

  document.body.appendChild(panel)
}

// ─── Aplicación de Moduladores y FX ───────────────────────────────────────────
let lastSurfZone: 'lip' | 'face' | 'barrel' | 'trough' = 'face'
let currentFreq  = 110
let lfoPhase     = 0
let currentLFORate = 0.08

function applyFX(params: AudioParams, dt: number): AudioParams {
  // LFO modulador del filtro y respiración del oleaje
  currentLFORate = 0.08 * surfLFOMult
  lfoPhase += (currentLFORate * 2 * Math.PI * dt) / 1000
  if (lfoPhase > Math.PI * 2) lfoPhase -= Math.PI * 2

  // Frecuencia dinámica: swell fundamental escalado por el eje Y del usuario
  const freq = Math.min(8000, Math.max(25, params.swellFreq * surfPitchMult))
  currentFreq = freq

  const lfoVal = Math.sin(lfoPhase)
  const cutoff = Math.min(1, Math.max(0.04, params.filterCutoffNorm * fx.brilloMult + lfoVal * 0.15))

  return {
    ...params,
    swellFreq:        freq,
    panNorm:          0.5,
    fmIndex:          Math.min(2.5, params.fmIndex * fx.vientoFmMult),
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

  // En autopilot, el barco oscila suavemente a lo largo de la ola
  if (controlMode === 'auto') {
    surfXNorm = 0.5 + Math.sin(t * 0.0012) * 0.35 + Math.cos(t * 0.0006) * 0.08
  }

  // Tick de la voz subacuática
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
  const result = oceanCanvas.render(
    surfer,
    lastOcean,
    t,
    waveBuffer,
    currentWaveType,
    currentFreq,
    lfoPhase,
  )
  lastSurfZone = result.surfZone
  surfer.surfZone = lastSurfZone
  surfer.waveSlopeDeg = result.slopeDeg

  // Actualizar parámetros DSP
  const rawParams = mapToAudioParams(surfer, lastOcean)
  engine.updateParams(applyFX(rawParams, dt))

  // Actualizar HUD y Minimapa
  hud.update(
    surfer,
    lastOcean,
    currentFreq,
    surfPitchMult,
    surfXNorm,
    lfoPhase,
    currentLFORate,
    currentWaveType,
  )
  minimap.update(activeLat, activeLon)

  requestAnimationFrame(loop)
}

// ─── Arranque al Click ────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  await engine.start()
  startScreen.style.display = 'none'
  hintEl.style.display = 'block'
  setTimeout(() => { hintEl.style.display = 'none' }, 6000)
  buildControls()
  loadSpot(initialSpot)
  requestAnimationFrame(loop)
})
