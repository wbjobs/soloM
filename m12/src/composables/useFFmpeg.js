import { ref, shallowRef, markRaw } from 'vue'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CHUNK_SIZE = 64 * 1024 * 1024

const ffmpeg = shallowRef(null)
const ffmpegLoading = ref(false)
const ffmpegLoaded = ref(false)
const loadProgress = ref(0)
const exportProgress = ref(0)
const writingProgress = ref(0)
const processingProgress = ref(0)
const currentProcessedTime = ref(0)
const totalDuration = ref(0)

const timeRegex = /out_time_ms=(\d+)/
const timeRegexAlt = /time=(\d{2}):(\d{2}):(\d{2}\.\d{2,3})/
const frameRegex = /frame=(\d+)/
const speedRegex = /speed=([\d.]+)x/
const durationRegex = /Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2,3})/

function parseDurationToSeconds(h, m, s) {
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
}

function parseFFmpegProgress(message, totalDurMs) {
  const timeMatch = message.match(timeRegex)
  if (timeMatch && totalDurMs > 0) {
    const currentMs = parseInt(timeMatch[1])
    const progress = Math.min(100, Math.round((currentMs / totalDurMs) * 100))
    return {
      progress,
      currentMs,
      totalMs: totalDurMs
    }
  }

  const timeMatchAlt = message.match(timeRegexAlt)
  if (timeMatchAlt && totalDurMs > 0) {
    const currentMs = parseDurationToSeconds(
      timeMatchAlt[1], timeMatchAlt[2], timeMatchAlt[3]
    ) * 1000
    const progress = Math.min(100, Math.round((currentMs / totalDurMs) * 100))
    return {
      progress,
      currentMs,
      totalMs: totalDurMs
    }
  }

  return null
}

function estimateRequiredMemory(fileSize, hasFilters = false) {
  const multiplier = hasFilters ? 5 : 3.5
  return fileSize * multiplier
}

function getAvailableMemory() {
  if (performance.memory) {
    return performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize
  }
  return 2 * 1024 * 1024 * 1024
}

export function checkMemoryFeasibility(fileSize, hasFilters = false) {
  const required = estimateRequiredMemory(fileSize, hasFilters)
  const available = getAvailableMemory()
  const safeLimit = hasFilters ? 1.5 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024

  if (fileSize > safeLimit) {
    return {
      feasible: false,
      reason: `文件过大 (${(fileSize / 1024 / 1024).toFixed(0)}MB)，超过浏览器安全限制 (~${(safeLimit / 1024 / 1024).toFixed(0)}MB)。建议使用较小的视频文件。`,
      required,
      available
    }
  }

  return { feasible: true, required, available }
}

function readFileChunk(file, start, end) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(start, end)
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = reject
    reader.readAsArrayBuffer(slice)
  })
}

async function writeFileInChunks(ffmpegInstance, fileName, file, onProgress) {
  const totalSize = file.size

  if (totalSize <= CHUNK_SIZE) {
    const data = await fetchFile(file)
    await ffmpegInstance.writeFile(fileName, data)
    if (onProgress) onProgress(100)
    return
  }

  const chunks = []
  let offset = 0

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize)
    const chunk = await readFileChunk(file, offset, end)
    chunks.push(chunk)
    offset = end
    if (onProgress) {
      onProgress(Math.round((offset / totalSize) * 50))
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const combined = new Uint8Array(totalLength)
  let writeOffset = 0
  for (const chunk of chunks) {
    combined.set(chunk, writeOffset)
    writeOffset += chunk.length
  }

  chunks.length = 0

  await ffmpegInstance.writeFile(fileName, combined)

  combined.fill(0)

  if (onProgress) onProgress(100)
}

async function freeWasmmMemory(ffmpegInstance) {
  try {
    const files = await ffmpegInstance.listDir('/')
    for (const file of files) {
      if (file.name !== '.' && file.name !== '..' && file.name !== 'dev') {
        try {
          await ffmpegInstance.deleteFile(file.name)
        } catch (_) {}
      }
    }
  } catch (_) {}
}

