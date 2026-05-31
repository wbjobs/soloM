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

struct trace_event_tcp_retransmit_skb {
    struct trace_event_common common;
    const void *skaddr;
    u16 sport;
    u16 dport;
    u8 saddr[4];
    u8 daddr[4];
    u8 saddr_v6[16];
    u8 daddr_v6[16];
};

#define MAX_RETRANSMIT_COUNT 100000

struct retransmit_key {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
};

struct retransmit_event {
    u32 src_ip;
    u32 dst_ip;
    u16 src_port;
    u16 dst_port;
    u32 pid;
    char comm[16];
    u64 timestamp;
    u32 count;
};

#endif

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 65536);
    __type(key, struct retransmit_key);
    __type(value, struct retransmit_event);
} retransmit_map SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, u32);
    __type(value, struct retransmit_event);
} event_buf SEC(".maps");

static __always_inline __be16 load_half(const void *ptr)
{
    __be16 val;
    bpf_probe_read_kernel(&val, sizeof(val), ptr);
    return val;
}

static __always_inline u32 load_word(const void *ptr)
{
    u32 val;
    bpf_probe_read_kernel(&val, sizeof(val), ptr);
    return val;
}

SEC("tracepoint/tcp/tcp_retransmit_skb")
int trace_tcp_retransmit_skb(void *ctx)
{
    struct trace_event_tcp_retransmit_skb *tc = (struct trace_event_tcp_retransmit_skb *)ctx;
    u32 zero = 0;

    struct retransmit_event *evt = bpf_map_lookup_elem(&event_buf, &zero);
    if (!evt)
        return 0;

    u64 pid_tgid = bpf_get_current_pid_tgid();
    evt->pid = (u32)(pid_tgid >> 32);
    bpf_get_current_comm(&evt->comm, sizeof(evt->comm));
    evt->timestamp = bpf_ktime_get_ns();
    evt->count = 1;

    u8 saddr[4] = {};
    u8 daddr[4] = {};
    bpf_probe_read_kernel(saddr, sizeof(saddr), tc->saddr);
    bpf_probe_read_kernel(daddr, sizeof(daddr), tc->daddr);

    evt->src_ip = *(u32 *)saddr;
    evt->dst_ip = *(u32 *)daddr;
    evt->src_port = tc->sport;
    evt->dst_port = tc->dport;

    struct retransmit_key key = {};
    key.src_ip = evt->src_ip;
    key.dst_ip = evt->dst_ip;
    key.src_port = evt->src_port;
    key.dst_port = evt->dst_port;

    struct retransmit_event *existing = bpf_map_lookup_elem(&retransmit_map, &key);
    if (existing) {
        if (existing->count < MAX_RETRANSMIT_COUNT) {
            existing->count++;
        }
        existing->timestamp = evt->timestamp;
        if (evt->pid)
            existing->pid = evt->pid;
    } else {
        bpf_map_update_elem(&retransmit_map, &key, evt, BPF_ANY);
    }

    return 0;
}

char _license[] SEC("license") = "GPL";
