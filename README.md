# محوّل HTML إلى PDF — Arabic PDF Converter

محوّل HTML إلى PDF للمحتوى العربي مدعوم بـ Puppeteer (Headless Chrome)

---

## 🚀 الرفع على Render (خطوة بخطوة)

### 1. ارفع المشروع على GitHub
```
html2pdf-project/
├── server.js
├── package.json
└── public/
    └── index.html
```

### 2. أنشئ Web Service جديد على Render
- اذهب إلى [render.com](https://render.com)
- New → Web Service → ربط مع GitHub Repo

### 3. الإعدادات
```
Build Command:   npm install
Start Command:   node server.js
Node Version:    18
```

### 4. Environment Variables (مهم جداً)
```
PUPPETEER_SKIP_DOWNLOAD = true
RENDER_EXTERNAL_URL     = https://اسم-مشروعك.onrender.com
```

> ⚠️ `RENDER_EXTERNAL_URL` ضروري لتفعيل الـ anti-sleep
> احذف https:// من الاسم واكتبه بالكامل

---

## ⚙️ كيف يعمل الـ Anti-Sleep؟

- **السيرفر** يضرب `/ping` كل 14 دقيقة على نفسه
- **المتصفح (العميل)** يضرب `/ping` كل 13 دقيقة
- Render Free ينام بعد 15 دقيقة من عدم النشاط — هذا يمنعه

---

## 📁 هيكل المشروع

```
server.js        ← Express + Puppeteer API
public/
  index.html     ← الواجهة الأمامية (نفس التصميم الأصلي)
package.json     ← التبعيات
```

---

## 🔧 API

### POST /convert
```json
{
  "html": "<html>...</html>",
  "filename": "بحث_الفيزياء",
  "orientation": "a4"  // أو "slides"
}
```
يرجع: `application/pdf`

### GET /ping
```json
{ "ok": true, "time": "..." }
```

---

## 💡 نصائح للكود HTML

- كل صفحة: `<div class="page">`
- بحث A4: `width: 794px; height: 1123px`
- عروض 16:9: `width: 1280px; height: 720px`
- استخدم برومبت AI الموجود في الواجهة لتوليد كود صحيح
