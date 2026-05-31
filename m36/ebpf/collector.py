#!/usr/bin/env python3

import argparse
import json
import os
import socket
import sys
import time
import threading
from collections import deque
from typing import List, Set, Optional

try:
    from bcc import BPF
except ImportError:
    print("Error: BCC is not installed. Please install BCC first.", file=sys.stderr)
    sys.exit(1)


class BackpressureTracker:
    def __init__(self, max_pending: int = 5000, high_watermark: float = 0.8):
        self.max_pending = max_pending
        self.high_watermark = high_watermark
        self.paused = False
        self.total_dropped = 0
        self.current_pending = 0

    def should_drop(self, pending_count: int) -> bool:
        self.current_pending = pending_count
        if pending_count >= self.max_pending:
            self.total_dropped += 1
            self.paused = True
            return True
        if pending_count >= self.max_pending * self.high_watermark:
            if not self.paused:
                self.paused = True
            if pending_count % 10 == 0:
                self.total_dropped += 1
                return True
        else:
            self.paused = False
        return False

    def get_stats(self) -> dict:
        return {
            "paused": self.paused,
            "total_dropped": self.total_dropped,
            "current_pending": self.current_pending,
            "max_pending": self.max_pending,
        }


class RateLimiter:
    def __init__(self, max_events_per_second: int = 10000):
        self.max_events_per_second = max_events_per_second
        self.token_bucket = max_events_per_second
        self.last_refill = time.time()
        self.lock = threading.Lock()
        self.dropped = 0

    def try_acquire(self) -> bool:
        with self.lock:
            now = time.time()
            elapsed = now - self.last_refill
            self.token_bucket = min(
                self.max_events_per_second,
                self.token_bucket + elapsed * self.max_events_per_second,
            )
            self.last_refill = now

            if self.token_bucket >= 1.0:
                self.token_bucket -= 1.0
                return True
            else:
                self.dropped += 1
                return False


