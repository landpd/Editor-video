// @ts-check

/**
 * Construye la receta de edición: asigna clips a los cortes marcados por
 * los beats de audio, siguiendo un arco narrativo inmobiliario.
 *
 * @module buildTimeline
 */

const NARRATIVE_ARC = [
  'facade', 
  'living_room', 
  'balcony',
  'kitchen', 
  'bedroom', 
  'closet', 
  'bathroom', 
  'amenities',
];

/**
 * @typedef {import('./generate-property-metadata.js').FrameAnalysis} FrameAnalysis
 */

/**
 * @typedef {Object} EditRecipeItem
 * @property {string} clipName      - Nombre del archivo de video (ej. "toma_01.mp4").
 * @property {number} durationSec   - Duración del corte en segundos.
 * @property {number} startFraction - Fracción del clip a saltar desde el inicio (0.0-0.5).
 * @property {number} fps           - Framerate original del clip.
 */

/**
 * Genera la receta de edición a partir de los metadatos de propiedad y los
 * beats del audio. Los cortes se sincronizan con los beats y el orden de
 * clips sigue el arco narrativo predefinido.
 *
 * @param {Record<string, FrameAnalysis>} metadataMap
 *   Mapa { filename → analysis } generado por buildMetadataMap.
 * @param {number[]} beatsArray
 *   Array de timestamps (segundos) con los beats del audio.
 * @param {number} [maxVideoDurationSec=30]
 *   Duración máxima total del video en segundos.
 * @returns {EditRecipeItem[]}
 *   Receta de edición lista para el ensamblador.
 */
export function generateTimeline(metadataMap, beatsArray, maxVideoDurationSec = 30) {
  // 1. Descartar clips con calidad insuficiente
  const validClips = Object.entries(metadataMap)
    .filter(([, analysis]) => analysis.quality_score >= 6)
    .map(([name, analysis]) => ({ name, ...analysis }));

  // 2. Agrupar por room_type (solo los que están en el arco narrativo)
  /** @type {Record<string, Array<{ name: string, usable_start_fraction: number, fps: number }>>} */
  const groups = {};
  for (const room of NARRATIVE_ARC) groups[room] = [];
  for (const clip of validClips) {
    if (groups[clip.room_type]) {
      groups[clip.room_type].push({ name: clip.name, usable_start_fraction: clip.usable_start_fraction ?? 0, fps: clip.fps ?? 30 });
    }
  }

  // Puntero por cada room_type: qué índice del grupo toca mostrar
  /** @type {Record<string, number>} */
  const pointer = {};
  for (const room of NARRATIVE_ARC) pointer[room] = 0;

  // Set global de nombres de archivo ya usados
  const usedNames = new Set();

  /** @type {EditRecipeItem[]} */
  const timeline = [];
  let arcIndex = 0;         // posición en NARRATIVE_ARC
  let accumulated = 0;      // suma de duraciones

  const filteredBeats = beatsArray.filter((_, idx) => idx % 2 === 0);

  // 3. Iterar sobre los intervalos entre los beats filtrados
  for (let i = 0; i < filteredBeats.length - 1; i++) {
    const durationSec = filteredBeats[i + 1] - filteredBeats[i];
    if (durationSec <= 0) continue; 

    // Buscar el siguiente room_type con clips disponibles
    let clipFound = null;
    let attempts = 0;

    while (attempts < NARRATIVE_ARC.length) {
      const room = NARRATIVE_ARC[arcIndex % NARRATIVE_ARC.length];
      const group = groups[room];
      const idx = pointer[room];

      if (idx < group.length && !usedNames.has(group[idx].name)) {
        clipFound = group[idx];
        pointer[room] = idx + 1;
        usedNames.add(clipFound.name);
        break;
      }

      // Avanzar agresivamente: si el grupo se agotó o el clip ya se usó,
      // subimos el puntero para no revisitarlo
      if (idx < group.length) {
        // El clip actual ya fue usado antes (por Set), avanzar puntero
        pointer[room] = idx + 1;
      }

      arcIndex++;
      attempts++;
    }

    if (!clipFound) break; // No hay más clips disponibles → salir

    // Ajustar duración si el salto acumulado supera el límite
    const remainingBudget = maxVideoDurationSec - accumulated;
    const actualDuration = Math.min(durationSec, remainingBudget);

    timeline.push({
      clipName: clipFound.name,
      durationSec: actualDuration,
      startFraction: clipFound.usable_start_fraction ?? 0,
      fps: clipFound.fps ?? 30,
    });

    accumulated += actualDuration;

    // Avanzar al siguiente room_type en el arco (si aún tenemos tiempo)
    arcIndex = (arcIndex + 1) % NARRATIVE_ARC.length;

    // Cortar si alcanzamos el límite de duración
    if (accumulated >= maxVideoDurationSec) break;
  }

  return timeline;
}