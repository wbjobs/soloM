from typing import Dict, Any, List, Tuple
import numpy as np
import importlib

from app.layout.force_directed import ForceDirectedLayout3D


class LayoutManager:
    def __init__(self):
        self.algorithms = {
            'force3d': ForceDirectedLayout3D(),
        }

        try:
            from app.layout.graphviz_layout import GraphvizLayout
            self.algorithms['graphviz'] = GraphvizLayout()
        except ImportError:
            pass

    def compute_layout(
        self,
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]],
        algorithm: str = 'force3d',
        **kwargs
    ) -> Dict[str, Any]:
        if algorithm not in self.algorithms:
            algorithm = 'force3d'

        layout_algo = self.algorithms[algorithm]
        positions = layout_algo.compute(devices, connections, **kwargs)

        return {
            'algorithm': algorithm,
            'positions': positions,
            'devices': self._enrich_devices(devices, positions),
            'connections': connections
        }

    def _enrich_devices(
        self,
        devices: List[Dict[str, Any]],
        positions: Dict[str, Tuple[float, float, float]]
    ) -> List[Dict[str, Any]]:
        enriched = []
        for device in devices:
            device_id = device.get('id')
            pos = positions.get(device_id, [0, 0, 0])
            enriched.append({
                **device,
                'position': {
                    'x': float(pos[0]),
                    'y': float(pos[1]),
                    'z': float(pos[2])
                }
            })
        return enriched
