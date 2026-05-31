import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Divider,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Cloud as CloudIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import apiService from '../services/api';

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [listenerStatus, setListenerStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [healthData, statusData, statsData] = await Promise.all([
        apiService.getHealth(),
        apiService.getListenerStatus(),
        apiService.getStats(),
      ]);
      setHealth(healthData);
      setListenerStatus(statusData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action) => {
    setActionLoading((prev) => ({ ...prev, [action]: true }));
    try {
      switch (action) {
        case 'startSlowQuery':
          await apiService.startSlowQueryListener();
          break;
        case 'stopSlowQuery':
          await apiService.stopSlowQueryListener();
          break;
        case 'startBinlog':
          await apiService.startBinlogListener();
          break;
        case 'stopBinlog':
          await apiService.stopBinlogListener();
          break;
      }
      await loadData();
    } catch (error) {
      console.error(`Failed to execute ${action}:`, error);
    } finally {
      setActionLoading((prev) => ({ ...prev, [action]: false }));
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        系统设置
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <StorageIcon color="primary" />
                <Typography variant="h6">MySQL 连接</Typography>
                <Chip
                  icon={health?.mysql_connected ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={health?.mysql_connected ? '已连接' : '未连接'}
                  color={health?.mysql_connected ? 'success' : 'error'}
                  size="small"
                />
              </Box>

              <List dense>
                <ListItem>
                  <ListItemText primary="服务状态" secondary={health?.status || '未知'} />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemText primary="MySQL" secondary={health?.mysql_connected ? '连接正常' : '无法连接'} />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemText primary="Ollama LLM" secondary={health?.ollama_connected ? '连接正常' : '无法连接'} />
                </ListItem>
              </List>

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadData}
                sx={{ mt: 2 }}
                fullWidth
              >
                刷新状态
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <CloudIcon color="primary" />
                <Typography variant="h6">Ollama LLM</Typography>
                <Chip
                  icon={health?.ollama_connected ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={health?.ollama_connected ? '已连接' : '未连接'}
                  color={health?.ollama_connected ? 'success' : 'error'}
                  size="small"
                />
              </Box>

              {!health?.ollama_connected && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <AlertTitle>Ollama 未连接</AlertTitle>
                  请确保 Ollama 服务正在运行，且已下载 Llama3 模型。
                  <br />
                  启动命令: <code>ollama serve</code>
                  <br />
                  下载模型: <code>ollama pull llama3</code>
                </Alert>
              )}

              {health?.ollama_connected && (
                <Alert severity="success">
                  <AlertTitle>LLM 服务正常</AlertTitle>
                  AI 分析功能可用，SQL 审计和优化建议将通过本地部署的 LLM 执行。
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>慢查询日志监听器</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip
                  label={listenerStatus?.slow_query ? '运行中' : '已停止'}
                  color={listenerStatus?.slow_query ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayIcon />}
                  onClick={() => handleAction('startSlowQuery')}
                  disabled={listenerStatus?.slow_query || actionLoading.startSlowQuery}
                  fullWidth
                >
                  {actionLoading.startSlowQuery ? '启动中...' : '启动'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={() => handleAction('stopSlowQuery')}
                  disabled={!listenerStatus?.slow_query || actionLoading.stopSlowQuery}
                  fullWidth
                >
                  {actionLoading.stopSlowQuery ? '停止中...' : '停止'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Binlog 监听器</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip
                  label={listenerStatus?.binlog ? '运行中' : '已停止'}
                  color={listenerStatus?.binlog ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayIcon />}
                  onClick={() => handleAction('startBinlog')}
                  disabled={listenerStatus?.binlog || actionLoading.startBinlog}
                  fullWidth
                >
                  {actionLoading.startBinlog ? '启动中...' : '启动'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={() => handleAction('stopBinlog')}
                  disabled={!listenerStatus?.binlog || actionLoading.stopBinlog}
                  fullWidth
                >
                  {actionLoading.stopBinlog ? '停止中...' : '停止'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>审计统计概览</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant="h3" color="primary">{stats?.total_reports || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">总报告数</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant="h3" color="error.main">{stats?.high_risk_count || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">高风险</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant="h3" color="warning.main">{stats?.medium_risk_count || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">中风险</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant="h3" color="info.main">{stats?.index_missing_count || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">缺少索引</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
