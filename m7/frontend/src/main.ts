import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import Dashboard from './components/Dashboard.vue'
import TopologyGraph from './components/TopologyGraph.vue'
import LatencyHeatmap from './components/LatencyHeatmap.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import './styles/main.css'

const routes = [
  { path: '/', component: Dashboard, name: 'dashboard' },
  { path: '/topology', component: TopologyGraph, name: 'topology' },
  { path: '/heatmap', component: LatencyHeatmap, name: 'heatmap' },
  { path: '/metrics', component: MetricsPanel, name: 'metrics' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
