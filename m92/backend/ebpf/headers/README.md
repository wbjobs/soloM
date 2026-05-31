# eBPF 头文件目录

此目录用于存放 eBPF 编译所需的头文件。

## 生成 vmlinux.h

在 Linux 环境下，需要生成 `vmlinux.h` 头文件，它包含了内核数据结构的 BTF 定义：

```bash
# 安装 bpftool（如果未安装）
sudo apt-get install linux-tools-common linux-tools-generic
# 或者
sudo yum install bpftool

# 生成 vmlinux.h
bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h
```

## 编译 eBPF 程序

```bash
cd backend/ebpf
go generate ./...
```

这将执行：
```bash
go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf ../../ebpf/syscall_trace.c -- -I./headers
```

生成的文件：
- `bpf_bpfel.o` - 编译后的 eBPF 目标文件（小端架构）
- `bpf_bpfel.go` - Go 绑定代码，包含 eBPF 程序和 Map 的定义

## 注意事项

1. `vmlinux.h` 是内核特定的，需要在目标机器上生成
2. 需要 clang/llvm >= 12 版本
3. 内核必须开启 `CONFIG_DEBUG_INFO_BTF=y`
4. 如果在非 Linux 环境开发，可以使用 Mock 模式跳过 eBPF 编译
