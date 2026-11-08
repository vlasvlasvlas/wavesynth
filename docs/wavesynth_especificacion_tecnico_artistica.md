# WaveSynth: Oceanographic Wavetable & Surfing Audio Interface
## Documento Técnico-Artístico de Diseño y Arquitectura

---

### Ficha del Proyecto
* **Nombre:** WaveSynth (Sintetizador Oceanográfico de Formas de Onda)
* **Tipología:** Interfaz Sonora Interactiva / Instrumento Web / Arte Generativo Audiovisual
* **Concepto Nuclear:** Un sintetizador basado en telemetría marina en tiempo real (altura de ola, período, viento, swell) donde la forma de onda acústica se manifiesta tridimensionalmente como una ola oceánica explorable, permitiendo al usuario "surfear" físicamente la señal de audio y esculpir su espectro armónico.
* **Ubicación:** Repositorio `wavesynth` (`/docs/wavesynth_especificacion_tecnico_artistica.md`)

---

## 1. Declaración de Misión y Filosofía Estética

**WaveSynth** parte de una premisa poética y matemática radical: **el sonido es una perturbación que viaja a través de un medio elástico, exactamente como una ola en el mar**. La física de fluidos de las ondas de gravedad de Airy o Gerstner y las ondas de presión acústica comparten fundamentos en las ecuaciones diferenciales de ondas.

El proyecto transforma el planeta Tierra en una matriz de osciladores vivos:
1. El usuario puede arrojar un dardo algorítmico al océano global (o elegir puntos de surf míticos).
2. Se consulta la telemetría marina del punto en tiempo real (metros de ola, dirección de swell, período, velocidad de viento Beaufort, temperatura del agua).
3. Estos datos configuran la génesis de un oscilador (su ciclo fundamental, su tabla de ondas y su comportamiento caótico).
4. La forma de onda no se representa como un mero osciloscopio 2D aburrido: **es una ola rompiente 3D calculada en shaders**.
5. El usuario comanda una **tabla de surf (interactor / cursor de audio)** sobre la onda; según la posición relativa (cresta, tubo, labio o base), interactúa como filtro, cabezal de escaneo armónico, modulador de fase y resonador.

---

## 2. Dictamen del Comité de Expertos

Para diseñar esta interfaz con el máximo rigor, se convocó a un comité multidisciplinario de tres expertos:

1. **Dra. Elena M. Thorne** — *Especialista en Procesamiento Digital de Señales (DSP), Acústica Computacional y Sonificación de Datos*.
2. **Mateo Arismendi** — *Director de Arte Interactivo, Shader Artist (GLSL/WebGPU) y Diseñador de Interacción Humano-Computadora*.
3. **Ing. Tatsuya Kenji** — *Ingeniero Oceanográfico de Datos, Especialista en APIs Meteorológicas y Arquitecto Web*.

A continuación se desglosan sus aportes técnicos y conceptuales.

---

```
                                 ┌──────────────────────────────────────────────┐
                                 │              OCEAN TELEMETRY                 │
                                 │    (Open-Meteo Marine / Windy / Copernicus)  │
                                 │   Hs (m), Tp (s), Swell, Wind, Water Temp    │
                                 └──────────────────────┬───────────────────────┘
                                                        │ JSON / Lat-Lon Stream
                                                        ▼
                                 ┌──────────────────────────────────────────────┐
                                 │          OCEAN-TO-DSP MAPPING ENGINE         │
                                 │        (Interpolador & Normalizador)         │
                                 └──────────┬────────────────────────┬──────────┘
                                            │                        │
                     Wavetable & Armónicos  │                        │  Parámetros de Fluido
                                            ▼                        ▼
               ┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
               │         AUDIO ENGINE (DSP)           │    │       VISUAL ENGINE (WebGL/GPU)      │
               │   - AudioWorklet Dynamic Wavetable   │    │   - Gerstner / FFT Wave Mesh         │
               │   - Dual-Osc: Swell + Wind Chaos     │◄──►│   - 3D Water & Foam Shaders          │
               │   - Physical Modeling Foam Noise     │    │   - Real-time Audio Sync Mesh        │
               └──────────────────┬───────────────────┘    └──────────────────┬───────────────────┘
                                  │                                           │
                                  │ Posición en la ola (X, Y, Z)              │ Render de la Ola
                                  │ Filtros, Saturación, Resonancia           │ & Dinámica de Cámara
                                  ▼                                           ▼
                                 ┌──────────────────────────────────────────────┐
                                 │          SURFBOARD CONTROLLER (HCI)          │
                                 │     - Surfear sobre la onda de audio         │
                                 │     - Modulación armónica gestual            │
                                 │     - "Tubo" (Barrel) = Comb/Reverb Filter   │
                                 │     - "Cresta" (Lip) = Wavefolder Distortion │
                                 └──────────────────────────────────────────────┘
```

