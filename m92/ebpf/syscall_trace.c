//go:build ignore

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

#define TASK_COMM_LEN 16
#define MAX_FILENAME_LEN 256
#define MAX_ARGV_LEN 128

struct event {
    __u32 pid;
    __u32 tgid;
    __u64 timestamp;
    char comm[TASK_COMM_LEN];
    __u32 syscall_id;
    char syscall_name[16];
    char filename[MAX_FILENAME_LEN];
    char argv[MAX_ARGV_LEN];
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u32);
    __type(value, struct event);
} exec_start SEC(".maps");

static __always_inline int get_task_info(struct event *e)
{
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    e->tgid = bpf_get_current_pid_tgid() >> 32;
    e->pid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    e->timestamp = bpf_ktime_get_ns();
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_openat")
int tracepoint_sys_enter_openat(struct trace_event_raw_sys_enter *ctx)
{
    struct event *e;
    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e)
        return 0;

    get_task_info(e);
    e->syscall_id = 257;
    __builtin_memcpy(e->syscall_name, "openat", sizeof("openat"));

    const char __user *filename = (const char __user *)ctx->args[1];
    bpf_probe_read_user_str(e->filename, sizeof(e->filename), filename);
    e->argv[0] = '\0';

    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_execve")
int tracepoint_sys_enter_execve(struct trace_event_raw_sys_enter *ctx)
{
    struct event *e;
    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e)
        return 0;

    get_task_info(e);
    e->syscall_id = 59;
    __builtin_memcpy(e->syscall_name, "execve", sizeof("execve"));

    const char __user *filename = (const char __user *)ctx->args[0];
    bpf_probe_read_user_str(e->filename, sizeof(e->filename), filename);

    const char __user *const __user *argv = (const char __user *const __user *)ctx->args[1];
    if (argv) {
        const char __user *arg;
        bpf_probe_read_user(&arg, sizeof(arg), &argv[0]);
        if (arg)
            bpf_probe_read_user_str(e->argv, sizeof(e->argv), arg);
    }

    bpf_ringbuf_submit(e, 0);
    return 0;
}

char LICENSE[] SEC("license") = "Dual BSD/GPL";
