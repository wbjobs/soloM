#include <uapi/linux/ptrace.h>
#include <linux/sched.h>
#include <linux/fs.h>

#define TASK_COMM_LEN 16
#define SYSCALL_NAME_LEN 32
#define MAX_ARGS 6
#define MAX_ENTRIES 131072
#define SAMPLE_RATE_DEFAULT 1

struct event_t {
    u64 timestamp;
    u32 pid;
    u32 ppid;
    char comm[TASK_COMM_LEN];
    char syscall[SYSCALL_NAME_LEN];
    u64 args[MAX_ARGS];
    s64 retval;
    u64 duration;
    u32 uid;
    u32 gid;
};

struct dropped_count_t {
    u64 count;
};

BPF_RINGBUF(events, MAX_ENTRIES * sizeof(struct event_t));
BPF_HASH(start, u32, u64, MAX_ENTRIES);
BPF_HASH(syscall_name, u32, char[SYSCALL_NAME_LEN], MAX_ENTRIES);
BPF_PERCPU_ARRAY(dropped, struct dropped_count_t, 1);
BPF_ARRAY(sample_rate, u32, 1);

static inline int should_sample() {
    u32 key = 0;
    u32 *rate = sample_rate.lookup(&key);
    if (!rate || *rate == 0) return 1;
    if (*rate == 1) return 1;
    u64 ts = bpf_ktime_get_ns();
    return (ts % *rate) == 0 ? 1 : 0;
}

static inline void record_dropped() {
    u32 key = 0;
    struct dropped_count_t *dc = dropped.lookup(&key);
    if (dc) {
        dc->count++;
    } else {
        struct dropped_count_t new_dc = {.count = 1};
        dropped.update(&key, &new_dc);
    }
}

static inline void set_syscall_name(long syscall_id, char *out) {
    switch (syscall_id) {
        case 0: __builtin_memcpy(out, "read", 5); break;
        case 1: __builtin_memcpy(out, "write", 6); break;
        case 2: __builtin_memcpy(out, "open", 5); break;
        case 3: __builtin_memcpy(out, "close", 6); break;
        case 56: __builtin_memcpy(out, "openat", 7); break;
        case 57: __builtin_memcpy(out, "pipe", 5); break;
        case 59: __builtin_memcpy(out, "execve", 7); break;
        case 322: __builtin_memcpy(out, "execveat", 9); break;
        case 220: __builtin_memcpy(out, "clone", 6); break;
        default: {
            out[0] = 's'; out[1] = 'y'; out[2] = 's'; out[3] = '_';
            int i = 4;
            long n = syscall_id;
            if (n < 0) { out[i++] = '-'; n = -n; }
            char tmp[16];
            int j = 0;
            if (n == 0) { tmp[j++] = '0'; }
            else { while (n > 0 && j < 15) { tmp[j++] = '0' + (n % 10); n /= 10; } }
            while (j > 0 && i < SYSCALL_NAME_LEN - 1) { out[i++] = tmp[--j]; }
            out[i] = '\0';
        }
    }
}

TRACEPOINT_PROBE(raw_syscalls, sys_enter) {
    if (!should_sample()) return 0;

    u64 id = bpf_get_current_pid_tgid();
    u32 pid = id >> 32;
    u64 ts = bpf_ktime_get_ns();

    long err = start.update(&pid, &ts);
    if (err < 0) {
        record_dropped();
        return 0;
    }

    char comm[TASK_COMM_LEN];
    bpf_get_current_comm(&comm, sizeof(comm));

    long syscall_id = args->id;
    char sname[SYSCALL_NAME_LEN] = {};
    set_syscall_name(syscall_id, sname);

    err = bpf_map_update_elem(&syscall_name, &pid, sname, BPF_ANY);
    if (err < 0) {
        record_dropped();
        bpf_map_delete_elem(&start, &pid);
        return 0;
    }

    return 0;
}

TRACEPOINT_PROBE(raw_syscalls, sys_exit) {
    if (!should_sample()) return 0;

    u64 id = bpf_get_current_pid_tgid();
    u32 pid = id >> 32;

    u64 *start_ts = bpf_map_lookup_elem(&start, &pid);
    if (!start_ts) return 0;

    char *sname = bpf_map_lookup_elem(&syscall_name, &pid);
    if (!sname) {
        bpf_map_delete_elem(&start, &pid);
        return 0;
    }

    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    u32 ppid = 0;
    bpf_probe_read_kernel(&ppid, sizeof(ppid), &task->real_parent->tgid);

    struct event_t event = {};
    event.timestamp = bpf_ktime_get_ns() / 1000000;
    event.pid = pid;
    event.ppid = ppid;
    event.duration = bpf_ktime_get_ns() - *start_ts;
    event.retval = args->ret;

    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    __builtin_memcpy(event.syscall, sname, SYSCALL_NAME_LEN);

    u64 uid_gid = bpf_get_current_uid_gid();
    event.uid = uid_gid & 0xFFFFFFFF;
    event.gid = uid_gid >> 32;

    event.args[0] = PT_REGS_PARM1((struct pt_regs *)args);
    event.args[1] = PT_REGS_PARM2((struct pt_regs *)args);
    event.args[2] = PT_REGS_PARM3((struct pt_regs *)args);
    event.args[3] = PT_REGS_PARM4((struct pt_regs *)args);
    event.args[4] = PT_REGS_PARM5((struct pt_regs *)args);
    event.args[5] = PT_REGS_PARM6((struct pt_regs *)args);

    long err = events.ringbuf_output(&event, sizeof(event), BPF_RB_FORCE_WAKEUP);
    if (err < 0) {
        record_dropped();
    }

    bpf_map_delete_elem(&start, &pid);
    bpf_map_delete_elem(&syscall_name, &pid);

    return 0;
}
