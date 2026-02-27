class HTMLtoPDFConverter {
    constructor() {
        this.hiddenContainer = document.getElementById('hiddenContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.statusDiv = document.getElementById('status');
        this.pages = [];
        this.loadedFonts = new Set();
        this.loadedImages = 0;
        this.isConverting = false;
    }

    // عرض حالة العملية
    showStatus(message, type = 'info', showLoader = false) {
        this.statusDiv.innerHTML = message + (showLoader ? '<span class="loader"></span>' : '');
        this.statusDiv.className = `status ${type}`;
        this.statusDiv.style.display = 'block';
    }

    // تحديث شريط التقدم
    updateProgress(percent) {
        this.progressBar.style.display = 'block';
        this.progressFill.style.width = `${percent}%`;
    }

    // إخفاء شريط التقدم
    hideProgress() {
        this.progressBar.style.display = 'none';
    }

    // إخفاء الحالة
    hideStatus() {
        this.statusDiv.style.display = 'none';
    }

    // انتظار تحميل الخطوط الخارجية
    async waitForFonts() {
        try {
            // انتظار تحميل جميع الخطوط
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
                
                // التحقق من تحميل كل خط
                const fontFaces = Array.from(document.fonts);
                for (const font of fontFaces) {
                    try {
                        await font.load();
                    } catch (e) {
                        console.warn('خطأ في تحميل الخط:', e);
                    }
                }
            }
            
            // تأخير إضافي للخطوط الخارجية
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.warn('تحذير في تحميل الخطوط:', error);
        }
    }

    // انتظار تحميل جميع الصور
    async waitForImages(container) {
        const images = container.getElementsByTagName('img');
        const imagePromises = [];

        for (const img of images) {
            // إضافة crossorigin للصور الخارجية
            if (img.src.startsWith('http') && !img.src.includes(window.location.origin)) {
                img.crossOrigin = 'anonymous';
            }
            
            if (!img.complete) {
                const promise = new Promise((resolve) => {
                    img.onload = () => {
                        this.loadedImages++;
                        resolve();
                    };
                    img.onerror = () => {
                        console.warn('فشل تحميل الصورة:', img.src);
                        this.loadedImages++;
                        resolve();
                    };
                });
                imagePromises.push(promise);
            } else {
                this.loadedImages++;
            }
        }

        if (imagePromises.length > 0) {
            await Promise.all(imagePromises);
        }
    }

    // تحميل HTML في الحاوية المخفية
    async loadHTML(htmlString) {
        // تنظيف الحاوية
        this.hiddenContainer.innerHTML = '';
        
        // إضافة HTML إلى الحاوية المخفية
        this.hiddenContainer.innerHTML = htmlString;
        
        // انتظار تحميل الموارد
        await this.waitForFonts();
        await this.waitForImages(this.hiddenContainer);
        
        // انتظار إضافي للتأكد
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // الحصول على جميع عناصر الصفحات
    getPages() {
        return Array.from(this.hiddenContainer.querySelectorAll('.page'));
    }

    // التحقق من تحميل الصفحة بالكامل
    async ensurePageLoaded(pageElement) {
        return new Promise((resolve) => {
            // التحقق من تحمول جميع الصور في الصفحة
            const images = pageElement.getElementsByTagName('img');
            let loadedCount = 0;
            
            if (images.length === 0) {
                resolve();
                return;
            }
            
            Array.from(images).forEach(img => {
                if (img.complete) {
                    loadedCount++;
                } else {
                    img.onload = () => {
                        loadedCount++;
                        if (loadedCount === images.length) {
                            resolve();
                        }
                    };
                    img.onerror = () => {
                        loadedCount++;
                        if (loadedCount === images.length) {
                            resolve();
                        }
                    };
                }
            });
            
            if (loadedCount === images.length) {
                resolve();
            }
        });
    }

    // تحويل صفحة إلى صورة باستخدام html2canvas
    async capturePage(pageElement, pageIndex, totalPages) {
        try {
            // التأكد من تحميل الصفحة
            await this.ensurePageLoaded(pageElement);
            
            // تطبيق أنماط إضافية للتصوير
            pageElement.style.transform = 'none';
            pageElement.style.width = '210mm';
            pageElement.style.height = '297mm';
            pageElement.style.margin = '0';
            pageElement.style.padding = '20mm';
            pageElement.style.boxSizing = 'border-box';
            pageElement.style.overflow = 'hidden';
            pageElement.style.position = 'relative';
            
            // التقاط الصورة بدقة عالية
            const canvas = await html2canvas(pageElement, {
                scale: 2, // تقليل scale لتجنب مشاكل الذاكرة
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: true,
                windowWidth: 2480,
                windowHeight: 3508,
                onclone: (clonedDoc, element) => {
                    // تطبيق RTL في النسخة المستنسخة
                    const rtlElements = element.querySelectorAll('[dir="rtl"], .rtl');
                    rtlElements.forEach(el => {
                        el.style.direction = 'rtl';
                        el.style.textAlign = 'right';
                    });
                    
                    // تطبيق LTR
                    const ltrElements = element.querySelectorAll('[dir="ltr"], .ltr');
                    ltrElements.forEach(el => {
                        el.style.direction = 'ltr';
                        el.style.textAlign = 'left';
                    });
                }
            });

            this.updateProgress(((pageIndex + 1) / totalPages) * 100);
            
            return canvas;
        } catch (error) {
            console.error(`خطأ في تحويل الصفحة ${pageIndex + 1}:`, error);
            throw error;
        }
    }

    // تحويل جميع الصفحات إلى PDF
    async convertToPDF() {
        if (this.isConverting) {
            this.showStatus('جاري التحويل بالفعل...', 'info');
            return;
        }
        
        this.isConverting = true;
        
        try {
            const pages = this.getPages();
            
            if (pages.length === 0) {
                throw new Error('لا توجد صفحات للتحويل (.page غير موجودة)');
            }

            this.showStatus(`جاري تحويل ${pages.length} صفحة...`, 'info', true);
            
            // إنشاء PDF جديد بأبعاد A4
            const pdf = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [2480, 3508]
            });

            // تحويل كل صفحة على حدة
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                
                this.showStatus(`جاري تحويل الصفحة ${i + 1} من ${pages.length}...`, 'info', true);
                
                // التقاط الصفحة كصورة
                const canvas = await this.capturePage(page, i, pages.length);
                
                // إضافة الصورة إلى PDF
                const imgData = canvas.toDataURL('image/png');
                
                if (i > 0) {
                    pdf.addPage();
                }
                
                pdf.addImage(imgData, 'PNG', 0, 0, 2480, 3508, undefined, 'FAST');
                
                // تنظيف
                canvas.width = 1;
                canvas.height = 1;
            }

            this.showStatus('تم التحويل بنجاح!', 'success');
            return pdf;
            
        } catch (error) {
            this.showStatus(`خطأ: ${error.message}`, 'error');
            console.error('تفاصيل الخطأ:', error);
            throw error;
        } finally {
            this.isConverting = false;
            this.hideProgress();
        }
    }

    // تحميل ملف PDF
    downloadPDF(pdf, filename = 'document.pdf') {
        try {
            pdf.save(filename);
            this.showStatus('تم تحميل الملف بنجاح!', 'success');
        } catch (error) {
            this.showStatus(`خطأ في تحميل الملف: ${error.message}`, 'error');
        }
    }

    // تنظيف الموارد
    cleanup() {
        this.hiddenContainer.innerHTML = '';
        this.loadedFonts.clear();
        this.loadedImages = 0;
        this.hideProgress();
    }

    // معاينة HTML
    previewHTML(htmlString) {
        const previewBox = document.getElementById('previewBox');
        previewBox.innerHTML = htmlString;
        
        // تطبيق أنماط للمعاينة
        const pages = previewBox.querySelectorAll('.page');
        pages.forEach(page => {
            page.style.transform = 'scale(0.7)';
            page.style.transformOrigin = 'top center';
            page.style.margin = '20px auto';
        });
        
        this.showStatus('تم تحديث المعاينة', 'success');
    }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const converter = new HTMLtoPDFConverter();
    const htmlInput = document.getElementById('htmlInput');
    const previewBox = document.getElementById('previewBox');
    const previewBtn = document.getElementById('previewBtn');
    const convertBtn = document.getElementById('convertBtn');
    const clearBtn = document.getElementById('clearBtn');
    const sampleBtn = document.getElementById('sampleBtn');

    // نموذج HTML افتراضي
    const sampleHTML = `<!DOCTYPE html>
<html>
<head>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
    <style>
        .page {
            width: 210mm;
            height: 297mm;
            background: white;
            padding: 20mm;
            margin: 0 auto;
            box-sizing: border-box;
            font-family: 'Cairo', sans-serif;
            page-break-after: always;
            position: relative;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            border: 1px solid #ddd;
        }
        .page:last-child {
            page-break-after: auto;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 10px;
        }
        .content {
            font-size: 16px;
            line-height: 1.8;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 10px;
            min-height: 400px;
        }
        .footer {
            position: absolute;
            bottom: 20mm;
            left: 20mm;
            right: 20mm;
            text-align: center;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #ddd;
            padding-top: 10px;
        }
        .rtl {
            direction: rtl;
            text-align: right;
        }
        .ltr {
            direction: ltr;
            text-align: left;
        }
        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 20px auto;
        }
    </style>
</head>
<body>
    <div class="page rtl">
        <div class="header">
            <h1>الصفحة الأولى</h1>
        </div>
        <div class="content">
            <p>هذا نص عربي للاختبار. مرحباً بكم في نظام تحويل HTML إلى PDF.</p>
            <p>يمكنكم إضافة أي محتوى HTML هنا وسيتم تحويله بدقة عالية.</p>
            <ul>
                <li>نقطة أولى</li>
                <li>نقطة ثانية</li>
                <li>نقطة ثالثة</li>
            </ul>
        </div>
        <div class="footer">
            صفحة 1 من 3
        </div>
    </div>
    
    <div class="page ltr">
        <div class="header">
            <h1>Second Page</h1>
        </div>
        <div class="content">
            <p>This is English text for testing. Welcome to HTML to PDF converter.</p>
            <p>You can add any HTML content here and it will be converted with high quality.</p>
            <ul>
                <li>First item</li>
                <li>Second item</li>
                <li>Third item</li>
            </ul>
        </div>
        <div class="footer">
            Page 2 of 3
        </div>
    </div>
    
    <div class="page rtl">
        <div class="header">
            <h1>الصفحة الثالثة</h1>
        </div>
        <div class="content">
            <p>محتوى إضافي للصفحة الثالثة مع صورة:</p>
            <img src="https://via.placeholder.com/400x200/667eea/ffffff?text=صورة+تجريبية" alt="صورة تجريبية">
        </div>
        <div class="footer">
            صفحة 3 من 3
        </div>
    </div>
</body>
</html>`;

    // معاينة HTML
    previewBtn.addEventListener('click', () => {
        try {
            const html = htmlInput.value;
            converter.previewHTML(html);
        } catch (error) {
            converter.showStatus('خطأ في المعاينة: ' + error.message, 'error');
        }
    });

    // تحويل إلى PDF
    convertBtn.addEventListener('click', async () => {
        try {
            // تعطيل الأزرار أثناء التحويل
            convertBtn.disabled = true;
            previewBtn.disabled = true;
            
            const html = htmlInput.value;
            
            // تحميل HTML
            await converter.loadHTML(html);
            
            // تحويل إلى PDF
            const pdf = await converter.convertToPDF();
            
            if (pdf) {
                // تحميل الملف
                converter.downloadPDF(pdf, 'converted-document.pdf');
            }
            
            // تنظيف
            converter.cleanup();
            
        } catch (error) {
            converter.showStatus(`خطأ: ${error.message}`, 'error');
            console.error('خطأ في التحويل:', error);
        } finally {
            // إعادة تفعيل الأزرار
            convertBtn.disabled = false;
            previewBtn.disabled = false;
        }
    });

    // مسح المحتوى
    clearBtn.addEventListener('click', () => {
        htmlInput.value = '';
        previewBox.innerHTML = '<div style="text-align: center; color: #999; padding: 50px;"><p>انقر على زر "معاينة" لعرض المحتوى</p></div>';
        converter.cleanup();
        converter.showStatus('تم مسح المحتوى', 'info');
        
        // إخفاء الحالة بعد 3 ثوان
        setTimeout(() => {
            converter.hideStatus();
        }, 3000);
    });

    // تحميل النموذج
    sampleBtn.addEventListener('click', () => {
        htmlInput.value = sampleHTML;
        converter.previewHTML(sampleHTML);
        converter.showStatus('تم تحميل النموذج', 'success');
        
        // إخفاء الحالة بعد 3 ثوان
        setTimeout(() => {
            converter.hideStatus();
        }, 3000);
    });

    // معاينة تلقائية عند تحميل الصفحة
    setTimeout(() => {
        htmlInput.value = sampleHTML;
        converter.previewHTML(sampleHTML);
    }, 500);
});