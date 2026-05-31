<script>
  import SlideView from './SlideView.svelte';

  export let presentation = null;
  export let currentSlide = 0;
  export let theme = 'dark';
  export let customCss = '';

  $: slide = presentation && presentation.slides
    ? presentation.slides[currentSlide] || null
    : null;

  $: meta = presentation?.meta || {};

  $: totalSlides = presentation?.slides?.length || 0;
</script>

<div class="preview-container" class:light={theme === 'light'}>
  {#if slide}
    <div class="slide-frame">
      <SlideView {slide} {theme} {customCss} />
    </div>

    {#if slide.notes}
      <div class="speaker-notes">
        <span class="notes-label">💬 演讲者备注</span>
        <p>{slide.notes}</p>
      </div>
    {/if}

    <div class="slide-thumbnails">
      {#each presentation.slides as s, i}
        <button
          class="thumb {i === currentSlide ? 'active' : ''}"
          on:click={() => currentSlide = i}
          title="第 {i + 1} 张"
        >
          <span class="thumb-num">{i + 1}</span>
          <span class="thumb-title">
            {getSlideTitle(s)}
          </span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <p>📝 在左侧编辑器中输入 Markdown 内容</p>
      <p class="hint">使用 --- 分隔幻灯片</p>
    </div>
  {/if}
</div>

<script context="module">
  function getSlideTitle(slide) {
    if (!slide || !slide.elements) return '空幻灯片';
    for (const el of slide.elements) {
      if (el.type === 'heading' && el.text) {
        return el.text.substring(0, 20);
      }
    }
    return '幻灯片';
  }
</script>

<style>
  .preview-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #0d0d1a;
  }

  .preview-container.light {
    background: #f0f0f5;
  }

  .slide-frame {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow: hidden;
  }

  .speaker-notes {
    padding: 0.6rem 1rem;
    background: #16162a;
    border-top: 1px solid #2a2a4a;
    font-size: 0.8rem;
    color: #8a8aaa;
  }

  .notes-label {
    font-weight: 600;
    color: #a0a0c0;
    margin-right: 0.5rem;
  }

  .speaker-notes p {
    margin-top: 0.3rem;
    font-style: italic;
  }

  .slide-thumbnails {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    background: #111128;
    border-top: 1px solid #2a2a4a;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .thumb {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.35rem 0.6rem;
    background: #1a1a30;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    color: #8a8aaa;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.2s;
    min-width: 60px;
  }

  .thumb:hover {
    background: #2a2a4a;
    color: #c0c0d0;
  }

  .thumb.active {
    background: #e94560;
    border-color: #e94560;
    color: white;
  }

  .thumb-num {
    font-weight: 600;
    font-size: 0.75rem;
  }

  .thumb-title {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #6a6a8a;
    gap: 0.5rem;
    font-size: 1.1rem;
  }

  .hint {
    font-size: 0.9rem;
    color: #4a4a6a;
  }
</style>
