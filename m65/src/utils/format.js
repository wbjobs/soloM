export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export function formatTransferSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 B/s'
  if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(2) + ' B/s'
  if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(2) + ' KB/s'
  if (bytesPerSecond < 1024 * 1024 * 1024) return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s'
  return (bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s'
}

export function formatDuration(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + ' 秒'
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins} 分 ${secs} 秒`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours} 小时 ${mins} 分`
}
