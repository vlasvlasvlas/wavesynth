import { loadTrack } from './data/TrackLoader'
import { fetchOceanState, buildOceanFallback } from './data/marineApi'
import { FAMOUS_SPOTS, getRandomOceanSpot } from './data/marineSpots'
import { mapToAudioParams } from './mapping/animalToAudio'
import { AudioEngine } from './audio/AudioEngine'
import { OceanCanvas } from './ui/OceanCanvas'
import { TelemetryHUD } from './ui/TelemetryHUD'
import { MiniMap } from './ui/MiniMap'
import { TrackPlayer } from './TrackPlayer'
import type { OceanState, AnimalState, AudioParams, MarineSpot } from './types'

const PLAYBACK_RATE = 120
const OCEAN_FETCH_THRESHOLD_DEG = 0.05

// ─── Setup Inicial ────────────────────────────────────────────────────────────
const track = loadTrack()
const player = new TrackPlayer(track, PLAYBACK_RATE)
const engine = new AudioEngine()

const canvasEl    = document.getElementById('ocean') as HTMLCanvasElement
const hudEl       = document.getElementById('hud') as HTMLDivElement
const startBtn    = document.getElementById('start') as HTMLButtonElement
const startScreen = document.getElementById('start-screen') as HTMLDivElement
const hintEl      = document.getElementById('hint') as HTMLDivElement

const oceanCanvas = new OceanCanvas(canvasEl)
const hud = new TelemetryHUD(hudEl)
const minimap = new MiniMap()

// Estado inicial: Pipeline, Hawái (uno de los spots legendarios)
const initialSpot = FAMOUS_SPOTS[1] // Banzai Pipeline
let currentSpotName = initialSpot.name
let activeLat = initialSpot.lat
let activeLon = initialSpot.lon

let lastOcean: OceanState = {
  ...buildOceanFallback(activeLat, activeLon),
  spotName: currentSpotName,
  waveHeightM: 3.2,
  peakPeriodS: 14,
  windSpeedMS: 16.5,
  waterTempC: 24.5,
}

let lastFetchLat = activeLat
let lastFetchLon = activeLon
let fetchPending = false

// ─── FX state ─────────────────────────────────────────────────────────────────
const fx = { brilloMult: 1.0, vientoFmMult: 1.0 }

// ─── Control mode del Surfista ─────────────────────────────────────────────────
type ControlMode = 'auto' | 'manual'
let controlMode: ControlMode = 'auto'
let surfXNorm = 0.45 // Posición horizontal sobre la onda (0..1)
let mouseActive = false
const keysHeld = new Set<string>()

// Buffer reutilizable para leer la forma de onda acústica en tiempo real
const waveBuffer = new Float32Array(1024)

// ─── Función para cargar un nuevo Spot Oceánico ────────────────────────────────
async function loadSpot(spot: MarineSpot): Promise<void> {
  currentSpotName = spot.name
  activeLat = spot.lat
  activeLon = spot.lon
  lastFetchLat = activeLat
  lastFetchLon = activeLon

  // Feedback inmediato
  lastOcean = {
    ...lastOcean,
    lat: activeLat,
    lon: activeLon,
    spotName: currentSpotName,
  }

  fetchPending = true
  try {
    const fresh = await fetchOceanState(activeLat, activeLon)
    lastOcean = {
      ...fresh,
      spotName: currentSpotName,
    }
  } finally {
    fetchPending = false
  }
}

// ─── Click en el MiniMap para elegir cualquier punto en el mar ────────────────
minimap.onSelectCoordinates = (lat, lon) => {
  loadSpot({
    id: `custom-${Date.now()}`,
    name: `Punto Océano (${lat > 0 ? lat + '°N' : Math.abs(lat) + '°S'}, ${lon > 0 ? lon + '°E' : Math.abs(lon) + '°W'})`,
    region: 'Navegación Libre',
    lat,
    lon,
    description: 'Coordenadas seleccionadas interactivamente en el minimapa.',
    icon: '📍',
  })
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
  if (keysHeld.has('ArrowLeft'))  surfXNorm = Math.max(0.05, surfXNorm - 0.012)
  if (keysHeld.has('ArrowRight')) surfXNorm = Math.min(0.95, surfXNorm + 0.012)
}

