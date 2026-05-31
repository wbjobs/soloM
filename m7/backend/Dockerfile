FROM golang:1.21-bookworm AS builder

RUN apt-get update && apt-get install -y clang llvm make

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN make build

FROM gcr.io/distroless/static-debian12
COPY --from=builder /src/bin/netwatch /netwatch
ENTRYPOINT ["/netwatch"]
