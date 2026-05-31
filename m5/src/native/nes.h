#pragma once
#include "bus.h"
#include <string>
#include <cstdint>
#include <functional>
#include <vector>

namespace nes {

class NES {
public:
    NES();

    bool load_rom(const std::string& path);
    void reset();
    void step_frame();
    void step_by_samples(int sample_count);

    const uint32_t* frame_buffer() const;
    int frame_width() const { return PPU::SCREEN_WIDTH; }
    int frame_height() const { return PPU::SCREEN_HEIGHT; }

    void set_button(int button, bool pressed);

    int get_audio_samples(std::vector<int16_t>& out);
    void clear_audio_samples();

    Bus::State save_state() const { return bus_.save_state(); }
    void load_state(const Bus::State& s) { bus_.load_state(s); }

    Bus& bus() { return bus_; }

private:
    Bus bus_;
    std::shared_ptr<Cartridge> cart_;
};

}
