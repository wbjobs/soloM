#pragma once
#include "cpu.h"
#include "ppu.h"
#include "apu.h"
#include "cartridge.h"
#include "controller.h"
#include <memory>
#include <array>
#include <vector>
#include <mutex>

namespace nes {

class Bus {
public:
    Bus();

    void insert_cartridge(std::shared_ptr<Cartridge> cart);
    void reset();

    uint8_t cpu_read(uint16_t addr);
    void cpu_write(uint16_t addr, uint8_t data);

    uint8_t ppu_read(uint16_t addr);
    void ppu_write(uint16_t addr, uint8_t data);

    void set_controller1_state(uint8_t state);

    CPU& cpu() { return cpu_; }
    PPU& ppu() { return ppu_; }
    APU& apu() { return apu_; }
    Controller& controller1() { return ctrl1_; }
    Cartridge* cartridge() { return cart_.get(); }

    void dma_oam(uint8_t page);

    int get_audio_samples(std::vector<int16_t>& out);
    void clear_audio_samples();
    int audio_sample_count() const { return apu_.sample_count(); }

    struct State {
        CPU::State cpu;
        PPU::State ppu;
        APU::State apu;
        Controller::State ctrl1;
        Controller::State ctrl2;
        Cartridge::State cart;
        std::array<uint8_t, 2048> cpu_ram;
        bool dma_transfer;
        bool dma_dummy;
        uint8_t dma_page;
        uint8_t dma_addr;
        uint8_t dma_data;
    };

    State save_state() const {
        State s;
        s.cpu = cpu_.save_state();
        s.ppu = ppu_.save_state();
        s.apu = apu_.save_state();
        s.ctrl1 = ctrl1_.save_state();
        s.ctrl2 = ctrl2_.save_state();
        if (cart_) s.cart = cart_->save_state();
        s.cpu_ram = cpu_ram_;
        s.dma_transfer = dma_transfer_;
        s.dma_dummy = dma_dummy_;
        s.dma_page = dma_page_;
        s.dma_addr = dma_addr_;
        s.dma_data = dma_data_;
        return s;
    }

    void load_state(const State& s) {
        cpu_.load_state(s.cpu);
        ppu_.load_state(s.ppu);
        apu_.load_state(s.apu);
        ctrl1_.load_state(s.ctrl1);
        ctrl2_.load_state(s.ctrl2);
        if (cart_) cart_->load_state(s.cart);
        cpu_ram_ = s.cpu_ram;
        dma_transfer_ = s.dma_transfer;
        dma_dummy_ = s.dma_dummy;
        dma_page_ = s.dma_page;
        dma_addr_ = s.dma_addr;
        dma_data_ = s.dma_data;
    }

private:
    CPU cpu_;
    PPU ppu_;
    APU apu_;
    Controller ctrl1_;
    Controller ctrl2_;

    std::shared_ptr<Cartridge> cart_;

    std::array<uint8_t, 2048> cpu_ram_;
    std::array<uint8_t, 0x400> apu_regs_;

    bool dma_transfer_;
    bool dma_dummy_;
    uint8_t dma_page_;
    uint8_t dma_addr_;
    uint8_t dma_data_;

    std::vector<int16_t> audio_buffer_;
    std::mutex audio_mutex_;
    int last_sample_count_ = 0;
};
