import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sources = readdirSync('src', { recursive: true })
  .filter(name => /\.(?:[cm]?[jt]sx?|css|json|html|svg)$/i.test(name))
  .map(name => join('src', name));
const utf8 = new TextDecoder('utf-8', { fatal: true });

for (const file of ['index.html', 'README.md', ...sources]) {
  const bytes = readFileSync(file);
  try {
    if (utf8.decode(bytes).includes('\uFFFD')) throw new Error('replacement character');
  } catch {
    console.error(`${file}: expected UTF-8 text without replacement characters`);
    process.exitCode = 1;
  }
}
