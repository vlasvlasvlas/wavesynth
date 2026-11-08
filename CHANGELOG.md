# Changelog — WaveSynth

Todas las modificaciones notables realizadas para reconectar la implementación con la visión conceptual original de **WaveSynth** (la superficie del mar como forma de onda sonora real, surf de armónicos y meteorología marina global).

---

## [0.2.0] — 2026-11-08

### 🌊 1. Conexión Real DSP ↔ Superficie del Mar (La Forma de Onda ES la Ola)
- **`src/audio/AudioEngine.ts`:**
  - Se integró un `AnalyserNode` estéreo en la cadena de audio (`node → gain → analyser → destination`).
  - Se añadió el método `getWaveformData(output?: Float32Array)` para leer en tiempo real las muestras del oscilador en el dominio del tiempo (`getFloatTimeDomainData`).
  - Se implementó un algoritmo de **Wavefolding no lineal** (`harmonicFold`) en el `AudioWorklet` para plegado y distorsión de armónicos cuando el surfista ataca la cresta.
  - Se agregó control dinámico de resonancia $Q$ (`resonanceQ`) en el filtro biquad para simular la acústica hueca del tubo marino.
- **`src/ui/OceanCanvas.ts`:**
  - **Eliminadas** las funciones trigonométricas estáticas decorativas que no tenían relación con el sonido.
  - La línea del agua ahora se calcula recorriendo directamente las muestras del buffer de audio acústico en vivo, escaladas por la altura de ola ($H_s$) y el período ($T_p$) de la telemetría marina.
  - Se agregaron efectos de rayos cáusticos submarinos y espuma bioluminiscente en las crestas donde rompe la onda.

---

### 🏄‍♂️ 2. El Animal / Surfista Montado sobre la Sinewave
- **Reubicación física:**
  - El animal dejó de ser un punto perdido a 2.000 metros de profundidad en un fondo negro; ahora **está montado directamente sobre la cresta de la forma de onda de audio** ($Y = waveY(X)$).
- **Física de navegación:**
  - Cálculo de la tangente local de la onda ($\theta = \arctan(dy/dx)$): el surfista rota e inclina su ángulo dinámicamente con la subida y bajada de la ola.
  - Generador de partículas de agua y spray marino (*wake spray*) expulsado detrás de la tabla.
- **Detección de Zonas de Surf y Modulación Gestual:**
  - `lip` (Cresta / Labio): Al subir a la parte más alta, se activa distorsión por *wavefolding* y chisporroteo de spray.
  - `barrel` (El Tubo): En las paredes empinadas y cóncavas, aumenta la resonancia $Q$ y el retardo hueco.
  - `face` (La Pared): Sinusoide pura y modulación armónica limpia.
  - `trough` (El Valle): Énfasis en osciladores subgraves y filtrado cálido.

---

### 🌍 3. Spots Oceánicos y Generador de Mar Aleatorio
- **`src/data/marineSpots.ts` (Nuevo Módulo):**
  - Lista de spots legendarios con coordenadas reales y descripciones tímbricas:
    - 🌊 **Nazaré (Portugal):** Olas colosales de más de 12 m, tormenta atlántica masiva.
    - 🌺 **Banzai Pipeline (Hawái):** Swell armónico del Pacífico, tubo y sinusoide cristalina.
    - 🏝️ **Teahupo'o (Tahití):** Ola cavernosa sobre arrecife somero con resonancia extrema.
    - 🇦🇷 **Mar del Plata (Argentina):** Marejadas del sur y viento pampero crocante.
    - 🧭 **Point Nemo:** El polo de inaccesibilidad en el Pacífico Sur, calma abisal y pulsaciones profundas.
    - 🇿🇦 **Jeffreys Bay (Sudáfrica):** Paredes kilométricas de alta velocidad.
  - Función `getRandomOceanSpot()` con máscara de exclusión de bloques continentales (`isOceanCoordinate`), garantizando que cualquier punto aleatorio caiga **estrictamente en aguas marinas abiertas**.
- **`src/ui/MiniMap.ts`:**
  - El minimapa mundial ahora es interactivo: al hacer clic en cualquier océano del mapa se teletransportan las coordenadas y se consultan los datos marinos de ese punto en tiempo real.

---

### 🎛️ 4. HUD Explicativo y Panel de Control
- **`src/ui/TelemetryHUD.ts`:**
  - Rediseñado para explicar en lenguaje claro cómo cada variable meteorológica impacta en la onda y en el sonido:
    - *Altura de ola ($H_s$) $\rightarrow$ Amplitud y ganancia del oscilador.*
    - *Período ($T_p$) $\rightarrow$ Frecuencia fundamental y sub-bass.*
    - *Viento $\rightarrow$ Modulación FM (arruga la forma de onda visiblemente).*
    - *Temperatura $\rightarrow$ Brillo y corte de filtro.*
    - *Zona de surf $\rightarrow$ Efecto tímbrico activo en ese instante.*
- **`src/main.ts` & `index.html`:**
  - Panel inferior flotante con:
    - Dropdown estilizado de spots famosos.
    - Botón `🎲 MAR ALEATORIO` de acceso rápido.
    - Sliders de Volumen, Brillo del Filtro y Viento FM.
    - Conmutador `🏄‍♂️ AUTO / MANUAL`.
  - Nueva pantalla de inicio explicativa y controles intuitivos vía mouse (drag horizontal) y teclado (`← →`).

---

### 🧪 5. Verificación y Tests
- Mantenimiento del 100% de la suite de pruebas unitarias (`npm test`):
  - `src/audio/AudioEngine.test.ts` (3/3 pass)
  - `src/ui/OceanCanvas.test.ts` (6/6 pass)
  - `src/mapping/animalToAudio.test.ts` (8/8 pass)
  - `src/mapping/slewLimiter.test.ts` (3/3 pass)
  - `src/data/marineApi.test.ts` (1/1 pass)
  - `src/TrackPlayer.test.ts` (3/3 pass)
- Build de producción con Vite (`npm run build`) verificado con éxito sin advertencias ni errores de tipos.
