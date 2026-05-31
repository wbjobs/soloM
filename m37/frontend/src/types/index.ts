export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  ip?: string;
  model?: string;
  os?: string;
  description?: string;
  position?: Position;
  [key: string]: any;
}

export interface Connection {
  from: string;
  to: string;
  bandwidth?: number;
  type?: string;
  description?: string;
  [key: string]: any;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export type DeviceType = 
  | 'router' 
  | 'firewall' 
  | 'core_switch' 
  | 'switch' 
  | 'server' 
  | 'host' 
  | 'client' 
  | 'unknown';

export interface TopologyRequest {
  devices: Device[];
  connections: Connection[];
  algorithm?: 'force3d' | 'graphviz';
  options?: {
    layout_type?: string;
    iterations?: number;
    repulsion_strength?: number;
    attraction_strength?: number;
  };
}

export interface TopologyResponse {
  success: boolean;
  data: {
    algorithm: string;
    positions: Record<string, [number, number, number]>;
    devices: Device[];
    connections: Connection[];
  };
  error?: string;
  details?: string[];
}

export interface DeviceTypeInfo {
  type: DeviceType;
  name: string;
  color: string;
  priority: number;
}

export interface AlgorithmInfo {
  id: string;
  name: string;
  description: string;
  supported: boolean;
  subtypes?: string[];
}

export interface TopologyData {
  name?: string;
  description?: string;
  devices: Device[];
  connections: Connection[];
}

export interface RouteRequest {
  devices: Device[];
  connections: Connection[];
  source_ip: string;
  dest_ip: string;
}

export interface RouteResponse {
  success: boolean;
  data?: {
    success: boolean;
    path: string[];
    edges: [string, string, number][];
    total_hops: number;
    source_device: string;
    dest_device: string;
    path_devices: Device[];
  };
  error?: string;
  details?: string[];
}

export interface RouteEdge {
  from: string;
  to: string;
  edgeIndex: number;
}

export interface RouteResult {
  path: string[];
  edges: RouteEdge[];
  totalHops: number;
  sourceDevice: Device;
  destDevice: Device;
  pathDevices: Device[];
}
