import init, {
  hide_message_in_image,
  extract_message_from_image,
} from 'lsb-stegano-wasm'

const MAX_PIXEL_COUNT = 4096 * 4096

let wasmInitialized = false

async function ensureWasm() {
  if (!wasmInitialized) {
    await init('/lsb_stegano_wasm_bg.wasm')
    wasmInitialized = true
  }
}

function resizeImage(imageData, maxWidth, maxHeight) {
  const blob = new Blob([imageData], { type: 'image/png' })
  const bitmapPromise = createImageBitmap(blob)

  return bitmapPromise.then((bitmap) => {
    let { width, height } = bitmap

    if (width * height <= MAX_PIXEL_COUNT) {
      bitmap.close()
      return { data: imageData, width, height }
    }

    const scale = Math.sqrt(MAX_PIXEL_COUNT / (width * height))
    let newW = Math.floor(width * scale)
    let newH = Math.floor(height * scale)

    if (newW > maxWidth) {
      const r = maxWidth / newW
      newW = maxWidth
      newH = Math.floor(newH * r)
    }
    if (newH > maxHeight) {
      const r = maxHeight / newH
      newH = maxHeight
      newW = Math.floor(newW * r)
    }

    newW = Math.max(1, newW)
    newH = Math.max(1, newH)

    const offscreen = new OffscreenCanvas(newW, newH)
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, newW, newH)
    bitmap.close()

    return offscreen.convertToBlob({ type: 'image/png' }).then((pngBlob) => {
      return pngBlob.arrayBuffer().then((ab) => ({
        data: new Uint8Array(ab),
        width: newW,
        height: newH,
      }))
    })
  })
}

function sendProgress(jobId, current, total, stage, imageName = '') {
  self.postMessage({
    type: 'progress',
    payload: { jobId, current, total, stage, imageName, percent: Math.round((current / total) * 100) },
  })
}

async function processSingleHide(imageItem, index, total, message, key, maxDimension, jobId) {
  sendProgress(jobId, index, total, 'resizing', imageItem.name)
  
  const resized = await resizeImage(imageItem.data, maxDimension, maxDimension)
  
  sendProgress(jobId, index, total, 'encoding', imageItem.name)
  
  const resultData = hide_message_in_image(resized.data, message, key)
  
  sendProgress(jobId, index + 1, total, 'done', imageItem.name)
  
  return {
    name: imageItem.name.replace(/\.[^/.]+$/, '') + '_stego.png',
    data: Array.from(resultData),
    originalName: imageItem.name,
  }
}

async function processSingleExtract(imageItem, index, total, key, jobId) {
  sendProgress(jobId, index, total, 'decoding', imageItem.name)
  
  const result = extract_message_from_image(imageItem.data, key)
  
  sendProgress(jobId, index + 1, total, 'done', imageItem.name)
  
  return {
    name: imageItem.name,
    message: result,
  }
}

self.onmessage = async function (e) {
  const { type, payload } = e.data

  try {
    await ensureWasm()

    if (type === 'hide') {
      const { imageData, message, key, maxDimension } = payload
      const resized = await resizeImage(imageData, maxDimension, maxDimension)

      const resultData = hide_message_in_image(resized.data, message, key)
      self.postMessage({ type: 'hide-success', payload: resultData })
    } else if (type === 'extract') {
      const { imageData, key } = payload
      const result = extract_message_from_image(imageData, key)
      self.postMessage({ type: 'extract-success', payload: result })
    } else if (type === 'resize') {
      const { imageData, maxDimension } = payload
      const resized = await resizeImage(imageData, maxDimension, maxDimension)
      self.postMessage({ type: 'resize-success', payload: resized.data })
    } else if (type === 'batch-hide') {
      const { images, message, key, maxDimension, jobId } = payload
      const results = []

      for (let i = 0; i < images.length; i++) {
        const result = await processSingleHide(images[i], i, images.length, message, key, maxDimension, jobId)
        results.push(result)
      }

      self.postMessage({ type: 'batch-hide-success', payload: { jobId, results } })
    } else if (type === 'batch-extract') {
      const { images, key, jobId } = payload
      const results = []

      for (let i = 0; i < images.length; i++) {
        const result = await processSingleExtract(images[i], i, images.length, key, jobId)
        results.push(result)
      }

      self.postMessage({ type: 'batch-extract-success', payload: { jobId, results } })
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      payload: { message: err.message || '处理失败', operation: type },
    })
  }
}
