# WaveSynth: Oceanographic Wavetable & Surfing Audio Interface
## Documento Técnico-Artístico de Diseño y Arquitectura

**Versión:** 2.0 — revisión conceptual, FODA y dimensión de profundidad (8 de noviembre de 2026).

> **Nota editorial:** las secciones 1–9 preservan la propuesta original como antecedente. Las secciones 10–22 constituyen la revisión vigente y prevalecen cuando existen contradicciones técnicas o conceptuales. Los nombres del comité original representan perspectivas de especialistas simulados, no una consulta a personas reales.

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

---

# REVISIÓN INTEGRAL V2 — COMITÉ DE TRES PERSPECTIVAS

## 10. Diagnóstico y nueva definición

### 10.1. Comité de revisión (roles simulados)

1. **Composición y DSP:** ¿es musicalmente expresivo, más allá de una demostración de efectos?
2. **Arte interactivo y UX:** ¿la metáfora de surfear permite tocar, aprender y desarrollar técnica?
3. **Oceanografía y arquitectura web:** ¿los datos y el modelo físico están bien interpretados y el sistema es robusto?

Evaluación inicial orientativa (juicio de diseño, no medición): música **7/10**, interacción **8/10**, arquitectura/ciencia **6/10**.

### 10.2. Definición revisada

**WaveSynth es un instrumento web de síntesis sonora cuya estructura y evolución están condicionadas por estados oceanográficos, y cuya interpretación se realiza mediante gestos de navegación sobre una ola dinámica.**

Tres niveles diferenciados:

| Nivel | Responsabilidad | Agencia |
|---|---|---|
| Océano | Establece condiciones, límites y evolución lenta | Datos medidos/modelados o simulación |
| Motor sonoro | Convierte esas condiciones en un campo de posibilidades acústicas | Algoritmos DSP |
| Intérprete | Modifica, excita y reorganiza ese campo | Gestos del usuario |

**Decisión:** adoptar un instrumento de **acoplamiento bidireccional controlado**: el océano influye en el sonido y los gestos modifican tanto el sonido como la ola *virtual*; nunca se afirma que alteran el océano físico.

### 10.3. Precisión científica

- Las olas de gravedad oceánicas y las ondas acústicas comparten formalismos ondulatorios, pero **no son equivalentes físicamente**.
- Un espectro de oleaje JONSWAP distribuye energía según frecuencias oceánicas; **no es directamente un espectro de armónicos audibles**. Hace falta una función de transposición y mapeo artístico explícita.
- La relación H/λ ≈ 0,142 no debe emplearse como detector universal de rompiente: la rotura depende, entre otras cosas, de profundidad, pendiente y evolución local.
- «Live» significa **último dato/modelo disponible con sello temporal**, no lectura instantánea del océano. No inventar observaciones o precisión.
- La forma de onda de audio a kHz no puede mostrarse literalmente como la geometría lenta de una ola marina sin declarar una transformación de escala.

## 11. Identidad sonora: cuatro capas

| Capa | Origen conceptual | Síntesis sugerida | Función musical |
|---|---|---|---|
| **Swell** | Mar de fondo | Wavetable/aditiva, osciladores afinados | Centro tonal y armónicos |
| **Surface** | Mar local y oleaje corto | AM/FM/PM suave, moduladores | Movimiento, pulsación, fricción |
| **Foam** | Rompiente y espuma | Ruido filtrado, granular, transitorios | Acentos y textura |
| **Depth** | Columna de agua y espacio abisal | Resonadores, subarmónicos, filtros, delays | Cuerpo, profundidad y memoria |

La capa **Depth** es una traducción artística, no una emulación física automática del sonido submarino. Los cuatro componentes pueden funcionar juntos, con mezcla controlada y límites de nivel.

**Comportamiento temporal:** cada capa tiene estado, envolvente, respuesta al gesto y memoria de eventos. El timbre no depende exclusivamente de una posición estática.

## 12. Gramática de interacción: posición + velocidad + trayectoria

| Variable gestual | Significado | Destinos musicales posibles |
|---|---|---|
| Posición relativa sobre la ola | Región que se explora | Wavetable scan, mezcla, filtros |
| Velocidad | Intensidad del movimiento | Excitación, densidad de transitorios, modulación |
| Aceleración y cambio de dirección | Maniobra | Golpes, acentos, impulsos de resonador |
| Trayectoria acumulada | Historia del gesto | Estela armónica, inercia, energía retenida |
| Tiempo de permanencia | Sostener una decisión | Resonancia, acumulación, transformación lenta |
| Pausa | Dejar actuar al océano | Decaimiento, respiración, escucha |

