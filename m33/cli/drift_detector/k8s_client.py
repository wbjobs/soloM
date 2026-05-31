import logging
from typing import Dict, List, Any, Optional, Tuple
from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException

logger = logging.getLogger(__name__)


class K8sClient:
    def __init__(self, kubeconfig_path: Optional[str] = None, context: Optional[str] = None):
        if kubeconfig_path:
            k8s_config.load_kube_config(config_file=kubeconfig_path, context=context)
        else:
            try:
                k8s_config.load_incluster_config()
                logger.info("Loaded in-cluster Kubernetes config")
            except k8s_config.ConfigException:
                k8s_config.load_kube_config(context=context)
                logger.info("Loaded kubeconfig from default location")

        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()
        self.batch_v1 = client.BatchV1Api()
        self.networking_v1 = client.NetworkingV1Api()
        self.rbac_auth_v1 = client.RbacAuthorizationV1Api()
        self.custom_objects = client.CustomObjectsApi()
        self._api_client = client.ApiClient()

    def get_live_resource(self, kind: str, name: str, namespace: str = "default",
                          api_version: str = "") -> Optional[Dict[str, Any]]:
        try:
            result = self._dispatch_get(kind, name, namespace, api_version)
            if result:
                return self._sanitize_resource(result)
        except ApiException as e:
            if e.status == 404:
                logger.debug("Resource %s/%s (%s) not found in cluster", namespace, name, kind)
                return None
            logger.error("K8s API error for %s/%s (%s): %s", namespace, name, kind, e)
        except Exception as e:
            logger.error("Error fetching %s/%s (%s): %s", namespace, name, kind, e)
        return None

    def _dispatch_get(self, kind: str, name: str, namespace: str, api_version: str) -> Any:
        kind_lower = kind.lower()

        dispatch = {
            "deployment": lambda: self.apps_v1.read_namespaced_deployment(name=name, namespace=namespace),
            "statefulset": lambda: self.apps_v1.read_namespaced_stateful_set(name=name, namespace=namespace),
            "daemonset": lambda: self.apps_v1.read_namespaced_daemon_set(name=name, namespace=namespace),
            "replicaset": lambda: self.apps_v1.read_namespaced_replica_set(name=name, namespace=namespace),
            "pod": lambda: self.core_v1.read_namespaced_pod(name=name, namespace=namespace),
            "service": lambda: self.core_v1.read_namespaced_service(name=name, namespace=namespace),
            "configmap": lambda: self.core_v1.read_namespaced_config_map(name=name, namespace=namespace),
            "secret": lambda: self.core_v1.read_namespaced_secret(name=name, namespace=namespace),
            "persistentvolumeclaim": lambda: self.core_v1.read_namespaced_persistent_volume_claim(name=name, namespace=namespace),
            "persistentvolume": lambda: self.core_v1.read_persistent_volume(name=name),
            "namespace": lambda: self.core_v1.read_namespace(name=name),
            "ingress": lambda: self.networking_v1.read_namespaced_ingress(name=name, namespace=namespace),
            "networkpolicy": lambda: self.networking_v1.read_namespaced_network_policy(name=name, namespace=namespace),
            "job": lambda: self.batch_v1.read_namespaced_job(name=name, namespace=namespace),
            "cronjob": lambda: self.batch_v1.read_namespaced_cron_job(name=name, namespace=namespace),
            "role": lambda: self.rbac_auth_v1.read_namespaced_role(name=name, namespace=namespace),
            "rolebinding": lambda: self.rbac_auth_v1.read_namespaced_role_binding(name=name, namespace=namespace),
            "clusterrole": lambda: self.rbac_auth_v1.read_cluster_role(name=name),
            "clusterrolebinding": lambda: self.rbac_auth_v1.read_cluster_role_binding(name=name),
        }

        if kind_lower in dispatch:
            return dispatch[kind_lower]()

        if api_version:
            group, version = self._parse_api_version(api_version)
            if group and version:
                plural = self._kind_to_plural(kind)
                cluster_scoped = self._is_cluster_scoped_kind(kind)

                try:
                    if cluster_scoped:
                        return self.custom_objects.get_cluster_custom_object(
                            group=group, version=version,
                            plural=plural, name=name
                        )
                    else:
                        return self.custom_objects.get_namespaced_custom_object(
                            group=group, version=version, namespace=namespace,
                            plural=plural, name=name
                        )
                except ApiException as e:
                    if e.status == 404:
                        return None
                    if e.status == 403:
                        logger.warning(
                            "Forbidden accessing CRD %s.%s/%s (%s): %s. "
                            "This may be expected if the CRD is not registered or RBAC permission denied.",
                            plural, group, version, kind, e.reason
                        )
                        return None
                    if e.status == 405 or (e.reason and ("not found" in e.reason.lower() or "no matches" in e.reason.lower())):
                        logger.info(
                            "CRD %s.%s/%s (%s) not found or not registered in cluster",
                            plural, group, version, kind
                        )
                        return None
                    logger.warning(
                        "CRD API error for %s/%s (apiVersion=%s): %s",
                        namespace, name, api_version, e
                    )
                    return None
        else:
            logger.warning(
                "Skipping resource %s/%s (%s): no apiVersion provided for non-built-in kind",
                namespace, name, kind
            )

        return None

    def _parse_api_version(self, api_version: str) -> Tuple[str, str]:
        if "/" in api_version:
            parts = api_version.split("/", 1)
            return parts[0], parts[1]
        return "", api_version

    def _kind_to_plural(self, kind: str) -> str:
        kind_lower = kind.lower()
        irregular_plurals = {
            "pod": "pods",
            "bus": "buses",
            "class": "classes",
            "oss": "osses",
            "cafeorder": "cafeorders",
            "axis": "axes",
            "crisis": "crises",
            "testis": "testes",
            "alumnus": "alumni",
            "bacillus": "bacilli",
            "locus": "loci",
            "radius": "radii",
            "stimulus": "stimuli",
            "syllabus": "syllabi",
            "fungus": "fungi",
            "nucleus": "nuclei",
            "memorandum": "memoranda",
            "criterion": "criteria",
            "phenomenon": "phenomena",
            "automaton": "automata",
            "cactus": "cacti",
            "focus": "foci",
            "fungus": "fungi",
            "matrix": "matrices",
            "vortex": "vortices",
            "index": "indices",
            "vertex": "vertices",
        }
        if kind_lower in irregular_plurals:
            return irregular_plurals[kind_lower]
        if kind_lower.endswith("s"):
            return kind_lower + "es"
        if kind_lower.endswith("y") and len(kind_lower) > 1 and kind_lower[-2] not in "aeiou":
            return kind_lower[:-1] + "ies"
        if kind_lower.endswith("o") and len(kind_lower) > 1 and kind_lower[-2] not in "aeiou":
            return kind_lower + "es"
        return kind_lower + "s"

    def _is_cluster_scoped_kind(self, kind: str) -> bool:
        cluster_scoped = {"Namespace", "Node", "PersistentVolume", "ClusterRole",
                          "ClusterRoleBinding", "StorageClass", "VolumeAttachment",
                          "PriorityClass", "RuntimeClass", "CertificateSigningRequest",
                          "CustomResourceDefinition"}
        return kind in cluster_scoped

    def _sanitize_resource(self, resource: Any) -> Dict[str, Any]:
        if isinstance(resource, dict):
            result = resource
        else:
            result = self._api_client.sanitize_for_serialization(resource)

        metadata = result.get("metadata", {})
        for field in ["uid", "resourceVersion", "selfLink", "creationTimestamp",
                       "generation", "managedFields", "annotations"]:
            if field in metadata:
                if field == "annotations" and "kubectl.kubernetes.io/last-applied-configuration" in metadata.get("annotations", {}):
                    del metadata["annotations"]["kubectl.kubernetes.io/last-applied-configuration"]
                    if not metadata["annotations"]:
                        del metadata["annotations"]
                elif field != "annotations":
                    del metadata[field]

        result.pop("status", None)
        return result

    def list_namespaced_resources(self, kind: str, namespace: str = "default") -> List[Dict[str, Any]]:
        kind_lower = kind.lower()
        try:
            items = []
            if kind_lower == "deployment":
                resp = self.apps_v1.list_namespaced_deployment(namespace)
                items = resp.items
            elif kind_lower == "service":
                resp = self.core_v1.list_namespaced_service(namespace)
                items = resp.items
            elif kind_lower == "configmap":
                resp = self.core_v1.list_namespaced_config_map(namespace)
                items = resp.items
            elif kind_lower == "statefulset":
                resp = self.apps_v1.list_namespaced_stateful_set(namespace)
                items = resp.items
            elif kind_lower == "daemonset":
                resp = self.apps_v1.list_namespaced_daemon_set(namespace)
                items = resp.items
            elif kind_lower == "ingress":
                resp = self.networking_v1.list_namespaced_ingress(namespace)
                items = resp.items
            else:
                logger.warning("list_namespaced_resources not supported for kind: %s", kind)
                return []

            return [
                self._sanitize_resource(item)
                for item in items
            ]
        except ApiException as e:
            logger.error("Failed to list %s in %s: %s", kind, namespace, e)
            return []
