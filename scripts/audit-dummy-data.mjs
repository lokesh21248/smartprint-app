import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = ['node_modules', '.next', '.git', 'dist', 'build', '.gemini'];
const TARGET_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'];

const PATTERNS = [
  /mock/i,
  /dummy/i,
  /fake/i,
  /sample/i,
  /test.*data/i,
  /hardcode/i,
  /placeholder/i,
  /demo/i,
  /john\.doe/i,
  /example\.com/i,
  /555-555/i,
  /1234567890/i,
  /9876543210/i,
];

function scanDir(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.includes(entry.name)) {
        scanDir(fullPath, results);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TARGET_EXTS.includes(ext)) {
        // Exclude test configs or playwright tests from being flagged as bugs, but still check them
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          for (const pattern of PATTERNS) {
            if (pattern.test(line)) {
              // Ignore comments that just explain something or typescript types like 'mock' in playwright
              results.push({
                file: path.relative(process.cwd(), fullPath),
                lineNum: idx + 1,
                line: line.trim(),
                matchedPattern: pattern.toString(),
              });
              break;
            }
          }
        });
      }
    }
  }
  return results;
}

const matches = scanDir(process.cwd());
console.log(`Total pattern matches found: ${matches.length}`);

// Group by file
const byFile = {};
for (const m of matches) {
  if (!byFile[m.file]) byFile[m.file] = [];
  byFile[m.file].push(m);
}

// Print files and count
for (const [file, items] of Object.entries(byFile)) {
  console.log(`\n📄 ${file} (${items.length} occurrences):`);
  items.slice(0, 5).forEach(item => {
    console.log(`   L${item.lineNum}: ${item.line.slice(0, 100)}`);
  });
  if (items.length > 5) {
    console.log(`   ... and ${items.length - 5} more`);
  }
}