Zonas: **base** (fundamentales y peso), **pared** (morphing armónico), **cresta** (brillo/excitación), **tubo** (comb/resonancias y realimentación limitada). Las zonas no son efectos obligatorios uno-a-uno: se interpolan para evitar escalones.

**Memoria gestual:** energía con decaimiento, eventos recientes y dirección anterior. La misma posición puede sonar distinta según la trayectoria de llegada. Debe existir un botón **Reset gesture**.

**Principio de diseño:** no basta con disfrazar un controlador XY de surf; el instrumento debe responder a maniobras, historia e inercia.

## 13. Profundidad del océano: dimensión nueva y fundamental

«Profundidad» debe desambiguarse en **dos parámetros distintos**:

1. **Profundidad del fondo (batimetría, `bottom_depth_m`)**: distancia aproximada desde el nivel de referencia del mar hasta el lecho oceánico en el punto seleccionado. Es una propiedad geográfica, relativamente estable; puede proceder de una grilla batimétrica con resolución y fecha conocidas.
2. **Profundidad de inmersión del intérprete (`dive_depth_m`)**: profundidad *virtual* a la que el usuario desciende en la columna de agua. Es un control expresivo que cambia en tiempo real y debe acotarse entre 0 y la profundidad local disponible (con margen). No representa un buceo físico real.

**No confundir** profundidad con altura de ola, nivel de marea ni posición vertical sobre la ola. También conviene separar la **profundidad efectiva de agua** (`water_depth_m`, cuando existe nivel del mar/marea) de la batimetría estática.

### 13.1. ¿Qué aporta la batimetría al instrumento?

| Fondo | Lectura oceanográfica | Traducción sonora propuesta (artística) | Consecuencia visual |
|---|---|---|---|
| Plataforma somera | El fondo puede modificar propagación y rompiente | Más eventos de rompiente, resonancias cortas, textura | Fondo cercano y visible |
| Talud continental | Transición pronunciada | Cambios graduales de densidad, resonancia y tensión | Pendiente submarina |
| Cuenca profunda | Menor influencia directa del fondo sobre olas superficiales cortas | Espacios largos, capas graves y reverberación diseñada | Vacío y escala abisal |
| Fosa | Profundidad extrema | Subarmónicos, silencio relativo, resonadores lentos | Oscuridad, distancia y capas |

**Advertencia:** «más profundo = más grave» es un cliché insuficiente. La batimetría debe alterar **estructura, tiempos y límites del sistema**, no solo el pitch o un low-pass. El diseño no debe insinuar que las fosas generan automáticamente sonidos más graves en la realidad.

### 13.2. Profundidad de inmersión como gesto musical

Propuesta: incorporar una segunda dimensión de ejecución, **Surf / Dive**. El intérprete puede navegar sobre la superficie y **sumergirse** bajo ella.

- **Superficie (0 m virtuales):** capas Swell/Surface/Foam presentes, alta definición de transitorios.
- **Zona media:** la espuma se atenúa progresivamente, crecen resonancias, modulación lenta y sensación de distancia.
- **Zona profunda:** la superficie se vuelve remota; aparecen drones, retardos, memoria larga y espacios de silencio.
- **Ascenso:** recupera material superficial; un ascenso rápido puede excitar transitorios y liberar energía acumulada.
- **Fondo:** al acercarse al lecho, activar una interacción específica de «contacto» (resonador/impulso), con amortiguación para evitar golpes de volumen.

No asumir que un filtro low-pass reproduce fielmente la acústica subacuática; es una **convención perceptiva** de interfaz.

### 13.3. Reglas de mapeo recomendadas

Definir `depth_ratio = clamp(dive_depth_m / max(bottom_depth_m, epsilon), 0, 1)` para representar cercanía relativa al fondo, pero **no usarla sola**: 10 m en una plataforma de 20 m y 5.000 m en una fosa de 10.000 m tienen igual ratio y experiencias físicas muy distintas. Combinar:

