package ebpf

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"

	"ebpf-syscall-monitor/types"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf ../../ebpf/syscall_trace.c -- -I./headers

type BPFObjects struct {
	EventsMap    *ebpf.Map `ebpf:"events"`
	ExecStartMap *ebpf.Map `ebpf:"exec_start"`
}

type BPFPrograms struct {
	TracepointSysEnterOpenat *ebpf.Program `ebpf:"tracepoint_sys_enter_openat"`
	TracepointSysEnterExecve *ebpf.Program `ebpf:"tracepoint_sys_enter_execve"`
}

type BpfContext struct {
	objs     BPFObjects
	progs    BPFPrograms
	links    []link.Link
	rbReader *ringbuf.Reader
}

func loadBPFELF() ([]byte, error) {
	elfPath := filepath.Join("ebpf", "bpf_bpfel.o")
	if _, err := os.Stat(elfPath); os.IsNotExist(err) {
		elfPath = "bpf_bpfel.o"
	}
	if _, err := os.Stat(elfPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("eBPF object file not found at %s or ebpf/bpf_bpfel.o. "+
			"Please run 'go generate ./...' in the backend/ebpf directory first", elfPath)
	}
	return os.ReadFile(elfPath)
}

func LoadBPF() (*BpfContext, error) {
	if err := rlimit.RemoveMemlock(); err != nil {
		return nil, fmt.Errorf("remove memlock: %w", err)
	}

	elfData, err := loadBPFELF()
	if err != nil {
		return nil, err
	}

	spec, err := ebpf.LoadCollectionSpecFromReader(bytes.NewReader(elfData))
	if err != nil {
		return nil, fmt.Errorf("load collection spec: %w", err)
	}

	var objs BPFObjects
	var progs BPFPrograms
	if err := spec.LoadAndAssign(map[string]interface{}{
		"events":      &objs.EventsMap,
		"exec_start":  &objs.ExecStartMap,
		"tracepoint_sys_enter_openat": &progs.TracepointSysEnterOpenat,
		"tracepoint_sys_enter_execve": &progs.TracepointSysEnterExecve,
	}, nil); err != nil {
		return nil, fmt.Errorf("load and assign: %w", err)
	}

	ctx := &BpfContext{
		objs:  objs,
		progs: progs,
	}

	if err := ctx.attachTracepoints(); err != nil {
		ctx.Close()
		return nil, err
	}

	rb, err := ringbuf.NewReader(objs.EventsMap)
	if err != nil {
		ctx.Close()
		return nil, fmt.Errorf("create ringbuf reader: %w", err)
	}
	ctx.rbReader = rb

	return ctx, nil
}

func (b *BpfContext) attachTracepoints() error {
	tpOpenat, err := link.Tracepoint("syscalls", "sys_enter_openat", b.progs.TracepointSysEnterOpenat, nil)
	if err != nil {
		return fmt.Errorf("attach sys_enter_openat: %w", err)
	}
	b.links = append(b.links, tpOpenat)

	tpExecve, err := link.Tracepoint("syscalls", "sys_enter_execve", b.progs.TracepointSysEnterExecve, nil)
	if err != nil {
		return fmt.Errorf("attach sys_enter_execve: %w", err)
	}
	b.links = append(b.links, tpExecve)

	log.Println("eBPF tracepoints attached successfully")
	return nil
}

type bpfEvent struct {
	PID         uint32
	TGID        uint32
	Timestamp   uint64
	Comm        [16]byte
	SyscallID   uint32
	SyscallName [16]byte
	Filename    [256]byte
	Argv        [128]byte
}

func (b *BpfContext) ReadEvent() (*types.SyscallEvent, error) {
	record, err := b.rbReader.Read()
	if err != nil {
		return nil, err
	}

	var ev bpfEvent
	if err := record.RawSample.Unmarshal(&ev); err != nil {
		return nil, fmt.Errorf("unmarshal event: %w", err)
	}

	return &types.SyscallEvent{
		PID:         ev.PID,
		TGID:        ev.TGID,
		Timestamp:   ev.Timestamp,
		Comm:        cstr(ev.Comm[:]),
		SyscallID:   ev.SyscallID,
		SyscallName: cstr(ev.SyscallName[:]),
		Filename:    cstr(ev.Filename[:]),
		Argv:        cstr(ev.Argv[:]),
	}, nil
}

func (b *BpfContext) ReadBatch(maxBatchSize int) ([]*types.SyscallEvent, uint64, error) {
	events := make([]*types.SyscallEvent, 0, maxBatchSize)
	var dropped uint64

	for len(events) < maxBatchSize {
		record, err := b.rbReader.Read()
		if err != nil {
			if len(events) > 0 {
				return events, dropped, nil
			}
			return nil, dropped, err
		}

		dropped += record.Dropped

		var ev bpfEvent
		if err := record.RawSample.Unmarshal(&ev); err != nil {
			continue
		}

		events = append(events, &types.SyscallEvent{
			PID:         ev.PID,
			TGID:        ev.TGID,
			Timestamp:   ev.Timestamp,
			Comm:        cstr(ev.Comm[:]),
			SyscallID:   ev.SyscallID,
			SyscallName: cstr(ev.SyscallName[:]),
			Filename:    cstr(ev.Filename[:]),
			Argv:        cstr(ev.Argv[:]),
		})
	}

	return events, dropped, nil
}

func (b *BpfContext) Close() {
	for _, l := range b.links {
		l.Close()
	}
	if b.rbReader != nil {
		b.rbReader.Close()
	}
	if b.objs.EventsMap != nil {
		b.objs.EventsMap.Close()
	}
	if b.objs.ExecStartMap != nil {
		b.objs.ExecStartMap.Close()
	}
	if b.progs.TracepointSysEnterOpenat != nil {
		b.progs.TracepointSysEnterOpenat.Close()
	}
	if b.progs.TracepointSysEnterExecve != nil {
		b.progs.TracepointSysEnterExecve.Close()
	}
}

func cstr(b []byte) string {
	n := bytes.IndexByte(b, 0)
	if n == -1 {
		return string(b)
	}
	return string(b[:n])
}
