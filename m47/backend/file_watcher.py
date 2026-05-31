import os
import logging
import threading
import time
from typing import Optional, Callable, Set
from pathlib import Path
from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer
from .config import settings

logger = logging.getLogger(__name__)


class CodeChangeHandler(FileSystemEventHandler):
    def __init__(
        self,
        code_loader,
        vector_store_manager,
        file_extensions: Optional[Set[str]] = None,
        on_change_callback: Optional[Callable] = None,
    ):
        super().__init__()
        self.code_loader = code_loader
        self.vector_store_manager = vector_store_manager
        self.file_extensions = file_extensions or set(settings.file_extension_list)
        self.on_change_callback = on_change_callback
        self._pending_changes: dict = {}
        self._debounce_time = 1.0
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._processor_thread: Optional[threading.Thread] = None
        self._start_processor()

    def _start_processor(self) -> None:
        self._processor_thread = threading.Thread(target=self._process_pending_changes, daemon=True)
        self._processor_thread.start()

    def _process_pending_changes(self) -> None:
        while not self._stop_event.is_set():
            try:
                time.sleep(self._debounce_time)
                with self._lock:
                    current_time = time.time()
                    to_process = []
                    for file_path, timestamp in list(self._pending_changes.items()):
                        if current_time - timestamp >= self._debounce_time:
                            to_process.append(file_path)
                            del self._pending_changes[file_path]

                for file_path in to_process:
                    try:
                        self._handle_change(file_path)
                    except Exception as e:
                        logger.error(f"Error processing change for {file_path}: {e}")
            except Exception as e:
                logger.error(f"Error in change processor: {e}")

    def _is_valid_file(self, file_path: str) -> bool:
        path = Path(file_path)

        if '/.' in str(path) or '\\.' in str(path) or path.name.startswith('.'):
            return False

        if path.suffix.lower() not in self.file_extensions:
            return False

        exclude_patterns = ['__pycache__', 'node_modules', '.git', '.venv', 'venv', 'dist', 'build', 'target']
        for pattern in exclude_patterns:
            if pattern in path.parts:
                return False

        return True

    def _queue_change(self, file_path: str) -> None:
        with self._lock:
            self._pending_changes[file_path] = time.time()
            logger.debug(f"Queued change for: {file_path}")

    def _handle_change(self, file_path: str) -> None:
        logger.info(f"Processing change for: {file_path}")

        if not os.path.exists(file_path):
            logger.info(f"File deleted or moved: {file_path}")
            deleted_count = self.vector_store_manager.delete_by_file_path(file_path)
            logger.info(f"Deleted {deleted_count} chunks from vector store")
            if self.on_change_callback:
                self.on_change_callback("delete", file_path, deleted_count)
            return

        try:
            content = self.code_loader.read_file(file_path)
            if content is None:
                deleted_count = self.vector_store_manager.delete_by_file_path(file_path)
                logger.info(f"Deleted {deleted_count} chunks for unreadable file: {file_path}")
                if self.on_change_callback:
                    self.on_change_callback("delete", file_path, deleted_count)
                return

            is_changed, _ = self.vector_store_manager.check_file_changed(file_path, content)
            if not is_changed:
                logger.debug(f"File content unchanged, skipping reindex: {file_path}")
                return

            documents = self.code_loader.reload_file(file_path)
            if documents:
                ids = self.vector_store_manager.update_file(file_path, documents)
                self.vector_store_manager.update_file_metadata(
                    file_path,
                    content,
                    chunk_count=len(ids),
                )
                logger.info(f"Updated {len(ids)} chunks for: {file_path}")
                if self.on_change_callback:
                    self.on_change_callback("update", file_path, len(ids))
            else:
                logger.warning(f"No documents generated for: {file_path}")
                deleted_count = self.vector_store_manager.delete_by_file_path(file_path)
                logger.info(f"Deleted {deleted_count} chunks for empty/invalid file")
        except Exception as e:
            logger.error(f"Error handling change for {file_path}: {e}")

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._is_valid_file(event.src_path):
            logger.info(f"File created: {event.src_path}")
            self._queue_change(event.src_path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._is_valid_file(event.src_path):
            logger.info(f"File modified: {event.src_path}")
            self._queue_change(event.src_path)

    def on_moved(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return

        dest_path = event.dest_path if hasattr(event, 'dest_path') else None

        if self._is_valid_file(event.src_path):
            logger.info(f"File moved from: {event.src_path}")
            self._queue_change(event.src_path)

        if dest_path and self._is_valid_file(dest_path):
            logger.info(f"File moved to: {dest_path}")
            self._queue_change(dest_path)

    def on_deleted(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._is_valid_file(event.src_path):
            logger.info(f"File deleted: {event.src_path}")
            self._queue_change(event.src_path)

    def stop(self) -> None:
        self._stop_event.set()
        if self._processor_thread:
            self._processor_thread.join(timeout=2.0)


class FileWatcher:
    def __init__(
        self,
        code_loader,
        vector_store_manager,
        watch_dir: Optional[str] = None,
        on_change_callback: Optional[Callable] = None,
    ):
        self.watch_dir = watch_dir or settings.code_dir
        self.code_loader = code_loader
        self.vector_store_manager = vector_store_manager
        self.on_change_callback = on_change_callback
        self.observer: Optional[Observer] = None
        self.event_handler: Optional[CodeChangeHandler] = None
        self._is_running = False

    def start(self) -> None:
        if self._is_running:
            logger.warning("File watcher is already running")
            return

        watch_path = Path(self.watch_dir)
        if not watch_path.exists():
            logger.info(f"Creating watch directory: {self.watch_dir}")
            watch_path.mkdir(parents=True, exist_ok=True)

        self.event_handler = CodeChangeHandler(
            code_loader=self.code_loader,
            vector_store_manager=self.vector_store_manager,
            on_change_callback=self.on_change_callback,
        )

        self.observer = Observer()
        self.observer.schedule(
            self.event_handler,
            str(watch_path),
            recursive=True,
        )

        self.observer.start()
        self._is_running = True
        logger.info(f"File watcher started, watching: {self.watch_dir}")

    def stop(self) -> None:
        if not self._is_running:
            logger.warning("File watcher is not running")
            return

        if self.event_handler:
            self.event_handler.stop()

        if self.observer:
            self.observer.stop()
            self.observer.join(timeout=2.0)

        self._is_running = False
        logger.info("File watcher stopped")

    @property
    def is_running(self) -> bool:
        return self._is_running
