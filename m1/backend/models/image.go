package models

import (
	"time"

	"github.com/google/uuid"
)

type Image struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	PatientID         string     `json:"patient_id" db:"patient_id"`
	StudyUID          string     `json:"study_uid" db:"study_uid"`
	SeriesUID         string     `json:"series_uid" db:"series_uid"`
	SOPInstanceUID    string     `json:"sop_instance_uid" db:"sop_instance_uid"`
	Modality          string     `json:"modality" db:"modality"`
	BodyPartExamined  string     `json:"body_part_examined" db:"body_part_examined"`
	StudyDate         string     `json:"study_date" db:"study_date"`
	MinIOBucket       string     `json:"minio_bucket" db:"minio_bucket"`
	MinIOObjectName   string     `json:"minio_object_name" db:"minio_object_name"`
	FileSize          int64      `json:"file_size" db:"file_size"`
	Width             int        `json:"width" db:"width"`
	Height            int        `json:"height" db:"height"`
	BitsAllocated     int        `json:"bits_allocated" db:"bits_allocated"`
	WindowCenter      int        `json:"window_center" db:"window_center"`
	WindowWidth       int        `json:"window_width" db:"window_width"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

type ImageMetadata struct {
	PatientID        string `json:"patient_id"`
	StudyUID         string `json:"study_uid"`
	SeriesUID        string `json:"series_uid"`
	SOPInstanceUID   string `json:"sop_instance_uid"`
	Modality         string `json:"modality"`
	BodyPartExamined string `json:"body_part_examined"`
	StudyDate        string `json:"study_date"`
	Width            uint32 `json:"width"`
	Height           uint32 `json:"height"`
	BitsAllocated    uint16 `json:"bits_allocated"`
	WindowCenter     int32  `json:"window_center"`
	WindowWidth      int32  `json:"window_width"`
}

type AnonymizationLog struct {
	ID                  uuid.UUID `json:"id" db:"id"`
	ImageID             uuid.UUID `json:"image_id" db:"image_id"`
	OriginalPatientName string    `json:"original_patient_name,omitempty" db:"original_patient_name"`
	AnonymizedPatientID string    `json:"anonymized_patient_id" db:"anonymized_patient_id"`
	AnonymizedAt        time.Time `json:"anonymized_at" db:"anonymized_at"`
	AnonymizedBy        string    `json:"anonymized_by,omitempty" db:"anonymized_by"`
}

type ImageListResponse struct {
	Total int64   `json:"total"`
	Images []Image `json:"images"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Message string `json:"message,omitempty"`
	ID      string `json:"id,omitempty"`
}
