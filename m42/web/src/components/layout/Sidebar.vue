<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LayoutDashboard, Network, Clock, Database, ChevronRight } from 'lucide-vue-next'

const route = useRoute()

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/topology', label: 'Topology', icon: Network },
  { path: '/slowlog', label: 'Slowlog', icon: Clock },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside class="w-56 min-h-screen flex flex-col border-r border-primary/15 bg-bg-secondary/90 backdrop-blur-md"
    style="box-shadow: 1px 0 20px rgba(0,212,170,0.06);">
    <div class="px-5 py-6 flex items-center gap-3 border-b border-primary/10">
      <div class="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center animate-pulse-glow">
        <Database class="w-5 h-5 text-primary" />
      </div>
      <div>
        <h1 class="text-sm font-bold text-primary font-mono tracking-wide glow-text">REDIS</h1>
        <p class="text-[10px] text-gray-500 tracking-widest">CLUSTER MONITOR</p>
      </div>
    </div>

    <nav class="flex-1 py-4 px-3 space-y-1">
      <router-link v-for="item in navItems" :key="item.path" :to="item.path"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group"
        :class="isActive(item.path)
          ? 'bg-primary/12 text-primary border border-primary/20'
          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'">
        <component :is="item.icon" class="w-4.5 h-4.5" :class="isActive(item.path) ? 'text-primary' : 'text-gray-500 group-hover:text-gray-300'" />
        <span class="flex-1">{{ item.label }}</span>
        <ChevronRight v-if="isActive(item.path)" class="w-3.5 h-3.5 text-primary/60" />
      </router-link>
    </nav>

    <div class="px-5 py-4 border-t border-primary/10">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-primary animate-pulse-glow"></div>
        <span class="text-xs text-gray-500">System Online</span>
      </div>
    </div>
  </aside>
</template>
