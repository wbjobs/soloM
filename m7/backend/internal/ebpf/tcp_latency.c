#ifndef __VMLINUX_H__
#define __VMLINUX_H__

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long long u64;

typedef u16 __be16;
typedef u32 __be32;

struct trace_event_common {
    u16 type;
    u8 flags;
    u8 preempt_count;
    int pid;
};

struct trace_event_tcp_set_state {
    struct trace_event_common common;
    const void *skaddr;
    int oldstate;
    int newstate;
    u16 sport;
    u16 dport;
    u8 saddr[4];
    u8 daddr[4];
    u8 saddr_v6[16];
    u8 daddr_v6[16];
};

#define MIN_VALID_LATENCY_US 1
#define MAX_VALID_LATENCY_US 30000000

struct conn_key {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
};

struct conn_track {
    u64 start_ns;
    u32 pid;
    char comm[16];
};

struct latency_event {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
    u32 pid;
    char comm[16];
    u64 connect_ns;
    u64 latency_us;
};

#endif

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 65536);
    __type(key, struct conn_key);
    __type(value, struct conn_track);
} conn_track_map SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(max_entries, 128);
    __type(key, u32);
    __type(value, u32);
} latency_events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, u32);
    __type(value, struct latency_event);
} evt_buf SEC(".maps");

SEC("tracepoint/sock/inet_sock_set_state")
int trace_inet_sock_set_state(void *ctx)
{
    struct trace_event_tcp_set_state *tc = (struct trace_event_tcp_set_state *)ctx;

    if (tc->newstate != 1 && tc->oldstate != 1)
        return 0;

    u8 saddr[4] = {};
    u8 daddr[4] = {};
    bpf_probe_read_kernel(saddr, sizeof(saddr), tc->saddr);
    bpf_probe_read_kernel(daddr, sizeof(daddr), tc->daddr);

    struct conn_key key = {};
    key.src_ip = *(u32 *)saddr;
    key.dst_ip = *(u32 *)daddr;
    key.src_port = tc->sport;
    key.dst_port = tc->dport;

    if (tc->newstate == 1) {
        struct conn_track track = {};
        track.start_ns = bpf_ktime_get_ns();
        u64 pid_tgid = bpf_get_current_pid_tgid();
        track.pid = (u32)(pid_tgid >> 32);
        bpf_get_current_comm(&track.comm, sizeof(track.comm));
        bpf_map_update_elem(&conn_track_map, &key, &track, BPF_ANY);
        return 0;
    }

    if (tc->oldstate == 1) {
        struct conn_track *track = bpf_map_lookup_elem(&conn_track_map, &key);
        if (!track)
            return 0;

        u32 zero = 0;
        struct latency_event *evt = bpf_map_lookup_elem(&evt_buf, &zero);
        if (!evt) {
            bpf_map_delete_elem(&conn_track_map, &key);
            return 0;
        }

        u64 now = bpf_ktime_get_ns();
        u64 latency_us = (now - track->start_ns) / 1000;

        if (latency_us < MIN_VALID_LATENCY_US || latency_us > MAX_VALID_LATENCY_US) {
            bpf_map_delete_elem(&conn_track_map, &key);
            return 0;
        }

        evt->src_ip = key.src_ip;
        evt->dst_ip = key.dst_ip;
        evt->src_port = key.src_port;
        evt->dst_port = key.dst_port;
        evt->pid = track->pid;
        __builtin_memcpy(evt->comm, track->comm, sizeof(evt->comm));
        evt->connect_ns = track->start_ns;
        evt->latency_us = latency_us;

        u64 cpu = bpf_get_smp_processor_id();
        bpf_perf_event_output(ctx, &latency_events, BPF_F_CURRENT_CPU, evt, sizeof(*evt));

        bpf_map_delete_elem(&conn_track_map, &key);
    }

    return 0;
}

char _license[] SEC("license") = "GPL";
