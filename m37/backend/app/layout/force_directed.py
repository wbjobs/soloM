from typing import Dict, Any, List, Tuple
import numpy as np
import time


class ForceDirectedLayout3D:
    def __init__(
        self,
        iterations: int = 500,
        repulsion_strength: float = 500.0,
        attraction_strength: float = 0.01,
        gravity_strength: float = 0.5,
        damping: float = 0.9,
        min_distance: float = 2.0,
        max_displacement: float = 0.5
    ):
        self.iterations = iterations
        self.repulsion_strength = repulsion_strength
        self.attraction_strength = attraction_strength
        self.gravity_strength = gravity_strength
        self.damping = damping
        self.min_distance = min_distance
        self.max_displacement = max_displacement

    def compute(
        self,
        devices: List[Dict[str, Any]],
        connections: List[Dict[str, Any]],
        **kwargs
    ) -> Dict[str, Tuple[float, float, float]]:
        n = len(devices)
        if n == 0:
            return {}
        if n == 1:
            return {devices[0]['id']: (0.0, 0.0, 0.0)}

        device_ids = [d['id'] for d in devices]
        id_to_idx = {did: i for i, did in enumerate(device_ids)}

        positions = self._initialize_positions(n, devices)
        velocities = np.zeros((n, 3))
        adj_matrix = self._build_adjacency_matrix(n, connections, id_to_idx)
        type_weights = self._compute_type_weights(devices)

        max_iterations = kwargs.get('iterations', self.iterations)
        adaptive_iterations = self._adaptive_iteration_count(n, max_iterations)

        use_approx = n > 150
        weight_matrix = self._build_weight_matrix(type_weights) if not use_approx else None

        start_time = time.time()
        time_limit = 10.0

        for iteration in range(adaptive_iterations):
            forces = np.zeros((n, 3))

            if use_approx:
                forces += self._compute_repulsion_approx(positions, type_weights)
                forces += self._compute_attraction_sparse(positions, connections, id_to_idx)
            else:
                forces += self._compute_repulsion_vectorized(positions, weight_matrix)
                forces += self._compute_attraction_vectorized(positions, adj_matrix)
            forces += self._compute_gravity_forces(positions)

            velocities = (velocities + forces) * self.damping
            velocities = self._cap_velocities(velocities)
            positions += velocities

            if iteration % 20 == 0 and iteration > 0:
                if self._is_converged(velocities):
                    break
                if time.time() - start_time > time_limit:
                    break

        positions = self._apply_z_layer_ordering(positions, devices)
        positions = self._normalize_and_scale(positions)

        result = {}
        for i, did in enumerate(device_ids):
            result[did] = (float(positions[i, 0]), float(positions[i, 1]), float(positions[i, 2]))

        return result

    def _adaptive_iteration_count(self, n: int, max_iterations: int) -> int:
        if n > 500:
            return min(max_iterations, 100)
        if n > 200:
            return min(max_iterations, 150)
        if n > 100:
            return min(max_iterations, 250)
        if n > 50:
            return min(max_iterations, 350)
        return max_iterations

    def _build_weight_matrix(self, type_weights: np.ndarray) -> np.ndarray:
        n = len(type_weights)
        w = (type_weights[:, np.newaxis] + type_weights[np.newaxis, :]) / 2.0
        np.fill_diagonal(w, 0)
        return w

    def _initialize_positions(
        self,
        n: int,
        devices: List[Dict[str, Any]]
    ) -> np.ndarray:
        type_radius = {
            'router': 0.3,
            'firewall': 0.5,
            'core_switch': 0.6,
            'switch': 0.8,
        }
        radius = 5.0
        radii = np.array([
            type_radius.get(d.get('type', 'unknown'), 1.0) * radius
            for d in devices
        ])

        theta = np.random.uniform(0, 2 * np.pi, n)
        phi = np.random.uniform(0, np.pi, n)

        x = radii * np.sin(phi) * np.cos(theta)
        y = radii * np.sin(phi) * np.sin(theta)
        z = radii * np.cos(phi)

        return np.column_stack([x, y, z])

    def _build_adjacency_matrix(
        self,
        n: int,
        connections: List[Dict[str, Any]],
        id_to_idx: Dict[str, int]
    ) -> np.ndarray:
        adj = np.zeros((n, n))
        for conn in connections:
            from_idx = id_to_idx.get(conn['from'])
            to_idx = id_to_idx.get(conn['to'])
            if from_idx is not None and to_idx is not None:
                bandwidth = conn.get('bandwidth', 1)
                adj[from_idx, to_idx] = bandwidth
                adj[to_idx, from_idx] = bandwidth
        return adj

    def _compute_type_weights(
        self,
        devices: List[Dict[str, Any]]
    ) -> np.ndarray:
        type_importance = {
            'router': 2.0,
            'firewall': 1.8,
            'core_switch': 1.6,
            'switch': 1.2,
            'server': 1.0,
            'host': 0.8,
            'client': 0.8,
        }
        return np.array([
            type_importance.get(d.get('type', 'unknown'), 1.0)
            for d in devices
        ])

    def _compute_repulsion_vectorized(
        self,
        positions: np.ndarray,
        weight_matrix: np.ndarray
    ) -> np.ndarray:
        n = positions.shape[0]

        diff = positions[:, np.newaxis, :] - positions[np.newaxis, :, :]
        dist_sq = np.sum(diff ** 2, axis=2)
        dist = np.sqrt(dist_sq)

        dist_safe = np.maximum(dist, self.min_distance)
        np.fill_diagonal(dist_safe, 1.0)

        repulsion_mag = self.repulsion_strength * weight_matrix / (dist_safe ** 2)
        np.fill_diagonal(repulsion_mag, 0.0)

        direction = diff / dist_safe[:, :, np.newaxis]

        forces = np.sum(direction * repulsion_mag[:, :, np.newaxis], axis=1)

        return forces

    def _compute_repulsion_approx(
        self,
        positions: np.ndarray,
        type_weights: np.ndarray
    ) -> np.ndarray:
        n = positions.shape[0]
        forces = np.zeros((n, 3))

        center_of_mass = np.mean(positions, axis=0)
        avg_weight = np.mean(type_weights)

        for i in range(n):
            diff = positions[i] - center_of_mass
            dist = np.linalg.norm(diff)

            if dist < self.min_distance:
                dist = self.min_distance
                if np.linalg.norm(diff) < 1e-8:
                    diff = np.random.randn(3) * 0.1
                    dist = np.linalg.norm(diff)

            direction = diff / dist
            repulsion_force = self.repulsion_strength * avg_weight / (dist ** 2)
            forces[i] += direction * repulsion_force * 0.3

        chunk_size = 64
        for start in range(0, n, chunk_size):
            end = min(start + chunk_size, n)
            chunk_pos = positions[start:end]

            diff = chunk_pos[:, np.newaxis, :] - positions[np.newaxis, :, :]
            dist_sq = np.sum(diff ** 2, axis=2)
            dist = np.sqrt(dist_sq)

            dist_safe = np.maximum(dist, self.min_distance)
            local_chunk = end - start
            for ci in range(local_chunk):
                dist_safe[ci, start + ci] = 1.0

            weight_pair = (type_weights[start:end, np.newaxis] + type_weights[np.newaxis, :]) / 2.0
            repulsion_mag = self.repulsion_strength * weight_pair / (dist_safe ** 2)
            for ci in range(local_chunk):
                repulsion_mag[ci, start + ci] = 0.0

            direction = diff / dist_safe[:, :, np.newaxis]
            chunk_forces = np.sum(direction * repulsion_mag[:, :, np.newaxis], axis=1)
            forces[start:end] += chunk_forces

        return forces

    def _compute_attraction_sparse(
        self,
        positions: np.ndarray,
        connections: List[Dict[str, Any]],
        id_to_idx: Dict[str, int]
    ) -> np.ndarray:
        n = positions.shape[0]
        forces = np.zeros((n, 3))

        for conn in connections:
            from_idx = id_to_idx.get(conn['from'])
            to_idx = id_to_idx.get(conn['to'])
            if from_idx is None or to_idx is None:
                continue

            delta = positions[to_idx] - positions[from_idx]
            distance = np.linalg.norm(delta)

            if distance < self.min_distance:
                continue

            bandwidth = conn.get('bandwidth', 1)
            attraction_force = self.attraction_strength * bandwidth * (distance ** 2)
            direction = delta / distance

            forces[from_idx] += direction * attraction_force
            forces[to_idx] -= direction * attraction_force

        return forces

    def _compute_attraction_vectorized(
        self,
        positions: np.ndarray,
        adj_matrix: np.ndarray
    ) -> np.ndarray:
        diff = positions[np.newaxis, :, :] - positions[:, np.newaxis, :]
        dist_sq = np.sum(diff ** 2, axis=2)
        dist = np.sqrt(dist_sq)

        mask = (adj_matrix > 0) & (dist > self.min_distance)

        dist_safe = np.where(mask, dist, 1.0)

        attraction_mag = np.where(
            mask,
            self.attraction_strength * adj_matrix * (dist_safe ** 2),
            0.0
        )

        direction = diff / dist_safe[:, :, np.newaxis]

        forces = np.sum(direction * attraction_mag[:, :, np.newaxis], axis=1)

        return forces

    def _compute_gravity_forces(
        self,
        positions: np.ndarray
    ) -> np.ndarray:
        distances = np.linalg.norm(positions, axis=1, keepdims=True)
        directions = -positions / (distances + 1e-8)
        return self.gravity_strength * distances * directions

    def _cap_velocities(
        self,
        velocities: np.ndarray
    ) -> np.ndarray:
        speeds = np.linalg.norm(velocities, axis=1, keepdims=True)
        scale = np.minimum(1.0, self.max_displacement / (speeds + 1e-8))
        return velocities * scale

    def _is_converged(
        self,
        velocities: np.ndarray,
        threshold: float = 0.01
    ) -> bool:
        avg_speed = np.mean(np.linalg.norm(velocities, axis=1))
        return avg_speed < threshold

    def _apply_z_layer_ordering(
        self,
        positions: np.ndarray,
        devices: List[Dict[str, Any]]
    ) -> np.ndarray:
        type_z_order = {
            'router': 8.0,
            'firewall': 6.0,
            'core_switch': 4.0,
            'switch': 2.0,
            'server': 0.0,
            'host': 0.0,
            'client': 0.0,
        }

        target_z = np.array([
            type_z_order.get(d.get('type', 'unknown'), 1.0)
            for d in devices
        ])

        positions[:, 2] = positions[:, 2] * 0.3 + target_z * 0.7
        return positions

    def _normalize_and_scale(
        self,
        positions: np.ndarray,
        target_scale: float = 10.0
    ) -> np.ndarray:
        center = np.mean(positions, axis=0)
        centered = positions - center

        max_extent = np.max(np.abs(centered))
        if max_extent > 0:
            scaled = centered / max_extent * target_scale
        else:
            scaled = centered

        return scaled
