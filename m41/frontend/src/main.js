import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import themeManager from './themeManager.js';

const codeBlock = "```javascript\nfunction greet(name) {\n  console.log('Hello, ' + name + '!');\n}\n\ngreet('WebAssembly');\n```";

const defaultMarkdown = '# 欢迎使用 Markdown 编辑器 🎉\n\n这是一个基于 **WebAssembly** 的 Markdown 编辑器，支持在浏览器本地直接导出 PDF 文件，无需依赖后端服务！\n\n## 功能特点\n\n- ✅ 左侧实时编辑，右侧实时预览\n- ✅ 代码高亮支持\n- ✅ WASM 本地 PDF 导出（后台线程处理，不阻塞主线程）\n- ✅ 文档历史记录保存（支持 Emoji 和大文件）\n- ✅ 支持导入 5MB 以上的大型 Markdown 文件\n\n## 性能优化\n\n- 🚀 WASM 模块在 Web Worker 中初始化，不阻塞 UI\n- 📄 大文件分块处理，每 50KB 让出主线程\n- ⚡ 预览更新防抖，避免频繁重渲染\n\n## 代码示例\n\n' + codeBlock + '\n\n## 表格示例\n\n| 功能 | 技术栈 | 状态 |\n|------|--------|------|\n| 编辑器 | CodeMirror 6 | ✅ 完成 |\n| 预览渲染 | Marked | ✅ 完成 |\n| PDF 导出 | Web Worker + WASM | ✅ 完成 |\n| 历史记录 | SQLite UTF-8 | ✅ 完成 |\n| 大文件支持 | 分块处理 | ✅ 完成 |\n| Emoji 支持 | UTF-8 编码 | ✅ 完成 |\n\n## 引用\n\n> WebAssembly 正在改变 Web 应用的可能性边界，\n> 让高性能计算在浏览器中成为现实。\n\n---\n\n**开始编辑吧！** 点击"导出 PDF"按钮体验 WASM 的魔力 🚀\n';

marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight: (code, lang) => {
    return code;
  }
}));

marked.setOptions({
  breaks: true,
  gfm: true
});

const DEBOUNCE_DELAY = 150;
const LARGE_FILE_THRESHOLD = 1024 * 1024;

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

class MarkdownEditor {
  constructor() {
    this.view = null;
    this.currentContent = '';
    this.isLargeFile = false;
    this.init();
  }

  async init() {
    this.initEditor();
    this.initEventListeners();
    this.updatePreview(defaultMarkdown);
    this.currentContent = defaultMarkdown;
    
    import('./pdfExport.js').then(module => {
      if (module.preloadWasm) {
        setTimeout(() => module.preloadWasm(), 2000);
      }
    });
  }

