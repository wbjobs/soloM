<script>
  import { createEventDispatcher } from 'svelte';

  export let versionHistory = [];

  const dispatch = createEventDispatcher();

  function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  }

  function shortHash(hash) {
    return hash ? hash.substring(0, 7) : '';
  }
</script>

<div class="version-modal-overlay" on:click={() => dispatch('close')}>
  <div class="version-modal" on:click|stopPropagation>
    <div class="modal-header">
      <h3>📜 版本历史</h3>
      <button class="close-btn" on:click={() => dispatch('close')}>×</button>
    </div>

    <div class="modal-body">
      {#if versionHistory.length === 0}
        <div class="empty">
          <p>还没有提交记录</p>
          <p class="hint">在编辑器下方输入提交信息，点击「保存快照」创建版本</p>
        </div>
      {:else}
        <div class="version-list">
          {#each versionHistory as commit}
            <div class="commit-item">
              <div class="commit-header">
                <span class="commit-hash">{shortHash(commit.hash)}</span>
                <span class="commit-date">{formatDate(commit.timestamp)}</span>
              </div>
              <div class="commit-message">{commit.message}</div>
              <div class="commit-author">{commit.author}</div>
              <div class="commit-actions">
                <button class="checkout-btn" on:click={() => dispatch('checkout', commit.hash)}>
                  ↩️ 回滚到此版本
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .version-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .version-modal {
    background: #16162a;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 60px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #2a2a4a;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #e0e0f0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8a8aaa;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: #2a2a4a;
    color: #e0e0f0;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: #6a6a8a;
  }

  .empty .hint {
    font-size: 0.85rem;
    margin-top: 0.5rem;
    color: #4a4a6a;
  }

  .version-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .commit-item {
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 0.85rem 1rem;
    transition: border-color 0.15s;
  }

  .commit-item:hover {
    border-color: #3a3a6a;
  }

  .commit-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .commit-hash {
    font-family: 'Cascadia Code', monospace;
    font-size: 0.8rem;
    color: #e94560;
    background: rgba(233, 69, 96, 0.1);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  .commit-date {
    font-size: 0.75rem;
    color: #6a6a8a;
  }

  .commit-message {
    font-size: 0.9rem;
    color: #e0e0f0;
    margin-bottom: 0.25rem;
    word-break: break-word;
  }

  .commit-author {
    font-size: 0.75rem;
    color: #4a4a6a;
    margin-bottom: 0.5rem;
  }

  .commit-actions {
    display: flex;
    justify-content: flex-end;
  }

  .checkout-btn {
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    color: #a0a0c0;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.15s;
  }

  .checkout-btn:hover {
    background: #e94560;
    border-color: #e94560;
    color: white;
  }
</style>
