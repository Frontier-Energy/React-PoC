import { Readable, Writable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const distDir = join(process.cwd(), 'dist');
const distAssetsDir = join(distDir, 'assets');
const distIndexHtmlPath = join(distDir, 'index.html');
const distManifestPath = join(distDir, '.vite', 'manifest.json');

const bundleBudget = {
  maxEntryJsBytes: 460_000,
  maxEntryCssBytes: 400_000,
  maxTotalJsBytes: 1_060_000,
  maxTotalCssBytes: 980_000,
  maxTotalGzipBytes: 528_000,
};

const routeBudgets = [
  { label: 'app-shell', manifestKey: 'src/app-core/Layout.tsx', maxJsBytes: 360_000, maxCssBytes: 250_000 },
  { label: 'home', manifestKey: 'src/app-core/pages/Home.tsx', maxJsBytes: 5_000, maxCssBytes: 1_000 },
  { label: 'new-inspection', manifestKey: 'src/app-core/pages/NewInspection.tsx', maxJsBytes: 210_000, maxCssBytes: 160_000 },
  { label: 'fill-form', manifestKey: 'src/app-core/pages/FillForm.tsx', maxJsBytes: 300_000, maxCssBytes: 220_000 },
  { label: 'debug-inspection', manifestKey: 'src/app-core/pages/DebugInspection.tsx', maxJsBytes: 170_000, maxCssBytes: 100_000 },
  { label: 'support-console', manifestKey: 'src/app-core/pages/SupportConsole.tsx', maxJsBytes: 250_000, maxCssBytes: 180_000 },
  { label: 'my-inspections', manifestKey: 'src/app-core/pages/MyInspections.tsx', maxJsBytes: 340_000, maxCssBytes: 430_000 },
  { label: 'login', manifestKey: 'src/app-core/pages/Login.tsx', maxJsBytes: 150_000, maxCssBytes: 110_000 },
  { label: 'register', manifestKey: 'src/app-core/pages/Register.tsx', maxJsBytes: 150_000, maxCssBytes: 110_000 },
];

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const gzipSize = async (filePath) => {
  const source = readFileSync(filePath);
  let total = 0;

  await pipeline(
    Readable.from([source]),
    createGzip(),
    new Writable({
      write(chunk, _encoding, callback) {
        total += chunk.length;
        callback();
      },
    }),
  );

  return total;
};

const files = readdirSync(distAssetsDir)
  .filter((fileName) => fileName.endsWith('.js') || fileName.endsWith('.css'))
  .map((fileName) => {
    const filePath = join(distAssetsDir, fileName);

    return {
      fileName,
      filePath,
      size: statSync(filePath).size,
    };
  });

if (files.length === 0) {
  throw new Error(`No built asset files were found in ${distAssetsDir}. Run the production build before bundle:check.`);
}

const fileByName = new Map(
  files.flatMap((file) => [
    [file.fileName, file],
    [`assets/${file.fileName}`, file],
  ]),
);
const manifest = JSON.parse(readFileSync(distManifestPath, 'utf8'));
const indexHtml = readFileSync(distIndexHtmlPath, 'utf8');
const entryScriptMatch = indexHtml.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/i);
const entryStylesheetMatch = indexHtml.match(/<link[^>]+href="\/assets\/([^"]+\.css)"/i);
const entryJs = entryScriptMatch ? fileByName.get(entryScriptMatch[1]) : undefined;
const entryCss = entryStylesheetMatch ? fileByName.get(entryStylesheetMatch[1]) : undefined;
const totalJsBytes = files.filter((file) => file.fileName.endsWith('.js')).reduce((sum, file) => sum + file.size, 0);
const totalCssBytes = files.filter((file) => file.fileName.endsWith('.css')).reduce((sum, file) => sum + file.size, 0);
const gzipSizes = await Promise.all(files.map(async (file) => gzipSize(file.filePath)));
const totalGzipBytes = gzipSizes.reduce((sum, size) => sum + size, 0);

