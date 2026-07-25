// @ts-check
process.loadEnvFile();
/**
 * Escanea ./fotos, envía todas las imágenes a un VLM para curar las 6 mejores
 * y guarda el resultado en ./output/selected-photos.json
 *
 * @module triagePhotos
 */

import { readdirSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash-lite';
const FOTOS_DIR = join(import.meta.dirname, 'fotos');
const OUTPUT_DIR = join(import.meta.dirname, 'output');
const OUTPUT_FILE = join(OUTPUT_DIR, 'selected-photos.json');

/** Extensiones de imagen admitidas */
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

/**
 * Redimensiona una imagen a un máximo de 720px (manteniendo proporción)
 * y la devuelve como string Base64 en JPEG calidad 80.
 *
 * @param   {string} filePath
 * @returns {Promise<string>}
 */
async function imageToBase64(filePath) {
  const buffer = await readFile(filePath);
  const resized = await sharp(buffer)
    .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized.toString('base64');
}

/**
 * Ejecuta el pipeline de curación.
 *
 * @param   {string} openRouterApiKey
 * @returns {Promise<{
 *   analisis:        Array<{archivo:string, ambiente:string, puntuacion:number, seleccionada:boolean}>,
 *   seleccion_final: string[]
 * }|null>}
 */
export async function triagePhotos(openRouterApiKey) {
  try {
    // ── 1. Leer directorio ──────────────────────────────────────────
    let files;
    try {
      files = readdirSync(FOTOS_DIR);
    } catch {
      console.warn('[Warning] El directorio ./fotos no existe');
      return null;
    }

    const imageFiles = files
      .filter((f) => EXTENSIONS.has(extname(f).toLowerCase()))
      .sort();

    if (imageFiles.length === 0) {
      console.warn('[Warning] No se encontraron imágenes .jpg/.jpeg/.png en ./fotos');
      return null;
    }

    console.log(`[Info] Procesando ${imageFiles.length} imágenes...`);

    // ── 2. Comprimir y codificar cada imagen (una a una, sin saturar memoria) ──
    /** @type {any[]} */
    const content = [
      {
        type: 'text',
        text:
          'Actúa como un fotógrafo profesional y curador de contenido para portales inmobiliarios de lujo. ' +
          'Tienes dos tareas:\n' +
          '1. Evaluar todas las imágenes proporcionadas.\n' +
          '2. Seleccionar EXACTAMENTE las 6 mejores fotografías para armar un video.\n\n' +
          'REGLAS DE SELECCIÓN:\n' +
          'BANEO: Cero planos, cero renders, cero vistas de mapas, cero baños pequeños, pasillos vacíos o fotos borrosas.\n' +
          'VARIEDAD: Las 6 fotos DEBEN SER DE ESPACIOS DIFERENTES (ej. no dos de cocina).\n' +
          'JERARQUÍA: Busca obligatoriamente: Fachada Exterior, Sala, Cocina, Recámara Principal. ' +
          'Rellena las otras 2 con: Amenidades (Gimnasio/Alberca), Balcón/Terraza, o Baño principal lujoso.\n\n' +
          'FORMATO DE SALIDA ESTRICTO JSON (sin markdown):\n' +
          '{\n' +
          '  "analisis": [ { "archivo": "nombre.jpg", "ambiente": "Cocina", "puntuacion": 9, "seleccionada": true o false } ],\n' +
          '  "seleccion_final": ["foto1.jpg", "foto2.jpg", "foto3.jpg", "foto4.jpg", "foto5.jpg", "foto6.jpg"]\n' +
          '}',
      },
    ];

    for (const file of imageFiles) {
      const filePath = join(FOTOS_DIR, file);
      console.log(`[Info] Comprimiendo ${file}...`);
      const b64 = await imageToBase64(filePath);

      content.push({ type: 'text', text: 'Archivo: ' + file });
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      });
    }

    // ── 3. Llamar a la API ──────────────────────────────────────────
    console.log(`[Info] Enviando ${imageFiles.length} imágenes al VLM...`);

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
              'Eres un curador fotográfico profesional para bienes raíces de lujo. ' +
              'Responde ÚNICAMENTE con el JSON especificado por el usuario, sin markdown ni texto adicional.',
          },
          { role: 'user', content },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      console.warn(
        `[Warning] OpenRouter respondió con status ${response.status}: ${response.statusText}`
      );
      return null;
    }

    /** @type {{ choices: Array<{ message: { content: string } }> }}} */
    const body = await response.json();
    const rawContent = body?.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.warn('[Warning] OpenRouter devolvió una respuesta vacía');
      return null;
    }

    // ── 4. Parsear JSON ─────────────────────────────────────────────
    const cleaned = rawContent
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    /** @type {any} */
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('[Error Crítico] Falló al parsear el JSON. Esto fue lo que intentó escribir la IA antes de cortarse:');
      console.log('\n--- INICIO RESPUESTA ---');
      console.log(cleaned);
      console.log('--- FIN RESPUESTA ---\n');
      return null;
    }

    // Validación mínima
    if (
      !parsed ||
      !Array.isArray(parsed.analisis) ||
      !Array.isArray(parsed.seleccion_final) ||
      parsed.seleccion_final.length !== 6
    ) {
      console.warn('[Warning] El JSON devuelto no cumple el contrato esperado:', parsed);
      return null;
    }

    // ── 5. Guardar ──────────────────────────────────────────────────
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`[Info] Resultado guardado en ${OUTPUT_FILE}`);

    return parsed;
  } catch (/** @type {any} */ err) {
    console.warn('[Warning] Error en triagePhotos:', err.message);
    return null;
  }
}

// ── Ejecución directa ─────────────────────────────────────────────────────────
const API_KEY = process.env.OPENROUTER_KEY; 
if (!API_KEY) {
  console.error('[Error] La variable de entorno OPENROUTER_KEY no está definida');
  process.exit(1);
}

const result = await triagePhotos(API_KEY);
if (result) {
  console.log('[OK] Selección final:', result.seleccion_final.join(', '));
}