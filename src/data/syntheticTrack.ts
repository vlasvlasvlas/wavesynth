import type { AnimalTrack, TrackPoint } from '../types'

export function generateSpermWhaleTrack(): AnimalTrack {
  const startTime = 1735000000000
  const intervalMs = 15 * 60 * 1000 // 15 min entre puntos
  const points: TrackPoint[] = []

  // 48 puntos = 12 horas, dos ciclos de dive completos
  for (let i = 0; i < 48; i++) {
    const cyclePos = i % 24 // posición dentro del ciclo (24 puntos = 6 horas por ciclo)

    // Perfil de profundidad: superficie (0-3), descenso (4-16), ascenso (17-19), superficie (20-23)
    let depthM: number
    if (cyclePos <= 3) {
      depthM = cyclePos * 1.5 // respiración en superficie, leve
    } else if (cyclePos <= 16) {
      depthM = ((cyclePos - 3) / 13) * 1500 // descenso a 1500m
    } else if (cyclePos <= 19) {
      depthM = ((19 - cyclePos) / 3) * 1500 // ascenso rápido
    } else {
      depthM = (cyclePos - 19) * 1.0 // respiración
    }

    points.push({
      timestamp: startTime + i * intervalMs,
      lat: -45.0 + i * 0.02,
      lon: -60.0 + i * 0.015,
      depthM: Math.round(depthM),
      speedMS: parseFloat((1.5 + Math.sin(i * 0.3) * 0.8).toFixed(2)),
      headingDeg: parseFloat((45 + Math.sin(i * 0.2) * 20).toFixed(1)),
    })
  }

  return {
    animalId: 'synthetic-sperm-01',
    species: 'Physeter macrocephalus',
    points,
  }
}
