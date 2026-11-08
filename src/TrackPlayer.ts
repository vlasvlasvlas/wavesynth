import type { AnimalTrack, AnimalState } from './types'

function lerp(a: number | null, b: number | null, t: number): number | null {
  if (a === null || b === null) return a ?? b
  return a + (b - a) * t
}

export class TrackPlayer {
  private track: AnimalTrack
  private playbackRate: number

  constructor(track: AnimalTrack, playbackRate: number) {
    this.track = track
    this.playbackRate = playbackRate
  }

  getStateAt(wallMs: number): AnimalState {
    const { points } = this.track
    const startTrack = points[0].timestamp
    const endTrack = points[points.length - 1].timestamp
    const totalDuration = endTrack - startTrack

    // Convert wall time to track time, then loop
    const rawTrackMs = wallMs * this.playbackRate
    const looped = startTrack + ((rawTrackMs - startTrack) % totalDuration + totalDuration) % totalDuration

    // Find surrounding points
    let idx = 0
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].timestamp <= looped && looped < points[i + 1].timestamp) {
        idx = i
        break
      }
    }

    const p0 = points[idx]
    const p1 = points[Math.min(idx + 1, points.length - 1)]
    const range = p1.timestamp - p0.timestamp
    const t = range > 0 ? (looped - p0.timestamp) / range : 0

    return {
      animalId: this.track.animalId,
      species: this.track.species,
      provenance: 'synthetic',
      timestamp: looped,
      lat:        (lerp(p0.lat, p1.lat, t) ?? p0.lat),
      lon:        (lerp(p0.lon, p1.lon, t) ?? p0.lon),
      depthM:     lerp(p0.depthM, p1.depthM, t),
      speedMS:    lerp(p0.speedMS, p1.speedMS, t),
      headingDeg: lerp(p0.headingDeg, p1.headingDeg, t),
    }
  }
}
