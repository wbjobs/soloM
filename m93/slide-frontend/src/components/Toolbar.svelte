<script>
  import { createEventDispatcher } from 'svelte';

  export let theme = 'dark';
  export let templates = [];
  export let exporting = false;
  export let wasmVersion = '';
  export let presentation = null;
  export let showVersionPanel = false;

  const dispatch = createEventDispatcher();

  let showTemplateMenu = false;

  function toggleTheme() {
    dispatch('theme-change');
  }

  function handleExport() {
    dispatch('export');
  }

  function selectTemplate(tpl) {
    dispatch('apply-template', tpl);
    showTemplateMenu = false;
  }

  function closeTemplateMenu(e) {
    if (!e.target.closest('.template-dropdown')) {
      showTemplateMenu = false;
    }
  }

  function toggleVersions() {
    dispatch('toggle-versions');
  }
</script>

<svelte:window on:click={closeTemplateMenu} />

<div class="toolbar" class:light={theme === 'light'}>
  <div class="toolbar-left">
    <div class="logo">
      <span class="logo-icon">◆</span>
      <span class="logo-text">SlideWasm</span>
      {#if wasmVersion}
        <span class="version">v{wasmVersion}</span>
      {/if}
    </div>
  </div>

  <div class="toolbar-center">
    {#if presentation?.meta?.title}
      <span class="doc-title">{presentation.meta.title}</span>
    {/if}
  </div>

  <div class="toolbar-right">
    <div class="template-dropdown">
      <button
        class="tool-btn"
        on:click|stopPropagation={() => showTemplateMenu = !showTemplateMenu}
      >
        📋 模板
      </button>
      {#if showTemplateMenu && templates.length > 0}
        <div class="dropdown-menu">
          {#each templates as tpl}
            <button class="dropdown-item" on:click={() => selectTemplate(tpl)}>
              <span class="tpl-name">{tpl.name}</span>
              <span class="tpl-desc">{tpl.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class="tool-btn"
      class:version-active={showVersionPanel}
      on:click={toggleVersions}
      title="版本历史"
    >
      📜
    </button>

    <button class="tool-btn" on:click={toggleTheme}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>

    <button
      class="tool-btn export-btn"
      on:click={handleExport}
      disabled={exporting || !presentation}
    >
      {exporting ? '⏳ 导出中...' : '📄 导出 PDF'}
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #111128;
    border-bottom: 1px solid #2a2a4a;
    height: 48px;
    z-index: 100;
  }

  .toolbar.light {
    background: #f5f5fa;
    border-bottom-color: #d0d0e0;
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .logo-icon {
    color: #e94560;
    font-size: 1.2rem;
  }

  .logo-text {
    font-weight: 700;
    font-size: 1.1rem;
    color: #e0e0f0;
  }

  .toolbar.light .logo-text {
    color: #1a1a2e;
  }

  .version {
    font-size: 0.7rem;
    color: #4a4a6a;
    background: #1a1a30;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  .toolbar.light .version {
    background: #e0e0ea;
  }

  .doc-title {
    font-size: 0.9rem;
    color: #8a8aaa;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-btn {
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    color: #c0c0d0;
    padding: 0.35rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .toolbar.light .tool-btn {
    background: #ffffff;
    border-color: #d0d0e0;
    color: #3a3a5a;
  }

  .tool-btn:hover:not(:disabled) {
    background: #2a2a4a;
    border-color: #3a3a6a;
  }

  .tool-btn.version-active {
    background: #e94560;
    border-color: #e94560;
    color: white;
  }

  .toolbar.light .tool-btn:hover:not(:disabled) {
    background: #e8e8f0;
  }

  .export-btn {
    background: #e94560;
    border-color: #e94560;
    color: white;
    font-weight: 600;
  }

  .export-btn:hover:not(:disabled) {
    background: #d63b55;
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .template-dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.3rem;
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    min-width: 220px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    z-index: 200;
  }

  .toolbar.light .dropdown-menu {
    background: #ffffff;
    border-color: #d0d0e0;
  }

  .dropdown-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    color: #c0c0d0;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .dropdown-item:hover {
    background: #2a2a4a;
  }

  .toolbar.light .dropdown-item:hover {
    background: #f0f0f8;
    color: #1a1a2e;
  }

  .tpl-name {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .tpl-desc {
    font-size: 0.7rem;
    color: #6a6a8a;
    margin-top: 0.15rem;
  }
</style>
