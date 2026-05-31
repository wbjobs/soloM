import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Chip,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Grid,
  Divider,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import apiService from '../services/api';
import RiskScore from '../components/RiskScore';

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    filterReports();
  }, [reports, searchTerm, riskFilter, typeFilter]);

  const loadReports = async () => {
    try {
      const data = await apiService.getReports(200);
      setReports(data);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterReports = () => {
    let filtered = [...reports];

    if (searchTerm) {
      filtered = filtered.filter(
        (r) =>
          r.sql_entry.sql.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.summary.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter((r) => r.injection_risk === riskFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((r) => r.sql_entry.type === typeFilter);
    }

    setFilteredReports(filtered);
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'success';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'slow_query': return 'warning';
      case 'binlog': return 'primary';
      case 'manual': return 'secondary';
      default: return 'default';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'slow_query': return '慢查询';
      case 'binlog': return 'Binlog';
      case 'manual': return '手动分析';
      default: return type;
    }
  };

  if (loading) {
    return <Typography>加载中...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        审计报告
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="搜索 SQL 或摘要..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>风险等级</InputLabel>
                <Select
                  value={riskFilter}
                  label="风险等级"
                  onChange={(e) => setRiskFilter(e.target.value)}
                >
                  <MenuItem value="all">全部</MenuItem>
                  <MenuItem value="high">高风险</MenuItem>
                  <MenuItem value="medium">中风险</MenuItem>
                  <MenuItem value="low">低风险</MenuItem>
                  <MenuItem value="none">安全</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>来源类型</InputLabel>
                <Select
                  value={typeFilter}
                  label="来源类型"
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <MenuItem value="all">全部</MenuItem>
                  <MenuItem value="slow_query">慢查询</MenuItem>
                  <MenuItem value="binlog">Binlog</MenuItem>
                  <MenuItem value="manual">手动分析</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              共 {filteredReports.length} 条报告
            </Typography>
          </Box>

          {filteredReports.length > 0 ? (
            <List>
              {filteredReports.map((report, index) => (
                <React.Fragment key={report.id}>
                  {index > 0 && <Divider />}
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => navigate(`/reports/${report.id}`)}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Chip
                              label={report.injection_risk.toUpperCase()}
                              color={getRiskColor(report.injection_risk)}
                              size="small"
                            />
                            <Chip
                              label={getTypeLabel(report.sql_entry.type)}
                              color={getTypeColor(report.sql_entry.type)}
                              size="small"
                              variant="outlined"
                            />
                            <Typography variant="body2" color="text.secondary">
                              {formatDistanceToNow(new Date(report.timestamp), {
                                addSuffix: true,
                                locale: zhCN,
                              })}
                            </Typography>
                            {report.sql_entry.database && (
                              <Chip
                                label={report.sql_entry.database}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace' }}>
                              {report.sql_entry.sql.length > 120
                                ? `${report.sql_entry.sql.substring(0, 120)}...`
                                : report.sql_entry.sql}
                            </Typography>
                            <RiskScore score={report.risk_score} size="small" />
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">没有匹配的审计报告</Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
