// @ts-check
import path from 'node:path';
import fs from 'node:fs/promises';
import { buildMetadataMap } from './generate-property-metadata.js';
import { getAudioBeats } from './analyze-audio-beats.js';
import { generateTimeline } from './build-timeline.js';
import { renderFinalVideo } from './render-video.js';

process.loadEnvFile(); 

// --- CONFIGURACIÓN DEL PROYECTO ---
const PROPERTY_FOLDER = './videos';              // Carpeta con las tomas raw .mp4
const AUDIO_FILE = './musica/pista_30s.mp3';     // Tu pista de música
const OUTPUT_FOLDER = './output'; // Nueva carpeta
const OUTPUT_FILE = path.join(OUTPUT_FOLDER, 'resultado_pulppo.mp4'); 
const OPENROUTER_KEY = process.env.OPENROUTER_KEY; // Tu API Key

// --- LECTURA DE ARGUMENTOS ---
// Captura el tercer elemento de la consola (ej: node main.js 85)
const bpmArg = process.argv[2];
const MANUAL_BPM = bpmArg ? parseInt(bpmArg, 10) : null;

async function main() {
  console.log('🎬 Iniciando Motor de Ensamblaje Pulppo...\n');

  try {
    await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
    // 1. VISIÓN: Obtener o generar metadatos (Memoization para no gastar API de más)
    const metadataPath = path.join(PROPERTY_FOLDER, 'metadata.json');
    let metadataMap;
    
    try {
      const raw = await fs.readFile(metadataPath, 'utf-8');
      metadataMap = JSON.parse(raw);
      console.log('✅ Metadatos cargados desde caché local.');
    } catch {
      console.log('👁️ Analizando videos con OpenRouter (Gemini 2.5 Flash Lite)...');
      if (!OPENROUTER_KEY) throw new Error('Falta OPENROUTER_KEY en variables de entorno.');
      metadataMap = await buildMetadataMap(PROPERTY_FOLDER, OPENROUTER_KEY);
    }

    // 2. RITMO: Extraer beats de la música
    console.log('\n🎵 Analizando pista de audio...');
    const audioData = await getAudioBeats(AUDIO_FILE, MANUAL_BPM);
    if (!audioData) throw new Error('No se pudieron extraer los beats del audio.');
    console.log(`✅ Beats detectados. BPM estimado: ${audioData.bpm}`);

    // 3. CEREBRO: Armar la línea de tiempo
    console.log('\n🧠 Construyendo receta de edición (Timeline)...');
    const timeline = generateTimeline(metadataMap, audioData.beats, 30);
    if (timeline.length === 0) throw new Error('No se pudo generar la línea de tiempo. Verifica los videos.');
    console.log(`✅ Timeline generado con ${timeline.length} cortes.`);

    // 4. RENDER: FFmpeg al rescate
    console.log('\n⚙️ Renderizando video final (Esto puede tardar unos segundos)...');
    await renderFinalVideo(timeline, PROPERTY_FOLDER, AUDIO_FILE, OUTPUT_FILE);

    console.log('\n🎉 ¡PROCESO TERMINADO CON ÉXITO! Tu video está listo en:', OUTPUT_FILE);

  } catch (/** @type {any} */ error) {
    console.error('\n❌ ERROR FATAL EN EL PIPELINE:', error.message);
    process.exit(1);
  }
}

main();