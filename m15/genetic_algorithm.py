import numpy as np
import random
import math
from typing import List, Tuple, Callable, Dict, Any


class GeneticAlgorithm:
    def __init__(
        self,
        warehouse: Tuple[float, float],
        delivery_points: List[Dict[str, Any]],
        population_size: int = 100,
        mutation_rate: float = 0.02,
        crossover_rate: float = 0.8,
        generations: int = 500,
        elite_size: int = 20,
        use_2opt: bool = True,
        adaptive_mutation: bool = True,
        speed: float = 1.0,
        penalty_multiplier: float = 1000.0
    ):
        self.warehouse = warehouse
        self.delivery_points = delivery_points
        self.num_points = len(delivery_points)
        self.population_size = population_size
        self.initial_mutation_rate = mutation_rate
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.generations = generations
        self.elite_size = elite_size
        self.use_2opt = use_2opt
        self.adaptive_mutation = adaptive_mutation
        self.speed = speed
        self.penalty_multiplier = penalty_multiplier
        
        self.coords = [(p['x'], p['y']) for p in delivery_points]
        self.earliest_times = [p.get('earliest_time', 0) for p in delivery_points]
        self.latest_times = [p.get('latest_time', float('inf')) for p in delivery_points]
        
        self.all_coords = [warehouse] + self.coords
        self.distance_matrix = self._calculate_distance_matrix()
        
        self.best_distance_history = []
        self.no_improve_count = 0
        self.best_cost_ever = float('inf')
        
    def _calculate_distance_matrix(self) -> np.ndarray:
        points = np.array(self.all_coords)
        diff = points[:, np.newaxis] - points
        return np.sqrt((diff ** 2).sum(axis=2))
    
    def _calculate_arrival_times(self, route: List[int]) -> Tuple[List[float], List[float]]:
        arrival_times = []
        wait_times = []
        current_time = 0.0
        current_pos = 0
        
        for point_idx in route:
            distance = self.distance_matrix[current_pos][point_idx + 1]
            travel_time = distance / self.speed
            arrival_time = current_time + travel_time
            
            earliest = self.earliest_times[point_idx]
            wait_time = max(0, earliest - arrival_time)
            arrival_time += wait_time
            
            arrival_times.append(arrival_time)
            wait_times.append(wait_time)
            
            current_time = arrival_time
            current_pos = point_idx + 1
        
        return arrival_times, wait_times
    
    def _calculate_time_penalty(self, route: List[int], arrival_times: List[float]) -> Tuple[float, List[int]]:
        total_penalty = 0.0
        overdue_points = []
        
        for i, point_idx in enumerate(route):
            latest = self.latest_times[point_idx]
            arrival = arrival_times[i]
            
            if arrival > latest:
                overdue = arrival - latest
                total_penalty += overdue * self.penalty_multiplier
                overdue_points.append(point_idx)
        
        return total_penalty, overdue_points
    
    def _calculate_route_distance(self, route: List[int]) -> float:
        if not route:
            return float('inf')
        distance = self.distance_matrix[0][route[0] + 1]
        for i in range(len(route) - 1):
            distance += self.distance_matrix[route[i] + 1][route[i + 1] + 1]
        distance += self.distance_matrix[route[-1] + 1][0]
        return float(distance)
    
    def _calculate_total_cost(self, route: List[int]) -> Tuple[float, float, List[float], List[int]]:
        distance = self._calculate_route_distance(route)
        arrival_times, _ = self._calculate_arrival_times(route)
        penalty, overdue_points = self._calculate_time_penalty(route, arrival_times)
        total_cost = distance + penalty
        return total_cost, distance, arrival_times, overdue_points
    
    def _fitness(self, route: List[int]) -> float:
        total_cost, _, _, _ = self._calculate_total_cost(route)
        return 1.0 / (total_cost + 1e-10)
    
    def _nearest_neighbor_route(self, start_idx: int = 0) -> List[int]:
        unvisited = list(range(self.num_points))
        if start_idx >= self.num_points:
            start_idx = 0
        route = [unvisited.pop(start_idx)]
        
        while unvisited:
            last = route[-1]
            next_idx = min(unvisited, 
                          key=lambda x: self.distance_matrix[last + 1][x + 1])
            route.append(next_idx)
            unvisited.remove(next_idx)
        return route
    
    def _time_window_aware_route(self) -> List[int]:
        unvisited = list(range(self.num_points))
        current_time = 0.0
        current_pos = 0
        route = []
        
        while unvisited:
            def cost(idx):
                distance = self.distance_matrix[current_pos][idx + 1]
                arrival_time = current_time + distance / self.speed
                earliest = self.earliest_times[idx]
                latest = self.latest_times[idx]
                
                wait_time = max(0, earliest - arrival_time)
                overdue = max(0, arrival_time - latest)
                
                return distance + overdue * 100 + wait_time * 0.1
            
            next_idx = min(unvisited, key=cost)
            route.append(next_idx)
            unvisited.remove(next_idx)
            
            distance = self.distance_matrix[current_pos][next_idx + 1]
            arrival_time = current_time + distance / self.speed
            current_time = max(arrival_time, self.earliest_times[next_idx])
            current_pos = next_idx + 1
        
        return route
    
    def _create_route(self) -> List[int]:
        r = random.random()
        if r < 0.3:
            return self._nearest_neighbor_route(random.randint(0, self.num_points - 1))
        elif r < 0.6:
            return self._time_window_aware_route()
        route = list(range(self.num_points))
        random.shuffle(route)
        return route
    
    def _initial_population(self) -> List[List[int]]:
        population = []
        for i in range(min(5, self.population_size)):
            population.append(self._nearest_neighbor_route(i))
        for i in range(min(5, self.population_size - len(population))):
            population.append(self._time_window_aware_route())
        while len(population) < self.population_size:
            population.append(self._create_route())
        return population
    
    def _rank_routes(self, population: List[List[int]]) -> List[Tuple[int, float]]:
        results = [(i, self._fitness(population[i])) for i in range(len(population))]
        return sorted(results, key=lambda x: x[1], reverse=True)
    
    def _tournament_selection(self, ranked_pop: List[Tuple[int, float]], 
                               population: List[List[int]], 
                               tournament_size: int = 3) -> List[int]:
        tournament = random.sample(ranked_pop, tournament_size)
        tournament.sort(key=lambda x: x[1], reverse=True)
        return population[tournament[0][0]].copy()
    
    def _selection(self, ranked_pop: List[Tuple[int, float]], 
                   population: List[List[int]]) -> List[List[int]]:
        selection_results = []
        for i in range(self.elite_size):
            selection_results.append(population[ranked_pop[i][0]].copy())
        for _ in range(len(population) - self.elite_size):
            selection_results.append(self._tournament_selection(ranked_pop, population))
        return selection_results
    
    def _order_crossover(self, parent1: List[int], parent2: List[int]) -> List[int]:
        size = len(parent1)
        if size < 2:
            return parent1.copy()
        
        start, end = sorted(random.sample(range(size), 2))
        
        child = [-1] * size
        child[start:end] = parent1[start:end]
        
        fill_pos = end % size
        for gene in parent2:
            if gene not in child:
                while child[fill_pos] != -1:
                    fill_pos = (fill_pos + 1) % size
                child[fill_pos] = gene
                fill_pos = (fill_pos + 1) % size
        
        return child
    
    def _crossover(self, parent1: List[int], parent2: List[int]) -> List[int]:
        if random.random() > self.crossover_rate:
            return parent1.copy()
        return self._order_crossover(parent1, parent2)
    
    def _swap_mutation(self, individual: List[int]) -> List[int]:
        if len(individual) < 2:
            return individual
        i, j = random.sample(range(len(individual)), 2)
        individual[i], individual[j] = individual[j], individual[i]
        return individual
    
    def _inversion_mutation(self, individual: List[int]) -> List[int]:
        if len(individual) < 3:
            return individual
        start, end = sorted(random.sample(range(len(individual)), 2))
        individual[start:end] = reversed(individual[start:end])
        return individual
    
    def _insertion_mutation(self, individual: List[int]) -> List[int]:
        if len(individual) < 3:
            return individual
        idx = random.randint(0, len(individual) - 1)
        gene = individual.pop(idx)
        insert_pos = random.randint(0, len(individual) - 1)
        individual.insert(insert_pos, gene)
        return individual
    
    def _mutate(self, individual: List[int]) -> List[int]:
        if random.random() < self.mutation_rate:
            mutation_type = random.random()
            if mutation_type < 0.4:
                return self._swap_mutation(individual)
            elif mutation_type < 0.7:
                return self._inversion_mutation(individual)
            else:
                return self._insertion_mutation(individual)
        return individual
    
    def _two_opt_swap(self, route: List[int], i: int, k: int) -> List[int]:
        new_route = route[:i] + route[i:k+1][::-1] + route[k+1:]
        return new_route
    
    def _two_opt_fast(self, route: List[int], max_checks: int = 500) -> List[int]:
        if len(route) < 4:
            return route
        
        best_route = route.copy()
        best_cost, _, _, _ = self._calculate_total_cost(best_route)
        n = len(best_route)
        checks = 0
        
        indices = [(i, k) for i in range(n - 1) for k in range(i + 2, min(i + 30, n))]
        random.shuffle(indices)
        
        for i, k in indices[:max_checks]:
            checks += 1
            if checks > max_checks:
                break
            
            new_route = self._two_opt_swap(best_route, i, k)
            new_cost, _, _, _ = self._calculate_total_cost(new_route)
            
            if new_cost < best_cost:
                best_route = new_route
                best_cost = new_cost
                    
        return best_route
    
    def _two_opt(self, route: List[int], max_iterations: int = 20) -> List[int]:
        if len(route) < 4:
            return route
        
        if self.num_points > 100:
            return self._two_opt_fast(route, max_checks=200)
        
        best_route = route.copy()
        best_cost, _, _, _ = self._calculate_total_cost(best_route)
        improved = True
        iteration = 0
        
        while improved and iteration < max_iterations:
            improved = False
            iteration += 1
            
            for i in range(len(best_route) - 1):
                for k in range(i + 1, min(i + 50, len(best_route))):
                    new_route = self._two_opt_swap(best_route, i, k)
                    new_cost, _, _, _ = self._calculate_total_cost(new_route)
                    
                    if new_cost < best_cost:
                        best_route = new_route
                        best_cost = new_cost
                        improved = True
                        break
                if improved:
                    break
                    
        return best_route
    
    def _update_mutation_rate(self, current_best_cost: float):
        if not self.adaptive_mutation:
            return
        
        if current_best_cost < self.best_cost_ever:
            self.best_cost_ever = current_best_cost
            self.no_improve_count = 0
            self.mutation_rate = max(0.005, self.mutation_rate * 0.95)
        else:
            self.no_improve_count += 1
            if self.no_improve_count > 20:
                self.mutation_rate = min(0.2, self.mutation_rate * 1.1)
                self.no_improve_count = 0
    
    def _next_generation(self, current_gen: List[List[int]]) -> List[List[int]]:
        ranked_pop = self._rank_routes(current_gen)
        selection_results = self._selection(ranked_pop, current_gen)
        
        children = []
        two_opt_prob = 0.1 if self.num_points > 100 else 0.3
        for i in range(self.elite_size):
            elite_child = selection_results[i].copy()
            if self.use_2opt and random.random() < two_opt_prob:
                elite_child = self._two_opt(elite_child, max_iterations=15)
            children.append(elite_child)
        
        pool = random.sample(selection_results[self.elite_size:], 
                            len(selection_results) - self.elite_size)
        
        for i in range(0, len(pool), 2):
            if i + 1 < len(pool):
                parent1 = pool[i]
                parent2 = pool[i + 1]
                child1 = self._crossover(parent1, parent2)
                child1 = self._mutate(child1)
                children.append(child1)
                
                if len(children) < self.population_size:
                    child2 = self._crossover(parent2, parent1)
                    child2 = self._mutate(child2)
                    children.append(child2)
            else:
                child = self._mutate(pool[i].copy())
                children.append(child)
        
        while len(children) < self.population_size:
            children.append(self._create_route())
        
        return children[:self.population_size]
    
    def get_route_coordinates(self, route: List[int]) -> List[Tuple[float, float]]:
        coords = [self.warehouse]
        for idx in route:
            coords.append(self.coords[idx])
        coords.append(self.warehouse)
        return coords
    
    def get_route_info(self, route: List[int]) -> Dict[str, Any]:
        total_cost, distance, arrival_times, overdue_points = self._calculate_total_cost(route)
        penalty = total_cost - distance
        
        point_info = {}
        for i, point_idx in enumerate(route):
            point_info[point_idx] = {
                'arrival_time': arrival_times[i],
                'earliest_time': self.earliest_times[point_idx],
                'latest_time': self.latest_times[point_idx],
                'is_overdue': point_idx in overdue_points,
                'overdue_amount': max(0, arrival_times[i] - self.latest_times[point_idx])
            }
        
        return {
            'total_cost': total_cost,
            'distance': distance,
            'penalty': penalty,
            'overdue_count': len(overdue_points),
            'overdue_points': overdue_points,
            'point_info': point_info
        }
    
    async def run(self, callback: Callable[[int, Dict[str, Any]], None] = None):
        pop = self._initial_population()
        self.best_cost_ever = float('inf')
        self.no_improve_count = 0
        self.mutation_rate = self.initial_mutation_rate
        
        callback_interval = max(1, self.generations // 100)
        
        for gen in range(self.generations):
            pop = self._next_generation(pop)
            ranked = self._rank_routes(pop)
            best_idx = ranked[0][0]
            best_route = pop[best_idx]
            route_info = self.get_route_info(best_route)
            
            self._update_mutation_rate(route_info['total_cost'])
            
            if callback and (gen % callback_interval == 0 or gen == self.generations - 1):
                progress_data = {
                    'generation': gen,
                    'total_cost': route_info['total_cost'],
                    'distance': route_info['distance'],
                    'penalty': route_info['penalty'],
                    'overdue_count': route_info['overdue_count'],
                    'overdue_points': route_info['overdue_points'],
                    'point_info': route_info['point_info'],
                    'best_route': best_route,
                    'route_coordinates': self.get_route_coordinates(best_route)
                }
                await callback(gen, progress_data)
        
        final_ranked = self._rank_routes(pop)
        best_idx = final_ranked[0][0]
        best_route = pop[best_idx]
        
        if self.use_2opt:
            best_route = self._two_opt(best_route, max_iterations=100)
        
        route_info = self.get_route_info(best_route)
        
        return {
            "best_route": best_route,
            "best_distance": route_info['distance'],
            "total_cost": route_info['total_cost'],
            "penalty": route_info['penalty'],
            "overdue_count": route_info['overdue_count'],
            "overdue_points": route_info['overdue_points'],
            "point_info": route_info['point_info'],
            "route_coordinates": self.get_route_coordinates(best_route)
        }
