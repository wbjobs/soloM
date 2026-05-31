<script>
  export let markdown = '';
</script>

<textarea
  bind:value={markdown}
  spellcheck="false"
  placeholder="在此输入 Markdown 内容...&#10;&#10;使用 --- 分隔幻灯片&#10;使用 frontmatter 设置标题和主题"
></textarea>

<style>
  textarea {
    width: 100%;
    height: 100%;
    background: #0d0d1a;
    color: #d4d4e8;
    border: none;
    padding: 1rem;
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    tab-size: 2;
  }

  textarea::placeholder {
    color: #4a4a6a;
  }

  textarea::-webkit-scrollbar {
    width: 8px;
  }

  textarea::-webkit-scrollbar-track {
    background: #0d0d1a;
  }

  textarea::-webkit-scrollbar-thumb {
    background: #2a2a4a;
    border-radius: 4px;
  }

  textarea::-webkit-scrollbar-thumb:hover {
    background: #3a3a6a;
  }
</style>
