<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    </div>

    <nav class="sidebar-nav">
      <a
        v-for="item in navItems"
        :key="item.name"
        class="nav-item"
        :class="{ active: activeRoute === item.name }"
        @click="$emit('navigate', item.name)"
      >
        <span class="nav-icon" v-html="item.icon"></span>
        <span class="nav-label">{{ item.label }}</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <div class="connection-indicator">
        <span class="indicator-dot" :class="connected ? 'on' : 'off'"></span>
        <span class="indicator-text">{{ connected ? '在线' : '离线' }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  activeRoute: string
  connected: boolean
}>()

defineEmits<{
  navigate: [name: string]
}>()

const navItems = [
  {
    name: 'dashboard',
    label: '仪表盘',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
  },
  {
    name: 'topology',
    label: '拓扑图',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><line x1="7.5" y1="7.5" x2="10.5" y2="16"/><line x1="16.5" y1="7.5" x2="13.5" y2="16"/></svg>'
  },
  {
    name: 'heatmap',
    label: '热力图',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>'
  },
  {
    name: 'metrics',
    label: '指标面板',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  },
  {
    name: 'settings',
    label: '设置',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  }
]
</script>

<style scoped>
.sidebar {
  width: 64px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  flex-shrink: 0;
  transition: width 0.3s;
}

.sidebar-brand {
  color: var(--accent-red);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  width: 100%;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
  text-decoration: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(233, 69, 96, 0.12);
  color: var(--accent-red);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 10px;
  white-space: nowrap;
}

.sidebar-footer {
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  width: calc(100% - 16px);
}

.connection-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.3s;
}

.indicator-dot.on {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}

.indicator-dot.off {
  background: var(--accent-red);
  box-shadow: 0 0 6px var(--accent-red);
}

.indicator-text {
  font-size: 10px;
  color: var(--text-secondary);
}
</style>
