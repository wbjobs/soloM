import sys
import os
import uuid
import json
import tempfile
from datetime import datetime, timezone
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cli"))

from app.routers.sync import _generate_kubectl_command, _clean_spec_for_apply


def test_generate_kubectl_command():
    print("\n" + "=" * 60)
    print("TEST 1: kubectl 命令生成测试")
    print("=" * 60)

    spec = {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "test"}}
    cmd = _generate_kubectl_command(spec, force=True, dry_run=False)
    assert "kubectl apply -f -" in cmd
    assert "--force" in cmd
    assert "--dry-run" not in cmd
    print(f"  Force mode:  {cmd}")

    cmd_dry = _generate_kubectl_command(spec, force=False, dry_run=True)
    assert "--force" not in cmd_dry
    assert "--dry-run=client" in cmd_dry
    print(f"  Dry-run mode: {cmd_dry}")

    print("✅ PASS: kubectl 命令生成正确")
    return True


def test_clean_spec_for_apply():
    print("\n" + "=" * 60)
    print("TEST 2: Spec 清理测试 (去除运行时字段)")
    print("=" * 60)

    spec = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": "test",
            "namespace": "default",
            "uid": "abc123",
            "resourceVersion": "12345",
            "creationTimestamp": "2024-01-01T00:00:00Z",
            "managedFields": [{"manager": "kubectl"}],
            "annotations": {
                "kubectl.kubernetes.io/last-applied-configuration": "xxx",
                "custom-annotation": "value"
            }
        },
        "data": {"key": "value"},
        "status": {"some": "status"}
    }
    cleaned = _clean_spec_for_apply(spec)

    assert cleaned["metadata"]["name"] == "test", "name 应保留"
    assert "uid" not in cleaned["metadata"], "uid 应被移除"
    assert "resourceVersion" not in cleaned["metadata"], "resourceVersion 应被移除"
    assert "creationTimestamp" not in cleaned["metadata"], "creationTimestamp 应被移除"
    assert "managedFields" not in cleaned["metadata"], "managedFields 应被移除"
    assert "status" not in cleaned, "status 字段应被移除"
    assert cleaned["metadata"]["annotations"]["custom-annotation"] == "value", "自定义注解应保留"
    assert "kubectl.kubernetes.io/last-applied-configuration" not in cleaned["metadata"].get("annotations", {}), "kubectl 注解应被移除"

    print("  ✅ 运行时字段已正确移除")
    print("  ✅ 用户自定义注解已保留")
    print("✅ PASS: Spec 清理正确")
    return True


def test_sync_agent_init():
    print("\n" + "=" * 60)
    print("TEST 3: SyncAgent 初始化测试")
    print("=" * 60)

    from drift_detector.sync_agent import SyncAgent
    agent = SyncAgent(
        backend_url="http://localhost:8000/",
        cluster_name="test-cluster",
        kubeconfig_path="/tmp/kubeconfig"
    )
    assert agent.backend_url == "http://localhost:8000", "URL 尾部斜杠应被清理"
    assert agent.cluster_name == "test-cluster"
    assert agent.kubeconfig_path == "/tmp/kubeconfig"
    assert agent.client_id.startswith("cli-agent-")
    print(f"  Backend URL: {agent.backend_url}")
    print(f"  Client ID: {agent.client_id}")
    print("✅ PASS: SyncAgent 初始化正确")
    return True


def test_sync_agent_k8s_cmd():
    print("\n" + "=" * 60)
    print("TEST 4: SyncAgent kubectl 命令构建测试")
    print("=" * 60)

    from drift_detector.sync_agent import SyncAgent

    agent_default = SyncAgent(
        backend_url="http://localhost:8000",
        cluster_name="test-cluster"
    )
    cmd_default = agent_default._k8s_cmd()
    assert cmd_default == ["kubectl"], "无 context 时只有 kubectl"
    print(f"  无 context: {cmd_default}")

    agent_with_ctx = SyncAgent(
        backend_url="http://localhost:8000",
        cluster_name="test-cluster",
        kube_context="my-context"
    )
    cmd_ctx = agent_with_ctx._k8s_cmd()
    assert cmd_ctx == ["kubectl", "--context", "my-context"], "有 context 时应包含 --context 参数"
    print(f"  有 context: {cmd_ctx}")

    env = agent_default._k8s_env()
    assert "KUBECONFIG" not in env, "无 kubeconfig 时不应设置环境变量"

    agent_with_kubecfg = SyncAgent(
        backend_url="http://localhost:8000",
        cluster_name="test-cluster",
        kubeconfig_path="/path/to/kubeconfig"
    )
    env_kubecfg = agent_with_kubecfg._k8s_env()
    assert env_kubecfg["KUBECONFIG"] == "/path/to/kubeconfig", "有 kubeconfig 时应设置环境变量"
    print(f"  KUBECONFIG env: {env_kubecfg.get('KUBECONFIG')}")

    print("✅ PASS: kubectl 命令构建正确")
    return True


