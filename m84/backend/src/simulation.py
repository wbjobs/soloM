import numpy as np
from typing import List, Dict, Any, Optional, Callable, Tuple
from concurrent.futures import ThreadPoolExecutor
import asyncio
import copy
import time
import struct

from .octree import Body
from .barnes_hut import BarnesHutSimulator, get_bodies_state_from_arrays
from .scenes import load_scene, get_scene_list


def _has_torch() -> bool:
    try:
        import torch
        return True
    except Exception:
        return False


def _get_torch_device_info() -> Dict[str, Any]:
    try:
        import torch
        info = {
            'available': True,
            'version': torch.__version__,
            'cuda_available': torch.cuda.is_available(),
            'mps_available': hasattr(torch.backends, 'mps') and torch.backends.mps.is_available(),
        }
        if info['cuda_available']:
            info['cuda_device_count'] = torch.cuda.device_count()
            info['cuda_device_name'] = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else None
        return info
    except Exception:
        return {'available': False}


def _get_torch_simulator_class():
    try:
        from .nbody_torch import NBodySimulatorTorch
        return NBodySimulatorTorch
    except Exception:
        return None


def _is_torch_simulator(obj) -> bool:
    try:
        from .nbody_torch import NBodySimulatorTorch
        return isinstance(obj, NBodySimulatorTorch)
    except Exception:
        return False


