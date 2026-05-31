<template>
  <div class="app-container">
    <header class="app-header">
      <h1>🎬 音视频剪辑工具</h1>
      <p class="subtitle">纯前端 · WebAssembly · 浏览器端处理</p>
    </header>

    <main class="app-main">
      <VideoUploader
        v-if="!videoFile"
        @file-selected="handleFileSelected"
        :loading="ffmpegLoading"
        :load-progress="loadProgress"
      />

      <template v-else>
        <VideoPreview
          :video-url="videoUrl"
          :current-time="currentTime"
          @time-update="currentTime = $event"
          @loaded="handleVideoLoaded"
        />

        <Timeline
          :duration="duration"
          :in-point="inPoint"
          :out-point="outPoint"
          :current-time="currentTime"
          @in-point-change="inPoint = $event"
          @out-point-change="outPoint = $event"
          @seek="currentTime = $event"
          :video-file="videoFile"
        />

        <VideoProcessor
          :video-file="videoFile"
          :in-point="inPoint"
          :out-point="outPoint"
          :disabled="!canExport"
          @export-start="isExporting = true"
          @export-complete="isExporting = false"
        />
      </template>
    </main>

    <footer class="app-footer">
      <p>💡 提示：所有处理均在浏览器本地完成，不会上传到服务器</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import VideoUploader from './components/VideoUploader.vue'
import VideoPreview from './components/VideoPreview.vue'
import Timeline from './components/Timeline.vue'
import VideoProcessor from './components/VideoProcessor.vue'
import { useFFmpeg } from './composables/useFFmpeg'

const videoFile = ref(null)
const videoUrl = ref('')
const duration = ref(0)
const currentTime = ref(0)
const inPoint = ref(0)
const outPoint = ref(0)
const isExporting = ref(false)

const { ffmpegLoading, loadProgress, initFFmpeg } = useFFmpeg()

const canExport = computed(() => {
  return outPoint.value > inPoint.value && !isExporting.value
})

const handleFileSelected = (file) => {
  videoFile.value = file
  videoUrl.value = URL.createObjectURL(file)
}

const handleVideoLoaded = (videoDuration) => {
  duration.value = videoDuration
  outPoint.value = videoDuration
}

onMounted(() => {
  initFFmpeg()
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  text-align: center;
  padding: 30px 20px;
  background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-card) 100%);
  border-bottom: 1px solid var(--border);
}

.app-header h1 {
  font-size: 32px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
}

.app-main {
  flex: 1;
  padding: 30px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.app-footer {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  border-top: 1px solid var(--border);
}
</style>
