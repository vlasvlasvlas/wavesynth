# SDD ledger — plan: docs/superpowers/plans/2026-11-08-wavesynth-fase0.md

## Pre-flight scan: shared interfaces

| Producer | Consumer | Interface | Status |
|----------|----------|-----------|--------|
| Task 1 (types.ts) | Tasks 2,3,4,5,6,7 | AnimalState, OceanState, AudioParams, TrackPoint, AnimalTrack | OK — tipos centrales, sin conflictos |
| Task 2 (marineApi.ts) | Task 7 (main.ts) | fetchOceanState, buildOceanFallback | OK |
| Task 2 (syntheticTrack.ts) | Task 7 (TrackPlayer) | generateSpermWhaleTrack(): AnimalTrack | OK |
| Task 3 (animalToAudio.ts) | Task 7 (main.ts) | mapToAudioParams(animal, ocean): AudioParams | OK |
| Task 3 (slewLimiter.ts) | Task 4 (worklet, interno) | Duplicado dentro del worklet — no import cross-thread | Ruling: duplicar SlewLimiter inline en worklet, no importar |
| Task 4 (worklet) | Task 5 (AudioEngine) | Registrado como 'ocean-synth', recibe AudioParams via postMessage | OK |
| Task 5 (AudioEngine) | Task 7 (main.ts) | start(), stop(), updateParams(AudioParams) | OK |
| Task 6 (OceanCanvas, TelemetryHUD) | Task 7 (main.ts) | render(animal, ocean, t), update(animal, ocean) | OK |

## Rulings

Task 3→4: SlewLimiter no puede importarse desde AudioWorklet (hilo separado). Duplicar la clase inline en el worklet. Costo si falla: divergencia silenciosa entre implementaciones.
