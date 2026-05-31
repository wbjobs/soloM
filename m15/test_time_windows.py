import asyncio
import time
import random
from genetic_algorithm import GeneticAlgorithm

def generate_test_data(num_points=50, width=800, height=500):
    warehouse = (width // 2, height // 2)
    delivery_points = []
    padding = 50
    
    avg_distance = (width + height) / 4
    total_estimated_time = avg_distance * num_points / 50
    
    for i in range(num_points):
        x = padding + random.random() * (width - 2 * padding)
        y = padding + random.random() * (height - 2 * padding)
        
        earliest_base = (i / num_points) * total_estimated_time * 0.8
        window_size = (total_estimated_time / num_points) * 5
        
        earliest = max(0, earliest_base - window_size * 0.3)
        latest = earliest + window_size
        
        delivery_points.append({
            'x': x,
            'y': y,
            'earliest_time': float(earliest),
            'latest_time': float(latest)
        })
    
    return warehouse, delivery_points

async def test_time_windows():
    print("=" * 70)
    print("测试: 带时间窗约束的遗传算法 (VRPTW)")
    print("=" * 70)
    
    warehouse, delivery_points = generate_test_data(50)
    
    print(f"仓库坐标: {warehouse}")
    print(f"配送点数量: {len(delivery_points)}")
    print()
    
    print("前5个配送点的时间窗:")
    for i, p in enumerate(delivery_points[:5]):
        print(f"  点#{i}: 坐标({p['x']:.1f}, {p['y']:.1f}), "
              f"时间窗 [{p['earliest_time']:.1f}, {p['latest_time']:.1f}]")
    print()
    
    ga = GeneticAlgorithm(
        warehouse=warehouse,
        delivery_points=delivery_points,
        population_size=80,
        mutation_rate=0.02,
        crossover_rate=0.8,
        generations=100,
        use_2opt=True,
        adaptive_mutation=True,
        speed=1.0,
        penalty_multiplier=1000.0
    )
    
    start_time = time.time()
    
    async def progress_callback(gen, progress_data):
        if gen % 20 == 0:
            elapsed = time.time() - start_time
            print(f"代数: {gen:3d} | 距离: {progress_data['distance']:.1f} | "
                  f"惩罚: {progress_data['penalty']:.1f} | "
                  f"超时点: {progress_data['overdue_count']:2d} | "
                  f"耗时: {elapsed:.1f}s")
    
    result = await ga.run(callback=progress_callback)
    
    total_time = time.time() - start_time
    
    print()
    print("=" * 70)
    print("最终结果")
    print("=" * 70)
    print(f"总耗时: {total_time:.2f} 秒")
    print(f"路径距离: {result['best_distance']:.2f}")
    print(f"时间惩罚: {result['penalty']:.2f}")
    print(f"总成本: {result['total_cost']:.2f}")
    print(f"超时配送点数量: {result['overdue_count']}/{len(delivery_points)}")
    
    if result['overdue_count'] > 0:
        print("\n超时点详情:")
        for point_idx in result['overdue_points'][:10]:
            info = result['point_info'][point_idx]
            print(f"  点#{point_idx}: 到达={info['arrival_time']:.1f}, "
                  f"时间窗=[{info['earliest_time']:.1f}, {info['latest_time']:.1f}], "
                  f"超时={info['overdue_amount']:.1f}")
    
    print()
    print("✅ 时间窗约束测试完成！")
    print("   算法成功计算了到达时间、等待时间和超时惩罚。")
    print()

if __name__ == "__main__":
    asyncio.run(test_time_windows())
