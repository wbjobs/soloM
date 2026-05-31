#ifndef DICOM_PARSER_H
#define DICOM_PARSER_H

#include <stdint.h>

typedef struct {
    char patient_name[256];
    char patient_id[128];
    char study_date[32];
    char study_description[256];
    char series_description[256];
    char modality[32];
    char slice_thickness[64];
    char pixel_spacing[128];
    uint16_t rows;
    uint16_t columns;
    uint16_t bits_allocated;
    uint16_t bits_stored;
    uint16_t high_bit;
    uint16_t pixel_representation;
    double window_center;
    double window_width;
    double rescale_intercept;
    double rescale_slope;
    char photometric_interpretation[64];
    char samples_per_pixel[16];
    uint32_t pixel_data_offset;
    uint32_t pixel_data_length;
} DicomMetadata;

int parse_dicom(const uint8_t* data, uint32_t length, DicomMetadata* metadata);

#endif