class SyscallCollector:
    def __init__(
        self,
        socket_path: str,
        monitored_syscalls: List[str],
        whitelist: Optional[List[str]] = None,
        blacklist: Optional[List[str]] = None,
        update_interval: int = 1000,
        max_pending_events: int = 5000,
        max_events_per_second: int = 10000,
        sample_rate: int = 1,
    ):
        self.socket_path = socket_path
        self.monitored_syscalls: Set[str] = set(monitored_syscalls)
        self.whitelist: Set[str] = set(whitelist or [])
        self.blacklist: Set[str] = set(blacklist or [])
        self.update_interval = update_interval / 1000.0
        self.running = False
        self.bpf: Optional[BPF] = None
        self.sock: Optional[socket.socket] = None
        self.event_buffer: deque = deque(maxlen=max_pending_events)
        self.backpressure = BackpressureTracker(max_pending=max_pending_events)
        self.rate_limiter = RateLimiter(max_events_per_second=max_events_per_second)
        self.sample_rate = sample_rate
        self.batch_size = 100
        self.last_send_time = 0.0
        self.total_events_received = 0
        self.total_events_sent = 0
        self.total_events_dropped_kernel = 0
        self.last_dropped_check = 0.0
        self.send_lock = threading.Lock()

    def load_bpf_program(self) -> None:
        bpf_text = open(os.path.join(os.path.dirname(__file__), "bpf_program.c")).read()
        self.bpf = BPF(text=bpf_text)

        try:
            self.bpf["events"].open_ring_buffer(self.handle_event)
        except (AttributeError, TypeError):
            self.bpf["events"].open_perf_buffer(self.handle_event)

        if self.sample_rate > 1:
            try:
                sample_rate_key = 0
                self.bpf["sample_rate"][sample_rate_key] = self.bpf.ctypes.c_uint32(self.sample_rate)
            except Exception:
                pass

    def handle_event(self, cpu, data, size) -> None:
        try:
            event = self.bpf["events"].event(data)
        except Exception:
            return

        syscall_name = event.syscall.decode("utf-8", errors="replace").rstrip("\x00")

        if self.monitored_syscalls and syscall_name not in self.monitored_syscalls:
            return

        comm = event.comm.decode("utf-8", errors="replace").rstrip("\x00")

        if self.whitelist and comm not in self.whitelist:
            return

        if self.blacklist and comm in self.blacklist:
            return

        if not self.rate_limiter.try_acquire():
            return

        if self.backpressure.should_drop(len(self.event_buffer)):
            return

        self.total_events_received += 1

        event_data = {
            "timestamp": event.timestamp,
            "syscall": syscall_name,
            "pid": event.pid,
            "ppid": event.ppid,
            "comm": comm,
            "uid": event.uid,
            "gid": event.gid,
            "args": {f"arg{i}": getattr(event, "args")[i] for i in range(6)},
            "retval": event.retval,
            "duration": event.duration,
        }

        self.event_buffer.append(event_data)

    def connect_socket(self) -> bool:
        try:
            if os.path.exists(self.socket_path) or self.socket_path.startswith("\\\\.\\pipe\\"):
                self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 1024)
                self.sock.connect(self.socket_path)
                self.send_message("handshake", {"pid": os.getpid(), "timestamp": time.time() * 1000})
                return True
        except Exception as e:
            print(f"Failed to connect to socket: {e}", file=sys.stderr)
            return False
        return False

    def send_message(self, msg_type: str, data: any) -> None:
        if not self.sock:
            return

        message = {"type": msg_type, "data": data, "timestamp": time.time() * 1000}

        with self.send_lock:
            try:
                payload = (json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8")
                self.sock.sendall(payload)
            except socket.error as e:
                if e.errno in (11, 35, 115):
                    self.backpressure.should_drop(len(self.event_buffer))
                else:
                    print(f"Failed to send message: {e}", file=sys.stderr)
                    self.sock = None
            except Exception as e:
                print(f"Failed to send message: {e}", file=sys.stderr)
                self.sock = None

    def flush_events(self) -> None:
        if not self.event_buffer:
            return

        now = time.time()
        if now - self.last_send_time < self.update_interval and len(self.event_buffer) < self.batch_size:
            return

        events = []
        while self.event_buffer and len(events) < self.batch_size:
            events.append(self.event_buffer.popleft())

        if events:
            self.total_events_sent += len(events)
            if len(events) == 1:
                self.send_message("event", events[0])
            else:
                self.send_message("batch", events)

        self.last_send_time = now

    def check_kernel_drops(self) -> None:
        now = time.time()
        if now - self.last_dropped_check < 2.0:
            return
        self.last_dropped_check = now

        try:
            dropped_key = 0
            dropped_data = self.bpf["dropped"][dropped_key]
            current_dropped = dropped_data.count
            if current_dropped > self.total_events_dropped_kernel:
                new_drops = current_dropped - self.total_events_dropped_kernel
                self.total_events_dropped_kernel = current_dropped
                self.send_message(
                    "dropped_alert",
                    {
                        "kernel_dropped": new_drops,
                        "total_kernel_dropped": current_dropped,
                        "backpressure_dropped": self.backpressure.total_dropped,
                        "rate_limited_dropped": self.rate_limiter.dropped,
                        "buffer_size": len(self.event_buffer),
                    },
                )
        except Exception:
            pass

    def send_status(self) -> None:
        bp_stats = self.backpressure.get_stats()
        status = {
            "running": self.running,
            "events_received": self.total_events_received,
            "events_sent": self.total_events_sent,
            "events_buffered": len(self.event_buffer),
            "kernel_dropped": self.total_events_dropped_kernel,
            "backpressure_dropped": bp_stats["total_dropped"],
            "rate_limited_dropped": self.rate_limiter.dropped,
            "backpressure_paused": bp_stats["paused"],
            "monitored_syscalls": list(self.monitored_syscalls),
        }
        self.send_message("status", status)

    def start(self) -> None:
        print("Loading BPF program...")
        self.load_bpf_program()
        print("BPF program loaded successfully")

        print("Connecting to socket...")
        if not self.connect_socket():
            print("Warning: Failed to connect to socket. Will retry...", file=sys.stderr)

        self.running = True
        print("Collector started")

        last_status_time = 0.0
        last_flush_time = 0.0
        reconnect_interval = 5.0
        last_reconnect_attempt = 0.0

        try:
            while self.running:
                try:
                    try:
                        self.bpf.ring_buffer_poll(timeout=50)
                    except (AttributeError, TypeError):
                        self.bpf.perf_buffer_poll(timeout=50)
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"Error polling: {e}", file=sys.stderr)

                now = time.time()

                if not self.sock and now - last_reconnect_attempt > reconnect_interval:
                    print("Attempting to reconnect...")
                    if self.connect_socket():
                        print("Reconnected successfully")
                    last_reconnect_attempt = now

                if now - last_flush_time >= 0.1:
                    self.flush_events()
                    last_flush_time = now

                if now - last_status_time > 5.0:
                    self.send_status()
                    self.check_kernel_drops()
                    last_status_time = now

        finally:
            self.stop()

    def stop(self) -> None:
        print("Stopping collector...")
        self.running = False

        if self.event_buffer:
            events = list(self.event_buffer)
            self.event_buffer.clear()
            if events and self.sock:
                for i in range(0, len(events), self.batch_size):
                    batch = events[i : i + self.batch_size]
                    self.send_message("batch", batch)

        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

        if self.bpf:
            try:
                self.bpf.cleanup()
            except Exception:
                pass
            self.bpf = None

        print("Collector stopped")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="eBPF System Call Collector")
    parser.add_argument("--socket", required=True, help="Unix socket path for data transmission")
    parser.add_argument("--syscalls", default="", help="Comma-separated list of syscalls to monitor")
    parser.add_argument("--whitelist", default="", help="Comma-separated list of process names to whitelist")
    parser.add_argument("--blacklist", default="", help="Comma-separated list of process names to blacklist")
    parser.add_argument("--interval", type=int, default=1000, help="Update interval in milliseconds")
    parser.add_argument("--demo", action="store_true", help="Run in demo mode without eBPF")
    parser.add_argument("--max-pending", type=int, default=5000, help="Max pending events in buffer")
    parser.add_argument("--max-rate", type=int, default=10000, help="Max events per second to process")
    parser.add_argument("--sample-rate", type=int, default=1, help="Sample every Nth event (1=all, 10=every 10th)")
    return parser.parse_args()


