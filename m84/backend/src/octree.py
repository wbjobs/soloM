import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class Body:
    pos: np.ndarray
    vel: np.ndarray
    acc: np.ndarray
    mass: float
    id: int = 0

    def __post_init__(self):
        self.pos = np.asarray(self.pos, dtype=np.float64)
        self.vel = np.asarray(self.vel, dtype=np.float64)
        self.acc = np.asarray(self.acc, dtype=np.float64)


@dataclass
class OctreeNode:
    center: np.ndarray
    size: float
    mass: float = 0.0
    com: np.ndarray = field(default_factory=lambda: np.zeros(3, dtype=np.float64))
    children: List[Optional['OctreeNode']] = field(default_factory=lambda: [None] * 8)
    body: Optional[Body] = None

    def __post_init__(self):
        self.center = np.asarray(self.center, dtype=np.float64)
        self.com = np.asarray(self.com, dtype=np.float64)

    def is_leaf(self) -> bool:
        return all(child is None for child in self.children) and self.body is not None

    def is_empty(self) -> bool:
        return self.mass == 0.0 and self.body is None

    def get_octant(self, pos: np.ndarray) -> int:
        octant = 0
        if pos[0] >= self.center[0]:
            octant |= 1
        if pos[1] >= self.center[1]:
            octant |= 2
        if pos[2] >= self.center[2]:
            octant |= 4
        return octant

    def get_child_center(self, octant: int) -> np.ndarray:
        offset = np.array([
            1 if (octant & 1) else -1,
            1 if (octant & 2) else -1,
            1 if (octant & 4) else -1
        ], dtype=np.float64)
        return self.center + offset * (self.size / 4.0)


def create_octree(bodies: List[Body], bounds_size: float = None) -> OctreeNode:
    if not bodies:
        return OctreeNode(center=np.zeros(3), size=100.0)

    positions = np.array([b.pos for b in bodies])
    min_pos = np.min(positions, axis=0)
    max_pos = np.max(positions, axis=0)

    if bounds_size is None:
        bounds_size = np.max(max_pos - min_pos) * 1.5
        if bounds_size < 1.0:
            bounds_size = 100.0

    center = (min_pos + max_pos) / 2.0
    root = OctreeNode(center=center, size=bounds_size)

    for body in bodies:
        _insert_body(root, body)

    return root


def _insert_body(node: OctreeNode, body: Body) -> None:
    if node.is_empty():
        node.body = body
        node.mass = body.mass
        node.com = body.pos.copy()
        return

    if node.is_leaf():
        existing_body = node.body
        node.body = None

        octant_existing = node.get_octant(existing_body.pos)
        octant_new = node.get_octant(body.pos)

        child_size = node.size / 2.0

        if node.children[octant_existing] is None:
            node.children[octant_existing] = OctreeNode(
                center=node.get_child_center(octant_existing),
                size=child_size
            )
        _insert_body(node.children[octant_existing], existing_body)

        if octant_new != octant_existing and node.children[octant_new] is None:
            node.children[octant_new] = OctreeNode(
                center=node.get_child_center(octant_new),
                size=child_size
            )
        _insert_body(node.children[octant_new], body)

        _update_node_mass(node)
        return

    octant = node.get_octant(body.pos)
    child_size = node.size / 2.0

    if node.children[octant] is None:
        node.children[octant] = OctreeNode(
            center=node.get_child_center(octant),
            size=child_size
        )
    _insert_body(node.children[octant], body)
    _update_node_mass(node)


def _update_node_mass(node: OctreeNode) -> None:
    total_mass = 0.0
    weighted_com = np.zeros(3, dtype=np.float64)

    for child in node.children:
        if child is not None and not child.is_empty():
            total_mass += child.mass
            weighted_com += child.mass * child.com

    if total_mass > 0:
        node.mass = total_mass
        node.com = weighted_com / total_mass


def free_octree(node: OctreeNode) -> None:
    for i in range(8):
        if node.children[i] is not None:
            free_octree(node.children[i])
            node.children[i] = None
    node.body = None
    node.mass = 0.0
    node.com.fill(0.0)
