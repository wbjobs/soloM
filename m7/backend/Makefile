BPF_SRC = internal/ebpf
BPF_CFLAGS = -O2 -g -target bpf -D__TARGET_ARCH_x86
CLANG = clang
GO = go
IMAGE = cloudmon/netwatch:latest

.PHONY: all generate-bpf compile-bpf generate-go build clean docker

all: compile-bpf generate-go build

generate-bpf:
	$(GO) run github.com/cilium/ebpf/cmd/bpf2go \
		-target bpfel,bpfeb \
		-cc $(CLANG) \
		-cflags "$(BPF_CFLAGS)" \
		retransmit $(BPF_SRC)/tcp_retransmit.c -- -I$(BPF_SRC)

	$(GO) run github.com/cilium/ebpf/cmd/bpf2go \
		-target bpfel,bpfeb \
		-cc $(CLANG) \
		-cflags "$(BPF_CFLAGS)" \
		latency $(BPF_SRC)/tcp_latency.c -- -I$(BPF_SRC)

compile-bpf:
	$(CLANG) $(BPF_CFLAGS) -c $(BPF_SRC)/tcp_retransmit.c -o $(BPF_SRC)/tcp_retransmit.o
	$(CLANG) $(BPF_CFLAGS) -c $(BPF_SRC)/tcp_latency.c -o $(BPF_SRC)/tcp_latency.o

generate-go: compile-bpf
	$(GO) generate ./$(BPF_SRC)/...

build: generate-go
	CGO_ENABLED=0 $(GO) build -o bin/netwatch ./cmd/server

clean:
	rm -f $(BPF_SRC)/*.o
	rm -f bin/netwatch
	rm -f $(BPF_SRC)/*_bpfel.go $(BPF_SRC)/*_bpfeb.go

docker: build
	docker build -t $(IMAGE) .

run: build
	sudo ./bin/netwatch
