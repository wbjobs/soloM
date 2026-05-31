<script setup lang="ts">
import Sidebar from './Sidebar.vue'
</script>

<template>
  <div class="flex min-h-screen">
    <Sidebar />
    <main class="flex-1 overflow-auto p-6">
      <router-view />
    </main>
  </div>
</template>
