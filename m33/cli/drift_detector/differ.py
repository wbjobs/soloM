import copy
import logging
from typing import Dict, List, Any, Optional, Tuple
from deepdiff import DeepDiff

logger = logging.getLogger(__name__)

FIELDS_TO_IGNORE = {
    "metadata.uid", "metadata.resourceVersion", "metadata.selfLink",
    "metadata.creationTimestamp", "metadata.generation", "metadata.managedFields",
    "metadata.annotations.kubectl.kubernetes.io/last-applied-configuration",
    "status"
}


class DriftResult:
    def __init__(self, kind: str, name: str, namespace: str, file: str,
                 drift_type: str, diff: Optional[Dict] = None,
                 git_spec: Optional[Dict] = None, live_spec: Optional[Dict] = None):
        self.kind = kind
        self.name = name
        self.namespace = namespace
        self.file = file
        self.drift_type = drift_type
        self.diff = diff or {}
        self.git_spec = git_spec
        self.live_spec = live_spec

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "name": self.name,
            "namespace": self.namespace,
            "file": self.file,
            "drift_type": self.drift_type,
            "diff": self.diff,
            "git_spec": self.git_spec,
            "live_spec": self.live_spec,
        }


class Differ:
    def __init__(self, ignore_fields: Optional[List[str]] = None):
        self.ignore_fields = set(FIELDS_TO_IGNORE)
        if ignore_fields:
            self.ignore_fields.update(ignore_fields)

    def _normalize_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        normalized = copy.deepcopy(manifest)
        if not isinstance(normalized, dict):
            return normalized

        metadata = normalized.get("metadata", {})
        if isinstance(metadata, dict):
            metadata.pop("uid", None)
            metadata.pop("resourceVersion", None)
            metadata.pop("selfLink", None)
            metadata.pop("creationTimestamp", None)
            metadata.pop("generation", None)
            metadata.pop("managedFields", None)
            annotations = metadata.get("annotations", {})
            if isinstance(annotations, dict) and "kubectl.kubernetes.io/last-applied-configuration" in annotations:
                del annotations["kubectl.kubernetes.io/last-applied-configuration"]
            if isinstance(annotations, dict) and not annotations:
                metadata.pop("annotations", None)
        normalized.pop("status", None)
        return normalized

    def _has_changes(self, diff) -> bool:
        if isinstance(diff, dict):
            return bool(diff)
        for change_type in ["values_changed", "type_changes", "dictionary_item_added",
                            "dictionary_item_removed", "iterable_item_added",
                            "iterable_item_removed"]:
            changes = diff.get(change_type) if hasattr(diff, "get") else getattr(diff, change_type, None)
            if changes:
                return True
        return False

    def compare(self, git_manifests: List[Dict[str, Any]],
                k8s_client) -> Tuple[List[DriftResult], List[Dict[str, Any]]]:
        drifts = []
        checked_keys = set()
        failed_resources = []
        success_count = 0

        for entry in git_manifests:
            manifest = entry.get("manifest", {})
            file_path = entry.get("file", "unknown")

            try:
                kind = manifest.get("kind", "Unknown")
                metadata = manifest.get("metadata", {}) or {}
                name = metadata.get("name", "")
                namespace = metadata.get("namespace", "default")
                api_version = manifest.get("apiVersion", "")

                if not kind or not name:
                    logger.warning("Skipping invalid manifest in %s: missing kind or name", file_path)
                    continue

                resource_key = f"{namespace}/{kind}/{name}"
                checked_keys.add(resource_key)

                git_normalized = self._normalize_manifest(manifest)
                live_resource = k8s_client.get_live_resource(
                    kind=kind, name=name, namespace=namespace, api_version=api_version
                )

                if live_resource is None:
                    drifts.append(DriftResult(
                        kind=kind, name=name, namespace=namespace, file=file_path,
                        drift_type="missing_in_cluster",
                        git_spec=git_normalized
                    ))
                    logger.warning("DRIFT: %s/%s (%s) missing in cluster", namespace, name, kind)
                    success_count += 1
                    continue

                live_normalized = self._normalize_manifest(live_resource)

                try:
                    diff = DeepDiff(
                        git_normalized, live_normalized,
                        ignore_order=True,
                        verbose_level=2,
                        max_passes=10,
                        cache_size=1000,
                    )
                except (TypeError, RecursionError, ValueError) as e:
                    logger.warning(
                        "DeepDiff error for %s/%s (%s): %s. Marking as drift (diff unavailable).",
                        namespace, name, kind, e
                    )
                    diff = {"_diff_error": str(e)}
                    drifts.append(DriftResult(
                        kind=kind, name=name, namespace=namespace, file=file_path,
                        drift_type="configuration_drift",
                        diff={"deepdiff_error": str(e)},
                        git_spec=git_normalized,
                        live_spec=live_normalized,
                    ))
                    success_count += 1
                    continue

                if self._has_changes(diff):
                    filtered_diff = self._filter_diff(diff)
                    if self._has_changes(filtered_diff):
                        drifts.append(DriftResult(
                            kind=kind, name=name, namespace=namespace, file=file_path,
                            drift_type="configuration_drift",
                            diff=self._serialize_diff(filtered_diff),
                            git_spec=git_normalized,
                            live_spec=live_normalized,
                        ))
                        logger.warning("DRIFT: %s/%s (%s) configuration drift detected", namespace, name, kind)
                    else:
                        logger.debug("OK: %s/%s (%s) - only ignored fields differ", namespace, name, kind)
                else:
                    logger.debug("OK: %s/%s (%s) - no drift", namespace, name, kind)

                success_count += 1

            except Exception as e:
                resource_id = f"{manifest.get('metadata', {}).get('namespace', 'default')}/{manifest.get('kind', 'Unknown')}/{manifest.get('metadata', {}).get('name', 'unknown')}"
                failed_resources.append((resource_id, file_path, str(e)))
                logger.error(
                    "Failed to process resource %s in %s: %s. Continuing with other resources.",
                    resource_id, file_path, e, exc_info=True
                )
                continue

        if failed_resources:
            logger.warning(
                "Scan completed with %d failures out of %d resources. Failed resources: %s",
                len(failed_resources), len(git_manifests),
                ", ".join([f"{rid} ({fpath})" for rid, fpath, _ in failed_resources])
            )
        else:
            logger.info("All %d resources processed successfully", success_count)

        return drifts, list(checked_keys)

    def _filter_diff(self, diff) -> Dict[str, Any]:
        filtered: Dict[str, Any] = {}
        for change_type in ["values_changed", "type_changes", "dictionary_item_added",
                            "dictionary_item_removed", "iterable_item_added", "iterable_item_removed"]:
            if isinstance(diff, dict) or hasattr(diff, "get"):
                changes = diff.get(change_type)
            else:
                changes = getattr(diff, change_type, None)
            if not changes:
                continue
            filtered_changes = {}
            for path, value in changes.items():
                if not self._should_ignore_path(path):
                    filtered_changes[path] = value
            if filtered_changes:
                filtered[change_type] = filtered_changes
        return filtered

    def _should_ignore_path(self, path: str) -> bool:
        for ignore in self.ignore_fields:
            if ignore in path:
                return True
        return False

    def _serialize_diff(self, diff) -> Dict[str, Any]:
        result = {}
        for change_type in ["values_changed", "type_changes", "dictionary_item_added",
                            "dictionary_item_removed", "iterable_item_added", "iterable_item_removed"]:
            if isinstance(diff, dict):
                changes = diff.get(change_type)
            else:
                changes = getattr(diff, change_type, None)
            if changes:
                serialized = {}
                for path, value in changes.items():
                    if hasattr(value, "to_dict"):
                        serialized[path] = value.to_dict()
                    elif isinstance(value, dict):
                        serialized[path] = {
                            k: v if not hasattr(v, "to_dict") else v.to_dict()
                            for k, v in value.items()
                        }
                    else:
                        serialized[path] = str(value)
                result[change_type] = serialized
        return result
