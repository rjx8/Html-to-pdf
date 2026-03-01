'use strict';

const express   = require('express');
const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ══════════════════════════════════════════════
   MIDDLEWARE
══════════════════════════════════════════════ */
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ══════════════════════════════════════════════
   ANTI-SLEEP — يضرب نفسه كل 14 دقيقة
   يمنع Render Free من النوم
══════════════════════════════════════════════ */
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;

function startAntiSleep() {
  if (!RENDER_URL) {
    console.log('[anti-sleep] RENDER_EXTERNAL_URL غير موجود — تخطي');
    return;
  }
  const INTERVAL = 14 * 60 * 1000; // كل 14 دقيقة
  setInterval(async () => {
    try {
      const res = await fetch(`${RENDER_URL}/ping`);
      console.log(`[anti-sleep] ping → ${res.status}`);
    } catch (e) {
      console.warn('[anti-sleep] فشل الـ ping:', e.message);
    }
  }, INTERVAL);
  console.log(`[anti-sleep] ✓ نشط — يضرب ${RENDER_URL}/ping كل 14 دقيقة`);
}

/* ══════════════════════════════════════════════
   PING ENDPOINT
══════════════════════════════════════════════ */
app.get('/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ══════════════════════════════════════════════
   BROWSER POOL — مثيل واحد مشترك لأداء أفضل
══════════════════════════════════════════════ */
let browserInstance = null;
let browserLaunching = false;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (browserLaunching) {
    // انتظر حتى ينتهي الـ launch
    await new Promise(r => setTimeout(r, 500));
    return getBrowser();
  }

  browserLaunching = true;
  try {
    console.log('[browser] تشغيل Chromium...');
    browserInstance = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',   // أفضل للخطوط العربية
        '--lang=ar',
      ],
      executablePath : await chromium.executablePath(),
      headless       : chromium.headless ?? true,
      defaultViewport: null,
    });

    browserInstance.on('disconnected', () => {
      console.warn('[browser] انقطع — سيُعاد التشغيل عند الطلب القادم');
      browserInstance = null;
    });

    console.log('[browser] ✓ Chromium جاهز');
    return browserInstance;
  } finally {
    browserLaunching = false;
  }
}

/* ══════════════════════════════════════════════
   CONVERT ENDPOINT
   POST /convert
   Body: { html, filename, orientation }
   orientation: 'a4' | 'slides'
══════════════════════════════════════════════ */
app.post('/convert', async (req, res) => {
  const { html, filename = 'document', orientation = 'a4' } = req.body;

  if (!html || typeof html !== 'string' || html.trim().length < 10) {
    return res.status(400).json({ error: 'html مطلوب' });
  }

  console.log(`[convert] طلب جديد | orientation=${orientation} | حجم=${html.length} حرف`);

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    /* ── تحميل المحتوى مع انتظار الخطوط والصور ── */
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout  : 30000,
    });

    /* ── انتظار إضافي للخطوط العربية ── */
    await page.evaluate(() =>
      document.fonts.ready.catch(() => {})
    );
    await new Promise(r => setTimeout(r, 800));

    /* ── إعدادات الـ PDF حسب النوع ── */
    let pdfOptions;

    if (orientation === 'slides') {
      // عروض 16:9 — 1280×720 → 338×190mm تقريباً
      pdfOptions = {
        width          : '338mm',
        height         : '190mm',
        printBackground: true,
        margin         : { top: '0', bottom: '0', left: '0', right: '0' },
        displayHeaderFooter: false,
      };
    } else {
      // بحث A4 عمودي
      pdfOptions = {
        format         : 'A4',
        printBackground: true,
        margin         : { top: '0', bottom: '0', left: '0', right: '0' },
        displayHeaderFooter: false,
      };
    }

    /* ── إنشاء الـ PDF ── */
    const pdfBuffer = await page.pdf(pdfOptions);

    /* ── اسم الملف — تنظيف لـ Content-Disposition ── */
    const safeName = (filename || 'document')
      .replace(/[^\wأ-ي\-_]/g, '_')
      .slice(0, 60) + '.pdf';

    console.log(`[convert] ✓ PDF جاهز | ${pdfBuffer.length} bytes | ${safeName}`);

    res.set({
      'Content-Type'       : 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Content-Length'     : pdfBuffer.length,
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[convert] خطأ:', err.message);
    // أعد تشغيل المتصفح إذا انهار
    browserInstance = null;
    res.status(500).json({ error: err.message });
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
});

/* ══════════════════════════════════════════════
   START
══════════════════════════════════════════════ */
app.listen(PORT, async () => {
  console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}`);
  // سخّن المتصفح مسبقاً
  getBrowser().catch(e => console.warn('[warmup] فشل التسخين:', e.message));
  // شغّل الـ anti-sleep
  startAntiSleep();
});
