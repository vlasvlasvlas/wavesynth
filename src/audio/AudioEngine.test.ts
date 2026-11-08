import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioEngine } from './AudioEngine'

const mockPostMessage = vi.fn()
const mockConnect = vi.fn()
const mockNode = { port: { postMessage: mockPostMessage }, connect: mockConnect }
const mockAddModule = vi.fn().mockResolvedValue(undefined)
const mockClose = vi.fn()
const mockCtx = {
  audioWorklet: { addModule: mockAddModule },
  destination: {},
  close: mockClose,
}

vi.stubGlobal('AudioContext', vi.fn(() => mockCtx))
vi.stubGlobal('AudioWorkletNode', vi.fn(() => mockNode))

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

it('start conecta el nodo al destination', async () => {
  const engine = new AudioEngine()
  await engine.start()
  expect(mockConnect).toHaveBeenCalledWith(mockCtx.destination)
})
