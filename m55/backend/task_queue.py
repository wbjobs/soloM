import json
import uuid
import threading
import subprocess
import tempfile
import os
import zipfile
from datetime import datetime
from typing import Dict, Any, Optional
import io


class TaskQueue:
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
        self._start_worker()

    def _start_worker(self):
        def worker():
            import time
            while True:
                time.sleep(0.1)
                with self.lock:
                    pending_tasks = [
                        task_id for task_id, task in self.tasks.items()
                        if task['status'] == 'pending'
                    ]
                
                for task_id in pending_tasks:
                    self._process_task(task_id)

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

    def create_task(self, task_type: str, payload: Dict[str, Any]) -> str:
        task_id = str(uuid.uuid4())
        with self.lock:
            self.tasks[task_id] = {
                'task_id': task_id,
                'task_type': task_type,
                'status': 'pending',
                'progress': 0,
                'total': 0,
                'created_at': datetime.utcnow().isoformat(),
                'payload': payload,
                'result': None,
                'error': None,
            }
        return task_id

    def _process_task(self, task_id: str):
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return
            task['status'] = 'processing'
        
        try:
            if task['task_type'] == 'batch_compress':
                self._process_batch_compress(task)
        except Exception as e:
            with self.lock:
                task['status'] = 'failed'
                task['error'] = str(e)

    def _process_batch_compress(self, task: Dict[str, Any]):
        files = task['payload']['files']
        quality = task['payload'].get('quality', 70)
        
        task['total'] = len(files)
        compressed_files = []
        
        for i, file_info in enumerate(files):
            try:
                input_data = file_info['data']
                filename = file_info['name']
                
                with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f_in:
                    f_in.write(input_data)
                    input_path = f_in.name
                
                output_filename = f"compressed_{uuid.uuid4().hex}.png"
                output_path = os.path.join(tempfile.gettempdir(), output_filename)
                
                result = subprocess.run(
                    ["magick", input_path, "-quality", str(quality), output_path],
                    capture_output=True,
                    text=True,
                )
                
                if os.path.exists(input_path):
                    os.unlink(input_path)
                
                if result.returncode == 0 and os.path.exists(output_path):
                    with open(output_path, 'rb') as f:
                        compressed_data = f.read()
                    compressed_files.append({
                        'name': f"compressed_{file_info['name']}",
                        'data': compressed_data,
                    })
                    os.unlink(output_path)
                
                with self.lock:
                    task['progress'] = i + 1
                
            except Exception as e:
                print(f"Error processing {file_info['name']}: {e}")
        
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for cf in compressed_files:
                zf.writestr(cf['name'], cf['data'])
        
        zip_filename = f"batch_compressed_{task['task_id']}.zip"
        zip_path = os.path.join(tempfile.gettempdir(), zip_filename)
        
        with open(zip_path, 'wb') as f:
            f.write(zip_buffer.getvalue())
        
        with self.lock:
            task['status'] = 'completed'
            task['result'] = {
                'zip_path': zip_path,
                'zip_filename': zip_filename,
                'total_files': len(compressed_files),
            }

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                return {
                    'task_id': task['task_id'],
                    'task_type': task['task_type'],
                    'status': task['status'],
                    'progress': task['progress'],
                    'total': task['total'],
                    'created_at': task['created_at'],
                    'error': task['error'],
                }
        return None

    def get_task_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            task = self.tasks.get(task_id)
            if task and task['status'] == 'completed':
                return task['result']
        return None


try:
    import redis
    redis_available = True
except ImportError:
    redis_available = False


class RedisTaskQueue:
    def __init__(self, host='localhost', port=6379, db=0):
        if redis_available:
            try:
                self.redis = redis.Redis(host=host, port=port, db=db)
                self.redis.ping()
                self.use_redis = True
            except:
                self.use_redis = False
                self.memory_queue = TaskQueue()
        else:
            self.use_redis = False
            self.memory_queue = TaskQueue()

    def create_task(self, task_type: str, payload: Dict[str, Any]) -> str:
        if self.use_redis:
            pass
        else:
            return self.memory_queue.create_task(task_type, payload)

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        if self.use_redis:
            pass
        else:
            return self.memory_queue.get_task_status(task_id)

    def get_task_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        if self.use_redis:
            pass
        else:
            return self.memory_queue.get_task_result(task_id)


task_queue = RedisTaskQueue()
