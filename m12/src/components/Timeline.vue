<template>
  <div class="timeline-container card">
    <div class="timeline-header">
      <h3>📊 时间轴</h3>
      <div class="time-inputs">
        <div class="time-input-group">
          <label>入点</label>
          <input
            type="number"
            class="input time-input"
            :value="inPoint"
            @input="updateInPoint"
            step="0.1"
            min="0"
            :max="outPoint"
          />
        </div>
        <div class="time-input-group">
          <label>出点</label>
          <input
            type="number"
            class="input time-input"
            :value="outPoint"
            @input="updateOutPoint"
            step="0.1"
            :min="inPoint"
            :max="duration"
          />
        </div>
        <div class="time-input-group duration-display">
          <label>时长</label>
          <span>{{ formatTime(outPoint - inPoint) }}</span>
        </div>
      </div>
    </div>

    <div class="timeline-area" ref="timelineRef" @click="handleTimelineClick">
      <canvas ref="waveformCanvas" class="waveform-canvas"></canvas>
      
      <div class="frame-preview-container">
        <canvas ref="framesCanvas" class="frames-canvas"></canvas>
      </div>

      <div
        class="selection-overlay"
        :style="{
          left: (inPoint / duration * 100) + '%',
          width: ((outPoint - inPoint) / duration * 100) + '%'
        }"
      >
        <div
          class="handle handle-in"
          @mousedown="startDrag('in', $event)"
          title="拖拽调整入点"
        >
          <div class="handle-line"></div>
          <div class="handle-label">IN</div>
        </div>
        <div
          class="handle handle-out"
          @mousedown="startDrag('out', $event)"
          title="拖拽调整出点"
        >
          <div class="handle-line"></div>
          <div class="handle-label">OUT</div>
        </div>
      </div>

      <div
        class="playhead"
        :style="{ left: (currentTime / duration * 100) + '%' }"
      >
        <div class="playhead-triangle"></div>
        <div class="playhead-line"></div>
      </div>

      <div class="time-ruler">
        <div
          v-for="tick in timeTicks"
          :key="tick.time"
          class="time-tick"
          :style="{ left: (tick.time / duration * 100) + '%' }"
        >
          <div class="tick-mark"></div>
          <div class="tick-label">{{ tick.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  duration: {
    type: Number,
    default: 0
  },
  inPoint: {
    type: Number,
    default: 0
  },
  outPoint: {
    type: Number,
    default: 0
  },
  currentTime: {
    type: Number,
    default: 0
  },
  videoFile: Object
})

const emit = defineEmits(['in-point-change', 'out-point-change', 'seek'])

const timelineRef = ref(null)
const waveformCanvas = ref(null)
const framesCanvas = ref(null)
const isDragging = ref(false)
const dragType = ref(null)

let waveformCache = null
let offscreenWaveform = null
let offscreenWaveformCtx = null
let cachedCanvasWidth = 0
let rafId = null
let resizeObserver = null
let thumbnailVideo = null
let thumbnailUrl = null
let thumbnailCache = []
let thumbnailGenAbort = false
let audioContext = null

const timeTicks = computed(() => {
  const ticks = []
  const interval = props.duration > 60 ? 10 : props.duration > 30 ? 5 : props.duration > 10 ? 2 : 1
  
  for (let t = 0; t <= props.duration; t += interval) {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    ticks.push({
      time: t,
      label: mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
    })
  }
  return ticks
})

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const updateInPoint = (e) => {
  const value = parseFloat(e.target.value)
  if (!isNaN(value) && value >= 0 && value < props.outPoint) {
    emit('in-point-change', value)
  }
}

const updateOutPoint = (e) => {
  const value = parseFloat(e.target.value)
  if (!isNaN(value) && value > props.inPoint && value <= props.duration) {
    emit('out-point-change', value)
  }
}

const handleTimelineClick = (e) => {
  if (isDragging.value) return
  
  const rect = timelineRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percentage = x / rect.width
  const time = percentage * props.duration
  emit('seek', Math.max(0, Math.min(props.duration, time)))
}

