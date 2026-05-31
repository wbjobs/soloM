<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { parseScssVariables, getDefaultScss, isWasmReady } from '../wasm-loader.js';

  export let scss = '';
  export let themeCss = '';
  export let variables = [];

  const dispatch = createEventDispatcher();

  let showEditor = true;
  let activeCategory = '';
  let error = '';

  onMount(() => {
    if (isWasmReady() && !scss) {
      scss = getDefaultScss();
      parseScss();
    }
  });

  $: if (isWasmReady() && scss) {
    parseScss();
  }

  function parseScss() {
    try {
      const result = parseScssVariables(scss);
      themeCss = result.css || '';
      variables = result.variables || [];
      error = '';
      dispatch('update', { scss, themeCss, variables });
    } catch (e) {
      error = e.message;
    }
  }

  function resetToDefault() {
    scss = getDefaultScss();
  }

  $: categories = Array.from(new Set(variables.map(v => v.category || '其他')));
  $: if (!activeCategory && categories.length > 0) activeCategory = categories[0];
</script>

<div class="scss-panel">
  <div class="panel-header">
    <button class="toggle-btn" on:click={() => showEditor = !showEditor}>
      {showEditor ? '▼ 隐藏主题编辑器' : '▶ 显示主题编辑器'}
    </button>
  </div>

  {#if showEditor}
    <div class="editor-wrapper">
      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="tabs">
        <button
          class="tab"
          class:active={activeCategory === '__editor__'}
          on:click={() => activeCategory = '__editor__'}
        >
          ✏️ SCSS
        </button>
        {#each categories as cat}
          <button
            class="tab"
            class:active={activeCategory === cat}
            on:click={() => activeCategory = cat}
          >
            {cat}
          </button>
        {/each}
        <button class="tab reset-btn" on:click={resetToDefault} title="重置为默认">
          🔄
        </button>
      </div>

      {#if activeCategory === '__editor__'}
        <textarea
          bind:value={scss}
          spellcheck="false"
          placeholder="// @category: 颜色&#10;$primary: #ff0000;"
        ></textarea>
      {:else}
        <div class="variables-grid">
          {#each variables.filter(v => (v.category || '其他') === activeCategory) as v}
            <div class="var-item">
              <label>
                <span class="var-name">${v.name}</span>
                {#if v.description}
                  <span class="var-desc">{v.description}</span>
                {/if}
              </label>
              <input
                type="text"
                value={v.value}
                on:input={(e) => updateVariable(v.name, e.target.value)}
              />
            </div>
          {/each}
        </div>
      {/if}

      {#if variables.length > 0}
        <div class="stats">
          已定义 {variables.length} 个变量 | CSS 大小 {themeCss.length} 字节
        </div>
      {/if}
    </div>
  {/if}
</div>

<script context="module">
  function updateVariable(name, value) {
    const event = new CustomEvent('update-var', { detail: { name, value } });
    document.dispatchEvent(event);
  }
</script>

<style>
  .scss-panel {
    border-top: 1px solid #2a2a4a;
    background: #111128;
  }

  .panel-header {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #2a2a4a;
  }

  .toggle-btn {
    background: none;
    border: none;
    color: #a0a0c0;
    cursor: pointer;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .toggle-btn:hover {
    color: #c0c0e0;
  }

  .editor-wrapper {
    padding: 0.75rem 1rem;
  }

  .error {
    background: #e94560;
    color: white;
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .tab {
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    color: #8a8aaa;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s;
  }

  .tab:hover {
    background: #2a2a4a;
    color: #c0c0d0;
  }

  .tab.active {
    background: #e94560;
    border-color: #e94560;
    color: white;
  }

  .reset-btn {
    margin-left: auto;
    background: #2a2a4a;
  }

  textarea {
    width: 100%;
    height: 150px;
    background: #0d0d1a;
    color: #d4d4e8;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 0.75rem;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.8rem;
    line-height: 1.6;
    resize: vertical;
    outline: none;
  }

  textarea:focus {
    border-color: #e94560;
  }

  .variables-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .var-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .var-item label {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.75rem;
    color: #8a8aaa;
  }

  .var-name {
    color: #e94560;
    font-family: 'Cascadia Code', monospace;
  }

  .var-desc {
    color: #6a6a8a;
    font-size: 0.7rem;
  }

  .var-item input {
    background: #0d0d1a;
    border: 1px solid #2a2a4a;
    border-radius: 3px;
    padding: 0.35rem 0.5rem;
    color: #e0e0f0;
    font-family: 'Cascadia Code', monospace;
    font-size: 0.8rem;
    outline: none;
  }

  .var-item input:focus {
    border-color: #e94560;
  }

  .stats {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #2a2a4a;
    font-size: 0.7rem;
    color: #6a6a8a;
  }
</style>
