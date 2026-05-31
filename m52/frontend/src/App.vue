<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <h1 class="app-title">
          <el-icon><Monitor /></el-icon>
          传感器数据平台
        </h1>
        <el-menu
          :default-active="activeMenu"
          mode="horizontal"
          router
          class="header-menu"
        >
          <el-menu-item index="/">
            <el-icon><Odometer /></el-icon>
            仪表盘
          </el-menu-item>
          <el-menu-item index="/devices">
            <el-icon><Cpu /></el-icon>
            设备管理
          </el-menu-item>
          <el-menu-item index="/anomaly">
            <el-icon><Warning /></el-icon>
            异常检测
          </el-menu-item>
        </el-menu>
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Monitor, Odometer, Cpu, Warning } from '@element-plus/icons-vue'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
}

.app-container {
  height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 24px;
}

.app-title {
  color: white;
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.header-menu {
  background: transparent;
  border: none;
}

.header-menu .el-menu-item {
  color: rgba(255, 255, 255, 0.9);
  border-bottom: 2px solid transparent;
}

.header-menu .el-menu-item:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.header-menu .el-menu-item.is-active {
  color: white;
  border-bottom-color: #ffd700;
}

.app-main {
  background: #f5f7fa;
  padding: 24px;
}
</style>
