#include "dicom_parser.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static char json_result[16384];

char* parse_dicom_metadata(const uint8_t* data, uint32_t length) {
    DicomMetadata meta;
    memset(&meta, 0, sizeof(meta));
    
    if (parse_dicom(data, length, &meta) != 0) {
        snprintf(json_result, sizeof(json_result), "{\"error\":\"Failed to parse DICOM file\"}");
        return json_result;
    }
    
    snprintf(json_result, sizeof(json_result),
        "{"
        "\"patientName\":\"%s\","
        "\"patientId\":\"%s\","
        "\"studyDate\":\"%s\","
        "\"studyDescription\":\"%s\","
        "\"seriesDescription\":\"%s\","
        "\"modality\":\"%s\","
        "\"sliceThickness\":\"%s\","
        "\"pixelSpacing\":\"%s\","
        "\"rows\":%u,"
        "\"columns\":%u,"
        "\"bitsAllocated\":%u,"
        "\"bitsStored\":%u,"
        "\"highBit\":%u,"
        "\"pixelRepresentation\":%u,"
        "\"windowCenter\":%.6f,"
        "\"windowWidth\":%.6f,"
        "\"rescaleIntercept\":%.6f,"
        "\"rescaleSlope\":%.6f,"
        "\"photometricInterpretation\":\"%s\","
        "\"pixelDataOffset\":%u,"
        "\"pixelDataLength\":%u"
        "}",
        meta.patient_name, meta.patient_id, meta.study_date,
        meta.study_description, meta.series_description, meta.modality,
        meta.slice_thickness, meta.pixel_spacing,
        meta.rows, meta.columns, meta.bits_allocated, meta.bits_stored,
        meta.high_bit, meta.pixel_representation,
        meta.window_center, meta.window_width,
        meta.rescale_intercept, meta.rescale_slope,
        meta.photometric_interpretation,
        meta.pixel_data_offset, meta.pixel_data_length
    );
    
    return json_result;
}

void free_parsed_result(char* ptr) {
}
