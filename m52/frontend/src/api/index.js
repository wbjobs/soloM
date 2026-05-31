import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const deviceApi = {
  list: () => api.get('/devices'),
  get: (id) => api.get(`/devices/${id}`),
  create: (data) => api.post('/devices', data),
  update: (id, data) => api.put(`/devices/${id}`, data),
  delete: (id) => api.delete(`/devices/${id}`)
}

export const sensorApi = {
  getData: (deviceId, params = {}) => api.get(`/sensor/${deviceId}/data`, { params }),
  getLatest: (deviceId) => api.get(`/sensor/${deviceId}/latest`),
  getAggregated: (deviceId, params = {}) => api.get(`/sensor/${deviceId}/aggregated`, { params }),
  getSmart: (deviceId, params = {}) => api.get(`/sensor/${deviceId}/smart`, { params })
}

export const anomalyApi = {
  detect: (data) => api.post('/anomaly/detect', data),
  getRecords: (deviceId, params = {}) => api.get(`/anomaly/${deviceId}/records`, { params }),
  checkRealtime: (deviceId, params = {}) => api.get(`/anomaly/${deviceId}/realtime`, { params })
}

export default api
