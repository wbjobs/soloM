#include "bus.h"
#include <cstring>

namespace nes {

Bus::Bus() : dma_transfer_(false), dma_dummy_(true), dma_page_(0), dma_addr_(0), dma_data_(0), last_sample_count_(0) {
    cpu_ram_.fill(0);
    apu_regs_.fill(0);

    cpu_.set_read_callback([this](uint16_t addr) -> uint8_t {
        return cpu_read(addr);
    });
    cpu_.set_write_callback([this](uint16_t addr, uint8_t data) {
        cpu_write(addr, data);
    });

    ppu_.set_read_callback([this](uint16_t addr) -> uint8_t {
        if (cart_) return cart_->ppu_read(addr);
        return 0;
    });
    ppu_.set_write_callback([this](uint16_t addr, uint8_t data) {
        if (cart_) cart_->ppu_write(addr, data);
    });
    ppu_.set_nmi_callback([this]() {
        cpu_.nmi();
    });

    apu_.set_irq_callback([this]() {
        cpu_.irq();
    });
}

void Bus::insert_cartridge(std::shared_ptr<Cartridge> cart) {
    cart_ = cart;
    if (cart_) {
        ppu_.set_mirroring(cart_->mirroring());
    }
}

void Bus::reset() {
    cpu_.reset();
    ppu_.reset();
    apu_.reset();
    ctrl1_.reset();
    ctrl2_.reset();
    cpu_ram_.fill(0);
    dma_transfer_ = false;
    std::lock_guard<std::mutex> lock(audio_mutex_);
    audio_buffer_.clear();
    last_sample_count_ = 0;
}

uint8_t Bus::cpu_read(uint16_t addr) {
    if (addr < 0x2000) {
        return cpu_ram_[addr & 0x07FF];
    } else if (addr < 0x4000) {
        return ppu_.read_register(0x2000 + (addr & 0x0007));
    } else if (addr == 0x4014) {
        return 0;
    } else if (addr == 0x4015) {
        return apu_.read_register(addr);
    } else if (addr == 0x4016) {
        return ctrl1_.read();
    } else if (addr == 0x4017) {
        return ctrl2_.read();
    } else if (addr < 0x4020) {
        return 0;
    } else if (cart_) {
        return cart_->cpu_read(addr);
    }
    return 0;
}

void Bus::cpu_write(uint16_t addr, uint8_t data) {
    if (addr < 0x2000) {
        cpu_ram_[addr & 0x07FF] = data;
    } else if (addr < 0x4000) {
        ppu_.write_register(0x2000 + (addr & 0x0007), data);
    } else if (addr == 0x4014) {
        dma_page_ = data;
        dma_transfer_ = true;
        dma_dummy_ = true;
        dma_addr_ = 0;
    } else if (addr >= 0x4000 && addr <= 0x4017) {
        apu_.write_register(addr, data);
    } else if (addr == 0x4016) {
        ctrl1_.write(data);
        ctrl2_.write(data);
    } else if (addr < 0x4020) {
    } else if (cart_) {
        cart_->cpu_write(addr, data);
    }
}

uint8_t Bus::ppu_read(uint16_t addr) {
    return ppu_.read_register(addr);
}

void Bus::ppu_write(uint16_t addr, uint8_t data) {
    ppu_.write_register(addr, data);
}

void Bus::set_controller1_state(uint8_t state) {
    for (int i = 0; i < 8; i++) {
        ctrl1_.set_button(i, (state >> i) & 0x01);
    }
}

void Bus::dma_oam(uint8_t page) {
    for (uint16_t i = 0; i < 256; i++) {
        uint16_t addr = (page << 8) | i;
        uint8_t data = cpu_read(addr);
        ppu_.write_register(0x2004, data);
    }
}

int Bus::get_audio_samples(std::vector<int16_t>& out) {
    std::lock_guard<std::mutex> lock(audio_mutex_);
    int count = apu_.sample_count() - last_sample_count_;
    if (count > 0) {
        for (int i = 0; i < count; i++) {
            audio_buffer_.push_back(apu_.sample());
        }
        last_sample_count_ += count;
    }
    out.swap(audio_buffer_);
    return out.size();
}

void Bus::clear_audio_samples() {
    std::lock_guard<std::mutex> lock(audio_mutex_);
    audio_buffer_.clear();
    last_sample_count_ = apu_.sample_count();
}

}
