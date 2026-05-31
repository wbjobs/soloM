#!/usr/bin/env python3
"""
远程服务器监控数据采集脚本
依赖: pip install psutil
"""

import json
import sys
import psutil


def collect_metrics():
    metrics = {}

    metrics["cpu_percent"] = psutil.cpu_percent(interval=0.2)

    cpu_times = psutil.cpu_times_percent(interval=0.2)
    metrics["cpu_user"] = cpu_times.user
    metrics["cpu_system"] = cpu_times.system
    metrics["cpu_idle"] = cpu_times.idle
    metrics["cpu_iowait"] = getattr(cpu_times, "iowait", 0)
    metrics["cpu_steal"] = getattr(cpu_times, "steal", 0)

    mem = psutil.virtual_memory()
    metrics["memory_percent"] = mem.percent
    metrics["memory_total"] = mem.total
    metrics["memory_used"] = mem.used
    metrics["memory_available"] = mem.available
    metrics["memory_cached"] = getattr(mem, "cached", 0)
    metrics["memory_buffers"] = getattr(mem, "buffers", 0)

    swap = psutil.swap_memory()
    metrics["swap_percent"] = swap.percent
    metrics["swap_total"] = swap.total
    metrics["swap_used"] = swap.used

    disk_io = psutil.disk_io_counters()
    metrics["disk_read_count"] = disk_io.read_count
    metrics["disk_write_count"] = disk_io.write_count
    metrics["disk_read_bytes"] = disk_io.read_bytes
    metrics["disk_write_bytes"] = disk_io.write_bytes
    metrics["disk_read_time"] = disk_io.read_time
    metrics["disk_write_time"] = disk_io.write_time

    net_io = psutil.net_io_counters()
    metrics["network_bytes_sent"] = net_io.bytes_sent
    metrics["network_bytes_recv"] = net_io.bytes_recv
    metrics["network_packets_sent"] = net_io.packets_sent
    metrics["network_packets_recv"] = net_io.packets_recv
    metrics["network_errin"] = net_io.errin
    metrics["network_errout"] = net_io.errout
    metrics["network_dropin"] = net_io.dropin
    metrics["network_dropout"] = net_io.dropout

    metrics["disks"] = []
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            metrics["disks"].append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent
            })
        except (PermissionError, OSError):
            continue

    metrics["network_interfaces"] = []
    for name, addrs in psutil.net_if_addrs().items():
        ipv4 = ""
        ipv6 = ""
        mac = ""
        for addr in addrs:
            if addr.family == 2:
                ipv4 = addr.address
            elif addr.family == 10:
                ipv6 = addr.address
            elif addr.family == 17:
                mac = addr.address

        stats = psutil.net_if_stats().get(name)
        is_up = stats.isup if stats else False
        speed = stats.speed if stats else 0
        duplex = stats.duplex.name if stats else "unknown"
        mtu = stats.mtu if stats else 0

        metrics["network_interfaces"].append({
            "name": name,
            "ipv4": ipv4,
            "ipv6": ipv6,
            "mac": mac,
            "is_up": is_up,
            "speed": speed,
            "duplex": duplex,
            "mtu": mtu
        })

    metrics["processes"] = []
    try:
        for proc in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_info"]):
            try:
                info = proc.info
                mem_percent = proc.memory_percent()
                metrics["processes"].append({
                    "pid": info["pid"],
                    "name": info["name"],
                    "username": info["username"] or "",
                    "cpu_percent": info["cpu_percent"] or 0,
                    "memory_percent": mem_percent,
                    "memory_bytes": info["memory_info"].rss if info["memory_info"] else 0
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except PermissionError:
        pass

    return metrics


def main():
    try:
        metrics = collect_metrics()
        print(json.dumps(metrics))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
