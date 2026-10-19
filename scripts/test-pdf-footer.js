const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

async function test() {
  const devaWoff400 = fs.readFileSync('public/fonts/NotoSansDevanagari-Regular.woff').toString('base64');
  const devaWoff700 = fs.readFileSync('public/fonts/NotoSansDevanagari-Bold.woff').toString('base64');
  const latinWoff400 = fs.readFileSync('public/fonts/NotoSans-Regular.woff').toString('base64');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const disclaimer = 'यह श्रमिकसेतु पर संग्रहीत अभिलेखों का एक प्रणाली-जनित सारांश है। यह कोई कानूनी निर्णय, प्राथमिकी (FIR) या आदेश नहीं है। संबंधित प्राधिकारी मामले का निर्णय करेंगे।';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <style>
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('data:font/woff;charset=utf-8;base64,${devaWoff400}') format('woff');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('data:font/woff;charset=utf-8;base64,${devaWoff700}') format('woff');
        font-weight: 700;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans';
        src: url('data:font/woff;charset=utf-8;base64,${latinWoff400}') format('woff');
        font-weight: 400;
        font-style: normal;
      }
      body {
        font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #111827;
      }
      h1 { font-size: 18px; margin: 0 0 4px 0; }
    </style>
    </head>
    <body>
      <h1>श्रमिकसेतु - शिकायत अहवाल / Complaint Report</h1>
      <p>संदर्भ सं.: SS-D-2026-000001 | संस्करण: 1</p>
      <div style="border: 1px solid #ccc; padding: 10px; margin-top: 10px;">
        <strong>सेवा में:</strong> थाना प्रभारी, कल्याण पूर्व पुलिस स्टेशन<br>
        <strong>शिकायतकर्ता:</strong> रमेश कुमार (श्रमिक आईडी: SHR-W-001)<br>
        <strong>अनावेदक:</strong> विजय कन्स्ट्रक्शन (ठेकेदार आईडी: SHR-C-002)<br>
        <strong>विवरण:</strong> तय दैनिक मजदूरी ₹700, प्राप्त ₹500, बकाया ₹200.
      </div>
    </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '18mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size: 8px; font-family: 'Noto Sans Devanagari', sans-serif; color: #4b5563; width: 100%; padding: 0 12mm; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #d1d5db; padding-top: 2px;">
        <span style="max-width: 75%;">${disclaimer}</span>
        <span style="font-weight: bold; white-space: nowrap;">SS-D-2026-000001 | Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
  });

  await browser.close();
  fs.writeFileSync('storage/test_footer.pdf', pdfBuffer);

  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: pdfBuffer });
  const parsed = await parser.getText();
  console.log('Total pages:', parsed.total);
  console.log('Extracted text sample:', parsed.text);
}

test().catch(console.error);
