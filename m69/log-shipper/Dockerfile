FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o log-shipper .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/log-shipper .

CMD ["./log-shipper", "/app/config/config.yaml"]