const collectRouteAssets = (manifestKey) => {
  const jsFiles = new Set();
  const cssFiles = new Set();
  const visited = new Set();

  const visit = (key) => {
    if (!key || visited.has(key)) {
      return;
    }

    visited.add(key);
    if (key === 'index.html') {
      return;
    }

    const entry = manifest[key];
    if (!entry) {
      return;
    }

    if (entry.file?.endsWith('.js')) {
      jsFiles.add(entry.file);
    }

    for (const cssFile of entry.css ?? []) {
      cssFiles.add(cssFile);
    }

    for (const importKey of entry.imports ?? []) {
      visit(importKey);
    }
  };

  visit(manifestKey);

  const jsBytes = [...jsFiles].reduce((sum, fileName) => sum + (fileByName.get(fileName)?.size ?? 0), 0);
  const cssBytes = [...cssFiles].reduce((sum, fileName) => sum + (fileByName.get(fileName)?.size ?? 0), 0);

  return { jsBytes, cssBytes, jsFiles, cssFiles };
};

const failures = [];

if (!entryJs) {
  failures.push('Missing entry JavaScript bundle referenced by dist/index.html.');
} else if (entryJs.size > bundleBudget.maxEntryJsBytes) {
  failures.push(`Entry JS bundle is ${formatBytes(entryJs.size)} and exceeds the ${formatBytes(bundleBudget.maxEntryJsBytes)} budget.`);
}

if (!entryCss) {
  failures.push('Missing entry CSS bundle referenced by dist/index.html.');
} else if (entryCss.size > bundleBudget.maxEntryCssBytes) {
  failures.push(`Entry CSS bundle is ${formatBytes(entryCss.size)} and exceeds the ${formatBytes(bundleBudget.maxEntryCssBytes)} budget.`);
}

if (totalJsBytes > bundleBudget.maxTotalJsBytes) {
  failures.push(`Total JS assets are ${formatBytes(totalJsBytes)} and exceed the ${formatBytes(bundleBudget.maxTotalJsBytes)} budget.`);
}

if (totalCssBytes > bundleBudget.maxTotalCssBytes) {
  failures.push(`Total CSS assets are ${formatBytes(totalCssBytes)} and exceed the ${formatBytes(bundleBudget.maxTotalCssBytes)} budget.`);
}

if (totalGzipBytes > bundleBudget.maxTotalGzipBytes) {
  failures.push(`Total gzipped JS/CSS assets are ${formatBytes(totalGzipBytes)} and exceed the ${formatBytes(bundleBudget.maxTotalGzipBytes)} budget.`);
}

const routeSummaries = routeBudgets.map((routeBudget) => {
  const manifestEntry = manifest[routeBudget.manifestKey];

  if (!manifestEntry) {
    failures.push(`Missing manifest entry for route budget "${routeBudget.label}" (${routeBudget.manifestKey}).`);
    return `${routeBudget.label}: missing`;
  }

  const routeAssets = collectRouteAssets(routeBudget.manifestKey);

  if (routeAssets.jsBytes > routeBudget.maxJsBytes) {
    failures.push(
      `Route "${routeBudget.label}" JS is ${formatBytes(routeAssets.jsBytes)} and exceeds the ${formatBytes(routeBudget.maxJsBytes)} budget.`,
    );
  }

  if (routeAssets.cssBytes > routeBudget.maxCssBytes) {
    failures.push(
      `Route "${routeBudget.label}" CSS is ${formatBytes(routeAssets.cssBytes)} and exceeds the ${formatBytes(routeBudget.maxCssBytes)} budget.`,
    );
  }

  return `${routeBudget.label}: JS ${formatBytes(routeAssets.jsBytes)} / CSS ${formatBytes(routeAssets.cssBytes)}`;
});

const summary = [
  `Entry JS: ${entryJs ? formatBytes(entryJs.size) : 'missing'}`,
  `Entry CSS: ${entryCss ? formatBytes(entryCss.size) : 'missing'}`,
  `Total JS: ${formatBytes(totalJsBytes)}`,
  `Total CSS: ${formatBytes(totalCssBytes)}`,
  `Total gzip: ${formatBytes(totalGzipBytes)}`,
  `Routes: ${routeSummaries.join(', ')}`,
].join(' | ');

if (failures.length > 0) {
  console.error(`Bundle size check failed. ${summary}`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`Bundle size check passed. ${summary}`);