---

## 3. Experto 1: Motor de Sonido y Síntesis Oceanográfica (DSP)
*Por la Dra. Elena M. Thorne*

### 3.1. Paradigma de Síntesis: Wavetable Dinámica 2.5D + Dual-Oscillator Swell/Wind

Para que el sonido no sea una arbitrariedad de sintetizador genérico con ruido blanco, el modelo sonoro se construye desde la descomposición ondulatoria del mar:

#### A. Oscilador 1: El Swell (Mar de Fondo) — Núcleo Tonal
* El *swell* representa la energía pura generada a miles de kilómetros que viaja organizada en períodos largos y formas sinusoidales casi perfectas.
* **Generación:** Wavetable de ciclo simple sintetizada aditivamente mediante series de Fourier, donde el coeficiente de cada armónico $a_n$ se modela a partir del espectro de energía del oleaje (JONSWAP o Pierson-Moskowitz):
  $$S(\omega) = \frac{\alpha g^2}{\omega^5} \exp\left[ -\beta \left(\frac{\omega_p}{\omega}\right)^4 \right] \gamma^r$$
* **Altura de ola significante ($H_s$):** Define la amplitud general y la ganancia de excitación de saturación no lineal analógica (Soft-clipping tanh).
* **Período de ola pico ($T_p$):** Define la afinación base o la velocidad del LFO macroscópico de modulación tímbrica (subgraves profundos y ciclos lentos de modulación de fase).

#### B. Oscilador 2: Wind Wave (Mar de Viento local) — Caos y Dispersión
* El viento local arruga y rompe la superficie del agua, introduciendo armónicos disonantes, asimetría y turbulencia.
* **Generación:** Modulación de Fase (Phase Modulation / FM) sobre el Oscilador 1 con un índice de modulación $\beta$ indexado a la velocidad del viento en nudos/km/h.
* A mayor viento, la forma de onda sinusoidal pura del *swell* sufre modulación angular agresiva, generando texturas ricas tipo timbres de campana metálica, rugosidad de motor y armónicos pares/impares complejos.

#### C. Micro-Generador de Ruido Marino: Rompiente y Espuma (Sea Spray)
* Un generador granular / noise-shaper filtrado que entra en juego solo cuando la relación entre la altura de ola y la longitud de onda supera el criterio de rotura de Stokes ($H/\lambda > 0.142$):
* Genera ráfagas estocásticas de ruido rosa con filtrado pasa-altos dinámico que responde a la posición del surfista al cortar el labio (*lip*) de la ola.

### 3.2. Matriz de Mapeo Oceanográfico a Parámetros Acústicos

| Parámetro Marino | Rango Típico | Destino DSP en WaveSynth | Resultado Acústico |
| :--- | :--- | :--- | :--- |
| **Wave Height ($H_s$)** | 0.2 m — 18.0 m | Ganancia de entrada a etapa de saturación cálida + Sub-bass boost | De un zumbido sutil y prístino a una pared de sonido densa, saturada y con graves tectónicos. |
| **Peak Period ($T_p$)** | 4.0 s — 24.0 s | Frecuencia de barrido de tabla de ondas y LFO de modulación espacial | Olas cortas = pulsaciones rápidas y nerviosas; Olas de 18s = respiraciones armónicas lentas y colosales. |
| **Wave Direction ($\theta$)** | 0° — 360° | Panning estéreo binaural / Rotación de fase (Haas Effect) | Localización espacial inmersiva del campo sonoro que rota alrededor de la cabeza del oyente. |
| **Wind Speed (kts)** | 0 — 65 kts | Cantidad de FM / Foldback Distortion y volumen del generador de aerosol (*spray*) | Aire limpio y tono puro en calmas chichas; zumbidos saturados, ásperos y efervescentes en vendavales. |
| **Water Temp ($T_w$)** | 1 °C — 32 °C | Frecuencia de corte (*Cutoff*) de filtro low-pass y resonancia (*Q*) | Aguas polares árticas = brillo cortante, cristalino y metálico; Aguas tropicales ecuatoriales = sonido filtrado, orgánico, sedoso y cálido. |
| **Tide / Marea** | Pleamar / Bajamar | Detune espectral y chorus de coro flotante | Desplazamientos sutiles de pitch que crean batimentos (*beating*) hipnóticos. |

---

