import numpy as np
from typing import Tuple
from .octree import OctreeNode, create_octree, free_octree


class BarnesHutSimulator:
    def __init__(
        self,
        gravitational_constant: float = 1.0,
        softening: float = 0.1,
        theta: float = 0.7,
        time_step: float = 0.01
    ):
        self.G = gravitational_constant
        self.softening = softening
        self.theta = theta
        self.dt = time_step
        self.n = 0
        self.pos = np.zeros((0, 3), dtype=np.float64)
        self.vel = np.zeros((0, 3), dtype=np.float64)
        self.acc = np.zeros((0, 3), dtype=np.float64)
        self.mass = np.zeros(0, dtype=np.float64)
        self._softening_sq = softening * softening

    def set_arrays(self, pos: np.ndarray, vel: np.ndarray, mass: np.ndarray) -> None:
        self.n = len(mass)
        self.pos = np.ascontiguousarray(pos, dtype=np.float64)
        self.vel = np.ascontiguousarray(vel, dtype=np.float64)
        self.mass = np.ascontiguousarray(mass, dtype=np.float64)
        self.acc = np.zeros((self.n, 3), dtype=np.float64)
        self._softening_sq = self.softening * self.softening

    def _compute_acc_for_body(self, body_idx: int, root: OctreeNode) -> np.ndarray:
        pos_i = self.pos[body_idx]
        acc_i = np.zeros(3, dtype=np.float64)
        stack = [root]
        soft_sq = self._softening_sq

        while stack:
            node = stack.pop()
            if node is None or node.mass == 0.0:
                continue

            if node.body is not None and all(c is None for c in node.children):
                if node.body.id != body_idx:
                    dx = node.com - pos_i
                    dist_sq = dx[0]*dx[0] + dx[1]*dx[1] + dx[2]*dx[2] + soft_sq
                    inv_dist = 1.0 / np.sqrt(dist_sq)
                    f = self.G * node.mass * inv_dist * inv_dist * inv_dist
                    acc_i += f * dx
                continue

            dx = node.com - pos_i
            dist_sq = dx[0]*dx[0] + dx[1]*dx[1] + dx[2]*dx[2] + soft_sq
            dist = np.sqrt(dist_sq)

            if node.size / dist < self.theta:
                inv_dist = 1.0 / dist
                f = self.G * node.mass * inv_dist * inv_dist * inv_dist
                acc_i += f * dx
            else:
                for child in node.children:
                    if child is not None and child.mass > 0.0:
                        stack.append(child)

        return acc_i

    def _compute_all_acc_iterative(self, root: OctreeNode) -> np.ndarray:
        new_acc = np.zeros((self.n, 3), dtype=np.float64)
        soft_sq = self._softening_sq
        theta = self.theta
        G = self.G

        for i in range(self.n):
            pos_i = self.pos[i]
            acc_i = np.zeros(3, dtype=np.float64)
            stack = [root]

            while stack:
                node = stack.pop()
                if node is None or node.mass == 0.0:
                    continue

                is_leaf = node.body is not None and all(c is None for c in node.children)
                if is_leaf:
                    if node.body.id != i:
                        dx = node.com - pos_i
                        dist_sq = dx[0]*dx[0] + dx[1]*dx[1] + dx[2]*dx[2] + soft_sq
                        inv_dist = 1.0 / np.sqrt(dist_sq)
                        f = G * node.mass * inv_dist * inv_dist * inv_dist
                        acc_i[0] += f * dx[0]
                        acc_i[1] += f * dx[1]
                        acc_i[2] += f * dx[2]
                    continue

                dx = node.com - pos_i
                dist_sq = dx[0]*dx[0] + dx[1]*dx[1] + dx[2]*dx[2] + soft_sq
                dist = np.sqrt(dist_sq)

                if node.size / dist < theta:
                    inv_dist = 1.0 / dist
                    f = G * node.mass * inv_dist * inv_dist * inv_dist
                    acc_i[0] += f * dx[0]
                    acc_i[1] += f * dx[1]
                    acc_i[2] += f * dx[2]
                else:
                    for child in node.children:
                        if child is not None and child.mass > 0.0:
                            stack.append(child)

            new_acc[i] = acc_i

        return new_acc

    def step(self) -> Tuple[float, float]:
        import time
        start_time = time.time()

        if self.n == 0:
            return 0.0, 0.0

        bounds_size = np.max(np.ptp(self.pos, axis=0)) * 2.0
        if bounds_size < 10.0:
            bounds_size = 100.0

        from .octree import Body
        bodies = []
        for i in range(self.n):
            bodies.append(Body(
                pos=self.pos[i].copy(),
                vel=self.vel[i].copy(),
                acc=self.acc[i].copy(),
                mass=float(self.mass[i]),
                id=i
            ))

        root = create_octree(bodies, bounds_size)

        tree_time = time.time() - start_time
        force_start = time.time()

        new_acc = self._compute_all_acc_iterative(root)

        force_time = time.time() - force_start

        self.vel += 0.5 * (self.acc + new_acc) * self.dt
        self.pos += self.vel * self.dt + 0.5 * self.acc * self.dt * self.dt
        self.acc = new_acc

        for i in range(self.n):
            bodies[i].pos = self.pos[i]
            bodies[i].vel = self.vel[i]
            bodies[i].acc = self.acc[i]

        free_octree(root)

        total_time = time.time() - start_time
        return total_time, tree_time + force_time

    def get_state_arrays(self) -> dict:
        return {
            'count': self.n,
            'positions': self.pos.astype(np.float32),
            'velocities': self.vel.astype(np.float32),
            'masses': self.mass.astype(np.float32),
        }


def get_bodies_state_from_arrays(pos: np.ndarray, vel: np.ndarray, mass: np.ndarray, frame: int = 0) -> dict:
    return {
        'count': len(mass),
        'positions': pos.astype(np.float32).flatten().tolist(),
        'velocities': vel.astype(np.float32).flatten().tolist(),
        'masses': mass.astype(np.float32).tolist(),
        'frame': frame,
    }
