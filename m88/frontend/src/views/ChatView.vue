<template>
  <div class="flex gap-6">
    <div class="flex-1">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 class="text-lg font-semibold text-gray-900">对话</h2>
          <button
            @click="chatStore.clearMessages"
            class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            清空对话
          </button>
        </div>

        <div ref="chatContainerRef" class="chat-container p-4 space-y-4">
          <div
            v-for="message in chatStore.messages"
            :key="message.id"
            class="message-appear"
          >
            <div
              class="flex gap-3"
              :class="message.role === 'user' ? 'flex-row-reverse' : ''"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                :class="message.role === 'user' ? 'bg-primary-500' : 'bg-gray-200'"
              >
                <svg
                  v-if="message.role === 'user'"
                  class="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4 h-4 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div
                class="max-w-3xl px-4 py-3 rounded-2xl"
                :class="message.role === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-900'"
              >
                <div
                  v-if="message.role === 'assistant'"
                  class="markdown-content"
                  v-html="renderMarkdown(message.content)"
                ></div>
                <p v-else class="whitespace-pre-wrap">{{ message.content }}</p>

                <div
                  v-if="message.isStreaming && !message.content"
                  class="typing-indicator flex gap-1 py-1"
                >
                  <span class="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full"></span>
                </div>

                <div
                  v-if="message.sources && message.sources.length > 0 && !message.isStreaming"
                  class="mt-3 pt-3 border-t border-gray-200"
                >
                  <div class="flex items-center gap-2 mb-2">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <p class="text-xs font-medium text-gray-500">引用来源 ({{ message.sources.length }})</p>
                  </div>
                  <SourceCitation
                    :sources="message.sources"
                    :highlighted-index="highlightedSource[message.id] ?? null"
                    @highlight="(idx) => handleHighlight(message.id, idx)"
                  />
                </div>

                <div
                  v-if="message.latency && !message.isStreaming"
                  class="mt-2 text-xs text-gray-500"
                >
                  耗时: {{ message.latency.toFixed(2) }}s | 令牌数: {{ message.totalTokens }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="chatStore.messages.length === 0" class="text-center py-16">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">开始提问</h3>
            <p class="text-gray-500 max-w-md mx-auto">
              上传文档后，您可以就文档内容提问，我会基于知识库为您提供准确的回答。
            </p>
            <div class="mt-6 flex justify-center gap-4 text-sm">
              <div class="px-4 py-2 bg-gray-100 rounded-lg text-gray-600">
                🔍 混合检索：向量 + 关键词
              </div>
              <div class="px-4 py-2 bg-gray-100 rounded-lg text-gray-600">
                📄 点击来源可查看 PDF 原文
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-200">
          <div class="flex gap-3">
            <input
              v-model="question"
              @keyup.enter="handleSend"
              :disabled="chatStore.isLoading"
              type="text"
              placeholder="输入您的问题..."
              class="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              @click="handleSend"
              :disabled="!question.trim() || chatStore.isLoading"
              class="px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              <span v-if="chatStore.isLoading">生成中...</span>
              <span v-else>发送</span>
              <svg v-if="!chatStore.isLoading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <div class="mt-3 flex items-center gap-4 flex-wrap">
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-600">检索模式:</label>
              <select
                v-model="chatStore.searchMode"
                class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="hybrid">混合检索</option>
                <option value="vector">向量检索</option>
                <option value="bm25">关键词检索</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-600">检索数量:</label>
              <select
                v-model.number="topK"
                class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="3">3 条</option>
                <option :value="5">5 条</option>
                <option :value="10">10 条</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <div
                class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                :class="chatStore.searchMode === 'hybrid' || chatStore.searchMode === 'vector' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="chatStore.searchMode === 'hybrid' || chatStore.searchMode === 'vector' ? 'bg-blue-500' : 'bg-gray-400'"></span>
                向量
              </div>
              <span class="text-gray-400 text-xs">+</span>
              <div
                class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                :class="chatStore.searchMode === 'hybrid' || chatStore.searchMode === 'bm25' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="chatStore.searchMode === 'hybrid' || chatStore.searchMode === 'bm25' ? 'bg-amber-500' : 'bg-gray-400'"></span>
                关键词
              </div>
            </div>
            <div v-if="chatStore.selectedDocuments.length > 0" class="text-sm text-gray-500">
              已选择 {{ chatStore.selectedDocuments.length }} 个文档
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="w-80 flex-shrink-0">
      <DocumentSidebar />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, reactive } from 'vue'
import { marked } from 'marked'
import { useChatStore } from '@/stores/chat'
import DocumentSidebar from '@/components/DocumentSidebar.vue'
import SourceCitation from '@/components/SourceCitation.vue'

const chatStore = useChatStore()
const question = ref('')
const topK = ref(5)
const chatContainerRef = ref<HTMLElement | null>(null)
const highlightedSource = reactive<Record<string, number | null>>({})

const renderMarkdown = (content: string) => {
  return marked.parse(content, { breaks: true }) as string
}

const handleHighlight = (messageId: string, index: number) => {
  highlightedSource[messageId] = highlightedSource[messageId] === index ? null : index
}

const handleSend = async () => {
  if (!question.value.trim() || chatStore.isLoading) return

  const q = question.value.trim()
  question.value = ''
  await chatStore.sendMessage(q, topK.value)
}

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
  }
)

watch(
  () => chatStore.isStreaming,
  async (streaming) => {
    if (streaming) {
      await nextTick()
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
      }
    }
  }
)
</script>
