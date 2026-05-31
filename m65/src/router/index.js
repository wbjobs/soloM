import { createRouter, createWebHashHistory } from 'vue-router'
import Discovery from '../views/Discovery.vue'
import Transfers from '../views/Transfers.vue'

const routes = [
  {
    path: '/',
    redirect: '/discovery'
  },
  {
    path: '/discovery',
    name: 'Discovery',
    component: Discovery
  },
  {
    path: '/transfers',
    name: 'Transfers',
    component: Transfers
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
