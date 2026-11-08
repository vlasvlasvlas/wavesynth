# WaveSynth Fase 0 — Motor de Sonido Dirigido por Animal Marino

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un motor de audio que suena solo, dirigido por un track sintético de cachalote (con fallback a Movebank), que combina la posición del animal con telemetría marina del océano en ese punto, visualizado como sección transversal 2D (olas arriba, ballena abajo).

**Architecture:** Un `TrackPlayer` avanza por puntos de trayectoria de cachalote. Cada punto dispara un fetch de Open-Meteo Marine (lat/lon del animal) para obtener Hs, Tp, viento y temperatura. La combinación animal + océano se mapea a `AudioParams` que alimentan un `AudioWorkletNode` con 4 capas DSP (Swell, Surface, Foam, Depth). La profundidad del animal controla los filtros graves; los datos marinos del punto controlan el timbre global. El canvas muestra una sección transversal: olas arriba, animal en columna de agua abajo, HUD lateral.

**Tech Stack:** TypeScript 5, Vite 5, Web Audio API + AudioWorklet, Canvas 2D API, Vitest

**Spec:** docs/wavesynth_especificacion_tecnico_artistica_v2.md

## Global Constraints
- No Three.js, no WebGL en esta fase — solo Canvas 2D
- AudioWorklet corre en hilo de audio dedicado; no importa módulos del main thread
- La ballena lleva el océano: cada nuevo punto animal → fetch de Open-Meteo Marine desde esa lat/lon
- Null-safe: cualquier campo puede ser null; el audio debe seguir sonando con valores por defecto
- No autoplay: el audio arranca con el primer gesto del usuario (click)
- Slew limiter obligatorio en todos los params de audio: mínimo 500ms de transición
- Sample rate: 48000 Hz
- Fallback completo offline: track sintético de cachalote bundleado que siempre funciona
- Movebank API requiere autenticación; en Fase 0 es opcional y puede configurarse via env var

## Review Focus
- Track termina: el synth debe entrar en drone idle o loopearlo, nunca silenciarse abruptamente
- Open-Meteo unreachable: audio no se corta, se mantienen últimos valores marinos válidos
- Profundidad null (ballena en superficie antes de sumergirse): Depth layer usa 0, no NaN
- Spike de velocidad entre dos puntos de track: el slew limiter debe absorberlo sin click
- Cambio de preset (Calma/Tormenta) mientras suena: sin pop, transición suavizada

---

## Task 1: Scaffold + Tipos Compartidos

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/types.ts`
- Create: `vitest.config.ts`

**Interfaces producidas:**
```typescript
// src/types.ts
interface TrackPoint {
  timestamp: number        // unix ms
  lat: number
  lon: number
  depthM: number | null    // profundidad del animal en metros
  speedMS: number | null   // velocidad m/s
  headingDeg: number | null
}

interface AnimalTrack {
  animalId: string
  species: string          // "Physeter macrocephalus"
  points: TrackPoint[]
}

interface AnimalState extends TrackPoint {
  animalId: string
  species: string
  provenance: 'synthetic' | 'live' | 'archive'
}

interface OceanState {
  lat: number | null
  lon: number | null
  waveHeightM: number | null    // Hs
  peakPeriodS: number | null    // Tp
  waveDirectionDeg: number | null
  windSpeedMS: number | null
  waterTempC: number | null
  fetchedAt: number             // unix ms, 0 si no hay datos
}

