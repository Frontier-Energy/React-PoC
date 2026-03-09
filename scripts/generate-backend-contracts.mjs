import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const snapshotPath = resolve(repoRoot, 'contracts', 'backend.openapi.json');
const generatedPath = resolve(repoRoot, 'src', 'contracts', 'backend.generated.ts');
const defaultOpenApiUrl = 'http://localhost:5108/swagger/v1/swagger.json';
const openApiUrl = process.env.BACKEND_OPENAPI_URL || defaultOpenApiUrl;
const fromSnapshot = process.argv.includes('--from-snapshot');

const ensureParentDirectory = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const refreshSnapshot = async () => {
  const response = await fetch(openApiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch backend OpenAPI document from ${openApiUrl}: ${response.status}`);
  }

  ensureParentDirectory(snapshotPath);
  writeFileSync(snapshotPath, await response.text(), 'utf8');
};

const generateTypes = () => {
  ensureParentDirectory(generatedPath);
  if (process.platform === 'win32') {
    const generator = resolve(repoRoot, 'node_modules', '.bin', 'openapi-typescript.cmd');
    execFileSync('cmd.exe', ['/d', '/c', generator, snapshotPath, '-o', generatedPath], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return;
  }

  const generator = resolve(repoRoot, 'node_modules', '.bin', 'openapi-typescript');
  execFileSync(generator, [snapshotPath, '-o', generatedPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
};

try {
  if (!fromSnapshot) {
    await refreshSnapshot();
  }
  generateTypes();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
