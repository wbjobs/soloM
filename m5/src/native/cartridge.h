#pragma once
#include <cstdint>
#include <vector>
#include <string>
#include <memory>

namespace nes {

enum Mirror {
    MIRROR_HORIZONTAL  = 0,
    MIRROR_VERTICAL    = 1,
    MIRROR_SINGLE_LOW  = 2,
    MIRROR_SINGLE_HIGH = 3,
    MIRROR_FOUR_SCREEN = 4,
};

class Cartridge {
public:
    Cartridge();

    bool load(const std::string& path);

    uint8_t cpu_read(uint16_t addr);
    void cpu_write(uint16_t addr, uint8_t data);

    uint8_t ppu_read(uint16_t addr);
    void ppu_write(uint16_t addr, uint8_t data);

    bool loaded() const { return loaded_; }
    int mirroring() const { return mirroring_; }
    int mapper() const { return mapper_; }

    struct State {
        std::vector<uint8_t> prg_ram;
        uint8_t mapper1_shift;
        uint8_t mapper1_control;
        uint8_t mapper1_chr_bank0;
        uint8_t mapper1_chr_bank1;
        uint8_t mapper1_prg_bank;
        uint8_t mapper2_chr_bank;
        uint8_t mapper2_prg_bank;
        bool mapper3_chr_bank;
    };

    State save_state() const {
        State s;
        s.prg_ram = prg_ram_;
        s.mapper1_shift = mapper1_shift_;
        s.mapper1_control = mapper1_control_;
        s.mapper1_chr_bank0 = mapper1_chr_bank0_;
        s.mapper1_chr_bank1 = mapper1_chr_bank1_;
        s.mapper1_prg_bank = mapper1_prg_bank_;
        s.mapper2_chr_bank = mapper2_chr_bank_;
        s.mapper2_prg_bank = mapper2_prg_bank_;
        s.mapper3_chr_bank = mapper3_chr_bank_;
        return s;
    }

    void load_state(const State& s) {
        prg_ram_ = s.prg_ram;
        mapper1_shift_ = s.mapper1_shift;
        mapper1_control_ = s.mapper1_control;
        mapper1_chr_bank0_ = s.mapper1_chr_bank0;
        mapper1_chr_bank1_ = s.mapper1_chr_bank1;
        mapper1_prg_bank_ = s.mapper1_prg_bank;
        mapper2_chr_bank_ = s.mapper2_chr_bank;
        mapper2_prg_bank_ = s.mapper2_prg_bank;
        mapper3_chr_bank_ = s.mapper3_chr_bank;
    }

private:
    bool loaded_;
    int mapper_;
    int mirroring_;
    int prg_banks_;
    int chr_banks_;

    std::vector<uint8_t> prg_rom_;
    std::vector<uint8_t> chr_rom_;
    std::vector<uint8_t> prg_ram_;

    uint8_t mapper_read(uint16_t addr);
    void mapper_write(uint16_t addr, uint8_t data);

    uint8_t mapper1_shift_;
    uint8_t mapper1_control_;
    uint8_t mapper1_chr_bank0_;
    uint8_t mapper1_chr_bank1_;
    uint8_t mapper1_prg_bank_;

    uint8_t mapper2_chr_bank_;
    uint8_t mapper2_prg_bank_;

    bool mapper3_chr_bank_;
};

}
