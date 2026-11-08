import { loadTrack } from './data/TrackLoader'
import { fetchOceanState, buildOceanFallback } from './data/marineApi'
import { mapToAudioParams } from './mapping/animalToAudio'
import { AudioEngine } from './audio/AudioEngine'
import { OceanCanvas, depthToCanvasY } from './ui/OceanCanvas'
import { TelemetryHUD } from './ui/TelemetryHUD'
import { TrackPlayer } from './TrackPlayer'
import type { OceanState, AnimalState, AudioParams } from './types'

const PLAYBACK_RATE = 120
const OCEAN_FETCH_THRESHOLD_DEG = 0.05

// ─── Setup ───────────────────────────────────────────────────────────────────
const track = loadTrack()
const player = new TrackPlayer(track, PLAYBACK_RATE)
const engine = new AudioEngine()

const canvasEl = document.getElementById('ocean') as HTMLCanvasElement
const hudEl    = document.getElementById('hud') as HTMLDivElement
const startBtn = document.getElementById('start') as HTMLButtonElement

const oceanCanvas = new OceanCanvas(canvasEl)
const hud = new TelemetryHUD(hudEl)

let lastOcean: OceanState = buildOceanFallback(track.points[0].lat, track.points[0].lon)
let lastFetchLat = track.points[0].lat
let lastFetchLon = track.points[0].lon
let fetchPending = false

// ─── FX state ─────────────────────────────────────────────────────────────────
const fx = { fmMult: 1, delayMult: 1 }

// ─── Mouse override state ──────────────────────────────────────────────────────
let mouseOverride: { depthM: number; panNorm: number } | null = null
let mouseDown = false

function canvasYToDepth(y: number): number {
  const SURFACE_Y = canvasEl.height * 0.30
  const BOTTOM_Y  = canvasEl.height * 0.95
  if (y <= SURFACE_Y) return 0
  return Math.max(0, Math.min(2000, ((y - SURFACE_Y) / (BOTTOM_Y - SURFACE_Y)) * 2000))
}

canvasEl.addEventListener('mousedown', (e) => {
  mouseDown = true
  const rect = canvasEl.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  mouseOverride = {
    depthM: canvasYToDepth(y * canvasEl.height / rect.height),
    panNorm: Math.max(0, Math.min(1, x / rect.width)),
  }
})

canvasEl.addEventListener('mousemove', (e) => {
  if (!mouseDown) return
  const rect = canvasEl.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  mouseOverride = {
    depthM: canvasYToDepth(y * canvasEl.height / rect.height),
    panNorm: Math.max(0, Math.min(1, x / rect.width)),
  }
})

canvasEl.addEventListener('mouseup', () => {
  mouseDown = false
  mouseOverride = null
})

canvasEl.addEventListener('mouseleave', () => {
  mouseDown = false
  mouseOverride = null
})

// Touch support
canvasEl.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const rect = canvasEl.getBoundingClientRect()
  const t = e.touches[0]
  mouseDown = true
  mouseOverride = {
    depthM: canvasYToDepth((t.clientY - rect.top) * canvasEl.height / rect.height),
    panNorm: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
  }
}, { passive: false })

canvasEl.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (!mouseDown) return
  const rect = canvasEl.getBoundingClientRect()
  const t = e.touches[0]
  mouseOverride = {
    depthM: canvasYToDepth((t.clientY - rect.top) * canvasEl.height / rect.height),
    panNorm: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
  }
}, { passive: false })

canvasEl.addEventListener('touchend', () => { mouseDown = false; mouseOverride = null })

// ─── Controls panel ──────────────────────────────────────────────────────────
function buildControls(): void {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
    display:flex; gap:24px; align-items:center;
    font-family:'Courier New',monospace; font-size:11px; color:#00f5d4;
    background:rgba(2,11,20,0.75); padding:10px 20px;
    border:1px solid rgba(0,245,212,0.15); user-select:none;
  `

  function slider(label: string, min: number, max: number, val: number, step: number, onChange: (v: number) => void) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;'
    const lbl = document.createElement('span')
    lbl.textContent = label
    const inp = document.createElement('input')
    inp.type = 'range'
    inp.min = String(min)
    inp.max = String(max)
    inp.step = String(step)
    inp.value = String(val)
    inp.style.cssText = `
      -webkit-appearance:none; width:90px; height:3px;
      background:#1a4a6b; outline:none; cursor:pointer;
    `
    inp.addEventListener('input', () => onChange(parseFloat(inp.value)))
    wrap.appendChild(lbl)
    wrap.appendChild(inp)
    return wrap
  }

  panel.appendChild(slider('VOL', 0, 1, 0.8, 0.01, (v) => engine.setVolume(v)))
  panel.appendChild(slider('FM ×', 0, 4, 1, 0.1,  (v) => { fx.fmMult = v }))
  panel.appendChild(slider('DELAY ×', 0, 4, 1, 0.1, (v) => { fx.delayMult = v }))

  const hint = document.createElement('span')
  hint.textContent = '← drag canvas'
  hint.style.cssText = 'opacity:0.4; font-size:10px;'
  panel.appendChild(hint)

  document.body.appendChild(panel)
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function applyFX(params: AudioParams): AudioParams {
  return {
    ...params,
    fmIndex: Math.min(5, params.fmIndex * fx.fmMult),
    depthMix: Math.min(1, params.depthMix * fx.delayMult),
    depthFeedback: Math.min(0.9, params.depthFeedback * (0.5 + fx.delayMult * 0.5)),
    ...(mouseOverride !== null && {
      depthMix: Math.min(1, (mouseOverride.depthM / 2000) * fx.delayMult),
      depthFeedback: Math.min(0.9, 0.2 + (mouseOverride.depthM / 2000) * 0.65),
      depthDelayMs: 30 + (mouseOverride.depthM / 2000) * 470,
      panNorm: mouseOverride.panNorm,
    }),
  }
}

function shouldRefetch(animal: AnimalState): boolean {
  if (fetchPending) return false
  const dLat = Math.abs((animal.lat ?? 0) - lastFetchLat)
  const dLon = Math.abs((animal.lon ?? 0) - lastFetchLon)
  return dLat > OCEAN_FETCH_THRESHOLD_DEG || dLon > OCEAN_FETCH_THRESHOLD_DEG
}

function loop(t: number): void {
  const animal = player.getStateAt(Date.now())

  // If mouse override active, inject depth into the animal for rendering
  const renderAnimal: AnimalState = mouseOverride
    ? { ...animal, depthM: mouseOverride.depthM }
    : animal

  if (shouldRefetch(animal) && animal.lat !== null && animal.lon !== null) {
    fetchPending = true
    lastFetchLat = animal.lat
    lastFetchLon = animal.lon
    fetchOceanState(animal.lat, animal.lon).then(ocean => {
      lastOcean = ocean
      fetchPending = false
    })
  }

  const rawParams = mapToAudioParams(renderAnimal, lastOcean)
  engine.updateParams(applyFX(rawParams))
  oceanCanvas.render(renderAnimal, lastOcean, t)
  hud.update(renderAnimal, lastOcean)

  requestAnimationFrame(loop)
}

startBtn.addEventListener('click', async () => {
  await engine.start()
  startBtn.style.display = 'none'
  buildControls()
  requestAnimationFrame(loop)
})
