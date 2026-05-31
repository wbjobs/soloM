import json
import os
import threading
import time
import uuid
import random
from datetime import datetime
from croniter import croniter


DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
HEARTBEAT_INTERVAL = 5


class JobStore:
    def __init__(self, data_file=DATA_FILE):
        self.lock = threading.Lock()
        self.data_file = data_file
        self.jobs = {}
        self.last_seen = None
        self._load()
        self._heartbeat_thread = None
        self._heartbeat_running = False

    def _load(self):
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.jobs = data.get("jobs", {})
                self.last_seen = data.get("last_seen")
                print(f"[JobStore] Loaded {len(self.jobs)} jobs from {self.data_file}")
            except Exception as e:
                print(f"[JobStore] Failed to load data: {e}")
                self.jobs = {}
                self.last_seen = None
        else:
            print("[JobStore] No existing data file, starting fresh")

    def _save(self):
        try:
            with open(self.data_file, "w", encoding="utf-8") as f:
                json.dump({
                    "jobs": self.jobs,
                    "last_seen": self.last_seen,
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[JobStore] Failed to save data: {e}")

    def start_heartbeat(self):
        self._heartbeat_running = True
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        print("[JobStore] Heartbeat started")

    def stop_heartbeat(self):
        self._heartbeat_running = False
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)

    def _heartbeat_loop(self):
        while self._heartbeat_running:
            with self.lock:
                self.last_seen = datetime.now().isoformat()
                self._save()
            time.sleep(HEARTBEAT_INTERVAL)

    def add_job(self, name, cron_expr, command, timeout=30):
        job_id = str(uuid.uuid4())[:8]
        with self.lock:
            self.jobs[job_id] = {
                "id": job_id,
                "name": name,
                "cron_expr": cron_expr,
                "command": command,
                "timeout": timeout,
                "paused": False,
                "created_at": datetime.now().isoformat(),
                "executions": [],
            }
            self._save()
        return self.jobs[job_id]

    def delete_job(self, job_id):
        with self.lock:
            if job_id in self.jobs:
                del self.jobs[job_id]
                self._save()
                return True
            return False

    def pause_job(self, job_id):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["paused"] = True
                self._save()
                return True
            return False

    def resume_job(self, job_id):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["paused"] = False
                self._save()
                return True
            return False

    def get_all_jobs(self):
        with self.lock:
            result = []
            for job in self.jobs.values():
                result.append({
                    **job,
                    "executions": job["executions"][-5:],
                })
            return result

    def get_active_jobs(self):
        with self.lock:
            return [
                job for job in self.jobs.values() if not job["paused"]
            ]

    def add_execution(self, job_id, execution):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["executions"].append(execution)
                self._save()


class Scheduler:
    def __init__(self, store):
        self.store = store
        self.thread = None
        self.running = False
        self.next_runs = {}

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        print("[Scheduler] Started scheduler thread")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        print("[Scheduler] Stopped scheduler thread")

    def compensate_missed(self):
        last_seen = self.store.last_seen
        if not last_seen:
            print("[Scheduler] No last_seen timestamp, skipping missed compensation")
            return

        try:
            downtime_start = datetime.fromisoformat(last_seen)
        except Exception as e:
            print(f"[Scheduler] Invalid last_seen format: {last_seen}, error: {e}")
            return

        now = datetime.now()
        if downtime_start >= now:
            print("[Scheduler] last_seen is not in the past, no missed executions")
            return

        with self.store.lock:
            active_jobs = [job for job in self.store.jobs.values() if not job["paused"]]

        total_missed = 0
        for job in active_jobs:
            job_id = job["id"]
            try:
                if not croniter.is_valid(job["cron_expr"]):
                    continue

                exec_base = downtime_start
                executions = job.get("executions", [])
                if executions:
                    last_exec_time = None
                    for ex in executions:
                        if ex.get("started_at"):
                            t = datetime.fromisoformat(ex["started_at"])
                            if last_exec_time is None or t > last_exec_time:
                                last_exec_time = t
                    if last_exec_time and last_exec_time > exec_base:
                        exec_base = last_exec_time

                cron = croniter(job["cron_expr"], exec_base)
                missed_times = []
                while True:
                    try:
                        next_fire = cron.get_next(datetime)
                    except Exception:
                        break
                    if next_fire >= now:
                        break
                    missed_times.append(next_fire)
                    if len(missed_times) > 100:
                        print(f"[Scheduler] Too many missed executions for job {job_id}, capping at 100")
                        break

                for mt in missed_times:
                    missed_exec = {
                        "status": "missed",
                        "started_at": mt.isoformat(),
                        "finished_at": mt.isoformat(),
                        "duration_s": 0,
                    }
                    self.store.add_execution(job_id, missed_exec)
                    total_missed += 1

                if missed_times:
                    print(f"[Scheduler] Job '{job['name']}' (id={job_id}): compensated {len(missed_times)} missed execution(s)")

            except Exception as e:
                print(f"[Scheduler] Error compensating missed for job {job_id}: {e}")

        if total_missed > 0:
            print(f"[Scheduler] Missed compensation complete: {total_missed} total missed execution(s) recorded")
        else:
            print("[Scheduler] No missed executions found during downtime")

    def _loop(self):
        while self.running:
            now = datetime.now()
            now_ts = now.timestamp()
            active_jobs = self.store.get_active_jobs()

            for job in active_jobs:
                job_id = job["id"]
                try:
                    cron = croniter(job["cron_expr"], now)
                    next_time = cron.get_next(datetime)
                    next_ts = next_time.timestamp()

                    stored_next = self.next_runs.get(job_id)

                    if stored_next is None:
                        self.next_runs[job_id] = next_ts
                    elif now_ts >= stored_next:
                        self._execute_job(job)
                        cron2 = croniter(job["cron_expr"], now)
                        next_after = cron2.get_next(datetime)
                        self.next_runs[job_id] = next_after.timestamp()
                except Exception as e:
                    print(f"[Scheduler] Error parsing cron for job {job_id}: {e}")

            time.sleep(1)

    def _execute_job(self, job):
        threading.Thread(target=self._do_execute, args=(job,), daemon=True).start()

    def _do_execute(self, job):
        job_id = job["id"]
        timeout = job.get("timeout", 30)
        start = datetime.now()
        print(f"[Scheduler] [{start.isoformat()}] Triggering job: {job['name']} (id={job_id}), command: {job['command']}, timeout: {timeout}s")

        success = random.random() > 0.2
        sim_duration = round(random.uniform(0.1, timeout * 1.5), 3)

        cancel_event = threading.Event()
        result = {"status": None, "duration": 0}

        def run_task():
            elapsed = 0.0
            step = 0.05
            while elapsed < sim_duration and not cancel_event.is_set():
                time.sleep(step)
                elapsed += step
            if cancel_event.is_set():
                return
            result["status"] = "success" if success else "failed"
            result["duration"] = round(min(elapsed, sim_duration), 3)

        worker = threading.Thread(target=run_task, daemon=True)
        worker.start()
        worker.join(timeout=timeout)
        timed_out = worker.is_alive()

        if timed_out:
            cancel_event.set()
            worker.join(timeout=1)
            end = datetime.now()
            duration = round((end - start).total_seconds(), 3)
            print(f"[Scheduler] [{end.isoformat()}] Job {job['name']} TIMEOUT after {duration}s (limit={timeout}s)")
            execution = {
                "status": "timeout",
                "started_at": start.isoformat(),
                "finished_at": end.isoformat(),
                "duration_s": duration,
            }
        else:
            end = datetime.now()
            status = result["status"] or "failed"
            duration = result["duration"] or round((end - start).total_seconds(), 3)
            if status == "failed":
                print(f"[Scheduler] [{end.isoformat()}] Job {job['name']} FAILED after {duration}s")
            else:
                print(f"[Scheduler] [{end.isoformat()}] Job {job['name']} completed in {duration}s")
            execution = {
                "status": status,
                "started_at": start.isoformat(),
                "finished_at": end.isoformat(),
                "duration_s": duration,
            }

        self.store.add_execution(job_id, execution)
