<template>
  <div class="processor-container card">
    <div class="processor-header">
      <h3>⚙️ 导出设置</h3>
      <div class="export-info">
        <span>剪辑范围: {{ formatTime(inPoint) }} - {{ formatTime(outPoint) }}</span>
        <span>时长: {{ formatTime(outPoint - inPoint) }}</span>
      </div>
    </div>

    <div v-if="memoryWarning" class="warning-message">
      <span>⚠️</span>
      <span>{{ memoryWarning }}</span>
    </div>

    <div class="processor-content">
      <div class="section-title">
        <span>🎨 视频效果</span>
        <span class="section-subtitle">可选，选择后将自动使用重新编码模式</span>
      </div>

      <div class="effects-grid">
        <label class="effect-card" :class="{ active: effects.blackAndWhite }">
          <div class="effect-preview bw-preview">
            <span>⬛</span>
          </div>
          <div class="effect-content">
            <span class="effect-title">黑白</span>
            <span class="effect-desc">去饱和灰度效果</span>
          </div>
          <input
            type="checkbox"
            v-model="effects.blackAndWhite"
            class="effect-checkbox"
          />
        </label>

        <label class="effect-card" :class="{ active: effects.vintage }">
          <div class="effect-preview vintage-preview">
            <span>📷</span>
          </div>
          <div class="effect-content">
            <span class="effect-title">复古</span>
            <span class="effect-desc">怀旧电影色调</span>
          </div>
          <input
            type="checkbox"
            v-model="effects.vintage"
            class="effect-checkbox"
          />
        </label>

        <label class="effect-card speed-card" :class="{ active: effects.speed !== 1 }">
          <div class="effect-preview speed-preview">
            <span>⚡</span>
          </div>
          <div class="effect-content">
            <span class="effect-title">变速</span>
            <div class="speed-control">
              <input
                type="range"
                v-model.number="effects.speed"
                min="0.5"
                max="3"
                step="0.25"
                class="speed-slider"
                @input="handleSpeedChange"
              />
              <span class="speed-value">{{ effects.speed.toFixed(2) }}x</span>
            </div>
          </div>
        </label>

        <label class="effect-card rotate-card" :class="{ active: effects.rotate }">
          <div class="effect-preview rotate-preview">
            <span>🔄</span>
          </div>
          <div class="effect-content">
            <span class="effect-title">旋转</span>
            <select v-model="effects.rotate" class="rotate-select">
              <option :value="0">不旋转</option>
              <option :value="90">顺时针 90°</option>
              <option :value="180">旋转 180°</option>
              <option :value="270">逆时针 90°</option>
            </select>
          </div>
        </label>
      </div>

      <div class="section-title" v-if="hasAnyEffect">
        <span>🎚️ 高级调整</span>
      </div>

      <div v-if="hasAnyEffect" class="advanced-controls">
        <div class="control-group">
          <label>对比度</label>
          <div class="slider-control">
            <input
              type="range"
              v-model.number="effects.contrast"
              min="0.5"
              max="2"
              step="0.1"
              class="control-slider"
            />
            <span class="control-value">{{ effects.contrast.toFixed(1) }}</span>
          </div>
        </div>
        <div class="control-group">
          <label>亮度</label>
          <div class="slider-control">
            <input
              type="range"
              v-model.number="effects.brightness"
              min="-0.5"
              max="0.5"
              step="0.05"
              class="control-slider"
            />
            <span class="control-value">{{ effects.brightness.toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <div v-if="hasAnyEffect" class="filter-preview">
        <span class="preview-label">生成的 FFmpeg 滤镜:</span>
        <code class="filter-code">{{ filterPreview }}</code>
      </div>

      <div class="section-title">
        <span>📤 导出参数</span>
      </div>

      <div class="settings-grid">
        <div class="setting-group">
          <label>输出格式</label>
          <select v-model="exportSettings.format" class="input">
            <option value="mp4">MP4</option>
          </select>
        </div>

        <div class="setting-group">
          <label>编码模式</label>
          <select v-model="exportSettings.mode" class="input" :disabled="hasAnyEffect">
            <option value="auto">自动 (推荐)</option>
            <option value="copy">流复制 (快速，低内存)</option>
            <option value="encode">重新编码 (高质量)</option>
          </select>
        </div>

        <div class="setting-group" v-if="exportSettings.mode !== 'copy'">
          <label>画质预设</label>
          <select v-model="exportSettings.quality" class="input">
            <option value="high">高质量 (CRF 18)</option>
            <option value="medium">中等质量 (CRF 23)</option>
            <option value="fast">快速 (CRF 28)</option>
          </select>
        </div>

        <div class="setting-group">
          <label>输出文件名</label>
          <input
            v-model="exportSettings.filename"
            type="text"
            class="input"
            placeholder="edited_video"
          />
        </div>
      </div>

      <div class="mode-hint">
        <template v-if="hasAnyEffect">
          🎨 已启用视频效果，将使用重新编码模式处理（速度较慢但效果精确）
        </template>
        <template v-else-if="exportSettings.mode === 'auto'">
          💡 自动模式：大文件 (>100MB) 使用流复制避免内存溢出，小文件重新编码保证质量
        </template>
        <template v-else-if="exportSettings.mode === 'copy'">
          ⚡ 流复制：直接拷贝视频/音频流，速度极快，内存占用极低，但剪切精度为关键帧级别
        </template>
        <template v-else>
          🎬 重新编码：帧级精确剪切，但需要更多内存和处理时间，大文件可能导致 OOM
        </template>
      </div>

      <div v-if="isExporting" class="export-progress">
        <div class="progress-header">
          <span>{{ phaseLabel }}</span>
          <span>{{ overallProgress }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: overallProgress + '%' }"></div>
        </div>

        <div v-if="progressDetails" class="progress-details">
          <div class="detail-item">
            <span class="detail-label">已处理</span>
            <span class="detail-value">{{ formatMs(progressDetails.currentMs || 0) }} / {{ formatMs(progressDetails.totalMs || 0) }}</span>
          </div>
          <div v-if="progressDetails.speed" class="detail-item">
            <span class="detail-label">处理速度</span>
            <span class="detail-value">{{ progressDetails.speed }}x</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">阶段</span>
            <span class="detail-value phase-indicator" :class="'phase-' + currentPhase">
              {{ phaseNames[currentPhase] }}
            </span>
          </div>
        </div>

        <div class="progress-phases">
          <div class="phase" :class="{ active: currentPhase === 'writing', done: writingDone }">
            <span class="phase-dot"></span>
            <span>写入文件</span>
          </div>
          <div class="phase" :class="{ active: currentPhase === 'processing', done: processingDone }">
            <span class="phase-dot"></span>
            <span>处理视频</span>
          </div>
          <div class="phase" :class="{ active: currentPhase === 'reading', done: readingDone }">
            <span class="phase-dot"></span>
            <span>读取结果</span>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-message">
        <span>❌</span>
        <span>{{ error }}</span>
      </div>

      <div class="action-buttons">
        <button
          class="btn btn-outline"
          @click="resetEffects"
          :disabled="isExporting"
        >
          🔄 重置效果
        </button>
        <button
          class="btn btn-primary"
          :disabled="disabled || isExporting || !!memoryWarning"
          @click="startExport"
        >
          <span v-if="isExporting" class="loading"></span>
          {{ isExporting ? '处理中...' : '📥 导出视频' }}
        </button>
        
        <button
          v-if="downloadUrl"
          class="btn btn-secondary"
          @click="downloadVideo"
        >
          💾 下载视频
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { useFFmpeg, checkMemoryFeasibility } from '../composables/useFFmpeg'

const props = defineProps({
  videoFile: Object,
  inPoint: {
    type: Number,
    default: 0
  },
  outPoint: {
    type: Number,
    default: 0
  },
  disabled: Boolean
})

const emit = defineEmits(['export-start', 'export-complete'])

const { trimVideo, ffmpegLoaded, buildFilterComplex } = useFFmpeg()

const isExporting = ref(false)
const error = ref('')
const downloadUrl = ref('')
const currentPhase = ref('idle')
const writingDone = ref(false)
const processingDone = ref(false)
const readingDone = ref(false)
const overallProgress = ref(0)
const progressDetails = ref(null)

const phaseNames = {
  writing: '写入文件',
  processing: '处理视频',
  reading: '读取结果',
  complete: '完成',
  idle: '空闲'
}

const exportSettings = reactive({
  format: 'mp4',
  quality: 'medium',
  filename: 'edited_video',
  mode: 'auto'
})

const effects = reactive({
  blackAndWhite: false,
  vintage: false,
  speed: 1,
  contrast: 1,
  brightness: 0,
  rotate: 0
})

const hasAnyEffect = computed(() => {
  return effects.blackAndWhite ||
    effects.vintage ||
    effects.speed !== 1 ||
    effects.contrast !== 1 ||
    effects.brightness !== 0 ||
    effects.rotate !== 0
})

const filterPreview = computed(() => {
  const config = buildFilterComplex(effects)
  return config.filterComplex || '(无)'
})

const memoryWarning = computed(() => {
  if (!props.videoFile) return ''
  const check = checkMemoryFeasibility(props.videoFile.size, hasAnyEffect.value)
  if (!check.feasible) {
    return check.reason
  }
  if (props.videoFile.size > 500 * 1024 * 1024 && (exportSettings.mode === 'encode' || hasAnyEffect.value)) {
    return `文件较大 (${(props.videoFile.size / 1024 / 1024).toFixed(0)}MB)，重新编码${hasAnyEffect.value ? '（含视频效果）' : ''}可能导致内存溢出，建议使用"流复制"模式或更小的视频文件`
  }
  return ''
})

const phaseLabel = computed(() => {
  switch (currentPhase.value) {
    case 'writing': return '正在写入文件到 WASM...'
    case 'processing': return '正在处理视频...'
    case 'reading': return '正在读取结果...'
    case 'complete': return '处理完成！'
    default: return ''
  }
})

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const formatMs = (ms) => {
  const seconds = ms / 1000
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const milliseconds = Math.floor((seconds % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
}

const handleSpeedChange = () => {
}

const resetEffects = () => {
  effects.blackAndWhite = false
  effects.vintage = false
  effects.speed = 1
  effects.contrast = 1
  effects.brightness = 0
  effects.rotate = 0
}

const handleProgress = (data) => {
  overallProgress.value = data.percent

  if (data.phase === 'writing') {
    currentPhase.value = 'writing'
  } else if (data.phase === 'processing') {
    currentPhase.value = 'processing'
    writingDone.value = true
    progressDetails.value = {
      currentMs: data.currentMs,
      totalMs: data.totalMs,
      speed: data.speed
    }
  } else if (data.phase === 'reading') {
    currentPhase.value = 'reading'
    processingDone.value = true
  } else if (data.phase === 'complete') {
    currentPhase.value = 'complete'
    readingDone.value = true
  }
}

const startExport = async () => {
  if (!props.videoFile || !ffmpegLoaded.value) {
    error.value = ffmpegLoaded.value ? '请先上传视频文件' : 'FFmpeg 正在加载中，请稍候...'
    return
  }

  if (memoryWarning.value && exportSettings.mode === 'encode' && !hasAnyEffect.value) {
    error.value = '当前文件过大，请切换到"流复制"或"自动"模式'
    return
  }

  isExporting.value = true
  error.value = ''
  currentPhase.value = 'writing'
  writingDone.value = false
  processingDone.value = false
  readingDone.value = false
  overallProgress.value = 0
  progressDetails.value = null
  emit('export-start')

  try {
    const effectsClone = { ...effects }

    const blob = await trimVideo(
      props.videoFile,
      props.inPoint,
      props.outPoint,
      exportSettings.mode,
      effectsClone,
      handleProgress
    )

    writingDone.value = true
    processingDone.value = true
    readingDone.value = true
    currentPhase.value = 'complete'
    overallProgress.value = 100

    if (downloadUrl.value) {
      URL.revokeObjectURL(downloadUrl.value)
    }

    downloadUrl.value = URL.createObjectURL(blob)

    setTimeout(() => {
      downloadVideo()
    }, 500)
  } catch (err) {
    console.error('Export failed:', err)
    error.value = err.message || '导出失败，请重试'
    currentPhase.value = 'idle'
  } finally {
    isExporting.value = false
    emit('export-complete')
  }
}

const downloadVideo = () => {
  if (!downloadUrl.value) return

  const link = document.createElement('a')
  link.href = downloadUrl.value

  let suffix = ''
  if (effects.blackAndWhite) suffix += '_bw'
  if (effects.vintage) suffix += '_vintage'
  if (effects.speed !== 1) suffix += `_${effects.speed}x`
  if (effects.rotate) suffix += `_rot${effects.rotate}`

  link.download = `${exportSettings.filename}${suffix}.${exportSettings.format}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

watch(hasAnyEffect, (hasEffects) => {
  if (hasEffects && exportSettings.mode === 'copy') {
    exportSettings.mode = 'encode'
  }
})
</script>

<style scoped>
.processor-container {
  width: 100%;
}

.processor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.processor-header h3 {
  font-size: 18px;
  color: var(--text-primary);
}

.export-info {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.processor-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.section-subtitle {
  font-size: 11px;
  font-weight: normal;
  color: var(--text-secondary);
}

.effects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.effect-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-dark);
  border: 2px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.effect-card:hover {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.effect-card.active {
  border-color: var(--secondary);
  background: rgba(16, 185, 129, 0.1);
}

.effect-preview {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.bw-preview {
  background: linear-gradient(135deg, #333 0%, #888 50%, #333 100%);
}

.vintage-preview {
  background: linear-gradient(135deg, #8b4513 0%, #daa520 50%, #8b4513 100%);
}

.speed-preview {
  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
}

.rotate-preview {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
}

.effect-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.effect-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.effect-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.effect-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--secondary);
  flex-shrink: 0;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.speed-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  min-width: 0;
}

.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

.speed-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  min-width: 42px;
  text-align: right;
}

.rotate-select {
  width: 100%;
  padding: 4px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
}

.advanced-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 12px;
  background: var(--bg-dark);
  border-radius: 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-group label {
  font-size: 12px;
  color: var(--text-secondary);
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.control-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

.control-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  min-width: 40px;
  text-align: right;
  font-family: 'Courier New', monospace;
}

.filter-preview {
  padding: 12px;
  background: var(--bg-dark);
  border-radius: 8px;
  border-left: 3px solid var(--primary);
}

.preview-label {
  font-size: 11px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 6px;
}

.filter-code {
  display: block;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  color: var(--secondary);
  word-break: break-all;
  line-height: 1.5;
  background: var(--bg-card);
  padding: 8px;
  border-radius: 4px;
  max-height: 60px;
  overflow-y: auto;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-group label {
  font-size: 13px;
  color: var(--text-secondary);
}

.setting-group .input {
  width: 100%;
}

.setting-group select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mode-hint {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 10px 14px;
  background: var(--bg-dark);
  border-radius: 8px;
  border-left: 3px solid var(--primary);
  line-height: 1.6;
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  color: #f59e0b;
  font-size: 14px;
  margin-bottom: 8px;
}

.export-progress {
  background: var(--bg-dark);
  border-radius: 8px;
  padding: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--text-primary);
}

.progress-details {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: 6px;
  flex-wrap: wrap;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'Courier New', monospace;
}

.phase-indicator {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.phase-indicator.phase-writing {
  background: rgba(99, 102, 241, 0.2);
  color: var(--primary);
}

.phase-indicator.phase-processing {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.phase-indicator.phase-reading {
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
}

.phase-indicator.phase-complete {
  background: rgba(16, 185, 129, 0.2);
  color: var(--secondary);
}

.progress-phases {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  justify-content: center;
}

.phase {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.phase.active {
  color: var(--primary);
}

.phase.done {
  color: var(--secondary);
}

.phase-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.3s;
}

.phase.active .phase-dot {
  background: var(--primary);
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
}

.phase.done .phase-dot {
  background: var(--secondary);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: var(--danger);
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