const startDrag = (type, e) => {
  e.stopPropagation()
  isDragging.value = true
  dragType.value = type
  
  const handleMouseMove = (e) => {
    if (!timelineRef.value) return
    
    const rect = timelineRef.value.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    let time = percentage * props.duration
    time = Math.max(0, Math.min(props.duration, time))
    
    if (dragType.value === 'in') {
      if (time < props.outPoint) {
        emit('in-point-change', time)
      }
    } else if (dragType.value === 'out') {
      if (time > props.inPoint) {
        emit('out-point-change', time)
      }
    }
  }
  
  const handleMouseUp = () => {
    isDragging.value = false
    dragType.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

async function extractWaveformViaAudioApi(file) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }

    const arrayBuffer = await file.slice(0, Math.min(file.size, 50 * 1024 * 1024)).arrayBuffer()
    
    let audioBuffer
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    } catch (_) {
      return null
    }

    const channelData = audioBuffer.getChannelData(0)
    const samples = 400
    const blockSize = Math.floor(channelData.length / samples)
    
    if (blockSize === 0) return null

    const waveform = new Float32Array(samples)
    
    for (let i = 0; i < samples; i++) {
      let sum = 0
      const start = i * blockSize
      const end = Math.min(start + blockSize, channelData.length)
      
      for (let j = start; j < end; j++) {
        const v = channelData[j]
        sum += v < 0 ? -v : v
      }
      
      waveform[i] = sum / (end - start)
    }

    let max = 0
    for (let i = 0; i < samples; i++) {
      if (waveform[i] > max) max = waveform[i]
    }
    if (max > 0) {
      for (let i = 0; i < samples; i++) {
        waveform[i] /= max
      }
    }

    return Array.from(waveform)
  } catch (_) {
    return null
  }
}

function ensureOffscreenCanvas(width, height) {
  if (!offscreenWaveform || cachedCanvasWidth !== width) {
    offscreenWaveform = document.createElement('canvas')
    offscreenWaveform.width = width
    offscreenWaveform.height = height
    offscreenWaveformCtx = offscreenWaveform.getContext('2d')
    cachedCanvasWidth = width
  }
  return { canvas: offscreenWaveform, ctx: offscreenWaveformCtx }
}

function drawWaveformToBuffer(waveform, width, height) {
  const { ctx } = ensureOffscreenCanvas(width, height)
  
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, width, height)

  if (!waveform || waveform.length === 0) {
    for (let i = 0; i < width; i += 4) {
      ctx.fillStyle = '#2a2a4a'
      ctx.fillRect(i, height * 0.4, 2, height * 0.2)
    }
    return
  }

  const samples = waveform.length
  const barWidth = width / samples
  const barGap = Math.max(0.5, barWidth * 0.15)
  const inPos = (props.inPoint / props.duration) * samples
  const outPos = (props.outPoint / props.duration) * samples

  for (let i = 0; i < samples; i++) {
    const x = i * barWidth
    const value = waveform[i]
    
    if (i >= inPos && i <= outPos) {
      const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0)
      gradient.addColorStop(0, '#10b981')
      gradient.addColorStop(1, '#34d399')
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = '#3b3b5c'
    }
    
    const h = Math.max(2, value * height * 0.85)
    const y = (height - h) / 2
    ctx.fillRect(x + barGap / 2, y, Math.max(1, barWidth - barGap), h)
  }
}

function renderWaveform() {
  const canvas = waveformCanvas.value
  if (!canvas || !timelineRef.value) return

  const width = timelineRef.value.offsetWidth
  const height = 100
  const dpr = window.devicePixelRatio || 1

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
  }

  drawWaveformToBuffer(waveformCache, width * dpr, height * dpr)

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(offscreenWaveform, 0, 0)
}

function scheduleRender() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    renderWaveform()
    rafId = null
  })
}

let thumbnailBatchIndex = 0
const THUMBNAIL_BATCH_SIZE = 3

async function generateThumbnailBatch() {
  if (!thumbnailVideo || !framesCanvas.value || !timelineRef.value) return
  if (thumbnailGenAbort) return

  const canvas = framesCanvas.value
  const width = timelineRef.value.offsetWidth
  const height = 60
  const dpr = window.devicePixelRatio || 1

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
  }

  const totalFrames = 12
  const frameWidth = width / totalFrames
  const startIndex = thumbnailBatchIndex * THUMBNAIL_BATCH_SIZE
  const endIndex = Math.min(startIndex + THUMBNAIL_BATCH_SIZE, totalFrames)

  const video = thumbnailVideo

  for (let i = startIndex; i < endIndex; i++) {
    if (thumbnailGenAbort) return

    const time = (i / totalFrames) * props.duration + (props.duration / totalFrames / 2)
    
    try {
      video.currentTime = time
      await new Promise((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        const onError = () => {
          video.removeEventListener('error', onError)
          reject(new Error('seek failed'))
        }
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('error', onError)
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
          resolve()
        }, 3000)
      })
    } catch (_) {
      continue
    }

    if (thumbnailGenAbort) return

    thumbnailCache[i] = true

    const ctx = canvas.getContext('2d')
    const drawWidth = (frameWidth - 2) * dpr
    const drawHeight = height * dpr
    const dx = i * frameWidth * dpr + dpr

    const videoRatio = video.videoWidth / video.videoHeight
    const canvasRatio = drawWidth / drawHeight

    let renderWidth, renderHeight, offsetX, offsetY

    if (videoRatio > canvasRatio) {
      renderHeight = drawHeight
      renderWidth = drawHeight * videoRatio
      offsetX = -(renderWidth - drawWidth) / 2
      offsetY = 0
    } else {
      renderWidth = drawWidth
      renderHeight = drawWidth / videoRatio
      offsetX = 0
      offsetY = -(renderHeight - drawHeight) / 2
    }

    ctx.drawImage(video, dx + offsetX, offsetY, renderWidth, renderHeight)
  }

  thumbnailBatchIndex++
  if (thumbnailBatchIndex * THUMBNAIL_BATCH_SIZE < totalFrames) {
    await new Promise(resolve => setTimeout(resolve, 100))
    await generateThumbnailBatch()
  }
}