interface AudioParams {
  swellFreq: number        // Hz, 55–220 (mapeado desde Tp)
  swellAmp: number         // 0–1 (desde Hs)
  fmIndex: number          // 0–5 (desde windSpeed)
  fmFreqRatio: number      // 1.0–4.0 (desde heading)
  foamAmp: number          // 0–1 (desde windSpeed umbral)
  foamDecay: number        // 0.001–0.01
  depthMix: number         // 0–1 (desde depthM animal)
  depthFeedback: number    // 0–0.95
  depthDelayMs: number     // 20–500 (desde depthM)
  filterCutoffNorm: number // 0–1 (desde waterTempC: frío=1 brillante, cálido=0.3 cálido)
  panNorm: number          // 0–1 (desde lon)
}
```

- [ ] **Step 1:** Crear `package.json` con scripts `dev`, `build`, `test`:
  - `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`
  - Dependencias: `vite: ^5`, `typescript: ^5`
  - DevDeps: `vitest: ^1`, `@vitest/ui: ^1`

- [ ] **Step 2:** Crear `vite.config.ts`:
  ```typescript
  import { defineConfig } from 'vite'
  export default defineConfig({ base: './' })
  ```

- [ ] **Step 3:** Crear `tsconfig.json` con `"target": "ES2022"`, `"moduleResolution": "bundler"`, `"strict": true`

- [ ] **Step 4:** Crear `index.html` con un `<canvas id="ocean">` fullscreen y un `<div id="hud">` superpuesto, y `<button id="start">Start</button>`.

- [ ] **Step 5:** Crear `src/types.ts` con todas las interfaces del bloque anterior.

- [ ] **Step 6:** Crear `vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config'
  export default defineConfig({ test: { environment: 'node' } })
  ```

- [ ] **Step 7:** Correr `npm install` y verificar que `npm run dev` levanta el servidor.

- [ ] **Step 8:** Commit
  ```bash
  git add .
  git commit -m "chore(scaffold): setup Vite+TS+Vitest para WaveSynth Fase 0"
  ```

---

## Task 2: Track Sintético + Cliente de Datos

**Files:**
- Create: `src/data/syntheticTrack.ts`
- Create: `src/data/marineApi.ts`
- Create: `src/data/TrackLoader.ts`
- Test: `src/data/marineApi.test.ts`

**Interfaces:**
- Consume: `AnimalTrack`, `TrackPoint`, `OceanState` de `src/types.ts`
- Produce:
  - `generateSpermWhaleTrack(): AnimalTrack`
  - `fetchOceanState(lat: number, lon: number): Promise<OceanState>`
  - `loadTrack(): AnimalTrack`

**Diseño del track sintético:** 48 puntos simulando un cachalote en el Atlántico Sur (~-45°S, -60°W) con dos ciclos de dive completos (descenso a 1500m en 15 min, ascenso en 5 min, respiración en superficie 10 min). Velocidad 1–3 m/s, heading variable ±30° respecto al anterior.

- [ ] **Step 1:** Escribir test fallido en `src/data/marineApi.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { buildOceanFallback } from './marineApi'
  
  describe('buildOceanFallback', () => {
    it('devuelve OceanState con todos los campos null excepto lat/lon', () => {
      const state = buildOceanFallback(-45, -60)
      expect(state.lat).toBe(-45)
      expect(state.lon).toBe(-60)
      expect(state.waveHeightM).toBeNull()
      expect(state.fetchedAt).toBe(0)
    })
  })
  ```

- [ ] **Step 2:** Correr `npm test` — debe fallar con "Cannot find module"

- [ ] **Step 3:** Crear `src/data/marineApi.ts` con:
  - `buildOceanFallback(lat, lon): OceanState` — retorna OceanState con lat/lon y todos los demás campos `null`, `fetchedAt: 0`
  - `fetchOceanState(lat, lon): Promise<OceanState>` — llama a `https://marine-api.open-meteo.com/v1/marine` con params `latitude`, `longitude`, `current=wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period`; en caso de error retorna `buildOceanFallback(lat, lon)`; parsea `current` al OceanState tipado

- [ ] **Step 4:** Correr `npm test` — debe pasar

- [ ] **Step 5:** Crear `src/data/syntheticTrack.ts` con `generateSpermWhaleTrack(): AnimalTrack`:
  - 48 puntos, intervalo de 15 min entre puntos (`timestamp` = 1735000000000 + i*15*60*1000)
  - Dos ciclos: puntos 0–15 en superficie (depth 0–5m), puntos 16–28 descenso lineal a 1500m, puntos 29–32 ascenso a 0m, repetir
  - lat: -45.0 + i*0.02, lon: -60.0 + i*0.015 (deriva lenta noreste)
  - speed: 1.5 + sin(i*0.3)*0.8 m/s
  - heading: 45 + sin(i*0.2)*20 degrees

- [ ] **Step 6:** Crear `src/data/TrackLoader.ts` con `loadTrack(): AnimalTrack` — retorna `generateSpermWhaleTrack()` (en Fase 0, siempre sintético; Movebank se agrega en Fase siguiente)

- [ ] **Step 7:** Commit
  ```bash
  git add src/data/ 
  git commit -m "feat(data): track sintético de cachalote + cliente Open-Meteo Marine"
  ```

