from app.database import neo4j_conn
from app.models import (
    GraphData,
    NodeType,
    RelationshipType,
    ThreatNode,
    ThreatRelationship,
)


LABEL_MAP = {
    "IP": NodeType.IP,
    "Domain": NodeType.DOMAIN,
    "Hash": NodeType.HASH,
    "CVE": NodeType.CVE,
}

MAX_NODES = 5000
MAX_RELATIONSHIPS = 10000
QUERY_TIMEOUT_MS = 30000

_query_cache: dict[str, tuple[float, GraphData]] = {}
CACHE_TTL_SECONDS = 300


def query_graph_by_ip(
    ip: str,
    max_depth: int = 2,
    max_nodes: int = MAX_NODES,
    max_relationships: int = MAX_RELATIONSHIPS,
    use_cache: bool = True,
) -> GraphData:
    cache_key = f"{ip}:{max_depth}:{max_nodes}:{max_relationships}"
    import time

    if use_cache and cache_key in _query_cache:
        cache_time, cached_data = _query_cache[cache_key]
        if time.time() - cache_time < CACHE_TTL_SECONDS:
            return cached_data

    result = _query_graph_bfs(ip, max_depth, max_nodes, max_relationships)

    if use_cache and result.nodes:
        _query_cache[cache_key] = (time.time(), result)

    return result


def _query_graph_bfs(
    ip: str, max_depth: int, max_nodes: int, max_relationships: int
) -> GraphData:
    bfs_query = """
    MATCH (center:IP {name: $ip})
    CALL apoc.path.expandConfig(center, {
        relationshipFilter: null,
        minLevel: 1,
        maxLevel: $max_depth,
        uniqueness: 'NODE_GLOBAL',
        limit: $max_nodes
    })
    YIELD path
    WITH DISTINCT nodes(path) AS pathNodes, relationships(path) AS pathRels
    UNWIND pathNodes AS n
    WITH DISTINCT n, pathRels
    WITH collect(DISTINCT n) AS all_nodes, collect(DISTINCT pathRels) AS rels_list
    UNWIND rels_list AS rels
    UNWIND rels AS r
    WITH all_nodes, collect(DISTINCT r) AS all_rels
    RETURN all_nodes, all_rels
    """

    fallback_query = """
    MATCH (center:IP {name: $ip})
    WITH center, [center] AS visited, 0 AS depth
    CALL {
        WITH center, visited, depth
        UNWIND range(1, $max_depth) AS current_depth
        CALL {
            WITH visited, current_depth
            MATCH (n)-[r]-(m)
            WHERE n IN visited AND NOT m IN visited
            WITH DISTINCT m, r
            LIMIT $max_nodes
            RETURN collect(DISTINCT m) AS new_nodes, collect(DISTINCT r) AS new_rels
        }
        WITH new_nodes, new_rels, current_depth
        WHERE size(new_nodes) > 0
        RETURN collect(DISTINCT new_nodes) AS layer_nodes, collect(DISTINCT new_rels) AS layer_rels
    }
    WITH center, layer_nodes, layer_rels
    UNWIND layer_nodes AS nodes_layer
    UNWIND nodes_layer AS n
    WITH center, collect(DISTINCT n) AS expanded_nodes, layer_rels
    WITH [center] + expanded_nodes AS all_nodes, layer_rels
    UNWIND layer_rels AS rels_layer
    UNWIND rels_layer AS r
    WITH all_nodes, collect(DISTINCT r) AS all_rels
    RETURN all_nodes, all_rels
    LIMIT $max_relationships
    """

    simple_query = """
    MATCH path = (center:IP {name: $ip})-[*1..%depth%]-(connected)
    WITH DISTINCT path
    WITH collect(nodes(path)) AS all_paths, collect(relationships(path)) AS all_path_rels
    WITH [n IN reduce(arr=[], p IN all_paths | arr + p) | DISTINCT n] AS unique_nodes,
         [r IN reduce(arr=[], p IN all_path_rels | arr + p) | DISTINCT r] AS unique_rels
    UNWIND unique_nodes AS n
    WITH collect(DISTINCT n) AS all_nodes, unique_rels
    UNWIND unique_rels AS r
    WITH all_nodes, collect(DISTINCT r) AS all_rels
    LIMIT $max_relationships
    RETURN all_nodes, all_rels
    """.replace(
        "%depth%", str(min(max_depth, 3))
    )

    query_to_use = None
    try:
        test_apoc = neo4j_conn.execute_query("RETURN apoc.version() AS version", {})
        if test_apoc and test_apoc[0].get("version"):
            query_to_use = bfs_query
        else:
            query_to_use = fallback_query
    except Exception:
        query_to_use = simple_query

    try:
        records = neo4j_conn.execute_query(
            query_to_use,
            {"ip": ip, "max_depth": max_depth, "max_nodes": max_nodes, "max_relationships": max_relationships},
        )
    except Exception:
        records = neo4j_conn.execute_query(
            simple_query,
            {"ip": ip, "max_nodes": max_nodes, "max_relationships": max_relationships},
        )

    if not records:
        center_query = "MATCH (n:IP {name: $ip}) RETURN n, labels(n) AS labels"
        center_records = neo4j_conn.execute_query(center_query, {"ip": ip})
        if center_records:
            raw_node = center_records[0]["n"]
            raw_labels = center_records[0]["labels"]
            primary_label = _get_primary_label(raw_labels)
            node_type = LABEL_MAP.get(primary_label, NodeType.IP)
            return GraphData(
                nodes=[
                    ThreatNode(
                        id=raw_node["name"],
                        label=node_type,
                        name=raw_node["name"],
                        properties={
                            k: v
                            for k, v in raw_node.items()
                            if k not in ("name", "labels")
                        },
                    )
                ],
                relationships=[],
            )
        return GraphData(nodes=[], relationships=[])

    record = records[0]
    raw_nodes = record.get("all_nodes", [])
    raw_rels = record.get("all_rels", [])

    node_names = set()
    nodes = []
    for raw_node in raw_nodes:
        labels = raw_node.get("labels", [])
        primary_label = _get_primary_label(labels)
        node_type = LABEL_MAP.get(primary_label, NodeType.IP)
        properties = {
            k: v for k, v in raw_node.items() if k not in ("name", "labels")
        }
        node_name = raw_node["name"]
        if node_name not in node_names:
            node_names.add(node_name)
            nodes.append(
                ThreatNode(
                    id=node_name,
                    label=node_type,
                    name=node_name,
                    properties=properties,
                )
            )

    relationships = []
    seen = set()
    for raw_rel in raw_rels:
        if isinstance(raw_rel, dict):
            source_name = raw_rel.get("source_name") or raw_rel.get("source", "")
            target_name = raw_rel.get("target_name") or raw_rel.get("target", "")
            rel_type = raw_rel.get("type", "")
        else:
            try:
                source_name = raw_rel[0]["name"] if hasattr(raw_rel, "__getitem__") else ""
                target_name = raw_rel[-1]["name"] if hasattr(raw_rel, "__getitem__") else ""
                rel_type = str(type(raw_rel).__name__)
            except Exception:
                continue

        try:
            if not source_name or not target_name:
                continue
            edge_key = (source_name, target_name, rel_type)
            if edge_key in seen:
                continue
            seen.add(edge_key)
            if source_name not in node_names or target_name not in node_names:
                continue
            relationships.append(
                ThreatRelationship(
                    source_id=source_name,
                    target_id=target_name,
                    type=RelationshipType(rel_type) if rel_type in RelationshipType.__members__ else RelationshipType.RELATED_TO,
                    properties={},
                )
            )
        except Exception:
            continue

    return GraphData(nodes=nodes, relationships=relationships)


