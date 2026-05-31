#include "dicom_parser.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <ctype.h>

static int is_explicit_vr_long(const char* vr) {
    return (vr[0] == 'O' && (vr[1] == 'B' || vr[1] == 'D' || vr[1] == 'F' || vr[1] == 'L' || vr[1] == 'W')) ||
           (vr[0] == 'S' && vr[1] == 'Q') ||
           (vr[0] == 'U' && (vr[1] == 'C' || vr[1] == 'N' || vr[1] == 'R' || vr[1] == 'T'));
}

static void trim_string(char* str) {
    size_t len = strlen(str);
    while (len > 0 && (str[len-1] == ' ' || str[len-1] == '\0')) {
        str[--len] = '\0';
    }
}

static double parse_double(const char* str) {
    if (!str || *str == '\0') return 0.0;
    return atof(str);
}

static uint16_t parse_uint16(const char* str) {
    if (!str || *str == '\0') return 0;
    return (uint16_t)atoi(str);
}

static void read_string(const uint8_t* data, uint32_t offset, uint32_t length, char* out, uint32_t out_size) {
    uint32_t i;
    uint32_t copy_len = length < (out_size - 1) ? length : (out_size - 1);
    for (i = 0; i < copy_len && offset + i < (uint32_t)(~0); i++) {
        out[i] = (char)data[offset + i];
    }
    out[i] = '\0';
    trim_string(out);
}

int parse_dicom(const uint8_t* data, uint32_t length, DicomMetadata* metadata) {
    uint32_t offset = 132;
    int is_explicit = 0;
    char transfer_syntax[128] = {0};

    memset(metadata, 0, sizeof(DicomMetadata));

    if (length < 132) return -1;
    if (memcmp(data + 128, "DICM", 4) != 0) return -1;

    while (offset + 8 <= length) {
        uint16_t group, element;
        uint32_t len;
        char vr[3] = {0};

        memcpy(&group, data + offset, 2);
        memcpy(&element, data + offset + 2, 2);
        offset += 4;

        if (group == 0x0002) {
            is_explicit = 1;
        }

        if (group == 0xFFFE && (element == 0xE000 || element == 0xE00D || element == 0xE0DD)) {
            offset += 4;
            continue;
        }

        if (group > 0x0002 && transfer_syntax[0] != '\0') {
            is_explicit = (strstr(transfer_syntax, "1.2.840.10008.1.2") != NULL && 
                           strcmp(transfer_syntax, "1.2.840.10008.1.2") != 0);
        }

        if (is_explicit) {
            if (offset + 2 > length) break;
            vr[0] = (char)data[offset];
            vr[1] = (char)data[offset + 1];
            offset += 2;

            if (is_explicit_vr_long(vr)) {
                offset += 2;
                if (offset + 4 > length) break;
                memcpy(&len, data + offset, 4);
                offset += 4;
            } else {
                if (offset + 2 > length) break;
                memcpy(&len, data + offset, 2);
                offset += 2;
            }
        } else {
            if (offset + 4 > length) break;
            memcpy(&len, data + offset, 4);
            offset += 4;
        }

        if (len == 0xFFFFFFFF) {
            break;
        }

        if (offset + len > length) break;

        if (strcmp(vr, "SQ") == 0) {
            offset += len;
            continue;
        }

        if (group == 0x0002 && element == 0x0010) {
            read_string(data, offset, len, transfer_syntax, sizeof(transfer_syntax));
            is_explicit = (strcmp(transfer_syntax, "1.2.840.10008.1.2") != 0);
        }

        char value_buf[512];
        uint32_t val_len = len < sizeof(value_buf) - 1 ? len : sizeof(value_buf) - 1;
        read_string(data, offset, val_len, value_buf, sizeof(value_buf));

        if (group == 0x0010 && element == 0x0010) {
            strncpy(metadata->patient_name, value_buf, sizeof(metadata->patient_name) - 1);
        } else if (group == 0x0010 && element == 0x0020) {
            strncpy(metadata->patient_id, value_buf, sizeof(metadata->patient_id) - 1);
        } else if (group == 0x0008 && element == 0x0020) {
            strncpy(metadata->study_date, value_buf, sizeof(metadata->study_date) - 1);
        } else if (group == 0x0008 && element == 0x1030) {
            strncpy(metadata->study_description, value_buf, sizeof(metadata->study_description) - 1);
        } else if (group == 0x0008 && element == 0x103E) {
            strncpy(metadata->series_description, value_buf, sizeof(metadata->series_description) - 1);
        } else if (group == 0x0008 && element == 0x0060) {
            strncpy(metadata->modality, value_buf, sizeof(metadata->modality) - 1);
        } else if (group == 0x0018 && element == 0x0050) {
            strncpy(metadata->slice_thickness, value_buf, sizeof(metadata->slice_thickness) - 1);
        } else if (group == 0x0028 && element == 0x0030) {
            strncpy(metadata->pixel_spacing, value_buf, sizeof(metadata->pixel_spacing) - 1);
        } else if (group == 0x0028 && element == 0x0010) {
            metadata->rows = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x0011) {
            metadata->columns = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x0100) {
            metadata->bits_allocated = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x0101) {
            metadata->bits_stored = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x0102) {
            metadata->high_bit = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x0103) {
            metadata->pixel_representation = parse_uint16(value_buf);
        } else if (group == 0x0028 && element == 0x1050) {
            metadata->window_center = parse_double(value_buf);
        } else if (group == 0x0028 && element == 0x1051) {
            metadata->window_width = parse_double(value_buf);
        } else if (group == 0x0028 && element == 0x1052) {
            metadata->rescale_intercept = parse_double(value_buf);
        } else if (group == 0x0028 && element == 0x1053) {
            metadata->rescale_slope = parse_double(value_buf);
        } else if (group == 0x0028 && element == 0x0004) {
            strncpy(metadata->photometric_interpretation, value_buf, sizeof(metadata->photometric_interpretation) - 1);
        } else if (group == 0x7FE0 && element == 0x0010) {
            metadata->pixel_data_offset = offset;
            metadata->pixel_data_length = len;
        }

        offset += len;
    }

    if (metadata->rows == 0) metadata->rows = 0;
    if (metadata->columns == 0) metadata->columns = 0;
    if (metadata->bits_allocated == 0) metadata->bits_allocated = 16;
    if (metadata->bits_stored == 0) metadata->bits_stored = 12;
    if (metadata->high_bit == 0) metadata->high_bit = 11;
    if (metadata->rescale_slope == 0) metadata->rescale_slope = 1.0;
    if (metadata->photometric_interpretation[0] == '\0') {
        strcpy(metadata->photometric_interpretation, "MONOCHROME2");
    }

    return 0;
}
