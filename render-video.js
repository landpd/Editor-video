// @ts-check
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Renderiza el video final: concatena los clips según la receta,
 * escala a 1080p con letterboxing, y superpone la pista de audio.
 *
 * @module renderVideo
 */

/**
 * @typedef {import('./build-timeline.js').EditRecipeItem} EditRecipeItem
 */

/**
 * Ejecuta FFmpeg con los parámetros construidos dinámicamente.
 *
 * @param {EditRecipeItem[]} timeline    - Receta de edición (array de { clipName, durationSec, startFraction, fps }).
 * @param {string}           clipsFolder - Ruta a la carpeta donde están los clips MP4.
 * @param {string}           audioPath   - Ruta al archivo de audio de fondo.
 * @param {string}           outputPath  - Ruta del archivo MP4 de salida.
 * @returns {Promise<void>} Se resuelve cuando FFmpeg termina, se rechaza si falla.
 */
export function renderFinalVideo(timeline, clipsFolder, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const inputs = [];
    const filters = [];
    const concatInputs = [];
    const totalDuration = timeline.reduce((sum, clip) => sum + clip.durationSec, 0);
    const fadeStart = Math.max(0, totalDuration - 1); 
    const lutPath = path.resolve('./assets/dji_dlog_m.cube');
    // FFmpeg en Windows requiere que escapemos los dos puntos (C:) y usemos slashes normales
    const escapedLutPath = lutPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    for (let i = 0; i < timeline.length; i++) {
      const clip = timeline[i];
      const clipPath = path.resolve(clipsFolder, clip.clipName);
      const skipSeconds = clip.startFraction > 0 ? 2.5 : 0;
      const speedFactor = clip.fps > 50 ? '2.0' : '1.0';
                  
      inputs.push('-i', clipPath);
      filters.push(
        `[${i}:v]trim=start=${skipSeconds}` +
        `,setpts=${speedFactor}*(PTS-STARTPTS)` +
        `,trim=duration=${clip.durationSec}` + 
        `,setpts=PTS-STARTPTS` + 
        `,fps=30000/1001` + 
        `,format=yuv420p` + 
        `,lut3d=file='${escapedLutPath}'` + // 🎨 MAGIA DE COLOR AQUÍ
        `,scale=1080:1920:force_original_aspect_ratio=increase` + 
        `,crop=1080:1920[v${i}]`
      );
      concatInputs.push(`[v${i}]`);
    }

    // Input de audio
    inputs.push('-i', path.resolve(audioPath));

    const filterComplex = 
      filters.join(';') + ';' + 
      concatInputs.join('') + `concat=n=${timeline.length}:v=1:a=0[outv];` +
      `[${timeline.length}:a]atrim=duration=${totalDuration},afade=t=out:st=${fadeStart}:d=1[outa]`;

    const args = [
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-pix_fmt', 'yuv420p',  
      '-c:a', 'aac',
      '-shortest',
      '-y',
      path.resolve(outputPath),
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      // Imprimir línea de progreso (frame=... o time=...)
      const line = chunk.toString().trim();
      if (line) process.stdout.write(`\r[ffmpeg] ${line}`);
    });

    proc.stdout?.on('data', () => { /* descartar */ });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('\n[OK] Render completo:', outputPath);
        resolve();
      } else {
        const msg = stderr.split('\n').slice(-3).join('\n');
        reject(new Error(`FFmpeg exitó con código ${code}:\n${msg}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`No se pudo iniciar FFmpeg: ${err.message}`));
    });
  });
}