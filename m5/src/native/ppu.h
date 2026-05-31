#pragma once
#include <cstdint>
#include <array>
#include <functional>

namespace nes {

class PPU {
public:
    static constexpr int SCANLINES = 262;
    static constexpr int CYCLES_PER_SCANLINE = 341;
    static constexpr int VISIBLE_SCANLINES = 240;
    static constexpr int SCREEN_WIDTH = 256;
    static constexpr int SCREEN_HEIGHT = 240;

    PPU();

    void reset();
    void step();

    void set_read_callback(std::function<uint8_t(uint16_t)> cb) { cart_read_ = cb; }
    void set_write_callback(std::function<void(uint16_t, uint8_t)> cb) { cart_write_ = cb; }
    void set_nmi_callback(std::function<void()> cb) { nmi_ = cb; }

    uint8_t read_register(uint16_t addr);
    void write_register(uint16_t addr, uint8_t data);

    uint8_t dma_data() const { return oam_dma_data_; }
    void set_dma_page(uint8_t page) { oam_dma_page_ = page; oam_dma_ = true; oam_dma_offset_ = 0; }

    const std::array<uint32_t, SCREEN_WIDTH * SCREEN_HEIGHT>& frame_buffer() const { return frame_buffer_; }
    bool frame_complete() const { return frame_complete_; }

    void set_mirroring(int mode) { mirroring_ = mode; }

    struct State {
        uint16_t scanline;
        uint16_t cycle;
        bool frame_complete;

        std::array<uint8_t, 2048> vram;
        std::array<uint8_t, 256> oam;
        std::array<uint8_t, 32> palette;

        int mirroring;

        uint8_t ctrl;
        uint8_t mask;
        uint8_t status;
        uint8_t oam_addr;
        uint8_t data_buffer;

        uint16_t v;
        uint16_t t;
        uint8_t fine_x;
        bool write_latch;

        uint8_t nt_data;
        uint16_t at_data;
        uint8_t pt_low;
        uint8_t pt_high;
        uint16_t shift_pt_low;
        uint16_t shift_pt_high;
        uint16_t shift_at_low;
        uint16_t shift_at_high;

        bool oam_dma;
        uint8_t oam_dma_page;
        uint8_t oam_dma_offset;
        uint8_t oam_dma_data;

        bool nmi_output;
        bool nmi_occurred;
        bool nmi_pending;
    };

    State save_state() const {
        State s;
        s.scanline = scanline_;
        s.cycle = cycle_;
        s.frame_complete = frame_complete_;
        s.vram = vram_;
        s.oam = oam_;
        s.palette = palette_;
        s.mirroring = mirroring_;
        s.ctrl = ctrl_;
        s.mask = mask_;
        s.status = status_;
        s.oam_addr = oam_addr_;
        s.data_buffer = data_buffer_;
        s.v = v_;
        s.t = t_;
        s.fine_x = fine_x_;
        s.write_latch = write_latch_;
        s.nt_data = nt_data_;
        s.at_data = at_data_;
        s.pt_low = pt_low_;
        s.pt_high = pt_high_;
        s.shift_pt_low = shift_pt_low_;
        s.shift_pt_high = shift_pt_high_;
        s.shift_at_low = shift_at_low_;
        s.shift_at_high = shift_at_high_;
        s.oam_dma = oam_dma_;
        s.oam_dma_page = oam_dma_page_;
        s.oam_dma_offset = oam_dma_offset_;
        s.oam_dma_data = oam_dma_data_;
        s.nmi_output = nmi_output_;
        s.nmi_occurred = nmi_occurred_;
        s.nmi_pending = nmi_pending_;
        return s;
    }

    void load_state(const State& s) {
        scanline_ = s.scanline;
        cycle_ = s.cycle;
        frame_complete_ = s.frame_complete;
        vram_ = s.vram;
        oam_ = s.oam;
        palette_ = s.palette;
        mirroring_ = s.mirroring;
        ctrl_ = s.ctrl;
        mask_ = s.mask;
        status_ = s.status;
        oam_addr_ = s.oam_addr;
        data_buffer_ = s.data_buffer;
        v_ = s.v;
        t_ = s.t;
        fine_x_ = s.fine_x;
        write_latch_ = s.write_latch;
        nt_data_ = s.nt_data;
        at_data_ = s.at_data;
        pt_low_ = s.pt_low;
        pt_high_ = s.pt_high;
        shift_pt_low_ = s.shift_pt_low;
        shift_pt_high_ = s.shift_pt_high;
        shift_at_low_ = s.shift_at_low;
        shift_at_high_ = s.shift_at_high;
        oam_dma_ = s.oam_dma;
        oam_dma_page_ = s.oam_dma_page;
        oam_dma_offset_ = s.oam_dma_offset;
        oam_dma_data_ = s.oam_dma_data;
        nmi_output_ = s.nmi_output;
        nmi_occurred_ = s.nmi_occurred;
        nmi_pending_ = s.nmi_pending;
    }

private:
    uint16_t scanline_;
    uint16_t cycle_;
    bool frame_complete_;

    std::function<uint8_t(uint16_t)> cart_read_;
    std::function<void(uint16_t, uint8_t)> cart_write_;
    std::function<void()> nmi_;

    std::array<uint8_t, 2048> vram_;
    std::array<uint8_t, 256> oam_;
    std::array<uint8_t, 32> palette_;

    std::array<uint32_t, SCREEN_WIDTH * SCREEN_HEIGHT> frame_buffer_;

    int mirroring_;

    uint8_t ctrl_;
    uint8_t mask_;
    uint8_t status_;
    uint8_t oam_addr_;
    uint8_t data_buffer_;

    uint16_t v_;
    uint16_t t_;
    uint8_t  fine_x_;
    bool write_latch_;

    uint8_t nt_data_;
    uint16_t at_data_;
    uint8_t pt_low_;
    uint8_t pt_high_;
    uint16_t shift_pt_low_;
    uint16_t shift_pt_high_;
    uint16_t shift_at_low_;
    uint16_t shift_at_high_;

    bool oam_dma_;
    uint8_t oam_dma_page_;
    uint8_t oam_dma_offset_;
    uint8_t oam_dma_data_;

    bool nmi_output_;
    bool nmi_occurred_;
    bool nmi_pending_;

    uint16_t mirror_addr(uint16_t addr);
    uint8_t vram_read(uint16_t addr);
    void vram_write(uint16_t addr, uint8_t data);
    uint8_t palette_read(uint8_t addr);
    void palette_write(uint8_t addr, uint8_t data);

    void increment_scroll_x();
    void increment_scroll_y();
    void transfer_address_x();
    void transfer_address_y();
    void load_shift_registers();
    void shift_shift_registers();
    uint32_t get_pixel_color();

    void background_rendering();
    void sprite_rendering();

    static const uint32_t PALETTE_TABLE[64];
};

}
