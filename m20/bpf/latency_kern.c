#include <linux/types.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>
#include <linux/skbuff.h>
#include <net/sock.h>

#define MAX_LATENCY_NS 5000000000ULL
#define MAX_ENTRY_AGE_NS 5000000000ULL
#define HIGH_LATENCY_THRESHOLD_NS 100000000ULL
#define MAX_STACK_DEPTH 127

#define EVENT_TYPE_LATENCY 1
#define EVENT_TYPE_RETRANSMIT 2
#define EVENT_TYPE_HIGH_LATENCY_STACK 3

struct latency_event {
	__u32 pid;
	__u32 tid;
	__u64 latency_ns;
	__u64 enter_ts;
	__u64 return_ts;
	char comm[16];
};

struct sendmsg_args {
	__u64 ts;
};

struct event_header {
	__u32 event_type;
	__u32 pid;
	__u32 tid;
	__u64 timestamp;
	char comm[16];
};

struct latency_with_stack_event {
	struct event_header hdr;
	__u64 latency_ns;
	__u32 stack_id;
	__u32 daddr;
	__u16 dport;
};

struct retransmit_event {
	struct event_header hdr;
	__u32 stack_id;
	__u32 saddr;
	__u32 daddr;
	__u16 sport;
	__u16 dport;
	__u32 seq;
	__u32 state;
};

struct {
	__uint(type, BPF_MAP_TYPE_LRU_HASH);
	__uint(max_entries, 65536);
	__type(key, __u64);
	__type(value, struct sendmsg_args);
} start_map SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_STACK_TRACE);
	__uint(max_entries, 10240);
	__type(key, __u32);
	__type(value, __u64[MAX_STACK_DEPTH]);
} stack_traces SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(key_size, sizeof(__u32));
	__uint(value_size, sizeof(__u32));
} events SEC(".maps");

struct {
	__uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
	__uint(key_size, sizeof(__u32));
	__uint(value_size, sizeof(__u32));
} stack_events SEC(".maps");

SEC("kprobe/tcp_sendmsg")
int BPF_KPROBE(trace_tcp_sendmsg_enter, struct sock *sk, struct msghdr *msg, size_t size)
{
	__u64 pid_tgid = bpf_get_current_pid_tgid();
	__u64 ts = bpf_ktime_get_ns();

	struct sendmsg_args args = {};
	args.ts = ts;

	bpf_map_update_elem(&start_map, &pid_tgid, &args, BPF_ANY);

	return 0;
}

SEC("kretprobe/tcp_sendmsg")
int BPF_KRETPROBE(trace_tcp_sendmsg_return, int ret)
{
	__u64 pid_tgid = bpf_get_current_pid_tgid();
	__u32 pid = pid_tgid >> 32;
	__u32 tid = (__u32)pid_tgid;

	struct sendmsg_args *args = bpf_map_lookup_elem(&start_map, &pid_tgid);
	if (!args)
		return 0;

	__u64 return_ts = bpf_ktime_get_ns();

	if (return_ts <= args->ts || (return_ts - args->ts) > MAX_ENTRY_AGE_NS) {
		bpf_map_delete_elem(&start_map, &pid_tgid);
		return 0;
	}

	__u64 latency_ns = return_ts - args->ts;
	if (latency_ns > MAX_LATENCY_NS) {
		bpf_map_delete_elem(&start_map, &pid_tgid);
		return 0;
	}

	struct latency_event event = {};
	event.pid = pid;
	event.tid = tid;
	event.latency_ns = latency_ns;
	event.enter_ts = args->ts;
	event.return_ts = return_ts;
	bpf_get_current_comm(&event.comm, sizeof(event.comm));

	bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &event, sizeof(event));

	if (latency_ns > HIGH_LATENCY_THRESHOLD_NS) {
		struct latency_with_stack_event stack_event = {};

		stack_event.hdr.event_type = EVENT_TYPE_HIGH_LATENCY_STACK;
		stack_event.hdr.pid = pid;
		stack_event.hdr.tid = tid;
		stack_event.hdr.timestamp = bpf_ktime_get_ns();
		bpf_get_current_comm(&stack_event.hdr.comm, sizeof(stack_event.hdr.comm));
		stack_event.latency_ns = latency_ns;

		stack_event.stack_id = bpf_get_stackid(ctx, &stack_traces, BPF_F_USER_STACK);
		if (stack_event.stack_id < 0) {
			stack_event.stack_id = bpf_get_stackid(ctx, &stack_traces, 0);
		}

		bpf_perf_event_output(ctx, &stack_events, BPF_F_CURRENT_CPU,
				     &stack_event, sizeof(stack_event));
	}

	bpf_map_delete_elem(&start_map, &pid_tgid);

	return 0;
}

SEC("tracepoint/tcp/tcp_retransmit_skb")
int tracepoint_tcp_retransmit_skb(struct bpf_raw_tracepoint_args *ctx)
{
	struct sk_buff *skb = (struct sk_buff *)ctx->args[0];
	struct sock *sk = (struct sock *)ctx->args[1];

	if (!sk || !skb)
		return 0;

	__u64 pid_tgid = bpf_get_current_pid_tgid();
	__u32 pid = pid_tgid >> 32;
	__u32 tid = (__u32)pid_tgid;

	struct retransmit_event event = {};
	event.hdr.event_type = EVENT_TYPE_RETRANSMIT;
	event.hdr.pid = pid;
	event.hdr.tid = tid;
	event.hdr.timestamp = bpf_ktime_get_ns();
	bpf_get_current_comm(&event.hdr.comm, sizeof(event.hdr.comm));

	__u16 sport = 0;
	__u16 dport = 0;
	__u32 saddr = 0;
	__u32 daddr = 0;
	__u32 seq = 0;
	__u8 state = 0;

	struct tcp_sock *tp = (struct tcp_sock *)sk;
	BPF_CORE_READ_INTO(&sport, sk, __sk_common.skc_num);
	BPF_CORE_READ_INTO(&dport, sk, __sk_common.skc_dport);
	BPF_CORE_READ_INTO(&saddr, sk, __sk_common.skc_rcv_saddr);
	BPF_CORE_READ_INTO(&daddr, sk, __sk_common.skc_daddr);
	BPF_CORE_READ_INTO(&seq, tp, write_seq);
	BPF_CORE_READ_INTO(&state, sk, __sk_common.skc_state);

	event.saddr = saddr;
	event.daddr = daddr;
	event.sport = sport;
	event.dport = __builtin_bswap16(dport);
	event.seq = seq;
	event.state = state;

	event.stack_id = bpf_get_stackid(ctx, &stack_traces, 0);

	bpf_perf_event_output(ctx, &stack_events, BPF_F_CURRENT_CPU,
			     &event, sizeof(event));

	return 0;
}

char _license[] SEC("license") = "GPL";
