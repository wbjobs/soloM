import type { DeviceType } from '../types';

export const DEVICE_COLORS: Record<DeviceType, number> = {
  router: 0x4CAF50,
  firewall: 0xF44336,
  core_switch: 0x9C27B0,
  switch: 0x2196F3,
  server: 0xFF9800,
  host: 0x607D8B,
  client: 0x795548,
  unknown: 0x9E9E9E,
};

export const DEVICE_SIZES: Record<DeviceType, number> = {
  router: 0.8,
  firewall: 0.75,
  core_switch: 0.7,
  switch: 0.6,
  server: 0.55,
  host: 0.45,
  client: 0.4,
  unknown: 0.5,
};

export const DEVICE_SHAPES: Record<DeviceType, 'box' | 'sphere' | 'cylinder' | 'cone'> = {
  router: 'box',
  firewall: 'box',
  core_switch: 'cylinder',
  switch: 'cylinder',
  server: 'box',
  host: 'sphere',
  client: 'sphere',
  unknown: 'sphere',
};

export const DEVICE_LABELS: Record<DeviceType, string> = {
  router: '路由器',
  firewall: '防火墙',
  core_switch: '核心交换机',
  switch: '交换机',
  server: '服务器',
  host: '主机',
  client: '客户端',
  unknown: '未知设备',
};

export const CONNECTION_COLORS: Record<string, number> = {
  fiber: 0x00ff88,
  ethernet: 0x3b82f6,
  wireless: 0xffd700,
  default: 0x888888,
};
