import { Readable, Writable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const distAssetsDir = join(process.cwd(), 'dist', 'assets');
const distIndexHtmlPath = join(process.cwd(), 'dist', 'index.html');

const bundleBudget = {
  maxEntryJsBytes: 460_000,
  maxEntryCssBytes: 400_000,
  maxTotalJsBytes: 1_060_000,
  maxTotalCssBytes: 980_000,
  maxTotalGzipBytes: 525_000,
};

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

const indexHtml = readFileSync(distIndexHtmlPath, 'utf8');
const entryScriptMatch = indexHtml.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/i);
const entryStylesheetMatch = indexHtml.match(/<link[^>]+href="\/assets\/([^"]+\.css)"/i);
const entryJs = entryScriptMatch ? files.find((file) => file.fileName === entryScriptMatch[1]) : undefined;
const entryCss = entryStylesheetMatch ? files.find((file) => file.fileName === entryStylesheetMatch[1]) : undefined;
const totalJsBytes = files.filter((file) => file.fileName.endsWith('.js')).reduce((sum, file) => sum + file.size, 0);
const totalCssBytes = files.filter((file) => file.fileName.endsWith('.css')).reduce((sum, file) => sum + file.size, 0);
const gzipSizes = await Promise.all(files.map(async (file) => gzipSize(file.filePath)));
const totalGzipBytes = gzipSizes.reduce((sum, size) => sum + size, 0);

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

const summary = [
  `Entry JS: ${entryJs ? formatBytes(entryJs.size) : 'missing'}`,
  `Entry CSS: ${entryCss ? formatBytes(entryCss.size) : 'missing'}`,
  `Total JS: ${formatBytes(totalJsBytes)}`,
  `Total CSS: ${formatBytes(totalCssBytes)}`,
  `Total gzip: ${formatBytes(totalGzipBytes)}`,
].join(' | ');

if (failures.length > 0) {
  console.error(`Bundle size check failed. ${summary}`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`Bundle size check passed. ${summary}`);
