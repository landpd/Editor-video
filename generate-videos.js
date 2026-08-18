import sharp from 'sharp';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Replicate from 'replicate';

process.loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = path.join(__dirname, 'fotos');
const VIDEOS_FOLDER = path.resolve('./motion/public');
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  useFileOutput: false,
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Modelos disponibles ──────────────────────────────────────────────────
const MODELS = {
  kling:    { id: 'kwaivgi/kling-v1.6-standard', label: 'Kling 1.6' },
  pruna:    { id: 'prunaai/p-video',              label: 'Pruna P-Video' },
  seedance: { id: 'bytedance/seedance-1.5-pro',   label: 'Seedance 1.5 Pro' },
};

// ── Constantes de prompt ──────────────────────────────────────────────────
const QUALITY_PROMPT = ', ultra-photorealistic, 8k resolution, highly detailed architectural photography, cinematic lighting, sharp focus.';
const FIDELITY_PROMPT = ' Strictly maintain the exact colors, style, textures, furniture, lighting, and architectural structure of the original photo. Do not distort the room. Zero morphing.';

const FACADE_MOVEMENTS = [
  'Aerial drone shot, slowly flying straight up, smooth vertical flight revealing the facade and its surroundings',
  'Aerial drone shot, slowly flying straight forward towards the facade, smooth dolly in movement',
  'Aerial drone shot, slowly flying straight backwards away from the facade, smooth dolly out movement',
];

const INTERIOR_MOVEMENTS = [
  'Slow and natural handheld walk, slowly walking forward through the room, smooth first-person perspective tracking shot',
  'Slow and natural handheld walk, smoothly sliding sideways across the room, elegant lateral tracking shot',
];

// ── Mapeo directo desde room_type de triage-photos.js ────────────────────

const PRIORITY = ['facade', 'exterior_social', 'interior_social', 'bedroom', 'bathroom', 'hallway'];

/**
 * Elige 6 archivos desde el array analisis, priorizando variedad de room_type.
 *
 * @param {Array<{ archivo: string, room_type: string, puntuacion: number }>} analisis
 * @param {boolean} isV2
 * @returns {string[]} 6 nombres de archivo.
 */
