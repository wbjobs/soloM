import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  AlertTitle,
  Divider,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  Speed as SpeedIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import apiService from '../services/api';
import SQLViewer from './SQLViewer';

export default function DDLConfirmDialog({ open, onClose, ddlStatement, originalSql, database = '' }) {
  const [compareResult, setCompareResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCompare = async () => {
    if (!originalSql) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.explainCompare(originalSql, ddlStatement, database);
      setCompareResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'EXPLAIN 对比失败，请检查数据库连接');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const data = await apiService.executeDDL(ddlStatement, database, originalSql);
      setExecuteResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'DDL 执行失败');
    } finally {
      setExecuting(false);
    }
  };

  const handleClose = () => {
    setCompareResult(null);
    setExecuteResult(null);
    setError(null);
    onClose();
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#4caf50';
    if (score >= 50) return '#ff9800';
    return '#f44336';
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>确认执行 DDL 语句</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>注意</AlertTitle>
          此操作将直接在数据库上执行 DDL 语句，请确认已做好备份。
        </Alert>

        <Typography variant="subtitle2" gutterBottom>待执行的 DDL 语句：</Typography>
        <SQLViewer sql={ddlStatement} maxHeight={120} />

        {originalSql && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>关联的原始 SQL：</Typography>
            <SQLViewer sql={originalSql} maxHeight={100} />
          </Box>
        )}

        {originalSql && !compareResult && !executeResult && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={18} /> : <SpeedIcon />}
              onClick={handleCompare}
              disabled={loading}
              sx={{ mb: 1 }}
            >
              {loading ? '对比中...' : '预估性能提升（EXPLAIN 对比）'}
            </Button>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {compareResult && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SpeedIcon color="primary" /> 性能对比预估
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 120 }}>
                <Typography variant="caption" color="text.secondary">优化前评分</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h5" sx={{ color: getScoreColor(compareResult.before.performance_score) }}>
                    {compareResult.before.performance_score}
                  </Typography>
                  <ArrowForwardIcon fontSize="small" />
                  <Typography variant="h5" sx={{ color: getScoreColor(compareResult.after.performance_score) }}>
                    {compareResult.after.performance_score}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={compareResult.after.performance_score}
                  sx={{
                    mt: 0.5,
                    height: 6,
                    borderRadius: 3,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoreColor(compareResult.after.performance_score),
                    },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 120 }}>
                <Typography variant="caption" color="text.secondary">预估扫描行数</Typography>
                <Typography variant="body1">
                  {compareResult.before.estimated_rows.toLocaleString()}
                  <ArrowForwardIcon fontSize="small" sx={{ mx: 0.5, verticalAlign: 'middle' }} />
                  {compareResult.after.estimated_rows.toLocaleString()}
                </Typography>
                {compareResult.rows_improvement > 0 && (
                  <Chip
                    label={`减少 ${compareResult.rows_improvement.toLocaleString()} 行`}
                    color="success"
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                )}
              </Box>
            </Box>

            <Alert
              severity={compareResult.score_improvement > 0 ? 'success' : 'info'}
              sx={{ mb: 2 }}
            >
              {compareResult.improvement_summary}
            </Alert>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>指标</TableCell>
                    <TableCell align="center">优化前</TableCell>
                    <TableCell align="center">优化后</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>全表扫描</TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.before.full_table_scan ? '是' : '否'}
                        color={compareResult.before.full_table_scan ? 'error' : 'success'} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.after.full_table_scan ? '是' : '否'}
                        color={compareResult.after.full_table_scan ? 'error' : 'success'} size="small" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>文件排序</TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.before.using_filesort ? '是' : '否'}
                        color={compareResult.before.using_filesort ? 'warning' : 'success'} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.after.using_filesort ? '是' : '否'}
                        color={compareResult.after.using_filesort ? 'warning' : 'success'} size="small" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>临时表</TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.before.using_temporary ? '是' : '否'}
                        color={compareResult.before.using_temporary ? 'warning' : 'success'} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.after.using_temporary ? '是' : '否'}
                        color={compareResult.after.using_temporary ? 'warning' : 'success'} size="small" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>覆盖索引</TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.before.using_index ? '是' : '否'}
                        color={compareResult.before.using_index ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={compareResult.after.using_index ? '是' : '否'}
                        color={compareResult.after.using_index ? 'success' : 'default'} size="small" />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {executeResult && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success">
              <AlertTitle>DDL 执行成功</AlertTitle>
              语句已执行，操作已记录到审计日志。
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              审计日志 ID: {executeResult.id}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!executeResult ? (
          <>
            <Button onClick={handleClose}>取消</Button>
            <Button
              variant="contained"
              color="warning"
              startIcon={executing ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
              onClick={handleExecute}
              disabled={executing}
            >
              {executing ? '执行中...' : '确认执行'}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} variant="contained">完成</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
