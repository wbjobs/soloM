const presetThemes = {
  default: {
    name: '默认主题',
    css: `
      .markdown-body {
        color: #333;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
      }
      .markdown-body h1 {
        font-size: 2rem;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #667eea;
        color: #333;
      }
      .markdown-body h2 {
        font-size: 1.5rem;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: #444;
      }
      .markdown-body h3 {
        font-size: 1.25rem;
        margin-top: 1.25rem;
        margin-bottom: 0.5rem;
        color: #555;
      }
      .markdown-body p {
        margin-bottom: 1rem;
      }
      .markdown-body code {
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 0.9em;
        color: #e74c3c;
      }
      .markdown-body pre {
        background-color: #2d2d2d;
        color: #f8f8f2;
        padding: 16px;
        border-radius: 8px;
        overflow-x: auto;
        margin-bottom: 1rem;
      }
      .markdown-body pre code {
        background: none;
        color: inherit;
        padding: 0;
      }
      .markdown-body blockquote {
        border-left: 4px solid #667eea;
        padding: 12px 16px;
        margin: 1rem 0;
        color: #666;
        background-color: #f9f9ff;
        border-radius: 0 8px 8px 0;
      }
      .markdown-body a {
        color: #667eea;
        text-decoration: none;
      }
      .markdown-body a:hover {
        text-decoration: underline;
      }
      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 1rem;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1px solid #e8e8e8;
        padding: 8px 12px;
        text-align: left;
      }
      .markdown-body th {
        background-color: #f5f5f5;
        font-weight: 600;
      }
      .markdown-body tr:nth-child(even) {
        background-color: #fafafa;
      }
      .markdown-body ul, .markdown-body ol {
        margin-bottom: 1rem;
        padding-left: 2rem;
      }
      .markdown-body li {
        margin-bottom: 0.25rem;
      }
      .markdown-body hr {
        border: none;
        border-top: 2px solid #e8e8e8;
        margin: 2rem 0;
      }
    `
  },
  github: {
    name: 'GitHub',
    css: `
      .markdown-body {
        color: #24292e;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        line-height: 1.5;
      }
      .markdown-body h1 {
        font-size: 2em;
        font-weight: 600;
        margin: 0.67em 0;
        padding-bottom: 0.3em;
        border-bottom: 1px solid #eaecef;
      }
      .markdown-body h2 {
        font-size: 1.5em;
        font-weight: 600;
        margin-top: 24px;
        margin-bottom: 16px;
        padding-bottom: 0.3em;
        border-bottom: 1px solid #eaecef;
      }
      .markdown-body h3 {
        font-size: 1.25em;
        font-weight: 600;
        margin-top: 24px;
        margin-bottom: 16px;
      }
      .markdown-body p {
        margin-top: 0;
        margin-bottom: 16px;
      }
      .markdown-body code {
        background-color: rgba(27, 31, 35, 0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: SFMono-Regular, Consolas, monospace;
        font-size: 85%;
        color: #24292e;
      }
      .markdown-body pre {
        background-color: #f6f8fa;
        padding: 16px;
        border-radius: 3px;
        overflow: auto;
        margin-bottom: 16px;
      }
      .markdown-body pre code {
        background: none;
        padding: 0;
        color: #24292e;
      }
      .markdown-body blockquote {
        padding: 0 1em;
        color: #6a737d;
        border-left: 0.25em solid #dfe2e5;
        margin: 0 0 16px 0;
        background: transparent;
      }
      .markdown-body a {
        color: #0366d6;
        text-decoration: none;
      }
      .markdown-body a:hover {
        text-decoration: underline;
      }
      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 16px;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1px solid #dfe2e5;
        padding: 6px 13px;
      }
      .markdown-body th {
        background-color: #f6f8fa;
        font-weight: 600;
      }
      .markdown-body tr:nth-child(even) {
        background-color: #f6f8fa;
      }
      .markdown-body ul, .markdown-body ol {
        margin-bottom: 16px;
        padding-left: 2em;
      }
      .markdown-body li {
        margin-bottom: 0.25em;
      }
      .markdown-body hr {
        height: 0.25em;
        padding: 0;
        margin: 24px 0;
        background-color: #e1e4e8;
        border: 0;
      }
    `
  },
  dark: {
    name: '深色模式',
    css: `
      .markdown-body {
        color: #d4d4d4;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        background-color: #1e1e1e;
      }
      .markdown-body h1 {
        font-size: 2rem;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #569cd6;
        color: #dcdcaa;
      }
      .markdown-body h2 {
        font-size: 1.5rem;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: #4ec9b0;
      }
      .markdown-body h3 {
        font-size: 1.25rem;
        margin-top: 1.25rem;
        margin-bottom: 0.5rem;
        color: #ce9178;
      }
      .markdown-body p {
        margin-bottom: 1rem;
      }
      .markdown-body code {
        background-color: #2d2d2d;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Fira Code', 'Consolas', monospace;
        font-size: 0.9em;
        color: #ce9178;
      }
      .markdown-body pre {
        background-color: #1e1e1e;
        color: #d4d4d4;
        padding: 16px;
        border-radius: 8px;
        overflow-x: auto;
        margin-bottom: 1rem;
        border: 1px solid #3c3c3c;
      }
      .markdown-body pre code {
        background: none;
        color: inherit;
        padding: 0;
      }
      .markdown-body blockquote {
        border-left: 4px solid #569cd6;
        padding: 12px 16px;
        margin: 1rem 0;
        color: #808080;
        background-color: #252526;
        border-radius: 0 8px 8px 0;
      }
      .markdown-body a {
        color: #569cd6;
        text-decoration: none;
      }
      .markdown-body a:hover {
        text-decoration: underline;
      }
      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 1rem;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1px solid #3c3c3c;
        padding: 8px 12px;
        text-align: left;
      }
      .markdown-body th {
        background-color: #2d2d2d;
        font-weight: 600;
        color: #dcdcaa;
      }
      .markdown-body tr:nth-child(even) {
        background-color: #252526;
      }
      .markdown-body ul, .markdown-body ol {
        margin-bottom: 1rem;
        padding-left: 2rem;
      }
      .markdown-body li {
        margin-bottom: 0.25rem;
      }
      .markdown-body hr {
        border: none;
        border-top: 2px solid #3c3c3c;
        margin: 2rem 0;
      }
    `
  },
  elegant: {
    name: '优雅排版',
    css: `
      .markdown-body {
        color: #2c3e50;
        font-family: 'Georgia', 'Times New Roman', serif;
        line-height: 1.8;
        letter-spacing: 0.01em;
      }
      .markdown-body h1 {
        font-size: 2.2rem;
        font-weight: 300;
        margin-bottom: 1.5rem;
        padding-bottom: 0.8rem;
        border-bottom: 1px solid #8b7355;
        color: #1a1a1a;
        text-align: center;
        letter-spacing: 0.05em;
      }
      .markdown-body h2 {
        font-size: 1.6rem;
        font-weight: 400;
        margin-top: 2rem;
        margin-bottom: 1rem;
        color: #34495e;
        position: relative;
        padding-left: 1rem;
      }
      .markdown-body h2::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.3em;
        width: 4px;
        height: 1em;
        background: #8b7355;
      }
      .markdown-body h3 {
        font-size: 1.3rem;
        font-weight: 500;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: #5d6d7e;
        font-style: italic;
      }
      .markdown-body p {
        margin-bottom: 1.2rem;
        text-align: justify;
        text-indent: 2em;
      }
      .markdown-body code {
        background-color: #f8f5f0;
        padding: 3px 8px;
        border-radius: 3px;
        font-family: 'Consolas', monospace;
        font-size: 0.85em;
        color: #a0522d;
      }
      .markdown-body pre {
        background-color: #f8f5f0;
        color: #3d3d3d;
        padding: 20px;
        border-radius: 6px;
        overflow-x: auto;
        margin-bottom: 1.5rem;
        border-left: 4px solid #8b7355;
      }
      .markdown-body pre code {
        background: none;
        color: inherit;
        padding: 0;
      }
      .markdown-body blockquote {
        border-left: none;
        padding: 24px 32px;
        margin: 2rem 0;
        color: #5d6d7e;
        background-color: #faf8f5;
        border-radius: 8px;
        font-style: italic;
        position: relative;
      }
      .markdown-body blockquote::before {
        content: '"';
        position: absolute;
        top: 10px;
        left: 15px;
        font-size: 3rem;
        color: #d4c4b0;
        font-family: Georgia, serif;
        line-height: 1;
      }
      .markdown-body a {
        color: #8b7355;
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: border-color 0.2s;
      }
      .markdown-body a:hover {
        border-bottom-color: #8b7355;
      }
      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 1.5rem;
        font-size: 0.95em;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1px solid #e0d8cc;
        padding: 12px 16px;
        text-align: left;
      }
      .markdown-body th {
        background-color: #f5f0e8;
        font-weight: 600;
        color: #5d4e37;
      }
      .markdown-body tr:nth-child(even) {
        background-color: #faf8f5;
      }
      .markdown-body ul, .markdown-body ol {
        margin-bottom: 1.2rem;
        padding-left: 2.5rem;
      }
      .markdown-body li {
        margin-bottom: 0.5rem;
      }
      .markdown-body hr {
        border: none;
        height: 1px;
        background: linear-gradient(to right, transparent, #d4c4b0, transparent);
        margin: 2.5rem 0;
      }
    `
  },
  print: {
    name: '打印优化',
    css: `
      .markdown-body {
        color: #000000;
        font-family: 'Times New Roman', serif;
        line-height: 1.6;
        font-size: 12pt;
      }
      .markdown-body h1 {
        font-size: 18pt;
        font-weight: bold;
        margin-bottom: 12pt;
        padding-bottom: 6pt;
        border-bottom: 1pt solid #000;
        text-align: center;
      }
      .markdown-body h2 {
        font-size: 16pt;
        font-weight: bold;
        margin-top: 18pt;
        margin-bottom: 10pt;
      }
      .markdown-body h3 {
        font-size: 14pt;
        font-weight: bold;
        margin-top: 14pt;
        margin-bottom: 8pt;
      }
      .markdown-body p {
        margin-bottom: 10pt;
        text-align: justify;
        orphans: 3;
        widows: 3;
      }
      .markdown-body code {
        background-color: #f0f0f0;
        padding: 1pt 4pt;
        border-radius: 2pt;
        font-family: 'Courier New', monospace;
        font-size: 10pt;
        color: #000;
      }
      .markdown-body pre {
        background-color: #f8f8f8;
        padding: 10pt;
        border: 1pt solid #ccc;
        overflow: visible;
        margin-bottom: 10pt;
        page-break-inside: avoid;
      }
      .markdown-body pre code {
        background: none;
        color: inherit;
        padding: 0;
      }
      .markdown-body blockquote {
        border-left: 2pt solid #999;
        padding: 8pt 16pt;
        margin: 12pt 0;
        color: #333;
        font-style: italic;
        page-break-inside: avoid;
      }
      .markdown-body a {
        color: #000;
        text-decoration: underline;
      }
      .markdown-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 10pt;
        page-break-inside: avoid;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1pt solid #000;
        padding: 6pt 10pt;
        text-align: left;
      }
      .markdown-body th {
        background-color: #f0f0f0;
        font-weight: bold;
      }
      .markdown-body ul, .markdown-body ol {
        margin-bottom: 10pt;
        padding-left: 24pt;
      }
      .markdown-body li {
        margin-bottom: 4pt;
      }
      .markdown-body hr {
        border: none;
        border-top: 1pt solid #000;
        margin: 16pt 0;
      }
      @page {
        margin: 2.5cm;
      }
    `
  }
};

