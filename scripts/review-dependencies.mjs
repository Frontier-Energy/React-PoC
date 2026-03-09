import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const outputFlagIndex = args.findIndex((arg) => arg === '--output');
const outputPath = outputFlagIndex >= 0 ? resolve(args[outputFlagIndex + 1]) : null;

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (commandArgs) =>
  spawnSync(npmExecutable, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

const parseJson = (raw) => {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const outdatedResult = run(['outdated', '--json']);
const outdated = parseJson(outdatedResult.stdout) ?? {};
const outdatedPackages = Object.entries(outdated).map(([name, details]) => ({
  name,
  current: details.current,
  wanted: details.wanted,
  latest: details.latest,
  location: details.location,
}));

const auditResult = run(['audit', '--audit-level=high', '--json']);
const audit = parseJson(auditResult.stdout);
const auditVulnerabilities = audit?.metadata?.vulnerabilities ?? {};
const auditFailureReason = auditResult.stderr?.trim() || auditResult.stdout?.trim() || `exit code ${auditResult.status ?? 'unknown'}`;

const summaryLines = [
  '# Dependency review',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Audit summary',
  '',
  `- critical: ${auditVulnerabilities.critical ?? 0}`,
  `- high: ${auditVulnerabilities.high ?? 0}`,
  `- moderate: ${auditVulnerabilities.moderate ?? 0}`,
  `- low: ${auditVulnerabilities.low ?? 0}`,
  '',
  '## Outdated packages',
  '',
];

if (outdatedPackages.length === 0) {
  summaryLines.push('- none');
} else {
  for (const pkg of outdatedPackages.sort((left, right) => left.name.localeCompare(right.name))) {
    summaryLines.push(`- ${pkg.name}: ${pkg.current} -> ${pkg.latest} (wanted ${pkg.wanted}, ${pkg.location})`);
  }
}

summaryLines.push('');

if (!audit) {
  summaryLines.push('## Audit details', '', `- npm audit did not return JSON output: ${auditFailureReason}`);
} else if (audit.vulnerabilities && Object.keys(audit.vulnerabilities).length > 0) {
  summaryLines.push('## Audit details', '');
  for (const [packageName, details] of Object.entries(audit.vulnerabilities).sort(([left], [right]) => left.localeCompare(right))) {
    const via = Array.isArray(details.via)
      ? details.via
          .map((item) => (typeof item === 'string' ? item : `${item.severity}: ${item.title}`))
          .join('; ')
      : '';
    summaryLines.push(`- ${packageName}: ${details.severity} (${details.range})${via ? ` | via ${via}` : ''}`);
  }
} else {
  summaryLines.push('## Audit details', '', '- no high-or-greater audit findings');
}

const summary = summaryLines.join('\n');
console.log(summary);

if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${summary}\n`, 'utf8');
}