- `depth_abs_norm = log1p(dive_depth_m) / log1p(max_depth_reference_m)` (profundidad absoluta, saturada).
- `bottom_proximity = 1 - clamp((bottom_depth_m - dive_depth_m) / proximity_range_m, 0, 1)` (proximidad al fondo).
- `bathymetry_norm = log1p(bottom_depth_m) / log1p(max_depth_reference_m)` (carácter del lugar).

Mapear estas señales a **mezcla de capas, tiempos de decaimiento, densidad, resonancia y campo espacial**, con curvas editables y suavizado. No convertir profundidad en ganancia de subgrave sin control de seguridad.

### 13.4. Diseño de control y visualización

**MVP:** una única tecla modificadora + desplazamiento vertical o rueda para `Dive`; mouse/trackpad para surf. Alternativa accesible: deslizador vertical **Depth** siempre visible, operable por teclado y táctil. Mostrar claramente **profundidad del fondo** y **profundidad actual de inmersión** en metros virtuales. En mar abierto profundo permitir escalas no lineales (metros cerca de superficie, saltos mayores a gran profundidad).

Visualización: sección transversal simplificada con superficie, surfista/sonda, columna de agua y fondo; al descender cambia el encuadre. En el MVP, priorizar 2.5D legible sobre simulación volumétrica costosa. Incluir un modo sin movimiento excesivo.

### 13.5. Fuentes y ausencia de datos

Los endpoints meteorológicos marinos **no garantizan batimetría**. Integrar una fuente geográfica separada (por ejemplo, grillas públicas GEBCO o EMODnet según cobertura/licencias y método de acceso), idealmente mediante mosaicos precalculados o un servicio propio con caché. Verificar atribución, resolución, cobertura, datum y condiciones de uso antes de implementar. No atribuir a Open-Meteo una variable de profundidad de fondo que no se haya verificado.

Si la batimetría falta: etiquetar **«profundidad desconocida»**, usar un perfil sintético explícito o desactivar la proximidad al fondo; **nunca inventar un valor como dato real**. Para el modo Synthetic Ocean, sí se puede crear un fondo virtual.

### 13.6. Interacción de oleaje y fondo

En aguas someras, la relación entre longitud de onda y profundidad importa. Una aproximación lineal útil para una componente es la relación de dispersión `omega² = g * k * tanh(k*h)`; para agua profunda `tanh(k*h) ≈ 1`, para agua somera `tanh(k*h) ≈ k*h`. Aplicarla solo donde corresponda, documentando límites (no linealidad, refracción, rompiente, topografía compleja). La generación artística de espuma/rompiente debe usar un **índice heurístico** calibrable, no un umbral físico universal.

## 14. Modelos de interpretación musical

| Modelo | Ventaja | Riesgo |
|---|---|---|
| Drone continuo | Inmersión inmediata | Monotonía |
| Melódico afinado | Control de notas/escalas | Convertirse en theremín convencional |
| Excitación por gestos | Expresividad y percusión | Curva de aprendizaje |
| **Híbrido recomendado** | Drone + eventos afinados + resonancias | Requiere balance cuidadoso |

**Decisión de diseño:** un fondo sonoro continuo con eventos que surgen al girar, acelerar, cruzar crestas, sumergirse, tocar el fondo o emerger. Incorporar cuantización opcional (apagada/cromática/escala), nota raíz, octava, control de intensidad y silencio; no imponer una escala «oceánica» como si fuera científica.

## 15. Visualización multiescala y sincronización

| Escala | Qué muestra | Cadencia |
|---|---|---|
| Macro | Oleaje y fondo marino | Segundos |
| Meso | Envolventes, energía, estelas | Decenas/centenas de ms |
| Micro | Señal acústica real, espectro y armónicos | Análisis de audio |

La ola 3D **no es literalmente el buffer de audio**. La geometría macroscópica y los detalles reactivos reciben parámetros derivados de un estado compartido; un osciloscopio/analizador muestra el audio real. El flujo principal va del **estado central** a audio y visual, con retroalimentación gestual estabilizada. Evitar un bucle directo de audio a geometría a audio sin limitadores.

## 16. Modos de datos y procedencia

1. **Ocean Live:** últimos modelos/observaciones disponibles, con proveedor, timestamp, resolución, variables y tipo de dato visibles.
2. **Ocean Archive:** reproducir estados históricos si la fuente y licencia lo permiten.
3. **Synthetic Ocean:** generar océanos imposibles, congelar estados y mezclar perfiles; siempre señalizados como sintéticos.

