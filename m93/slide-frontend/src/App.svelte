<script>
  import { onMount } from 'svelte';
  import { initWasm, parseSlides, isWasmReady, getWasmVersion } from './wasm-loader.js';
  import Editor from './components/Editor.svelte';
  import Preview from './components/Preview.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import ScssEditor from './components/ScssEditor.svelte';
  import VersionHistory from './components/VersionHistory.svelte';

  let loading = true;
  let error = '';
  let wasmVersion = '';
  let markdown = `---
title: "SlideWasm 演示"
author: "WebAssembly + Svelte"
theme: dark
---

# SlideWasm 🎯

### WebAssembly 驱动的 Markdown 幻灯片编译器

> 用 Rust 编写核心解析器，编译为 Wasm 在浏览器中运行

---

## 功能特性

- **Rust + Wasm** — 高性能 Markdown 解析
- **实时预览** — 所见即所得的幻灯片效果
- **SCSS 变量** — 动态调整主题配色
- **版本控制** — Git 管理修改历史
- **PDF 导出** — 一键生成 PDF 文件

---

## SCSS 主题配置

在编辑器下方的主题编辑器中修改变量：

\`\`\`scss
// @category: 颜色
$primary: #e94560;
$heading_color: #e94560;
$slide_bg: #1a1a2e;
$text_color: #e0e0e0;
\`\`\`

---

## 技术架构

\`\`\`rust
#[wasm_bindgen]
pub fn parse_scss_variables(input: &str) -> String {
    let (vars, css) = parse_scss(input);
    serde_json::to_string(&ThemeResult { vars, css })
}
\`\`\`

---

## 版本控制

点击工具栏的 📜 按钮查看提交历史，支持：
- 保存快照
- 查看历史记录
- 回滚到任意版本

---

# 谢谢！ 🎉`;

  let presentation = null;
  let currentSlide = 0;
  let theme = 'dark';
  let templates = [];
  let exporting = false;

  let scss = '';
  let themeCss = '';
  let variables = [];

  let showVersionPanel = false;
  let commitMessage = '';
  let versionHistory = [];
  let projectId = 'default';

  onMount(async () => {
    try {
      await initWasm();
      wasmVersion = getWasmVersion();
      updatePresentation();
      await loadTemplates();
      await loadVersionHistory();
    } catch (e) {
      error = 'Wasm 模块加载失败: ' + e.message;
    } finally {
      loading = false;
    }
  });

  function updatePresentation() {
    if (!isWasmReady()) return;
    try {
      presentation = parseSlides(markdown);
      if (currentSlide >= presentation.slides.length) {
        currentSlide = Math.max(0, presentation.slides.length - 1);
      }
      error = '';
    } catch (e) {
      error = '解析错误: ' + e.message;
    }
  }

  $: if (isWasmReady() && markdown) {
    updatePresentation();
  }

  function handleScssUpdate(e) {
    scss = e.detail.scss;
    themeCss = e.detail.themeCss;
    variables = e.detail.variables;
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        templates = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load templates:', e);
    }
  }

  async function loadVersionHistory() {
    try {
      const res = await fetch(`/api/projects/${projectId}/history`);
      if (res.ok) {
        versionHistory = await res.json();
      } else if (res.status === 404) {
        const initRes = await fetch(`/api/projects/${projectId}/init`, { method: 'POST' });
        if (initRes.ok) {
          versionHistory = [];
        }
      }
    } catch (e) {
      console.warn('Failed to load version history:', e);
    }
  }

  async function commitVersion() {
    if (!commitMessage.trim()) {
      error = '请输入提交信息';
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          files: {
            'slides.md': markdown,
            'theme.scss': scss,
            'slides.json': JSON.stringify(presentation, null, 2),
          },
        }),
      });
      if (res.ok) {
        commitMessage = '';
        await loadVersionHistory();
      } else {
        const err = await res.json();
        error = err.detail || '提交失败';
      }
    } catch (e) {
      error = '提交失败: ' + e.message;
    }
  }

  async function checkoutVersion(commitHash) {
    try {
      const res = await fetch(`/api/projects/${projectId}/checkout/${commitHash}`);
      if (res.ok) {
        const data = await res.json();
        if (data.files['slides.md']) {
          markdown = data.files['slides.md'];
        }
        if (data.files['theme.scss']) {
          scss = data.files['theme.scss'];
        }
        await loadVersionHistory();
        showVersionPanel = false;
      }
    } catch (e) {
      error = '回滚失败: ' + e.message;
    }
  }

  async function exportPdf() {
    exporting = true;
    try {
      const exportData = {
        ...presentation,
        theme: { scss, css: themeCss, variables },
      };
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (presentation?.meta?.title || 'slides') + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const err = await res.json();
        error = '导出失败: ' + (err.detail || '未知错误');
      }
    } catch (e) {
      error = '导出失败: ' + e.message;
    } finally {
      exporting = false;
    }
  }

  function applyTemplate(tpl) {
    if (!tpl) return;
    markdown = tpl.content || markdown;
  }

  function handleKeydown(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (presentation && currentSlide < presentation.slides.length - 1) {
        currentSlide += 1;
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentSlide > 0) {
        currentSlide -= 1;
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app" class:loading>
  {#if loading}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>正在加载 WebAssembly 模块...</p>
    </div>
  {:else}
    <Toolbar
      {theme}
      {templates}
      {exporting}
      {wasmVersion}
      {presentation}
      {showVersionPanel}
      on:theme-change={() => theme = theme === 'dark' ? 'light' : 'dark'}
      on:export={exportPdf}
      on:apply-template={(e) => applyTemplate(e.detail)}
      on:toggle-versions={() => showVersionPanel = !showVersionPanel}
    />

    {#if error}
      <div class="error-bar">{error}</div>
    {/if}

    <div class="workspace">
      <div class="editor-panel">
        <div class="panel-header">
          <span class="panel-title">📝 Markdown 编辑器</span>
          <span class="slide-count">
            {presentation ? presentation.slides.length : 0} 张幻灯片
          </span>
        </div>
        <Editor bind:markdown />

        <ScssEditor
          bind:scss
          bind:themeCss
          bind:variables
          on:update={handleScssUpdate}
        />

        <div class="version-bar">
          <input
            type="text"
            bind:value={commitMessage}
            placeholder="输入提交信息...（如: 更新首页标题）"
            on:keydown={(e) => e.key === 'Enter' && commitVersion()}
          />
          <button class="commit-btn" on:click={commitVersion} disabled={!commitMessage.trim()}>
            💾 保存快照
          </button>
        </div>
      </div>

      <div class="preview-panel">
        <div class="panel-header">
          <span class="panel-title">👁 实时预览</span>
          <div class="slide-nav">
            <button
              class="nav-btn"
              disabled={currentSlide <= 0}
              on:click={() => currentSlide -= 1}
            >◀</button>
            <span class="slide-indicator">
              {currentSlide + 1} / {presentation ? presentation.slides.length : 0}
            </span>
            <button
              class="nav-btn"
              disabled={!presentation || currentSlide >= presentation.slides.length - 1}
              on:click={() => currentSlide += 1}
            >▶</button>
          </div>
        </div>
        <Preview {presentation} bind:currentSlide {theme} customCss={themeCss} />
      </div>
    </div>

    {#if showVersionPanel}
      <VersionHistory
        {versionHistory}
        on:close={() => showVersionPanel = false}
        on:checkout={(e) => checkoutVersion(e.detail)}
      />
    {/if}
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #0d0d1a;
    color: #e0e0e0;
    overflow: hidden;
    height: 100vh;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 1.5rem;
    color: #a0a0b0;
    font-size: 1.1rem;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid #2a2a4a;
    border-top-color: #e94560;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-bar {
    background: #e94560;
    color: white;
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    text-align: center;
  }

  .workspace {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .editor-panel,
  .preview-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-panel {
    border-right: 1px solid #2a2a4a;
    width: 50%;
  }

  .preview-panel {
    flex: 1;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #16162a;
    border-bottom: 1px solid #2a2a4a;
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .panel-title {
    font-weight: 600;
    color: #c0c0d0;
  }

  .slide-count {
    color: #6a6a8a;
    font-size: 0.8rem;
  }

  .slide-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-btn {
    background: #2a2a4a;
    border: none;
    color: #c0c0d0;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.2s;
  }

  .nav-btn:hover:not(:disabled) {
    background: #3a3a6a;
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .slide-indicator {
    color: #8a8aaa;
    font-size: 0.8rem;
    min-width: 4rem;
    text-align: center;
  }

  .version-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #111128;
    border-top: 1px solid #2a2a4a;
    flex-shrink: 0;
  }

  .version-bar input {
    flex: 1;
    background: #0d0d1a;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    color: #e0e0f0;
    font-size: 0.8rem;
    outline: none;
  }

  .version-bar input:focus {
    border-color: #e94560;
  }

  .commit-btn {
    background: #2e7d32;
    border: none;
    color: white;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: background 0.2s;
    white-space: nowrap;
  }

  .commit-btn:hover:not(:disabled) {
    background: #388e3c;
  }

  .commit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
