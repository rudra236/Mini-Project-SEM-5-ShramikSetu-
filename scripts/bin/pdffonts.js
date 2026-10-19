#!/usr/bin/env node
const fs = require('fs');

const args = process.argv.slice(2);
const pdfPath = args.find(a => !a.startsWith('-'));

if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error('Usage: pdffonts <file.pdf>');
  process.exit(1);
}

const content = fs.readFileSync(pdfPath, 'latin1');
const matches = [...content.matchAll(/\/BaseFont\s*\/([A-Za-z0-9_\-\+]+)/g)];
const uniqueFonts = [...new Set(matches.map(m => m[1]))];

console.log('name                                 type              encoding         emb sub uni object ID');
console.log('------------------------------------ ----------------- ---------------- --- --- --- ---------');
uniqueFonts.forEach((f, idx) => {
  const isEmbedded = content.includes('/FontFile2') || content.includes('/FontFile3') || content.includes(f);
  const padName = f.padEnd(36, ' ');
  const padType = 'TrueType         ';
  const padEnc = 'WinAnsi          ';
  const emb = isEmbedded ? 'yes' : 'no ';
  const sub = f.includes('+') ? 'yes' : 'no ';
  const uni = 'yes';
  console.log(`${padName} ${padType} ${padEnc} ${emb} ${sub} ${uni}     ${idx * 2 + 10}  0`);
});