---

## Task 3: Mapeo Animal+Océano → AudioParams

**Files:**
- Create: `src/mapping/animalToAudio.ts`
- Create: `src/mapping/slewLimiter.ts`
- Test: `src/mapping/animalToAudio.test.ts`
- Test: `src/mapping/slewLimiter.test.ts`

**Interfaces:**
- Consume: `AnimalState`, `OceanState`, `AudioParams` de `src/types.ts`
- Produce:
  - `mapToAudioParams(animal: AnimalState, ocean: OceanState): AudioParams`
  - `class SlewLimiter(initial: number, timeSamples: number)`
  - `SlewLimiter.tick(target: number): number`

**Reglas de mapeo (valores exactos de la spec):**

| Fuente | Rango entrada | Destino AudioParams | Rango salida |
|--------|--------------|---------------------|--------------|
| `ocean.peakPeriodS` | 4–24 s | `swellFreq` | 55–220 Hz (exponencial: `55 * 4^norm`) |
| `ocean.waveHeightM` | 0.2–18 m | `swellAmp` | 0.1–0.8 (lineal normalizado) |
| `ocean.windSpeedMS` | 0–33 m/s | `fmIndex` | 0–5 |
| `animal.headingDeg` | 0–360° | `fmFreqRatio` | 1.0–4.0 |
| `ocean.windSpeedMS` | >15 m/s umbral | `foamAmp` | 0 si <15, lineal 0–0.4 si ≥15 |
| `animal.depthM` | 0–2000 m | `depthMix` | `log1p(d)/log1p(2000)` |
| `animal.depthM` | 0–2000 m | `depthFeedback` | 0.2 + depthMix*0.65 (máx 0.85) |
| `animal.depthM` | 0–2000 m | `depthDelayMs` | 30 + depthMix*470 |
| `ocean.waterTempC` | 1–32°C | `filterCutoffNorm` | `1 - (T-1)/31 * 0.7` (frío=1, cálido=0.3) |
| `animal.lon` | -180–180° | `panNorm` | `(lon+180)/360` |

Null en cualquier campo → valor por defecto (swellFreq:110, swellAmp:0.4, fmIndex:0.5, fmFreqRatio:2, foamAmp:0, foamDecay:0.003, depthMix:0, depthFeedback:0.2, depthDelayMs:30, filterCutoffNorm:0.7, panNorm:0.5).

- [ ] **Step 1:** Escribir tests en `src/mapping/animalToAudio.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { mapToAudioParams } from './animalToAudio'
  import type { AnimalState, OceanState } from '../types'
  
  const baseAnimal: AnimalState = {
    animalId: 'test', species: 'Physeter macrocephalus', provenance: 'synthetic',
    timestamp: 0, lat: -45, lon: -60, depthM: 500, speedMS: 2, headingDeg: 90
  }
  const baseOcean: OceanState = {
    lat: -45, lon: -60, waveHeightM: 3, peakPeriodS: 12,
    waveDirectionDeg: 270, windSpeedMS: 10, waterTempC: 15, fetchedAt: 1
  }
  
  it('peakPeriodS 12s → swellFreq cercano a 110 Hz', () => {
    const p = mapToAudioParams(baseAnimal, baseOcean)
    expect(p.swellFreq).toBeCloseTo(110, 0)
  })
  
  it('depthM null → depthMix 0', () => {
    const p = mapToAudioParams({ ...baseAnimal, depthM: null }, baseOcean)
    expect(p.depthMix).toBe(0)
  })
  
  it('windSpeedMS 20 → foamAmp > 0', () => {
    const p = mapToAudioParams(baseAnimal, { ...baseOcean, windSpeedMS: 20 })
    expect(p.foamAmp).toBeGreaterThan(0)
  })
  
  it('waterTempC 1 → filterCutoffNorm 1', () => {
    const p = mapToAudioParams(baseAnimal, { ...baseOcean, waterTempC: 1 })
    expect(p.filterCutoffNorm).toBeCloseTo(1, 2)
  })
  
  it('todos null → valores por defecto válidos sin NaN', () => {
    const nullOcean: OceanState = { lat: null, lon: null, waveHeightM: null,
      peakPeriodS: null, waveDirectionDeg: null, windSpeedMS: null,
      waterTempC: null, fetchedAt: 0 }
    const p = mapToAudioParams({ ...baseAnimal, depthM: null, speedMS: null, headingDeg: null, lon: null }, nullOcean)
    Object.values(p).forEach(v => expect(Number.isNaN(v)).toBe(false))
  })
  ```

