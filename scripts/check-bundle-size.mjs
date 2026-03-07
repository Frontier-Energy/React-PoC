import { Readable, Writable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const distAssetsDir = join(process.cwd(), 'dist', 'assets');

const bundleBudget = {
  maxMainJsBytes: 930_000,
  maxTotalJsBytes: 980_000,
  maxTotalCssBytes: 980_000,
  maxTotalGzipBytes: 500_000,
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

const mainJs = files.find((file) => /^index-.*\.js$/.test(file.fileName));
const totalJsBytes = files.filter((file) => file.fileName.endsWith('.js')).reduce((sum, file) => sum + file.size, 0);
const totalCssBytes = files.filter((file) => file.fileName.endsWith('.css')).reduce((sum, file) => sum + file.size, 0);
const gzipSizes = await Promise.all(files.map(async (file) => gzipSize(file.filePath)));
const totalGzipBytes = gzipSizes.reduce((sum, size) => sum + size, 0);

const failures = [];

if (!mainJs) {
  failures.push('Missing main application JavaScript bundle matching index-*.js.');
} else if (mainJs.size > bundleBudget.maxMainJsBytes) {
  failures.push(`Main JS bundle is ${formatBytes(mainJs.size)} and exceeds the ${formatBytes(bundleBudget.maxMainJsBytes)} budget.`);
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
  `Main JS: ${mainJs ? formatBytes(mainJs.size) : 'missing'}`,
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
