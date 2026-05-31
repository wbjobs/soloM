<template>
  <div class="space-y-6">
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-4">上传文档</h2>
      
      <div
        class="file-drop-zone rounded-xl p-8 text-center cursor-pointer"
        :class="{ 'dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
        @click="triggerFileInput"
      >
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          accept=".pdf,.md,.txt"
          multiple
          @change="handleFileSelect"
        />
        
        <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        
        <p class="text-gray-700 font-medium mb-1">拖拽文件到此处，或点击选择</p>
        <p class="text-sm text-gray-500">支持 PDF、Markdown (.md)、文本 (.txt) 格式</p>
        
        <div v-if="uploadProgress > 0" class="mt-4">
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-primary-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${uploadProgress}%` }"
            ></div>
          </div>
          <p class="text-sm text-gray-600 mt-2">上传中... {{ uploadProgress }}%</p>
        </div>
      </div>

      <div v-if="uploadResult" class="mt-4 p-4 rounded-lg" :class="uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'">
        <p :class="uploadResult.success ? 'text-green-700' : 'text-red-700'">
          {{ uploadResult.message }}
        </p>
        <p v-if="uploadResult.success && uploadResult.chunk_count" class="text-sm text-green-600 mt-1">
          已分块为 {{ uploadResult.chunk_count }} 个片段并建立索引
        </p>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200">
      <div class="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 class="text-xl font-bold text-gray-900">文档列表</h2>
        <span class="text-sm text-gray-500">共 {{ chatStore.documents.length }} 个文档</span>
      </div>

      <div v-if="chatStore.documents.length === 0" class="p-12 text-center">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-gray-500">暂无文档，请上传文档开始使用</p>
      </div>

      <div v-else class="divide-y divide-gray-200">
        <div
          v-for="doc in chatStore.documents"
          :key="doc.doc_id"
          class="p-4 hover:bg-gray-50 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 class="font-medium text-gray-900">{{ doc.doc_name }}</h3>
                <div class="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span>{{ formatFileSize(doc.file_size) }}</span>
                  <span>{{ doc.chunk_count }} 个片段</span>
                  <span>{{ formatDate(doc.upload_time) }}</span>
                </div>
              </div>
            </div>
            <button
              @click="handleDelete(doc.doc_id)"
              :disabled="isDeleting === doc.doc_id"
              class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg v-if="isDeleting === doc.doc_id" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
              :class="doc.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
            >
              {{ doc.status === 'completed' ? '已索引' : '处理中' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const uploadProgress = ref(0)
const isDeleting = ref<string | null>(null)
const uploadResult = ref<{ success: boolean; message: string; chunk_count?: number } | null>(null)

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    for (let i = 0; i < target.files.length; i++) {
      await uploadFile(target.files[i])
    }
    target.value = ''
  }
}

const handleDrop = async (event: DragEvent) => {
  isDragOver.value = false
  
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    for (let i = 0; i < event.dataTransfer.files.length; i++) {
      await uploadFile(event.dataTransfer.files[i])
    }
  }
}

const uploadFile = async (file: File) => {
  uploadProgress.value = 0
  uploadResult.value = null
  
  try {
    const result = await chatStore.uploadDocument(file, (progress) => {
      uploadProgress.value = progress
    })
    
    uploadResult.value = {
      success: result.success,
      message: result.message,
      chunk_count: result.chunk_count
    }
  } catch (error) {
    uploadResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '上传失败'
    }
  } finally {
    uploadProgress.value = 0
  }
}

const handleDelete = async (docId: string) => {
  if (!confirm('确定要删除这个文档吗？')) return
  
  isDeleting.value = docId
  try {
    await chatStore.deleteDocument(docId)
  } finally {
    isDeleting.value = null
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (dateString: string | Date) => {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

onMounted(() => {
  chatStore.fetchDocuments()
})
</script>
