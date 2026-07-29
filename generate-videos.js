import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KREA_API_KEY = process.env.KREA_API_KEY;
const API_BASE = 'https://api.krea.ai';
const PHOTOS_DIR = path.join(__dirname, 'fotos');
const VIDEOS_DIR = path.join(__dirname, 'videos_generados');

// ── Constantes de prompt ──────────────────────────────────────────────────
const QUALITY_PROMPT = ', ultra-photorealistic, 8k resolution, highly detailed architectural photography, cinematic lighting, warm tones,sharp focus.';
const FIDELITY_PROMPT = ' The camera must remain absolutely stable. Strictly maintain the exact colors, style, textures, furniture, lighting, and architectural structure of the original photo. Do not distort the room. Zero morphing.';

const FACADE_MOVEMENTS = [
  'Aerial drone shot, smooth cinematic fly-through, gliding gracefully over the property, showcasing the exterior architecture and landscaping, bright sunny day, perfect perspective',
  'Create a 5-second ultra-photorealistic construction timelapse of this property. Fast-moving clouds racing across the sky, accelerated daylight changes. The building dynamically builds itself block by block in 3D from the ground up following a realistic engineering sequence, while the surroundings remain perfectly unchanged.',
  'A giant, luxurious velvet silk cloth smoothly sliding off the structure to reveal the magnificent house underneath. Cinematic lighting, photorealistic physics of the cloth falling, dramatic unveiling.'
];

const INTERIOR_MOVEMENTS = [
  'Slow dolly in, steadycam, moving smoothly forward through the space, gently revealing the depth of the room',
  'Slow dolly right, steadycam, gliding parallel to the wall, smooth architectural flow, cinematic depth of field',
  'Gentle dolly out, steadycam, slowly pulling back to reveal the scale and grandeur of the space',
  'Smooth dolly left, steadycam, cinematic sliding motion, keeping the main architectural features in sharp focus'
];

// ── A/B Testing: Selección de fotos ────────────────────────────────────────

/** Mapa de ambiente (inglés → posibles valores en español del JSON). */
const AMBIENTE_MAP = {
  facade:      ['Exterior'],
  living_room: ['Sala', 'Comedor', 'Sala de TV'],
  kitchen:     ['Cocina'],
  bedroom:     ['Recámara', 'Recámara Principal'],
  balcony:     [],
  amenities:   [],
  bathroom:    ['Baño'],
  closet:      ['Vestidor'],
  hallway:     ['Pasillo'],
};

const PRIORITY = ['facade', 'living_room', 'kitchen', 'bedroom', 'balcony', 'amenities', 'bathroom', 'closet', 'hallway'];

/**
 * Elige 6 archivos de foto desde el array analisis aplicando la lógica de
 * versión (v1 = mejor foto de cada ambiente, v2 = segunda mejor).
 *
 * @param {Array<{ archivo: string, ambiente: string, puntuacion: number }>} analisis
 * @param {boolean} isV2
 * @returns {string[]} 6 nombres de archivo.
 */
function selectPhotos(analisis, isV2) {
  // 1. Agrupar por ambiente (valor español original)
  /** @type {Record<string, Array<{ archivo: string, puntuacion: number }>>} */
  const groups = {};
  for (const item of analisis) {
    if (!groups[item.ambiente]) groups[item.ambiente] = [];
    groups[item.ambiente].push({ archivo: item.archivo, puntuacion: item.puntuacion });
  }

  // 2. Ordenar cada grupo por puntuación descendente
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => b.puntuacion - a.puntuacion);
  }

  /** @type {Set<string>} */
  const selected = new Set();

  // 3. Primera vuelta: tomar de cada prioridad
  for (const priority of PRIORITY) {
    if (selected.size >= 6) break;

    const spanishNames = AMBIENTE_MAP[priority];
    // Recoger todos los candidatos de los ambientes que mapean a esta prioridad
    const candidates = [];
    for (const name of spanishNames) {
      const group = groups[name];
      if (group) candidates.push(...group);
    }
    if (candidates.length === 0) continue;

    // Ya ordenados por puntuación; el índice depende de la versión
    const idx = isV2 ? 1 : 0;
    const pick = idx < candidates.length ? candidates[idx] : candidates[0];
    if (!selected.has(pick.archivo)) {
      selected.add(pick.archivo);
    }
  }

  // 4. Segunda vuelta: completar hasta 6 con los siguientes mejores disponibles
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
    console.log(`     ${f}  (${info?.ambiente} — ${info?.puntuacion}/10)`);
  }

  return result;
}

// ── Helpers de Krea ────────────────────────────────────────────────────────

