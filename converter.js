class HTMLtoPDFConverter {
    constructor() {
        this.hiddenContainer = document.getElementById('hiddenContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.statusDiv = document.getElementById('status');
        this.pages = [];
        this.loadedFonts = new Set();
        this.loadedImages = 0;
    }

    // عرض حالة العملية
    showStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
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

    // انتظار تحميل الخطوط الخارجية
    async waitForFonts() {
        try {
            // انتظار تحميل جميع الخطوط
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
                
                // التحقق من تحميل خطوط Google Fonts
                const fontFaces = [...document.fonts];
                for (const font of fontFaces) {
                    if (font.status !== 'loaded' && font.status !== 'loading') {
                        try {
                            await font.load();
                        } catch (e) {
                            console.warn('خطأ في تحميل الخط:', e);
                        }
                    }
                }
                
                await document.fonts.ready;
            }
            
            // انتظار إضافي للخطوط الخارجية
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.warn('تحذير في تحميل الخطوط:', error);
        }
    }

    // انتظار تحميل جميع الصور
    async waitForImages(container) {
        const images = container.getElementsByTagName('img');
        const imagePromises = [];

        for (const img of images) {
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

        await Promise.all(imagePromises);
    }

    // تحميل HTML في الحاوية المخفية
    async loadHTML(htmlString) {
        // تنظيف الحاوية
        this.hiddenContainer.innerHTML = '';
        
        // إضافة HTML إلى الحاوية المخفية
        const wrapper = document.createElement('div');
        wrapper.innerHTML = htmlString;
        this.hiddenContainer.appendChild(wrapper);

        // انتظار تحميل الموارد
        await this.waitForFonts();
        await this.waitForImages(this.hiddenContainer);
        
        // انتظار إضافي للتأكد
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // الحصول على جميع عناصر الصفحات
    getPages() {
        return this.hiddenContainer.querySelectorAll('.page');
    }

    // تحويل صفحة إلى صورة باستخدام html2canvas
    async capturePage(pageElement, pageIndex, totalPages) {
        try {
            // التأكد من أبعاد الصفحة
            pageElement.style.width = '210mm';
            pageElement.style.height = '297mm';
            pageElement.style.margin = '0';
            pageElement.style.padding = '0';
            pageElement.style.boxSizing = 'border-box';
            
            // التقاط الصورة بدقة عالية
            const canvas = await html2canvas(pageElement, {
                scale: 3, // دقة عالية
                useCORS: true,
                allowTaint: false,
                backgroundColor: null,
                logging: false,
                windowWidth: 2480,
                windowHeight: 3508,
                onclone: (clonedDoc, element) => {
                    // الحفاظ على اتجاه RTL في العناصر المستنسخة
                    const rtlElements = element.querySelectorAll('[dir="rtl"], .rtl');
                    rtlElements.forEach(el => {
                        el.style.direction = 'rtl';
                        el.style.textAlign = 'right';
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

    // إضافة صورة إلى PDF
    addImageToPDF(pdf, canvas, pageIndex) {
        try {
            const imgData = canvas.toDataURL('image/png');
            
            // إضافة صفحة جديدة إذا لم تكن الأولى
            if (pageIndex > 0) {
                pdf.addPage();
            }
            
            // إضافة الصورة بحجم A4 بالبكسل
            pdf.addImage(imgData, 'PNG', 0, 0, 2480, 3508, undefined, 'FAST');
            
        } catch (error) {
            console.error(`خطأ في إضافة الصفحة ${pageIndex + 1} إلى PDF:`, error);
            throw error;
        }
    }

    // تحويل جميع الصفحات إلى PDF
    async convertToPDF() {
        try {
            const pages = this.getPages();
            
            if (pages.length === 0) {
                throw new Error('لا توجد صفحات للتحويل (.page غير موجودة)');
            }

            this.showStatus(`جاري تحويل ${pages.length} صفحة...`, 'info');
            
            // إنشاء PDF جديد بأبعاد A4 بالبكسل
            const pdf = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [2480, 3508],
                hotfixes: ['px_scaling']
            });

            // تحويل كل صفحة على حدة
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                
                this.showStatus(`جاري تحويل الصفحة ${i + 1} من ${pages.length}...`, 'info');
                
                // التقاط الصفحة كصورة
                const canvas = await this.capturePage(page, i, pages.length);
                
                // إضافة الصورة إلى PDF
                this.addImageToPDF(pdf, canvas, i);
                
                // تنظيف الذاكرة
                canvas.remove();
            }

            this.showStatus('تم التحويل بنجاح! جاري تجهيز الملف للتحميل...', 'success');
            
            return pdf;
            
        } catch (error) {
            this.showStatus(`خطأ: ${error.message}`, 'error');
            throw error;
        } finally {
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

    // معالجة دفعة للصفحات (للأداء)
    async processBatch(pages, batchSize = 5) {
        const results = [];
        
        for (let i = 0; i < pages.length; i += batchSize) {
            const batch = Array.from(pages).slice(i, i + batchSize);
            const batchPromises = batch.map((page, index) => 
                this.capturePage(page, i + index, pages.length)
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // تأخير صغير بين المجموعات لتخفيف الحمل
            if (i + batchSize < pages.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }

    // تنظيف الموارد
    cleanup() {
        this.hiddenContainer.innerHTML = '';
        this.loadedFonts.clear();
        this.loadedImages = 0;
        this.hideProgress();
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

    // معاينة HTML
    previewBtn.addEventListener('click', () => {
        try {
            const html = htmlInput.value;
            previewBox.innerHTML = html;
            converter.showStatus('تم تحديث المعاينة', 'success');
        } catch (error) {
            converter.showStatus('خطأ في المعاينة', 'error');
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
            
            // تحميل الملف
            converter.downloadPDF(pdf);
            
            // تنظيف
            converter.cleanup();
            
        } catch (error) {
            converter.showStatus(`خطأ: ${error.message}`, 'error');
        } finally {
            // إعادة تفعيل الأزرار
            convertBtn.disabled = false;
            previewBtn.disabled = false;
        }
    });

    // مسح المحتوى
    clearBtn.addEventListener('click', () => {
        htmlInput.value = '';
        previewBox.innerHTML = '<p style="color: #999; text-align: center;">انقر على "معاينة" لعرض المحتوى</p>';
        converter.cleanup();
        converter.showStatus('تم المسح', 'info');
    });
});
