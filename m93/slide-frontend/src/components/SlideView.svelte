<script>
  export let slide = null;
  export let theme = 'dark';
  export let customCss = '';

  $: bgStyle = getSlideBackground();
  $: colorStyle = getSlideColor();

  function getSlideBackground() {
    if (slide?.style?.background) return slide.style.background;
    return 'var(--slide-bg, #1a1a2e)';
  }

  function getSlideColor() {
    if (slide?.style?.color) return slide.style.color;
    return 'var(--text-color, #e0e0e0)';
  }
</script>

<svelte:head>
  {#if customCss}
    <style>{customCss}</style>
  {/if}
</svelte:head>

<div class="slide" style="background: {bgStyle}; color: {colorStyle}">
  {#if slide && slide.elements}
    {#each slide.elements as element}
      {#if element.type === 'heading'}
        {#if element.level === 1}
          <h1 class="heading-1">{element.text}</h1>
        {:else if element.level === 2}
          <h2 class="heading-2">{element.text}</h2>
        {:else if element.level === 3}
          <h3 class="heading-3">{element.text}</h3>
        {:else}
          <h4 class="heading-{element.level}">{element.text}</h4>
        {/if}
      {:else if element.type === 'paragraph'}
        <p class="paragraph">
          {#each element.content || [] as node}
            {#if node.type === 'text'}
              {node.value}
            {:else if node.type === 'code'}
              <code class="inline-code">{node.value}</code>
            {:else if node.type === 'strong'}
              <strong>{renderInline(node.content)}</strong>
            {:else if node.type === 'emph'}
              <em>{renderInline(node.content)}</em>
            {:else if node.type === 'link'}
              <a href={node.url} target="_blank" rel="noopener">{node.text}</a>
            {:else if node.type === 'softbreak'}
              {' '}
            {:else if node.type === 'hardbreak'}
              <br />
            {:else if node.type === 'image'}
              <img src={node.url} alt={node.alt} class="inline-image" />
            {:else if node.type === 'html'}
              {@html node.content}
            {/if}
          {/each}
        </p>
      {:else if element.type === 'list'}
        {#if element.ordered}
          <ol class="list ordered">
            {#each element.items || [] as item}
              <li>{renderInline(item.content)}</li>
            {/each}
          </ol>
        {:else}
          <ul class="list unordered">
            {#each element.items || [] as item}
              <li>{renderInline(item.content)}</li>
            {/each}
          </ul>
        {/if}
      {:else if element.type === 'code'}
        <div class="code-block">
          {#if element.language}
            <span class="code-lang">{element.language}</span>
          {/if}
          <pre><code>{element.code}</code></pre>
        </div>
      {:else if element.type === 'image'}
        <figure class="slide-image">
          <img src={element.url} alt={element.alt} />
          {#if element.title}
            <figcaption>{element.title}</figcaption>
          {/if}
        </figure>
      {:else if element.type === 'blockquote'}
        <blockquote class="blockquote">
          {#each element.content || [] as node}
            {#if node.type === 'text'}
              {node.value}
            {:else if node.type === 'code'}
              <code class="inline-code">{node.value}</code>
            {:else if node.type === 'softbreak'}
              <br />
            {/if}
          {/each}
        </blockquote>
      {:else if element.type === 'thematicbreak'}
        <hr class="divider" />
      {:else if element.type === 'html'}
        {@html element.content}
      {/if}
    {/each}
  {/if}
</div>

<script context="module">
  function renderInline(nodes) {
    if (!nodes) return '';
    return nodes.map(n => {
      if (n.type === 'text') return n.value;
      if (n.type === 'code') return n.value;
      if (n.type === 'softbreak') return ' ';
      return n.value || '';
    }).join('');
  }
</script>

<style>
  .slide {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 100%;
    padding: 3rem 4rem;
    border-radius: var(--radius, 8px);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    font-size: var(--text-size, 1.1rem);
    line-height: var(--line-height, 1.7);
    font-family: var(--font-family, -apple-system, sans-serif);
  }

  .heading-1 {
    font-size: var(--h1-size, 2.8rem);
    font-weight: 800;
    margin-bottom: 0.8rem;
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--heading-color, var(--primary, #e94560));
  }

  .heading-2 {
    font-size: var(--h2-size, 2rem);
    font-weight: 700;
    margin-bottom: 0.6rem;
    line-height: 1.3;
    color: var(--heading-color, var(--primary, #e94560));
  }

  .heading-3 {
    font-size: var(--h3-size, 1.5rem);
    font-weight: 600;
    margin-bottom: 0.5rem;
    line-height: 1.4;
    color: var(--heading-color, var(--primary, #e94560));
  }

  .heading-4,
  .heading-5,
  .heading-6 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 0.4rem;
    color: var(--heading-color, var(--primary, #e94560));
  }

  .paragraph {
    margin-bottom: 0.8rem;
  }

  .inline-code {
    background: var(--code-bg, rgba(255, 255, 255, 0.1));
    color: var(--code-color, var(--text-color, #e0e0e0));
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.9em;
  }

  .list {
    margin: 0.5rem 0 0.8rem 1.5rem;
  }

  .list li {
    margin-bottom: 0.3rem;
  }

  .code-block {
    background: var(--code-block-bg, rgba(0, 0, 0, 0.3));
    border-radius: var(--radius, 6px);
    padding: 1rem;
    margin: 0.5rem 0;
    overflow-x: auto;
    position: relative;
  }

  :global(.light) .code-block {
    background: rgba(0, 0, 0, 0.06);
  }

  .code-lang {
    position: absolute;
    top: 0.3rem;
    right: 0.6rem;
    font-size: 0.7rem;
    color: #6a6a8a;
    text-transform: uppercase;
  }

  .code-block pre {
    margin: 0;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .slide-image {
    text-align: center;
    margin: 0.5rem 0;
  }

  .slide-image img {
    max-width: 80%;
    max-height: 50vh;
    border-radius: 4px;
  }

  .inline-image {
    max-height: 1.5em;
    vertical-align: middle;
  }

  .blockquote {
    border-left: 3px solid var(--primary, #e94560);
    padding: 0.5rem 1rem;
    margin: 0.5rem 0;
    font-style: italic;
    opacity: 0.9;
  }

  .divider {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin: 1rem 0;
  }

  a {
    color: var(--link-color, var(--primary, #e94560));
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
