import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  CircularProgress,
  Alert,
  AlertTitle,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  PlayArrow as AnalyzeIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  AddCircle as AddIndexIcon,
} from '@mui/icons-material';
import apiService from '../services/api';
import RiskScore from '../components/RiskScore';
import SQLViewer from '../components/SQLViewer';
import DDLConfirmDialog from '../components/DDLConfirmDialog';

const EXAMPLE_SQLS = [
  "SELECT * FROM users WHERE username = 'admin' OR '1'='1'",
  "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC",
  "SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE o.amount > 1000",
  "SELECT * FROM products WHERE name LIKE '%phone%'",
  "UPDATE users SET last_login = NOW() WHERE 1=1",
];

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

export default function Analyzer() {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ddlDialog, setDdlDialog] = useState({ open: false, ddl: '', originalSql: '' });

  const handleAnalyze = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiService.analyzeSQL(sql);
      setResult(data);
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('请求超时，AI 分析耗时过长。后端将自动降级到规则分析，请稍后查看报告列表。');
      } else if (err.response?.status === 400) {
        setError('请求被拒绝：SQL 内容可能超出模型上下文窗口限制，请尝试缩短 SQL 语句。');
      } else {
        setError(err.response?.data?.detail || '分析失败，请检查后端服务和 Ollama 是否运行');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (exampleSql) => {
    setSql(exampleSql);
  };

  const handleCreateIndex = (suggestion) => {
    const ddl = extractDDLFromSuggestion(suggestion);
    if (ddl) {
      setDdlDialog({
        open: true,
        ddl,
        originalSql: sql,
      });
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

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        SQL 分析器
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        输入 SQL 语句，AI 将分析注入风险、索引缺失和性能问题，并提供优化建议
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            multiline
            rows={6}
            placeholder="输入 SQL 语句，例如: SELECT * FROM users WHERE id = 1"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'monospace',
                fontSize: '0.95rem',
              },
            }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: '24px' }}>
                示例:
              </Typography>
              {EXAMPLE_SQLS.map((example, index) => (
                <Chip
                  key={index}
                  label={`示例 ${index + 1}`}
                  size="small"
                  variant="outlined"
                  onClick={() => handleExampleClick(example)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AnalyzeIcon />}
              onClick={handleAnalyze}
              disabled={loading || !sql.trim()}
            >
              {loading ? 'AI 分析中，请耐心等待...' : '开始分析'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>分析失败</AlertTitle>
          {error}
        </Alert>
      )}

      {result && (
        <Box>
          {result.summary && result.summary.includes('规则分析') && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle>已降级到规则分析</AlertTitle>
              AI 分析不可用或超时，当前结果由基础规则引擎生成，可能不如 AI 分析全面。
            </Alert>
          )}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">分析结果</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    label={`注入风险: ${result.injection_risk.toUpperCase()}`}
                    color={getRiskColor(result.injection_risk)}
                  />
                  <Chip
                    label={result.index_missing ? '缺少索引' : '索引正常'}
                    color={result.index_missing ? 'warning' : 'success'}
                    variant="outlined"
                  />
                </Box>
              </Box>
              <RiskScore score={result.risk_score} />
              <Box sx={{ mt: 2 }}>
                <Typography variant="body1" color="text.secondary">{result.summary}</Typography>
              </Box>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SecurityIcon color={result.injection_risk === 'none' ? 'success' : 'error'} />
                    <Typography>注入风险分析</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Alert
                    severity={result.injection_risk === 'none' ? 'success' : result.injection_risk === 'low' ? 'info' : result.injection_risk === 'medium' ? 'warning' : 'error'}
                    sx={{ mb: 2 }}
                  >
                    {result.injection_description}
                  </Alert>
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12} md={6}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SpeedIcon color={result.index_missing ? 'warning' : 'success'} />
                    <Typography>索引分析</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {result.index_suggestions.length > 0 ? (
                    <List dense>
                      {result.index_suggestions.map((s, i) => {
                        const ddl = extractDDLFromSuggestion(s);
                        return (
                          <ListItem
                            key={i}
                            secondaryAction={
                              ddl && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="primary"
                                  startIcon={<AddIndexIcon />}
                                  onClick={() => handleCreateIndex(s)}
                                >
                                  创建索引
                                </Button>
                              )
                            }
                          >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <LightbulbIcon fontSize="small" color="warning" />
                            </ListItemIcon>
                            <ListItemText primary={s} />
                          </ListItem>
                        );
                      })}
                    </List>
                  ) : (
                    <Typography color="text.secondary">索引状态正常</Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon color={result.performance_issues.length > 0 ? 'warning' : 'success'} />
                    <Typography>性能问题 ({result.performance_issues.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {result.performance_issues.length > 0 ? (
                    <List>
                      {result.performance_issues.map((issue, i) => (
                        <ListItem key={i}>
                          <ListItemIcon>
                            <WarningIcon color="warning" />
                          </ListItemIcon>
                          <ListItemText primary={issue} />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary">未发现性能问题</Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircleIcon color="primary" />
                    <Typography>优化建议 ({result.optimization_suggestions.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {result.optimization_suggestions.length > 0 ? (
                    <List>
                      {result.optimization_suggestions.map((s, i) => (
                        <ListItem key={i}>
                          <ListItemIcon>
                            <CheckCircleIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText primary={s} />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary">无优化建议</Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            </Grid>

            {result.optimized_sql && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>优化后的 SQL</Typography>
                    <SQLViewer sql={result.optimized_sql} maxHeight={200} />
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      <DDLConfirmDialog
        open={ddlDialog.open}
        onClose={() => setDdlDialog({ ...ddlDialog, open: false })}
        ddlStatement={ddlDialog.ddl}
        originalSql={ddlDialog.originalSql}
      />
    </Box>
  );
}
