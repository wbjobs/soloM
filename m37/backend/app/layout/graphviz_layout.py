from typing import Dict, Any, List, Tuple
import networkx as nx
import numpy as np


class GraphvizLayout:
    def __init__(self):
        self._layout_methods = {
            'dot': self._layout_dot,
            'neato': self._layout_neato,
            'fdp': self._layout_fdp,
            'sfdp': self._layout_sfdp,
            'twopi': self._layout_twopi,
            'circo': self._layout_circo,
        }

    def compute(
        self,
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]],
        layout_type: str = 'fdp',
        scale: float = 100.0,
        **kwargs
    ) -> Dict[str, Tuple[float, float, float]]:
        G = self._build_graph(devices, connections)

        if layout_type not in self._layout_methods:
            layout_type = 'fdp'

        try:
            pos_2d = self._layout_methods[layout_type](G)
        except Exception:
            pos_2d = self._layout_fdp(G)

        positions = {}
        for device in devices:
            device_id = device['id']
            if device_id in pos_2d:
                x, y = pos_2d[device_id]
                z = self._compute_z_coordinate(device, devices, connections)
                positions[device_id] = (x * scale, y * scale, z * scale)
            else:
                positions[device_id] = (0.0, 0.0, 0.0)

        return self._normalize_positions(positions)

    def _build_graph(self, devices: List[Dict[str, Any]], connections: List[Dict[str, Any]]) -> nx.Graph:
        G = nx.Graph()
        for device in devices:
            G.add_node(device['id'], type=device.get('type', 'unknown'))
        for conn in connections:
            G.add_edge(conn['from'], conn['to'], bandwidth=conn.get('bandwidth', 1))
        return G

    def _layout_dot(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='dot')

    def _layout_neato(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='neato')

    def _layout_fdp(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='fdp')

    def _layout_sfdp(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='sfdp')

    def _layout_twopi(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='twopi')

    def _layout_circo(self, G: nx.Graph) -> Dict[str, Tuple[float, float]]:
        return nx.nx_pydot.graphviz_layout(G, prog='circo')

    def _compute_z_coordinate(
        self,
        device: Dict[str, Any],
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]]
    ) -> float:
        type_priority = {
            'router': 3.0,
            'firewall': 2.5,
            'core_switch': 2.0,
            'switch': 1.0,
            'server': 0.0,
            'host': 0.0,
            'client': 0.0,
        }
        device_type = device.get('type', 'unknown')
        base_z = type_priority.get(device_type, 0.5)
        jitter = np.random.uniform(-0.2, 0.2)
        return base_z + jitter

    def _normalize_positions(
        self,
        positions: Dict[str, Tuple[float, float, float]]
    ) -> Dict[str, Tuple[float, float, float]]:
        if not positions:
            return positions

        coords = np.array(list(positions.values()))
        mean = np.mean(coords, axis=0)
        centered = coords - mean

        max_abs = np.max(np.abs(centered))
        if max_abs > 0:
            normalized = centered / max_abs * 10.0
        else:
            normalized = centered

        result = {}
        for i, (device_id, _) in enumerate(positions.items()):
            result[device_id] = tuple(normalized[i])

        return result
