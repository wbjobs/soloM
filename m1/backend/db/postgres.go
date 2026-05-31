package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"dicom-backend/config"
	"dicom-backend/models"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

var DB *sql.DB

func Init() {
	cfg := config.AppConfig.Postgres
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DB, cfg.SSLMode,
	)

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	for i := 0; i < 10; i++ {
		if err = DB.Ping(); err == nil {
			break
		}
		log.Printf("Waiting for database to be ready... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(25)
	DB.SetConnMaxLifetime(5 * time.Minute)

	log.Println("Database connection established")
}

func Close() {
	if DB != nil {
		DB.Close()
		log.Println("Database connection closed")
	}
}

func Ping() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}
	return DB.Ping()
}

func InsertImage(img *models.Image) error {
	query := `
		INSERT INTO images (
			id, patient_id, study_uid, series_uid, sop_instance_uid,
			modality, body_part_examined, study_date,
			minio_bucket, minio_object_name, file_size,
			width, height, bits_allocated, window_center, window_width
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING created_at, updated_at
	`

	if img.ID == uuid.Nil {
		img.ID = uuid.New()
	}

	err := DB.QueryRow(
		query,
		img.ID, img.PatientID, img.StudyUID, img.SeriesUID, img.SOPInstanceUID,
		img.Modality, img.BodyPartExamined, img.StudyDate,
		img.MinIOBucket, img.MinIOObjectName, img.FileSize,
		img.Width, img.Height, img.BitsAllocated, img.WindowCenter, img.WindowWidth,
	).Scan(&img.CreatedAt, &img.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to insert image: %w", err)
	}

	return nil
}

func InsertAnonymizationLog(log *models.AnonymizationLog) error {
	query := `
		INSERT INTO anonymization_logs (
			id, image_id, original_patient_name, anonymized_patient_id, anonymized_by
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING anonymized_at
	`

	if log.ID == uuid.Nil {
		log.ID = uuid.New()
	}

	err := DB.QueryRow(
		query,
		log.ID, log.ImageID, log.OriginalPatientName, log.AnonymizedPatientID, log.AnonymizedBy,
	).Scan(&log.AnonymizedAt)

	if err != nil {
		return fmt.Errorf("failed to insert anonymization log: %w", err)
	}

	return nil
}

func GetImageByID(id uuid.UUID) (*models.Image, error) {
	query := `
		SELECT id, patient_id, study_uid, series_uid, sop_instance_uid,
		       modality, body_part_examined, study_date,
		       minio_bucket, minio_object_name, file_size,
		       width, height, bits_allocated, window_center, window_width,
		       created_at, updated_at
		FROM images WHERE id = $1
	`

	img := &models.Image{}
	err := DB.QueryRow(query, id).Scan(
		&img.ID, &img.PatientID, &img.StudyUID, &img.SeriesUID, &img.SOPInstanceUID,
		&img.Modality, &img.BodyPartExamined, &img.StudyDate,
		&img.MinIOBucket, &img.MinIOObjectName, &img.FileSize,
		&img.Width, &img.Height, &img.BitsAllocated, &img.WindowCenter, &img.WindowWidth,
		&img.CreatedAt, &img.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get image: %w", err)
	}

	return img, nil
}

func ListImages(limit, offset int) (*models.ImageListResponse, error) {
	countQuery := `SELECT COUNT(*) FROM images`
	var total int64
	if err := DB.QueryRow(countQuery).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count images: %w", err)
	}

	query := `
		SELECT id, patient_id, study_uid, series_uid, sop_instance_uid,
		       modality, body_part_examined, study_date,
		       minio_bucket, minio_object_name, file_size,
		       width, height, bits_allocated, window_center, window_width,
		       created_at, updated_at
		FROM images
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := DB.Query(query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list images: %w", err)
	}
	defer rows.Close()

	images := make([]models.Image, 0, limit)
	for rows.Next() {
		var img models.Image
		err := rows.Scan(
			&img.ID, &img.PatientID, &img.StudyUID, &img.SeriesUID, &img.SOPInstanceUID,
			&img.Modality, &img.BodyPartExamined, &img.StudyDate,
			&img.MinIOBucket, &img.MinIOObjectName, &img.FileSize,
			&img.Width, &img.Height, &img.BitsAllocated, &img.WindowCenter, &img.WindowWidth,
			&img.CreatedAt, &img.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan image row: %w", err)
		}
		images = append(images, img)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return &models.ImageListResponse{
		Total:  total,
		Images: images,
	}, nil
}

func DeleteImage(id uuid.UUID) error {
	query := `DELETE FROM images WHERE id = $1`
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete image: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}
