import { describe, it, expect } from 'vitest'
import { SlewLimiter } from './slewLimiter'

it('converge al target en el tiempo configurado', () => {
  const sr = 48000
  const timeMs = 100
  const sl = new SlewLimiter(0, timeMs, sr)
  const steps = Math.ceil(timeMs * sr / 1000)
  let val = 0
  for (let i = 0; i < steps; i++) val = sl.tick(1)
  expect(val).toBeCloseTo(1, 2)
})

it('no supera el target', () => {
  const sl = new SlewLimiter(0, 50, 48000)
  for (let i = 0; i < 100; i++) sl.tick(1)
  expect(sl.tick(1)).toBeLessThanOrEqual(1)
})

it('funciona en dirección negativa', () => {
  const sl = new SlewLimiter(1, 100, 48000)
  const steps = Math.ceil(100 * 48000 / 1000)
  let val = 1
  for (let i = 0; i < steps; i++) val = sl.tick(0)
  expect(val).toBeCloseTo(0, 2)
})
