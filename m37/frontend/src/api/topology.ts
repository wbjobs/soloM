import type { 
  TopologyRequest, 
  TopologyResponse, 
  AlgorithmInfo, 
  DeviceTypeInfo, 
  TopologyData,
  RouteRequest,
  RouteResponse
} from '../types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{ status: string; service: string; version: string }> {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}

export async function fetchAlgorithms(): Promise<AlgorithmInfo[]> {
  const response = await fetch(`${API_BASE}/algorithms`);
  const data = await response.json();
  return data.algorithms;
}

export async function fetchDeviceTypes(): Promise<DeviceTypeInfo[]> {
  const response = await fetch(`${API_BASE}/device-types`);
  const data = await response.json();
  return data.device_types;
}

export async function generateTopology(request: TopologyRequest): Promise<TopologyResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function fetchSampleData(type?: 'small' | 'medium' | 'large'): Promise<TopologyData> {
  const url = type ? `${API_BASE}/sample?type=${type}` : `${API_BASE}/sample`;
  const response = await fetch(url);
  return response.json();
}

export async function computeRoute(request: RouteRequest): Promise<RouteResponse> {
  const response = await fetch(`${API_BASE}/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  return response.json();
}
