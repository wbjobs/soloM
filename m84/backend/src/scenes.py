import numpy as np
from typing import Dict, Any, List
from .octree import Body


def _create_bodies(positions: np.ndarray, velocities: np.ndarray, masses: np.ndarray) -> List[Body]:
    bodies = []
    for i, (pos, vel, mass) in enumerate(zip(positions, velocities, masses)):
        body = Body(
            pos=pos.copy(),
            vel=vel.copy(),
            acc=np.zeros(3, dtype=np.float64),
            mass=mass,
            id=i
        )
        bodies.append(body)
    return bodies


def create_plummer_sphere(n: int = 1000, radius: float = 20.0, total_mass: float = 100.0) -> Dict[str, Any]:
    np.random.seed(42)

    r = np.random.uniform(0, 1, n)
    r = radius / (np.sqrt(r ** (-2.0/3.0) - 1.0))

    theta = np.arccos(np.random.uniform(-1, 1, n))
    phi = np.random.uniform(0, 2 * np.pi, n)

    x = r * np.sin(theta) * np.cos(phi)
    y = r * np.sin(theta) * np.sin(phi)
    z = r * np.cos(theta)
    positions = np.column_stack([x, y, z])

    mass = total_mass / n
    masses = np.full(n, mass)

    v_esc = np.sqrt(2.0 * total_mass / np.sqrt(r**2 + radius**2))
    x = np.random.uniform(0, 0.1, n)
    y = np.random.uniform(0, 1, n)
    mask = y > x**2 * (1 - x**2)**3.5
    while np.sum(mask) < n:
        new_x = np.random.uniform(0, 0.1, n - np.sum(mask))
        new_y = np.random.uniform(0, 1, n - np.sum(mask))
        new_mask = new_y > new_x**2 * (1 - new_x**2)**3.5
        x[~mask] = new_x
        y[~mask] = new_y
        mask = y > x**2 * (1 - x**2)**3.5

    v_mag = x * v_esc

    theta_v = np.arccos(np.random.uniform(-1, 1, n))
    phi_v = np.random.uniform(0, 2 * np.pi, n)

    vx = v_mag * np.sin(theta_v) * np.cos(phi_v)
    vy = v_mag * np.sin(theta_v) * np.sin(phi_v)
    vz = v_mag * np.cos(theta_v)
    velocities = np.column_stack([vx, vy, vz])

    com_pos = np.sum(masses[:, None] * positions, axis=0) / total_mass
    com_vel = np.sum(masses[:, None] * velocities, axis=0) / total_mass
    positions -= com_pos
    velocities -= com_vel

    bodies = _create_bodies(positions, velocities, masses)

    return {
        'id': 'plummer',
        'name': 'Plummer 球',
        'description': '球状星团的经典模型，具有平滑的密度分布',
        'bodyCount': n,
        'bodies': bodies,
        'defaultConfig': {
            'gravitationalConstant': 1.0,
            'timeStep': 0.05,
            'softening': 0.3,
            'theta': 0.7
        }
    }


def create_galaxy_collision(n: int = 2000, separation: float = 50.0) -> Dict[str, Any]:
    np.random.seed(42)

    n1 = n // 2
    n2 = n - n1

    def create_disk(count: int, center_offset: np.ndarray, vel_offset: np.ndarray, scale: float = 1.0):
        r = np.random.exponential(scale=15 * scale, size=count)
        theta = np.random.uniform(0, 2 * np.pi, count)
        z = np.random.normal(0, 2 * scale, count)

        x = r * np.cos(theta) + center_offset[0]
        y = r * np.sin(theta) + center_offset[1]
        z = z + center_offset[2]
        pos = np.column_stack([x, y, z])

        mass = np.random.exponential(scale=1.0, size=count) * 0.5
        mass = np.clip(mass, 0.1, 2.0)

        v_rot = np.sqrt(1.0 / (np.sqrt(r**2 + 2**2))) * 3.0 * scale
        vx = -v_rot * np.sin(theta) + vel_offset[0]
        vy = v_rot * np.cos(theta) + vel_offset[1]
        vz = np.random.normal(0, 0.3, count) + vel_offset[2]
        vel = np.column_stack([vx, vy, vz])

        return pos, vel, mass

    pos1, vel1, mass1 = create_disk(
        n1,
        center_offset=np.array([-separation/2, 0, 0]),
        vel_offset=np.array([0, 1.5, 0]),
        scale=1.0
    )

    pos2, vel2, mass2 = create_disk(
        n2,
        center_offset=np.array([separation/2, 0, 0]),
        vel_offset=np.array([0, -1.5, 0]),
        scale=0.8
    )

    positions = np.vstack([pos1, pos2])
    velocities = np.vstack([vel1, vel2])
    masses = np.concatenate([mass1, mass2])

    total_mass = np.sum(masses)
    com_pos = np.sum(masses[:, None] * positions, axis=0) / total_mass
    com_vel = np.sum(masses[:, None] * velocities, axis=0) / total_mass
    positions -= com_pos
    velocities -= com_vel

    bodies = _create_bodies(positions, velocities, masses)

    return {
        'id': 'collision',
        'name': '星系碰撞',
        'description': '两个旋转星系的碰撞模拟，展示潮汐尾结构',
        'bodyCount': n,
        'bodies': bodies,
        'defaultConfig': {
            'gravitationalConstant': 1.0,
            'timeStep': 0.08,
            'softening': 0.5,
            'theta': 0.8
        }
    }