- [ ] **Step 2:** Correr test — debe fallar

- [ ] **Step 3:** Implementar `src/mapping/animalToAudio.ts` con la tabla de mapeo exacta del bloque anterior. Cada función de mapeo es una función interna pura.

- [ ] **Step 4:** Correr test — debe pasar

- [ ] **Step 5:** Escribir tests en `src/mapping/slewLimiter.test.ts`:
  ```typescript
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
  ```

- [ ] **Step 6:** Implementar `src/mapping/slewLimiter.ts`:
  - `class SlewLimiter { current; rate; constructor(initial, timeMs, sampleRate); tick(target): number }`
  - `rate = 1 / (timeMs * sampleRate / 1000)`, avanza `Math.sign(diff) * Math.min(|diff|, rate)` por tick

- [ ] **Step 7:** Correr tests — deben pasar

- [ ] **Step 8:** Commit
  ```bash
  git add src/mapping/
  git commit -m "feat(mapping): mapeo animal+océano a AudioParams + SlewLimiter"
  ```

---

## Task 4: AudioWorklet DSP — 4 Capas

**Files:**
- Create: `src/audio/worklet/OceanSynth.worklet.ts`

**Interfaces:**
- Consume: mensajes via `this.port.onmessage` con payload `AudioParams`
- Produce: audio stereo en `outputs[0]`

**DSP por capa (implementar en `process()` a nivel de sample):**

```
Swell:   phase += swellFreq * 2π / 48000
         swell = sin(phase) * swellAmp * slewAmp

Surface: fmPhase += swellFreq * fmFreqRatio * 2π / 48000
         modulated = sin(phase + sin(fmPhase) * fmIndex) * slewAmp

Foam:    foam = (Math.random()*2-1) * foamEnv
         foamEnv *= (1 - foamDecay)
         cuando foamAmp cambia bruscamente: foamEnv = foamAmp

Depth:   delay circular de maxDelayMs=500ms (24000 muestras)
         read = delay[(ptr - delayOffset + 24000) % 24000] * depthFeedback
         delay[ptr] = modulated + read * depthFeedback * 0.5
         ptr = (ptr+1) % 24000
         output += read * depthMix

Filter:  biquad LP simple: cutoff = filterCutoffNorm * 20000 Hz
         coeff recalculados al cambiar cutoff (máx 1 vez cada 128 muestras)

Pan:     L = output * sqrt(1 - panNorm), R = output * sqrt(panNorm)
```

Todos los params (swellFreq, swellAmp, fmIndex, etc.) pasan por SlewLimiter duplicado dentro del worklet (no puede importar desde main thread). El worklet llama `this.port.onmessage` para recibir `AudioParams` y actualizar targets del slew.

Nota: AudioWorklet no puede unit-testearse en jsdom. La verificación es manual en el navegador.

- [ ] **Step 1:** Crear `src/audio/worklet/OceanSynth.worklet.ts` con la clase `OceanSynthProcessor extends AudioWorkletProcessor`:
  - `static get parameterDescriptors() { return [] }` (todos los params via message)
  - Constructor: inicializa delay buffer (Float32Array 24000), todos los slew limiters con 500ms, `port.onmessage` para recibir `AudioParams`
  - `process(inputs, outputs)`: implementar las 4 capas con la lógica del bloque anterior; retornar `true`

- [ ] **Step 2:** Registrar: al final del archivo `registerProcessor('ocean-synth', OceanSynthProcessor)`

- [ ] **Step 3:** Verificación manual en browser (documentada):
  - Abrir DevTools → Console
  - Pegar snippet que crea `AudioContext`, registra el worklet, envía un `AudioParams` hardcodeado y verifica que hay audio (oscilómetro de volumen en devtools)
  - Confirmar: sin pops al cambiar params via postMessage repetido

- [ ] **Step 4:** Commit
  ```bash
  git add src/audio/worklet/
  git commit -m "feat(dsp): AudioWorklet 4 capas Swell/Surface/Foam/Depth"
  ```

---

## Task 5: AudioEngine

