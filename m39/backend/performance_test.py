import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from app.services import graph_service


def run_performance_test():
    print("=" * 60)
    print("性能测试 - Cypher 查询优化对比")
    print("=" * 60)

    test_ip = "185.220.101.34"
    test_depths = [1, 2, 3]

    for depth in test_depths:
        print(f"\n--- 查询深度: {depth} 度 ---")

        graph_service.clear_cache()

        start_time = time.time()
        result = graph_service.query_graph_by_ip(
            test_ip,
            max_depth=depth,
            use_cache=False,
        )
        first_query_time = (time.time() - start_time) * 1000

        node_count = len(result.nodes)
        rel_count = len(result.relationships)

        print(f"首次查询: {first_query_time:.2f} ms")
        print(f"返回节点: {node_count}")
        print(f"返回关系: {rel_count}")

        start_time = time.time()
        cached_result = graph_service.query_graph_by_ip(
            test_ip,
            max_depth=depth,
            use_cache=True,
        )
        cached_query_time = (time.time() - start_time) * 1000

        print(f"缓存查询: {cached_query_time:.2f} ms")
        if first_query_time > 0:
            speedup = first_query_time / cached_query_time
            print(f"性能提升: {speedup:.1f}x")

        max_nodes = min(500, node_count)
        start_time = time.time()
        limited_result = graph_service.query_graph_by_ip(
            test_ip,
            max_depth=depth,
            max_nodes=max_nodes,
            max_relationships=max_nodes * 2,
            use_cache=False,
        )
        limited_time = (time.time() - start_time) * 1000

        print(f"\n限制节点数 ({max_nodes}): {limited_time:.2f} ms")
        print(f"实际返回节点: {len(limited_result.nodes)}")
        print(f"实际返回关系: {len(limited_result.relationships)}")

    print("\n" + "=" * 60)
    print("缓存统计")
    print("=" * 60)
    cache_stats = graph_service.get_cache_stats()
    print(f"缓存条目: {cache_stats['cache_size']}")
    print(f"缓存TTL: {cache_stats['cache_ttl_seconds']} 秒")

    print("\n测试完成!")


if __name__ == "__main__":
    run_performance_test()
