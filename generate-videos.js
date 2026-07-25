// @ts-check
process.loadEnvFile();

/**
 * Genera animaciones de las 6 fotos seleccionadas usando Replicate (Kling).
 *
 * @module generateVideos
 */

import { readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { join, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { get } from 'node:https';

// ── 0. Constantes de arquitectura de prompt ──────────────────────────────────
const QUALITY_PROMPT =
  ', architectural photography, 8k, ultra quality, photo realistic, cinematic, 3 seconds duration.';
const FIDELITY_PROMPT =
  ' Strictly maintain the exact colors, style, textures, furniture, lighting, and architectural structure of the original photo. Do not distort the room.';
const FACADE_MOVEMENTS = [
  'A cinematic timelapse from day to night',
  'The house dynamically building itself block by block in 3D',
  'A giant luxurious silk cloth smoothly sliding off to reveal the house',
];
const INTERIOR_MOVEMENTS = [
  'Slow dolly in, steadycam',
  'Smooth crane up, cinematic',
  'Slow pan right, stabilized',
  'Gentle dolly out, steadycam',
  'Smooth pan left, cinematic tracking',
];

const REPLICATE_API = 'https://api.replicate.com/v1';
const MODEL = 'kling-ai/kling';
const SELECTED_FILE = join(import.meta.dirname, 'output', 'selected-photos.json');
const FOTOS_DIR = join(import.meta.dirname, 'fotos');
const VIDEOS_DIR = join(import.meta.dirname, 'videos_generados');

/**
 * Convierte una imagen a Data URI (JPEG base64).
 *
 * @param   {string} filePath
 * @returns {Promise<string>}
 */
async function fileToDataUri(filePath) {
  const buffer = await readFile(filePath);
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Polling loop: espera a que una predicción de Replicate termine.
 *
 * @param   {string}  getUrl    - URL de consulta (urls.get)
 * @param   {string}  token     - REPLICATE_API_TOKEN
 * @returns {Promise<string|null>} URL del video generado, o null si falla
 */
async function pollPrediction(getUrl, token) {
  while (true) {
    const res = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.warn(`  [Warning] Poll falló con status ${res.status}`);
      return null;
    }

    /** @type {{ status: string, output?: string|string[] }} */
    const data = await res.json();
    console.log(`  [Poll] status = ${data.status}`);

    if (data.status === 'succeeded') {
      // output puede ser string (URL directa) o string[] (varios outputs)
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      console.log(`  [OK] Video generado: ${url}`);
      return url ?? null;
    }

    if (data.status === 'failed') {
      console.warn('  [Warning] La predicción falló en Replicate');
      return null;
    }

    // Esperar 5 segundos antes del siguiente poll
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/**
 * Descarga un archivo MP4 desde una URL y lo guarda en disco.
 *
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    get(url, (res) => {
      // Replicate a veces redirige — seguir la redirección manual
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        // Eliminar archivo parcial
        try { rmSync(destPath); } catch { /* ignore */ }
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        try { rmSync(destPath); } catch { /* ignore */ }
        return reject(new Error(`HTTP ${res.statusCode} al descargar video`));
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        try { rmSync(destPath); } catch { /* ignore */ }
        reject(err);
      });
    }).on('error', (err) => {
      try { rmSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
if (!REPLICATE_TOKEN) {
  console.error('[Error] REPLICATE_API_TOKEN no está definido en .env');
  process.exit(1);
}

// ── 1. Leer selección ─────────────────────────────────────────────────────────
/** @type {{ seleccion_final: string[] }|null} */
let selected;
try {
  selected = JSON.parse(readFileSync(SELECTED_FILE, 'utf-8'));
} catch {
  console.error('[Error] No se pudo leer', SELECTED_FILE, '— ejecuta triage-photos.js primero');
  process.exit(1);
}

if (!selected?.seleccion_final?.length) {
  console.error('[Error] seleccion_final vacío o inválido en', SELECTED_FILE);
  process.exit(1);
}

console.log(`[Info] Leyendo ${selected.seleccion_final.length} fotos del JSON...`);

// ── 2. Preparar carpeta de salida ─────────────────────────────────────────────
try {
  rmSync(VIDEOS_DIR, { recursive: true, force: true });
} catch { /* no existe aún */ }
mkdirSync(VIDEOS_DIR, { recursive: true });
console.log(`[Info] Carpeta ${VIDEOS_DIR} lista`);

// ── 3. Iterar foto por foto ───────────────────────────────────────────────────
let successCount = 0;

for (let i = 0; i < selected.seleccion_final.length; i++) {
  const fileName = selected.seleccion_final[i];
  const filePath = join(FOTOS_DIR, fileName);
  const outPath = join(VIDEOS_DIR, `toma_0${i + 1}.mp4`);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`[${i + 1}/6] Procesando: ${fileName}`);

  // ── 3a. Validar que el archivo existe ──────────────────────────────────────
  try {
    readFileSync(filePath);
  } catch {
    console.warn(`  [Warning] Archivo no encontrado: ${filePath} — se salta`);
    continue;
  }

  // ── 3b. Elegir movimiento ──────────────────────────────────────────────────
  let selectedMovement;
  if (i === 0) {
    selectedMovement = FACADE_MOVEMENTS[Math.floor(Math.random() * FACADE_MOVEMENTS.length)];
    console.log(`  [Prompt] Fachada → "${selectedMovement}"`);
  } else {
    const idx = (i - 1) % INTERIOR_MOVEMENTS.length;
    selectedMovement = INTERIOR_MOVEMENTS[idx];
    console.log(`  [Prompt] Interior → "${selectedMovement}" (idx ${idx})`);
  }

  const finalPrompt = selectedMovement + QUALITY_PROMPT + FIDELITY_PROMPT;
  console.log(`  [Prompt Completo] ${finalPrompt}`);

  // ── 3c. Convertir a Data URI ───────────────────────────────────────────────
  let dataUri;
  try {
    dataUri = await fileToDataUri(filePath);
    console.log(`  [OK] Data URI generado (${dataUri.length} chars)`);
  } catch (err) {
    console.warn(`  [Warning] Error al leer ${fileName}: ${err.message} — se salta`);
    continue;
  }

  // ── 3d. Llamar a Replicate ─────────────────────────────────────────────────
  let prediction;
  try {
    console.log(`  [API] Enviando a Replicate (${MODEL})...`);
    const res = await fetch(`${REPLICATE_API}/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'generate-videos/1.0',
      },
      body: JSON.stringify({
        input: {
          image: dataUri,
          prompt: finalPrompt,
          duration: 5,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`  [Warning] Replicate respondió ${res.status}: ${errText}`);
      continue;
    }

    prediction = await res.json();
    console.log(`  [OK] Predicción creada: ${prediction.id}`);
  } catch (err) {
    console.warn(`  [Warning] Error al crear predicción para ${fileName}: ${err.message}`);
    continue;
  }

  // ── 3e. Polling ─────────────────────────────────────────────────────────────
  const getUrl = prediction.urls?.get;
  if (!getUrl) {
    console.warn('  [Warning] La predicción no contiene urls.get');
    continue;
  }

  const videoUrl = await pollPrediction(getUrl, REPLICATE_TOKEN);
  if (!videoUrl) {
    console.warn(`  [Warning] No se obtuvo video para ${fileName}`);
    continue;
  }

  // ── 3f. Descargar ───────────────────────────────────────────────────────────
  try {
    console.log(`  [Download] Descargando video a ${outPath}...`);
    await downloadFile(videoUrl, outPath);
    console.log(`  [OK] Guardado: ${outPath}`);
    successCount++;
  } catch (err) {
    console.warn(`  [Warning] Error al descargar video para ${fileName}: ${err.message}`);
    // seguir con la siguiente foto
  }
}

console.log(`\n═══════════════════════════════════════════════`);
console.log(`[Finalizado] ${successCount}/${selected.seleccion_final.length} videos generados en ${VIDEOS_DIR}`);
