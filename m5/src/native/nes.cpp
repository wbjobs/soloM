#include "nes.h"
#include "apu.h"

namespace nes {

NES::NES() {}

bool NES::load_rom(const std::string& path) {
    cart_ = std::make_shared<Cartridge>();
    if (!cart_->load(path)) {
        cart_.reset();
        return false;
    }
    bus_.insert_cartridge(cart_);
    bus_.reset();
    return true;
}

void NES::reset() {
    bus_.reset();
}

void NES::step_frame() {
    if (!cart_) return;

    for (;;) {
        if (!bus_.dma_transfer_) {
            int cycles = bus_.cpu().step();
            bus_.apu().step(cycles);
        } else {
            bus_.apu().step(1);
            if (bus_.dma_dummy_) {
                bus_.dma_dummy_ = false;
            } else {
                uint16_t addr = (bus_.dma_page_ << 8) | bus_.dma_addr_;
                bus_.dma_data_ = bus_.cpu_read(addr);
                bus_.cpu_write(0x2004, bus_.dma_data_);
                bus_.dma_addr_++;
                if (bus_.dma_addr_ == 0) {
                    bus_.dma_transfer_ = false;
                }
            }
        }

        bus_.ppu().step();
        bus_.ppu().step();
        bus_.ppu().step();

        if (bus_.ppu().frame_complete()) {
            break;
        }
    }
}

void NES::step_by_samples(int sample_count) {
    if (!cart_) return;

    int target_samples = bus_.audio_sample_count() + sample_count;
    int frames_stepped = 0;

    while (bus_.audio_sample_count() < target_samples) {
        if (!bus_.dma_transfer_) {
            int cycles = bus_.cpu().step();
            bus_.apu().step(cycles);
        } else {
            bus_.apu().step(1);
            if (bus_.dma_dummy_) {
                bus_.dma_dummy_ = false;
            } else {
                uint16_t addr = (bus_.dma_page_ << 8) | bus_.dma_addr_;
                bus_.dma_data_ = bus_.cpu_read(addr);
                bus_.cpu_write(0x2004, bus_.dma_data_);
                bus_.dma_addr_++;
                if (bus_.dma_addr_ == 0) {
                    bus_.dma_transfer_ = false;
                }
            }
        }

        bus_.ppu().step();
        bus_.ppu().step();
        bus_.ppu().step();

        if (bus_.ppu().frame_complete()) {
            frames_stepped++;
            if (frames_stepped >= 2) {
                break;
            }
        }
    }
}

const uint32_t* NES::frame_buffer() const {
    return bus_.ppu().frame_buffer().data();
}

void NES::set_button(int button, bool pressed) {
    bus_.controller1().set_button(button, pressed);
}

int NES::get_audio_samples(std::vector<int16_t>& out) {
    return bus_.get_audio_samples(out);
}

void NES::clear_audio_samples() {
    bus_.clear_audio_samples();
}

}
