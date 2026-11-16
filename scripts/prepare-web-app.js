const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const subpathDir = path.join(distDir, 'app');

if (!fs.existsSync(distDir)) {
  console.error('Folderul dist/ nu există. Rulează mai întâi `npx expo export --platform web`.');
  process.exit(1);
}

// Curățăm un eventual dist/app anterior pentru a evita copierea recursivă
if (fs.existsSync(subpathDir)) {
  fs.rmSync(subpathDir, { recursive: true, force: true });
}

// Injectăm regulile @font-face pentru Manrope direct în global-*.css pentru Web,
// cu font-weight: 100 900 pe fiecare alias `Manrope_*` ca să nu cadă pe Times New Roman.
const manropeRoot = path.join(
  distDir,
  'assets',
  'node_modules',
  '@expo-google-fonts',
  'manrope'
);
const cssDir = path.join(distDir, '_expo', 'static', 'css');

if (fs.existsSync(manropeRoot) && fs.existsSync(cssDir)) {
  const fontSpecs = [
    { dir: '400Regular', family: 'Manrope_400Regular', weight: 400 },
    { dir: '500Medium', family: 'Manrope_500Medium', weight: 500 },
    { dir: '600SemiBold', family: 'Manrope_600SemiBold', weight: 600 },
    { dir: '700Bold', family: 'Manrope_700Bold', weight: 700 },
    { dir: '800ExtraBold', family: 'Manrope_800ExtraBold', weight: 800 },
  ];

  const faceRules = [];
  for (const spec of fontSpecs) {
    const folder = path.join(manropeRoot, spec.dir);
    if (!fs.existsSync(folder)) continue;
    const ttfFile = fs.readdirSync(folder).find((f) => f.endsWith('.ttf'));
    if (!ttfFile) continue;
    const urlPath = `/app/assets/node_modules/@expo-google-fonts/manrope/${spec.dir}/${ttfFile}`;
    faceRules.push(
      `@font-face{font-family:'${spec.family}';src:url('${urlPath}') format('truetype');font-weight:100 900;font-style:normal;font-display:swap;}`
    );
    faceRules.push(
      `@font-face{font-family:'Manrope';src:url('${urlPath}') format('truetype');font-weight:${spec.weight};font-style:normal;font-display:swap;}`
    );
  }

  if (faceRules.length > 0) {
    const cssFiles = fs
      .readdirSync(cssDir)
      .filter((f) => f.startsWith('global-') && f.endsWith('.css'));
    for (const cssFile of cssFiles) {
      const cssPath = path.join(cssDir, cssFile);
      const current = fs.readFileSync(cssPath, 'utf8');
      if (!current.includes("font-family:'Manrope_800ExtraBold'")) {
        fs.writeFileSync(cssPath, `${current}\n${faceRules.join('\n')}\n`, 'utf8');
      }
    }
  }
}

const entriesToCopy = fs
  .readdirSync(distDir)
  .filter((name) => name !== 'app' && name !== '_redirects');

fs.mkdirSync(subpathDir, { recursive: true });

for (const entry of entriesToCopy) {
  const srcPath = path.join(distDir, entry);
  const destPath = path.join(subpathDir, entry);
  fs.cpSync(srcPath, destPath, { recursive: true });
}

// Regulă SPA pentru Cloudflare Pages: orice rută sub /app/* încarcă /app/index.html (fără 404 la refresh)
const redirectsContent = [
  '/app    /app/index.html   200',
  '/app/*  /app/index.html   200',
  '',
].join('\n');

fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent, 'utf8');

console.log('✓ Build-ul web a fost pregătit pentru ruta /app (dist/app + dist/_redirects).');
