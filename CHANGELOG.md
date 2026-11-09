# Changelog — WaveSynth

Todas las modificaciones notables realizadas para reconectar la implementación con la visión conceptual original de **WaveSynth** (la superficie del mar como forma de onda sonora real, surf de armónicos y meteorología marina global).

---

## [0.4.1] — 2026-11-08

### Audio Engine

- **Bus de peces**: todos los peces conectan a un `GainNode` compartido (`fishBus`) en lugar de N conexiones directas al `destination`. El slider PECES controla el bus directamente.
- **Cleanup completo de nodos**: al morir un pez se desconectan `oscNode`, `filterNode` y `gainNode` correctamente. Antes, los `GainNode` quedaban como nodos zombies conectados al `destination`.
- **AudioContext resume()**: el loop comprueba cada frame si el contexto fue suspendido (tab en segundo plano) y lo reactiva automáticamente.
- **Filtro VCF audible**: mapeo exponencial `60 Hz–18 kHz` en lugar del lineal anterior `80–20 kHz`. Curva cuadrática en el eje X del barco para más sensibilidad en la zona baja donde el efecto se escucha más.
- **Resonancia clásica de VCF**: Q sube hasta 6.0 al cerrar el filtro (izquierda) y baja a 0.4 al abrir (derecha).
- **Timbre por pez**: cambiar el selector de timbre aplica solo a los peces futuros, nunca modifica los existentes.
- **Nodo de filtro siempre presente**: todos los peces crean un `BiquadFilterNode` (con `allpass` si el timbre no tiene filtro), garantizando cadena uniforme `osc → filter → gain → bus`.

### Frecuencia (↑↓)

- Kickstart al arrancar desde silencio: salta directo a `pitchMult = 2.0` (antes tardaba >5 segundos en llegar a zona audible desde 0.1).
- Tasa de crecimiento: 1.009 → 1.007 por frame (más lenta, más controlable).
- Portamento activo: 0.05 → 0.12 (sigue a `surfPitchMult` casi en tiempo real al presionar).

### Movimiento del barco (←→)

- Inercia al soltar: fricción 0.985 → 0.995 al liberar la tecla (glide más largo).
- Cambio de dirección: aplica 3.5× más fuerza al ir contra la velocidad actual, sin ceroearla abruptamente. Permite inversión rápida manteniendo física de inercia al soltar.

---

## [0.4.0] — 2026-11-08

### 🐟 Peces Luminosos

- Click del mouse en el agua spawna un pez luminoso (hasta 10 simultáneos).
- Cada pez tiene color pastel único, tamaño variable (distribución hacia pequeños: `3 + rnd * rnd * 11`), y nada horizontalmente con sesgo de dirección propio (`vxBias`), sin buscar el barco.
- Cada pez toca una nota de la escala/tónica seleccionada (oscilador sine/square/saw/triangle según timbre activo al momento del spawn).
- Los peces nunca salen del agua: en cada frame se clampean debajo de `waveYAt(x) + 10` tanto en física (main.ts) como en dibujo (OceanCanvas).
- Los peces entran por los bordes de pantalla si se spawnan vía los bordes.
- Lifetime: 10–16 segundos. Al salir, nadan hacia el borde más cercano y el oscilador hace fade.
- **Audio**: cada pez tiene su propio `OscillatorNode` + `GainNode` (y opcionalmente `BiquadFilterNode`). Volumen controlado por el slider PECES.
- **`AudioEngine.ts`**: agregado método `getContext(): AudioContext | null`.
- **`OceanCanvas.ts`**: agregado `FishRenderData` interface, parámetro `fish[]` en `render()`, dibujo de peces sobre `boatCtx` (overlay, siempre por debajo del barco). Guardado de `waveYAtFn` para acceso externo vía `getWaveYAt()`.

---

### 🎵 Selector de Escala Musical (dos dropdowns)

- Dropdown **TÓNICA**: Do, Re, Mi, Fa, Sol, La, Si.
- Dropdown **ESCALA**: Mayor, Menor, Pent. Mayor, Pent. Menor, Blues, Dórica, Frigia.
- Las frecuencias de cada pez se toman de la escala generada en tiempo real (`root * 2^(semitono/12)`), evitando notas duplicadas entre peces activos.

