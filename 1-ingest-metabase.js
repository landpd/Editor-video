// @ts-check
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';
import { createReadStream } from 'node:fs';


process.loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT_CSV   = path.join(__dirname, 'input', 'propiedad.csv');
const FOTOS_DIR   = path.join(__dirname, 'fotos');
const LOGOS_DIR   = path.join(__dirname, 'assets', 'logos');
const MOTION_PUB  = path.join(__dirname, 'motion', 'public');
const MOTION_SRC  = path.join(__dirname, 'motion', 'src');
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const MODEL = 'openai/gpt-4o-mini';

// ── CSV ingestion ──────────────────────────────────────────────────────────

/**
 * Lee el CSV y devuelve la primera fila como objeto plano.
 * @returns {Promise<Record<string, string>>}
 */
function readFirstRow() {
  return new Promise((resolve, reject) => {
    let resolved = false;
    /** @type {any[]} */
    const rows = [];
    createReadStream(INPUT_CSV, { encoding: 'utf-8' })
      .pipe(csv())
      .on('data', (row) => {
        if (!resolved) {
          rows.push(row);
          resolved = true;
        }
      })
      .on('end', () => {
        if (rows.length === 0) return reject(new Error('CSV vacío'));
        resolve(rows[0]);
      })
      .on('error', reject);
  });
}

// ── Image download ─────────────────────────────────────────────────────────

/**
 * Descarga una imagen y la guarda en disco.
 * @param {string} url
 * @param {string} outputPath
 */
