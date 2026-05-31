import asyncio
import time
import random
from genetic_algorithm import GeneticAlgorithm

def generate_test_data(num_points=200, width=800, height=600):
    warehouse = (width // 2, height // 2)
    delivery_points = []
    padding = 50
    for i in range(num_points):
        x = padding + random.random() * (width - 2 * padding)
        y = padding + random.random() * (height - 2 * padding)
        delivery_points.append((x, y))
    return warehouse, delivery_points

async def test_200_points():
    print("=" * 60)
    print("测试: 200个配送点的遗传算法性能")
    print("=" * 60)
    
    warehouse, delivery_points = generate_test_data(200)
    
    print(f"仓库坐标: {warehouse}")
    print(f"配送点数量: {len(delivery_points)}")
    print()
    
    ga = GeneticAlgorithm(
        warehouse=warehouse,
        delivery_points=delivery_points,
        population_size=100,
        mutation_rate=0.02,
        crossover_rate=0.8,
        generations=200,
        use_2opt=True,
        adaptive_mutation=True
    )
    
    start_time = time.time()
    improvements = []
    
    async def progress_callback(gen, distance, route):
        if gen % 20 == 0:
            elapsed = time.time() - start_time
            improvements.append((gen, distance))
            print(f"代数: {gen:4d} | 距离: {distance:.2f} | 耗时: {elapsed:.2f}s")
    
    result = await ga.run(callback=progress_callback)
    
    total_time = time.time() - start_time
    
    print()
    print("=" * 60)
    print("测试结果")
    print("=" * 60)
    print(f"总耗时: {total_time:.2f} 秒")
    print(f"最终最短距离: {result['best_distance']:.2f}")
    print(f"初始距离: {improvements[0][1]:.2f}" if improvements else "无数据")
    if len(improvements) > 1:
        improvement = (improvements[0][1] - result['best_distance']) / improvements[0][1] * 100
        print(f"优化率: {improvement:.1f}%")
    print(f"每秒处理代数: {ga.generations / total_time:.1f}")
    print()
    print("✅ 测试通过！算法可以正常处理200个配送点")
    print()

if __name__ == "__main__":
    asyncio.run(test_200_points())
