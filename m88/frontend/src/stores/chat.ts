import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { documentApi, chatApi, type DocumentInfo, type RetrievedChunk } from '@/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: RetrievedChunk[]
  timestamp: Date
  isStreaming?: boolean
  latency?: number
  totalTokens?: number
}

export type SearchMode = 'vector' | 'bm25' | 'hybrid'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const documents = ref<DocumentInfo[]>([])
  const selectedDocIds = ref<string[]>([])
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const searchMode = ref<SearchMode>('hybrid')

  const selectedDocuments = computed(() =>
    documents.value.filter(d => selectedDocIds.value.includes(d.doc_id))
  )

  const fetchDocuments = async () => {
    try {
      const response = await documentApi.list()
      documents.value = response.data.documents
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    }
  }

  const uploadDocument = async (file: File, onProgress?: (progress: number) => void) => {
    const response = await documentApi.upload(file, onProgress)
    await fetchDocuments()
    return response.data
  }

  const deleteDocument = async (docId: string) => {
    const response = await documentApi.delete(docId)
    selectedDocIds.value = selectedDocIds.value.filter(id => id !== docId)
    await fetchDocuments()
    return response.data
  }

  const toggleDocumentSelection = (docId: string) => {
    const index = selectedDocIds.value.indexOf(docId)
    if (index > -1) {
      selectedDocIds.value.splice(index, 1)
    } else {
      selectedDocIds.value.push(docId)
    }
  }

  const selectAllDocuments = () => {
    selectedDocIds.value = documents.value.map(d => d.doc_id)
  }

  const clearSelection = () => {
    selectedDocIds.value = []
  }

  const sendMessage = async (question: string, topK: number = 5) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date()
    }
    messages.value.push(userMessage)

    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      sources: []
    }
    messages.value.push(assistantMessage)

    isLoading.value = true
    isStreaming.value = true

    try {
      await chatApi.query(
        {
          question,
          top_k: topK,
          doc_ids: selectedDocIds.value.length > 0 ? selectedDocIds.value : undefined,
          stream: true,
          search_mode: searchMode.value
        },
        (token) => {
          const msg = messages.value.find(m => m.id === assistantMessageId)
          if (msg) {
            msg.content += token
          }
        },
        (sources) => {
          const msg = messages.value.find(m => m.id === assistantMessageId)
          if (msg) {
            msg.sources = sources
          }
        },
        (data) => {
          const msg = messages.value.find(m => m.id === assistantMessageId)
          if (msg) {
            msg.latency = data.latency
            msg.totalTokens = data.total_tokens
            msg.isStreaming = false
          }
        }
      )
    } catch (error) {
      const msg = messages.value.find(m => m.id === assistantMessageId)
      if (msg) {
        msg.content = `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}`
        msg.isStreaming = false
      }
    } finally {
      isLoading.value = false
      isStreaming.value = false
    }
  }

  const clearMessages = () => {
    messages.value = []
  }

  return {
    messages,
    documents,
    selectedDocIds,
    selectedDocuments,
    isLoading,
    isStreaming,
    searchMode,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
    toggleDocumentSelection,
    selectAllDocuments,
    clearSelection,
    sendMessage,
    clearMessages
  }
})
