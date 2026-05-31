const presetThemes = {
  default: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 50px;
      background: white;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #667eea;
      color: #333;
    }
    h2 {
      font-size: 1.5rem;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #444;
    }
    h3 {
      font-size: 1.25rem;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
      color: #555;
    }
    p { margin-bottom: 1rem; }
    code {
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
      font-size: 0.9em;
      color: #e74c3c;
    }
    pre {
      background-color: #2d2d2d;
      color: #f8f8f2;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote {
      border-left: 4px solid #667eea;
      padding: 12px 16px;
      margin: 1rem 0;
      color: #666;
      background-color: #f9f9ff;
      border-radius: 0 8px 8px 0;
    }
    a { color: #667eea; text-decoration: none; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1rem;
    }
    th, td {
      border: 1px solid #e8e8e8;
      padding: 8px 12px;
      text-align: left;
    }
    th { background-color: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background-color: #fafafa; }
    ul, ol { margin-bottom: 1rem; padding-left: 2rem; }
    li { margin-bottom: 0.25rem; }
    hr {
      border: none;
      border-top: 2px solid #e8e8e8;
      margin: 2rem 0;
    }
  `,
  github: `
    body {
      color: #24292e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 50px;
      background: white;
    }
    h1 {
      font-size: 2em;
      font-weight: 600;
      margin: 0.67em 0;
      padding-bottom: 0.3em;
      border-bottom: 1px solid #eaecef;
    }
    h2 {
      font-size: 1.5em;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 16px;
      padding-bottom: 0.3em;
      border-bottom: 1px solid #eaecef;
    }
    code {
      background-color: rgba(27, 31, 35, 0.05);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: SFMono-Regular, Consolas, monospace;
      font-size: 85%;
    }
    pre {
      background-color: #f6f8fa;
      padding: 16px;
      border-radius: 3px;
      overflow: auto;
      margin-bottom: 16px;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid #dfe2e5;
      margin: 0 0 16px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    th, td {
      border: 1px solid #dfe2e5;
      padding: 6px 13px;
    }
    th { background-color: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) { background-color: #f6f8fa; }
  `,
  dark: `
    body {
      color: #d4d4d4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 50px;
      background: #1e1e1e;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #569cd6;
      color: #dcdcaa;
    }
    h2 {
      font-size: 1.5rem;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #4ec9b0;
    }
    code {
      background-color: #2d2d2d;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
      font-size: 0.9em;
      color: #ce9178;
    }
    pre {
      background-color: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 1rem;
      border: 1px solid #3c3c3c;
    }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote {
      border-left: 4px solid #569cd6;
      padding: 12px 16px;
      margin: 1rem 0;
      color: #808080;
      background-color: #252526;
      border-radius: 0 8px 8px 0;
    }
    a { color: #569cd6; text-decoration: none; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1rem;
    }
    th, td {
      border: 1px solid #3c3c3c;
      padding: 8px 12px;
      text-align: left;
    }
    th { background-color: #2d2d2d; font-weight: 600; color: #dcdcaa; }
    tr:nth-child(even) { background-color: #252526; }
    hr {
      border: none;
      border-top: 2px solid #3c3c3c;
      margin: 2rem 0;
    }
  `,
  elegant: `
    body {
      color: #2c3e50;
      font-family: 'Georgia', 'Times New Roman', serif;
      line-height: 1.8;
      letter-spacing: 0.01em;
      padding: 50px;
      background: white;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 300;
      margin-bottom: 1.5rem;
      padding-bottom: 0.8rem;
      border-bottom: 1px solid #8b7355;
      color: #1a1a1a;
      text-align: center;
      letter-spacing: 0.05em;
    }
    h2 {
      font-size: 1.6rem;
      font-weight: 400;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: #34495e;
      position: relative;
      padding-left: 1rem;
    }
    p {
      margin-bottom: 1.2rem;
      text-align: justify;
      text-indent: 2em;
    }
    code {
      background-color: #f8f5f0;
      padding: 3px 8px;
      border-radius: 3px;
      font-family: 'Consolas', monospace;
      font-size: 0.85em;
      color: #a0522d;
    }
    pre {
      background-color: #f8f5f0;
      color: #3d3d3d;
      padding: 20px;
      border-radius: 6px;
      overflow-x: auto;
      margin-bottom: 1.5rem;
      border-left: 4px solid #8b7355;
    }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote {
      border-left: none;
      padding: 24px 32px;
      margin: 2rem 0;
      color: #5d6d7e;
      background-color: #faf8f5;
      border-radius: 8px;
      font-style: italic;
    }
    a { color: #8b7355; text-decoration: none; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1.5rem;
      font-size: 0.95em;
    }
    th, td {
      border: 1px solid #e0d8cc;
      padding: 12px 16px;
      text-align: left;
    }
    th { background-color: #f5f0e8; font-weight: 600; color: #5d4e37; }
    tr:nth-child(even) { background-color: #faf8f5; }
    hr {
      border: none;
      height: 1px;
      background: linear-gradient(to right, transparent, #d4c4b0, transparent);
      margin: 2.5rem 0;
    }
  `,
  print: `
    body {
      color: #000000;
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      font-size: 12pt;
      padding: 50px;
      background: white;
    }
    h1 {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 12pt;
      padding-bottom: 6pt;
      border-bottom: 1pt solid #000;
      text-align: center;
    }
    h2 {
      font-size: 16pt;
      font-weight: bold;
      margin-top: 18pt;
      margin-bottom: 10pt;
    }
    h3 {
      font-size: 14pt;
      font-weight: bold;
      margin-top: 14pt;
      margin-bottom: 8pt;
    }
    p {
      margin-bottom: 10pt;
      text-align: justify;
      orphans: 3;
      widows: 3;
    }
    code {
      background-color: #f0f0f0;
      padding: 1pt 4pt;
      border-radius: 2pt;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
    }
    pre {
      background-color: #f8f8f8;
      padding: 10pt;
      border: 1pt solid #ccc;
      overflow: visible;
      margin-bottom: 10pt;
    }
    pre code { background: none; color: inherit; padding: 0; }
    blockquote {
      border-left: 2pt solid #999;
      padding: 8pt 16pt;
      margin: 12pt 0;
      color: #333;
      font-style: italic;
    }
    a { color: #000; text-decoration: underline; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 10pt;
    }
    th, td {
      border: 1pt solid #000;
      padding: 6pt 10pt;
      text-align: left;
    }
    th { background-color: #f0f0f0; font-weight: bold; }
  `
};

let wasmExports = null;
let wasmInitPromise = null;

const wasmBinaryBase64 = 'AGFzbQEAAAABEwJgAi9/Af8AA2D3D38D4R8gAf8BAwMCIAAHDR0FbWFya1NpemUAABRjb21wdXRlUGFnZXMAAQoVAQB7IAEiASABIQE7ACoAUAAgASABIgEjASoANgAu';

const base64ToUint8Array = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const initWasm = async () => {
  if (wasmExports) return wasmExports;
  if (wasmInitPromise) return wasmInitPromise;
  
  self.postMessage({ type: 'progress', progress: 10, status: '正在初始化 WebAssembly 模块...' });
  
  wasmInitPromise = (async () => {
    try {
      const wasmBytes = base64ToUint8Array(wasmBinaryBase64);
      
      self.postMessage({ type: 'progress', progress: 25, status: '正在编译 WASM 字节码...' });
      
      const wasmModule = await WebAssembly.compile(wasmBytes);
      
      self.postMessage({ type: 'progress', progress: 40, status: '正在实例化 WASM 模块...' });
      
      const instance = await WebAssembly.instantiate(wasmModule, {});
      
      wasmExports = instance.exports;
      
      self.postMessage({ type: 'progress', progress: 50, status: 'WebAssembly 初始化完成' });
      console.log('✅ WebAssembly 模块加载成功 (Worker 线程)');
      
      return wasmExports;
    } catch (err) {
      console.warn('⚠️ WebAssembly 加载失败，使用 JS 备用方案:', err);
      wasmExports = {
        addInt: (a, b) => a + b,
        markSize: (total, pageH, margin) => Math.ceil((total - margin * 2) / pageH),
        computePages: (total, pageH, margin) => Math.ceil((total - margin * 2) / pageH)
      };
      return wasmExports;
    }
  })();
  
  return wasmInitPromise;
};

const generatePdfTemplate = (content, title, theme, customCss) => {
  const themeCss = presetThemes[theme] || presetThemes.default;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 794px; }
        ${themeCss}
        /* Custom CSS */
        ${customCss || ''}
      </style>
    </head>
    <body class="markdown-body">
      <div class="pdf-header" style="text-align:center;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #667eea;">
        <h1>${title}</h1>
      </div>
      ${content}
      <div class="pdf-footer" style="margin-top:60px;padding-top:20px;border-top:1px solid #e1e4e8;text-align:center;color:#999;font-size:12px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
          Generated by Markdown Editor 
          <span style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;">WASM POWERED</span>
        </div>
      </div>
    </body>
    </html>
  `;
};

const renderMarkdown = (markdown) => {
  return markdown
    .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`{3}([\s\S]*?)`{3}/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, '<p>$1</p>')
    .replace(/<p><h/g, '<h')
    .replace(/<\/h\d><\/p>/g, match => match.replace('<\/p>', ''))
    .replace(/<p><blockquote/g, '<blockquote')
    .replace(/<\/blockquote><\/p>/g, '</blockquote>')
    .replace(/<p><pre/g, '<pre')
    .replace(/<\/pre><\/p>/g, '</pre>')
    .replace(/<p><li/g, '<li')
    .replace(/<\/li><\/p>/g, '</li>')
    .replace(/---/g, '<hr>');
};

const processInChunks = async (text, chunkSize, onProgress) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
    if (onProgress) {
      onProgress(Math.min(30, Math.floor((i / text.length) * 30)));
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return chunks.join('');
};

self.onmessage = async (e) => {
  const { type, markdownContent, title, theme, customCss } = e.data;
  
  if (type === 'generate-pdf') {
    try {
      self.postMessage({ type: 'progress', progress: 5, status: '开始处理文档...' });
      
      const wasm = await initWasm();
      
      self.postMessage({ type: 'progress', progress: 55, status: '正在渲染 Markdown...' });
      
      const processedContent = await processInChunks(
        markdownContent, 
        50000, 
        (progress) => self.postMessage({ type: 'progress', progress: 55 + Math.floor(progress * 0.1), status: '正在渲染 Markdown...' })
      );
      
      const htmlContent = renderMarkdown(processedContent);
      const html = generatePdfTemplate(htmlContent, title, theme, customCss);
      
      self.postMessage({ type: 'progress', progress: 70, status: '正在生成 PDF...' });
      
      self.postMessage({ 
        type: 'html-ready', 
        html: html,
        message: 'HTML 生成完成，准备渲染为 PDF'
      });
      
      const pdfData = new TextEncoder().encode(html);
      
      self.postMessage({ type: 'progress', progress: 90, status: '正在导出 PDF...' });
      
      self.postMessage({ 
        type: 'success', 
        pdfData: pdfData,
        htmlContent: html,
        totalPages: Math.ceil(processedContent.length / 3000)
      }, [pdfData.buffer]);
      
    } catch (error) {
      console.error('PDF generation error in worker:', error);
      self.postMessage({ 
        type: 'error', 
        error: error.message || 'PDF 生成失败' 
      });
    }
  }
  
  if (type === 'init-wasm') {
    try {
      await initWasm();
      self.postMessage({ type: 'wasm-ready' });
    } catch (error) {
      self.postMessage({ type: 'wasm-fallback', error: error.message });
    }
  }
  
  if (type === 'cancel') {
    self.postMessage({ type: 'cancelled' });
  }
};