class ThemeManager {
  constructor() {
    this.currentTheme = 'default';
    this.customCss = '';
    this.styleElement = null;
    this.customStyleElement = null;
    this.init();
  }

  init() {
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'theme-style';
    document.head.appendChild(this.styleElement);

    this.customStyleElement = document.createElement('style');
    this.customStyleElement.id = 'custom-style';
    document.head.appendChild(this.customStyleElement);

    this.loadSavedTheme();
  }

  getPresetThemes() {
    return presetThemes;
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  getCustomCss() {
    return this.customCss;
  }

  applyTheme(themeName) {
    if (!presetThemes[themeName]) {
      console.warn(`Theme "${themeName}" not found`);
      return false;
    }

    this.currentTheme = themeName;
    this.styleElement.textContent = presetThemes[themeName].css;
    this.saveTheme();
    this.updatePreviewStyle();
    return true;
  }

  applyCustomCss(css, persist = true) {
    try {
      this.validateCss(css);
      this.customCss = css;
      this.customStyleElement.textContent = css;
      
      if (persist) {
        this.saveCustomCss();
      }
      
      this.updatePreviewStyle();
      return true;
    } catch (error) {
      console.error('Invalid CSS:', error);
      throw error;
    }
  }

  validateCss(css) {
    if (typeof css !== 'string') {
      throw new Error('CSS must be a string');
    }

    if (css.length > 100000) {
      throw new Error('CSS file too large (max 100KB)');
    }

    const disallowedPatterns = [
      /expression\s*\(/gi,
      /javascript\s*:/gi,
      /@import\s+url\s*\(/gi,
      /<script/gi,
    ];

    for (const pattern of disallowedPatterns) {
      if (pattern.test(css)) {
        throw new Error('CSS contains disallowed patterns');
      }
    }

    return true;
  }

  clearCustomCss() {
    this.customCss = '';
    this.customStyleElement.textContent = '';
    localStorage.removeItem('customCss');
    this.updatePreviewStyle();
  }

  getFullCss() {
    let fullCss = '';
    
    if (presetThemes[this.currentTheme]) {
      fullCss += presetThemes[this.currentTheme].css;
    }
    
    if (this.customCss) {
      fullCss += '\n/* Custom CSS */\n' + this.customCss;
    }
    
    return fullCss;
  }

  updatePreviewStyle() {
    const preview = document.getElementById('preview');
    const stylePreview = document.getElementById('stylePreview');
    
    if (preview) {
      preview.setAttribute('data-theme', this.currentTheme);
    }
    
    if (stylePreview) {
      stylePreview.className = 'style-preview markdown-body';
      stylePreview.setAttribute('data-theme', this.currentTheme);
    }
  }

  saveTheme() {
    localStorage.setItem('currentTheme', this.currentTheme);
  }

  saveCustomCss() {
    localStorage.setItem('customCss', this.customCss);
  }

  loadSavedTheme() {
    const savedTheme = localStorage.getItem('currentTheme');
    if (savedTheme && presetThemes[savedTheme]) {
      this.applyTheme(savedTheme);
    } else {
      this.applyTheme('default');
    }

    const savedCustomCss = localStorage.getItem('customCss');
    if (savedCustomCss) {
      try {
        this.applyCustomCss(savedCustomCss, false);
      } catch (e) {
        console.warn('Failed to load saved custom CSS:', e);
        localStorage.removeItem('customCss');
      }
    }
  }

  async loadFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.name.endsWith('.css')) {
        reject(new Error('请上传 .css 格式的文件'));
        return;
      }

      if (file.size > 100 * 1024) {
        reject(new Error('CSS 文件过大 (最大 100KB)'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const css = e.target.result;
          this.applyCustomCss(css);
          resolve({ name: file.name, css });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  downloadCss(filename = 'custom-style.css') {
    const css = this.getFullCss();
    const blob = new Blob([css], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  resetToDefault() {
    this.applyTheme('default');
    this.clearCustomCss();
  }
}

const themeManager = new ThemeManager();
export default themeManager;
export { presetThemes };
