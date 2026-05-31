#!/usr/bin/env python3
"""
健壮性测试：验证 CRD YAML 解析失败和深层嵌套 YAML 的处理能力
"""
import sys
import os
import json
import tempfile
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cli"))

from drift_detector import GitSync
from drift_detector.differ import Differ
from drift_detector.k8s_client import K8sClient


def test_yaml_parsing_robustness():
    """测试 YAML 解析健壮性：单个文件失败不影响整体"""
    print("\n" + "=" * 60)
    print("TEST 1: YAML 解析健壮性测试")
    print("=" * 60)

    with tempfile.TemporaryDirectory() as tmpdir:
        os.makedirs(os.path.join(tmpdir, "repo"), exist_ok=True)

        manifests = [
            ("valid-deployment.yaml", """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: valid-app
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: valid
  template:
    metadata:
      labels:
        app: valid
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
"""),
            ("invalid-crd-malformed.yaml", """
apiVersion: custom.example.com/v1alpha1
kind: BadCrd
metadata:
  name: bad-crd-1
spec:
  this: is: invalid: yaml: with: too: many: colons
    nested:
      - broken
      - yaml
"""),
            ("valid-crd.yaml", """
apiVersion: custom.example.com/v1alpha1
kind: MyCustomResource
metadata:
  name: my-crd-1
  namespace: default
spec:
  replicas: 3
  settings:
    key1: value1
    key2: value2
"""),
            ("incomplete.yaml", """
apiVersion: apps/v1
kind: Service
metadata:
"""),
            ("valid-configmap.yaml", """
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1
  key2: value2
"""),
        ]

        for fname, content in manifests:
            with open(os.path.join(tmpdir, "repo", fname), "w") as f:
                f.write(content)

        os.makedirs(os.path.join(tmpdir, "repo", ".git"), exist_ok=True)
        with open(os.path.join(tmpdir, "repo", ".git", "HEAD"), "w") as f:
            f.write("ref: refs/heads/main\n")

        git_sync = GitSync(repo_url="https://example.com/test.git")
        parsed = git_sync.parse_k8s_manifests(os.path.join(tmpdir, "repo"))

        print(f"\nParsed {len(parsed)} manifests total")
        kinds = [m["manifest"]["kind"] for m in parsed]
        print(f"Kinds found: {kinds}")

        expected_valid = {"Deployment", "MyCustomResource", "ConfigMap"}
        actual = set(kinds)
        assert expected_valid == actual, f"Expected {expected_valid}, got {actual}"

        invalid_count = len([m for m in parsed if "BadCrd" in str(m)])
        assert invalid_count == 0, f"Should not have parsed BadCrd"

        print("✅ PASS: 即使有损坏的 YAML，有效资源仍被正确解析")


