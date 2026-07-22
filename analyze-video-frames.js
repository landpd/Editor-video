// @ts-check

/**
 * Envía los dos keyframes extraídos al VLM (OpenRouter / google/gemini-2.5-flash-lite)
 * para obtener evaluación inmobiliaria estructurada.
 *
 * @module analyzeVideoFrames
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash-lite';

/**
 * @typedef {Object} FrameAnalysis
 * @property {string}  room_type             - Tipo de ambiente detectado (living, bedroom, kitchen, etc.)
 * @property {string}  camera_movement       - Descripción del movimiento de cámara (static, pan, tilt, etc.)
 * @property {number}  quality_score         - Puntaje de calidad del frame (1-10)
 * @property {number}  usable_start_fraction - Fracción del video utilizable desde el inicio (0.0-0.5)
 */

/**
 * Evalúa tres frames de video inmobiliario (inicio, medio, final de un clip)
 * a través de un Vision Language Model.
 *
 * @param   {string[]} base64FramesArray  - Array con 3 strings Base64 JPEG (output de extractKeyframe).
 * @param   {string}   openRouterApiKey   - API Key de OpenRouter.
 * @returns {Promise<FrameAnalysis|null>}  Objeto con análisis estructurado, o null si falla.
 */
export async function analyzeVideoFrames(base64FramesArray, openRouterApiKey) {
  try {
    if (!Array.isArray(base64FramesArray) || base64FramesArray.length < 1) {
      console.warn('[Warning] analyzeVideoFrames recibió un array vacío o inválido');
      return null;
    }

    // Construir contenido con imágenes en formato OpenAI-compatible
    const content = [
      {
        type: 'text',
        text: 'Evalúa estas TRES tomas del mismo video inmobiliario (inicio, medio y final del clip) y devuelve un JSON con la estructura exacta especificada.',
      },
      ...base64FramesArray.map((b64) => ({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${b64}`,
        },
      })),
    ];

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Eres un Editor Inmobiliario Evaluador. Analiza las TRES imágenes aportadas (inicio, medio y final del mismo clip) ' +
              'y responde ÚNICAMENTE con UN SOLO objeto JSON crudo (sin array). ' +
              'Estructura exacta: { "room_type": "string", "camera_movement": "string", "quality_score": number, "usable_start_fraction": number }. ' +
              'Para "room_type" elige EXCLUSIVAMENTE uno de estos valores: ' +
              '"facade" (fachada exterior del edificio o casa), ' +
              '"amenities" (gimnasio, alberca, salón de fiestas, ludoteca, áreas comunes), ' +
              '"balcony" (vistas exteriores desde la propiedad, terrazas), ' +
              '"living_room", "kitchen", "bedroom", "bathroom", "closet". ' +
              'quality_score es un entero del 1 al 10. ' +
              'usable_start_fraction: Si la imagen 1 (inicio) muestra una puerta cerrada, una pared o está borrosa, ' +
              'pero las imágenes 2 y 3 son buenas, devuelve 0.4 (podemos desechar el primer 40%). ' +
              'Si todo el video es bueno desde el principio, devuelve 0.0. ' +
              'SIEMPRE un decimal entre 0.0 y 0.5.',
          },
          {
            role: 'user',
            content,
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.warn(
        `[Warning] OpenRouter respondió con status ${response.status}: ${response.statusText}`
      );
      return null;
    }

    /** @type {{ choices: Array<{ message: { content: string } }> }} */
    const body = await response.json();
    const rawContent = body?.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.warn('[Warning] OpenRouter devolvió una respuesta vacía');
      return null;
    }

    // Parsear JSON — el modelo puede devolverlo con o sin ```json...```
    const cleaned = rawContent
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    /** @type {FrameAnalysis} */
    let parsed = JSON.parse(cleaned);

    // Defensa: Si el modelo desobedece y devuelve un Array, tomamos el primer elemento
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }

    // Validación mínima del contrato
    if (
      typeof parsed.room_type !== 'string' ||
      typeof parsed.camera_movement !== 'string' ||
      typeof parsed.quality_score !== 'number' ||
      parsed.quality_score < 1 ||
      parsed.quality_score > 10 ||
      typeof parsed.usable_start_fraction !== 'number' ||
      parsed.usable_start_fraction < 0 ||
      parsed.usable_start_fraction > 0.5
    ) {
      console.warn('[Warning] OpenRouter devolvió JSON con estructura inesperada:', parsed);
      return null;
    }

    return parsed;
  } catch (/** @type {any} */err) {
    console.warn('[Warning] Error en analyzeVideoFrames:', err.message);
    return null;
  }
}