async function uploadAsset(filePath) {
  const originalFilename = path.basename(filePath);
  console.log(`  ✂️ Recortando ${originalFilename} a 720p Vertical (9:16)...`);

  const buffer = await sharp(filePath)
    .resize(1280, 1280, { fit: 'cover' })
    .jpeg({ quality: 100 })
    .toBuffer();

  const filename = originalFilename.replace(/\.[^/.]+$/, '') + '_vertical.jpg';
  const mime = 'image/jpeg';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);

  console.log(`  ⬆️ Subiendo ${filename} optimizado a Krea...`);
  const res = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KREA_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload falló (${res.status}): ${text.slice(0, 200)}`);
  }

  const { image_url } = await res.json();
  console.log(`  ✅ Subida exitosa → ${image_url}`);
  return image_url;
}

async function submitVideoJob(imageUrl, prompt) {
  console.log(`  🎬 Enviando trabajo de video...`);
  const res = await fetch(`${API_BASE}/generate/video/kling/kling-1.6`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KREA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      start_image: imageUrl,
      prompt,
      duration: 5,
      aspect_ratio: '1:1',
      mode: 'std',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Generación falló (${res.status}): ${text.slice(0, 200)}`);
  }
  const { job_id } = await res.json();
  console.log(`  ✅ Trabajo enviado → ${job_id}`);
  return job_id;
}

async function pollUntilDone(jobId) {
  console.log(`  ⏳ Sondeando ${jobId.slice(0, 8)}...`);
  const start = Date.now();

  while (true) {
    const elapsed = Math.round((Date.now() - start) / 1000);

    const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${KREA_API_KEY}` },
    });
    if (!res.ok) {
      console.log(`  ⚠ Poll falló (${res.status}), reintento en 5s...`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    const data = await res.json();

    if (data.status === 'completed') {
      const url = data.result?.urls?.[0] || data.urls?.[0];
      if (!url) throw new Error('Trabajo completado pero sin URL de video');
      console.log(`  ✅ Completado (${elapsed}s)`);
      return url;
    }

    if (data.status === 'failed') {
      const msg = data.error?.message || 'Error desconocido';
      throw new Error(`Trabajo falló (${elapsed}s): ${msg}`);
    }

    if (data.status === 'cancelled') {
      throw new Error('Trabajo cancelado');
    }

    if (elapsed > 0 && elapsed % 30 === 0) {
      console.log(`  ⏳ Aún procesando (${elapsed}s)...`);
    }

    await new Promise(r => setTimeout(r, 5000));
  }
}

async function downloadVideo(url, outputPath) {
  console.log(`  ⬇ Descargando video...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga falló (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);
  console.log(`  ✅ Guardado → ${path.basename(outputPath)}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const versionArg = process.argv[2];
  const isV2 = versionArg === 'v2';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬  MODO: ${isV2 ? 'V2 (segunda mejor opción)' : 'V1 (mejor opción)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Leer JSON completo
  const selectedPath = path.join(__dirname, 'output', 'selected-photos.json');
  if (!existsSync(selectedPath)) {
    console.error(`❌ No se encontró ${selectedPath}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(selectedPath, 'utf-8'));
  if (!Array.isArray(data.analisis) || data.analisis.length === 0) {
    console.error('❌ El JSON no contiene un array analisis válido');
    process.exit(1);
  }

  // 2. Seleccionar fotos según versión
  const photos = selectPhotos(data.analisis, isV2);

  // 3. Sobreescribir seleccion_final en el JSON original
  data.seleccion_final = photos;
  await fs.writeFile(selectedPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n💾 seleccion_final actualizada en ${selectedPath}`);

  // ── El resto del pipeline intacto ────────────────────────────────────────

  console.log(`\n📸 ${photos.length} fotos por animar\n`);

  if (!existsSync(VIDEOS_DIR)) mkdirSync(VIDEOS_DIR, { recursive: true });

  let success = 0;

  for (let i = 0; i < photos.length; i++) {
    const filename = photos[i];
    const filePath = path.join(PHOTOS_DIR, filename);
    const outputPath = path.join(VIDEOS_DIR, `toma_0${i + 1}.mp4`);

    try {
      await fs.access(outputPath);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`⏭️  [${i + 1}/${photos.length}] ${filename} — ya existe. Saltando generación...`);
      success++;
      continue;
    } catch {
      // No existe
    }

    if (!existsSync(filePath)) {
      console.warn(`⚠ ${filename} no encontrado — saltando`);
      continue;
    }

    const movements = i === 0 ? FACADE_MOVEMENTS : INTERIOR_MOVEMENTS;
    const movement = movements[i === 0 ? 0 : (i - 1) % movements.length];
    const prompt = `${movement}${QUALITY_PROMPT}${FIDELITY_PROMPT}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎥 [${i + 1}/${photos.length}] ${filename}`);
    console.log(`   Movimiento: ${movement}`);

    try {
      const imageUrl = await uploadAsset(filePath);
      const jobId = await submitVideoJob(imageUrl, prompt);
      const videoUrl = await pollUntilDone(jobId);
      await downloadVideo(videoUrl, outputPath);
      success++;
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏁 ${success}/${photos.length} videos generados en ${VIDEOS_DIR}`);
}

main();