## 4. Experto 2: Interfaz Visual, Física del Surf y Experiencia Intermitente (Arte & UX)
*Por Mateo Arismendi*

### 4.1. El Concepto Visual: La Ola como Osciloscopio Vivo y Escultura 3D

La pantalla no es un panel estático de perillas tradicionales. Es una rompiente oceánica tridimensional en perspectiva oblicua/cinematográfica renderizada con **Three.js / WebGL (o WebGPU)**:

1. **La Malla de la Ola (Audio-Reactive Mesh):**
   * La geometría de la ola se calcula en un *Vertex Shader* combinando la ecuación de **Olas de Gerstner** modificadas:
     $$x = x_0 - \sum \frac{k_i}{|k_i|} A_i \sin(k_i \cdot x_0 - \omega_i t)$$
     $$y = y_0 + \sum A_i \cos(k_i \cdot x_0 - \omega_i t)$$
   * **El giro fundamental:** El buffer de audio en tiempo real del AudioWorklet inyecta datos de desplazamiento de vértices directos en el shader. **La forma de onda del sonido es literalmente la cresta de la ola que se ve en pantalla**.
   * Si el usuario modifica los armónicos, la cresta se vuelve más picuda, se quiebra o se ondula con múltiples crestas armónicas visibles.

2. **La Metáfora del Surfista ("Surfear la Señal"):**
   * Sobre la ola flota una tabla de surf estilizada (con estética vectorial retro-futurista o minimalista contemporánea).
   * El usuario controla la tabla con el puntero del mouse, trackpad, pantalla táctil, sensor giroscópico o controlador MIDI.
   * **Zonas de Interacción Tímbrica según la Posición del Surf:**
     * **El Tubo (The Barrel / Inside the Pocket):** Al posicionar la tabla dentro del cilindro de la ola, el audio pasa por un filtro peine resonante (*Comb Filter*) y una reverberación convolutiva de espacio hueco/cavernoso (como escuchar el rugido dentro del tubo de agua).
     * **El Labio / La Cresta (The Lip):** En la zona más alta donde la ola quiebra, la tabla activa un *wavefolder* y saturación de agudos extrema. Cada giro o recorte (*snap*) genera chisporroteo de armónicos y micro-ruido de espuma.
     * **La Base (The Trough / Bottom Turn):** En la parte plana inferior, se activan los sub-osciladores y el filtro pasa-bajos, enfatizando el peso gravitatorio del sonido.
     * **La Pared (The Face / Shoulder):** Zona de modulación limpia donde la tabla puede deslizarse suavemente de izquierda a derecha para actuar como *wavetable position morpher* continuo.

3. **La Interfaz de la "Tablita de Surf" (Harmonic Fin Controls):**
   * La quilla de la tabla o un control flotante lateral estilizado permite afinar:
     * **Quillas (Fins):** Selector de escala/modo armónico (Microtonal, Dórico marino, Pentatónico oceánico, Armónicos naturales puros).
     * **Tail Shape (Cola de la tabla: Pin-tail, Fish, Swallow):** Modifica la respuesta al impulso y la curva de decaimiento del sintetizador (envolvente ADSR).

4. **Dirección de Arte y HUD (Head-Up Display):**
   * Estética: Minimalismo náutico / Cartografía marina oscura (*Dark Oceanic HUD*).
   * Paleta: Azules abisales profundos (`#020b14`), cian bio-luminiscente (`#00f5d4`), blanco de espuma marina (`#f0fdfa`) y acentos de boya de rescate ámbar (`#ff9f1c`).
   * **Telemetría en Vivo visible en pantalla:**
     * Nombre geográfico de la masa de agua (ej. *"Pacific Ocean, 450 km off Maui"* o *"Biscay Bay, Spot: Mundaka"*).
     * Coordenadas exactas: Latitud / Longitud.
     * Medidores analógicos-digitales de Altura de Ola, Período, Nudos de Viento y Dirección del Swell.

---

## 5. Experto 3: Arquitectura de Datos, APIs Marinas y Telemetría Global
*Por el Ing. Tatsuya Kenji*

### 5.1. Selección y Pipeline de APIs Meteorológicas y Marinas

Para garantizar disponibilidad sin costos prohibitivos de suscripción y con cobertura global fiable:

```
[Cliente Web / WaveSynth]
       │
       ▼
[Edge Worker / API Proxy (Hono/Cloudflare/Vercel)]
       │
       ├──► 1. Reverse Ocean Masking (Check: ¿Las coordenadas están en agua?)
       │
       ├──► 2. API Primaria: Open-Meteo Marine Weather API (Gratis, sin API key, modelos ECMWF & GFS)
       │         Endpoint: https://marine-api.open-meteo.com/v1/marine
       │         Variables: wave_height, wave_period, wave_direction, swell_wave_height,
       │                    swell_wave_period, wind_wave_height, wind_wave_period
       │
       ├──► 3. API Secundaria (Viento/Clima): Open-Meteo Weather API
       │         Endpoint: https://api.open-meteo.com/v1/forecast
       │         Variables: wind_speed_10m, wind_direction_10m, temperature_2m
       │
       └──► 4. Respaldo / Fallback: Modelos sintéticos basados en boyas NOAA pregrabadas
```

### 5.2. El Algoritmo de "Random Ocean Drop" (Asegurar Caer en el Mar)

Un problema común al elegir coordenadas aleatorias en un globo terráqueo es que el 29% es tierra firme, donde las APIs de olas fallan o devuelven valores nulos.

**Estrategia en 2 capas para WaveSynth:**
1. **Librería de Puntos Notables (Curated Spots):**
   * Presets con más de 100 rompientes legendarias de surf y boyas oceanográficas mundiales:
     * *Teahupo'o (Tahití)* — Olas pesadas de tubo cavernoso.
     * *Nazaré (Portugal)* — Gigantes oceánicos de más de 15 metros.
     * *Pipeline / North Shore (Hawái)* — Olas armónicas perfectas.
     * *Puerto Escondido (México)* — Tubos rápidos de alta energía.
     * *Point Nemo (Océano Pacífico Sur)* — El punto más aislado del planeta, silencio abisal.
2. **Generador Aleatorio con Geo-Máscara de Tierra/Agua (Land Mask Filter):**
   * Se utiliza una cuadrícula binaria en memoria (vectorial simplificada de 110m de *Natural Earth*) o una función matemática rasterizada de bajo peso (15 KB):
   ```typescript
   function getRandomOceanCoordinates(): { lat: number; lon: number } {
     let inWater = false;
     let lat = 0, lon = 0;
     while (!inWater) {
       // Distribución equitativa esférica (Lambert)
       lon = Math.random() * 360 - 180;
       lat = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI);
       
       // Excluir casquetes polares extremos si no tienen datos
       if (lat > 75 || lat < -70) continue;
       
       // Consulta a la máscara binaria compilada
       inWater = oceanMaskLookup(lat, lon);
     }
     return { lat, lon };
   }
   ```

### 5.3. Pipeline de Suavizado y Normalización (Audio Interpolation)

Los datos meteorológicos marinos se actualizan cada 1 a 3 horas, pero el sintetizador opera a 48,000 muestras por segundo (48 kHz). Al cambiar de punto o refrescar datos:
* **Problema:** Un cambio brusco de parámetros meteorológicos provocaría "pops" y "clicks" digitales de audio desagradables.
* **Solución:** Los parámetros entrantes pasan por un motor de interpolación temporal (*slew-rate limiter / low-pass smoothing filter de 500ms a 2s*) dentro del `AudioWorkletNode`, garantizando transiciones orquestales elegantes entre tormentas de Nazaré y calmas del Mediterráneo.

---

## 6. Arquitectura Técnica de Software

### 6.1. Stack Tecnológico Sugerido

* **Frontend Framework:** TypeScript + SvelteKit / React / Vite (mínima sobrecarga de runtime).
* **Motor Gráfico (3D):** Three.js con Shaders GLSL personalizados o WebGPU (wgsl) para cómputo de olas masivo en paralelo.
* **Motor de Audio:** Web Audio API nativo con arquitectura **AudioWorklet** (ejecución en hilo de audio dedicado de alta prioridad, libre de bloqueos de la UI de JavaScript).
* **Formatos de Exportación:**
  * Grabación directa a WAV/FLAC en navegador.
  * Exportador de **archivos de Wavetable (.wav)** compatibles con sintetizadores populares de hardware y software (Serum, Vital, Korg wavestate, Ableton Wavetable).
* **Soporte de Control:** MIDI Web API (compatibilidad plug-and-play con perillas físicas, pedales de expresión o superficies táctiles).

### 6.2. Diagrama de Módulos del Sistema

