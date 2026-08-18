# Video Automation Engine (SaaS Edition)

Este motor asíncrono y modular automatiza por completo la creación de trailers de video inmobiliarios de ultra-lujo a partir de una exportación de datos de Metabase en formato CSV. 

El sistema realiza curaduría de imágenes con IA, genera videos cinemáticos a partir de fotos estáticas, selecciona pistas de audio de forma dinámica y compone una capa gráfica animada usando React (Remotion).

## 🏗️ Arquitectura del Pipeline

El pipeline de producción se divide en 4 fases desacopladas, ejecutadas por `auto.js`:

```
1-ingest-metabase.js  ─►  triage-photos.js  ─►  generate-videos.js  ─►  npx remotion render
 (CSV + fotos + IA)      (curaduría VLM)       (Replicate GenAI)        (overlays finales)
```

1. **Fase 1 (Ingesta):** `1-ingest-metabase.js`
   - Lee el CSV en `./input/propiedad.csv`.
   - Descarga en paralelo las imágenes desde AWS/S3 a `./fotos/`.
   - Resuelve el logotipo de la agencia (`assets/logos/`) con fallback automático y lo copia a la carpeta pública de Remotion.
   - Llama a OpenRouter (`openai/gpt-4o-mini`) para generar el copywriting cinemático en `./motion/src/cinematic-data.json`.
   - Selecciona un track de audio aleatorio de `./assets/musica/` y lo copia como `audio_background.mp3`.

2. **Fase 2 (Curaduría/Triage):** `triage-photos.js`
   - Envía las imágenes en Base64 (optimizadas a 512px con `sharp`) a OpenRouter (`gemini-2.5-flash-lite`) para su clasificación, baneo y puntuación.
   - Selecciona las 6 mejores tomas únicas bajo un criterio estricto de jerarquía y variedad.
   - Guarda el resultado en `./output/selected-photos.json`.

3. **Fase 3 (Generación de Video GenAI):** `generate-videos.js [v1|v2] [kling|pruna|seedance]`
   - Lee `selected-photos.json` y selecciona las 6 fotos ganadoras.
   - **v1**: mejor foto de cada categoría de ambiente.
   - **v2**: segunda mejor foto (A/B testing para variar acabados).
   - Recorta las imágenes a 1280×1280 (1:1) con `sharp`.
   - Consume Replicate con auto-sanación (3 reintentos por toma, sleep de 15s entre fallos).
   - Descarga los clips en `./motion/public/toma_01.mp4` a `toma_06.mp4`.

4. **Fase 4 (Renderizado de Overlays — Remotion):** `npx remotion render`
   - Resolución final: **720×1280** (vertical HD) a **30 fps**.
   - 6 clips × 75 frames = **450 frames totales** (15 segundos).
   - Título cinemático en EB Garamond itálica 4rem con subrayado dorado `#C59B6C`.
   - Frases centradas en EB Garamond regular con sombra de texto.
   - Pin de mapa SVG animado en amarillo Pulppo `#f6be00` con dirección en 3 líneas.
   - Logo de agencia revelado con desenfoque (blur 20→0) + filtro `brightness(0) invert(1)`.
   - Pista de audio de fondo sincronizada.

---

## 🛠️ Requisitos de Instalación

El sistema requiere **Node.js** (v21.7+ recomendado para `process.loadEnvFile()` nativo) y **FFmpeg** instalado globalmente.

### macOS (Homebrew)
```bash
brew install ffmpeg node
```

### Windows (winget / chocolatey)
```bash
winget install ffmpeg  # o: choco install ffmpeg
```

### Inicializar dependencias
```bash
# 1. Dependencias del motor central
npm install

# 2. Compilar binarios de códecs nativos (solo si usas mediabunny)
npm config set ignore-scripts false
npm rebuild node-av

# 3. Dependencias de la capa gráfica de Remotion
cd motion
npm install
cd ..

# 4. Verificar que FFmpeg está disponible
ffmpeg -version
```

---

## 🔐 Configuración del archivo `.env`

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```bash
# ── OpenRouter (IA copywriting + curaduría de fotos) ──
# Obtén tu API key en: https://openrouter.ai/keys
OPENROUTER_KEY=sk-or-v1-tu-api-key-aqui

# ── Replicate (generación de video desde foto) ──
# Obtén tu API key en: https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN=r8_tu-api-key-de-replicate
```

> ⚠️ **Importante:** El archivo `.env` ya está incluido en `.gitignore`. Nunca lo subas al repositorio.

---

## 🚀 Ejecución del Pipeline Completo

