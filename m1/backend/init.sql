CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id VARCHAR(255) NOT NULL,
    study_uid VARCHAR(255) NOT NULL,
    series_uid VARCHAR(255) NOT NULL,
    sop_instance_uid VARCHAR(255) NOT NULL,
    modality VARCHAR(50),
    body_part_examined VARCHAR(100),
    study_date DATE,
    minio_bucket VARCHAR(255) NOT NULL,
    minio_object_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    bits_allocated INTEGER,
    window_center INTEGER,
    window_width INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_images_patient_id ON images(patient_id);
CREATE INDEX IF NOT EXISTS idx_images_study_uid ON images(study_uid);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);

CREATE TABLE IF NOT EXISTS anonymization_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id) ON DELETE CASCADE,
    original_patient_name VARCHAR(255),
    anonymized_patient_id VARCHAR(255) NOT NULL,
    anonymized_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    anonymized_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_anonymization_logs_image_id ON anonymization_logs(image_id);
