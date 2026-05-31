#include "cartridge.h"
#include <fstream>
#include <cstring>

namespace nes {

Cartridge::Cartridge()
    : loaded_(false), mapper_(0), mirroring_(0), prg_banks_(0), chr_banks_(0),
      mapper1_shift_(0), mapper1_control_(0x0C), mapper1_chr_bank0_(0),
      mapper1_chr_bank1_(0), mapper1_prg_bank_(0), mapper2_chr_bank_(0),
      mapper2_prg_bank_(0), mapper3_chr_bank_(0) {}

bool Cartridge::load(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return false;

    uint8_t header[16];
    file.read(reinterpret_cast<char*>(header), 16);

    if (header[0] != 'N' || header[1] != 'E' || header[2] != 'S' || header[3] != 0x1A)
        return false;

    prg_banks_ = header[4];
    chr_banks_ = header[5];
    mirroring_ = (header[6] & 0x01) ? MIRROR_VERTICAL : MIRROR_HORIZONTAL;
    if (header[6] & 0x02) mirroring_ = MIRROR_SINGLE_LOW;
    if (header[6] & 0x08) mirroring_ = MIRROR_FOUR_SCREEN;

    mapper_ = ((header[6] >> 4) & 0x0F) | (header[7] & 0xF0);

    bool has_trainer = (header[6] & 0x04) != 0;
    if (has_trainer) {
        uint8_t trainer[512];
        file.read(reinterpret_cast<char*>(trainer), 512);
    }

    prg_rom_.resize(prg_banks_ * 16384);
    file.read(reinterpret_cast<char*>(prg_rom_.data()), prg_rom_.size());

    if (chr_banks_ > 0) {
        chr_rom_.resize(chr_banks_ * 8192);
        file.read(reinterpret_cast<char*>(chr_rom_.data()), chr_rom_.size());
    } else {
        chr_rom_.resize(8192, 0);
    }

    prg_ram_.resize(8192, 0);

    mapper1_shift_ = 0;
    mapper1_control_ = 0x0C;
    mapper1_chr_bank0_ = 0;
    mapper1_chr_bank1_ = 0;
    mapper1_prg_bank_ = 0;
    mapper2_prg_bank_ = 0;
    mapper2_chr_bank_ = 0;
    mapper3_chr_bank_ = 0;

    loaded_ = true;
    return true;
}

uint8_t Cartridge::mapper_read(uint16_t addr) {
    switch (mapper_) {
    case 0:
        if (addr < 0x2000) {
            return chr_rom_[addr];
        } else if (addr >= 0x8000) {
            uint32_t a = (prg_banks_ == 1) ? (addr & 0x3FFF) : addr;
            return prg_rom_[a & (prg_rom_.size() - 1)];
        } else if (addr >= 0x6000) {
            return prg_ram_[addr & 0x1FFF];
        }
        break;

    case 1:
        if (addr < 0x2000) {
            uint32_t bank = (addr < 0x1000) ? mapper1_chr_bank0_ : mapper1_chr_bank1_;
            return chr_rom_[(bank * 0x1000 + (addr & 0x0FFF)) % chr_rom_.size()];
        } else if (addr >= 0x8000) {
            uint32_t bank;
            if ((mapper1_control_ & 0x0C) == 0x0C) {
                bank = (mapper1_control_ & 0x08) ? mapper1_prg_bank_ : (mapper1_prg_bank_ & 0xFE);
            } else {
                bank = mapper1_prg_bank_;
            }
            return prg_rom_[(bank * 0x4000 + (addr & 0x3FFF)) % prg_rom_.size()];
        } else if (addr >= 0x6000) {
            return prg_ram_[addr & 0x1FFF];
        }
        break;

    case 2:
        if (addr < 0x2000) {
            return chr_rom_[addr % chr_rom_.size()];
        } else if (addr >= 0x8000) {
            return prg_rom_[(mapper2_prg_bank_ * 0x4000 + (addr & 0x3FFF)) % prg_rom_.size()];
        }
        break;

    case 3:
        if (addr < 0x2000) {
            return chr_rom_[(mapper3_chr_bank_ * 0x2000 + addr) % chr_rom_.size()];
        } else if (addr >= 0x8000) {
            return prg_rom_[addr & (prg_rom_.size() - 1)];
        }
        break;
    }
    return 0;
}

void Cartridge::mapper_write(uint16_t addr, uint8_t data) {
    switch (mapper_) {
    case 0:
        if (addr < 0x2000 && chr_rom_.size() > 0) {
            chr_rom_[addr] = data;
        } else if (addr >= 0x6000) {
            prg_ram_[addr & 0x1FFF] = data;
        }
        break;

    case 1:
        if (addr < 0x2000) {
            if (addr < 0x1000)
                mapper1_chr_bank0_ = data;
            else
                mapper1_chr_bank1_ = data;
        } else if (addr >= 0x8000) {
            if (data & 0x80) {
                mapper1_shift_ = 0;
                mapper1_control_ |= 0x0C;
            } else {
                bool complete = (mapper1_shift_ & 0x01);
                mapper1_shift_ = (mapper1_shift_ >> 1) | ((data & 0x01) << 4);
                if (complete) {
                    uint8_t reg = (addr >> 13) & 0x03;
                    switch (reg) {
                    case 0: mapper1_control_ = mapper1_shift_ & 0x1F; break;
                    case 1: mapper1_chr_bank0_ = mapper1_shift_ & 0x1F; break;
                    case 2: mapper1_chr_bank1_ = mapper1_shift_ & 0x1F; break;
                    case 3: mapper1_prg_bank_ = mapper1_shift_ & 0x1F; break;
                    }
                    mapper1_shift_ = 0x10;
                }
            }
        } else if (addr >= 0x6000) {
            prg_ram_[addr & 0x1FFF] = data;
        }
        break;

    case 2:
        if (addr >= 0x8000) {
            mapper2_prg_bank_ = data & 0x0F;
        }
        break;

    case 3:
        if (addr >= 0x8000) {
            mapper3_chr_bank_ = data & 0x03;
        }
        break;
    }
}

uint8_t Cartridge::cpu_read(uint16_t addr) { return mapper_read(addr); }
void Cartridge::cpu_write(uint16_t addr, uint8_t data) { mapper_write(addr, data); }

uint8_t Cartridge::ppu_read(uint16_t addr) {
    if (addr < 0x2000) return mapper_read(addr);
    return 0;
}

void Cartridge::ppu_write(uint16_t addr, uint8_t data) {
    if (addr < 0x2000) mapper_write(addr, data);
}

}
