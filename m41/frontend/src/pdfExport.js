let pdfWorker = null;
let workerPromise = null;

const getPdfWorker = () => {
  if (pdfWorker) return pdfWorker;
  if (workerPromise) return workerPromise;
  
  workerPromise = new Promise((resolve, reject) => {
    try {
      pdfWorker = new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' });
      
      pdfWorker.onmessage = (e) => {
        if (e.data.type === 'wasm-ready') {
          console.log('✅ WASM Worker 就绪');
        } else if (e.data.type === 'wasm-fallback') {
          console.warn('⚠️ WASM 加载失败，使用备用方案');
        }
      };
      
      pdfWorker.onerror = (error) => {
        console.error('Worker 错误:', error);
        reject(error);
      };
      
      pdfWorker.postMessage({ type: 'init-wasm' });
      resolve(pdfWorker);
    } catch (error) {
      reject(error);
    }
  });
  
  return workerPromise;
};

const updateLoadingProgress = (progress, status) => {
  const loading = document.getElementById('loadingOverlay');
  if (!loading) return;
  
  let progressBar = loading.querySelector('.progress-bar');
  let progressText = loading.querySelector('.progress-text');
  
  if (!progressBar) {
    const barContainer = document.createElement('div');
    barContainer.className = 'progress-container';
    barContainer.style.cssText = `
      width: 300px;
      height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      overflow: hidden;
      margin: 16px 0;
    `;
    
    progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
      transition: width 0.3s ease;
      width: 0%;
    `;
    
    progressText = document.createElement('div');
    progressText.className = 'progress-text';
    progressText.style.cssText = `
      color: white;
      font-size: 14px;
      margin-top: 8px;
    `;
    
    barContainer.appendChild(progressBar);
    loading.appendChild(barContainer);
    loading.appendChild(progressText);
  }
  
  progressBar.style.width = `${progress}%`;
  progressText.textContent = `${status} (${progress}%)`;
};

const removeLoadingProgress = () => {
  const loading = document.getElementById('loadingOverlay');
  if (!loading) return;
  
  const progressContainer = loading.querySelector('.progress-container');
  const progressText = loading.querySelector('.progress-text');
  
  if (progressContainer) progressContainer.remove();
  if (progressText) progressText.remove();
};

export const generatePdf = async (markdownContent, title, theme = 'default', customCss = '') => {
  const loading = document.getElementById('loadingOverlay');
  if (loading) {
    loading.style.display = 'flex';
    const p = loading.querySelector('p');
    if (p) p.textContent = '正在准备 PDF 生成...';
  }
  
  removeLoadingProgress();
  updateLoadingProgress(0, '初始化 Web Worker');
  
  try {
    const worker = await getPdfWorker();
    
    return new Promise((resolve, reject) => {
      const handleMessage = (e) => {
        const { type, progress, status, pdfData, totalPages, htmlContent, error } = e.data;
        
        if (type === 'progress') {
          updateLoadingProgress(progress, status);
        } else if (type === 'html-ready') {
          console.log('✅ HTML 模板生成完成，包含自定义 CSS');
        } else if (type === 'success') {
          const blob = new Blob([pdfData], { type: 'text/html;charset=utf-8' });
          console.log(`📄 PDF 内容生成成功，共 ${totalPages} 页，主题: ${theme}`);
          
          worker.removeEventListener('message', handleMessage);
          removeLoadingProgress();
          
          if (loading) loading.style.display = 'none';
          
          if (htmlContent) {
            const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            resolve({ blob: htmlBlob, isHtml: true, rawHtml: htmlContent });
          } else {
            resolve({ blob, isHtml: false });
          }
        } else if (type === 'error') {
          worker.removeEventListener('message', handleMessage);
          removeLoadingProgress();
          
          if (loading) loading.style.display = 'none';
          reject(new Error(error || 'PDF 生成失败'));
        } else if (type === 'cancelled') {
          worker.removeEventListener('message', handleMessage);
          removeLoadingProgress();
          
          if (loading) loading.style.display = 'none';
          reject(new Error('操作已取消'));
        }
      };
      
      worker.addEventListener('message', handleMessage);
      
      worker.postMessage({
        type: 'generate-pdf',
        markdownContent: markdownContent,
        title: title,
        theme: theme,
        customCss: customCss
      });
    });
    
  } catch (error) {
    console.error('PDF generation error:', error);
    removeLoadingProgress();
    
    if (loading) loading.style.display = 'none';
    throw error;
  }
};

export const preloadWasm = async () => {
  try {
    await getPdfWorker();
    console.log('✅ WASM 模块预加载完成');
  } catch (error) {
    console.warn('⚠️ WASM 预加载失败:', error);
  }
};

export const cancelPdfGeneration = async () => {
  if (pdfWorker) {
    pdfWorker.postMessage({ type: 'cancel' });
  }
};

export const generatePdfSimple = async (markdownContent, title) => {
  const { marked } = await import('marked');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          line-height: 1.6;
        }
        h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 24px; }
        h3 { color: #555; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        pre { background: #2d2d2d; color: #f8f8f2; padding: 16px; border-radius: 8px; overflow-x: auto; }
        pre code { background: none; color: inherit; padding: 0; }
        blockquote { border-left: 4px solid #667eea; padding-left: 16px; margin: 16px 0; color: #666; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f5f5f5; }
        .pdf-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      ${marked.parse(markdownContent)}
      <div class="pdf-footer">Generated by Markdown Editor</div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return new Blob([html], { type: 'text/html' });
};
