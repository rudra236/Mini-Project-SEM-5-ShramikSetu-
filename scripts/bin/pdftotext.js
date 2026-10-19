#!/usr/bin/env node
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const pdfPath = positional[0];
const outPath = positional[1] || (args.includes('-') ? '-' : null);

if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error('Usage: pdftotext <file.pdf> [output-file | -]');
  process.exit(1);
}

const data = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data });
parser.getText().then(res => {
  const text = res.text;
  if (!outPath || outPath === '-') {
    process.stdout.write(text);
  } else {
    fs.writeFileSync(outPath, text, 'utf8');
  }
}).catch(err => {
  console.error(err);
  process.exit(1);
});
