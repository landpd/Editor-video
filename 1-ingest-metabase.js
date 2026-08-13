// @ts-check
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
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

// ── IA copywriting ─────────────────────────────────────────────────────────

/**
 * Envía la descripción a OpenRouter y devuelve el JSON estructurado.
 *
 * @param {{ description: string, price: string, currency: string, street: string, suites: string, bathrooms: string }} data
 * @returns {Promise<object>}
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
              'Eres un Copywriter de bienes raíces de lujo. Crea un JSON con "hero" (title, subtitle, price) y "phrases" (array de 5 frases muy cortas y cinemáticas) basado en la descripción de la propiedad. ' +
              'IMPORTANTE: Traduce los datos técnicos en ganchos de venta de alto valor. ' +
              'Ejemplo: si tiene Toilettes (medios baños), destácalo. Si tiene gran superficie (TotalSurface), úsalo. ' +
              'Las frases deben ser muy cortas (máximo 6 palabras) enfocadas en estilo de vida Premium.\n\n' +
              'Estructura exacta del JSON de salida:\n' +
              '{\n' +
              '  "hero": {\n' +
              '    "title": "CONCEPTO DE LUJO (ej. RESIDENCIA EN TETELPAN)",\n' +
              '    "subtitle": "Dirección corta (ej. San Ángel, CDMX)",\n' +
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
            { type: 'text', text: `Descripción: ${data.description}` },
            { type: 'text', text: `Dirección: ${data.street}` },
            { type: 'text', text: `Precio: ${data.price} ${data.currency}` },
            { type: 'text', text: `Recámaras: ${data.suites}, Baños: ${data.bathrooms}` },
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

  // Atributos de la propiedad
  const suites = row['Attributes: Suites'] || '0'; // Recámaras
  const bathrooms = row['Attributes: Bathrooms'] || '0'; // Baños completos
  const toilettes = row['Attributes: Toilettes'] || '0'; // Medios Baños
  const parkings = row['Attributes: Parkings'] || '0'; // Estacionamientos
  const surface = row['Attributes: TotalSurface'] || '0'; // m2 de Terreno

  const fullAddress = `${street}${neighborhood ? ', ' + neighborhood : ''}${city ? ', ' + city : ''}`;
  const formattedPrice = `${currency === 'MXN' ? '$' : currency} ${Number(price).toLocaleString('es-MX')} ${currency}`;

  console.log(`🏠 Propiedad: ${fullAddress}`);
  console.log(`💵 Precio: ${formattedPrice}`);
  console.log(`🏢 Agencia: ${companyName}`);
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

  let downloaded = 0;
  for (let i = 0; i < urls.length; i++) {
    const ext = path.extname(new URL(urls[i]).pathname) || '.jpg';
    const outputName = `foto_${String(i + 1).padStart(2, '0')}${ext}`;
    const outputPath = path.join(FOTOS_DIR, outputName);

    try {
      console.log(`   ⬇️  [${i + 1}/${urls.length}] ${outputName}`);
      await downloadImage(urls[i], outputPath);
      downloaded++;
    } catch (/** @type {any} */ err) {
      console.warn(`   ⚠️  Error descargando ${urls[i]}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`   ✅ ${downloaded}/${urls.length} imágenes descargadas`);

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
    const copyResult = await generateCopy({
      description, price, currency, street,
      suites, 
      bathrooms,
    });
    mkdirSync(MOTION_SRC, { recursive: true });
    await fs.writeFile(
      path.join(MOTION_SRC, 'cinematic-data.json'),
      JSON.stringify(copyResult, null, 2),
      'utf-8'
    );
    console.log(`   ✅ cinematic-data.json generado`);
  } catch (/** @type {any} */ err) {
    console.error(`   ❌ Error generando copy: ${err.message}`);
    process.exit(1);
    // Fallback: escribir un JSON mínimo
    const fallback = {
      hero: {
        title: `${companyName}`,
        subtitle: street,
        price: `${price} ${currency}`,
      },
      phrases: ['Propiedad única', 'Ubicación privilegiada', 'Diseño excepcional'],
    };
    mkdirSync(MOTION_SRC, { recursive: true });
    await fs.writeFile(
      path.join(MOTION_SRC, 'cinematic-data.json'),
      JSON.stringify(fallback, null, 2),
      'utf-8'
    );
    console.log(`   ⚠️  Fallback escrito`);
  }

  console.log('\n✅ Fase 1 completada.');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});