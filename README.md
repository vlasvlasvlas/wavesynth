# WaveSynth 🌊

> La superficie del mar **es** la forma de onda. El barco navega sobre la síntesis en tiempo real.

Sintetizador web interactivo donde la oceanografía real (altura de olas, período, viento, temperatura) define el timbre. TypeScript + Vite + Web Audio API + AudioWorklet.

---

## Cómo funciona

| Control | Acción |
|---------|--------|
| `↑ ↓` | Frecuencia (pitch) |
| `← →` | Filtro pasa-bajos (VCF) — izquierda = oscuro, derecha = abierto |
| `Click` en el agua | Spawnea un pez luminoso |

La forma de onda visual **es** la señal de audio real, leída frame a frame del `AnalyserNode`.

---

## Peces Luminosos

Click en el agua para crear hasta 10 peces simultáneos. Cada uno:
- Toca una nota de la escala/tónica seleccionada (sin duplicar notas)
- Tiene su propio timbre del momento del spawn (no cambia aunque cambies el selector)
- Nada horizontalmente con sesgo propio y se va de pantalla después de 10–16 segundos

Controles en el panel inferior: **TÓNICA**, **ESCALA**, **TIMBRE**, **PECES** (volumen).

---

## Síntesis

- **Voz A**: oscilador principal (sine/square/sawtooth/triangle) + FM + filtro biquad + delay
- **Voz B**: sub-grave (ballena) con LFO lento y eco profundo
- El filtro VCF responde al eje X del barco con curva exponencial (60 Hz – 18 kHz) y resonancia que sube al cerrarlo

---

## Telemetría marina real

Botón **MAR ALEATORIO** carga datos en tiempo real desde [Open-Meteo Marine API](https://marine-api.open-meteo.com) y asigna automáticamente: pitch (período de ola), tipo de onda (altura de ola), intensidad FM (viento), brillo del filtro (temperatura del agua).

---

## Stack

```
TypeScript · Vite · Web Audio API · AudioWorklet (inline Blob)
```

---

## Desarrollo local

```bash
npm install
npm run dev
```