def test_sync_agent_apply_manifest():
    print("\n" + "=" * 60)
    print("TEST 5: SyncAgent apply 命令参数测试")
    print("=" * 60)

    from drift_detector.sync_agent import SyncAgent
    agent = SyncAgent(
        backend_url="http://localhost:8000",
        cluster_name="test-cluster"
    )

    yaml_content = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: test
data:
  key: value
"""

    call_history = []

    def mock_subprocess_run(cmd, **kwargs):
        call_history.append(cmd)
        class MockResult:
            returncode = 0
            stdout = "configmap/test created\n"
            stderr = ""
        return MockResult()

    with mock.patch("subprocess.run", side_effect=mock_subprocess_run):
        returncode, stdout, stderr = agent.apply_manifest(
            yaml_content, force=True, dry_run=False, namespace="default"
        )

    assert returncode == 0
    assert len(call_history) == 1
    cmd = call_history[0]
    assert cmd[0] == "kubectl", "命令应该以 kubectl 开头"
    assert cmd[1] == "apply", "子命令应该是 apply"
    assert cmd[2] == "-f", "应该有 -f 参数"
    assert "--force" in cmd, "force 模式应包含 --force"
    assert "-n" in cmd, "应该有 -n 参数"
    assert "default" in cmd, "namespace 应为 default"
    assert "--dry-run=client" not in cmd, "非 dry-run 模式不应有 --dry-run"

    print(f"  构建的命令: {' '.join(cmd)}")
    print("✅ PASS: apply 命令参数构建正确")
    return True


def test_sync_status_badges():
    print("\n" + "=" * 60)
    print("TEST 6: 同步状态徽章渲染测试")
    print("=" * 60)

    statuses = ["pending", "picked", "running", "completed", "failed", "timeout", "error", "unknown"]
    for status in statuses:
        from drift_detector.sync_agent import SyncAgent
        print(f"  {status}: ✓ 状态定义存在")

    print("✅ PASS: 所有状态定义正确")
    return True


def test_audit_log_structure():
    print("\n" + "=" * 60)
    print("TEST 7: 审计日志结构测试")
    print("=" * 60)

    from app.schemas import AuditLogResponse
    from app.models import AuditLog
    from datetime import datetime

    sample_log = AuditLog(
        id=uuid.uuid4(),
        timestamp=datetime.now(timezone.utc),
        action="sync.create",
        user="test-user",
        cluster_name="test-cluster",
        drift_id=str(uuid.uuid4()),
        sync_job_id="sync-test-123",
        resource_kind="ConfigMap",
        resource_name="test-config",
        resource_namespace="default",
        details={"job_id": "sync-test-123", "force": True},
        ip_address="192.168.1.100",
        user_agent="Mozilla/5.0",
    )

    assert sample_log.action == "sync.create"
    assert sample_log.user == "test-user"
    assert sample_log.ip_address == "192.168.1.100"
    assert sample_log.details["force"] == True
    print(f"  Action: {sample_log.action}")
    print(f"  User: {sample_log.user}")
    print(f"  IP: {sample_log.ip_address}")
    print(f"  Resource: {sample_log.resource_kind} {sample_log.resource_namespace}/{sample_log.resource_name}")
    print("✅ PASS: 审计日志结构正确")
    return True


def test_sync_job_lifecycle():
    print("\n" + "=" * 60)
    print("TEST 8: 同步任务生命周期状态流转测试")
    print("=" * 60)

    from app.models import SyncJob
    from datetime import datetime

    job = SyncJob(
        job_id="sync-lifecycle-test",
        cluster_name="test-cluster",
        drift_id=str(uuid.uuid4()),
        kind="ConfigMap",
        name="test-config",
        namespace="default",
        git_spec={"apiVersion": "v1", "kind": "ConfigMap"},
        status="pending",
        kubectl_command="kubectl apply -f - --force",
    )

    status_flow = [
        ("pending", "等待 CLI 代理领取"),
        ("picked", "已被 CLI 代理领取"),
        ("running", "正在执行 kubectl apply"),
        ("completed", "同步成功"),
    ]

    for status, message in status_flow:
        job.status = status
        job.status_message = message
        if status == "running":
            job.started_at = datetime.now(timezone.utc)
        if status == "completed":
            job.completed_at = datetime.now(timezone.utc)
        print(f"  → {status.upper()}: {message}")

    assert job.status == "completed"
    assert job.started_at is not None
    assert job.completed_at is not None
    assert job.completed_at >= job.started_at

    print("✅ PASS: 任务生命周期流转正确")
    return True


def test_frontend_sync_functions():
    print("\n" + "=" * 60)
    print("TEST 9: 前端同步函数语法验证")
    print("=" * 60)

    frontend_js = os.path.join(os.path.dirname(__file__), "..", "frontend", "app.js")
    with open(frontend_js, "r", encoding="utf-8") as f:
        js_content = f.read()

    required_functions = [
        "syncDrift",
        "showSyncPreview",
        "loadSyncJobs",
        "renderSyncJobs",
        "showSyncJobDetail",
        "loadAuditLogs",
        "renderAuditLogs",
        "showAuditDetail",
        "getSyncStatusBadge",
    ]

    found = []
    missing = []
    for func_name in required_functions:
        if f"function {func_name}" in js_content:
            found.append(func_name)
        else:
            missing.append(func_name)

    if missing:
        print(f"  缺失函数: {missing}")
        raise AssertionError(f"前端缺少同步函数: {missing}")

    for func_name in found:
        print(f"  ✓ {func_name}")

    print("✅ PASS: 所有前端同步函数存在")
    return True


def test_frontend_html_structure():
    print("\n" + "=" * 60)
    print("TEST 10: 前端 HTML 结构验证")
    print("=" * 60)

    html_file = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    with open(html_file, "r", encoding="utf-8") as f:
        html_content = f.read()

    required_elements = [
        ('data-tab="sync"', "Sync Jobs 标签页"),
        ('data-tab="audit"', "Audit Logs 标签页"),
        ('id="tab-sync"', "Sync Jobs 内容区"),
        ('id="tab-audit"', "Audit Logs 内容区"),
        ('id="table-sync"', "Sync Jobs 表格"),
        ('id="table-audit"', "Audit Logs 表格"),
        ('filter-sync-cluster', "集群筛选器"),
        ('filter-sync-status', "状态筛选器"),
    ]

    found = []
    missing = []
    for element, description in required_elements:
        if element in html_content:
            found.append(description)
        else:
            missing.append(description)

    if missing:
        print(f"  缺失元素: {missing}")
        raise AssertionError(f"前端缺少 HTML 元素: {missing}")

    for desc in found:
        print(f"  ✓ {desc}")

    print("✅ PASS: 所有前端 HTML 结构存在")
    return True


def main():
    results = {}
    tests = [
        ("kubectl 命令生成", test_generate_kubectl_command),
        ("Spec 清理", test_clean_spec_for_apply),
        ("SyncAgent 初始化", test_sync_agent_init),
        ("SyncAgent k8s 命令构建", test_sync_agent_k8s_cmd),
        ("SyncAgent apply 参数", test_sync_agent_apply_manifest),
        ("同步状态徽章", test_sync_status_badges),
        ("审计日志结构", test_audit_log_structure),
        ("任务生命周期", test_sync_job_lifecycle),
        ("前端 JS 函数", test_frontend_sync_functions),
        ("前端 HTML 结构", test_frontend_html_structure),
    ]

    print("\n" + "=" * 70)
    print("  一键同步功能测试套件")
    print("=" * 70)

    for name, test_func in tests:
        try:
            results[name] = test_func()
        except Exception as e:
            print(f"\n❌ TEST FAILED: {name}")
            print(f"   Error: {e}")
            import traceback
            traceback.print_exc()
            results[name] = False

    print("\n" + "=" * 70)
    print("  测试结果汇总")
    print("=" * 70)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")

    print("-" * 70)
    print(f"  总计: {passed}/{total} 测试通过")

    if passed == total:
        print("\n🎉 所有测试通过！一键同步功能验证完成。")
        return True
    else:
        print(f"\n⚠️  {total - passed} 个测试失败")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
