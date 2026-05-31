package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"dicom-backend/config"
	"dicom-backend/db"
	"dicom-backend/models"
	"dicom-backend/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type uploadLimiter struct {
	sem chan struct{}
}

func newUploadLimiter(maxConcurrent int) *uploadLimiter {
	return &uploadLimiter{
		sem: make(chan struct{}, maxConcurrent),
	}
}

func (l *uploadLimiter) Acquire() bool {
	select {
	case l.sem <- struct{}{}:
		return true
	default:
		return false
	}
}

func (l *uploadLimiter) Release() {
	<-l.sem
}

var uploadLimiterInstance *uploadLimiter

func InitUploadLimiter() {
	uploadLimiterInstance = newUploadLimiter(config.AppConfig.UploadRateLimit)
	log.Printf("Upload rate limiter initialized: max %d concurrent uploads", config.AppConfig.UploadRateLimit)
}

func UploadImage(c *gin.Context) {
	if !uploadLimiterInstance.Acquire() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{
			Error: "Server is busy. Too many concurrent uploads. Please retry later.",
		})
		return
	}
	defer uploadLimiterInstance.Release()

	_, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		log.Printf("Error getting file: %v", err)
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to get uploaded file"})
		return
	}
	defer file.Close()

	if header.Size > config.AppConfig.MaxUploadSize {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: fmt.Sprintf("File too large. Maximum size is %d MB", config.AppConfig.MaxUploadSize/1024/1024),
		})
		return
	}

	metadataStr := c.PostForm("metadata")
	if metadataStr == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Metadata is required"})
		return
	}

	var metadata models.ImageMetadata
	if err = json.Unmarshal([]byte(metadataStr), &metadata); err != nil {
		log.Printf("Error parsing metadata: %v", err)
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid metadata format"})
		return
	}

	fileBytes, err := io.ReadAll(io.LimitReader(file, config.AppConfig.MaxUploadSize+1))
	if err != nil {
		log.Printf("Error reading file: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to read file"})
		return
	}
	file.Close()

	if int64(len(fileBytes)) > config.AppConfig.MaxUploadSize {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "File exceeds size limit"})
		return
	}

	hash := sha256.Sum256(fileBytes)
	hashStr := hex.EncodeToString(hash[:])
	objectName := fmt.Sprintf("%s_%s.png", time.Now().Format("2006/01/02"), hashStr[:16])

	uploadSize, err := storage.UploadFromBytes(objectName, fileBytes, "image/png")
	if err != nil {
		log.Printf("Error uploading to MinIO: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to store image"})
		return
	}

	fileBytes = nil

	img := &models.Image{
		PatientID:        metadata.PatientID,
		StudyUID:         metadata.StudyUID,
		SeriesUID:        metadata.SeriesUID,
		SOPInstanceUID:   metadata.SOPInstanceUID,
		Modality:         metadata.Modality,
		BodyPartExamined: metadata.BodyPartExamined,
		StudyDate:        metadata.StudyDate,
		MinIOBucket:      config.AppConfig.MinIO.Bucket,
		MinIOObjectName:  objectName,
		FileSize:         uploadSize,
		Width:            int(metadata.Width),
		Height:           int(metadata.Height),
		BitsAllocated:    int(metadata.BitsAllocated),
		WindowCenter:     int(metadata.WindowCenter),
		WindowWidth:      int(metadata.WindowWidth),
	}

	if err = db.InsertImage(img); err != nil {
		log.Printf("Error inserting to database: %v", err)
		_ = storage.DeleteFile(objectName)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save metadata"})
		return
	}

	anonLog := &models.AnonymizationLog{
		ImageID:             img.ID,
		OriginalPatientName: "",
		AnonymizedPatientID: metadata.PatientID,
		AnonymizedBy:        "frontend-wasm",
	}
	if err = db.InsertAnonymizationLog(anonLog); err != nil {
		log.Printf("Warning: Failed to insert anonymization log: %v", err)
	}

	log.Printf("Image uploaded successfully: %s (ID: %s, size: %d bytes)", objectName, img.ID, uploadSize)

	c.JSON(http.StatusCreated, gin.H{
		"id":         img.ID.String(),
		"objectName": objectName,
		"size":       img.FileSize,
		"created_at": img.CreatedAt,
	})
}

func GetImage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid image ID"})
		return
	}

	img, err := db.GetImageByID(id)
	if err != nil {
		log.Printf("Error getting image: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve image"})
		return
	}
	if img == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Image not found"})
		return
	}

	c.JSON(http.StatusOK, img)
}

func DownloadImage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid image ID"})
		return
	}

	img, err := db.GetImageByID(id)
	if err != nil {
		log.Printf("Error getting image: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve image"})
		return
	}
	if img == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Image not found"})
		return
	}

	reader, size, contentType, err := storage.GetFile(img.MinIOObjectName)
	if err != nil {
		log.Printf("Error getting file from MinIO: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve file"})
		return
	}
	defer reader.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.png\"", img.ID))
	c.Header("Content-Type", contentType)
	c.Header("Content-Length", strconv.FormatInt(size, 10))

	_, err = io.Copy(c.Writer, reader)
	if err != nil {
		log.Printf("Error streaming file: %v", err)
	}
}

func GetImageURL(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid image ID"})
		return
	}

	img, err := db.GetImageByID(id)
	if err != nil {
		log.Printf("Error getting image: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve image"})
		return
	}
	if img == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Image not found"})
		return
	}

	url, err := storage.GetPresignedURL(img.MinIOObjectName, 24*time.Hour)
	if err != nil {
		log.Printf("Error generating presigned URL: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate access URL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"url":        url,
		"expires_in": "24h",
	})
}

func ListImages(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	result, err := db.ListImages(limit, offset)
	if err != nil {
		log.Printf("Error listing images: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to list images"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func DeleteImage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid image ID"})
		return
	}

	img, err := db.GetImageByID(id)
	if err != nil {
		log.Printf("Error getting image: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to retrieve image"})
		return
	}
	if img == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Image not found"})
		return
	}

	if err = storage.DeleteFile(img.MinIOObjectName); err != nil {
		log.Printf("Error deleting from MinIO: %v", err)
	}

	if err = db.DeleteImage(id); err != nil {
		log.Printf("Error deleting from database: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete image"})
		return
	}

	log.Printf("Image deleted successfully: %s", id)

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Image deleted successfully",
		ID:      id.String(),
	})
}

func HealthCheck(c *gin.Context) {
	pgErr := db.Ping()
	minioErr := storage.CheckHealth()

	status := "healthy"
	if pgErr != nil || minioErr != nil {
		status = "degraded"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"service": "dicom-backend",
		"time":    time.Now().UTC(),
		"checks": gin.H{
			"postgres": componentStatus(pgErr),
			"minio":    componentStatus(minioErr),
		},
	})
}

func componentStatus(err error) gin.H {
	if err != nil {
		return gin.H{"status": "unhealthy", "error": err.Error()}
	}
	return gin.H{"status": "healthy"}
}