```
/src
├── audio/
│   ├── WaveSynthNode.ts          # Wrapper principal del AudioWorklet
│   ├── worklet/
│   │   ├── OceanicOscillator.ts  # Generador de tabla de ondas y aditivo
│   │   ├── FluidFilterBank.ts    # Comb-filters, Wavefolder y Lowpass
│   │   └── SprayGenerator.ts     # Ruido estocástico modelado
│   └── tables/
│       └── FourierWaveBuilder.ts # Conversión de espectros marinos a wavetables
├── visual/
│   ├── OceanScene.ts             # Setup de Three.js (Cámara, luces, agua)
│   ├── shaders/
│   │   ├── gerstnerWave.vert.glsl# Desplazamiento reactivo de vértices
│   │   └── waterCaustics.frag.glsl# Shader de agua profunda y espuma
│   └── entities/
│       └── Surfboard.ts          # Entidad interactiva que surfea la onda
├── ocean/
│   ├── marineApi.ts              # Cliente Open-Meteo Marine & Windy
│   ├── oceanMask.ts              # Detección y validación de agua/tierra
│   └── spotsDatabase.ts          # Presets de olas mundiales (Pipeline, etc.)
└── ui/
    ├── TelemetryHUD.svelte       # Medidores náuticos y datos en tiempo real
    ├── WaveformPreview.svelte    # Osciloscopio analítico complementario
    └── FinControls.svelte        # Controles tímbricos de la "tabla"
```

---

## 7. Interacciones del Usuario: Cómo se Experimenta WaveSynth

1. **Modo Exploración Global ("Drop in the Ocean"):**
   * El usuario pulsa un botón con forma de sonar: el globo terráqueo rota a gran velocidad y la aguja cae en medio del Atlántico Sur en plenos "Rugientes Cuarenta" (*Roaring Forties*).
   * La interfaz muestra: *Lat -48.2°, Lon -32.1° | Olas de 8.4 metros | Viento de 45 nudos | Período de 16 segundos*.
   * Instantáneamente, los osciladores rugen con un timbre masivo, grave, oscuro y cargado de armónicos turbulentos.
   * La ola 3D se eleva en la pantalla como una pared de agua oscura.

2. **Acción de Surfear la Onda:**
   * El usuario arrastra el cursor; la tabla se acomoda en la pared de agua.
   * Al descender a la base (*bottom turn*), el sonido cobra un subgrave denso que retumba.
   * Al remontar la cresta y cortar la ola (*top turn / off the lip*), el audio cruje en una distorsión luminosa y un siseo de spray stereo brillante.
   * Al deslizarse dentro del tubo (*getting barreled*), todo el sonido se vuelve hipnótico, filtrado por un resonador hueco que recrea la acústica de una caverna líquida en movimiento.

3. **Modo "Diseñador de Timbres" (Wave Shaper Fin):**
   * El usuario puede fijar la posición de la tabla y usar perillas de "quillas" para alterar armónicos, sumar octavas, invertir fases o congelar (*freeze*) el ciclo de ola marina en un bucle rítmico infinito.

---

## 8. Roadmap de Implementación Sugerido

### Fase 1: Núcleo DSP y Fetcher Marino (Semanas 1-2)
* Implementar el cliente para Open-Meteo Marine API.
* Crear la base de datos de 20 spots de surf icónicos.
* Desarrollar el `AudioWorklet` con síntesis de wavetable dinámica y asignación de parámetros de oleaje a frecuencias y armónicos fundamentales.

### Fase 2: Visualizador 3D Reactivo de la Ola (Semanas 3-4)
* Desarrollar la escena Three.js con malla de olas de Gerstner.
* Conectar el analizador de audio (`AnalyserNode` / buffer circular del worklet) con los atributos de vértices en los shaders GLSL.
* Diseñar la estética visual náutica oscura / bio-luminiscente.

### Fase 3: Mecánica de la Tabla de Surf e Interacción Tímbrica (Semanas 5-6)
* Programar la física del cursor de la tabla sobre la superficie de la ola.
* Mapear la coordenada relativa de la tabla a los efectos de audio (Comb filter en tubo, Wavefolder en cresta, Low-pass en la base).
* Soporte para control con mouse, multitouch y acelerómetro de dispositivos móviles.

### Fase 4: Telemetría Global, Presets y Exportación (Semanas 7-8)
* Algoritmo de punto aleatorio oceánico con máscara de tierra.
* HUD completo de telemetría meteorológica marina en tiempo real.
* Grabador estéreo directo a WAV y exportador de tablas de ondas (.wav) para DAWs.

---

## 9. Conclusión del Comité

**WaveSynth** une de forma orgánica la sonificación de datos científicos con la emoción física del surf y la luthería digital de vanguardia. La onda deja de ser una abstracción matemática invisible en un DAW para convertirse en una fuerza natural palpable, viva e interactiva, enraizada en las condiciones exactas en que el viento y los mares se mueven por la Tierra en este preciso instante.