  initEditor() {
    const debouncedUpdate = debounce((content) => {
      this.updatePreview(content);
    }, DEBOUNCE_DELAY);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        this.currentContent = content;
        this.updateFileSizeIndicator(content.length);
        debouncedUpdate(content);
      }
    });

    const startState = EditorState.create({
      doc: defaultMarkdown,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          addKeymap: true
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap
        ]),
        updateListener,
        EditorView.theme({
          '&': {
            height: '100%'
          },
          '.cm-content': {
            padding: '16px'
          }
        })
      ]
    });

    this.view = new EditorView({
      state: startState,
      parent: document.getElementById('editor')
    });

    this.addFileSizeIndicator();
  }

  addFileSizeIndicator() {
    const paneHeader = document.querySelector('.editor-pane .pane-header');
    if (paneHeader && !paneHeader.querySelector('.file-size')) {
      const sizeIndicator = document.createElement('span');
      sizeIndicator.className = 'file-size';
      sizeIndicator.style.cssText = `
        margin-left: auto;
        font-size: 12px;
        color: #999;
        background: #f0f0f0;
        padding: 2px 8px;
        border-radius: 4px;
      `;
      paneHeader.appendChild(sizeIndicator);
    }
  }

  updateFileSizeIndicator(size) {
    const indicator = document.querySelector('.file-size');
    if (!indicator) return;
    
    const kb = (size / 1024).toFixed(1);
    const mb = (size / 1024 / 1024).toFixed(2);
    
    this.isLargeFile = size > LARGE_FILE_THRESHOLD;
    
    if (size > 1024 * 1024) {
      indicator.textContent = `📄 ${mb} MB`;
      indicator.style.background = this.isLargeFile ? '#fff3cd' : '#f0f0f0';
      indicator.style.color = this.isLargeFile ? '#856404' : '#999';
    } else {
      indicator.textContent = `📄 ${kb} KB`;
      indicator.style.background = '#f0f0f0';
      indicator.style.color = '#999';
    }
  }

  getContent() {
    return this.view.state.doc.toString();
  }

  async setContent(content) {
    const size = content.length;
    this.updateFileSizeIndicator(size);
    
    if (size > LARGE_FILE_THRESHOLD) {
      this.showToast('检测到大文件，正在分块加载...', 'info');
      await this.setContentInChunks(content);
    } else {
      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: content
        }
      });
    }
    
    this.currentContent = content;
    this.updatePreview(content);
  }

  async setContentInChunks(content) {
    const chunkSize = 50000;
    const totalChunks = Math.ceil(content.length / chunkSize);
    
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: ''
      }
    });
    
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      const currentPos = this.view.state.doc.length;
      
      this.view.dispatch({
        changes: {
          from: currentPos,
          to: currentPos,
          insert: chunk
        }
      });
      
      const progress = Math.min(100, Math.round(((i + chunkSize) / content.length) * 100));
      this.updateFileSizeIndicator(content.length);
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.showToast(`大文件加载完成，共 ${totalChunks} 块`, 'success');
  }

  updatePreview(content) {
    const preview = document.getElementById('preview');
    
    if (content.length > 500000) {
      preview.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #999;">
          <p style="font-size: 18px; margin-bottom: 12px;">📄 文件过大 (${(content.length/1024/1024).toFixed(2)} MB)</p>
          <p>预览已暂时禁用以保证性能</p>
          <p style="margin-top: 16px; font-size: 14px;">编辑完成后可正常导出 PDF</p>
        </div>
      `;
      return;
    }
    
    try {
      const html = marked.parse(content);
      preview.innerHTML = DOMPurify.sanitize(html);
    } catch (error) {
      preview.innerHTML = `
        <div style="color: #ff4d4f; padding: 20px;">
          <strong>渲染错误:</strong> ${error.message}
        </div>
      `;
    }
  }

  initEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', () => this.saveDocument());
    document.getElementById('historyBtn').addEventListener('click', () => this.showHistory());
    document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPDF());
    
    this.initFileImport();
    this.initKeyboardShortcuts();
    this.initThemeManager();

    const modal = document.getElementById('historyModal');
    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  }

  initFileImport() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.md,.markdown,.txt';
    fileInput.style.display = 'none';
    fileInput.id = 'fileImport';
    document.body.appendChild(fileInput);
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.importFile(file);
      }
      fileInput.value = '';
    });
    
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary';
    importBtn.innerHTML = '📂 导入文件';
    importBtn.title = '支持导入 .md, .markdown, .txt 文件，最大 50MB';
    importBtn.addEventListener('click', () => fileInput.click());
    
    const toolbar = document.querySelector('.toolbar-actions');
    if (toolbar) {
      toolbar.insertBefore(importBtn, toolbar.firstChild);
    }
  }

  async importFile(file) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    
    if (file.size > 50 * 1024 * 1024) {
      this.showToast(`文件过大 (${sizeMB} MB)，最大支持 50MB`, 'error');
      return;
    }
    
    this.showToast(`正在加载文件: ${file.name} (${sizeMB} MB)...`, 'info');
    
    try {
      const content = await this.readFileInChunks(file);
      await this.setContent(content);
      this.showToast(`文件加载成功: ${file.name}`, 'success');
    } catch (error) {
      console.error('File import error:', error);
      this.showToast('文件加载失败: ' + error.message, 'error');
    }
  }

  readFileInChunks(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const chunkSize = 1024 * 1024;
      let offset = 0;
      let result = '';
      
      const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        const chunkReader = new FileReader();
        
        chunkReader.onload = (e) => {
          result += e.target.result;
          offset += chunkSize;
          
          if (offset >= file.size) {
            resolve(result);
          } else {
            setTimeout(readNextChunk, 10);
          }
        };
        
        chunkReader.onerror = () => reject(chunkReader.error);
        chunkReader.readAsText(slice, 'UTF-8');
      };
      
      readNextChunk();
    });
  }

  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          this.saveDocument();
        } else if (e.key === 'e') {
          e.preventDefault();
          this.exportPDF();
        }
      }
    });
  }

  async saveDocument() {
    const content = this.getContent();
    const title = this.extractTitle(content) || '未命名文档';
    const size = content.length;
    
    if (size > 10 * 1024 * 1024) {
      const confirmSave = confirm(`文件较大 (${(size/1024/1024).toFixed(2)} MB)，确定要保存吗？`);
      if (!confirmSave) return;
    }
    
    try {
      this.showToast('正在保存文档...', 'info');
      
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ title, content })
      });
      
      if (response.ok) {
        this.showToast('文档保存成功！', 'success');
      } else {
        const error = await response.json();
        this.showToast('保存失败: ' + (error.error || '请检查后端服务'), 'error');
      }
    } catch (error) {
      this.showToast('保存失败：' + error.message, 'error');
    }
  }

  async showHistory() {
    const modal = document.getElementById('historyModal');
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '<p style="text-align:center;color:#999;">加载中...</p>';
    modal.classList.add('show');
    
    try {
      const response = await fetch('/api/documents');
      const documents = await response.json();
      
      if (documents.length === 0) {
        historyList.innerHTML = '<p style="text-align:center;color:#999;">暂无历史记录</p>';
        return;
      }
      
      historyList.innerHTML = documents.map(doc => {
        const size = doc.content_length 
          ? (doc.content_length > 1024 * 1024 
              ? `${(doc.content_length/1024/1024).toFixed(2)} MB` 
              : `${(doc.content_length/1024).toFixed(1)} KB`)
          : '';
        
        const largeBadge = doc.is_large 
          ? '<span style="background:#fff3cd;color:#856404;padding:2px 6px;border-radius:3px;font-size:11px;margin-left:8px;">大文件</span>' 
          : '';
        
        return `
          <div class="history-item" data-id="${doc.id}">
            <div class="history-item-title">
              ${this.escapeHtml(doc.title)}
              ${size ? `<span style="color:#999;font-size:12px;margin-left:8px;">${size}</span>` : ''}
              ${largeBadge}
            </div>
            <div class="history-item-date">${new Date(doc.updated_at).toLocaleString()}</div>
            <div class="history-item-preview">${this.escapeHtml(doc.content.substring(0, 100))}...</div>
          </div>
        `;
      }).join('');
      
      historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
          const id = parseInt(item.dataset.id);
          const doc = documents.find(d => d.id === id);
          if (doc) {
            if (doc.is_large) {
              this.showToast('正在加载大文档...', 'info');
              const fullResponse = await fetch(`/api/documents/${id}`);
              const fullDoc = await fullResponse.json();
              await this.setContent(fullDoc.content);
            } else {
              await this.setContent(doc.content);
            }
            modal.classList.remove('show');
            this.showToast('已加载文档：' + doc.title, 'success');
          }
        });
      });
    } catch (error) {
      historyList.innerHTML = '<p style="text-align:center;color:red;">加载失败：' + error.message + '</p>';
    }
  }

  async exportPDF() {
    const content = this.getContent();
    const size = content.length;
    
    if (size > 10 * 1024 * 1024) {
      const confirmExport = confirm(`文档较大 (${(size/1024/1024).toFixed(2)} MB)，导出可能需要较长时间，确定继续吗？`);
      if (!confirmExport) return;
    }
    
    try {
      const title = this.extractTitle(content) || 'document';
      const currentTheme = themeManager.getCurrentTheme();
      const customCss = themeManager.getCustomCss();
      
      const { generatePdf } = await import('./pdfExport.js');
      const result = await generatePdf(content, title, currentTheme, customCss);
      
      let blob = result.blob;
      let extension = 'html';
      
      if (result.isHtml && result.rawHtml) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(result.rawHtml);
        printWindow.document.close();
        this.showToast('文档已在新窗口打开，请使用浏览器打印功能保存为 PDF', 'success');
        return;
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast(`${extension.toUpperCase()} 导出成功！`, 'success');
    } catch (error) {
      console.error('PDF export error:', error);
      this.showToast('导出失败：' + error.message, 'error');
    }
  }
  
  initThemeManager() {
    const themeBtn = document.getElementById('themeBtn');
    const themeModal = document.getElementById('themeModal');
    const closeBtn = themeModal.querySelector('.close');
    
    themeBtn.addEventListener('click', () => {
      this.openThemeModal();
      themeModal.classList.add('show');
    });
    
    closeBtn.addEventListener('click', () => themeModal.classList.remove('show'));
    themeModal.addEventListener('click', (e) => {
      if (e.target === themeModal) themeModal.classList.remove('show');
    });
    
    document.querySelectorAll('.theme-card').forEach(card => {
      card.addEventListener('click', () => this.selectTheme(card.dataset.theme));
    });
    
    this.initCssUpload();
    this.initCssEditor();
    
    this.updateThemeSelection();
  }
  
  openThemeModal() {
    const cssEditor = document.getElementById('cssEditor');
    const cssEditorArea = document.getElementById('cssEditorArea');
    const cssUploadArea = document.getElementById('cssUploadArea');
    
    const customCss = themeManager.getCustomCss();
    if (customCss) {
      cssEditor.value = customCss;
      cssUploadArea.style.display = 'none';
      cssEditorArea.style.display = 'block';
    } else {
      cssUploadArea.style.display = 'block';
      cssEditorArea.style.display = 'none';
    }
    
    this.updateThemeSelection();
    this.updateStylePreview();
  }
  
  selectTheme(themeName) {
    themeManager.applyTheme(themeName);
    this.updateThemeSelection();
    this.updateStylePreview();
    this.updatePreview(this.currentContent);
    this.showToast(`已切换到「${themeManager.getPresetThemes()[themeName].name}」`, 'success');
  }
  
  updateThemeSelection() {
    const currentTheme = themeManager.getCurrentTheme();
    document.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === currentTheme);
    });
  }
  
  updateStylePreview() {
    const preview = document.getElementById('stylePreview');
    if (preview) {
      preview.className = 'style-preview markdown-body';
      preview.setAttribute('data-theme', themeManager.getCurrentTheme());
    }
  }
  
  initCssUpload() {
    const uploadArea = document.getElementById('cssUploadArea');
    const fileInput = document.getElementById('cssFileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.importCssFile(file);
    });
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.importCssFile(file);
      fileInput.value = '';
    });
  }
  
  async importCssFile(file) {
    try {
      const result = await themeManager.loadFromFile(file);
      
      document.getElementById('currentCssName').textContent = result.name;
      document.getElementById('cssEditor').value = result.css;
      document.getElementById('cssUploadArea').style.display = 'none';
      document.getElementById('cssEditorArea').style.display = 'block';
      
      this.updatePreview(this.currentContent);
      this.updateStylePreview();
      
      this.showToast('CSS 文件加载成功！', 'success');
    } catch (error) {
      this.showToast('CSS 加载失败：' + error.message, 'error');
    }
  }
  
  initCssEditor() {
    const applyBtn = document.getElementById('applyCssBtn');
    const clearBtn = document.getElementById('clearCssBtn');
    const downloadBtn = document.getElementById('downloadCssBtn');
    const cssEditor = document.getElementById('cssEditor');
    
    applyBtn.addEventListener('click', () => {
      try {
        themeManager.applyCustomCss(cssEditor.value);
        this.updatePreview(this.currentContent);
        this.updateStylePreview();
        this.showToast('自定义样式已应用！', 'success');
      } catch (error) {
        this.showToast('CSS 应用失败：' + error.message, 'error');
      }
    });
    
    clearBtn.addEventListener('click', () => {
      themeManager.clearCustomCss();
      cssEditor.value = '';
      document.getElementById('cssUploadArea').style.display = 'block';
      document.getElementById('cssEditorArea').style.display = 'none';
      this.updatePreview(this.currentContent);
      this.updateStylePreview();
      this.showToast('自定义样式已清除', 'success');
    });
    
    downloadBtn.addEventListener('click', () => {
      themeManager.downloadCss();
      this.showToast('CSS 文件已下载', 'success');
    });
  }

  extractTitle(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach((toast, index) => {
      toast.style.bottom = `${24 + (existingToasts.length - index) * 60}px`;
    });
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 24px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 3000;
      animation: slideIn 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      ${type === 'success' ? 'background: #52c41a;' : ''}
      ${type === 'error' ? 'background: #ff4d4f;' : ''}
      ${type === 'info' ? 'background: #1890ff;' : ''}
      ${type === 'warning' ? 'background: #faad14;' : ''}
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

new MarkdownEditor();
