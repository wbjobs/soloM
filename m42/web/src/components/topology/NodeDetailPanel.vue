<script setup lang="ts">
import { X, Server } from 'lucide-vue-next'
import type { ClusterNode } from '@/types'

defineProps<{ node: ClusterNode | null }>()
const emit = defineEmits<{ close: [] }>()

function formatMemory(bytes: number): string {
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(2)} KB`
}

function statusColor(status: string): string {
  if (status === 'online') return 'text-emerald-400'
  if (status === 'offline') return 'text-alert'
  return 'text-yellow-400'
}
</script>

<template>
  <Transition name="slide">
    <div v-if="node" class="fixed right-0 top-0 h-full w-80 bg-bg-secondary/95 backdrop-blur-xl border-l border-primary/15 z-50 overflow-y-auto"
      style="box-shadow: -4px 0 30px rgba(0,212,170,0.08);">
      <div class="p-5">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-sm font-mono font-bold text-primary uppercase tracking-wider">Node Detail</h3>
          <button @click="emit('close')" class="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-4">
          <div class="glass-card p-4">
            <div class="flex items-center gap-3 mb-3">
              <Server class="w-5 h-5 text-primary" />
              <span class="font-mono text-sm text-primary/90">{{ node.addr }}</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full" :class="node.status === 'online' ? 'bg-emerald-400' : node.status === 'offline' ? 'bg-alert' : 'bg-yellow-400'"></div>
              <span class="text-xs uppercase tracking-wider" :class="statusColor(node.status)">{{ node.status }}</span>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Node ID</span>
              <span class="text-xs font-mono text-gray-400 truncate ml-3" title="node.nodeId">{{ node.nodeId }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Role</span>
              <span class="text-xs font-mono" :class="node.role === 'master' ? 'text-primary' : 'text-info'">
                {{ node.role.toUpperCase() }}
              </span>
            </div>
            <div v-if="node.slots" class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Slots</span>
              <span class="text-xs font-mono text-gray-300">{{ node.slots }}</span>
            </div>
            <div v-if="node.masterId" class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Master ID</span>
              <span class="text-xs font-mono text-gray-300 truncate ml-3">{{ node.masterId }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Memory</span>
              <span class="text-xs font-mono text-gray-300">{{ formatMemory(node.memory) }}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-white/5">
              <span class="text-xs text-gray-500">Clients</span>
              <span class="text-xs font-mono text-gray-300">{{ node.connectedClients }}</span>
            </div>
            <div class="flex justify-between items-center py-2">
              <span class="text-xs text-gray-500">Latency</span>
              <span class="text-xs font-mono" :class="node.latencyMs > 10 ? 'text-yellow-400' : 'text-emerald-400'">
                {{ node.latencyMs }}ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
