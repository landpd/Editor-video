// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractKeyframe } from './extract-keyframe.js';
import { analyzeVideoFrames } from './analyze-video-frames.js';

/**
 * @typedef {import('./analyze-video-frames.js').FrameAnalysis} FrameAnalysis
 */

/**
 * Escanea un directorio, procesa secuencialmente cada video MP4 extrayendo
 * keyframes y analizándolos vía VLM, y persiste el resultado en metadata.json.
 *
 * @param {string} folderPath     Ruta a la carpeta con los videos MP4.
 * @param {string} openRouterKey  API Key de OpenRouter.
 * @returns {Promise<Record<string, FrameAnalysis>>} Mapa { nombre.mp4 → análisis }.
 */
export async function buildMetadataMap(folderPath, openRouterKey) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  // Filtrar .mp4 case-insensitive
  const mp4Files = entries
    .filter((e) => e.isFile() && /\.mp4$/i.test(e.name))
    .map((e) => e.name);

  /** @type {Record<string, FrameAnalysis>} */
  const metadata = {};

  for (const fileName of mp4Files) {
    const filePath = path.join(folderPath, fileName);

    try {
      const result = await extractKeyframe(filePath);
      if (!result) {
        console.warn(`[Skip] ${fileName} — extractKeyframe devolvió null`);
        continue;
      }

      const { base64Frames, fps } = result;

      const analysis = await analyzeVideoFrames(base64Frames, openRouterKey);
      if (!analysis) {
        console.warn(`[Skip] ${fileName} — analyzeVideoFrames devolvió null`);
        continue;
      }

      metadata[fileName] = { ...analysis, fps };
      console.log(`[OK]   ${fileName} → ${analysis.room_type} (score: ${analysis.quality_score})`);
    } catch (err) {
      // Graceful degradation: error interno no debe romper el batch
      console.warn(`[Skip] ${fileName} — error inesperado:`, err.message);
    }
  }

  // Persistir el mapa completo
  const outputPath = path.join(folderPath, 'metadata.json');
  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`\n[Done] metadata.json guardado en ${outputPath}`);

  return metadata;
}
