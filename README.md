# Video Automation Engine (SaaS Edition)

Este motor asíncrono y modular automatiza por completo la creación de trailers de video inmobiliarios de ultra-lujo a partir de una exportación de datos de Metabase en formato CSV. 

El sistema realiza curaduría de imágenes con IA, genera videos cinemáticos a partir de fotos estáticas, selecciona pistas de audio de forma dinámica y compone una capa gráfica animada usando React (Remotion).

## 🏗️ Arquitectura del Pipeline

El pipeline de producción se divide en 4 fases desacopladas:

1. **Fase 1 (Ingesta):** `1-ingest-metabase.js`
   - Lee el CSV en `./input/propiedad.csv`.
   - Descarga secuencialmente las imágenes de AWS/S3 a `./fotos/` en paralelo.
   - Resuelve el logotipo de la agencia (`assets/logos/`) con fallback automático y lo copia a la carpeta pública de Remotion.
   - Llama a OpenRouter (`openai/gpt-4o-mini`) para generar el copywriting cinemático en `./motion/src/cinematic-data.json`.
   - Selecciona un track de audio aleatorio de `./assets/musica/`, mide su duración exacta con `mediabunny` y lo copia como `audio_background.mp3`.

2. **Fase 2 (Curaduría/Triage):** `triage-photos.js`
   - Envía las imágenes en Base64 (optimizadas a 512px con `sharp`) a OpenRouter (`gemini-2.5-flash-lite`) para su clasificación, baneo y puntuación.
   - Selecciona las 6 mejores tomas únicas bajo un criterio estricto de jerarquía y variedad.

3. **Fase 3 (Generación de Video GenAI):** `generate-videos.js`
   - Lee la selección de fotos.
   - Recorta las imágenes a un formato cuadrado maestro (1:1) de `1280x1280` con `sharp` para optimizar costos de API y evitar deformación de perspectiva (*morphing*).
   - Consume la API de Replicate (`prunaai/p-video` o `kling-ai/kling-v1.6-standard`) de forma idempotente (omite clips ya generados).
   - Descarga los clips generados directamente en `./motion/public/toma_01.mp4` a `toma_06.mp4`.

4. **Fase 4 (Renderizado de Overlays):** `Remotion Engine`
   - El orquestador de Remotion calcula la línea de tiempo.
   - Reproduce los clips de video en secuencia aplicando un salto de 1 segundo (`startFrom={30}`) para descartar el morphing inicial de la IA.
   - Renderiza el título cinemático en EB Garamond, marcas de agua animadas con un pin interactivo de mapa, y un desenfoque de logo invertido con un CTA al final.

---

## 🛠️ Requisitos de Instalación

El sistema requiere tener instalado **Node.js** (v21.7+ recomendado para soporte nativo de `.env`) y **FFmpeg** globalmente en el sistema de la máquina ejecutora (Mac o Windows).

### Inicializar dependencias:
```bash
# 1. Instalar dependencias del motor central
npm install

# 2. Compilar binarios de códecs nativos
npm config set ignore-scripts false
npm rebuild node-av

# 3. Instalar dependencias de la capa gráfica de Remotion
cd motion
npm install
