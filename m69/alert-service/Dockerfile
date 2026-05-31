FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o alert-service .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/alert-service .

CMD ["./alert-service", "/app/config/config.yaml"]