class SimulationController:
    TARGET_FPS = 30
    STATS_INTERVAL = 10
    GPU_BODY_LIMIT = 20000

    def __init__(self, prefer_gpu: bool = True):
        self._has_torch = _has_torch()
        self._torch_info = _get_torch_device_info() if self._has_torch else {}
        
        self.prefer_gpu = prefer_gpu
        self._use_gpu = self._has_torch and prefer_gpu
        
        if self._use_gpu:
            TorchSimulator = _get_torch_simulator_class()
            if TorchSimulator is not None:
                self.simulator = TorchSimulator()
            else:
                self.simulator = BarnesHutSimulator()
                self._use_gpu = False
        else:
            self.simulator = BarnesHutSimulator()
        
        self._current_backend = 'gpu' if (self._use_gpu and self.simulator.is_gpu) else 'cpu'
        
        self.initial_pos: Optional[np.ndarray] = None
        self.initial_vel: Optional[np.ndarray] = None
        self.initial_mass: Optional[np.ndarray] = None
        self.is_running = False
        self.is_paused = False
        self.frame_count = 0
        self.current_scene_id: Optional[str] = None
        self.callbacks: Dict[str, List[Callable]] = {
            'state': [],
            'state_binary': [],
            'stats': [],
            'scene_changed': [],
            'device_info': [],
        }
        self.executor = ThreadPoolExecutor(max_workers=2)
        self._fps_smoothing = 0.9
        self._smooth_fps = 0.0
        self._compute_times: List[float] = []
        self._last_stats_frame = 0
        self._state_version = 0

        if self._has_torch:
            device_type = self.simulator.device
            gpu_status = "✓" if self.simulator.is_gpu else "✗"
            print(f"[GPU] PyTorch {self._torch_info.get('version', '?')} - {gpu_status} {device_type.upper()}")
            if self.simulator.is_gpu and device_type == 'cuda':
                print(f"[GPU] Device: {self._torch_info.get('cuda_device_name', 'Unknown')}")
        else:
            print(f"[GPU] PyTorch not available - using CPU Barnes-Hut")

    def get_device_info(self) -> Dict[str, Any]:
        return {
            'torch_available': self._has_torch,
            'torch_info': self._torch_info,
            'current_backend': self._current_backend,
            'device': self.simulator.device if hasattr(self.simulator, 'device') else 'cpu',
            'is_gpu': self.simulator.is_gpu if hasattr(self.simulator, 'is_gpu') else False,
            'prefer_gpu': self.prefer_gpu,
        }

    def set_backend(self, backend: str = 'auto') -> bool:
        if backend == 'auto':
            new_use_gpu = self._has_torch and self.prefer_gpu
        elif backend == 'gpu':
            new_use_gpu = self._has_torch
        else:
            new_use_gpu = False
        
        if new_use_gpu == self._use_gpu:
            return False
        
        self._use_gpu = new_use_gpu
        
        pos = self.simulator.pos if hasattr(self.simulator, 'pos') else None
        vel = self.simulator.vel if hasattr(self.simulator, 'vel') else None
        mass = self.simulator.mass if hasattr(self.simulator, 'mass') else None
        
        if pos is not None:
            if self._use_gpu:
                TorchSimulator = _get_torch_simulator_class()
                if TorchSimulator is not None:
                    self.simulator = TorchSimulator()
                    self._current_backend = 'gpu' if self.simulator.is_gpu else 'cpu'
                else:
                    self.simulator = BarnesHutSimulator()
                    self._current_backend = 'cpu'
                    self._use_gpu = False
            else:
                self.simulator = BarnesHutSimulator()
                self._current_backend = 'cpu'
            
            if isinstance(pos, np.ndarray):
                self.simulator.set_arrays(pos, vel, mass)
            else:
                self.simulator.set_arrays(
                    pos.detach().cpu().numpy(),
                    vel.detach().cpu().numpy(),
                    mass.detach().cpu().numpy()
                )
        
        self._emit('device_info', self.get_device_info())
        return True

    def on(self, event: str, callback: Callable) -> None:
        if event in self.callbacks:
            self.callbacks[event].append(callback)

    def off(self, event: str, callback: Callable) -> None:
        if event in self.callbacks:
            try:
                self.callbacks[event].remove(callback)
            except ValueError:
                pass

    def _emit(self, event: str, data: Any) -> None:
        for callback in self.callbacks.get(event, []):
            if asyncio.iscoroutinefunction(callback):
                asyncio.create_task(callback(data))
            else:
                callback(data)

    def load_scene(self, scene_id: str, **kwargs) -> Dict[str, Any]:
        scene_data = load_scene(scene_id, **kwargs)
        bodies = scene_data['bodies']

        pos = np.array([b.pos for b in bodies], dtype=np.float64)
        vel = np.array([b.vel for b in bodies], dtype=np.float64)
        mass = np.array([b.mass for b in bodies], dtype=np.float64)

        self.initial_pos = pos.copy()
        self.initial_vel = vel.copy()
        self.initial_mass = mass.copy()

        if self._has_torch and len(mass) <= self.GPU_BODY_LIMIT and self.prefer_gpu:
            if not _is_torch_simulator(self.simulator):
                TorchSimulator = _get_torch_simulator_class()
                if TorchSimulator is not None:
                    self.simulator = TorchSimulator()
                    self._current_backend = 'gpu' if self.simulator.is_gpu else 'cpu'
        elif len(mass) > self.GPU_BODY_LIMIT:
            if not isinstance(self.simulator, BarnesHutSimulator):
                self.simulator = BarnesHutSimulator()
                self._current_backend = 'cpu'

        self.simulator.set_arrays(pos, vel, mass)

        self.current_scene_id = scene_id
        self.frame_count = 0
        self._compute_times.clear()
        self._last_stats_frame = 0
        self._state_version = 0

        default_config = scene_data.get('defaultConfig', {})
        self.simulator.G = default_config.get('gravitationalConstant', 1.0)
        self.simulator.dt = default_config.get('timeStep', 0.01)
        self.simulator.softening = default_config.get('softening', 0.1)
        
        if isinstance(self.simulator, BarnesHutSimulator):
            self.simulator.theta = default_config.get('theta', 0.7)
            self.simulator._softening_sq = self.simulator.softening ** 2
        elif _is_torch_simulator(self.simulator):
            self.simulator.softening_sq = self.simulator.softening ** 2

        result = {
            'sceneId': scene_id,
            'name': scene_data['name'],
            'description': scene_data['description'],
            'bodyCount': scene_data['bodyCount'],
            'config': self.get_config(),
            'device': self.get_device_info(),
        }

        self._emit('scene_changed', result)
        return result

    def get_scene_list(self) -> List[Dict[str, Any]]:
        return get_scene_list()

    def set_config(self, config: Dict[str, float]) -> None:
        if 'gravitationalConstant' in config:
            self.simulator.G = float(config['gravitationalConstant'])
        if 'timeStep' in config:
            self.simulator.dt = float(config['timeStep'])
        if 'softening' in config:
            self.simulator.softening = float(config['softening'])
            self.simulator.softening_sq = self.simulator.softening ** 2
        if 'theta' in config and isinstance(self.simulator, BarnesHutSimulator):
            self.simulator.theta = float(config['theta'])

    def get_config(self) -> Dict[str, float]:
        config = {
            'gravitationalConstant': self.simulator.G,
            'timeStep': self.simulator.dt,
            'softening': self.simulator.softening,
        }
        if isinstance(self.simulator, BarnesHutSimulator):
            config['theta'] = self.simulator.theta
        else:
            config['theta'] = 0.0
        return config

    def start(self) -> None:
        if self.simulator.n == 0:
            self.load_scene('plummer')
        self.is_running = True
        self.is_paused = False

    def pause(self) -> None:
        self.is_paused = True

    def resume(self) -> None:
        self.is_paused = False

    def reset(self) -> Dict[str, Any]:
        if self.initial_pos is not None:
            self.simulator.set_arrays(
                self.initial_pos.copy(),
                self.initial_vel.copy(),
                self.initial_mass.copy()
            )
        self.frame_count = 0
        self._compute_times.clear()
        self._last_stats_frame = 0
        self.is_paused = False
        self._state_version = 0
        return self.get_state_dict()

    def stop(self) -> None:
        self.is_running = False

    def _encode_state_binary(self) -> bytes:
        n = self.simulator.n
        frame = self.frame_count
        header = struct.pack('<II', n, frame)
        
        state = self.simulator.get_state_arrays()
        pos_bytes = state['positions'].tobytes()
        vel_bytes = state['velocities'].tobytes()
        mass_bytes = state['masses'].tobytes()
        
        return header + pos_bytes + vel_bytes + mass_bytes

    def step(self) -> Tuple[float, float]:
        if self.simulator.n == 0:
            return 0.0, 0.0

        start_time = time.time()
        total_time, compute_time = self.simulator.step()
        self.frame_count += 1

        self._compute_times.append(compute_time)
        if len(self._compute_times) > 60:
            self._compute_times.pop(0)

        self._state_version += 1

        self._emit('state', None)
        self._emit('state_binary', self._encode_state_binary())

        should_send_stats = (
            self.frame_count - self._last_stats_frame >= self.STATS_INTERVAL
            or self.frame_count <= 3
        )
        if should_send_stats:
            self._last_stats_frame = self.frame_count
            stats = self.get_stats(total_time, compute_time)
            self._emit('stats', stats)

        return total_time, compute_time

    def get_state_dict(self) -> Dict[str, Any]:
        state = self.simulator.get_state_arrays()
        return {
            'count': state['count'],
            'positions': state['positions'].flatten().tolist(),
            'velocities': state['velocities'].flatten().tolist(),
            'masses': state['masses'].tolist(),
            'frame': self.frame_count,
        }

    def get_state_binary(self) -> bytes:
        return self._encode_state_binary()

    def get_stats(self, total_time: float = 0.0, compute_time: float = 0.0) -> Dict[str, Any]:
        avg_compute = np.mean(self._compute_times) if self._compute_times else 0.0
        max_compute = np.max(self._compute_times) if self._compute_times else 0.0

        if total_time > 0:
            instant_fps = 1.0 / total_time
            self._smooth_fps = self._fps_smoothing * self._smooth_fps + (1 - self._fps_smoothing) * instant_fps

        perf_info = {}
        if hasattr(self.simulator, 'get_perf_info'):
            perf_info = self.simulator.get_perf_info()

        return {
            'frame': self.frame_count,
            'bodyCount': self.simulator.n,
            'fps': round(self._smooth_fps, 1),
            'totalFrameTime': round(total_time * 1000, 2),
            'computeTime': round(compute_time * 1000, 2),
            'avgComputeTime': round(avg_compute * 1000, 2),
            'maxComputeTime': round(max_compute * 1000, 2),
            'isRunning': self.is_running,
            'isPaused': self.is_paused,
            'backend': self._current_backend,
            'device': self.simulator.device if hasattr(self.simulator, 'device') else 'cpu',
            'perf': perf_info,
        }

    async def run_simulation_loop(self) -> None:
        target_dt = 1.0 / self.TARGET_FPS

        while self.is_running:
            if not self.is_paused:
                step_start = time.time()

                total_time, compute_time = await asyncio.get_event_loop().run_in_executor(
                    self.executor,
                    self.step
                )

                elapsed = time.time() - step_start
                sleep_time = target_dt - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                else:
                    await asyncio.sleep(0.001)
            else:
                await asyncio.sleep(0.05)

    def cleanup(self) -> None:
        self.stop()
        self.executor.shutdown(wait=False)
