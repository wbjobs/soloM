<template>
  <div class="source-citation">
    <div
      v-for="(source, index) in sources"
      :key="index"
      class="citation-card"
      :class="{ 'citation-highlighted': highlightedIndex === index }"
    >
      <div class="citation-header">
        <div class="citation-left">
          <span class="citation-index">{{ index + 1 }}</span>
          <span class="citation-doc-name" :title="source.doc_name">
            {{ source.doc_name }}
          </span>
        </div>
        <div class="citation-right">
          <span
            class="citation-type-badge"
            :class="{
              'badge-hybrid': source.search_type === 'hybrid',
              'badge-vector': source.search_type === 'vector',
              'badge-bm25': source.search_type === 'bm25'
            }"
          >
            {{ searchTypeLabel(source.search_type) }}
          </span>
          <span class="citation-score">
            {{ (source.score * 100).toFixed(1) }}%
          </span>
        </div>
      </div>

      <div class="citation-content" @click="$emit('highlight', index)">
        <p class="citation-text">{{ truncateContent(source.content) }}</p>
      </div>

      <div class="citation-footer">
        <div class="citation-scores-detail">
          <span v-if="source.vector_score > 0" class="score-item vector-score">
            向量: {{ (source.vector_score * 100).toFixed(1) }}%
          </span>
          <span v-if="source.bm25_score > 0" class="score-item bm25-score">
            关键词: {{ (source.bm25_score * 100).toFixed(1) }}%
          </span>
          <span v-if="source.page != null" class="score-item page-info">
            第 {{ source.page + 1 }} 页
          </span>
        </div>

        <button
          v-if="source.page != null"
          @click.stop="openPdfPreview(source)"
          class="citation-link-btn"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          查看原文
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showPdfPreview" class="pdf-preview-overlay" @click.self="closePdfPreview">
        <div class="pdf-preview-modal">
          <div class="pdf-preview-header">
            <div class="pdf-preview-title">
              <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{{ pdfPreviewTitle }}</span>
              <span v-if="pdfPreviewPage != null" class="pdf-page-badge">
                第 {{ pdfPreviewPage + 1 }} 页
              </span>
            </div>
            <div class="pdf-preview-controls">
              <button
                @click="prevPage"
                :disabled="pdfPreviewPage <= 0"
                class="pdf-nav-btn"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span class="pdf-page-indicator">
                {{ (pdfPreviewPage ?? 0) + 1 }} / {{ totalPages }}
              </span>
              <button
                @click="nextPage"
                :disabled="pdfPreviewPage >= totalPages - 1"
                class="pdf-nav-btn"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button @click="closePdfPreview" class="pdf-close-btn">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div class="pdf-preview-body">
            <div v-if="pdfLoading" class="pdf-loading">
              <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              <span class="text-sm text-gray-500 mt-2">加载中...</span>
            </div>
            <img
              v-if="pdfImageUrl"
              :src="pdfImageUrl"
              :alt="`Page ${pdfPreviewPage}`"
              class="pdf-preview-image"
              @load="pdfLoading = false"
              @error="pdfLoading = false"
            />
            <div
              v-if="highlightBbox && !pdfLoading"
              class="pdf-highlight-overlay"
              :style="highlightStyle"
            ></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { RetrievedChunk } from '@/api'
import { pdfApi } from '@/api'

const props = defineProps<{
  sources: RetrievedChunk[]
  highlightedIndex: number | null
}>()

defineEmits<{
  highlight: [index: number]
}>()

const showPdfPreview = ref(false)
const pdfPreviewDocId = ref('')
const pdfPreviewTitle = ref('')
const pdfPreviewPage = ref(0)
const pdfImageUrl = ref('')
const pdfLoading = ref(false)
const highlightBbox = ref<number[] | null>(null)
const totalPages = ref(1)

const highlightStyle = computed(() => {
  if (!highlightBbox.value || highlightBbox.value.length < 4) return {}
  const [x0, y0, x1, y1] = highlightBbox.value
  return {
    left: `${(x0 / 612) * 100}%`,
    top: `${(y0 / 792) * 100}%`,
    width: `${((x1 - x0) / 612) * 100}%`,
    height: `${((y1 - y0) / 792) * 100}%`
  }
})

const searchTypeLabel = (type: string) => {
  switch (type) {
    case 'hybrid': return '混合'
    case 'vector': return '向量'
    case 'bm25': return '关键词'
    default: return type
  }
}

const truncateContent = (content: string, maxLen: number = 150) => {
  if (content.length <= maxLen) return content
  return content.slice(0, maxLen) + '...'
}

const openPdfPreview = async (source: RetrievedChunk) => {
  pdfPreviewDocId.value = source.doc_id
  pdfPreviewTitle.value = source.doc_name
  pdfPreviewPage.value = source.page ?? 0
  highlightBbox.value = source.bbox ?? null
  showPdfPreview.value = true
  pdfLoading.value = true

  try {
    const info = (await pdfApi.info(source.doc_id)).data
    totalPages.value = info.page_count
  } catch {
    totalPages.value = 1
  }

  loadPageImage()
}

const loadPageImage = () => {
  pdfImageUrl.value = pdfApi.previewUrl(
    pdfPreviewDocId.value,
    pdfPreviewPage.value + 1,
    150
  )
}

const prevPage = () => {
  if (pdfPreviewPage.value > 0) {
    pdfPreviewPage.value--
    pdfLoading.value = true
    highlightBbox.value = null
    loadPageImage()
  }
}

const nextPage = () => {
  if (pdfPreviewPage.value < totalPages.value - 1) {
    pdfPreviewPage.value++
    pdfLoading.value = true
    highlightBbox.value = null
    loadPageImage()
  }
}

const closePdfPreview = () => {
  showPdfPreview.value = false
  pdfImageUrl.value = ''
  highlightBbox.value = null
}
</script>
