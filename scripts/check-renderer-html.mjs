import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve('src/renderer/index.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const lines = source.split(/\r?\n/);
const ids = new Map();

for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  const line = lines[lineIndex];
  for (const match of line.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/g)) {
    const occurrences = ids.get(match[2]) || [];
    occurrences.push(lineIndex + 1);
    ids.set(match[2], occurrences);
  }
}

const duplicates = [...ids.entries()].filter(([, occurrences]) => occurrences.length > 1);
if (duplicates.length) {
  console.error('Duplicate renderer HTML IDs:');
  for (const [id, occurrences] of duplicates) {
    console.error(`- ${id}: lines ${occurrences.join(', ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`PASS renderer HTML IDs (${ids.size} unique IDs)`);
}