// ─── Control por Mouse / Touch sobre la Onda ──────────────────────────────────
function updateSurfPointer(clientX: number): void {
  const rect = canvasEl.getBoundingClientRect()
  surfXNorm = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width))
  controlMode = 'manual'
}

canvasEl.addEventListener('mousedown', (e) => {
  mouseActive = true
  updateSurfPointer(e.clientX)
})
canvasEl.addEventListener('mousemove', (e) => {
  if (!mouseActive) return
  updateSurfPointer(e.clientX)
})
canvasEl.addEventListener('mouseup', () => { mouseActive = false })
canvasEl.addEventListener('mouseleave', () => { mouseActive = false })

canvasEl.addEventListener('touchstart', (e) => {
  e.preventDefault()
  mouseActive = true
  updateSurfPointer(e.touches[0].clientX)
}, { passive: false })
canvasEl.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (!mouseActive) return
  updateSurfPointer(e.touches[0].clientX)
}, { passive: false })
canvasEl.addEventListener('touchend', () => { mouseActive = false })

// ─── Panel de Control Inferior ────────────────────────────────────────────────
function buildControls(): void {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position:absolute; bottom:18px; left:50%; transform:translateX(-50%);
    display:flex; gap:16px; align-items:center; flex-wrap:wrap; justify-content:center;
    font-family:'Courier New',monospace; font-size:11px; color:#00f5d4;
    background:rgba(2,11,20,0.92); padding:12px 24px;
    border:1px solid rgba(0,245,212,0.3); border-radius:4px;
    box-shadow:0 12px 36px rgba(0,0,0,0.7); backdrop-filter:blur(8px);
    user-select:none; max-width:92vw;
  `

  // Selector de Spots Famosos
  const spotWrap = document.createElement('div')
  spotWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start;'
  const spotLbl = document.createElement('span')
  spotLbl.textContent = 'SPOT OCEÁNICO'
  spotLbl.style.cssText = 'font-size:9px;opacity:0.7;'
  const spotSelect = document.createElement('select')
  spotSelect.style.cssText = `
    background:#071a2d; color:#00f5d4; border:1px solid rgba(0,245,212,0.35);
    padding:4px 8px; font-family:'Courier New',monospace; font-size:11px;
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

  // Botón Punto Aleatorio en el Océano
  const randomBtn = document.createElement('button')
  randomBtn.textContent = '🎲 MAR ALEATORIO'
  randomBtn.style.cssText = `
    background:#0a2942; color:#00f5d4; border:1px solid #00f5d4;
    padding:6px 12px; font-family:'Courier New',monospace; font-size:10px;
    font-weight:bold; cursor:pointer; transition:all 0.2s;
  `
  randomBtn.addEventListener('mouseenter', () => { randomBtn.style.background = '#00f5d4'; randomBtn.style.color = '#020b14' })
  randomBtn.addEventListener('mouseleave', () => { randomBtn.style.background = '#0a2942'; randomBtn.style.color = '#00f5d4' })
  randomBtn.addEventListener('click', () => {
    const randomSpot = getRandomOceanSpot()
    loadSpot(randomSpot)
  })
  panel.appendChild(randomBtn)

  // Sliders
  function slider(label: string, min: number, max: number, val: number, step: number, onChange: (v: number) => void) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:9px;opacity:0.7;'
    lbl.textContent = label
    const inp = document.createElement('input')
    inp.type = 'range'
    inp.min = String(min)
    inp.max = String(max)
    inp.step = String(step)
    inp.value = String(val)
    inp.style.cssText = `-webkit-appearance:none;width:80px;height:3px;background:#1a4a6b;outline:none;cursor:pointer;`
    inp.addEventListener('input', () => onChange(parseFloat(inp.value)))
    wrap.appendChild(lbl)
    wrap.appendChild(inp)
    return wrap
  }

  panel.appendChild(slider('VOL', 0, 1, 0.8, 0.01, (v) => engine.setVolume(v)))
  panel.appendChild(slider('BRILLO FILTRO', 0.2, 2.0, 1.0, 0.05, (v) => { fx.brilloMult = v }))
  panel.appendChild(slider('VIENTO FM', 0.2, 3.0, 1.0, 0.05, (v) => { fx.vientoFmMult = v }))

  // Toggle de Autopilot / Surf Manual
  const modeBtn = document.createElement('button')
  modeBtn.textContent = '🏄‍♂️ MODO: AUTO'
  modeBtn.style.cssText = `
    background:transparent; color:#ff9f1c; border:1px solid #ff9f1c;
    padding:5px 10px; font-family:'Courier New',monospace; font-size:10px; cursor:pointer;
  `
  modeBtn.addEventListener('click', () => {
    controlMode = controlMode === 'auto' ? 'manual' : 'auto'
    modeBtn.textContent = controlMode === 'auto' ? '🏄‍♂️ MODO: AUTO' : '🎮 MODO: MANUAL'
    modeBtn.style.color = controlMode === 'auto' ? '#ff9f1c' : '#00f5d4'
    modeBtn.style.borderColor = controlMode === 'auto' ? '#ff9f1c' : '#00f5d4'
  })
  panel.appendChild(modeBtn)

  document.body.appendChild(panel)
}

