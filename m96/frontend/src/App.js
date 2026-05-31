import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import Analyzer from './pages/Analyzer';
import Settings from './pages/Settings';
import apiService from './services/api';

function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await apiService.getHealth();
        setHealth(data);
      } catch (error) {
        console.error('Health check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Layout health={health}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/analyzer" element={<Analyzer />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;
