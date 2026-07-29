import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFinalVideo } from './render-video.js';
import { Input, FilePathSource, ALL_FORMATS } from 'mediabunny';
import { registerMediabunnyServer } from '@mediabunny/server';

registerMediabunnyServer();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIDEOS_FOLDER = path.join(__dirname, 'videos_generados');
const MUSICA_FOLDER = path.join(__dirname, 'musica');
const OUTPUT_FILE = path.join(__dirname, 'output', 'resultado_genai.mp4');
const RECIPE_FILE = path.join(__dirname, 'output', 'remotion-recipe.json');
const SELECTED_FILE = path.join(__dirname, 'output', 'selected-photos.json');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Busca el ambiente/room_type de una foto dentro del array analisis.
 * @param {string} filename
 * @param {Array<{archivo: string, ambiente: string}>} analisis
 * @returns {string}
 */
function findRoomType(filename, analisis) {
  const match = analisis.find(a => a.archivo === filename);
  return match?.ambiente ?? 'Desconocido';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🧩  ORQUESTADOR — ASSEMBLE GEN AI');
  console.log(`${'═'.repeat(60)}\n`);

  // 1. Validar y Leer JSON de selección
  if (!existsSync(SELECTED_FILE)) {
    console.error(`❌ No se encontró ${SELECTED_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(SELECTED_FILE, 'utf-8'));
  const { seleccion_final: photos, analisis } = data;

  if (!photos?.length) {
    console.error('❌ seleccion_final vacío');
    process.exit(1);
  }
  console.log(`📸 ${photos.length} fotos seleccionadas\n`);

  // 2. Auto-detectar audio y calcular duración dinámica
  let AUDIO_FILE = '';
  let clipDuration = 2.5; // Fallback por defecto

  if (existsSync(MUSICA_FOLDER)) {
    const files = readdirSync(MUSICA_FOLDER);
    const mp3File = files.find(f => f.toLowerCase().endsWith('.mp3'));

    if (mp3File) {
      AUDIO_FILE = path.join(MUSICA_FOLDER, mp3File);
      console.log(`🎵 Pista de audio detectada: ${mp3File}`);

      // Obtener duración exacta con mediabunny
      const input = new Input({
        source: new FilePathSource(AUDIO_FILE),
        formats: ALL_FORMATS,
      });
      const totalAudioDuration = await input.computeDuration();
      input.dispose(); // Limpiamos la RAM

      // MATEMÁTICA PURA: Dividir el tiempo entre las fotos
      clipDuration = totalAudioDuration / photos.length;
      console.log(`⏱️  Duración del audio: ${totalAudioDuration.toFixed(2)}s`);
      console.log(`✂️  Cada clip durará exactamente: ${clipDuration.toFixed(3)}s\n`);

      if (clipDuration > 2.5) {
        console.warn(`[⚠️ Alerta] El clip requerido supera los 2.5s útiles del video GenAI.`);
        console.warn(`   Si el render falla, usa una pista de ~15s o aumenta la cantidad de fotos.\n`);
      }
    } else {
      console.warn(`⚠  No se encontró ningún .mp3 en /musica. El video no tendrá banda sonora.\n`);
    }
  }

  // 3. Construir timeline
  const timeline = [];

  for (let i = 0; i < photos.length; i++) {
    const filename = photos[i];
    const clipName = `toma_0${i + 1}.mp4`;
    const room_type = findRoomType(filename, analisis);

    timeline.push({
      clipName,
      room_type,
      durationSec: clipDuration, // <-- Asignación matemática dinámica
      startFraction: 1, // Le indica a FFmpeg que corte los primeros 2.5s de Krea
      fps: 30,
    });

    console.log(`   ${i + 1}. ${clipName} ← ${filename} (${room_type})`);
  }

  // 4. Escribir recipe JSON
  writeFileSync(RECIPE_FILE, JSON.stringify(timeline, null, 2), 'utf-8');
  console.log(`\n📝 Recipe escrito → ${RECIPE_FILE}`);

  // 5. Renderizar
  const totalSec = timeline.reduce((sum, c) => sum + c.durationSec, 0);
  console.log(`\n🎬 Renderizando ${timeline.length} clips (${totalSec.toFixed(2)}s totales)...`);

  try {
    await renderFinalVideo(timeline, VIDEOS_FOLDER, AUDIO_FILE, OUTPUT_FILE);
    console.log(`\n✅ Video final: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`\n❌ Error en render: ${err.message}`);
    process.exit(1);
  }
}

main();