function selectPhotos(analisis, isV2) {
  /** @type {Record<string, Array<{ archivo: string, puntuacion: number }>>} */
  const groups = {};
  for (const item of analisis) {
    const key = item.room_type || 'interior_social';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ archivo: item.archivo, puntuacion: item.puntuacion });
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => b.puntuacion - a.puntuacion);
  }

  /** @type {Set<string>} */
  const selected = new Set();

  for (const priority of PRIORITY) {
    if (selected.size >= 6) break;
    const candidates = groups[priority] || [];
    if (candidates.length === 0) continue;

    const idx = isV2 ? 1 : 0;
    const pick = idx < candidates.length ? candidates[idx] : candidates[0];
    if (!selected.has(pick.archivo)) {
      selected.add(pick.archivo);
    }
  }

  // Llenar hasta 6 con las mejores restantes
  if (selected.size < 6) {
    const remaining = analisis
      .filter(a => !selected.has(a.archivo))
      .sort((a, b) => b.puntuacion - a.puntuacion);

    for (const item of remaining) {
      if (selected.size >= 6) break;
      selected.add(item.archivo);
    }
  }

  const result = Array.from(selected);
  console.log(`  📋 ${isV2 ? 'V2' : 'V1'} — ${result.length} fotos seleccionadas:`);
  for (const f of result) {
    const info = analisis.find(a => a.archivo === f);
    console.log(`     ${f}  (${info?.room_type} — ${info?.puntuacion}/10)`);
  }

  return result;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const versionArg = process.argv[2];
  const modelArg = process.argv[3] || 'seedance';
  const isV2 = versionArg === 'v2';

  const modelConfig = MODELS[modelArg] ?? MODELS.seedance;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬  MODO: ${isV2 ? 'V2 (segunda mejor opción)' : 'V1 (mejor opción)'}`);
  console.log(`🤖  MODELO: ${modelConfig.label} (${modelConfig.id})`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Leer JSON de análisis
  const selectedPath = path.join(__dirname, 'output', 'selected-photos.json');
  let data;
  try {
    data = JSON.parse(await fs.readFile(selectedPath, 'utf-8'));
  } catch {
    console.error(`❌ No se pudo leer ${selectedPath}`);
    process.exit(1);
  }

  if (!Array.isArray(data.analisis) || data.analisis.length === 0) {
    console.error('❌ El JSON no contiene un array analisis válido');
    process.exit(1);
  }

  // 2. Seleccionar fotos según versión
  const photos = selectPhotos(data.analisis, isV2);

  // 3. Persistir selección final
  data.seleccion_final = photos;
  await fs.writeFile(selectedPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n💾 seleccion_final actualizada en ${selectedPath}\n`);

  // 4. Generar videos
  if (!existsSync(VIDEOS_FOLDER)) mkdirSync(VIDEOS_FOLDER, { recursive: true });

  let success = 0;

  for (let i = 0; i < photos.length; i++) {
    const filename = photos[i];
    const filePath = path.join(PHOTOS_DIR, filename);
    const outputName = `toma_0${i + 1}.mp4`;
    const outputPath = path.join(VIDEOS_FOLDER, outputName);

    // ── Idempotencia ──────────────────────────────────────────────────────
    try {
      await fs.access(outputPath);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`⏭️  [SKIP] ${outputName} ya existe. Pasando...`);
      success++;
      continue;
    } catch {
      // No existe, seguimos
    }

    if (!existsSync(filePath)) {
      console.warn(`⚠ ${filename} no encontrado en disco — saltando`);
      continue;
    }

    // ── Selección de movimiento ────────────────────────────────────────────
    const movements = i === 0 ? FACADE_MOVEMENTS : INTERIOR_MOVEMENTS;
    const movement = movements[i === 0 ? 0 : (i - 1) % movements.length];
    const finalPrompt = movement + QUALITY_PROMPT + FIDELITY_PROMPT;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎥 [${i + 1}/${photos.length}] ${filename}`);
    console.log(`   Movimiento: ${movement}`);

    // ── Self-healing: hasta 3 intentos por toma ────────────────────────────
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // ── Pre-procesamiento: Sharp → Data URI ─────────────────────────────
        console.log(`   🖼️  Recortando a 1280×1280...`);
        const jpegBuffer = await sharp(filePath)
          .resize(1280, 1280, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();

        const dataUri = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

        const negativePrompt = 'deformed, distorted, morphing, low quality, bad lighting, blurry, unrealistic, extra windows, moving furniture, changing wall textures, shaky camera, noisy, digital artifacts, bad proportions.';

        // ── Llamada a Replicate ──────────────────────────────────────────────
        console.log(`   🚀 Enviando a Replicate (${modelConfig.label})...`);

        const input = {
          prompt: finalPrompt,
          aspect_ratio: '1:1',
          duration: 5,
        };

        if (modelArg === 'seedance') {
          input.image = dataUri;
          input.fps = 24;
          input.resolution = '720p';
          input.camera_fixed = false;
          input.generate_audio = false;
        } else if (modelArg === 'pruna') {
          input.image = dataUri;
          input.resolution = '720p';
          input.fps = 24;
          input.draft = false;
          input.no_op = false;
          input.save_audio = false;
          input.prompt_upsampling = false;
          input.disable_safety_filter = true;
        } else {
          input.start_image = dataUri;
          input.cfg_scale = 0.4;
          input.negative_prompt = negativePrompt;
        }

        // ── Llamada a Replicate con reintentos por rate-limit ──────────────
        let output;
        for (let rateAttempt = 1; rateAttempt <= 3; rateAttempt++) {
          try {
            output = await replicate.run(modelConfig.id, { input });
            break;
          } catch (err) {
            if (err.status === 429 && rateAttempt < 3) {
              const waitMs = err.headers?.['retry-after']
                ? parseInt(err.headers['retry-after'], 10) * 1000
                : 20_000;
              console.warn(`   ⚠️  Rate limit (429), reintento ${rateAttempt}/3 — esperando ${waitMs / 1000}s...`);
              await sleep(waitMs);
              continue;
            }
            throw err;
          }
        }

        // ── URL extraction ───────────────────────────────────────────────────
        const videoUrl = Array.isArray(output) ? output[0] : output;

        console.log(`   ⬇️  Descargando video desde Replicate...`);
        const res = await fetch(videoUrl);
        if (!res.ok) throw new Error(`Descarga falló (${res.status})`);

        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(outputPath, buffer);

        console.log(`   ✅ Video guardado → ${outputName}`);

        // ── Delay de cortesía: 10s entre peticiones ────────────────────────────
        if (i < photos.length - 1) {
          console.log(`   ⏳ Delay de cortesía 10s para evitar rate-limit...`);
          await sleep(10_000);
        }

        success++;
        break; // Intento exitoso → sale del bucle self-healing
      } catch (err) {
        if (attempt < 3) {
          console.warn(`\n⚠️  [Intento ${attempt}/3 Falló] para ${filename}. Error: ${err.message}`);
          console.warn(`   ⏳ Esperando 15s antes de reintentar...\n`);
          await sleep(15_000);
          // Siguiente intento
        } else {
          console.error(`\n❌ [Intento 3/3 Falló] para ${filename}. Error fatal: ${err.message}`);
          throw err; // Fatal → detiene todo el script
        }
      }
    } // fin self-healing loop
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏁 ${success}/${photos.length} videos generados en ${VIDEOS_FOLDER}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});