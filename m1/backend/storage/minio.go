package storage

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"time"

	"dicom-backend/config"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var MinIOClient *minio.Client

const (
	minioOperationTimeout = 60 * time.Second
	minioUploadTimeout    = 120 * time.Second
	minioDownloadTimeout  = 90 * time.Second
)

func Init() {
	cfg := config.AppConfig.MinIO

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          cfg.MaxIdleConns,
		MaxIdleConnsPerHost:   cfg.MaxIdleConnsPerHost,
		MaxConnsPerHost:       cfg.MaxConnsPerHost,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	if cfg.UseSSL {
		transport.TLSClientConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}

	var err error
	MinIOClient, err = minio.New(cfg.Endpoint, &minio.Options{
		Creds:     credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure:    cfg.UseSSL,
		Transport: transport,
	})
	if err != nil {
		log.Fatalf("Failed to create MinIO client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for i := 0; i < 10; i++ {
		_, err = MinIOClient.ListBuckets(ctx)
		if err == nil {
			break
		}
		log.Printf("Waiting for MinIO to be ready... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}

	if err = ensureBucket(cfg.Bucket); err != nil {
		log.Fatalf("Failed to ensure bucket exists: %v", err)
	}

	log.Printf("MinIO connection established (pool: maxConns=%d, maxIdle=%d, idlePerHost=%d)",
		cfg.MaxConnsPerHost, cfg.MaxIdleConns, cfg.MaxIdleConnsPerHost)
}

func ensureBucket(bucketName string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	exists, err := MinIOClient.BucketExists(ctx, bucketName)
	if err != nil {
		return fmt.Errorf("failed to check bucket existence: %w", err)
	}

	if !exists {
		if err = MinIOClient.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("failed to create bucket: %w", err)
		}
		log.Printf("Created MinIO bucket: %s", bucketName)
	}

	return nil
}

func UploadFile(objectName string, reader io.Reader, size int64, contentType string) (int64, error) {
	cfg := config.AppConfig.MinIO
	ctx, cancel := context.WithTimeout(context.Background(), minioUploadTimeout)
	defer cancel()

	var uploadInfo minio.UploadInfo
	var err error

	for attempt := 0; attempt < 3; attempt++ {
		seeker, canSeek := reader.(io.Seeker)
		if canSeek && attempt > 0 {
			_, _ = seeker.Seek(0, io.SeekStart)
		}

		uploadInfo, err = MinIOClient.PutObject(ctx, cfg.Bucket, objectName, reader, size, minio.PutObjectOptions{
			ContentType: contentType,
		})
		if err == nil {
			return uploadInfo.Size, nil
		}

		log.Printf("MinIO upload attempt %d failed for %s: %v", attempt+1, objectName, err)

		if attempt < 2 {
			backoff := time.Duration(attempt+1) * 500 * time.Millisecond
			time.Sleep(backoff)
		}
	}

	return 0, fmt.Errorf("failed to upload file after 3 attempts: %w", err)
}

func UploadFromBytes(objectName string, data []byte, contentType string) (int64, error) {
	cfg := config.AppConfig.MinIO
	ctx, cancel := context.WithTimeout(context.Background(), minioUploadTimeout)
	defer cancel()

	reader := bytes.NewReader(data)

	var uploadInfo minio.UploadInfo
	var err error

	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			_, _ = reader.Seek(0, io.SeekStart)
		}

		uploadInfo, err = MinIOClient.PutObject(ctx, cfg.Bucket, objectName, reader, int64(len(data)), minio.PutObjectOptions{
			ContentType: contentType,
		})
		if err == nil {
			return uploadInfo.Size, nil
		}

		log.Printf("MinIO upload attempt %d failed for %s: %v", attempt+1, objectName, err)

		if attempt < 2 {
			backoff := time.Duration(attempt+1) * 500 * time.Millisecond
			time.Sleep(backoff)
		}
	}

	return 0, fmt.Errorf("failed to upload file after 3 attempts: %w", err)
}

func GetFile(objectName string) (io.ReadCloser, int64, string, error) {
	cfg := config.AppConfig.MinIO
	ctx, cancel := context.WithTimeout(context.Background(), minioDownloadTimeout)
	defer cancel()

	obj, err := MinIOClient.GetObject(ctx, cfg.Bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, "", fmt.Errorf("failed to get object: %w", err)
	}

	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, 0, "", fmt.Errorf("failed to stat object: %w", err)
	}

	return obj, stat.Size, stat.ContentType, nil
}

func DeleteFile(objectName string) error {
	cfg := config.AppConfig.MinIO
	ctx, cancel := context.WithTimeout(context.Background(), minioOperationTimeout)
	defer cancel()

	err := MinIOClient.RemoveObject(ctx, cfg.Bucket, objectName, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}

	return nil
}

func GetPresignedURL(objectName string, expires time.Duration) (string, error) {
	cfg := config.AppConfig.MinIO
	ctx, cancel := context.WithTimeout(context.Background(), minioOperationTimeout)
	defer cancel()

	url, err := MinIOClient.PresignedGetObject(ctx, cfg.Bucket, objectName, expires, nil)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return url.String(), nil
}

func CheckHealth() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := MinIOClient.ListBuckets(ctx)
	if err != nil {
		return fmt.Errorf("MinIO health check failed: %w", err)
	}
	return nil
}