def _get_primary_label(labels: list[str]) -> str:
    for label in labels:
        if label in LABEL_MAP:
            return label
    return labels[0] if labels else "IP"


def get_all_nodes(label: str | None = None, skip: int = 0, limit: int = 50) -> list[ThreatNode]:
    if label and label in LABEL_MAP:
        query = f"MATCH (n:{label}) RETURN n, labels(n) AS labels SKIP $skip LIMIT $limit"
    else:
        query = "MATCH (n) RETURN n, labels(n) AS labels SKIP $skip LIMIT $limit"
    records = neo4j_conn.execute_query(query, {"skip": skip, "limit": min(limit, 500)})
    nodes = []
    for record in records:
        raw_node = record["n"]
        raw_labels = record["labels"]
        primary_label = _get_primary_label(raw_labels)
        node_type = LABEL_MAP.get(primary_label, NodeType.IP)
        properties = {k: v for k, v in raw_node.items() if k not in ("name", "labels")}
        nodes.append(
            ThreatNode(
                id=raw_node["name"],
                label=node_type,
                name=raw_node["name"],
                properties=properties,
            )
        )
    return nodes


def create_node(label: str, name: str, properties: dict) -> ThreatNode:
    if properties:
        prop_str = ", ".join([f"{k}: ${k}" for k in properties.keys()])
        query = f"CREATE (n:{label} {{name: $name, {prop_str}}}) RETURN n, labels(n) AS labels"
        params = {"name": name, **properties}
    else:
        query = f"CREATE (n:{label} {{name: $name}}) RETURN n, labels(n) AS labels"
        params = {"name": name}

    records = neo4j_conn.execute_write(query, params)
    raw_node = records[0]["n"]
    raw_labels = records[0]["labels"]
    primary_label = _get_primary_label(raw_labels)
    node_type = LABEL_MAP.get(primary_label, NodeType.IP)
    return ThreatNode(
        id=raw_node["name"],
        label=node_type,
        name=raw_node["name"],
        properties={k: v for k, v in raw_node.items() if k not in ("name", "labels")},
    )


