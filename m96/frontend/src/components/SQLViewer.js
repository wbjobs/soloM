import React, { useEffect } from 'react';
import { Box, Paper } from '@mui/material';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';

export default function SQLViewer({ sql, maxHeight }) {
  useEffect(() => {
    Prism.highlightAll();
  }, [sql]);

  return (
    <Paper
      variant="outlined"
      sx={{
        backgroundColor: '#2d2d2d',
        maxHeight: maxHeight || 300,
        overflow: 'auto',
        '& pre': {
          margin: 0,
          padding: 2,
          fontSize: '0.875rem',
        },
      }}
    >
      <pre>
        <code className="language-sql">{sql}</code>
      </pre>
    </Paper>
  );
}
