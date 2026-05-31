import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const apiService = {
  getHealth: () => api.get('/health').then(res => res.data),
  getListenerStatus: () => api.get('/listener/status').then(res => res.data),
  startSlowQueryListener: () => api.post('/listener/slow-query/start').then(res => res.data),
  stopSlowQueryListener: () => api.post('/listener/slow-query/stop').then(res => res.data),
  startBinlogListener: () => api.post('/listener/binlog/start').then(res => res.data),
  stopBinlogListener: () => api.post('/listener/binlog/stop').then(res => res.data),
  analyzeSQL: (sql) => api.post('/analyze', { sql }, { timeout: 120000 }).then(res => res.data),
  getReports: (limit = 50, offset = 0) =>
    api.get(`/reports?limit=${limit}&offset=${offset}`).then(res => res.data),
  getReport: (id) => api.get(`/reports/${id}`).then(res => res.data),
  deleteReport: (id) => api.delete(`/reports/${id}`).then(res => res.data),
  getStats: () => api.get('/stats').then(res => res.data),
  explainSQL: (sql, database = '') => api.post('/explain', { sql, database }, { timeout: 30000 }).then(res => res.data),
  explainCompare: (sql, ddlStatement, database = '') =>
    api.post('/explain-compare', { sql, ddl_statement: ddlStatement, database }, { timeout: 60000 }).then(res => res.data),
  executeDDL: (ddlStatement, database = '', originalSql = '') =>
    api.post('/execute-ddl', { ddl_statement: ddlStatement, database, original_sql: originalSql }).then(res => res.data),
  getAuditLogs: (limit = 50, offset = 0) =>
    api.get(`/audit-logs?limit=${limit}&offset=${offset}`).then(res => res.data),
};

export const createWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  return new WebSocket(wsUrl);
};

export default apiService;
