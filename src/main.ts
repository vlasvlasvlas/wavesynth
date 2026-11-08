import { loadTrack } from './data/TrackLoader'
import { fetchOceanState, buildOceanFallback } from './data/marineApi'
import { mapToAudioParams } from './mapping/animalToAudio'
import { AudioEngine } from './audio/AudioEngine'
import { OceanCanvas } from './ui/OceanCanvas'
import { TelemetryHUD } from './ui/TelemetryHUD'
import { TrackPlayer } from './TrackPlayer'
import type { OceanState, AnimalState } from './types'

const PLAYBACK_RATE = 120
const OCEAN_FETCH_THRESHOLD_DEG = 0.05 // re-fetch si el animal se movió >0.05°

const track = loadTrack()
const player = new TrackPlayer(track, PLAYBACK_RATE)
const engine = new AudioEngine()

const canvasEl = document.getElementById('ocean') as HTMLCanvasElement
const hudEl    = document.getElementById('hud') as HTMLDivElement
const startBtn = document.getElementById('start') as HTMLButtonElement

const oceanCanvas = new OceanCanvas(canvasEl)
const hud = new TelemetryHUD(hudEl)

let lastOcean: OceanState = buildOceanFallback(
  track.points[0].lat, track.points[0].lon,
)
let lastFetchLat = track.points[0].lat
let lastFetchLon = track.points[0].lon
let fetchPending = false

function shouldRefetch(animal: AnimalState): boolean {
  if (fetchPending) return false
  const dLat = Math.abs((animal.lat ?? 0) - lastFetchLat)
  const dLon = Math.abs((animal.lon ?? 0) - lastFetchLon)
  return dLat > OCEAN_FETCH_THRESHOLD_DEG || dLon > OCEAN_FETCH_THRESHOLD_DEG
}

function loop(t: number): void {
  const animal = player.getStateAt(Date.now())

  if (shouldRefetch(animal) && animal.lat !== null && animal.lon !== null) {
    fetchPending = true
    lastFetchLat = animal.lat
    lastFetchLon = animal.lon
    fetchOceanState(animal.lat, animal.lon).then(ocean => {
      lastOcean = ocean
      fetchPending = false
    })
  }

  const params = mapToAudioParams(animal, lastOcean)
  engine.updateParams(params)
  oceanCanvas.render(animal, lastOcean, t)
  hud.update(animal, lastOcean)

  requestAnimationFrame(loop)
}

startBtn.addEventListener('click', async () => {
  await engine.start()
  startBtn.style.display = 'none'
  requestAnimationFrame(loop)
})
