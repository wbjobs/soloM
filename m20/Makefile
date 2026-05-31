.PHONY: generate build clean run

BPF_SRC = bpf/latency_kern.c
BINARY = latency-tracer

generate:
	go generate ./bpf/...

build: generate
	CGO_ENABLED=0 go build -o $(BINARY) ./cmd/

run: build
	sudo ./$(BINARY) \
		-listen :9090 \
		-window 60 \
		-max-latency 5000000000 \
		-cleanup-interval 30 \
		-entry-ttl 10 \
		-high-latency-threshold 100000000 \
		-flamegraph-window 300 \
		-max-stack-events 10000 \
		-enable-retransmit=true \
		-enable-stacks=true

clean:
	rm -f $(BINARY)
	rm -f bpf/latency_kern.o
	rm -f bpf/latency_kern_bpf*.go
