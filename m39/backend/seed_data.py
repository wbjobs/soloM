import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()

from app.database import neo4j_conn


SEED_NODES = [
    {"label": "IP", "name": "185.220.101.34", "properties": {"country": "DE", "asn": "AS208576", "threat_level": "high", "tags": "Tor Exit Node, C2 Server"}},
    {"label": "IP", "name": "91.234.99.42", "properties": {"country": "RU", "asn": "AS50340", "threat_level": "high", "tags": "Phishing, Botnet"}},
    {"label": "IP", "name": "45.33.32.156", "properties": {"country": "US", "asn": "AS63949", "threat_level": "medium", "tags": "Scanner"}},
    {"label": "IP", "name": "103.224.182.210", "properties": {"country": "CN", "asn": "AS134348", "threat_level": "high", "tags": "Malware Distribution"}},
    {"label": "IP", "name": "192.168.1.100", "properties": {"country": "Internal", "asn": "Private", "threat_level": "critical", "tags": "Compromised Host"}},
    {"label": "Domain", "name": "evil-pharm.com", "properties": {"registrar": "NameCheap", "created_date": "2024-01-15", "tags": "Phishing"}},
    {"label": "Domain", "name": "c2-server.net", "properties": {"registrar": "GoDaddy", "created_date": "2023-11-20", "tags": "C2"}},
    {"label": "Domain", "name": "malware-distro.xyz", "properties": {"registrar": "Cloudflare", "created_date": "2024-03-08", "tags": "Malware Distribution"}},
    {"label": "Domain", "name": "update-service.org", "properties": {"registrar": "NameSilo", "created_date": "2024-02-01", "tags": "Trojan"}},
    {"label": "Hash", "name": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", "properties": {"algorithm": "MD5", "file_type": "PE32", "file_size": 245760, "tags": "TrickBot"}},
    {"label": "Hash", "name": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3", "properties": {"algorithm": "SHA256", "file_type": "ELF", "file_size": 524288, "tags": "Mirai"}},
    {"label": "Hash", "name": "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d", "properties": {"algorithm": "SHA256", "file_type": "PE32+", "file_size": 184320, "tags": "Emotet"}},
    {"label": "CVE", "name": "CVE-2024-3400", "properties": {"severity": "Critical", "cvss_score": 10.0, "affected_product": "PAN-OS", "description": "PAN-OS command injection vulnerability"}},
    {"label": "CVE", "name": "CVE-2023-44228", "properties": {"severity": "Critical", "cvss_score": 10.0, "affected_product": "Apache Log4j2", "description": "Remote code execution in Log4j"}},
    {"label": "CVE", "name": "CVE-2024-21762", "properties": {"severity": "Critical", "cvss_score": 9.8, "affected_product": "FortiOS", "description": "Out-of-bound write vulnerability in FortiOS SSL VPN"}},
    {"label": "CVE", "name": "CVE-2023-36884", "properties": {"severity": "High", "cvss_score": 8.8, "affected_product": "Microsoft Office", "description": "Office and Windows HTML RCE vulnerability"}},
]

SEED_RELATIONSHIPS = [
    {"source": "185.220.101.34", "source_label": "IP", "target": "c2-server.net", "target_label": "Domain", "type": "RESOLVES_TO"},
    {"source": "185.220.101.34", "source_label": "IP", "target": "192.168.1.100", "target_label": "IP", "type": "COMMUNICATES_WITH"},
    {"source": "91.234.99.42", "source_label": "IP", "target": "evil-pharm.com", "target_label": "Domain", "type": "RESOLVES_TO"},
    {"source": "91.234.99.42", "source_label": "IP", "target": "192.168.1.100", "target_label": "IP", "type": "COMMUNICATES_WITH"},
    {"source": "103.224.182.210", "source_label": "IP", "target": "malware-distro.xyz", "target_label": "Domain", "type": "HOSTS"},
    {"source": "malware-distro.xyz", "source_label": "Domain", "target": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", "target_label": "Hash", "type": "HOSTS"},
    {"source": "c2-server.net", "source_label": "Domain", "target": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3", "target_label": "Hash", "type": "DOWNLOADS"},
    {"source": "192.168.1.100", "source_label": "IP", "target": "update-service.org", "target_label": "Domain", "type": "COMMUNICATES_WITH"},
    {"source": "update-service.org", "source_label": "Domain", "target": "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d", "target_label": "Hash", "type": "DOWNLOADS"},
    {"source": "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d", "source_label": "Hash", "target": "CVE-2024-3400", "target_label": "CVE", "type": "EXPLOITS"},
    {"source": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", "source_label": "Hash", "target": "CVE-2023-44228", "target_label": "CVE", "type": "EXPLOITS"},
    {"source": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3", "source_label": "Hash", "target": "CVE-2024-21762", "target_label": "CVE", "type": "EXPLOITS"},
    {"source": "45.33.32.156", "source_label": "IP", "target": "192.168.1.100", "target_label": "IP", "type": "COMMUNICATES_WITH"},
    {"source": "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d", "source_label": "Hash", "target": "CVE-2023-36884", "target_label": "CVE", "type": "EXPLOITS"},
    {"source": "evil-pharm.com", "source_label": "Domain", "target": "c2-server.net", "target_label": "Domain", "type": "RELATED_TO"},
]


def clear_database():
    with neo4j_conn.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    print("Database cleared.")


def create_constraints():
    with neo4j_conn.session() as session:
        for label in ["IP", "Domain", "Hash", "CVE"]:
            session.run(
                f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.name IS UNIQUE"
            )
    print("Constraints created.")


def seed_nodes():
    with neo4j_conn.session() as session:
        for node in SEED_NODES:
            label = node["label"]
            name = node["name"]
            props = node["properties"]
            prop_str = ", ".join(
                [f"{k}: ${k}" for k in props.keys()]
            )
            if prop_str:
                query = f"MERGE (n:{label} {{name: $name, {prop_str}}})"
            else:
                query = f"MERGE (n:{label} {{name: $name}})"
            params = {"name": name, **props}
            session.run(query, params)
    print(f"Seeded {len(SEED_NODES)} nodes.")


def seed_relationships():
    with neo4j_conn.session() as session:
        for rel in SEED_RELATIONSHIPS:
            source_label = rel["source_label"]
            target_label = rel["target_label"]
            source_name = rel["source"]
            target_name = rel["target"]
            rel_type = rel["type"]
            query = f"""
            MATCH (s:{source_label} {{name: $source_name}})
            MATCH (t:{target_label} {{name: $target_name}})
            MERGE (s)-[r:{rel_type}]->(t)
            """
            session.run(query, {"source_name": source_name, "target_name": target_name})
    print(f"Seeded {len(SEED_RELATIONSHIPS)} relationships.")


def main():
    print("Starting database seeding...")
    clear_database()
    create_constraints()
    seed_nodes()
    seed_relationships()
    neo4j_conn.close()
    print("Seeding complete!")


if __name__ == "__main__":
    main()
