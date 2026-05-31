export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function formatDuration(ns: number): string {
  if (ns >= 1000000) {
    return (ns / 1000000).toFixed(2) + ' ms'
  }
  if (ns >= 1000) {
    return (ns / 1000).toFixed(2) + ' μs'
  }
  return ns + ' ns'
}

export function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const msStr = (ms % 1000).toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${msStr}`
}

export function formatDate(ms: number): string {
  const date = new Date(ms)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function getHeatmapColor(intensity: number, maxIntensity: number): string {
  const ratio = Math.min(intensity / maxIntensity, 1)
  const hue = 180 - ratio * 180
  const saturation = 80
  const lightness = 20 + ratio * 30
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export function getSyscallColor(syscall: string): string {
  const colors: Record<string, string> = {
    open: '#00f5d4',
    openat: '#00e5c4',
    execve: '#ff4757',
    execveat: '#ff6b7a',
    read: '#1e90ff',
    write: '#ffa502',
    close: '#a55eea',
    fork: '#2ed573',
    vfork: '#26c266',
    clone: '#20a858',
  }
  return colors[syscall] || '#6c757d'
}

export function getRetvalColor(retval: number): string {
  if (retval < 0) return '#ff4757'
  if (retval === 0) return '#ffa502'
  return '#2ed573'
}