// ─── Aplicación de Moduladores y FX ───────────────────────────────────────────
function applyFX(params: AudioParams): AudioParams {
  return {
    ...params,
    fmIndex: Math.min(2.5, params.fmIndex * fx.vientoFmMult),
    filterCutoffNorm: Math.min(1, Math.max(0.05, params.filterCutoffNorm * fx.brilloMult)),
  }
}

// ─── Main Animation Loop ──────────────────────────────────────────────────────
let lastSurfZone: 'lip' | 'face' | 'barrel' | 'trough' = 'face'
let lastSlopeDeg = 0

function loop(t: number): void {
  tickArrows()

  // En autopilot, el surfista oscila armónicamente a lo largo de la ola
  if (controlMode === 'auto') {
    surfXNorm = 0.5 + Math.sin(t * 0.0012) * 0.35 + Math.cos(t * 0.0006) * 0.08
  }

  // Obtener la forma de onda de audio acústica en vivo
  engine.getWaveformData(waveBuffer)

  // Estado del surfista montado en la onda
  const renderAnimal: AnimalState = {
    animalId: 'surfer-01',
    species: 'Surfista & Criatura Marina',
    provenance: 'live',
    timestamp: Date.now(),
    lat: activeLat,
    lon: activeLon,
    depthM: 0,
    speedMS: 5.5,
    headingDeg: 90,
    waveXNorm: surfXNorm,
    surfZone: lastSurfZone,
    waveSlopeDeg: lastSlopeDeg,
  }

  // Renderizar la superficie del mar usando DIRECTAMENTE la forma de onda de audio
  const surfPhysics = oceanCanvas.render(renderAnimal, lastOcean, t, waveBuffer)
  lastSurfZone = surfPhysics.surfZone
  lastSlopeDeg = surfPhysics.slopeDeg
  renderAnimal.surfZone = lastSurfZone
  renderAnimal.waveSlopeDeg = lastSlopeDeg

  // Mapear telemetría marina + posición en la onda al DSP del sintetizador
  const rawParams = mapToAudioParams(renderAnimal, lastOcean)
  engine.updateParams(applyFX(rawParams))

  // Actualizar HUD y Minimapa
  hud.update(renderAnimal, lastOcean)
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
  // Cargar de inmediato los datos del spot inicial
  loadSpot(initialSpot)
  requestAnimationFrame(loop)
})