---

### 🎛️ 10 Timbres Sintéticos para Peces

Dropdown **TIMBRE** con 10 presets clásicos de síntesis:

| Timbre    | Oscilador  | Filtro                   |
|-----------|-----------|--------------------------|
| Flauta    | sine      | —                        |
| Clarinete | square    | lowpass 800 Hz Q=1       |
| Violín    | sawtooth  | lowpass 2000 Hz Q=1      |
| Cello     | sawtooth  | lowpass 500 Hz Q=2       |
| Oboe      | square    | bandpass 1200 Hz Q=5     |
| Theremin  | triangle  | lowpass 2500 Hz Q=0.5    |
| Campana   | sine      | highpass 600 Hz Q=0.7    |
| Órgano    | square    | lowpass 1500 Hz Q=3      |
| Glass     | triangle  | bandpass 900 Hz Q=8      |
| Pad       | sawtooth  | lowpass 350 Hz Q=0.5     |

- Cambiar el dropdown actualiza el oscilador de todos los peces vivos en tiempo real (`applyTimbre()`).
- Nuevos peces heredan el timbre activo al momento del spawn.

---

### 🎚️ Panel de Control Rediseñado

- Quitados sliders **BRILLO** y **VIENTO** del panel visible (siguen funcionando internamente, se auto-asignan con MAR ALEATORIO).
- Agregado slider **PECES** para controlar el volumen de todos los peces (0–1).
- Agregados dropdowns TÓNICA, ESCALA y TIMBRE.
- Quitado el hint temporal (rectángulo vacío que aparecía al entrar).

---

### 🌊 Olas y Visual

- `SURFACE_Y_RATIO`: 0.30 → 0.42 — las olas ahora ocupan más pantalla hacia abajo.
- `baseAmpPx` cap: `H * 0.38` → `H * 0.40` — amplitud máxima controlada.
- `waveHeightM` inicial: 3.5 → 5.0 — olas más grandes al arrancar.
- Alpha del water fill superior: 0.95 → 0.72 — las líneas del patrón scan-line quedan más espaciadas y el efecto de profundidad es más visible.

---

### ⛵ Movimiento del Barco

- Aceleración ←→: 0.0005 → 0.00008 (mucho más lento y suave).
- Fricción: 0.91 → 0.97 (más inercia).
- **Mouse**: click = solo spawna peces, NO mueve el barco. Todo el control de posición y frecuencia es exclusivamente con teclado (↑↓←→).

---

### 🖥️ UI / UX

- Botón ⓘ: muestra/oculta el panel de telemetría (HUD). `max-height: calc(100vh - 120px)` para evitar superposición con el panel inferior.
- Botón ?: modal con instrucciones de uso.
- Iconos SVG para los 4 tipos de onda (Sine ∿, Square ⊓, Sawtooth /, Triangle ∧).
- Pantalla de inicio: solo "WAVESYNTH" + botón "ENTRAR", sin texto adicional.
- Spacebar: removida de cualquier acción.

---

## [0.3.1] — 2026-11-08

### 🎚️ 1. Control Vertical Completo: Arriba = Agudo / Abajo = Grave
- **`src/main.ts`:**
  - **Mouse / Touch:** Se habilitó el control en el eje vertical `clientY`. Al arrastrar hacia arriba en la pantalla, la frecuencia sube continuamente hacia agudos brillantes; al arrastrar hacia abajo, desciende a sub-graves profundos con una curva logarítmica musical continua (`Math.pow(2, (1 - normY) * 6 - 2.5)`).
  - **Teclado:** Las flechas `ArrowUp` y `ArrowDown` suben y bajan la frecuencia del oscilador de manera suave.
  - **`src/ui/TelemetryHUD.ts`:** Muestra la frecuencia en tiempo real (en Hz o kHz), el multiplicador activo, la nota musical más cercana (ej. `440.0 Hz (La4)`) y la barra visual de frecuencia.

