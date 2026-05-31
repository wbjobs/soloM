import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import DashboardPage from '@/pages/DashboardPage.vue'
import TopologyPage from '@/pages/TopologyPage.vue'
import SlowlogPage from '@/pages/SlowlogPage.vue'

const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'dashboard', component: DashboardPage },
      { path: 'topology', name: 'topology', component: TopologyPage },
      { path: 'slowlog', name: 'slowlog', component: SlowlogPage },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
