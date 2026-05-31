import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  Description as DescriptionIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import apiService from '../services/api';
import RiskScore from '../components/RiskScore';

const COLORS = ['#f44336', '#ff9800', '#4caf50', '#2196f3'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [listenerStatus, setListenerStatus] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsData, statusData, reportsData] = await Promise.all([
        apiService.getStats(),
        apiService.getListenerStatus(),
        apiService.getReports(10),
      ]);
      setStats(statsData);
      setListenerStatus(statusData);
      setRecentReports(reportsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSlowQuery = async () => {
    try {
      if (listenerStatus?.slow_query) {
        await apiService.stopSlowQueryListener();
      } else {
        await apiService.startSlowQueryListener();
      }
      loadData();
    } catch (error) {
      console.error('Failed to toggle slow query listener:', error);
    }
  };

  const handleToggleBinlog = async () => {
    try {
      if (listenerStatus?.binlog) {
        await apiService.stopBinlogListener();
      } else {
        await apiService.startBinlogListener();
      }
      loadData();
    } catch (error) {
      console.error('Failed to toggle binlog listener:', error);
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'success';
    }
  };

  const pieData = stats
    ? [
        { name: '高风险', value: stats.high_risk_count },
        { name: '中风险', value: stats.medium_risk_count },
        { name: '低风险', value: stats.low_risk_count },
        { name: '安全', value: stats.total_reports - stats.high_risk_count - stats.medium_risk_count - stats.low_risk_count },
      ].filter((d) => d.value > 0)
    : [];

  if (loading) {
    return <Typography>加载中...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        仪表盘
      </Typography>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <DescriptionIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4">{stats?.total_reports || 0}</Typography>
                  <Typography color="text.secondary">总审计报告</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <WarningIcon color="error" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4">{stats?.high_risk_count || 0}</Typography>
                  <Typography color="text.secondary">高风险 SQL</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SecurityIcon color="warning" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4">{stats?.index_missing_count || 0}</Typography>
                  <Typography color="text.secondary">缺少索引</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SpeedIcon color="success" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4">{stats?.avg_risk_score || 0}</Typography>
                  <Typography color="text.secondary">平均风险评分</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                风险分布
              </Typography>
              <Box sx={{ height: 200 }}>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Box
                    sx={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography color="text.secondary">暂无数据</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">监听器状态</Typography>
                <Chip
                  label={listenerStatus?.status || '未知'}
                  color={listenerStatus?.slow_query || listenerStatus?.binlog ? 'success' : 'default'}
                  size="small"
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="subtitle2">慢查询日志</Typography>
                          <Typography variant="body2" color="text.secondary">
                            状态: {listenerStatus?.slow_query ? '运行中' : '已停止'}
                          </Typography>
                        </Box>
                        <Button
                          variant="contained"
                          size="small"
                          color={listenerStatus?.slow_query ? 'error' : 'primary'}
                          startIcon={listenerStatus?.slow_query ? <StopIcon /> : <PlayIcon />}
                          onClick={handleToggleSlowQuery}
                        >
                          {listenerStatus?.slow_query ? '停止' : '启动'}
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="subtitle2">Binlog 监听</Typography>
                          <Typography variant="body2" color="text.secondary">
                            状态: {listenerStatus?.binlog ? '运行中' : '已停止'}
                          </Typography>
                        </Box>
                        <Button
                          variant="contained"
                          size="small"
                          color={listenerStatus?.binlog ? 'error' : 'primary'}
                          startIcon={listenerStatus?.binlog ? <StopIcon /> : <PlayIcon />}
                          onClick={handleToggleBinlog}
                        >
                          {listenerStatus?.binlog ? '停止' : '启动'}
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">最近审计报告</Typography>
              <Button size="small" onClick={() => navigate('/reports')}>
                查看全部
              </Button>
            </Box>

            <List>
              {recentReports.length > 0 ? (
                recentReports.map((report, index) => (
                  <React.Fragment key={report.id}>
                    {index > 0 && <Divider />}
                    <ListItem
                      alignItems="flex-start"
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/reports/${report.id}`)}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Chip
                              label={report.injection_risk.toUpperCase()}
                              color={getRiskColor(report.injection_risk)}
                              size="small"
                            />
                            <Typography variant="body2" color="text.secondary">
                              {formatDistanceToNow(new Date(report.timestamp), {
                                addSuffix: true,
                                locale: zhCN,
                              })}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              {report.sql_entry.sql.length > 100
                                ? `${report.sql_entry.sql.substring(0, 100)}...`
                                : report.sql_entry.sql}
                            </Typography>
                            <RiskScore score={report.risk_score} size="small" />
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">暂无审计报告</Typography>
                  <Button
                    variant="contained"
                    sx={{ mt: 2 }}
                    onClick={() => navigate('/analyzer')}
                  >
                    开始分析 SQL
                  </Button>
                </Box>
              )}
            </List>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