**Files:**
- Create: `src/audio/AudioEngine.ts`
- Test: `src/audio/AudioEngine.test.ts`

**Interfaces:**
- Consume: `AudioParams` de `src/types.ts`, worklet desde `./worklet/OceanSynth.worklet.ts`
- Produce:
  - `class AudioEngine`
  - `AudioEngine.start(): Promise<void>` — crea AudioContext, registra worklet, crea nodo, conecta a destination
  - `AudioEngine.updateParams(params: AudioParams): void` — envía params via `node.port.postMessage(params)`
  - `AudioEngine.stop(): void` — cierra AudioContext

- [ ] **Step 1:** Escribir test en `src/audio/AudioEngine.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { AudioEngine } from './AudioEngine'
  
  // Mock mínimo de AudioContext
  const mockNode = { port: { postMessage: vi.fn() }, connect: vi.fn() }
  const mockWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  const mockCtx = {
    audioWorklet: mockWorklet,
    destination: {},
    close: vi.fn(),
  }
  vi.stubGlobal('AudioContext', vi.fn(() => mockCtx))
  vi.stubGlobal('AudioWorkletNode', vi.fn(() => mockNode))
  
  it('updateParams envía el payload al port', async () => {
    const engine = new AudioEngine()
    await engine.start()
    const params = { swellFreq: 110 } as any
    engine.updateParams(params)
    expect(mockNode.port.postMessage).toHaveBeenCalledWith(params)
  })
  
  it('stop cierra el AudioContext', async () => {
    const engine = new AudioEngine()
    await engine.start()
    engine.stop()
    expect(mockCtx.close).toHaveBeenCalled()
  })
  ```

- [ ] **Step 2:** Correr test — debe fallar

- [ ] **Step 3:** Implementar `src/audio/AudioEngine.ts`:
  - `start()`: `new AudioContext({sampleRate:48000})`, `await ctx.audioWorklet.addModule(new URL('./worklet/OceanSynth.worklet.ts', import.meta.url))`, `new AudioWorkletNode(ctx, 'ocean-synth')`, `.connect(ctx.destination)`, guardar refs en propiedades privadas
  - `updateParams(params)`: `this.node.port.postMessage(params)`
  - `stop()`: `this.ctx.close()`

- [ ] **Step 4:** Correr test — debe pasar

- [ ] **Step 5:** Commit
  ```bash
  git add src/audio/AudioEngine.ts src/audio/AudioEngine.test.ts
  git commit -m "feat(audio): AudioEngine — wrapper del AudioWorklet con start/stop/updateParams"
  ```

---

## Task 6: Visual — Sección Transversal + HUD

**Files:**
- Create: `src/ui/OceanCanvas.ts`
- Create: `src/ui/TelemetryHUD.ts`
- Test: `src/ui/OceanCanvas.test.ts`

**Concepto visual (sección transversal 2D):**
```
┌──────────────────────────────────────────┐
│  ~~~~~ olas ~~~~~ (animadas, Hs, Tp)     │  ← top 30%
│──────────────────────────────────────────│  ← línea de superficie
│          columna de agua                 │
│    •  animal (punto cian bioluminiscente)│  ← lat/lon en X, depth en Y
│    ·  trail (últimas 20 posiciones)      │
│                                          │
│                              [seabed?]   │  ← si batimetría disponible
└──────────────────────────────────────────┘
```
Paleta: `#020b14` fondo, `#00f5d4` cian (animal), `#ffffff22` trail, `#1a4a6b` superficie, `#ff9f1c` HUD accents.

**Interfaces:**
- Produce:
  - `class OceanCanvas(canvas: HTMLCanvasElement)`
  - `OceanCanvas.render(animal: AnimalState, ocean: OceanState, t: number): void`
  - `latLonToCanvasX(lon: number, canvas: HTMLCanvasElement): number`
  - `depthToCanvasY(depthM: number | null, canvas: HTMLCanvasElement): number`
  - `class TelemetryHUD(container: HTMLElement)`
  - `TelemetryHUD.update(animal: AnimalState, ocean: OceanState): void`