async function downloadImage(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

// ── Logo resolver ──────────────────────────────────────────────────────────

/**
 * Busca el logo de la agencia en assets/logos siguiendo la jerarquía de
 * preferencia, con fallback a un logo por defecto.
 *
 * @param {string} companyName  Nombre limpio de la compañía.
 * @returns {string | null} Ruta absoluta del archivo encontrado, o null.
 */
function resolveLogoPath(companyName) {
  const candidates = [
    `${companyName}_imagotipo_colab_negro.png`,
    `${companyName}_imagotipo_negro.png`,
  ];

  for (const name of candidates) {
    const p = path.join(LOGOS_DIR, name);
    if (existsSync(p)) return p;
  }

  // Fallback: primer logo disponible (cualquiera)
  const fallback = 'pulppo_default.png';
  const fallbackPath = path.join(LOGOS_DIR, fallback);
  if (existsSync(fallbackPath)) return fallbackPath;

  return null;
}

// Selección de pista de audio
console.log('\n🎵 Seleccionando pista de audio aleatoria...');
const ASSETS_MUSICA_DIR = path.join(__dirname, 'assets', 'musica');
  if (existsSync(ASSETS_MUSICA_DIR)) {
    const musicFiles = readdirSync(ASSETS_MUSICA_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
    
    if (musicFiles.length > 0) {
      // Elegir una pista al azar
      const randomMusic = musicFiles[Math.floor(Math.random() * musicFiles.length)];
      const srcMusicPath = path.join(ASSETS_MUSICA_DIR, randomMusic);
      const destMusicPath = path.join(MOTION_PUB, 'audio_background.mp3'); // ✅ Nombre fijo para Remotion
      
      copyFileSync(srcMusicPath, destMusicPath);
      console.log(`   ✅ Audio copiado: ${randomMusic} → audio_background.mp3`);
    } else {
      console.warn('   ⚠️  No se encontraron archivos .mp3 en assets/musica/');
    }
  } else {
    console.warn('   ⚠️  La carpeta assets/musica/ no existe.');
  }

// ── IA copywriting ─────────────────────────────────────────────────────────

/**
 * Envía la descripción a OpenRouter y devuelve el JSON estructurado.
 *
 * @param {{ description: string, price: string, currency: string, street: string, neighborhood: string, city: string, state: string, bedrooms: string, bathrooms: string, toilettes: string, parkings: string, surface: string }} data
 * @returns {Promise<any>}
 */
async function generateCopy(data) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Eres un Director Creativo y Redactor de catálogos editoriales de arquitectura y diseño de ultra-lujo (como Architectural Digest). ' +
            'Tu tarea es crear un JSON con textos cinemáticos y aspiracionales para un anuncio inmobiliario.\n\n' +
            
            '=== REGLAS DE REDACCIÓN (Estilo Tráiler de Cine) ===\n' +
            '1. NO uses lenguaje inmobiliario genérico (ej. "lujo y confort", "excelente ubicación", "gran oportunidad").\n' +
            '2. NO menciones datos aburridos de infraestructura en las frases (PROHIBIDO hablar de escuelas, vialidades, supervías, centros comerciales, cisternas o casetas de vigilancia).\n' +
            '3. NO menciones el precio ni la moneda en el array "phrases". El precio solo va en "hero.price".\n' +
            '4. Enfócate en la experiencia de habitar el espacio, el diseño, la luz, los materiales y la exclusividad.\n' +
            '5. Las frases de "phrases" deben ser extremadamente cortas (máximo 5 o 6 palabras).\n' +
            '   - EJEMPLOS BUENOS: "Espacios que invitan a moverte.", "Más que un espacio, un refugio propio.", "Un lugar icónico para vivir.", "Donde tu historia comienza.", "Detalles que enamoran."\n\n' +
            
            '=== REGLAS DEL TITLE ===\n' +
            '- hero.title debe ser una frase atractiva corta, elegante y aspiracional. SIEMPRE iniciando con mayúscula (ej. "Algunos lugares son irrepetibles"). NUNCA uses mayúsculas sostenidas.\n\n' +
            
            'Estructura exacta del JSON de salida (sin markdown):\n' +
            '{\n' +
            '  "hero": {\n' +
            '    "title": "Frase atractiva que inicia con mayúscula",\n' +
            '    "subtitle": "Dirección corta",\n' +
            '    "price": "Precio formateado"\n' +
            '  },\n' +
            '  "phrases": [\n' +
            '    "Frase cinemática 1",\n' +
            '    "Frase cinemática 2",\n' +
            '    "Frase cinemática 3",\n' +
            '    "Frase cinemática 4",\n' +
            '    "Frase cinemática 5"\n' +
            '  ],\n' +
            '  "cobrand_logo": "logo_agencia.png"\n' +
            '}'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Descripción comercial detallada (amenidades, acabados, extras): ${data.description}` },
            { type: 'text', text: `Calle y número: ${data.street}` },
            { type: 'text', text: `Colonia o Zona: ${data.neighborhood}` },
            { type: 'text', text: `Municipio o Alcaldía: ${data.city}` },
            { type: 'text', text: `Estado: ${data.state}` },
            { type: 'text', text: `Precio: ${data.price}` },
            { type: 'text', text: `Características: ${data.bedrooms} recámaras, ${data.bathrooms} baños completos, ${data.toilettes} medios baños, ${data.parkings} estacionamientos.` },
            { type: 'text', text: `Superficie total: ${data.surface} metros cuadrados.` }
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter respondió ${response.status}: ${response.statusText}`);
  }

  const body = await response.json();
  const raw = body?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenRouter devolvió contenido vacío');

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Capitaliza estrictamente la primera letra de cualquier string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (typeof str !== 'string' || !str) return '';
  return str.trim().charAt(0).toUpperCase() + str.slice(1);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Leer CSV
  console.log('📄 Leyendo propiedad.csv...');
  const row = await readFirstRow(); 
  const companyName = row['Company: Name']?.trim() || 'Pulppo';
  const street = row['Address: Street'] || 'Dirección no disponible';
  const neighborhood = row['Address: Neighborhood: Name'] || '';
  const city = row['Address: City: Name'] || '';
  const state = row['Address: State: Name'] || '';
  const price = row['Listing: Price: Price'] || '0';
  const currency = row['Listing: Price: Currency'] || 'MXN';
  const description = row['Listing: Description'] || '';
  const picturesRaw = row['Pictures'] || '[]';
  const propertyType = row['Type'] || 'Propiedad';
  const operation = row['Listing: Operation'] === 'sale' ? 'venta' : 'renta';

  // Atributos de la propiedad
  const suites = row['Attributes: Suites'] || '0'; // Recámaras
  const bathrooms = row['Attributes: Bathrooms'] || '0'; // Baños completos
  const toilettes = row['Attributes: Toilettes'] || '0'; // Medios Baños
  const parkings = row['Attributes: Parkings'] || '0'; // Estacionamientos
  const surface = row['Attributes: TotalSurface'] || '0'; // m2 de Terreno
  const fullAddress = `${street}${neighborhood ? ', ' + neighborhood : ''}${city ? ', ' + city : ''}`;
  
  const cleanPrice = String(price).replace(/,/g, '').trim();
  const formattedPrice = `${currency === 'MXN' ? '$' : currency} ${Number(cleanPrice).toLocaleString('es-MX')} ${currency}`;
  
  const dynamicSubtitle = `${propertyType} en ${operation} en ${neighborhood}`;

  console.log(`🏠 Propiedad: ${fullAddress}`);
  console.log(`💵 Precio: ${formattedPrice}`);
  console.log(`🏢 Agencia: ${companyName}`);
  console.log(`🏘️  Tipo: ${propertyType} · ${operation} · ${neighborhood}${city ? ', ' + city : ''}${state ? ', ' + state : ''}`);
  console.log(`🛏️  ${suites} Rec. | 🚽 ${bathrooms} Baños | 🧻 ${toilettes} Medios Baños | 🚗 ${parkings} Estac. | 📐 ${surface} m²\n`);

  // 2. Descargar imágenes
  console.log('\n🖼️  Procesando imágenes...');
  mkdirSync(FOTOS_DIR, { recursive: true });
  // Limpiar fotos existentes
  const oldFiles = await fs.readdir(FOTOS_DIR).catch(() => []);
  for (const f of oldFiles) await fs.unlink(path.join(FOTOS_DIR, f)).catch(() => {});

  // Extraer URLs del formato Clojure/EDN
  const urls = [...picturesRaw.matchAll(/:url "([^"]+)"/g)].map(m => m[1]);
  console.log(`   ${urls.length} imágenes encontradas`);

  // 1. Mapeamos las descargas para que inicien TODAS al mismo tiempo (en paralelo)
  const downloadPromises = urls.map(async (url, i) => {
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const outputName = `foto_${String(i + 1).padStart(2, '0')}${ext}`;
    const outputPath = path.join(FOTOS_DIR, outputName);

    try {
      await downloadImage(url, outputPath);
      console.log(`   ✅ Descargada: ${outputName}`);
      return true; // Éxito
    } catch (/** @type {any} */ err) {
      console.warn(`   ⚠️  Error descargando ${outputName} (${url}): ${err.message}`);
      return false; // Falló, pero no detiene el pipeline
    }
  });

  // 2. Esperamos a que todo el paquete de descargas se complete en paralelo
  const results = await Promise.all(downloadPromises);
  const downloaded = results.filter(Boolean).length;
  
  console.log(`\n   🎉 ${downloaded}/${urls.length} imágenes descargadas con éxito en paralelo.`);

  // 3. Resolver logo
  console.log('\n🏷️  Resolviendo logo...');
  const logoPath = resolveLogoPath(companyName);
  if (logoPath) {
    mkdirSync(MOTION_PUB, { recursive: true });
    const dest = path.join(MOTION_PUB, 'logo_agencia.png');
    copyFileSync(logoPath, dest);
    console.log(`   ✅ Logo copiado: ${path.basename(logoPath)} → logo_agencia.png`);
  } else {
    console.warn('   ⚠️  No se encontró logo. Se usará el que esté en motion/public/ (si existe)');
  }

  // 4. IA - Copywriting
  console.log('\n✍️  Generando copy con IA...');
  try {
    /** @type {any} */
    const copyResult = await generateCopy({
      description,
      price: formattedPrice,
      currency,
      street,        // ✅ Calle sola (Medicina 24)
      neighborhood,  // ✅ Colonia (Lomas Anáhuac)
      city,          // ✅ Municipio/Alcaldía (Huixquilucan)
      state,         // ✅ Estado (Edo. de México)
      bedrooms: suites,
      bathrooms,
      toilettes, 
      parkings,  
      surface,   
    });

    // Merge IA output with our location data + dynamic subtitle
    const finalData = {
      hero: {
        title: capitalize(copyResult.hero?.title || 'propiedad de lujo'),
        subtitle: dynamicSubtitle,
        price: formattedPrice,
      },
      location: {
        neighborhood,
        city,
        state,
      },
      phrases: (Array.isArray(copyResult.phrases) ? copyResult.phrases.slice(0, 5) : [])
        .map(capitalize),
      cobrand_logo: 'logo_agencia.png',
    };

    mkdirSync(MOTION_SRC, { recursive: true });
    await fs.writeFile(
      path.join(MOTION_SRC, 'cinematic-data.json'),
      JSON.stringify(finalData, null, 2),
      'utf-8'
    );
    console.log(`   ✅ cinematic-data.json generado`);
  } catch (/** @type {any} */ err) {
    console.error(`   ❌ Error generando copy: ${err.message}`);
    // Fallback: escribir un JSON mínimo antes de salir
    const fallback = {
      hero: {
        title: 'una propiedad excepcional',
        subtitle: dynamicSubtitle,
        price: formattedPrice,
      },
      location: {
        neighborhood,
        city,
        state,
      },
      phrases: ['Diseño excepcional', 'Ubicación privilegiada', 'Calidad de vida'],
      cobrand_logo: 'logo_agencia.png',
    };
    mkdirSync(MOTION_SRC, { recursive: true });
    await fs.writeFile(
      path.join(MOTION_SRC, 'cinematic-data.json'),
      JSON.stringify(fallback, null, 2),
      'utf-8'
    );
    console.log(`   ⚠️  Fallback escrito`);
    process.exit(1);
  }

  console.log('\n✅ Fase 1 completada.');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});