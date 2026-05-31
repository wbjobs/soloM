package bpf

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -target bpfel -type latency_event latency_kern ./latency_kern.c -- -I/usr/include/bpf -I.
