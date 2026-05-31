#include "ppu.h"
#include <cstring>

namespace nes {

const uint32_t PPU::PALETTE_TABLE[64] = {
    0x666666, 0x002A88, 0x1412A7, 0x3B00A4, 0x5C007E, 0x6E0040, 0x6C0600, 0x561D00,
    0x333500, 0x0B4800, 0x005200, 0x004F08, 0x00404D, 0x000000, 0x000000, 0x000000,
    0xADADAD, 0x155FD9, 0x4240FF, 0x7527FE, 0xA01ACC, 0xB71E7B, 0xB53120, 0x994200,
    0x6B6D00, 0x388700, 0x0C9300, 0x008F32, 0x007C8D, 0x000000, 0x000000, 0x000000,
    0xFFFEFF, 0x64B0FF, 0x9290FF, 0xC676FF, 0xF36AFF, 0xFE6ECC, 0xFE8170, 0xEA9E22,
    0xBCBE00, 0x88D800, 0x5CE430, 0x45E082, 0x48CDDE, 0x4F4F4F, 0x000000, 0x000000,
    0xFFFEFF, 0xC0DFFF, 0xD3D2FF, 0xE8C8FF, 0xFBC2FF, 0xFEC4EA, 0xFECCC5, 0xF7D8A5,
    0xE4E594, 0xCFEF96, 0xBDF4AB, 0xB3F3CC, 0xB5EBF2, 0xB8B8B8, 0x000000, 0x000000,
};

PPU::PPU() {
    vram_.fill(0);
    oam_.fill(0);
    palette_.fill(0);
    frame_buffer_.fill(0);
    reset();
}

void PPU::reset() {
    scanline_ = 0;
    cycle_ = 0;
    frame_complete_ = false;
    ctrl_ = 0;
    mask_ = 0;
    status_ = 0;
    oam_addr_ = 0;
    data_buffer_ = 0;
    v_ = 0;
    t_ = 0;
    fine_x_ = 0;
    write_latch_ = false;
    nmi_output_ = false;
    nmi_occurred_ = false;
    nmi_pending_ = false;
    oam_dma_ = false;
    shift_pt_low_ = 0;
    shift_pt_high_ = 0;
    shift_at_low_ = 0;
    shift_at_high_ = 0;
}

uint16_t PPU::mirror_addr(uint16_t addr) {
    addr = (addr - 0x2000) % 0x1000;
    uint16_t table = addr / 0x400;
    uint16_t offset = addr % 0x400;

    if (mirroring_ == MIRROR_VERTICAL) {
        return (table % 2) * 0x400 + offset;
    } else if (mirroring_ == MIRROR_HORIZONTAL) {
        return (table / 2) * 0x400 + offset;
    } else if (mirroring_ == MIRROR_SINGLE_LOW) {
        return offset;
    } else if (mirroring_ == MIRROR_SINGLE_HIGH) {
        return 0x400 + offset;
    }
    return addr;
}

uint8_t PPU::vram_read(uint16_t addr) {
    if (addr < 0x2000) {
        if (cart_read_) return cart_read_(addr);
        return 0;
    } else if (addr < 0x3F00) {
        return vram_[mirror_addr(addr)];
    }
    return palette_read(addr);
}

void PPU::vram_write(uint16_t addr, uint8_t data) {
    if (addr < 0x2000) {
        if (cart_write_) cart_write_(addr, data);
    } else if (addr < 0x3F00) {
        vram_[mirror_addr(addr)] = data;
    } else {
        palette_write(addr, data);
    }
}

uint8_t PPU::palette_read(uint8_t addr) {
    addr = (addr - 0x3F00) % 0x20;
    if (addr == 0x10 || addr == 0x14 || addr == 0x18 || addr == 0x1C)
        addr -= 0x10;
    return palette_[addr];
}

void PPU::palette_write(uint8_t addr, uint8_t data) {
    addr = (addr - 0x3F00) % 0x20;
    if (addr == 0x10 || addr == 0x14 || addr == 0x18 || addr == 0x1C)
        addr -= 0x10;
    palette_[addr] = data;
}

uint8_t PPU::read_register(uint16_t addr) {
    uint8_t data = 0;
    switch (addr) {
    case 0x2002:
        data = (status_ & 0xE0) | (data_buffer_ & 0x1F);
        nmi_occurred_ = false;
        nmi_output_ = false;
        write_latch_ = false;
        break;
    case 0x2004:
        data = oam_[oam_addr_];
        break;
    case 0x2007:
        data = data_buffer_;
        data_buffer_ = vram_read(v_);
        if ((v_ & 0x3F00) == 0x3F00) data = data_buffer_;
        v_ += (ctrl_ & 0x04) ? 32 : 1;
        break;
    }
    return data;
}

void PPU::write_register(uint16_t addr, uint8_t data) {
    switch (addr) {
    case 0x2000:
        ctrl_ = data;
        t_ = (t_ & 0x73FF) | ((data & 0x03) << 10);
        nmi_output_ = (data & 0x80) != 0;
        break;
    case 0x2001:
        mask_ = data;
        break;
    case 0x2003:
        oam_addr_ = data;
        break;
    case 0x2004:
        oam_[oam_addr_] = data;
        oam_addr_ = (oam_addr_ + 1) & 0xFF;
        break;
    case 0x2005:
        if (!write_latch_) {
            t_ = (t_ & 0x7FE0) | (data >> 3);
            fine_x_ = data & 0x07;
            write_latch_ = true;
        } else {
            t_ = (t_ & 0x0C1F) | ((data & 0x07) << 12) | ((data & 0xF8) << 2);
            write_latch_ = false;
        }
        break;
    case 0x2006:
        if (!write_latch_) {
            t_ = (t_ & 0x00FF) | ((data & 0x3F) << 8);
            write_latch_ = true;
        } else {
            t_ = (t_ & 0xFF00) | data;
            v_ = t_;
            write_latch_ = false;
        }
        break;
    case 0x2007:
        vram_write(v_, data);
        v_ += (ctrl_ & 0x04) ? 32 : 1;
        break;
    }
}

void PPU::increment_scroll_x() {
    if ((mask_ & 0x18) && cycle_ >= 2 && cycle_ < 258) {
        if ((v_ & 0x001F) == 31) {
            v_ &= ~0x001F;
            v_ ^= 0x0400;
        } else {
            v_++;
        }
    }
}

void PPU::increment_scroll_y() {
    if ((mask_ & 0x18) && cycle_ == 256) {
        if ((v_ & 0x7000) != 0x7000) {
            v_ += 0x1000;
        } else {
            v_ &= ~0x7000;
            int y = (v_ & 0x03E0) >> 5;
            if (y == 29) {
                y = 0;
                v_ ^= 0x0800;
            } else if (y == 31) {
                y = 0;
            } else {
                y++;
            }
            v_ = (v_ & ~0x03E0) | (y << 5);
        }
    }
}

void PPU::transfer_address_x() {
    if ((mask_ & 0x18) && scanline_ == -1 && cycle_ >= 2 && cycle_ < 258) {
        v_ = (v_ & ~0x041F) | (t_ & 0x041F);
    }
}

void PPU::transfer_address_y() {
    if ((mask_ & 0x18) && scanline_ == -1 && cycle_ == 256) {
        v_ = (v_ & ~0x7BE0) | (t_ & 0x7BE0);
    }
}

void PPU::load_shift_registers() {
    if ((mask_ & 0x18) && cycle_ >= 2 && cycle_ < 258) {
        shift_pt_low_ = (shift_pt_low_ & 0xFF00) | pt_low_;
        shift_pt_high_ = (shift_pt_high_ & 0xFF00) | pt_high_;

        uint16_t a = 0x23C0 | (v_ & 0x0C00) | ((v_ >> 4) & 0x38) | ((v_ >> 2) & 0x07);
        uint8_t shift = ((v_ >> 4) & 0x04) | (v_ & 0x02);
        at_data_ = (vram_read(a) >> shift) & 0x03;

        shift_at_low_ = (shift_at_low_ & 0xFF00) | ((at_data_ & 0x01) ? 0xFF : 0x00);
        shift_at_high_ = (shift_at_high_ & 0xFF00) | ((at_data_ & 0x02) ? 0xFF : 0x00);
    }
}

void PPU::shift_shift_registers() {
    if ((mask_ & 0x18) && cycle_ >= 2 && cycle_ < 258) {
        shift_pt_low_ >>= 1;
        shift_pt_high_ >>= 1;
        shift_at_low_ >>= 1;
        shift_at_high_ >>= 1;
    }
}

uint32_t PPU::get_pixel_color() {
    if (scanline_ < 0 || scanline_ >= VISIBLE_SCANLINES) return 0;
    if (cycle_ < 1 || cycle_ >= 257) return 0;

    bool show_bg = (mask_ & 0x08) != 0;
    bool show_spr = (mask_ & 0x10) != 0;
    bool show_bg_left8 = (mask_ & 0x02) != 0;
    bool show_spr_left8 = (mask_ & 0x04) != 0;

    int x = cycle_ - 1;
    int y = scanline_;

    uint8_t bg_pixel = 0;
    uint8_t bg_palette = 0;

    if (show_bg) {
        uint16_t bit_mux = 0x8000 >> fine_x_;
        uint8_t p0 = (shift_pt_low_ & bit_mux) ? 1 : 0;
        uint8_t p1 = (shift_pt_high_ & bit_mux) ? 2 : 0;
        bg_pixel = p0 | p1;

        uint8_t a0 = (shift_at_low_ & bit_mux) ? 1 : 0;
        uint8_t a1 = (shift_at_high_ & bit_mux) ? 2 : 0;
        bg_palette = a0 | a1;

        if (!show_bg_left8 && x < 8) {
            bg_pixel = 0;
            bg_palette = 0;
        }
    }

    uint8_t spr_pixel = 0;
    uint8_t spr_palette = 0;
    bool spr_priority = false;

    if (show_spr) {
        for (int i = 0; i < 8; i++) {
            uint8_t spr_y = oam_[i * 4];
            uint8_t spr_tile = oam_[i * 4 + 1];
            uint8_t spr_attr = oam_[i * 4 + 2];
            uint8_t spr_x = oam_[i * 4 + 3];

            int row = y - spr_y;
            if (row < 0 || row >= 8) continue;

            if (!show_spr_left8 && spr_x < 8) continue;

            int col = x - spr_x;
            if (col < 0 || col >= 8) continue;

            uint16_t tile_addr = 0x1000 * ((ctrl_ & 0x08) ? 1 : 0) + spr_tile * 16 + row;
            if (spr_attr & 0x80) {
                tile_addr = 0x1000 * ((ctrl_ & 0x08) ? 1 : 0) + spr_tile * 16 + (7 - row);
            }

            uint8_t lo = vram_read(tile_addr);
            uint8_t hi = vram_read(tile_addr + 8);

            if (spr_attr & 0x40) {
                lo = ((lo & 0x01) << 7) | ((lo & 0x02) << 5) | ((lo & 0x04) << 3) | ((lo & 0x08) << 1) |
                     ((lo & 0x10) >> 1) | ((lo & 0x20) >> 3) | ((lo & 0x40) >> 5) | ((lo & 0x80) >> 7);
                hi = ((hi & 0x01) << 7) | ((hi & 0x02) << 5) | ((hi & 0x04) << 3) | ((hi & 0x08) << 1) |
                     ((hi & 0x10) >> 1) | ((hi & 0x20) >> 3) | ((hi & 0x40) >> 5) | ((hi & 0x80) >> 7);
            }

            uint8_t bit = 0x80 >> col;
            uint8_t p0 = (lo & bit) ? 1 : 0;
            uint8_t p1 = (hi & bit) ? 2 : 0;
            uint8_t px = p0 | p1;

            if (px == 0) continue;

            spr_pixel = px;
            spr_palette = (spr_attr & 0x03) + 4;
            spr_priority = !(spr_attr & 0x20);
            break;
        }
    }

    uint8_t pixel = 0;
    uint8_t pal = 0;

    if (bg_pixel == 0 && spr_pixel == 0) {
        return PALETTE_TABLE[palette_read(0x3F00)];
    } else if (bg_pixel == 0) {
        pixel = spr_pixel;
        pal = spr_palette;
    } else if (spr_pixel == 0) {
        pixel = bg_pixel;
        pal = bg_palette;
    } else {
        if (spr_priority) {
            pixel = spr_pixel;
            pal = spr_palette;
        } else {
            pixel = bg_pixel;
            pal = bg_palette;
        }
    }

    uint16_t pal_addr = 0x3F00 + pal * 4 + pixel;
    return PALETTE_TABLE[palette_read(pal_addr)];
}

void PPU::step() {
    if (oam_dma_) {
        if (cycle_ > 0) {
            if (oam_dma_offset_ < 256) {
                uint16_t dma_addr = (oam_dma_page_ << 8) | oam_dma_offset_;
                oam_[oam_dma_offset_] = oam_dma_data_;
                oam_dma_offset_++;
                if (oam_dma_offset_ < 256) {
                    oam_dma_data_ = cart_read_ ? cart_read_(dma_addr + 1) : 0;
                }
            } else {
                oam_dma_ = false;
            }
        }
    }

    if (scanline_ >= 0 && scanline_ < VISIBLE_SCANLINES) {
        if (cycle_ >= 2 && cycle_ < 258) {
            if (mask_ & 0x18) {
                uint16_t nt_addr = 0x2000 | (v_ & 0x0FFF);
                nt_data_ = vram_read(nt_addr);
            }
        }

        if (cycle_ >= 2 && cycle_ < 258 && (mask_ & 0x18)) {
            uint16_t bg_pattern = (ctrl_ & 0x10) ? 0x1000 : 0x0000;
            uint16_t fine_y = (v_ >> 12) & 0x07;
            uint16_t pt_addr = bg_pattern + nt_data_ * 16 + fine_y;
            pt_low_ = vram_read(pt_addr);
            pt_high_ = vram_read(pt_addr + 8);
        }

        load_shift_registers();
        shift_shift_registers();
        increment_scroll_x();
        increment_scroll_y();

        if (cycle_ == 256) {
            transfer_address_y();
        }

        if (cycle_ >= 258 || cycle_ < 2) {
            transfer_address_x();
        }

        if (cycle_ >= 1 && cycle_ <= 256 && scanline_ >= 0 && scanline_ < VISIBLE_SCANLINES) {
            uint32_t color = get_pixel_color();
            int idx = scanline_ * SCREEN_WIDTH + (cycle_ - 1);
            if (idx >= 0 && idx < SCREEN_WIDTH * SCREEN_HEIGHT) {
                frame_buffer_[idx] = color;
            }
        }
    }

    if (scanline_ == 241 && cycle_ == 1) {
        nmi_occurred_ = true;
        if (nmi_output_) {
            if (nmi_) nmi_();
        }
    }

    if (scanline_ == -1 && cycle_ == 1) {
        nmi_occurred_ = false;
        frame_complete_ = false;
    }

    cycle_++;
    if (cycle_ > 340) {
        cycle_ = 0;
        scanline_++;
        if (scanline_ > 260) {
            scanline_ = -1;
            frame_complete_ = true;
        }
    }
}

}
