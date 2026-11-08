# Changelog — WaveSynth

Todas las modificaciones notables realizadas para reconectar la implementación con la visión conceptual original de **WaveSynth** (la superficie del mar como forma de onda sonora real, surf de armónicos y meteorología marina global).

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