### Usar el orquestador (recomendado)
```bash
# Pipeline completo — versión v1 con modelo seedance (por defecto)
node auto.js

# A/B testing — versión v2, modelo pruna
node auto.js v2 pruna

# Versión v1 con modelo kling
node auto.js v1 kling
```

### Ejecutar fases individuales
```bash
# Fase 1: solo ingesta
node 1-ingest-metabase.js

# Fase 2: solo curaduría
node triage-photos.js

# Fase 3: solo generación de video
node generate-videos.js v1 seedance

# Fase 4: solo render de overlays
cd motion && npx remotion render PropertyVideo ../output/resultado_final_pulppo.mp4 --gl=angle
```

### Previsualizar en Remotion Studio
```bash
cd motion && npx remotion studio --no-open
# Abre http://localhost:3000/PropertyVideo
```

---

## 📁 Estructura del Proyecto

```
.
├── auto.js                          # Orquestador del pipeline completo
├── 1-ingest-metabase.js             # Fase 1: CSV, fotos, logos, IA copy, audio
├── triage-photos.js                 # Fase 2: curaduría VLM de fotografías
├── generate-videos.js               # Fase 3: generación de video con Replicate
├── .env                             # API keys (no subir a git)
├── input/
│   └── propiedad.csv                # Exportación de Metabase
├── fotos/                           # Fotos descargadas (git-ignored)
├── output/                          # JSONs intermedios y video final
│   ├── selected-photos.json
│   └── resultado_final_pulppo.mp4
├── assets/
│   ├── logos/                       # Logos de agencias en PNG
│   ├── musica/                      # Pistas .mp3 para background
│   └── dji_dlog_m.cube             # LUT para posproducción D-Log
├── motion/                          # Capa gráfica Remotion
│   ├── public/
│   │   ├── logo_agencia.png         # Logo copiado por Fase 1
│   │   ├── audio_background.mp3     # Pista copiada por Fase 1
│   │   ├── toma_01.mp4 ... 06.mp4   # Videos generados por Fase 3
│   └── src/
│       ├── Root.tsx                 # Entry point Remotion
│       ├── PropertyVideo.tsx        # Orquestador de 6 secuencias
│       ├── CinematicTitleIntro.tsx  # Clip 0: título con overlay + subrayado
│       ├── LocationLowerThird.tsx   # Clips 1-4: frases centradas
│       ├── LogoBlurReveal.tsx       # Clip 5: logo + CTA
│       ├── Watermark.tsx            # Pin de mapa + dirección
│       ├── types.ts                 # Interfaces TypeScript y TIMING
│       └── cinematic-data.json      # JSON generado por Fase 1
├── main.js                          # ⚠️ Legacy — usar auto.js en su lugar
└── render-video.js                  # ⚠️ Legacy — ver Fase 4 en auto.js
```

---

## 🧪 A/B Testing

El pipeline soporta dos versiones para cada propiedad:

| Modo | Selección | Propósito |
|------|-----------|-----------|
| `v1` | Mejor foto de cada categoría | Calidad máxima, imagen más representativa |
| `v2` | Segunda mejor foto de cada categoría | Probar variaciones de ángulo/acabado |

### Modelos de video compatibles

| Flag | Modelo | Velocidad | Calidad |
|------|--------|-----------|---------|
| `seedance` | bytedance/seedance-1.5-pro | ⚡ Rápido | 🟢 Excelente |
| `pruna` | prunaai/p-video | 🔄 Medio | 🟡 Buena |
| `kling` | kwaivgi/kling-v1.6-standard | 🐢 Lento | 🟢 Excelente |

---

## 🔧 Solución de Problemas

### "Prediction failed" en Replicate
El script tiene auto-sanación: reintenta hasta 3 veces con 15s de espera. Si fallan los 3 intentos, el script se detiene con error fatal.

### Rate limiting (HTTP 429)
Replicate aplica rate limits. El script incluye:
- Retry automático leyendo el header `retry-after`.
- Delay de cortesía de 10s entre tomas.
- 3 intentos de auto-sanación con 15s de espera.

### Morphing inicial en los videos
Los videos arrancan en `startFrom={30}` (frame 30 = 1s) para saltar la transición inicial distorsionada de la IA.

### FFmpeg no encontrado
Asegúrate de tenerlo instalado:
```bash
# macOS
brew install ffmpeg
# Windows (PowerShell como administrador)
winget install ffmpeg
```

---

## Créditos

Sistema de automatización de video para Pulppo (https://pulppo.com). Engine creado con Node.js, Sharp, OpenRouter, Replicate, Remotion y FFmpeg. Las pistas de audio son de Epidemic Sound bajo licencia corporativa.