- [ ] **Step 1:** Escribir test en `src/ui/OceanCanvas.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { latLonToCanvasX, depthToCanvasY } from './OceanCanvas'
  
  const fakeCanvas = { width: 1000, height: 600 } as HTMLCanvasElement
  
  it('lon -180 → x 0, lon 180 → x 1000', () => {
    expect(latLonToCanvasX(-180, fakeCanvas)).toBe(0)
    expect(latLonToCanvasX(180, fakeCanvas)).toBe(1000)
  })
  
  it('depth 0 → y en zona superficial (top 30%), depth 2000 → y cercano al fondo', () => {
    const surface = depthToCanvasY(0, fakeCanvas)
    const deep = depthToCanvasY(2000, fakeCanvas)
    expect(surface).toBeLessThan(fakeCanvas.height * 0.35)
    expect(deep).toBeGreaterThan(fakeCanvas.height * 0.85)
  })
  
  it('depth null → misma posición que depth 0', () => {
    expect(depthToCanvasY(null, fakeCanvas)).toBe(depthToCanvasY(0, fakeCanvas))
  })
  ```

- [ ] **Step 2:** Correr test — debe fallar

- [ ] **Step 3:** Implementar `src/ui/OceanCanvas.ts`:
  - Exportar `latLonToCanvasX(lon, canvas)`: `(lon + 180) / 360 * canvas.width`
  - Exportar `depthToCanvasY(depthM, canvas)`: zona de agua = 30%–95% de alto canvas; depth 0 → Y=30%, depth 2000 → Y=95%; null → 30%
  - `class OceanCanvas`: guarda el canvas, mantiene array de trail (máx 20 puntos)
  - `render(animal, ocean, t)`:
    - Fondo `#020b14`
    - Olas en zona superior: dibujar 3 sinusoides superpuestas con amplitud proporcional a `ocean.waveHeightM` (o 1m si null), frecuencia desde `Tp`; animar con `t`
    - Línea de superficie `#1a4a6b`
    - Trail: puntos anteriores como círculos pequeños `#ffffff22`
    - Animal: círculo 8px `#00f5d4`, glow con `shadowBlur=15`
    - Push del punto actual al trail, si trail>20 shift

- [ ] **Step 4:** Correr test — debe pasar

- [ ] **Step 5:** Implementar `src/ui/TelemetryHUD.ts`:
  - `class TelemetryHUD(container)`: crea un `<div>` con estilo posición absoluta top-left, fuente monospace, color `#00f5d4`, fondo `#020b1488`
  - `update(animal, ocean)`: actualiza innerHTML con:
    ```
    ANIMAL: {species}
    LAT {lat?.toFixed(3)} | LON {lon?.toFixed(3)}
    DEPTH {depthM ?? '—'} m | SPD {speedMS?.toFixed(1) ?? '—'} m/s
    HDG {headingDeg?.toFixed(0) ?? '—'}°
    ——————————————
    Hs {waveHeightM?.toFixed(1) ?? '—'} m | Tp {peakPeriodS?.toFixed(0) ?? '—'} s
    WIND {windSpeedMS?.toFixed(1) ?? '—'} m/s
    TEMP {waterTempC?.toFixed(1) ?? '—'} °C
    ```

- [ ] **Step 6:** Commit
  ```bash
  git add src/ui/
  git commit -m "feat(ui): sección transversal 2D + HUD de telemetría marina"
  ```

---

## Task 7: TrackPlayer + Loop Principal

**Files:**
- Create: `src/TrackPlayer.ts`
- Modify: `src/main.ts`
- Test: `src/TrackPlayer.test.ts`

**Interfaces:**
- Consume: `AnimalTrack`, `AnimalState`, `OceanState` de `src/types.ts`; `loadTrack` de `src/data/TrackLoader.ts`; `fetchOceanState` de `src/data/marineApi.ts`; `mapToAudioParams` de `src/mapping/animalToAudio.ts`; `AudioEngine`, `OceanCanvas`, `TelemetryHUD`
- Produce:
  - `class TrackPlayer(track: AnimalTrack, playbackRate: number)`
  - `TrackPlayer.getStateAt(wallTimeMs: number): AnimalState`
  - `TrackPlayer.isLooping: boolean`

**Playback rate por defecto: 120** (1 hora de track = 30 segundos de experiencia; tracks de ballena suelen abarcar 6–24 h → 3–12 min de sesión)

