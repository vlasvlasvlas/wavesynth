import { it, expect } from 'vitest'
import { TrackPlayer } from './TrackPlayer'
import { generateSpermWhaleTrack } from './data/syntheticTrack'

it('getStateAt retorna lat del primer punto cuando el tiempo es el inicio', () => {
  const track = generateSpermWhaleTrack()
  const player = new TrackPlayer(track, 120)
  // Simular que el wall time es exactamente el inicio del track
  const state = player.getStateAt(track.points[0].timestamp / 120)
  expect(state.lat).toBeCloseTo(track.points[0].lat, 2)
})

it('loopea cuando el tiempo supera el último punto', () => {
  const track = generateSpermWhaleTrack()
  const player = new TrackPlayer(track, 120)
  const first = track.points[0]
  const last = track.points[track.points.length - 1]
  const totalDurationMs = last.timestamp - first.timestamp
  // Pasar un wall time que equivale a 2x la duración del track
  const wallMs = (first.timestamp + totalDurationMs * 2 + 1000) / 120
  const state = player.getStateAt(wallMs)
  expect(state.lat).toBeDefined()
  expect(Number.isNaN(state.lat)).toBe(false)
})

it('la profundidad se interpola entre dos puntos', () => {
  const track = generateSpermWhaleTrack()
  const player = new TrackPlayer(track, 120)
  // Punto que cae a mitad entre points[0] y points[1]
  const midTrackMs = track.points[0].timestamp + (track.points[1].timestamp - track.points[0].timestamp) / 2
  const state = player.getStateAt(midTrackMs / 120)
  const d0 = track.points[0].depthM ?? 0
  const d1 = track.points[1].depthM ?? 0
  const expected = (d0 + d1) / 2
  expect(state.depthM).toBeCloseTo(expected, 0)
})