async function initThumbnails(file) {
  thumbnailGenAbort = true
  await new Promise(resolve => setTimeout(resolve, 50))
  
  if (thumbnailUrl) {
    URL.revokeObjectURL(thumbnailUrl)
    thumbnailUrl = null
  }
  if (thumbnailVideo) {
    thumbnailVideo.src = ''
    thumbnailVideo = null
  }

  thumbnailCache = []
  thumbnailBatchIndex = 0
  thumbnailGenAbort = false

  thumbnailVideo = document.createElement('video')
  thumbnailVideo.muted = true
  thumbnailVideo.preload = 'auto'
  thumbnailUrl = URL.createObjectURL(file)
  thumbnailVideo.src = thumbnailUrl

  try {
    await new Promise((resolve, reject) => {
      thumbnailVideo.onloadedmetadata = resolve
      thumbnailVideo.onerror = reject
      setTimeout(reject, 10000)
    })

    await generateThumbnailBatch()
  } catch (_) {
    const canvas = framesCanvas.value
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#0f0f1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }
}

function cleanup() {
  thumbnailGenAbort = true
  
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (thumbnailVideo) {
    thumbnailVideo.src = ''
    thumbnailVideo = null
  }

  if (thumbnailUrl) {
    URL.revokeObjectURL(thumbnailUrl)
    thumbnailUrl = null
  }

  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }

  thumbnailCache = []
  waveformCache = null
  offscreenWaveform = null
  offscreenWaveformCtx = null
}

let waveformDebounceTimer = null
function debouncedWaveformExtract(file) {
  if (waveformDebounceTimer) clearTimeout(waveformDebounceTimer)
  waveformDebounceTimer = setTimeout(async () => {
    const data = await extractWaveformViaAudioApi(file)
    if (data) {
      waveformCache = data
    }
    scheduleRender()
  }, 300)
}

watch(() => [props.inPoint, props.outPoint], () => {
  scheduleRender()
})

watch(() => props.videoFile, async (newFile) => {
  if (newFile) {
    await nextTick()
    
    debouncedWaveformExtract(newFile)
    
    await initThumbnails(newFile)
  }
})

onMounted(() => {
  nextTick(() => {
    scheduleRender()
  })

  if (timelineRef.value) {
    resizeObserver = new ResizeObserver(() => {
      scheduleRender()
    })
    resizeObserver.observe(timelineRef.value)
  }
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped>
.timeline-container {
  width: 100%;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.timeline-header h3 {
  font-size: 18px;
  color: var(--text-primary);
}

.time-inputs {
  display: flex;
  gap: 16px;
  align-items: center;
}

.time-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-input-group label {
  font-size: 12px;
  color: var(--text-secondary);
}

.time-input {
  width: 100px;
}

.duration-display span {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: var(--secondary);
  background: var(--bg-dark);
  padding: 8px 12px;
  border-radius: 6px;
}

.timeline-area {
  position: relative;
  background: var(--bg-dark);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}

.waveform-canvas {
  width: 100%;
  height: 100px;
  display: block;
}

.frame-preview-container {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.frames-canvas {
  width: 100%;
  height: 60px;
  display: block;
}

.selection-overlay {
  position: absolute;
  top: 0;
  bottom: 30px;
  background: rgba(16, 185, 129, 0.15);
  border-left: 2px solid var(--secondary);
  border-right: 2px solid var(--secondary);
  pointer-events: none;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 24px;
  cursor: ew-resize;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.handle-in {
  left: -12px;
}

.handle-out {
  right: -12px;
}

.handle-line {
  width: 3px;
  height: 100%;
  background: var(--secondary);
  border-radius: 2px;
}

.handle-label {
  position: absolute;
  top: 4px;
  background: var(--secondary);
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 30px;
  width: 2px;
  background: var(--danger);
  pointer-events: none;
  z-index: 10;
}

.playhead-triangle {
  position: absolute;
  top: -6px;
  left: -5px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--danger);
}

.playhead-line {
  width: 100%;
  height: 100%;
  background: var(--danger);
}

.time-ruler {
  position: relative;
  height: 30px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
}

.time-tick {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tick-mark {
  width: 1px;
  height: 8px;
  background: var(--border);
}

.tick-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
}
</style>
