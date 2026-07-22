// @ts-check
import path from 'node:path';
import sharp from 'sharp';
import { Input, ALL_FORMATS, FilePathSource, VideoSampleSink } from 'mediabunny';
import { registerMediabunnyServer } from '@mediabunny/server';

registerMediabunnyServer();

/**
 * Extrae tres frames JPEG (20 %, 50 % y 80 % del video) como strings Base64,
 * redimensionados a 720 px de ancho máximo con calidad 80, junto con el
 * framerate promedio del video.
 *
 * Cada frame se libera inmediatamente después de copiar sus pixeles,
 * minimizando el pico de memoria.
 *
 * @param {string} videoPath  Ruta absoluta o relativa a un archivo MP4.
 * @returns {Promise<{ base64Frames: string[], fps: number } | null>}
 *   Objeto con 3 frames Base64 y FPS, o `null` si algo falla
 *   (archivo inexistente, corrupto, sin pista de video, codec no soportado).
 */
export async function extractKeyframe(videoPath) {
  let input;

  try {
    // 1. Resolver ruta cross-platform (Windows \ → /, macOS rel → abs)
    const resolvedPath = path.resolve(videoPath);

    // 2. Abrir el video con Mediabunny
    input = new Input({
      source: new FilePathSource(resolvedPath),
      formats: ALL_FORMATS,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return null;

    const stats = await videoTrack.computePacketStats(100);
    const fps = Math.round(stats.averagePacketRate);

    const duration = await input.computeDuration();
    const timestamps = [duration * 0.20, duration * 0.50, duration * 0.80];
    const results = [];
    const sink = new VideoSampleSink(videoTrack);

    // 3 y 4 fusionados: Extraer, procesar y liberar UNO POR UNO
    for (const ts of timestamps) {
      const sample = await sink.getSample(ts);
      if (!sample) continue; // Si falla un frame, intentamos el otro

      try {
        const { displayWidth: w, displayHeight: h } = sample;
        
        // Copiar a memoria
        const byteLength = sample.allocationSize({ format: 'RGBA' });
        const buffer = new ArrayBuffer(byteLength);
        await sample.copyTo(buffer, { format: 'RGBA' });
        
        // LIBERAR INMEDIATAMENTE ANTES DE SHARP
        sample.close(); 
        
        // Codificar con sharp
        const rgba = Buffer.from(buffer);
        const jpeg = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
          .resize(720, undefined, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        results.push(jpeg.toString('base64'));
      } catch (/** @type {any} */ err) {
        console.warn(`[Warning] Error procesando frame en timestamp ${ts}:`, err.message);
        sample.close(); // Asegurar liberación si sharp falla
      }
    }

    return results.length === 3 ? { base64Frames: results, fps } : null;
    
  } catch (/** @type {any} */ error) {
    // Evitamos el "Silent Failure"
    console.error(`[Error] Fallo catastrófico procesando ${videoPath}:`, error.message);
    return null;
  } finally {
    input?.dispose();
  }
}