import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'public', 'images', 'auth', 'source');
const outputDir = path.join(projectRoot, 'public', 'images', 'auth', 'dist');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const slideDefs = [
  {
    id: 'slide-1',
    file: 'slide-1-road-damage.jpg',
    category: 'road_damage',
    caption: 'Potholes and broken roads',
    alt: 'Damaged asphalt road with visible potholes under daylight',
    focalPoint: { x: 50, y: 60 }
  },
  {
    id: 'slide-2',
    file: 'slide-2-garbage.jpg',
    category: 'garbage',
    caption: 'Garbage that has not been collected',
    alt: 'Uncollected construction debris and waste piled along a city street',
    focalPoint: { x: 50, y: 55 }
  },
  {
    id: 'slide-3',
    file: 'slide-3-waterlogging',
    file: 'slide-3-waterlogging.jpg',
    category: 'waterlogging',
    caption: 'Water standing on the road',
    alt: 'Waterlogged roadway with standing rainwater across the street surface',
    focalPoint: { x: 50, y: 50 }
  },
  {
    id: 'slide-4',
    file: 'slide-4-manhole.jpg',
    category: 'manhole',
    caption: 'Open or broken manholes',
    alt: 'Rainwater drain and manhole installation set into street pavement',
    focalPoint: { x: 50, y: 50 }
  }
];

const widths = [1080, 1600, 2200];
const slidesOutput = [];

for (const def of slideDefs) {
  const srcPath = path.join(sourceDir, def.file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`Source image missing: ${srcPath}`);
    continue;
  }

  const baseName = path.parse(def.file).name;
  console.log(`Processing ${def.file}...`);
  const image = sharp(srcPath);
  const metadata = await image.metadata();

  // Generate 24px blur placeholder
  const blurBuffer = await sharp(srcPath)
    .resize(24, null, { withoutEnlargement: true })
    .webp({ quality: 20 })
    .toBuffer();
  const blurDataURL = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  const generatedFiles = {
    avif: {},
    webp: {},
    jpeg: {}
  };

  for (const w of widths) {
    // Only generate if source width is reasonable or allow sharp resize
    const avifFile = `${baseName}-${w}.avif`;
    const webpFile = `${baseName}-${w}.webp`;
    const jpegFile = `${baseName}-${w}.jpg`;

    await sharp(srcPath)
      .resize({ width: w, withoutEnlargement: true })
      .avif({ quality: 80 })
      .toFile(path.join(outputDir, avifFile));

    await sharp(srcPath)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(outputDir, webpFile));

    await sharp(srcPath)
      .resize({ width: w, withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(path.join(outputDir, jpegFile));

    generatedFiles.avif[w] = `/images/auth/dist/${avifFile}`;
    generatedFiles.webp[w] = `/images/auth/dist/${webpFile}`;
    generatedFiles.jpeg[w] = `/images/auth/dist/${jpegFile}`;
  }

  slidesOutput.push({
    id: def.id,
    category: def.category,
    caption: def.caption,
    alt: def.alt,
    focalPoint: def.focalPoint,
    aspectRatio: `${metadata.width} / ${metadata.height}`,
    blurDataURL,
    defaultSrc: `/images/auth/dist/${baseName}-1600.webp`,
    srcset: {
      avif: widths.map(w => `/images/auth/dist/${baseName}-${w}.avif ${w}w`).join(', '),
      webp: widths.map(w => `/images/auth/dist/${baseName}-${w}.webp ${w}w`).join(', '),
      jpeg: widths.map(w => `/images/auth/dist/${baseName}-${w}.jpg ${w}w`).join(', ')
    }
  });
}

const slidesJsonPath = path.join(projectRoot, 'public', 'images', 'auth', 'slides.json');
fs.writeFileSync(slidesJsonPath, JSON.stringify(slidesOutput, null, 2), 'utf-8');
console.log(`Wrote slides configuration to ${slidesJsonPath}`);
