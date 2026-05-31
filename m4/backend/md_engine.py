import numpy as np


class MDEngine:
    def __init__(self, num_particles=64, temperature=1.0, density=0.8,
                 epsilon=1.0, sigma=1.0, dt=0.005, r_cutoff=None,
                 steps_per_frame=10, rdf_bins=100, rdf_r_max=None):
        self.num_particles = num_particles
        self.temperature = temperature
        self.density = density
        self.epsilon = epsilon
        self.sigma = sigma
        self.dt = dt
        self.r_cutoff = r_cutoff if r_cutoff is not None else 2.5 * sigma
        self.steps_per_frame = steps_per_frame
        self.rdf_bins = rdf_bins
        self.rdf_r_max = rdf_r_max if rdf_r_max is not None else self.L / 2.0
        self.L = np.sqrt(num_particles / density)
        self.rdf_r_max = rdf_r_max if rdf_r_max is not None else self.L / 2.0
        self.positions = np.zeros((num_particles, 2))
        self.velocities = np.zeros((num_particles, 2))
        self.forces = np.zeros((num_particles, 2))
        self.potential_energy = 0.0
        self.virial = 0.0
        self.step_count = 0
        self.rdf_accumulator = np.zeros(rdf_bins)
        self.rdf_sample_count = 0

    def initialize(self):
        n_side = int(np.ceil(np.sqrt(self.num_particles)))
        spacing = self.L / n_side
        idx = 0
        for i in range(n_side):
            for j in range(n_side):
                if idx >= self.num_particles:
                    break
                self.positions[idx] = [
                    (i + 0.5) * spacing,
                    (j + 0.5) * spacing
                ]
                idx += 1
            if idx >= self.num_particles:
                break

        self.velocities = np.random.normal(
            0.0, np.sqrt(self.temperature), (self.num_particles, 2)
        )
        com_velocity = np.mean(self.velocities, axis=0)
        self.velocities -= com_velocity
        current_temp = self.compute_temperature()
        if current_temp > 0:
            self.velocities *= np.sqrt(self.temperature / current_temp)

        self.forces[:] = 0.0
        self.compute_forces()
        self.step_count = 0
        self.rdf_accumulator = np.zeros(self.rdf_bins)
        self.rdf_sample_count = 0

    def compute_forces(self):
        self.forces[:] = 0.0
        self.potential_energy = 0.0
        self.virial = 0.0

        num_cells = max(1, int(self.L / self.r_cutoff))
        cell_size = self.L / num_cells

        ci = (np.floor(self.positions[:, 0] / cell_size).astype(int)) % num_cells
        cj = (np.floor(self.positions[:, 1] / cell_size).astype(int)) % num_cells

        cells = {}
        for idx in range(self.num_particles):
            key = (ci[idx], cj[idx])
            if key not in cells:
                cells[key] = []
            cells[key].append(idx)

        pairs_i = []
        pairs_j = []

        for (cx, cy), particles in cells.items():
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    nx = (cx + dx) % num_cells
                    ny = (cy + dy) % num_cells
                    neighbor_key = (nx, ny)
                    if neighbor_key not in cells:
                        continue
                    neighbors = cells[neighbor_key]
                    for i in particles:
                        for j in neighbors:
                            if i < j:
                                pairs_i.append(i)
                                pairs_j.append(j)

        if not pairs_i:
            return

        pi_arr = np.array(pairs_i, dtype=np.intp)
        pj_arr = np.array(pairs_j, dtype=np.intp)

        dr = self.positions[pj_arr] - self.positions[pi_arr]
        dr -= self.L * np.round(dr / self.L)
        r2 = np.sum(dr ** 2, axis=1)

        mask = r2 < self.r_cutoff ** 2
        dr = dr[mask]
        r2 = r2[mask]
        pi_arr = pi_arr[mask]
        pj_arr = pj_arr[mask]

        if len(r2) == 0:
            return

        r2i = self.sigma ** 2 / r2
        r6i = r2i ** 3
        r12i = r6i ** 2

        f_over_r = 24.0 * self.epsilon * (2.0 * r12i - r6i) / r2

        self.potential_energy = float(np.sum(4.0 * self.epsilon * (r12i - r6i)))
        self.virial = float(np.sum(f_over_r * r2))

        force_vec = f_over_r[:, np.newaxis] * dr

        np.add.at(self.forces, pi_arr, -force_vec)
        np.add.at(self.forces, pj_arr, force_vec)

    def step(self):
        self.velocities += 0.5 * self.dt * self.forces
        self.positions += self.dt * self.velocities
        self.positions %= self.L
        self.compute_forces()
        self.velocities += 0.5 * self.dt * self.forces
        self.step_count += 1

    def compute_kinetic_energy(self):
        return 0.5 * float(np.sum(self.velocities ** 2))

    def compute_temperature(self):
        ke = self.compute_kinetic_energy()
        return ke / self.num_particles

    def sample_rdf(self):
        dr = self.rdf_r_max / self.rdf_bins
        hist = np.zeros(self.rdf_bins)

        for i in range(self.num_particles):
            dx = self.positions[i + 1:, 0] - self.positions[i, 0]
            dy = self.positions[i + 1:, 1] - self.positions[i, 1]
            dx -= self.L * np.round(dx / self.L)
            dy -= self.L * np.round(dy / self.L)
            r = np.sqrt(dx ** 2 + dy ** 2)

            bin_idx = (r / dr).astype(int)
            valid = bin_idx < self.rdf_bins
            np.add.at(hist, bin_idx[valid], 1)

        self.rdf_accumulator += hist
        self.rdf_sample_count += 1

    def get_rdf(self):
        if self.rdf_sample_count == 0:
            r_values = np.linspace(0, self.rdf_r_max, self.rdf_bins)
            return {
                "r": r_values.tolist(),
                "g_r": [0.0] * self.rdf_bins,
                "sample_count": 0
            }

        dr = self.rdf_r_max / self.rdf_bins
        r_values = (np.arange(self.rdf_bins) + 0.5) * dr
        avg_hist = self.rdf_accumulator / self.rdf_sample_count

        shell_area = 2.0 * np.pi * r_values * dr
        ideal_count = self.density * shell_area
        g_r = np.where(ideal_count > 0, avg_hist / (ideal_count * self.num_particles), 0.0)

        return {
            "r": r_values.tolist(),
            "g_r": g_r.tolist(),
            "sample_count": self.rdf_sample_count
        }

    def get_frame_data(self):
        ke = self.compute_kinetic_energy()
        pe = self.potential_energy
        temp = ke / self.num_particles
        area = self.L ** 2
        pressure = (self.num_particles * temp + 0.5 * self.virial) / area

        self.sample_rdf()
        rdf = self.get_rdf()

        return {
            "step": self.step_count,
            "time": self.step_count * self.dt,
            "positions": self.positions.tolist(),
            "velocities": self.velocities.tolist(),
            "kinetic_energy": ke,
            "potential_energy": pe,
            "total_energy": ke + pe,
            "temperature": temp,
            "pressure": pressure,
            "rdf": rdf,
        }
