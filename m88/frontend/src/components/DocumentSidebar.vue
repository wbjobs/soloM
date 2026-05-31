<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 h-full">
    <div class="p-4 border-b border-gray-200">
      <h3 class="font-semibold text-gray-900">文档选择</h3>
      <p class="text-xs text-gray-500 mt-1">选择特定文档进行问答，或留空使用全部文档</p>
    </div>

    <div class="p-4">
      <div class="flex gap-2 mb-4">
        <button
          @click="chatStore.selectAllDocuments"
          class="flex-1 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
        >
          全选
        </button>
        <button
          @click="chatStore.clearSelection"
          class="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
        >
          清空
        </button>
      </div>

      <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
        <div
          v-for="doc in chatStore.documents"
          :key="doc.doc_id"
          class="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border"
          :class="chatStore.selectedDocIds.includes(doc.doc_id) ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200 hover:bg-gray-50'"
          @click="chatStore.toggleDocumentSelection(doc.doc_id)"
        >
          <div
            class="w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center"
            :class="chatStore.selectedDocIds.includes(doc.doc_id) ? 'bg-primary-500 border-primary-500' : 'border-gray-300'"
          >
            <svg
              v-if="chatStore.selectedDocIds.includes(doc.doc_id)"
              class="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ doc.doc_name }}</p>
            <p class="text-xs text-gray-500">{{ doc.chunk_count }} 个片段</p>
          </div>
        </div>

        <div v-if="chatStore.documents.length === 0" class="text-center py-8">
          <p class="text-sm text-gray-500">暂无文档</p>
          <p class="text-xs text-gray-400 mt-1">请先在文档管理页面上传</p>
        </div>
      </div>
    </div>

    <div class="p-4 border-t border-gray-200">
      <div class="flex items-center justify-between text-sm">
        <span class="text-gray-600">已选择</span>
        <span class="font-medium text-gray-900">
          {{ chatStore.selectedDocuments.length }} / {{ chatStore.documents.length }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
</script>