export function useFFmpeg() {
  const logHandlerRef = ref(null)
  const progressHandlerRef = ref(null)
  const detectedDurationRef = ref(0)

  const initFFmpeg = async () => {
    if (ffmpegLoaded.value) return

    ffmpegLoading.value = true
    loadProgress.value = 0

    try {
      const instance = new FFmpeg()
      ffmpeg.value = markRaw(instance)

      instance.on('log', ({ message }) => {
        console.log('FFmpeg log:', message)

        if (!detectedDurationRef.value) {
          const durMatch = message.match(durationRegex)
          if (durMatch) {
            detectedDurationRef.value = parseDurationToSeconds(
              durMatch[1], durMatch[2], durMatch[3]
            ) * 1000
          }
        }

        const parsed = parseFFmpegProgress(message, detectedDurationRef.value)
        if (parsed) {
          processingProgress.value = parsed.progress
          currentProcessedTime.value = parsed.currentMs / 1000

          if (logHandlerRef.value) {
            logHandlerRef.value({
              ...parsed,
              message,
              speed: message.match(speedRegex)?.[1] || null
            })
          }
        }
      })

      instance.on('progress', ({ progress }) => {
        const p = Math.round(Math.max(0, Math.min(1, progress)) * 100)
        exportProgress.value = p

        if (progressHandlerRef.value) {
          progressHandlerRef.value(p)
        }
      })

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await instance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      })

      ffmpegLoaded.value = true
      loadProgress.value = 100
    } catch (error) {
      console.error('Failed to load FFmpeg:', error)
    } finally {
      ffmpegLoading.value = false
    }
  }

  const buildFilterComplex = (effects) => {
    const filters = []
    const labels = []
    let currentLabel = '0:v'
    let audioLabel = '0:a'
    let filterIndex = 0

    if (effects.blackAndWhite) {
      const outLabel = `v${filterIndex}`
      filters.push(`${currentLabel},hue=s=0:b=0[${outLabel}]`)
      currentLabel = `[${outLabel}]`
      filterIndex++
    }

    if (effects.vintage) {
      const outLabel = `v${filterIndex}`
      filters.push(
        `${currentLabel},colorlevels=rimin=0.02:gimin=0.01:bimin=0:` +
        `rimax=0.9:gimax=0.85:bimax=0.75,` +
        `eq=contrast=1.1:brightness=-0.05:saturation=0.6[${outLabel}]`
      )
      currentLabel = `[${outLabel}]`
      filterIndex++
    }

    if (effects.speed && effects.speed > 0 && effects.speed !== 1) {
      const videoOutLabel = `v${filterIndex}`
      const audioOutLabel = `a${filterIndex}`
      filters.push(`${currentLabel},setpts=${1 / effects.speed}*PTS[${videoOutLabel}]`)
      filters.push(`[0:a]atempo=${effects.speed}[${audioOutLabel}]`)
      currentLabel = `[${videoOutLabel}]`
      audioLabel = `[${audioOutLabel}]`
      filterIndex++
    }

    if (effects.contrast !== 1 || effects.brightness !== 0) {
      const outLabel = `v${filterIndex}`
      const contrast = Math.max(0.5, Math.min(2, effects.contrast))
      const brightness = Math.max(-0.5, Math.min(0.5, effects.brightness))
      filters.push(
        `${currentLabel},eq=contrast=${contrast}:brightness=${brightness}[${outLabel}]`
      )
      currentLabel = `[${outLabel}]`
      filterIndex++
    }

    if (effects.rotate) {
      const outLabel = `v${filterIndex}`
      let rotateAngle = ''
      switch (effects.rotate) {
        case 90: rotateAngle = 'PI/2'; break
        case 180: rotateAngle = 'PI'; break
        case 270: rotateAngle = '-PI/2'; break
        default: rotateAngle = '0'
      }
      filters.push(`${currentLabel},rotate=${rotateAngle}[${outLabel}]`)
      currentLabel = `[${outLabel}]`
      filterIndex++
    }

    return {
      filterComplex: filters.length > 0 ? filters.join(';') : null,
      videoMap: currentLabel.startsWith('[') ? currentLabel : `[${currentLabel}]`,
      audioMap: audioLabel.startsWith('[') ? audioLabel : `[${audioLabel}]`,
      hasFilters: filters.length > 0
    }
  }

  const trimVideo = async (
    inputFile,
    startTime,
    endTime,
    mode = 'auto',
    effects = {},
    onProgress = null
  ) => {
    if (!ffmpegLoaded.value || !ffmpeg.value) {
      throw new Error('FFmpeg not loaded')
    }

    const inputFileName = 'input.mp4'
    const outputFileName = 'output.mp4'
    const duration = endTime - startTime
    totalDuration.value = duration

    detectedDurationRef.value = Math.max(duration * 1000, 0)
    processingProgress.value = 0
    currentProcessedTime.value = 0

    const filterConfig = buildFilterComplex(effects)
    const hasFilters = filterConfig.hasFilters

    if (hasFilters && mode === 'copy') {
      mode = 'encode'
    }

    try {
      await writeFileInChunks(ffmpeg.value, inputFileName, inputFile, (p) => {
        writingProgress.value = p
        if (onProgress) {
          onProgress({
            phase: 'writing',
            progress: p,
            percent: Math.round(p * 0.3)
          })
        }
      })

      const useStreamCopy = !hasFilters && (
        mode === 'copy' || (mode === 'auto' && inputFile.size > 100 * 1024 * 1024)
      )

      let args
      if (useStreamCopy) {
        args = [
          '-ss', startTime.toString(),
          '-i', inputFileName,
          '-t', duration.toString(),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputFileName
        ]
      } else {
        args = [
          '-ss', startTime.toString(),
          '-i', inputFileName,
          '-t', duration.toString()
        ]

        if (filterConfig.filterComplex) {
          args.push('-filter_complex', filterConfig.filterComplex)
          args.push('-map', filterConfig.videoMap)
          args.push('-map', filterConfig.audioMap)
        }

        args.push(
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          outputFileName
        )
      }

      exportProgress.value = 0

      const logHandler = (data) => {
        if (onProgress) {
          const basePercent = 30
          const processPercent = Math.round(data.progress * 0.65)
          onProgress({
            phase: 'processing',
            progress: data.progress,
            percent: basePercent + processPercent,
            currentMs: data.currentMs,
            totalMs: data.totalMs,
            speed: data.speed,
            message: data.message
          })
        }
      }
      logHandlerRef.value = logHandler

      await ffmpeg.value.exec(args)

      if (onProgress) {
        onProgress({
          phase: 'reading',
          progress: 100,
          percent: 95
        })
      }

      const data = await ffmpeg.value.readFile(outputFileName)

      const blob = new Blob([data.buffer], { type: 'video/mp4' })

      if (onProgress) {
        onProgress({
          phase: 'complete',
          progress: 100,
          percent: 100,
          blob
        })
      }

      return blob
    } finally {
      logHandlerRef.value = null
      progressHandlerRef.value = null
      detectedDurationRef.value = 0

      try {
        await ffmpeg.value.deleteFile(inputFileName)
      } catch (_) {}
      try {
        await ffmpeg.value.deleteFile(outputFileName)
      } catch (_) {}

      writingProgress.value = 0
      exportProgress.value = 0
      processingProgress.value = 0
      currentProcessedTime.value = 0
    }
  }

  const extractAudioWaveform = async (inputFile, samples = 200) => {
    if (!ffmpegLoaded.value || !ffmpeg.value) {
      throw new Error('FFmpeg not loaded')
    }

    const inputFileName = 'waveform_input.mp4'
    const outputFileName = 'waveform.pcm'

    try {
      await writeFileInChunks(ffmpeg.value, inputFileName, inputFile, (p) => {
        writingProgress.value = p
      })

      await ffmpeg.value.exec([
        '-i', inputFileName,
        '-f', 's16le',
        '-ac', '1',
        '-ar', '8000',
        outputFileName
      ])

      const data = await ffmpeg.value.readFile(outputFileName)
      const audioData = new Int16Array(data.buffer)

      const blockSize = Math.floor(audioData.length / samples)
      if (blockSize === 0) return new Array(samples).fill(0)

      const waveform = new Float32Array(samples)

      for (let i = 0; i < samples; i++) {
        let sum = 0
        const start = i * blockSize
        const end = Math.min(start + blockSize, audioData.length)

        for (let j = start; j < end; j++) {
          sum += audioData[j] < 0 ? -audioData[j] : audioData[j]
        }

        waveform[i] = sum / (end - start) / 32768
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
    } finally {
      try {
        await ffmpeg.value.deleteFile(inputFileName)
      } catch (_) {}
      try {
        await ffmpeg.value.deleteFile(outputFileName)
      } catch (_) {}

      writingProgress.value = 0
    }
  }

  return {
    ffmpeg,
    ffmpegLoading,
    ffmpegLoaded,
    loadProgress,
    exportProgress,
    writingProgress,
    processingProgress,
    currentProcessedTime,
    totalDuration,
    initFFmpeg,
    trimVideo,
    extractAudioWaveform,
    checkMemoryFeasibility,
    buildFilterComplex
  }
}
