const puppeteer = require('puppeteer');

async function exportPdf(htmlFilePath, outputPath) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.goto(`file:///${htmlFilePath.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    console.log(JSON.stringify({ success: true, path: outputPath }));
  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node export_pdf.js <htmlFilePath> <outputPath>');
  process.exit(1);
}

exportPdf(args[0], args[1]);
