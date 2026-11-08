import { describe, it, expect } from 'vitest'
import { latLonToCanvasX, depthToCanvasY } from './OceanCanvas'

const fakeCanvas = { width: 1000, height: 600 } as HTMLCanvasElement

it('lon -180 → x 0', () => {
  expect(latLonToCanvasX(-180, fakeCanvas)).toBeCloseTo(0, 3)
})

it('lon 180 → x 1000', () => {
  expect(latLonToCanvasX(180, fakeCanvas)).toBeCloseTo(1000, 3)
})

it('lon 0 → x 500', () => {
  expect(latLonToCanvasX(0, fakeCanvas)).toBeCloseTo(500, 3)
})

it('depth 0 → y en zona superficial (top 30%)', () => {
  const y = depthToCanvasY(0, fakeCanvas)
  expect(y).toBeLessThan(fakeCanvas.height * 0.35)
})

it('depth 2000 → y cercano al fondo (>85%)', () => {
  const y = depthToCanvasY(2000, fakeCanvas)
  expect(y).toBeGreaterThan(fakeCanvas.height * 0.85)
})

it('depth null → misma posición que depth 0', () => {
  expect(depthToCanvasY(null, fakeCanvas)).toBe(depthToCanvasY(0, fakeCanvas))
})
