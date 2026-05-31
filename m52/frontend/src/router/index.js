import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import DeviceList from '../views/DeviceList.vue'
import DeviceDetail from '../views/DeviceDetail.vue'
import AnomalyDetection from '../views/AnomalyDetection.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/devices',
    name: 'DeviceList',
    component: DeviceList
  },
  {
    path: '/device/:id',
    name: 'DeviceDetail',
    component: DeviceDetail
  },
  {
    path: '/anomaly',
    name: 'AnomalyDetection',
    component: AnomalyDetection
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
