'use strict';

const express   = require('express');
const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');
const { PDFDocument } = require('pdf-lib');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ANTI-SLEEP ──
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
function startAntiSleep() {
  if (!RENDER_URL) return;
  setInterval(async () => {
    try { await fetch(`${RENDER_URL}/ping`); } catch(e) {}
  }, 14 * 60 * 1000);
  console.log(`[anti-sleep] ✓ نشط`);
}

app.get('/ping', (req, res) => res.json({ ok: true }));

// ── BROWSER POOL ──
let browserInstance = null, browserLaunching = false;
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (browserLaunching) { await new Promise(r => setTimeout(r, 600)); return getBrowser(); }
  browserLaunching = true;
  try {
    browserInstance = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox',
             '--disable-dev-shm-usage', '--disable-gpu',
             '--font-render-hinting=none', '--lang=ar'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true,
      defaultViewport: null,
    });
    browserInstance.on('disconnected', () => { browserInstance = null; });
    console.log('[browser] ✓ جاهز');
    return browserInstance;
  } finally { browserLaunching = false; }
}

// ── CORE: صوّر كل صفحة منفردة ──
async function convertHtmlToPdf(html, orientation) {
  const browser  = await getBrowser();
  const page     = await browser.newPage();

  try {
    const isSlides = orientation === 'slides';
    const vpW = isSlides ? 1280 : 794;
    const vpH = isSlides ? 720  : 1123;

    await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });

    // انتظر الخطوط + الصور
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1500));

    // اكتشف الصفحات وأبعادها من CSS
    const pages = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="page"]')].filter(el => {
        if (!/\bpage\b/.test(el.className || '')) return false;
        let p = el.parentElement;
        while (p && p !== document.body) {
          if (/\bpage\b/.test(p.className || '')) return false;
          p = p.parentElement;
        }
        return true;
      });

      return els.map(el => {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + window.scrollX,
          y: rect.top  + window.scrollY,
          w: Math.round(parseFloat(cs.width)  || rect.width),
          h: Math.round(parseFloat(cs.height) || rect.height),
        };
      });
    });

    if (!pages.length) throw new Error('لم يُعثر على صفحات — تأكد من class="page"');
    console.log(`[convert] ${pages.length} صفحة`);

    // صوّر كل صفحة منفردة
    const screenshots = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      await page.setViewport({ width: p.w, height: p.h, deviceScaleFactor: 2 });
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: p.x, y: p.y, width: p.w, height: p.h },
        omitBackground: false,
      });
      screenshots.push({ buffer: buf, w: p.w, h: p.h });
      console.log(`[convert] ✓ صفحة ${i+1}/${pages.length}`);
    }

    // ادمج في PDF
    const pdfDoc = await PDFDocument.create();
    const PX_TO_PT = 0.75; // 96dpi → 72pt: 1px = 0.75pt

    for (const shot of screenshots) {
      const img    = await pdfDoc.embedPng(shot.buffer);
      const wPt    = shot.w * PX_TO_PT;
      const hPt    = shot.h * PX_TO_PT;
      const pdfPg  = pdfDoc.addPage([wPt, hPt]);
      pdfPg.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    }

    const bytes = await pdfDoc.save();
    console.log(`[convert] ✓ ${(bytes.length/1024).toFixed(0)} KB`);
    return Buffer.from(bytes);

  } finally {
    await page.close().catch(() => {});
  }
}

// ── ENDPOINT ──
app.post('/convert', async (req, res) => {
  const { html, filename = 'document', orientation = 'a4' } = req.body;
  if (!html || html.trim().length < 10)
    return res.status(400).json({ error: 'html مطلوب' });

  try {
    const pdf      = await convertHtmlToPdf(html, orientation);
    const safeName = (filename).replace(/[^\wأ-ي\-_]/g,'_').slice(0,60) + '.pdf';
    res.set({
      'Content-Type'       : 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Content-Length'     : pdf.length,
    });
    res.send(pdf);
  } catch(err) {
    console.error('[convert]', err.message);
    browserInstance = null;
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 http://localhost:${PORT}`);
  getBrowser().catch(() => {});
  startAntiSleep();
});
