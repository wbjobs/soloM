import numpy as np
from typing import Tuple
import time


class NBodySimulatorTorch:
    def __init__(
        self,
        gravitational_constant: float = 1.0,
        softening: float = 0.1,
        time_step: float = 0.01,
        device: str = 'auto'
    ):
        self.G = gravitational_constant
        self.softening = softening
        self.softening_sq = softening * softening
        self.dt = time_step
        
        self._device = self._detect_device(device)
        self._torch = None
        self._has_torch = False
        
        try:
            import torch
            self._torch = torch
            self._has_torch = True
            print(f"[GPU] PyTorch available, using device: {self._device}")
        except ImportError:
            print("[GPU] PyTorch not installed, falling back to NumPy")
            self._device = 'cpu'
        
        self.n = 0
        self.pos = None
        self.vel = None
        self.mass = None
        self.acc = None
    
    def _detect_device(self, preferred: str) -> str:
        if preferred != 'auto':
            return preferred
        
        try:
            import torch
            if torch.cuda.is_available():
                return 'cuda'
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return 'mps'
        except ImportError:
            pass
        return 'cpu'
    
    @property
    def device(self) -> str:
        return self._device
    
    @property
    def is_gpu(self) -> bool:
        return self._device in ('cuda', 'mps')
    
    @property
    def backend(self) -> str:
        return 'torch' if self._has_torch else 'numpy'
    
    def _to_tensor(self, arr: np.ndarray) -> any:
        if self._has_torch:
            return self._torch.tensor(arr, dtype=self._torch.float32, device=self._device)
        return arr.astype(np.float32)
    
    def set_arrays(self, pos: np.ndarray, vel: np.ndarray, mass: np.ndarray) -> None:
        self.n = len(mass)
        
        if self._has_torch:
            self.pos = self._to_tensor(pos)
            self.vel = self._to_tensor(vel)
            self.mass = self._to_tensor(mass)
            self.acc = self._torch.zeros((self.n, 3), dtype=self._torch.float32, device=self._device)
        else:
            self.pos = pos.astype(np.float64)
            self.vel = vel.astype(np.float64)
            self.mass = mass.astype(np.float64)
            self.acc = np.zeros((self.n, 3), dtype=np.float64)
    
    def _compute_acceleration_gpu(self) -> None:
        t = self._torch
        
        dx = self.pos[:, None, :] - self.pos[None, :, :]
        dist_sq = (dx * dx).sum(dim=2) + self.softening_sq
        dist = t.sqrt(dist_sq)
        inv_dist_cube = 1.0 / (dist_sq * dist)
        
        mask = t.eye(self.n, device=self._device, dtype=t.bool)
        inv_dist_cube = inv_dist_cube.masked_fill(mask, 0.0)
        
        force = self.G * self.mass[None, :, None] * inv_dist_cube[:, :, None] * dx
        self.acc = force.sum(dim=1)
    
    def _compute_acceleration_cpu_vectorized(self) -> None:
        dx = self.pos[:, None, :] - self.pos[None, :, :]
        dist_sq = np.sum(dx * dx, axis=2) + self.softening_sq
        dist = np.sqrt(dist_sq)
        inv_dist_cube = 1.0 / (dist_sq * dist)
        
        np.fill_diagonal(inv_dist_cube, 0.0)
        
        force = self.G * self.mass[None, :, None] * inv_dist_cube[:, :, None] * dx
        self.acc = np.sum(force, axis=1)
    
    def step(self) -> Tuple[float, float]:
        start_time = time.time()
        
        if self.n == 0:
            return 0.0, 0.0
        
        force_start = time.time()
        
        if self._has_torch and self.is_gpu:
            self._compute_acceleration_gpu()
            if self._device == 'cuda':
                self._torch.cuda.synchronize()
            elif self._device == 'mps':
                self._torch.mps.synchronize()
        elif self._has_torch:
            self._compute_acceleration_gpu()
        else:
            self._compute_acceleration_cpu_vectorized()
        
        force_time = time.time() - force_start
        
        dt = self.dt
        self.vel += 0.5 * self.acc * dt
        self.pos += self.vel * dt + 0.5 * self.acc * dt * dt
        
        if self._has_torch and self.is_gpu:
            if self._device == 'cuda':
                self._torch.cuda.synchronize()
            elif self._device == 'mps':
                self._torch.mps.synchronize()
        
        total_time = time.time() - start_time
        return total_time, force_time
    
    def get_state_arrays(self) -> dict:
        if self._has_torch:
            return {
                'count': self.n,
                'positions': self.pos.detach().to('cpu').numpy().astype(np.float32),
                'velocities': self.vel.detach().to('cpu').numpy().astype(np.float32),
                'masses': self.mass.detach().to('cpu').numpy().astype(np.float32),
            }
        else:
            return {
                'count': self.n,
                'positions': self.pos.astype(np.float32),
                'velocities': self.vel.astype(np.float32),
                'masses': self.mass.astype(np.float32),
            }
    
    def get_perf_info(self) -> dict:
        return {
            'backend': self.backend,
            'device': self._device,
            'is_gpu': self.is_gpu,
            'body_count': self.n,
        }
