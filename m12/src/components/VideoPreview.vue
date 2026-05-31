<template>
  <div class="preview-container card">
    <div class="preview-header">
      <h3>🎬 视频预览</h3>
      <div class="time-display">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </div>
    </div>

    <div class="video-wrapper">
      <video
        ref="videoRef"
        :src="videoUrl"
        class="video-element"
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoaded"
        @play="isPlaying = true"
        @pause="isPlaying = false"
      ></video>

      <div class="video-controls">
        <button class="control-btn" @click="togglePlay">
          {{ isPlaying ? '⏸️' : '▶️' }}
        </button>
        <button class="control-btn" @click="skipBackward">
          ⏪
        </button>
        <button class="control-btn" @click="skipForward">
          ⏩
        </button>
        <div class="volume-control">
          <span>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            v-model.number="volume"
            @input="updateVolume"
            class="volume-slider"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  videoUrl: String,
  currentTime: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['time-update', 'loaded'])

const videoRef = ref(null)
const duration = ref(0)
const isPlaying = ref(false)
const volume = ref(1)

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const handleTimeUpdate = () => {
  if (videoRef.value) {
    emit('time-update', videoRef.value.currentTime)
  }
}

const handleLoaded = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration
    emit('loaded', duration.value)
  }
}

const togglePlay = () => {
  if (videoRef.value) {
    if (isPlaying.value) {
      videoRef.value.pause()
    } else {
      videoRef.value.play()
    }
  }
}

const skipBackward = () => {
  if (videoRef.value) {
    videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime - 5)
  }
}

const skipForward = () => {
  if (videoRef.value) {
    videoRef.value.currentTime = Math.min(duration.value, videoRef.value.currentTime + 5)
  }
}

const updateVolume = () => {
  if (videoRef.value) {
    videoRef.value.volume = volume.value
  }
}

watch(() => props.currentTime, (newTime) => {
  if (videoRef.value && Math.abs(videoRef.value.currentTime - newTime) > 0.1) {
    videoRef.value.currentTime = newTime
  }
})

onMounted(() => {
  if (videoRef.value) {
    videoRef.value.load()
  }
})

defineExpose({
  videoRef
})
</script>

<style scoped>
.preview-container {
  width: 100%;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-header h3 {
  font-size: 18px;
  color: var(--text-primary);
}

.time-display {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: var(--text-secondary);
  background: var(--bg-dark);
  padding: 6px 12px;
  border-radius: 6px;
}

.video-wrapper {
  background: var(--bg-dark);
  border-radius: 8px;
  overflow: hidden;
}

.video-element {
  width: 100%;
  max-height: 500px;
  display: block;
  background: #000;
}

.video-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
}

.control-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: var(--bg-dark);
  color: var(--text-primary);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover {
  background: var(--bg-hover);
  transform: scale(1.05);
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: var(--text-secondary);
}

.volume-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
}

.volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
</style>
