import { fileURLToPath } from 'node:url';
import { lint } from 'tailwind-lint/dist/linter.cjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const report = await lint({
  cwd,
  configPath: fileURLToPath(new URL('../styles/globals.css', import.meta.url)),
  patterns: ['{app,components,hooks,lib}/**/*.{ts,tsx,mts,mjs,js,jsx}', '!**/generated/**'],
  autoDiscover: false,
  fix: process.argv.includes('--fix'),
});

if (report.totalFilesProcessed === 0) {
  throw new Error('Tailwind lint did not find any source files.');
}
if (report.skippedFiles.length > 0) {
  throw new Error(`Tailwind lint skipped source files: ${report.skippedFiles.join(', ')}`);
}

const diagnostics = report.files.flatMap((file) =>
  file.diagnostics
    .filter(({ code, severity }) => code === 'suggestCanonicalClasses' || severity === 1)
    .map((diagnostic) => ({ diagnostic, path: file.path })),
);

for (const { diagnostic, path } of diagnostics) {
  const { line, character } = diagnostic.range.start;
  console.error(`${path}:${line + 1}:${character + 1} ${diagnostic.message}`);
}

if (diagnostics.length > 0) {
  console.error(`\nFound ${diagnostics.length} Tailwind issue${diagnostics.length === 1 ? '' : 's'}.`);
  process.exitCode = 1;
}
