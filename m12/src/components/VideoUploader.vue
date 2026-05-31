<template>
  <div class="upload-container card">
    <div
      class="upload-area"
      :class="{ 'dragging': isDragging, 'loading': loading }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        @change="handleFileChange"
        class="file-input"
      />

      <div v-if="loading" class="loading-content">
        <div class="loading-icon">⚙️</div>
        <h3>正在加载 FFmpeg...</h3>
        <p>首次加载需要下载 WebAssembly 模块，请稍候</p>
        <div class="progress-bar" style="margin-top: 20px; width: 250px;">
          <div class="progress-fill" :style="{ width: loadProgress + '%' }"></div>
        </div>
        <p class="progress-text">{{ loadProgress }}%</p>
      </div>

      <div v-else class="upload-content">
        <div class="upload-icon">📁</div>
        <h3>点击或拖拽上传视频</h3>
        <p>支持 MP4, WebM, MOV 格式</p>
        <button class="btn btn-primary" style="margin-top: 20px;">
          选择视频文件
        </button>
      </div>
    </div>

    <div class="features">
      <div class="feature-item">
        <span class="feature-icon">⚡</span>
        <span>浏览器端处理</span>
      </div>
      <div class="feature-item">
        <span class="feature-icon">🔒</span>
        <span>隐私安全</span>
      </div>
      <div class="feature-item">
        <span class="feature-icon">🎯</span>
        <span>精确剪辑</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  loading: Boolean,
  loadProgress: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['file-selected'])

const fileInput = ref(null)
const isDragging = ref(false)

const triggerFileInput = () => {
  if (!props.loading) {
    fileInput.value.click()
  }
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    emit('file-selected', file)
  }
}

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file && file.type.startsWith('video/')) {
    emit('file-selected', file)
  }
}
</script>

<style scoped>
.upload-container {
  text-align: center;
}

.upload-area {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 60px 40px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--bg-dark);
}

.upload-area:hover:not(.loading) {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.05);
}

.upload-area.dragging {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.1);
}

.upload-area.loading {
  cursor: wait;
}

.upload-icon, .loading-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.loading-icon {
  animation: spin 2s linear infinite;
}

.upload-content h3, .loading-content h3 {
  font-size: 20px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.upload-content p, .loading-content p {
  color: var(--text-secondary);
  font-size: 14px;
}

.progress-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--primary);
}

.file-input {
  display: none;
}

.features {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid var(--border);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
}

.feature-icon {
  font-size: 20px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
