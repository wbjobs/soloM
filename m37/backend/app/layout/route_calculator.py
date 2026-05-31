from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from collections import defaultdict
import heapq
import ipaddress


class RouteCalculator:
    def __init__(self):
        self.device_ip_cache: Dict[str, str] = {}

    def find_device_by_ip(
        self,
        devices: List[Dict[str, Any]],
        ip: str
    ) -> Optional[str]:
        normalized_ip = self._normalize_ip(ip)
        if not normalized_ip:
            return None

        for device in devices:
            device_ip = device.get('ip')
            if not device_ip:
                continue

            if '/' in normalized_ip:
                try:
                    network = ipaddress.ip_network(normalized_ip, strict=False)
                    if ipaddress.ip_address(device_ip) in network:
                        return device['id']
                except ValueError:
                    continue
            else:
                if device_ip == normalized_ip:
                    return device['id']

        return None

    def compute_shortest_path(
        self,
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]],
        source_ip: str,
        dest_ip: str
    ) -> Dict[str, Any]:
        source_id = self.find_device_by_ip(devices, source_ip)
        dest_id = self.find_device_by_ip(devices, dest_ip)

        if not source_id:
            return {
                'success': False,
                'error': f'Source device with IP {source_ip} not found'
            }

        if not dest_id:
            return {
                'success': False,
                'error': f'Destination device with IP {dest_ip} not found'
            }

        if source_id == dest_id:
            return {
                'success': True,
                'path': [source_id],
                'edges': [],
                'total_hops': 0,
                'source_device': source_id,
                'dest_device': dest_id
            }

        adjacency = self._build_adjacency_list(devices, connections)
        path, edges = self._dijkstra(adjacency, source_id, dest_id)

        if not path:
            return {
                'success': False,
                'error': f'No path found from {source_ip} to {dest_ip}'
            }

        return {
            'success': True,
            'path': path,
            'edges': edges,
            'total_hops': len(path) - 1,
            'source_device': source_id,
            'dest_device': dest_id
        }

    def _normalize_ip(self, ip: str) -> Optional[str]:
        if not ip:
            return None
        ip = ip.strip()
        if '/' in ip:
            return ip
        try:
            return str(ipaddress.ip_address(ip))
        except ValueError:
            return None

    def _build_adjacency_list(
        self,
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]]
    ) -> Dict[str, List[Tuple[str, float, int]]]:
        adjacency: Dict[str, List[Tuple[str, float, int]]] = defaultdict(list)

        for i, conn in enumerate(connections):
            from_id = conn.get('from')
            to_id = conn.get('to')
            if not from_id or not to_id:
                continue

            bandwidth = conn.get('bandwidth', 1)
            latency = conn.get('latency')

            if latency:
                cost = float(latency)
            else:
                cost = 1.0 / max(bandwidth, 0.1)

            adjacency[from_id].append((to_id, cost, i))
            adjacency[to_id].append((from_id, cost, i))

        return adjacency

    def _dijkstra(
        self,
        adjacency: Dict[str, List[Tuple[str, float, int]]],
        source: str,
        dest: str
    ) -> Tuple[List[str], List[Tuple[str, str, int]]]:
        distances: Dict[str, float] = defaultdict(lambda: float('inf'))
        distances[source] = 0

        previous: Dict[str, Optional[Tuple[str, int]]] = {}
        previous[source] = None

        priority_queue: List[Tuple[float, str]] = [(0.0, source)]
        visited: set = set()

        while priority_queue:
            current_dist, current_node = heapq.heappop(priority_queue)

            if current_node in visited:
                continue

            if current_node == dest:
                break

            visited.add(current_node)

            for neighbor, cost, edge_idx in adjacency.get(current_node, []):
                if neighbor in visited:
                    continue

                new_dist = current_dist + cost
                if new_dist < distances[neighbor]:
                    distances[neighbor] = new_dist
                    previous[neighbor] = (current_node, edge_idx)
                    heapq.heappush(priority_queue, (new_dist, neighbor))

        if distances[dest] == float('inf'):
            return [], []

        path: List[str] = []
        edges: List[Tuple[str, str, int]] = []

        current: Optional[str] = dest
        while current is not None:
            path.append(current)
            prev_info = previous.get(current)
            if prev_info is None:
                break
            prev_node, edge_idx = prev_info
            edges.append((prev_node, current, edge_idx))
            current = prev_node

        path.reverse()
        edges.reverse()

        return path, edges
