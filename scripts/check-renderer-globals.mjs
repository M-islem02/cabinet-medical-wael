import fs from 'node:fs';
import path from 'node:path';

const rendererRoot = path.resolve('src/renderer');
const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
const classicScripts = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]
  .filter((match) => !/\btype=["']module["']/i.test(match[1]))
  .map((match) => path.resolve(rendererRoot, match[2]));

const declarations = new Map();
for (const filePath of classicScripts) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = lines[lineIndex].match(/^(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|class)\s+([A-Za-z_$][\w$]*))/);
    if (!match) continue;
    const identifier = match[1] || match[2];
    const entries = declarations.get(identifier) || [];
    entries.push({ file: path.relative(rendererRoot, filePath).replaceAll('\\', '/'), line: lineIndex + 1 });
    declarations.set(identifier, entries);
  }
}

const duplicates = [...declarations.entries()].filter(([, entries]) => entries.length > 1);
if (duplicates.length) {
  console.error('Duplicate top-level identifiers in classic renderer scripts:');
  for (const [name, entries] of duplicates) {
    console.error(`- ${name}: ${entries.map((entry) => `${entry.file}:${entry.line}`).join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`PASS renderer classic globals (${declarations.size} top-level identifiers)`);
}