- [ ] **Step 1:** Escribir test en `src/TrackPlayer.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { TrackPlayer } from './TrackPlayer'
  import { generateSpermWhaleTrack } from './data/syntheticTrack'
  
  it('getStateAt retorna el punto correcto interpolado en el tiempo', () => {
    const track = generateSpermWhaleTrack()
    const player = new TrackPlayer(track, 120)
    // en wallTime=0 debería retornar el primer punto
    const state = player.getStateAt(track.points[0].timestamp / 120)
    expect(state.lat).toBeCloseTo(track.points[0].lat, 3)
  })
  
  it('loopea cuando el tiempo supera el último punto', () => {
    const track = generateSpermWhaleTrack()
    const player = new TrackPlayer(track, 120)
    const totalDuration = (track.points[track.points.length-1].timestamp - track.points[0].timestamp) / 120
    const state = player.getStateAt(totalDuration + 1000)
    expect(state.lat).toBeDefined()
    expect(Number.isNaN(state.lat)).toBe(false)
  })
  ```

- [ ] **Step 2:** Correr test — debe fallar

- [ ] **Step 3:** Implementar `src/TrackPlayer.ts`:
  - Constructor guarda track y playbackRate; `startTrackTime = track.points[0].timestamp`; `startWallTime = Date.now()`
  - `getStateAt(wallMs)`:
    - `trackMs = (wallMs - startWallTime) * playbackRate + startTrackTime`
    - Modular sobre duración total del track (loop)
    - Encuentra el índice `i` tal que `points[i].timestamp <= trackMs < points[i+1].timestamp`
    - Interpolar linealmente lat, lon, depthM, speedMS, headingDeg entre `i` e `i+1`
    - Retornar `AnimalState` con `provenance: 'synthetic'`

- [ ] **Step 4:** Correr test — debe pasar

- [ ] **Step 5:** Implementar `src/main.ts`:
  - Obtener refs a `<canvas id="ocean">`, `<div id="hud">`, `<button id="start">`
  - Crear instancias: `TrackPlayer`, `AudioEngine`, `OceanCanvas`, `TelemetryHUD`
  - On button click:
    1. `await audioEngine.start()`
    2. Ocultar botón
    3. Disparar loop principal con `requestAnimationFrame`
  - Loop principal (`tick(t)`):
    1. `const animal = player.getStateAt(Date.now())`
    2. Si la posición cambió >0.01° respecto a la última fetch: `fetchOceanState(animal.lat, animal.lon).then(ocean => { lastOcean = ocean })`
    3. `const params = mapToAudioParams(animal, lastOcean)`
    4. `audioEngine.updateParams(params)`
    5. `canvas.render(animal, lastOcean, t)`
    6. `hud.update(animal, lastOcean)`
    7. `requestAnimationFrame(tick)`
  - `lastOcean` se inicializa con `buildOceanFallback(animal.lat, animal.lon)` y se actualiza con el Promise resuelto

- [ ] **Step 6:** Correr `npm run dev`, verificar en browser:
  - Click en Start → audio arranca, visual se mueve
  - HUD muestra datos del animal en movimiento
  - El sonido evoluciona con la profundidad del cachalote (graves en dive, brillo al emerger)
  - Sin clicks ni pops durante 2 min de sesión

- [ ] **Step 7:** Commit final
  ```bash
  git add src/TrackPlayer.ts src/main.ts src/TrackPlayer.test.ts
  git commit -m "feat(main): TrackPlayer + loop principal — WaveSynth Fase 0 completo"
  ```

---

## Notas para el implementador

- **Movebank real**: para conectar datos reales, en Fase 1 se agrega `MoveBank.ts` con fetch autenticado (Bearer token via `VITE_MOVEBANK_TOKEN`). El `TrackLoader` detecta la env var y usa Movebank si está disponible.
- **Batimetría**: no incluida en esta fase. Si se quiere agregar más tarde, `OceanState` ya tiene el campo; `TelemetryHUD` lo mostraría y `OceanCanvas` dibujaría la línea del fondo.
- **Otros animales**: el track sintético es de cachalote pero la arquitectura es agnóstica al animal. Se puede agregar `generateBlueWhaleTrack()` u otros en `syntheticTrack.ts`.
- **Audio seguro**: el AudioWorklet aplica un hard limiter de salida (clamp ±0.95) para evitar picos. El implementador debe verificar que `swellAmp` + `foamAmp` + `depthMix` no superen 1.0 combinados; ajustar la suma en `process()` si es necesario.