def update_node(node_id: str, name: str | None = None, properties: dict | None = None) -> ThreatNode | None:
    set_clauses = []
    params = {"node_id": node_id}
    if name is not None:
        set_clauses.append("n.name = $new_name")
        params["new_name"] = name
    if properties:
        for k, v in properties.items():
            set_clauses.append(f"n.{k} = ${k}")
            params[k] = v
    if not set_clauses:
        return get_node_by_id(node_id)

    set_str = ", ".join(set_clauses)
    query = f"MATCH (n) WHERE n.name = $node_id SET {set_str} RETURN n, labels(n) AS labels"
    records = neo4j_conn.execute_write(query, params)
    if not records:
        return None
    raw_node = records[0]["n"]
    raw_labels = records[0]["labels"]
    primary_label = _get_primary_label(raw_labels)
    node_type = LABEL_MAP.get(primary_label, NodeType.IP)
    return ThreatNode(
        id=raw_node["name"],
        label=node_type,
        name=raw_node["name"],
        properties={k: v for k, v in raw_node.items() if k not in ("name", "labels")},
    )


def delete_node(node_id: str) -> bool:
    query = "MATCH (n) WHERE n.name = $node_id DETACH DELETE n RETURN count(n) AS deleted"
    records = neo4j_conn.execute_write(query, {"node_id": node_id})
    return records[0]["deleted"] > 0 if records else False


def get_node_by_id(node_id: str) -> ThreatNode | None:
    query = "MATCH (n) WHERE n.name = $node_id RETURN n, labels(n) AS labels"
    records = neo4j_conn.execute_query(query, {"node_id": node_id})
    if not records:
        return None
    raw_node = records[0]["n"]
    raw_labels = records[0]["labels"]
    primary_label = _get_primary_label(raw_labels)
    node_type = LABEL_MAP.get(primary_label, NodeType.IP)
    return ThreatNode(
        id=raw_node["name"],
        label=node_type,
        name=raw_node["name"],
        properties={k: v for k, v in raw_node.items() if k not in ("name", "labels")},
    )


def create_relationship(
    source_id: str, target_id: str, rel_type: str, properties: dict | None = None
) -> ThreatRelationship | None:
    source_node = get_node_by_id(source_id)
    target_node = get_node_by_id(target_id)
    if not source_node or not target_node:
        return None

    source_label = source_node.label.value
    target_label = target_node.label.value

    prop_str = ""
    params = {"source_id": source_id, "target_id": target_id}
    if properties:
        prop_str = " {" + ", ".join([f"{k}: ${k}" for k in properties.keys()]) + "}"
        params.update(properties)

    query = f"""
    MATCH (s:{source_label} {{name: $source_id}})
    MATCH (t:{target_label} {{name: $target_id}})
    MERGE (s)-[r:{rel_type}{prop_str}]->(t)
    RETURN type(r) AS type, s.name AS source_name, t.name AS target_name
    """
    records = neo4j_conn.execute_write(query, params)
    if not records:
        return None
    return ThreatRelationship(
        source_id=records[0]["source_name"],
        target_id=records[0]["target_name"],
        type=RelationshipType(records[0]["type"]),
        properties=properties or {},
    )


def delete_relationship(source_id: str, target_id: str, rel_type: str) -> bool:
    query = """
    MATCH (s)-[r:%s]-(t)
    WHERE s.name = $source_id AND t.name = $target_id
    DELETE r RETURN count(r) AS deleted
    """ % rel_type
    records = neo4j_conn.execute_write(
        query, {"source_id": source_id, "target_id": target_id}
    )
    return records[0]["deleted"] > 0 if records else False


def get_graph_stats() -> dict:
    stats = {}
    for label in ["IP", "Domain", "Hash", "CVE"]:
        query = f"MATCH (n:{label}) RETURN count(n) AS count"
        records = neo4j_conn.execute_query(query)
        stats[label] = records[0]["count"] if records else 0
    rel_query = "MATCH ()-[r]->() RETURN count(r) AS count"
    records = neo4j_conn.execute_query(rel_query)
    stats["relationships"] = records[0]["count"] if records else 0
    return stats


def clear_cache():
    _query_cache.clear()


def get_cache_stats() -> dict:
    return {
        "cache_size": len(_query_cache),
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
    }
