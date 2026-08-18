// @ts-check
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

/**
 * Ejecuta un comando en la terminal y hereda la salida estándar.
 * @param {string} command   El comando CLI a ejecutar.
 * @param {string} stepName  Nombre descriptivo del paso para los logs.
 */
function runStep(command, stepName) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 INICIANDO: ${stepName}`);
  console.log(`${'═'.repeat(60)}\n`);
  try {
    execSync(command, { stdio: 'inherit', cwd: __dirname });
  } catch (/** @type {any} */ err) {
    console.error(`\n❌ ERROR EN EL PASO: ${stepName}`);
    console.error(`Mensaje: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  // Asegurar carpeta de salida
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Capturar argumentos (ej: node pulppo-auto.js v1 pruna)
  const version = process.argv[2] || 'v1';
  const model = process.argv[3] || 'pruna';

  console.log('🎬 INICIANDO PIPELINE DE PRODUCCIÓN AUTOMÁTICA PULPPO PREMIUM...');

  // 1. Ingesta de datos y descarga de fotos en paralelo
  runStep('node 1-ingest-metabase.js', 'Fase 1: Ingesta de Metabase y Selección de Audio');

  // 2. Curaduría Inteligente
  runStep('node triage-photos.js', 'Fase 2: Curaduría de Fotografías (Triage)');

  // 3. Generación de Videos por IA (Kling / Pruna)
  runStep(`node generate-videos.js ${version} ${model}`, `Fase 3: Generación de Videos por IA (${model.toUpperCase()})`);

  // 4. Renderizado Final Gráfico en Remotion
  // Guardamos el resultado en la carpeta /output
  const renderCommand = `cd motion && npx remotion render PropertyVideo ../output/resultado_final_pulppo.mp4 --gl=angle`;
  runStep(renderCommand, 'Fase 4: Renderizado de Overlays en Remotion');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('🎉 ¡PROCESO DE PRODUCCIÓN DE VIDEO COMPLETADO CON ÉXITO!');
  console.log(`El video te espera en: ./output/resultado_final_pulppo.mp4`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('❌ Error fatal en el Orquestador:', err.message);
  process.exit(1);
});