import subprocess
import os
import tempfile
import yaml
import logging
from typing import Dict, List, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class GitSync:
    def __init__(self, repo_url: str, branch: str = "main", git_token: Optional[str] = None):
        self.repo_url = repo_url
        self.branch = branch
        self.git_token = git_token
        self._work_dir = None

    def _get_auth_url(self) -> str:
        if self.git_token and "github.com" in self.repo_url:
            return self.repo_url.replace("https://", f"https://{self.git_token}@")
        if self.git_token and "gitlab" in self.repo_url:
            return self.repo_url.replace("https://", f"https://oauth2:{self.git_token}@")
        return self.repo_url

    def clone_or_pull(self, work_dir: Optional[str] = None) -> str:
        if work_dir:
            self._work_dir = work_dir
        elif not self._work_dir:
            self._work_dir = tempfile.mkdtemp(prefix="drift_git_")

        repo_path = os.path.join(self._work_dir, "repo")

        if os.path.exists(os.path.join(repo_path, ".git")):
            logger.info("Pulling latest changes for %s", self.repo_url)
            subprocess.run(
                ["git", "fetch", "--all"],
                cwd=repo_path, check=True, capture_output=True
            )
            subprocess.run(
                ["git", "checkout", self.branch],
                cwd=repo_path, check=True, capture_output=True
            )
            subprocess.run(
                ["git", "reset", "--hard", f"origin/{self.branch}"],
                cwd=repo_path, check=True, capture_output=True
            )
        else:
            auth_url = self._get_auth_url()
            logger.info("Cloning repository %s", self.repo_url)
            subprocess.run(
                ["git", "clone", "-b", self.branch, "--single-branch", auth_url, repo_path],
                check=True, capture_output=True
            )

        return repo_path

    def parse_k8s_manifests(self, repo_path: str, yaml_dirs: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        manifests = []
        search_paths = []
        failed_files = []
        success_count = 0

        if yaml_dirs:
            for d in yaml_dirs:
                full = os.path.join(repo_path, d)
                if os.path.exists(full):
                    search_paths.append(full)
        else:
            search_paths.append(repo_path)

        for search_path in search_paths:
            for root, _, files in os.walk(search_path):
                for fname in files:
                    if not (fname.endswith(".yaml") or fname.endswith(".yml")):
                        continue
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            content = f.read()
                        doc_idx = 0
                        try:
                            for doc in yaml.safe_load_all(content):
                                doc_idx += 1
                                if doc is None:
                                    continue
                                if isinstance(doc, list):
                                    for sub_idx, sub_doc in enumerate(doc):
                                        if isinstance(sub_doc, dict) and "kind" in sub_doc and "metadata" in sub_doc:
                                            rel_path = os.path.relpath(fpath, repo_path)
                                            manifests.append({
                                                "file": f"{rel_path}#doc[{sub_idx}]",
                                                "manifest": sub_doc
                                            })
                                            success_count += 1
                                    continue
                                if isinstance(doc, dict) and "kind" in doc and "metadata" in doc:
                                    if not isinstance(doc.get("metadata"), dict):
                                        logger.warning(
                                            "Skipping invalid manifest in %s, doc %d: metadata is not a dict",
                                            fpath, doc_idx
                                        )
                                        continue
                                    rel_path = os.path.relpath(fpath, repo_path)
                                    manifests.append({
                                        "file": rel_path if doc_idx == 1 else f"{rel_path}#doc[{doc_idx}]",
                                        "manifest": doc
                                    })
                                    success_count += 1
                        except yaml.YAMLError as ye:
                            logger.error(
                                "YAML parse error in %s, doc %d: %s. Skipping this document.",
                                fpath, doc_idx, ye
                            )
                            failed_files.append(fpath)
                    except Exception as e:
                        logger.error(
                            "Failed to process YAML file %s: %s. Skipping this file.",
                            fpath, e, exc_info=True
                        )
                        failed_files.append(fpath)

        if failed_files:
            logger.warning(
                "Parsing complete: %d manifests from %d files, %d files failed: %s",
                len(manifests), success_count, len(failed_files),
                ", ".join(os.path.relpath(f, repo_path) for f in failed_files)
            )
        else:
            logger.info("Parsed %d K8s manifests from Git", len(manifests))
        return manifests

    def cleanup(self):
        if self._work_dir and os.path.exists(self._work_dir):
            import shutil
            shutil.rmtree(self._work_dir, ignore_errors=True)