def create_three_body() -> Dict[str, Any]:
    positions = np.array([
        [-10.0, 0.0, 0.0],
        [10.0, 0.0, 0.0],
        [0.0, 10.0, 0.0]
    ], dtype=np.float64)

    velocities = np.array([
        [0.0, 0.3, 0.1],
        [0.0, -0.3, -0.1],
        [-0.2, 0.0, 0.15]
    ], dtype=np.float64)

    masses = np.array([10.0, 10.0, 10.0], dtype=np.float64)

    bodies = _create_bodies(positions, velocities, masses)

    return {
        'id': 'three_body',
        'name': '三体问题',
        'description': '经典混沌系统，三个等质量星体的复杂运动',
        'bodyCount': 3,
        'bodies': bodies,
        'defaultConfig': {
            'gravitationalConstant': 1.0,
            'timeStep': 0.01,
            'softening': 0.1,
            'theta': 0.3
        }
    }


def create_solar_system() -> Dict[str, Any]:
    positions = np.array([
        [0.0, 0.0, 0.0],
        [15.0, 0.0, 0.0],
        [25.0, 0.0, 0.0],
        [35.0, 0.0, 0.0],
        [50.0, 0.0, 0.0]
    ], dtype=np.float64)

    sun_mass = 100.0
    masses = np.array([
        sun_mass,
        0.05,
        0.15,
        0.002,
        0.0003
    ], dtype=np.float64)

    v_orb = np.sqrt(sun_mass / positions[:, 0])
    velocities = np.array([
        [0.0, 0.0, 0.0],
        [0.0, v_orb[1], 0.0],
        [0.0, v_orb[2], 0.0],
        [0.0, v_orb[3], 0.0],
        [0.0, v_orb[4], 0.0]
    ], dtype=np.float64)

    bodies = _create_bodies(positions, velocities, masses)

    return {
        'id': 'solar',
        'name': '简化太阳系',
        'description': '太阳和四颗行星的简单轨道系统',
        'bodyCount': 5,
        'bodies': bodies,
        'defaultConfig': {
            'gravitationalConstant': 1.0,
            'timeStep': 0.05,
            'softening': 0.2,
            'theta': 0.5
        }
    }


def create_uniform_sphere(n: int = 500, radius: float = 30.0) -> Dict[str, Any]:
    np.random.seed(42)

    u = np.random.uniform(0, 1, n)
    r = radius * np.cbrt(u)

    theta = np.arccos(np.random.uniform(-1, 1, n))
    phi = np.random.uniform(0, 2 * np.pi, n)

    x = r * np.sin(theta) * np.cos(phi)
    y = r * np.sin(theta) * np.sin(phi)
    z = r * np.cos(theta)
    positions = np.column_stack([x, y, z])

    mass = 1.0
    masses = np.full(n, mass)

    velocities = np.zeros((n, 3), dtype=np.float64)

    bodies = _create_bodies(positions, velocities, masses)

    return {
        'id': 'uniform',
        'name': '均匀球体坍缩',
        'description': '冷均匀球体在引力作用下的坍缩过程',
        'bodyCount': n,
        'bodies': bodies,
        'defaultConfig': {
            'gravitationalConstant': 1.0,
            'timeStep': 0.03,
            'softening': 0.5,
            'theta': 0.7
        }
    }


SCENES = {
    'plummer': create_plummer_sphere,
    'collision': create_galaxy_collision,
    'three_body': create_three_body,
    'solar': create_solar_system,
    'uniform': create_uniform_sphere,
    'large_plummer': lambda: create_plummer_sphere(n=10000),
    'large_collision': lambda: create_galaxy_collision(n=10000),
}


def get_scene_list() -> List[Dict[str, Any]]:
    return [
        {'id': 'plummer', 'name': 'Plummer 球', 'description': '球状星团的经典模型', 'bodyCount': 1000},
        {'id': 'collision', 'name': '星系碰撞', 'description': '两个旋转星系的碰撞', 'bodyCount': 2000},
        {'id': 'three_body', 'name': '三体问题', 'description': '经典混沌系统', 'bodyCount': 3},
        {'id': 'solar', 'name': '简化太阳系', 'description': '简单轨道系统', 'bodyCount': 5},
        {'id': 'uniform', 'name': '均匀球体坍缩', 'description': '冷球体引力坍缩', 'bodyCount': 500},
        {'id': 'large_plummer', 'name': '大 Plummer 球', 'description': '10000 星体压力测试', 'bodyCount': 10000},
        {'id': 'large_collision', 'name': '大星系碰撞', 'description': '10000 星系碰撞压力测试', 'bodyCount': 10000},
    ]


def load_scene(scene_id: str, **kwargs) -> Dict[str, Any]:
    if scene_id not in SCENES:
        raise ValueError(f"Unknown scene: {scene_id}")
    return SCENES[scene_id](**kwargs)
