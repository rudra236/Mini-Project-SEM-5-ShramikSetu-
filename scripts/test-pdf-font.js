const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

async function test() {
  const devaWoff400 = path.resolve('node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff');
  const devaWoff700 = path.resolve('node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff');
  const latinWoff400 = path.resolve('node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');

  const deva400B64 = fs.readFileSync(devaWoff400).toString('base64');
  const deva700B64 = fs.readFileSync(devaWoff700).toString('base64');
  const latin400B64 = fs.readFileSync(latinWoff400).toString('base64');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('data:font/woff;charset=utf-8;base64,${deva400B64}') format('woff');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('data:font/woff;charset=utf-8;base64,${deva700B64}') format('woff');
        font-weight: 700;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans';
        src: url('data:font/woff;charset=utf-8;base64,${latin400B64}') format('woff');
        font-weight: 400;
        font-style: normal;
      }
      body {
        font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif;
        font-size: 14px;
        margin: 0;
        padding: 20px;
      }
    </style>
    </head>
    <body>
      <h1>शिकायत अहवाल / Complaint Report</h1>
      <p>श्रमिकसेतु - रमेश कुमार - ₹500 - बकाया मजदूरी</p>
    </body>
    </html>
  `;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  fs.writeFileSync('storage/test_woff.pdf', pdfBuffer);
  const content = fs.readFileSync('storage/test_woff.pdf', 'latin1');
  const fonts = content.match(/\/BaseFont\s*\/([A-Za-z0-9_\-\+]+)/g);
  console.log('Fonts in PDF:', fonts);

  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: pdfBuffer });
  const textRes = await parser.getText();
  console.log('Extracted text:', textRes.text);
}
test().catch(console.error);
