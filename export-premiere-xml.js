// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Exporta la receta de edición a un archivo XML compatible con Adobe Premiere
 * Pro (formato FCP 7 XML / xmeml v4).
 *
 * @module exportPremiereXML
 */

/**
 * @typedef {import('./build-timeline.js').EditRecipeItem} EditRecipeItem
 */

/**
 * Convierte segundos a frames en base 30 fps (NTSC drop-frame aproximado).
 * Fórmula: frames = Math.round(segundos × 30)
 *
 * @param {number} sec  Tiempo en segundos.
 * @returns {number}     Frame equivalente redondeado.
 */
function secondsToFrames(sec) {
  return Math.round(sec * 30);
}

/**
 * Serializa un rate a string XML.
 *
 * @param {number} num  Numerador (frames por segundo).
 * @param {number} den  Denominador (normalmente 1).
 * @returns {string}    Nodo <rate>.
 */
function rateXML(num, den = 1) {
  return `<rate>
    <timebase>${num}</timebase>
    <ntsc>TRUE</ntsc>
  </rate>`;
}

/**
 * Genera el XML de timeline completo para Premiere Pro.
 *
 * @param {EditRecipeItem[]} timeline    - Receta de edición.
 * @param {string}           clipsFolder - Ruta a la carpeta de clips.
 * @param {string}           audioPath   - Ruta al archivo de audio.
 * @param {string}           outputPath  - Ruta de salida del .xml.
 * @returns {Promise<void>}
 */
export async function buildPremiereXML(timeline, clipsFolder, audioPath, outputPath) {
  const resolvedAudio = path.resolve(audioPath);
  const audioUrl = resolvedAudio.replace(/\\/g, '/');

  let totalDurationFrames = 0;
  const videoClips = [];

  for (const clip of timeline) {
    const resolvedClip = path.resolve(clipsFolder, clip.clipName);
    const clipUrl = resolvedClip.replace(/\\/g, '/');

    const skipSeconds = clip.startFraction > 0 ? 2.5 : 0;

    // in: frames desde el punto de entrada del clip original
    const inFrame = secondsToFrames(skipSeconds);
    // out: in + duración del corte en frames
    const outFrame = inFrame + secondsToFrames(clip.durationSec);
    // start: posición en la línea de tiempo (acumulativa)
    const startFrame = totalDurationFrames;
    // end: start + duración del corte
    const endFrame = startFrame + secondsToFrames(clip.durationSec);

    totalDurationFrames = endFrame;

    videoClips.push({ clipUrl, inFrame, outFrame, startFrame, endFrame, clip });
  }

  // Duración total de la línea de tiempo en frames
  const totalDuration = totalDurationFrames;

  // Construir XML
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE xmeml SYSTEM "xmeml.dtd">
<xmeml version="4">
  <sequence>
    <name>Propiedad Timeline</name>
    <duration>${totalDuration}</duration>
    ${rateXML(30)}
    <media>
      <video>
        <track>
          <!-- MASTER VIDEO TRACK -->
          ${videoClips.map((c, i) => `          <clipitem id="clip-${i}">
            <name>${c.clip.clipName}</name>
            <duration>${c.endFrame - c.startFrame}</duration>
            <rate>
              <timebase>30</timebase>
              <ntsc>TRUE</ntsc>
            </rate>
            <in>${c.inFrame}</in>
            <out>${c.outFrame}</out>
            <start>${c.startFrame}</start>
            <end>${c.endFrame}</end>
            <file id="file-${i}">
              <name>${c.clip.clipName}</name>
              <pathurl>file:///${c.clipUrl}</pathurl>
              <rate>
                <timebase>30</timebase>
                <ntsc>TRUE</ntsc>
              </rate>
              <duration>${c.outFrame}</duration>
              <media>
                <video>
                  <duration>${c.outFrame}</duration>
                  <samplecharacteristics>
                    <width>1080</width>
                    <height>1920</height>
                    <pixelaspectratio>square</pixelaspectratio>
                    <fielddominance>none</fielddominance>
                  </samplecharacteristics>
                </video>
              </media>
            </file>
            <sourcetrack>
              <mediatype>video</mediatype>
            </sourcetrack>
          </clipitem>`).join('\n          ')}
        </track>
      </video>
      <audio>
        <track>
          <!-- MASTER AUDIO TRACK -->
          <clipitem id="audio-main">
            <name>${path.basename(audioPath)}</name>
            <duration>${totalDuration}</duration>
            <rate>
              <timebase>30</timebase>
              <ntsc>TRUE</ntsc>
            </rate>
            <in>0</in>
            <out>${totalDuration}</out>
            <start>0</start>
            <end>${totalDuration}</end>
            <file id="audio-file">
              <name>${path.basename(audioPath)}</name>
              <pathurl>file:///${audioUrl}</pathurl>
              <rate>
                <timebase>30</timebase>
                <ntsc>TRUE</ntsc>
              </rate>
              <duration>${totalDuration}</duration>
              <media>
                <audio>
                  <duration>${totalDuration}</duration>
                  <samplecharacteristics>
                    <depth>16</depth>
                    <samplerate>44100</samplerate>
                  </samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>
              </media>
            </file>
            <sourcetrack>
              <mediatype>audio</mediatype>
            </sourcetrack>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;

  await fs.writeFile(outputPath, xml, 'utf-8');
  console.log(`[OK] XML exportado: ${outputPath}`);
}