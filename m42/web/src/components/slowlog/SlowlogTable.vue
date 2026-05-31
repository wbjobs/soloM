<script setup lang="ts">
import { computed } from 'vue'
import type { SlowlogEntry } from '@/types'

const props = defineProps<{
  entries: SlowlogEntry[]
  total: number
  page: number
  pageSize: number
}>()

const emit = defineEmits<{
  'update:page': [page: number]
}>()

function formatDuration(us: number): string {
  return us > 1000000 ? `${(us / 1000).toFixed(1)}ms` : `${us}μs`
}

function durationStyle(us: number): string {
  if (us > 1000000) return 'text-alert bg-alert/10'
  if (us > 500000) return 'text-orange-400 bg-orange-400/10'
  if (us > 100000) return 'text-yellow-400 bg-yellow-400/10'
  return 'text-emerald-400 bg-emerald-400/10'
}

const totalPages = computed(() => Math.ceil(props.total / props.pageSize))

const pages = computed(() => {
  const p: number[] = []
  const start = Math.max(1, props.page - 2)
  const end = Math.min(totalPages.value, props.page + 2)
  for (let i = start; i <= end; i++) p.push(i)
  return p
})
</script>

<template>
  <div class="glass-card animate-fade-in overflow-hidden">
    <div class="overflow-x-auto">
      <table class="dark-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Duration</th>
            <th>Node</th>
            <th>Time</th>
            <th>Args</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td class="font-mono text-xs text-primary/90 max-w-[200px] truncate">{{ entry.command }}</td>
            <td>
              <span class="font-mono text-xs px-2 py-0.5 rounded-md" :class="durationStyle(entry.durationUs)">
                {{ formatDuration(entry.durationUs) }}
              </span>
            </td>
            <td class="text-xs text-gray-500 font-mono">{{ entry.nodeAddr }}</td>
            <td class="text-xs text-gray-500">{{ entry.timestamp }}</td>
            <td class="text-xs text-gray-600 max-w-[200px] truncate">{{ entry.args || '-' }}</td>
          </tr>
          <tr v-if="entries.length === 0">
            <td colspan="5" class="text-center text-gray-600 py-8">No slowlog entries found</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-primary/10">
      <span class="text-xs text-gray-500 font-mono">Total: {{ total }}</span>
      <div class="flex items-center gap-1">
        <button v-for="p in pages" :key="p" @click="emit('update:page', p)"
          class="w-8 h-8 rounded-md text-xs font-mono transition-colors"
          :class="p === page ? 'bg-primary/20 text-primary border border-primary/30' : 'text-gray-500 hover:bg-white/5'">
          {{ p }}
        </button>
      </div>
    </div>
  </div>
</template>