Datos normalizados: `Hs`, `Tp`, dirección de ola, altura/período del swell, viento, temperatura del agua si disponible, marea si disponible, `bottom_depth_m` y calidad/procedencia. Cada campo puede ser `null` y debe tener política de fallback. Evitar prometer disponibilidad mundial o precisión costera uniforme.

### 16.1. Controles de laboratorio

Presets **Calma / Mar moderado / Tormenta / Plataforma somera / Talud / Fosa**. Funciones **Freeze**, **Morph entre dos océanos**, **Reset**, **Seed reproducible**, **A/B** entre perfiles. Los presets no son afirmaciones de condiciones actuales.

## 17. Arquitectura V2

```text
  [Marine API]       [Bathymetry source]       [Synthetic presets]
       |                    |                         |
       +--------------------+-------------------------+
                            v
                 [OCEAN STATE + provenance]
                            |
                  [Normalization / smoothing]
                            |
               +------------+-------------+
               |                          |
               v                          v
        [Wave/Depth Model]           [Sound Model]
               |                          |
               v                          v
         [2.5D / 3D View]         [AudioWorklet DSP]
               ^                          ^
               |                          |
         [Surf + Dive Controller]----------+
                       |
                [Gesture Memory]
                       |
             [Bounded feedback state]
                       +------> Wave/Depth + Sound models
```

**Principios:** estado tipado compartido; separación entre datos reales y parámetros musicales; audio desacoplado del render; suavizado sin clicks; límites de feedback; caché/fallback offline; compatibilidad progresiva con navegadores.

Ejemplo de contrato (orientativo):

```ts
type Provenance = { source: string; observedAt?: string; forecastFor?: string; synthetic: boolean };
type OceanState = {
  lat: number | null; lon: number | null;
  waveHeightM: number | null; peakPeriodS: number | null;
  swellDirectionDeg: number | null; windSpeedMS: number | null;
  waterTemperatureC: number | null; tideLevelM: number | null;
  bottomDepthM: number | null; // bathymetry, separate source
  provenance: Record<string, Provenance>;
};
type PerformanceState = {
  surfU: number; surfV: number;
  diveDepthM: number; velocity: number; acceleration: number;
  gestureEnergy: number; freeze: boolean;
};
```

## 18. FODA revisado

### Fortalezas
- Metáfora inmediata: **«un sintetizador que se toca surfeando una ola»**.
- Conexión entre datos planetarios, síntesis y gesto musical.
- Identidad visual singular y acceso web sin instalación.
- Posibilidad de performances, instalaciones y educación sobre ondas.
- La **profundidad** añade una dimensión vertical y temporal diferenciadora.

### Oportunidades
- Instalaciones audiovisuales, interpretación colaborativa y control MIDI/sensores.
- Archivo de paisajes sonoros geográficos e históricos.
- Exportación de audio, presets y wavetables (según compatibilidad verificada).
- Experiencias Surf/Dive para explorar plataforma, talud y fosa.
- Accesibilidad y modo 2D como alternativa a visualización 3D intensiva.

### Debilidades
- Mapeos triviales («más altura = más volumen», «más profundidad = más grave»).
- Riesgo de que la estética visual domine a la música.
- Falta de un sistema afinado, memoria gestual y gramática de interpretación.
- Ambigüedad entre batimetría real, profundidad de inmersión y altura de ola.
- Complejidad de shaders, DSP, telemetría y datos de fondo simultáneos.

### Amenazas
- Latencia, clicks, sobrecarga CPU/GPU, feedback inestable y niveles excesivos.
- Datos costeros de baja resolución, fuentes caídas y falsa sensación de «tiempo real».
- Curva de aprendizaje y controles que resulten poco expresivos.
- Confusión entre representación artística y simulación científica.
- Sobredesarrollo antes de validar la experiencia instrumental.

### Matriz de respuesta

| Riesgo crítico | Mitigación verificable |
|---|---|
| Visualización vistosa sin instrumento | Test de 10 minutos con audio y visuales separados |
| Mapeos poco expresivos | Probar posición vs. gesto con y sin memoria |
| Profundidad confusa | Mostrar «fondo» y «inmersión» como controles distintos |
| Dependencia de datos | Presets offline, procedencia, `null` explícitos |
| Audio inestable | Limitador, techo de feedback, rampas y pruebas de clipping |
| Coste gráfico | MVP 2.5D y degradación de calidad |

