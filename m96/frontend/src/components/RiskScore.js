import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';

export default function RiskScore({ score, size = 'normal' }) {
  const getColor = (score) => {
    if (score >= 70) return '#f44336';
    if (score >= 40) return '#ff9800';
    return '#4caf50';
  };

  const getLabel = (score) => {
    if (score >= 70) return '高风险';
    if (score >= 40) return '中风险';
    if (score > 0) return '低风险';
    return '安全';
  };

  const height = size === 'small' ? 8 : 12;
  const fontSize = size === 'small' ? 'caption' : 'body2';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant={fontSize} color="text.secondary">
          风险评分
        </Typography>
        <Typography variant={fontSize} sx={{ color: getColor(score), fontWeight: 'bold' }}>
          {getLabel(score)} ({score}/100)
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          height,
          borderRadius: height / 2,
          backgroundColor: 'rgba(255,255,255,0.1)',
          '& .MuiLinearProgress-bar': {
            backgroundColor: getColor(score),
          },
        }}
      />
    </Box>
  );
}