def test_deep_nested_structure():
    """测试深层嵌套结构不会导致对比崩溃"""
    print("\n" + "=" * 60)
    print("TEST 2: 深层嵌套结构对比测试")
    print("=" * 60)

    def build_deep_nested(depth, width):
        """构建深层嵌套对象"""
        obj = {"level": depth}
        if depth > 0:
            for i in range(width):
                obj[f"child_{i}"] = build_deep_nested(depth - 1, width)
        else:
            obj["value"] = f"leaf_{depth}_{width}"
        return obj

    deep_git = {
        "apiVersion": "custom.example.com/v1alpha1",
        "kind": "DeepResource",
        "metadata": {
            "name": "deep-test",
            "namespace": "default",
        },
        "spec": {
            "normal_field": "value",
            "deep_data": build_deep_nested(8, 2),
        }
    }

    deep_live = json.loads(json.dumps(deep_git))
    deep_live["spec"]["normal_field"] = "CHANGED_VALUE"
    deep_live["spec"]["new_field"] = {"added": "yes"}

    differ = Differ()

    git_manifests = [{
        "file": "deep-test.yaml",
        "manifest": deep_git,
    }]

    class MockK8sClient:
        def get_live_resource(self, kind, name, namespace="default", api_version=""):
            return deep_live

    try:
        drifts, checked = differ.compare(git_manifests, MockK8sClient())
        print(f"Generated {len(drifts)} drift(s) from deep nested structure")

        if drifts:
            drift = drifts[0].to_dict()
            diff = drift.get("diff", {})
            print(f"Diff keys: {list(diff.keys())}")

            drift_json_size = len(json.dumps(drift))
            print(f"Drift object size: {drift_json_size} bytes")

            spec_size = len(json.dumps(deep_git))
            print(f"Original spec size: {spec_size} bytes")

        print("✅ PASS: 深层嵌套结构对比成功，无崩溃")
        return True
    except RecursionError as e:
        print(f"❌ FAIL: RecursionError: {e}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_crd_pluralization():
    """测试 CRD 复数化规则"""
    print("\n" + "=" * 60)
    print("TEST 3: CRD 复数化规则测试")
    print("=" * 60)

    test_cases = [
        ("Pod", "pods"),
        ("Deployment", "deployments"),
        ("Service", "services"),
        ("Ingress", "ingresses"),
        ("CronJob", "cronjobs"),
        ("Certificate", "certificates"),
        ("Issuer", "issuers"),
        ("ClusterIssuer", "clusterissuers"),
        ("Backup", "backups"),
        ("Restore", "restores"),
        ("Repository", "repositories"),
        ("ConfigMap", "configmaps"),
        ("Volume", "volumes"),
        ("Policy", "policies"),
        ("Class", "classes"),
        ("Index", "indices"),
        ("Vertex", "vertices"),
    ]

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "k8s_client",
        os.path.join(os.path.dirname(__file__), "..", "cli", "drift_detector", "k8s_client.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    all_passed = True
    for kind, expected in test_cases:
        result = module.K8sClient._kind_to_plural(None, kind)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_passed = False
        print(f"  {status} {kind:20s} -> {result:20s} (expected: {expected})")

    if all_passed:
        print("✅ PASS: 所有 CRD 复数化规则正确")
    else:
        print("❌ FAIL: 部分复数化规则失败")
    return all_passed


def test_single_resource_failure():
    """测试单个资源对比失败不影响整体扫描"""
    print("\n" + "=" * 60)
    print("TEST 4: 单个资源对比失败隔离测试")
    print("=" * 60)

    good_manifest = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "good", "namespace": "default"},
        "spec": {"replicas": 3}
    }

    bad_manifest = {
        "apiVersion": "broken.example.com/v1",
        "kind": "BrokenKind",
        "metadata": {"name": "bad", "namespace": "default"},
        "spec": None
    }

    another_good = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": "config", "namespace": "default"},
        "data": {"key": "value"}
    }

    git_manifests = [
        {"file": "good.yaml", "manifest": good_manifest},
        {"file": "bad.yaml", "manifest": bad_manifest},
        {"file": "config.yaml", "manifest": another_good},
    ]

    class FailingK8sClient:
        call_count = 0
        def get_live_resource(self, kind, name, namespace="default", api_version=""):
            self.call_count += 1
            if kind == "BrokenKind":
                raise RuntimeError("Simulated K8s API failure for CRD")
            if kind == "Deployment":
                return {
                    "apiVersion": "apps/v1",
                    "kind": "Deployment",
                    "metadata": {"name": "good", "namespace": "default"},
                    "spec": {"replicas": 5}
                }
            if kind == "ConfigMap":
                return {
                    "apiVersion": "v1",
                    "kind": "ConfigMap",
                    "metadata": {"name": "config", "namespace": "default"},
                    "data": {"key": "value"}
                }
            return None

    differ = Differ()

    try:
        drifts, checked = differ.compare(git_manifests, FailingK8sClient())

        print(f"Checked {len(checked)} resources")
        print(f"Found {len(drifts)} drifts")
        print(f"Checked resources: {checked}")

        drift_kinds = [d.to_dict()["kind"] for d in drifts]
        print(f"Drift kinds: {drift_kinds}")

        assert "Deployment" in drift_kinds, "Should detect drift in Deployment"
        assert "default/BrokenKind/bad" in checked or len(checked) >= 2, "Should have checked at least good resources"
        assert len(drifts) >= 1, "Should have at least one drift"

        print("✅ PASS: 单个 CRD 失败未影响整体扫描，其他资源正常检测")
        return True
    except Exception as e:
        print(f"❌ FAIL: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_large_yaml_truncation():
    """测试后端对大规格数据的截断处理"""
    print("\n" + "=" * 60)
    print("TEST 5: 大数据截断测试")
    print("=" * 60)

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
    from app.routers.drift import _truncate_large_value, MAX_SPEC_SIZE

    large_spec = {
        "apiVersion": "custom.example.com/v1",
        "kind": "LargeResource",
        "metadata": {"name": "large", "namespace": "default"},
        "spec": {}
    }

    for i in range(5000):
        large_spec["spec"][f"key_{i}"] = {
            "nested": {
                "data": f"value_{i}",
                "more": f"extra_{i}",
                "numbers": list(range(10))
            }
        }

    original_size = len(json.dumps(large_spec).encode("utf-8"))
    print(f"Original spec size: {original_size / 1024:.1f} KB")
    print(f"Max allowed: {MAX_SPEC_SIZE / 1024:.1f} KB")

    truncated = _truncate_large_value(large_spec, MAX_SPEC_SIZE, "test")

    truncated_size = len(json.dumps(truncated).encode("utf-8"))
    print(f"Truncated spec size: {truncated_size / 1024:.1f} KB")

    assert truncated_size <= MAX_SPEC_SIZE * 1.1, f"Truncated size {truncated_size} exceeds limit {MAX_SPEC_SIZE}"
    assert truncated.get("_truncated") == True, "Should have _truncated flag"
    assert "_original_size_bytes" in truncated, "Should have original size"

    print(f"Truncation ratio: {original_size / truncated_size:.1f}x")
    print("✅ PASS: 大数据成功截断到合理大小")

    return True


def main():
    results = {}

    try:
        test_yaml_parsing_robustness()
        results["yaml_parsing"] = True
    except Exception as e:
        print(f"TEST 1 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results["yaml_parsing"] = False

    try:
        results["deep_nested"] = test_deep_nested_structure()
    except Exception as e:
        print(f"TEST 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results["deep_nested"] = False

    try:
        results["pluralization"] = test_crd_pluralization()
    except Exception as e:
        print(f"TEST 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results["pluralization"] = False

    try:
        results["failure_isolation"] = test_single_resource_failure()
    except Exception as e:
        print(f"TEST 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results["failure_isolation"] = False

    try:
        results["truncation"] = test_large_yaml_truncation()
    except Exception as e:
        print(f"TEST 5 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results["truncation"] = False

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    all_passed = True
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}  {name}")
        if not passed:
            all_passed = False

    print("=" * 60)
    if all_passed:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
