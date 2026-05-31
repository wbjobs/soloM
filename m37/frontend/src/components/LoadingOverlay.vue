<script setup lang="ts">
defineProps<{
  message?: string;
}>();
</script>

<template>
  <div class="loading-overlay">
    <div class="loading-content">
      <div class="loading-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-ring spinner-ring-2"></div>
        <div class="spinner-ring spinner-ring-3"></div>
      </div>
      <div v-if="message" class="loading-text">{{ message }}</div>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 23, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.loading-spinner {
  width: 80px;
  height: 80px;
  position: relative;
}

.spinner-ring {
  position: absolute;
  border: 4px solid transparent;
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}

.spinner-ring:nth-child(1) {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.spinner-ring-2 {
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border-top-color: var(--accent-success);
  animation-duration: 1.5s;
  animation-direction: reverse;
}

.spinner-ring-3 {
  top: 16px;
  left: 16px;
  right: 16px;
  bottom: 16px;
  border-top-color: var(--accent-warning);
  animation-duration: 1.8s;
}

.loading-text {
  font-size: 16px;
  color: var(--text-secondary);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
</style>
