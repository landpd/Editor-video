// @ts-check
import path from 'node:path';
import { Input, ALL_FORMATS, FilePathSource, AudioSampleSink } from 'mediabunny';
import { registerMediabunnyServer } from '@mediabunny/server';
import MusicTempo from 'music-tempo';

registerMediabunnyServer();

/**
 * Analiza un archivo de audio y retorna los timestamps de los beats
 * detectados (golpes rítmicos), usando la duración total del audio.
 *
 * @param {string} audioPath  Ruta absoluta o relativa al archivo de audio.
 * @param {number|null} manualBpm  BPM manual (opcional) para forzar la detección.
 * @returns {Promise<{ beats: number[], bpm: number } | null>}
 *   Objeto con beats (timestamps en segundos) y BPM estimado, o null si falla.
 */
export async function getAudioBeats(audioPath, manualBpm = null) {
  let input;
  const chunks = [];

  try {
    const resolvedPath = path.resolve(audioPath);

    input = new Input({
      source: new FilePathSource(resolvedPath),
      formats: ALL_FORMATS,
    });

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      console.warn('[Warning] No se encontró pista de audio primaria');
      return null;
    }

    // Iterar sobre TODOS los samples de audio en orden
    const sink = new AudioSampleSink(audioTrack);
    let sampleRate = 0;
    let numChannels = 0;

    for await (const sample of sink.samples()) {
      try {
        sampleRate = sample.sampleRate;
        numChannels = sample.numberOfChannels;
        const numFrames = sample.numberOfFrames;

        // Alocar buffer para f32 interleaved
        const byteLength = sample.allocationSize({ format: 'f32', planeIndex: 0 });
        const interleaved = new Float32Array(byteLength / Float32Array.BYTES_PER_ELEMENT);
        sample.copyTo(interleaved, { format: 'f32', planeIndex: 0 });

        // Mezclar a mono promediando canales
        const mono = new Float32Array(numFrames);
        for (let i = 0; i < numFrames; i++) {
          let sum = 0;
          for (let ch = 0; ch < numChannels; ch++) {
            sum += interleaved[i * numChannels + ch];
          }
          mono[i] = sum / numChannels;
        }

        chunks.push(mono);
      } finally {
        sample.close(); // Liberar siempre
      }
    }

    if (chunks.length === 0) {
      console.warn('[Warning] No se extrajeron samples de audio');
      return null;
    }

    // Concatenar todos los chunks en un solo Float32Array continuo
    const totalFrames = chunks.reduce((acc, c) => acc + c.length, 0);
    const audioData = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of chunks) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    // Detectar beats vía music-tempo
    const tempo = new MusicTempo(audioData);

    return {
      beats: tempo.beats,       // timestamps en segundos
      bpm: Math.round(tempo.tempo),
    };
  } catch (/** @type {any} */ err) {
    console.error(`[Error] Fallo catastrófico procesando ${audioPath}:`, err.message);
    return null;
  } finally {
    input?.dispose();
  }
}