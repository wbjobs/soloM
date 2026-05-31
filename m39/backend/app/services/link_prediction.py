from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

from app.database import neo4j_conn


@dataclass
class PredictionResult:
    source_id: str
    target_id: str
    score: float
    algorithms: Dict[str, float]
    combined_score: float
    explanation: str
    predicted_relationship: str
    confidence: str


class LinkPredictor:
    def __init__(self):
        self._graph_cache: Optional[Dict[str, Set[str]]] = None
        self._node_index: Optional[Dict[str, int]] = None
        self._adj_matrix: Optional[np.ndarray] = None
        self._node_embeddings: Optional[np.ndarray] = None
        self._last_cache_update = 0.0

    def _build_graph(self, max_nodes: int = 10000) -> Dict[str, Set[str]]:
        import time

        if self._graph_cache and (time.time() - self._last_cache_update) < 300:
            return self._graph_cache

        query = """
        MATCH (n)-[r]->(m)
        RETURN n.name AS source, m.name AS target
        LIMIT $max_edges
        """
        records = neo4j_conn.execute_query(query, {"max_edges": max_nodes * 10})

        graph: Dict[str, Set[str]] = {}
        for record in records:
            source = record["source"]
            target = record["target"]
            if source not in graph:
                graph[source] = set()
            if target not in graph:
                graph[target] = set()
            graph[source].add(target)
            graph[target].add(source)

        self._graph_cache = graph
        self._last_cache_update = time.time()
        self._node_index = None
        self._adj_matrix = None
        self._node_embeddings = None

        return graph

    def _build_adjacency_matrix(self) -> Tuple[Dict[str, int], np.ndarray]:
        if self._node_index and self._adj_matrix is not None:
            return self._node_index, self._adj_matrix

        graph = self._build_graph()
        nodes = list(graph.keys())
        node_index = {node: i for i, node in enumerate(nodes)}
        n = len(nodes)

        adj_matrix = np.zeros((n, n), dtype=np.float32)
        for i, node in enumerate(nodes):
            for neighbor in graph.get(node, set()):
                if neighbor in node_index:
                    j = node_index[neighbor]
                    adj_matrix[i, j] = 1.0

        self._node_index = node_index
        self._adj_matrix = adj_matrix
        return node_index, adj_matrix

    def _compute_node_embeddings(self, embedding_dim: int = 64) -> Tuple[Dict[str, int], np.ndarray]:
        if self._node_index and self._node_embeddings is not None:
            return self._node_index, self._node_embeddings

        node_index, adj_matrix = self._build_adjacency_matrix()
        n = adj_matrix.shape[0]

        if n == 0:
            return node_index, np.zeros((0, embedding_dim), dtype=np.float32)

        degree_matrix = np.diag(adj_matrix.sum(axis=1).flatten() + 1e-8)
        degree_inv_sqrt = np.diag(1.0 / np.sqrt(degree_matrix.diagonal()))

        normalized_adj = degree_inv_sqrt @ adj_matrix @ degree_inv_sqrt

        identity = np.eye(n, dtype=np.float32)
        prop_matrix = 0.5 * (identity + normalized_adj)

        np.random.seed(42)
        initial_embeddings = np.random.randn(n, embedding_dim).astype(np.float32) * 0.1

        embeddings = initial_embeddings.copy()
        for _ in range(3):
            embeddings = prop_matrix @ embeddings
            embeddings = np.tanh(embeddings)

        embeddings = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8)

        self._node_embeddings = embeddings
        return node_index, embeddings

    def common_neighbors(self, source: str, target: str) -> float:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return 0.0
        neighbors_s = graph[source]
        neighbors_t = graph[target]
        common = neighbors_s & neighbors_t
        return len(common)

    def jaccard_coefficient(self, source: str, target: str) -> float:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return 0.0
        neighbors_s = graph[source]
        neighbors_t = graph[target]
        if not neighbors_s and not neighbors_t:
            return 0.0
        intersection = len(neighbors_s & neighbors_t)
        union = len(neighbors_s | neighbors_t)
        return intersection / union if union > 0 else 0.0

    def adamic_adar_index(self, source: str, target: str) -> float:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return 0.0
        neighbors_s = graph[source]
        neighbors_t = graph[target]
        common = neighbors_s & neighbors_t
        score = 0.0
        for z in common:
            degree = len(graph.get(z, set()))
            if degree > 1:
                import math
                score += 1.0 / math.log(degree)
        return score

    def resource_allocation(self, source: str, target: str) -> float:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return 0.0
        neighbors_s = graph[source]
        neighbors_t = graph[target]
        common = neighbors_s & neighbors_t
        score = 0.0
        for z in common:
            degree = len(graph.get(z, set()))
            if degree > 0:
                score += 1.0 / degree
        return score

    def preferential_attachment(self, source: str, target: str) -> float:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return 0.0
        degree_s = len(graph[source])
        degree_t = len(graph[target])
        raw_score = degree_s * degree_t
        max_possible = 10000 * 10000
        return min(raw_score / max_possible, 1.0)

    def embedding_similarity(self, source: str, target: str) -> float:
        node_index, embeddings = self._compute_node_embeddings()
        if source not in node_index or target not in node_index:
            return 0.0
        i = node_index[source]
        j = node_index[target]
        embedding_dim = embeddings.shape[1]
        sim = float(np.dot(embeddings[i], embeddings[j]))
        sim = (sim + 1) / 2
        return sim

    def _get_shortest_path_features(self, source: str, target: str) -> Dict[str, float]:
        graph = self._build_graph()
        if source not in graph or target not in graph:
            return {"distance": -1.0, "path_exists": 0.0}

        from collections import deque

        visited = {source: 0}
        queue = deque([source])
        found = False

        while queue and not found:
            current = queue.popleft()
            current_dist = visited[current]
            if current_dist >= 5:
                break
            for neighbor in graph.get(current, set()):
                if neighbor == target:
                    visited[target] = current_dist + 1
                    found = True
                    break
                if neighbor not in visited:
                    visited[neighbor] = current_dist + 1
                    queue.append(neighbor)

        if target in visited:
            return {
                "distance": float(visited[target]),
                "path_exists": 1.0,
                "distance_score": max(0, 1.0 - visited[target] / 5.0),
            }
        return {"distance": -1.0, "path_exists": 0.0, "distance_score": 0.0}

    def predict_link(
        self,
        source: str,
        target: str,
        existing_relationships: Optional[List[str]] = None,
    ) -> PredictionResult:
        algorithms = {}

        algorithms["common_neighbors"] = self.common_neighbors(source, target)
        algorithms["jaccard"] = self.jaccard_coefficient(source, target)
        algorithms["adamic_adar"] = self.adamic_adar_index(source, target)
        algorithms["resource_allocation"] = self.resource_allocation(source, target)
        algorithms["preferential_attachment"] = self.preferential_attachment(source, target)
        algorithms["embedding_similarity"] = self.embedding_similarity(source, target)

        path_features = self._get_shortest_path_features(source, target)
        algorithms["path_distance_score"] = path_features["distance_score"]

        weights = {
            "resource_allocation": 0.25,
            "adamic_adar": 0.20,
            "embedding_similarity": 0.20,
            "jaccard": 0.15,
            "common_neighbors": 0.10,
            "preferential_attachment": 0.05,
            "path_distance_score": 0.05,
        }

        combined_score = 0.0
        for algo, weight in weights.items():
            score = algorithms.get(algo, 0.0)
            if algo in ["common_neighbors"]:
                score = min(score / 20.0, 1.0)
            combined_score += score * weight

        combined_score = min(max(combined_score, 0.0), 1.0)

        graph = self._build_graph()
        is_connected = target in graph.get(source, set())

        explanation = self._generate_explanation(
            source, target, algorithms, combined_score, is_connected
        )

        predicted_relationship = self._predict_relationship_type(
            source, target, existing_relationships
        )

        if combined_score >= 0.7:
            confidence = "high"
        elif combined_score >= 0.4:
            confidence = "medium"
        else:
            confidence = "low"

        return PredictionResult(
            source_id=source,
            target_id=target,
            score=combined_score,
            algorithms=algorithms,
            combined_score=combined_score,
            explanation=explanation,
            predicted_relationship=predicted_relationship,
            confidence=confidence,
        )

    def _generate_explanation(
        self,
        source: str,
        target: str,
        algorithms: Dict[str, float],
        score: float,
        is_connected: bool,
    ) -> str:
        parts = []

        if is_connected:
            parts.append(f"⚠️ {source} 与 {target} 之间已存在直接连接，预测针对潜在的附加攻击链路")

        cn = algorithms.get("common_neighbors", 0)
        if cn > 0:
            parts.append(f"共同邻居数: {int(cn)} 个")

        ra = algorithms.get("resource_allocation", 0)
        if ra > 0.1:
            parts.append(f"资源分配指数较高 (RA={ra:.3f})，表明通过共同邻居可能存在信息传播路径")

        emb = algorithms.get("embedding_similarity", 0)
        if emb > 0.6:
            parts.append(f"图嵌入相似度较高 (Emb={emb:.3f})，节点在图谱结构中具有相似的邻域模式")

        path_dist = algorithms.get("path_distance_score", 0)
        if path_dist > 0.5:
            parts.append("节点在图谱中距离较近，可能存在未发现的关联")

        pa = algorithms.get("preferential_attachment", 0)
        if pa > 0.5:
            parts.append("节点活跃度较高，可能属于同一攻击基础设施")

        if score >= 0.7:
            parts.append(f"综合评分 {score:.3f}，存在高概率潜在攻击链路，建议重点关注")
        elif score >= 0.4:
            parts.append(f"综合评分 {score:.3f}，存在中等概率潜在关联，建议进一步调查")
        else:
            parts.append(f"综合评分 {score:.3f}，当前证据不足以支持存在强关联")

        return "；".join(parts)

    def _predict_relationship_type(
        self,
        source: str,
        target: str,
        existing_relationships: Optional[List[str]] = None,
    ) -> str:
        if existing_relationships and len(existing_relationships) > 0:
            from collections import Counter

            counts = Counter(existing_relationships)
            return counts.most_common(1)[0][0]

        graph = self._build_graph()
        source_neighbors = graph.get(source, set())
        target_neighbors = graph.get(target, set())

        common = source_neighbors & target_neighbors

        if not common:
            return "RELATED_TO"

        neighbor_relationships: List[str] = []

        for neighbor in list(common)[:10]:
            query = """
            MATCH (s {name: $source})-[r]->(n {name: $neighbor})
            RETURN type(r) AS type
            """
            records = neo4j_conn.execute_query(query, {"source": source, "neighbor": neighbor})
            for r in records:
                neighbor_relationships.append(r["type"])

        if not neighbor_relationships:
            return "RELATED_TO"

        from collections import Counter

        counts = Counter(neighbor_relationships)
        predicted = counts.most_common(1)[0][0]

        relationship_map = {
            "RESOLVES_TO": "RELATED_TO",
            "COMMUNICATES_WITH": "RELATED_TO",
            "HOSTS": "DOWNLOADS",
            "DOWNLOADS": "HOSTS",
            "EXPLOITS": "RELATED_TO",
        }

        return relationship_map.get(predicted, "RELATED_TO")

    def predict_potential_threats(
        self,
        center_node: str,
        max_depth: int = 3,
        top_k: int = 20,
        min_score: float = 0.3,
    ) -> Tuple[List[PredictionResult], int]:
        graph = self._build_graph()
        if center_node not in graph:
            return [], 0

        visited = {center_node}
        current_level = {center_node}
        candidate_nodes: Set[str] = set()

        for depth in range(max_depth):
            next_level = set()
            for node in current_level:
                for neighbor in graph.get(node, set()):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        next_level.add(neighbor)
                        if depth >= 1:
                            candidate_nodes.add(neighbor)
            current_level = next_level
            if not current_level:
                break

        candidate_nodes = candidate_nodes - graph.get(center_node, set())
        candidate_nodes = candidate_nodes - {center_node}
        total_candidates = len(candidate_nodes)

        if not candidate_nodes:
            return [], 0

        predictions: List[PredictionResult] = []
        for candidate in list(candidate_nodes)[:200]:
            pred = self.predict_link(center_node, candidate)
            if pred.combined_score >= min_score:
                predictions.append(pred)

        predictions.sort(key=lambda x: x.combined_score, reverse=True)
        return predictions[:top_k], total_candidates

    def batch_predict_links(
        self,
        pairs: List[Tuple[str, str]],
        min_score: float = 0.0,
    ) -> List[PredictionResult]:
        results = []
        for source, target in pairs:
            pred = self.predict_link(source, target)
            if pred.combined_score >= min_score:
                results.append(pred)
        results.sort(key=lambda x: x.combined_score, reverse=True)
        return results

    def clear_cache(self):
        self._graph_cache = None
        self._node_index = None
        self._adj_matrix = None
        self._node_embeddings = None
        self._last_cache_update = 0.0


_link_predictor = LinkPredictor()


def get_link_predictor() -> LinkPredictor:
    return _link_predictor
