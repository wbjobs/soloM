import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Grid,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  AlertTitle,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Warning as WarningIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Lightbulb as LightbulbIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  AddCircle as AddIndexIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import apiService from '../services/api';
import RiskScore from '../components/RiskScore';
import SQLViewer from '../components/SQLViewer';
import DDLConfirmDialog from '../components/DDLConfirmDialog';

function extractDDLFromSuggestion(suggestion) {
  const ddlMatch = suggestion.match(/(CREATE\s+INDEX\s+.*?(?:;|$)|ALTER\s+TABLE\s+.*?ADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+.*?(?:;|$))/is);
  if (ddlMatch) return ddlMatch[1].trim().replace(/;?\s*$/, '');

  const colMatch = suggestion.match(/(?:列|column|字段)\s+[`"]?(\w+)[`"]?/i)
    || suggestion.match(/为\s*[`"]?(\w+)[`"]?/);
  const tableMatch = suggestion.match(/(?:表|table)\s+[`"]?(\w+)[`"]?/i);

  if (colMatch && tableMatch) {
    const col = colMatch[1];
    const table = tableMatch[1];
    return `CREATE INDEX idx_${table}_${col} ON \`${table}\` (\`${col}\`)`;
  }
  return null;
}

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ddlDialog, setDdlDialog] = useState({ open: false, ddl: '', originalSql: '' });

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      const data = await apiService.getReport(id);
      setReport(data);
    } catch (err) {
      setError('报告不存在或加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('确定要删除此报告吗？')) {
      try {
        await apiService.deleteReport(id);
        navigate('/reports');
      } catch (err) {
        console.error('Failed to delete report:', err);
      }
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'success';
    }
  };

  const getRiskIcon = (risk) => {
    switch (risk) {
      case 'high': return <ErrorIcon />;
      case 'medium': return <WarningIcon />;
      case 'low': return <InfoIcon />;
      default: return <CheckCircleIcon />;
    }
  };

  if (loading) return <Typography>加载中...</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!report) return <Typography>报告未找到</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Tooltip title="返回报告列表">
          <IconButton onClick={() => navigate('/reports')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          审计报告详情
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleDelete}
        >
          删除
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">基本信息</Typography>
                <Chip
                  icon={getRiskIcon(report.injection_risk)}
                  label={`注入风险: ${report.injection_risk.toUpperCase()}`}
                  color={getRiskColor(report.injection_risk)}
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">时间</Typography>
                  <Typography variant="body1">
                    {format(new Date(report.timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">来源</Typography>
                  <Typography variant="body1">{report.sql_entry.type}</Typography>
                </Grid>
                {report.sql_entry.database && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">数据库</Typography>
                    <Typography variant="body1">{report.sql_entry.database}</Typography>
                  </Grid>
                )}
                {report.sql_entry.query_time > 0 && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">查询耗时</Typography>
                    <Typography variant="body1">{report.sql_entry.query_time}s</Typography>
                  </Grid>
                )}
                {report.sql_entry.rows_examined > 0 && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">扫描行数</Typography>
                    <Typography variant="body1">{report.sql_entry.rows_examined}</Typography>
                  </Grid>
                )}
              </Grid>

              <Box sx={{ mt: 3 }}>
                <RiskScore score={report.risk_score} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>原始 SQL</Typography>
              <SQLViewer sql={report.sql_entry.sql} maxHeight={200} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SecurityIcon color={report.injection_risk === 'none' ? 'success' : 'error'} />
                <Typography variant="h6">注入风险分析</Typography>
              </Box>
              <Alert severity={report.injection_risk === 'none' ? 'success' : report.injection_risk === 'low' ? 'info' : report.injection_risk === 'medium' ? 'warning' : 'error'}>
                <AlertTitle>
                  {report.injection_risk === 'none' ? '安全' : report.injection_risk === 'low' ? '低风险' : report.injection_risk === 'medium' ? '中风险' : '高风险'}
                </AlertTitle>
                {report.injection_description}
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SpeedIcon color={report.index_missing ? 'warning' : 'success'} />
                <Typography variant="h6">索引分析</Typography>
                <Chip
                  label={report.index_missing ? '缺少索引' : '索引正常'}
                  color={report.index_missing ? 'warning' : 'success'}
                  size="small"
                />
              </Box>
              {report.index_suggestions.length > 0 ? (
                <List dense>
                  {report.index_suggestions.map((suggestion, index) => {
                    const ddl = extractDDLFromSuggestion(suggestion);
                    return (
                      <ListItem
                        key={index}
                        secondaryAction={
                          ddl && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<AddIndexIcon />}
                              onClick={() => setDdlDialog({
                                open: true,
                                ddl,
                                originalSql: report.sql_entry.sql,
                              })}
                            >
                              创建索引
                            </Button>
                          )
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <LightbulbIcon fontSize="small" color="warning" />
                        </ListItemIcon>
                        <ListItemText primary={suggestion} />
                      </ListItem>
                    );
                  })}
                </List>
              ) : (
                <Typography color="text.secondary">无索引建议</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <WarningIcon color={report.performance_issues.length > 0 ? 'warning' : 'success'} />
                <Typography variant="h6">性能问题</Typography>
                <Chip
                  label={`${report.performance_issues.length} 个问题`}
                  color={report.performance_issues.length > 0 ? 'warning' : 'success'}
                  size="small"
                />
              </Box>
              {report.performance_issues.length > 0 ? (
                <List dense>
                  {report.performance_issues.map((issue, index) => (
                    <ListItem key={index}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <WarningIcon fontSize="small" color="warning" />
                      </ListItemIcon>
                      <ListItemText primary={issue} />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">无性能问题</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LightbulbIcon color="primary" />
                <Typography variant="h6">优化建议</Typography>
              </Box>
              {report.optimization_suggestions.length > 0 ? (
                <List>
                  {report.optimization_suggestions.map((suggestion, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <CheckCircleIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText primary={suggestion} />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">无优化建议</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {report.optimized_sql && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>优化后的 SQL</Typography>
                <SQLViewer sql={report.optimized_sql} maxHeight={200} />
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>审计摘要</Typography>
              <Typography variant="body1">{report.summary}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <DDLConfirmDialog
        open={ddlDialog.open}
        onClose={() => setDdlDialog({ ...ddlDialog, open: false })}
        ddlStatement={ddlDialog.ddl}
        originalSql={ddlDialog.originalSql}
      />
    </Box>
  );
}