---

### 🌊 2. La Forma de Onda se Achica y Agranda según la Frecuencia ($\lambda \propto 1/f$)
- **`src/ui/OceanCanvas.ts`:**
  - La cantidad de ciclos visibles a lo largo de la pantalla ahora responde dinámicamente a la frecuencia acústica activa:
    - **Frecuencia baja (30–60 Hz):** La forma de onda **se agranda**, mostrando apenas 1 o 2 olas colosales y espaciadas.
    - **Frecuencia media (110–440 Hz):** Muestra entre 4 y 8 crestas armónicas bien diferenciadas.
    - **Frecuencia alta (>1000 Hz):** La forma de onda **se achica**, comprimiéndose en decenas de crestas apretadas y vibrantes.
  - Sincronización de fase analítica y propagación fluida para que la onda viaje sin saltos ni parpadeos.

---

### ⛵ 3. Física Náutica Real del Barco (Flotabilidad en Proa y Popa)
- **`src/ui/OceanCanvas.ts`:**
  - El barco ya no es un punto estático que flota en una sola coordenada: **se apoya físicamente en dos puntos sobre la superficie del agua** (proa y popa con una eslora de 44 px).
  - Cálculo del cabeceo náutico (*pitch*):
    $$\text{inclinación} = \arctan\left(\frac{y_{\text{proa}} - y_{\text{popa}}}{\text{eslora}}\right)$$
    El barco se inclina suavemente al subir la pared de la ola y se lanza en picada al bajar.
  - Sistema de amortiguación con inercia según la forma de onda activa (Sine, Square, Saw, Triangle).
  - **Diseño del Barco:** Casco hidrodinámico azul marino con línea de flotación ámbar, luz de proa turquesa, mástil vertical y vela triangular que flamea con el viento.

---

### 🌀 4. LFO Marino Visible y Audible
- **`src/ui/OceanCanvas.ts` & `src/main.ts`:**
  - El LFO oceánico (derivado del período marino $T_p$) modula la marea general y el oleaje macroscópico, haciendo que el mar respire y suba/baje en ciclos lentos.
  - Modulación sutil y orgánica del filtro de corte para generar respiración sonora acústica.
  - El HUD incluye un gráfico en movimiento de la fase y tasa del LFO.

---

### 🎛️ 5. Cuatro Formas de Onda en el Oscilador
- **`src/audio/AudioEngine.ts`:**
  - Soporte de 4 tipos de onda en el `AudioWorklet`: **∿ SINE**, **⊓ SQUARE**, **/ SAWTOOTH** y **∧ TRIANGLE**.
  - Transición suavizada entre formas de onda mediante `InlineSlewLimiter` para evitar clics de audio.
  - Selector con botones en el panel inferior de la interfaz.

---

### 🐛 6. Corrección de Dependencias y Estabilidad
- **`src/main.ts`:**
  - Corrección de la importación rota (`SpermWhaleVoice` → `WhaleAutopilot` de `src/data/WhaleAutopilot.ts`) que causaba el error de overlay de Vite en el navegador.
  - Servidor de desarrollo Vite corriendo de forma limpia y estable.

---

## [0.2.0] — 2026-11-08

### 🌊 1. Conexión Real DSP ↔ Superficie del Mar
- Integración de `AnalyserNode` en `AudioEngine.ts` para extraer muestras de audio vivas (`Float32Array`).
- Eliminadas las ondas decorativas desconectadas del sintetizador.
- Implementación de `harmonicFold` (wavefolder) en el `AudioWorklet`.

### 🏄‍♂️ 2. Navegación sobre la Forma de Onda
- Posicionamiento del interactor sobre la superficie de la sinewave.
- Detección de zonas: `lip` (cresta), `barrel` (tubo), `face` (pared), `trough` (valle).

### 🌍 3. Spots Oceánicos y Generador de Mar Aleatorio
- Módulo `src/data/marineSpots.ts` con spots legendarios y algoritmo de coordenadas con máscara continental.
- Minimapa interactivo con teletransporte al hacer clic en cualquier océano.
