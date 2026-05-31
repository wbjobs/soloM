import sys
import os
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from app.database import neo4j_conn


def generate_large_dataset(node_count: int = 2000):
    print(f"正在生成 {node_count} 个节点的测试数据集...")

    labels = ["IP", "Domain", "Hash", "CVE"]
    countries = ["US", "CN", "RU", "DE", "JP", "BR", "IN", "FR", "GB", "KR"]
    threat_levels = ["low", "medium", "high", "critical"]
    asns = ["AS12345", "AS208576", "AS50340", "AS63949", "AS134348"]
    registrars = ["NameCheap", "GoDaddy", "Cloudflare", "NameSilo", "Google"]
    algorithms = ["MD5", "SHA1", "SHA256"]
    file_types = ["PE32", "ELF", "Mach-O", "PDF", "Office"]
    affected_products = ["Windows", "Linux", "macOS", "Chrome", "Firefox", "Office", "Java"]

    with neo4j_conn.session() as session:
        print("清除旧数据...")
        session.run("MATCH (n) DETACH DELETE n")

        print("创建索引约束...")
        for label in labels:
            session.run(
                f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.name IS UNIQUE"
            )

        print("创建中心节点...")
        center_ip = "185.220.101.34"
        session.run(
            """
            CREATE (n:IP {
                name: $name,
                country: $country,
                asn: $asn,
                threat_level: $threat_level,
                tags: $tags
            })
            """,
            {
                "name": center_ip,
                "country": "DE",
                "asn": "AS208576",
                "threat_level": "critical",
                "tags": "C2 Server, Tor Exit",
            },
        )

        print(f"创建 {node_count} 个节点...")
        batch_size = 1000
        generated_nodes = []

        for i in range(node_count):
            label = random.choice(labels)
            if label == "IP":
                name = f"{random.randint(1, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
                props = {
                    "name": name,
                    "country": random.choice(countries),
                    "asn": random.choice(asns),
                    "threat_level": random.choice(threat_levels),
                    "tags": f"IP-{i}",
                }
            elif label == "Domain":
                name = f"malicious-domain-{i}.xyz"
                props = {
                    "name": name,
                    "registrar": random.choice(registrars),
                    "created_date": f"2024-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
                    "threat_level": random.choice(threat_levels),
                    "tags": f"Domain-{i}",
                }
            elif label == "Hash":
                name = "".join(random.choices("0123456789abcdef", k=32))
                props = {
                    "name": name,
                    "algorithm": random.choice(algorithms),
                    "file_type": random.choice(file_types),
                    "file_size": random.randint(10240, 10485760),
                    "tags": f"Hash-{i}",
                }
            else:
                cve_year = random.randint(2020, 2024)
                cve_num = random.randint(1000, 99999)
                name = f"CVE-{cve_year}-{cve_num}"
                props = {
                    "name": name,
                    "severity": random.choice(["Low", "Medium", "High", "Critical"]),
                    "cvss_score": round(random.uniform(3.0, 10.0), 1),
                    "affected_product": random.choice(affected_products),
                    "tags": f"CVE-{i}",
                }

            generated_nodes.append({"label": label, **props})

            if len(generated_nodes) >= batch_size:
                _batch_create_nodes(session, generated_nodes)
                generated_nodes = []
                print(f"已创建 {i + 1} 个节点...")

        if generated_nodes:
            _batch_create_nodes(session, generated_nodes)

        print("获取所有节点名称...")
        all_nodes = session.run(
            "MATCH (n) RETURN n.name AS name, labels(n)[0] AS label"
        ).data()

        node_names = [n["name"] for n in all_nodes]
        node_label_map = {n["name"]: n["label"] for n in all_nodes}

        print(f"创建关系...")
        rel_types = [
            "RESOLVES_TO",
            "COMMUNICATES_WITH",
            "HOSTS",
            "DOWNLOADS",
            "EXPLOITS",
            "RELATED_TO",
        ]

        relations = []
        for i, source_name in enumerate(node_names):
            source_label = node_label_map[source_name]
            target_count = random.randint(1, 5)

            for _ in range(target_count):
                target_idx = random.randint(0, len(node_names) - 1)
                target_name = node_names[target_idx]
                target_label = node_label_map[target_name]

                if source_name == target_name:
                    continue

                if source_label == "IP" and target_label == "Domain":
                    rel_type = "RESOLVES_TO"
                elif source_label == "IP" and target_label == "IP":
                    rel_type = "COMMUNICATES_WITH"
                elif source_label == "Domain" and target_label == "Hash":
                    rel_type = random.choice(["HOSTS", "DOWNLOADS"])
                elif source_label == "Hash" and target_label == "CVE":
                    rel_type = "EXPLOITS"
                else:
                    rel_type = random.choice(rel_types)

                relations.append(
                    {
                        "source_name": source_name,
                        "source_label": source_label,
                        "target_name": target_name,
                        "target_label": target_label,
                        "type": rel_type,
                    }
                )

            if len(relations) >= batch_size:
                _batch_create_relations(session, relations)
                relations = []
                print(f"已创建 {i * 3} 条关系...")

        if relations:
            _batch_create_relations(session, relations)

    neo4j_conn.close()
    print(f"完成！创建了 {node_count + 1} 个节点，以及约 {node_count * 3} 条关系。")


def _batch_create_nodes(session, nodes):
    query = """
    UNWIND $nodes AS node
    CALL apoc.create.node([node.label], node)
    YIELD node AS created
    RETURN count(created) AS count
    """
    try:
        session.run(query, {"nodes": nodes})
    except Exception:
        for node in nodes:
            label = node["label"]
            props = {k: v for k, v in node.items() if k != "label"}
            prop_str = ", ".join([f"{k}: ${k}" for k in props.keys()])
            session.run(f"CREATE (n:{label} {{{prop_str}}})", props)


def _batch_create_relations(session, relations):
    query = """
    UNWIND $rels AS rel
    MATCH (s {name: rel.source_name})
    MATCH (t {name: rel.target_name})
    MERGE (s)-[r:%s]->(t)
    RETURN count(r) AS count
    """
    for rel_type in set(r["type"] for r in relations):
        rels_of_type = [r for r in relations if r["type"] == rel_type]
        try:
            session.run(query % rel_type, {"rels": rels_of_type})
        except Exception:
            for rel in rels_of_type:
                session.run(
                    f"""
                    MATCH (s:{rel['source_label']} {{name: $source_name}})
                    MATCH (t:{rel['target_label']} {{name: $target_name}})
                    MERGE (s)-[r:{rel_type}]->(t)
                    """,
                    {"source_name": rel["source_name"], "target_name": rel["target_name"]},
                )


if __name__ == "__main__":
    count = 2000
    if len(sys.argv) > 1:
        count = int(sys.argv[1])
    generate_large_dataset(count)