def run_demo_mode(socket_path: str, update_interval: int) -> None:
    print("Running in demo mode...")

    demo_syscalls = ["open", "openat", "execve", "read", "write", "close", "fork", "clone"]
    demo_processes = ["bash", "python3", "node", "chrome", "firefox", "code", "nginx", "mysql"]

    sock = None
    try:
        if os.path.exists(socket_path) or socket_path.startswith("\\\\.\\pipe\\"):
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.connect(socket_path)
            print("Connected to socket")
    except Exception as e:
        print(f"Failed to connect to socket: {e}", file=sys.stderr)

    def send_message(msg_type: str, data: any) -> None:
        if not sock:
            print(f"[Demo] {msg_type}: {data}")
            return
        message = {"type": msg_type, "data": data, "timestamp": time.time() * 1000}
        try:
            sock.sendall((json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8"))
        except Exception as e:
            print(f"Failed to send message: {e}", file=sys.stderr)

    if sock:
        send_message("handshake", {"pid": os.getpid(), "timestamp": time.time() * 1000, "mode": "demo"})

    print("Collector started")

    try:
        while True:
            import random

            num_events = random.randint(1, 5)
            batch = []
            for _ in range(num_events):
                syscall = random.choice(demo_syscalls)
                comm = random.choice(demo_processes)
                pid = random.randint(1000, 65535)
                ppid = random.choice([1, 1000, pid - 1])

                event = {
                    "timestamp": time.time() * 1000,
                    "syscall": syscall,
                    "pid": pid,
                    "ppid": ppid,
                    "comm": comm,
                    "uid": random.choice([0, 1000, 1001]),
                    "gid": random.choice([0, 1000, 1001]),
                    "args": {"arg0": random.randint(0, 1000), "arg1": random.randint(0, 1000)},
                    "retval": random.choice([0, 1, -1, random.randint(0, 100)]),
                    "duration": random.randint(100, 10000),
                }
                batch.append(event)

            if len(batch) == 1:
                send_message("event", batch[0])
            else:
                send_message("batch", batch)

            time.sleep(update_interval / 1000.0)

    except KeyboardInterrupt:
        print("\nStopping demo mode...")
    finally:
        if sock:
            sock.close()
        print("Demo mode stopped")


def main() -> None:
    args = parse_args()

    monitored_syscalls = [s.strip() for s in args.syscalls.split(",") if s.strip()]
    whitelist = [s.strip() for s in args.whitelist.split(",") if s.strip()]
    blacklist = [s.strip() for s in args.blacklist.split(",") if s.strip()]

    if args.demo:
        run_demo_mode(args.socket, args.interval)
        return

    collector = SyscallCollector(
        socket_path=args.socket,
        monitored_syscalls=monitored_syscalls,
        whitelist=whitelist,
        blacklist=blacklist,
        update_interval=args.interval,
        max_pending_events=args.max_pending,
        max_events_per_second=args.max_rate,
        sample_rate=args.sample_rate,
    )

    try:
        collector.start()
    except KeyboardInterrupt:
        print("\nReceived interrupt, stopping...")
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        collector.send_message("error", str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
