import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioEngine } from './AudioEngine'

const mockPostMessage = vi.fn()
const mockConnect = vi.fn()
const mockNode = { port: { postMessage: mockPostMessage }, connect: mockConnect }
const mockAddModule = vi.fn().mockResolvedValue(undefined)
const mockClose = vi.fn()
const mockResume = vi.fn().mockResolvedValue(undefined)
const mockCreateGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() }))
const mockCtx = {
  audioWorklet: { addModule: mockAddModule },
  destination: {},
  close: mockClose,
  resume: mockResume,
  createGain: mockCreateGain,
}

vi.stubGlobal('AudioContext', vi.fn(() => mockCtx))
vi.stubGlobal('AudioWorkletNode', vi.fn(() => mockNode))
vi.stubGlobal('Blob', vi.fn(() => ({})))
vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })

beforeEach(() => {
  vi.clearAllMocks()
})

it('updateParams envía el payload al port del worklet', async () => {
  const engine = new AudioEngine()
  await engine.start()
  const params = { swellFreq: 110, swellAmp: 0.5 } as any
  engine.updateParams(params)
  expect(mockPostMessage).toHaveBeenCalledWith(params)
})

it('stop cierra el AudioContext', async () => {
  const engine = new AudioEngine()
  await engine.start()
  engine.stop()
  expect(mockClose).toHaveBeenCalled()
})

it('start conecta el nodo (node → gain → destination)', async () => {
  const engine = new AudioEngine()
  await engine.start()
  // node conecta al gain node (no directamente a destination)
  expect(mockConnect).toHaveBeenCalled()
})