## 19. Prototipo prioritario (MVP)

**Objetivo:** responder «¿es interesante tocar esta ola durante diez minutos?» antes de invertir en océano 3D, API global y exportadores.

**Incluye:**
1. Una ola estilizada 2.5D y un perfil de fondo visible.
2. Control Surf con mouse/trackpad y control Dive con teclado/deslizador.
3. Tres presets marinos (**Calma, Moderado, Tormenta**) y tres perfiles de fondo (**Somero, Talud, Profundo**).
4. Tres capas sonoras mínimas: oscilador tonal, modulador, resonador con memoria; añadir Foam como eventos simples si el rendimiento lo permite.
5. Interacción por posición, velocidad, giro, permanencia y profundidad.
6. Un selector de nota raíz/escala opcional, volumen, mute y reset.
7. Indicadores de `bottomDepth` y `diveDepth` separados; osciloscopio simple.
8. Audio seguro: gain staging, limitador y sin reproducción automática.

**No incluye inicialmente:** API de batimetría en vivo, modelado hidrodinámico avanzado, globo 3D, exportación, MIDI, multijugador ni simulación de fluidos.

### Pruebas de aceptación

- Un gesto rápido y uno lento en la misma posición producen resultados distinguibles.
- Una trayectoria circular y una recta dejan memorias sonoras distintas.
- Sumergirse y emerger cambian la composición, no solo el volumen o cutoff.
- Cambiar de plataforma somera a fosa cambia la organización temporal/espectral sin depender solo de graves.
- El instrumento puede usarse sin mirar la pantalla durante intervalos breves.
- No aparecen clicks ni picos peligrosos al cambiar presets o profundidad.
- El usuario entiende la diferencia entre **fondo** y **posición de inmersión**.

## 20. Roadmap actualizado y prioridades

| Fase | Entrega | Criterio de avance |
|---|---|---|
| 0 — Diseño | Matriz de mapeos + prototipos de audio | Sonidos y gestos distinguibles |
| 1 — Instrumento mínimo | DSP + Surf/Dive 2.5D + memoria | Sesión musical sostenida de 10 min |
| 2 — Profundidad | Batimetría sintética, fondo e inmersión separados | Cambios expresivos y comprensibles |
| 3 — Datos reales | Marine API + batimetría geográfica + procedencia | Fallback robusto, sin datos inventados |
| 4 — Visual | Ola 3D multiescala, optimización | Sin comprometer audio |
| 5 — Performance | MIDI, presets, grabación/exportación | Reproducibilidad y estabilidad |
| 6 — Investigación | Dos intérpretes, morph de océanos, archivo | Validación artística |

Los plazos del roadmap original son estimativos, no compromisos. Priorizar resultados de prueba antes que semanas prefijadas.

## 21. Decisiones abiertas para el comité

1. **Control Dive:** ¿inmersión libre continua, niveles discretos o ambas?
2. **Profundidad:** ¿batimetría como carácter fijo del lugar, como modulador dinámico o ambos?
3. **Modelo musical:** ¿drone híbrido por defecto y modo melódico opcional?
4. **Memoria:** ¿qué se conserva tras cambiar de océano o emerger?
5. **Feedback:** ¿cuánto puede deformar el surfista la ola virtual antes de volver a su estado natural?
6. **Escala visual:** ¿sección lateral 2.5D, perspectiva oblicua o cámara sumergible?
7. **Afinación:** ¿cromática, escalas seleccionables, microtonal o libre?
8. **Datos:** ¿qué resolución batimétrica es aceptable para cada escala geográfica?

## 22. Dictamen final

La prioridad no es representar un océano fotorrealista: es construir **un instrumento que permita interpretar el océano y, dentro de la simulación, transformarlo recíprocamente**.

La incorporación de la profundidad fortalece el concepto si se trabaja en dos planos: **el relieve real o sintético del fondo define el carácter del lugar; la inmersión del intérprete añade una nueva técnica gestual**. Junto con la memoria de trayectorias y las cuatro capas sonoras, esto permite una gramática musical que no se reduce a mover un filtro sobre una ola.

**Principio rector:** océano → ola y columna de agua → gesto Surf/Dive → sonido → modificación acotada de la ola virtual. La música debe seguir siendo interesante incluso con los gráficos desactivados.
