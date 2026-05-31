<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { dockerApi } from '../api/docker'
import type { Container, CommandOutput } from '../types'

const props = defineProps<{
  container: Container
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
  commandExecuted: []
}>()

const commandOutput = ref<CommandOutput[]>([])
const isExecuting = ref(false)
const activeCommand = ref('')
let unlisten: (() => void) | null = null

const menuItems = [
  { command: 'stop', label: '停止容器', icon: '⏹', color: '#ef4444' },
  { command: 'start', label: '启动容器', icon: '▶', color: '#10b981' },
  { command: 'restart', label: '重启容器', icon: '🔄', color: '#f59e0b' },
  { command: 'pause', label: '暂停容器', icon: '⏸', color: '#8b5cf6' },
  { command: 'unpause', label: '恢复容器', icon: '⏯', color: '#06b6d4' },
  { command: 'rm', label: '删除容器', icon: '🗑', color: '#ef4444' },
]

const executeCommand = async (cmd: string) => {
  if (isExecuting.value) return
  isExecuting.value = true
  activeCommand.value = cmd
  commandOutput.value = []

  try {
    unlisten = await dockerApi.onCommandOutput(props.container.Id, (output) => {
      commandOutput.value.push(output)
      if (output.stream_type === 'system' && output.line.startsWith('✓')) {
        setTimeout(() => emit('commandExecuted'), 500)
      }
    })

    await dockerApi.executeDockerCommand(
      cmd,
      props.container.Id,
      props.container.Names[0]?.replace('/', '') || props.container.Id.slice(0, 12)
    )
  } catch (e: any) {
    commandOutput.value.push({
      line: `Error: ${e}`,
      stream_type: 'stderr',
      is_error: true,
    })
  } finally {
    isExecuting.value = false
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (unlisten) unlisten()
})
</script>

<template>
  <div class="context-menu-overlay" @click.self="emit('close')" @contextmenu.prevent="emit('close')">
    <div
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
    >
      <div class="context-menu-header">
        {{ container.Names[0]?.replace('/', '') || container.Id.slice(0, 12) }}
        <span class="status-badge" :class="container.State === 'running' ? 'status-running' : 'status-exited'">
          {{ container.State }}
        </span>
      </div>
      <div class="context-menu-items">
        <button
          v-for="item in menuItems"
          :key="item.command"
          class="context-menu-item"
          :disabled="isExecuting"
          @click="executeCommand(item.command)"
        >
          <span class="item-icon">{{ item.icon }}</span>
          <span class="item-label">{{ item.label }}</span>
          <span class="item-cmd">docker {{ item.command }}</span>
        </button>
      </div>
      <div v-if="commandOutput.length > 0" class="command-output">
        <div class="output-header">
          命令输出
          <span v-if="isExecuting" class="output-spinner">⏳</span>
        </div>
        <div class="output-body">
          <div
            v-for="(line, i) in commandOutput"
            :key="i"
            class="output-line"
            :class="{
              'output-stdout': line.stream_type === 'stdout',
              'output-stderr': line.stream_type === 'stderr' || line.is_error,
              'output-system': line.stream_type === 'system'
            }"
          >
            {{ line.line }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
}
.context-menu {
  position: absolute;
  min-width: 280px;
  max-width: 420px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.context-menu-header {
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #f8fafc;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}
.context-menu-items {
  padding: 6px 0;
}
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.context-menu-item:hover:not(:disabled) {
  background: #0f172a;
}
.context-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.item-icon {
  width: 20px;
  text-align: center;
}
.item-label {
  flex: 1;
  text-align: left;
}
.item-cmd {
  color: #64748b;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}
.command-output {
  border-top: 1px solid #334155;
}
.output-header {
  padding: 8px 14px;
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 6px;
}
.output-spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.output-body {
  max-height: 150px;
  overflow-y: auto;
  padding: 0 14px 10px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}
.output-line {
  padding: 2px 0;
  word-break: break-all;
}
.output-stdout {
  color: #6ee7b7;
}
.output-stderr {
  color: #fca5a5;
}
.output-system {
  color: #60a5fa;
  font-weight: 500;
}
.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.status-running {
  background: #065f46;
  color: #6ee7b7;
}
.status-exited {
  background: #7f1d1d;
  color: #fca5a5;
}
</style>
