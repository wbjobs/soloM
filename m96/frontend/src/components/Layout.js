import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Description as ReportsIcon,
  Code as AnalyzerIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  Cloud as CloudIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

const drawerWidth = 240;

const navItems = [
  { path: '/', label: '仪表盘', icon: DashboardIcon },
  { path: '/reports', label: '审计报告', icon: ReportsIcon },
  { path: '/analyzer', label: 'SQL 分析器', icon: AnalyzerIcon },
  { path: '/settings', label: '系统设置', icon: SettingsIcon },
];

export default function Layout({ children, health }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const getRiskColor = (score) => {
    if (score >= 70) return 'error';
    if (score >= 40) return 'warning';
    return 'success';
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageIcon color="primary" />
          SQL 审计助手
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>
                <item.icon />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {health && (
              <>
                <Tooltip title={health.mysql_connected ? 'MySQL 已连接' : 'MySQL 未连接'}>
                  <Chip
                    icon={<StorageIcon />}
                    label="MySQL"
                    color={health.mysql_connected ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                  />
                </Tooltip>
                <Tooltip title={health.ollama_connected ? 'Ollama 已连接' : 'Ollama 未连接'}>
                  <Chip
                    icon={<CloudIcon />}
                    label="Ollama"
                    color={health.ollama_connected ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                  />
                </Tooltip>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
