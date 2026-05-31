#include "cpu.h"
#include <cassert>

namespace nes {

CPU::CPU()
    : a_(0), x_(0), y_(0), sp_(0xFD), pc_(0), status_(0x24), cycles_(0) {}

void CPU::reset() {
    a_ = 0;
    x_ = 0;
    y_ = 0;
    sp_ = 0xFD;
    status_ = 0x24;
    cycles_ = 0;
    uint16_t lo = read(0xFFFC);
    uint16_t hi = read(0xFFFD);
    pc_ = (hi << 8) | lo;
}

void CPU::nmi() {
    push_word(pc_);
    set_flag(StatusFlag::Break, false);
    set_flag(StatusFlag::Unused, true);
    set_flag(StatusFlag::InterruptDisable, true);
    uint16_t lo = read(0xFFFA);
    uint16_t hi = read(0xFFFB);
    pc_ = (hi << 8) | lo;
    cycles_ += 7;
}

void CPU::irq() {
    if (get_flag(StatusFlag::InterruptDisable)) return;
    push_word(pc_);
    set_flag(StatusFlag::Break, false);
    set_flag(StatusFlag::Unused, true);
    set_flag(StatusFlag::InterruptDisable, true);
    uint16_t lo = read(0xFFFE);
    uint16_t hi = read(0xFFFF);
    pc_ = (hi << 8) | lo;
    cycles_ += 7;
}

uint8_t CPU::read(uint16_t addr) { return read_(addr); }
void CPU::write(uint16_t addr, uint8_t data) { write_(addr, data); }

uint8_t CPU::fetch() { return read(pc_++); }
uint16_t CPU::fetch_word() {
    uint8_t lo = fetch();
    uint8_t hi = fetch();
    return (hi << 8) | lo;
}

void CPU::push(uint8_t data) { write(0x0100 | sp_, data); sp_--; }
uint8_t CPU::pull() { sp_++; return read(0x0100 | sp_); }

void CPU::push_word(uint16_t data) {
    push((data >> 8) & 0xFF);
    push(data & 0xFF);
}

uint16_t CPU::pull_word() {
    uint8_t lo = pull();
    uint8_t hi = pull();
    return (hi << 8) | lo;
}

void CPU::set_flag(StatusFlag flag, bool value) {
    if (value) status_ |= static_cast<uint8_t>(flag);
    else status_ &= ~static_cast<uint8_t>(flag);
}

bool CPU::get_flag(StatusFlag flag) const {
    return (status_ & static_cast<uint8_t>(flag)) != 0;
}

uint16_t CPU::addr_immediate() { return pc_++; }
uint16_t CPU::addr_zero_page() { return fetch(); }
uint16_t CPU::addr_zero_page_x() { return (fetch() + x_) & 0xFF; }
uint16_t CPU::addr_zero_page_y() { return (fetch() + y_) & 0xFF; }

uint16_t CPU::addr_absolute() { return fetch_word(); }

uint16_t CPU::addr_absolute_x() {
    uint16_t base = fetch_word();
    uint16_t addr = base + x_;
    if ((base & 0xFF00) != (addr & 0xFF00)) cycles_++;
    return addr;
}

uint16_t CPU::addr_absolute_y() {
    uint16_t base = fetch_word();
    uint16_t addr = base + y_;
    if ((base & 0xFF00) != (addr & 0xFF00)) cycles_++;
    return addr;
}

uint16_t CPU::addr_indirect() {
    uint16_t ptr = fetch_word();
    uint8_t lo = read(ptr);
    uint8_t hi;
    if ((ptr & 0x00FF) == 0x00FF)
        hi = read(ptr & 0xFF00);
    else
        hi = read(ptr + 1);
    return (hi << 8) | lo;
}

uint16_t CPU::addr_indirect_x() {
    uint8_t zp = fetch();
    uint8_t lo = read((zp + x_) & 0xFF);
    uint8_t hi = read((zp + x_ + 1) & 0xFF);
    return (hi << 8) | lo;
}

uint16_t CPU::addr_indirect_y() {
    uint8_t zp = fetch();
    uint8_t lo = read(zp);
    uint8_t hi = read((zp + 1) & 0xFF);
    uint16_t base = (hi << 8) | lo;
    uint16_t addr = base + y_;
    if ((base & 0xFF00) != (addr & 0xFF00)) cycles_++;
    return addr;
}

uint16_t CPU::addr_relative() {
    int8_t offset = static_cast<int8_t>(fetch());
    return pc_ + offset;
}

void CPU::op_lda(uint16_t addr) {
    a_ = read(addr);
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_ldx(uint16_t addr) {
    x_ = read(addr);
    set_flag(StatusFlag::Zero, x_ == 0);
    set_flag(StatusFlag::Negative, x_ & 0x80);
}

void CPU::op_ldy(uint16_t addr) {
    y_ = read(addr);
    set_flag(StatusFlag::Zero, y_ == 0);
    set_flag(StatusFlag::Negative, y_ & 0x80);
}

void CPU::op_sta(uint16_t addr) { write(addr, a_); }
void CPU::op_stx(uint16_t addr) { write(addr, x_); }
void CPU::op_sty(uint16_t addr) { write(addr, y_); }

void CPU::op_adc(uint16_t addr) {
    uint8_t val = read(addr);
    uint16_t sum = a_ + val + (get_flag(StatusFlag::Carry) ? 1 : 0);
    set_flag(StatusFlag::Carry, sum > 0xFF);
    set_flag(StatusFlag::Overflow, (~(a_ ^ val) & (a_ ^ sum)) & 0x80);
    a_ = sum & 0xFF;
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_sbc(uint16_t addr) {
    uint8_t val = read(addr);
    uint16_t diff = a_ - val - (get_flag(StatusFlag::Carry) ? 0 : 1);
    set_flag(StatusFlag::Carry, diff < 0x100);
    set_flag(StatusFlag::Overflow, ((a_ ^ val) & (a_ ^ diff)) & 0x80);
    a_ = diff & 0xFF;
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_and(uint16_t addr) {
    a_ &= read(addr);
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_ora(uint16_t addr) {
    a_ |= read(addr);
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_eor(uint16_t addr) {
    a_ ^= read(addr);
    set_flag(StatusFlag::Zero, a_ == 0);
    set_flag(StatusFlag::Negative, a_ & 0x80);
}

void CPU::op_cmp(uint16_t addr) {
    uint8_t val = read(addr);
    uint16_t diff = a_ - val;
    set_flag(StatusFlag::Carry, a_ >= val);
    set_flag(StatusFlag::Zero, (diff & 0xFF) == 0);
    set_flag(StatusFlag::Negative, diff & 0x80);
}

void CPU::op_cpx(uint16_t addr) {
    uint8_t val = read(addr);
    uint16_t diff = x_ - val;
    set_flag(StatusFlag::Carry, x_ >= val);
    set_flag(StatusFlag::Zero, (diff & 0xFF) == 0);
    set_flag(StatusFlag::Negative, diff & 0x80);
}

void CPU::op_cpy(uint16_t addr) {
    uint8_t val = read(addr);
    uint16_t diff = y_ - val;
    set_flag(StatusFlag::Carry, y_ >= val);
    set_flag(StatusFlag::Zero, (diff & 0xFF) == 0);
    set_flag(StatusFlag::Negative, diff & 0x80);
}

void CPU::op_inc(uint16_t addr) {
    uint8_t val = read(addr) + 1;
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
}

void CPU::op_dec(uint16_t addr) {
    uint8_t val = read(addr) - 1;
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
}

void CPU::op_asl(uint16_t addr) {
    uint8_t val = read(addr);
    set_flag(StatusFlag::Carry, val & 0x80);
    val <<= 1;
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
}

void CPU::op_lsr(uint16_t addr) {
    uint8_t val = read(addr);
    set_flag(StatusFlag::Carry, val & 0x01);
    val >>= 1;
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, false);
}

void CPU::op_rol(uint16_t addr) {
    uint8_t val = read(addr);
    bool carry = get_flag(StatusFlag::Carry);
    set_flag(StatusFlag::Carry, val & 0x80);
    val = (val << 1) | (carry ? 1 : 0);
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
}

void CPU::op_ror(uint16_t addr) {
    uint8_t val = read(addr);
    bool carry = get_flag(StatusFlag::Carry);
    set_flag(StatusFlag::Carry, val & 0x01);
    val = (val >> 1) | (carry ? 0x80 : 0);
    write(addr, val);
    set_flag(StatusFlag::Zero, val == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
}

void CPU::op_bit(uint16_t addr) {
    uint8_t val = read(addr);
    set_flag(StatusFlag::Zero, (a_ & val) == 0);
    set_flag(StatusFlag::Negative, val & 0x80);
    set_flag(StatusFlag::Overflow, val & 0x40);
}

bool CPU::branch(bool condition) {
    int8_t offset = static_cast<int8_t>(fetch());
    if (condition) {
        cycles_++;
        uint16_t old_pc = pc_;
        pc_ += offset;
        if ((old_pc & 0xFF00) != (pc_ & 0xFF00)) cycles_++;
        return true;
    }
    return false;
}

void CPU::step() {
    uint8_t opcode = fetch();
    execute(opcode);
}

void CPU::execute(uint8_t op) {
    switch (op) {
    case 0x69: op_adc(addr_immediate()); cycles_ += 2; break;
    case 0x65: op_adc(addr_zero_page()); cycles_ += 3; break;
    case 0x75: op_adc(addr_zero_page_x()); cycles_ += 4; break;
    case 0x6D: op_adc(addr_absolute()); cycles_ += 4; break;
    case 0x7D: op_adc(addr_absolute_x()); cycles_ += 4; break;
    case 0x79: op_adc(addr_absolute_y()); cycles_ += 4; break;
    case 0x61: op_adc(addr_indirect_x()); cycles_ += 6; break;
    case 0x71: op_adc(addr_indirect_y()); cycles_ += 5; break;

    case 0xE9: op_sbc(addr_immediate()); cycles_ += 2; break;
    case 0xE5: op_sbc(addr_zero_page()); cycles_ += 3; break;
    case 0xF5: op_sbc(addr_zero_page_x()); cycles_ += 4; break;
    case 0xED: op_sbc(addr_absolute()); cycles_ += 4; break;
    case 0xFD: op_sbc(addr_absolute_x()); cycles_ += 4; break;
    case 0xF9: op_sbc(addr_absolute_y()); cycles_ += 4; break;
    case 0xE1: op_sbc(addr_indirect_x()); cycles_ += 6; break;
    case 0xF1: op_sbc(addr_indirect_y()); cycles_ += 5; break;

    case 0x29: op_and(addr_immediate()); cycles_ += 2; break;
    case 0x25: op_and(addr_zero_page()); cycles_ += 3; break;
    case 0x35: op_and(addr_zero_page_x()); cycles_ += 4; break;
    case 0x2D: op_and(addr_absolute()); cycles_ += 4; break;
    case 0x3D: op_and(addr_absolute_x()); cycles_ += 4; break;
    case 0x39: op_and(addr_absolute_y()); cycles_ += 4; break;
    case 0x21: op_and(addr_indirect_x()); cycles_ += 6; break;
    case 0x31: op_and(addr_indirect_y()); cycles_ += 5; break;

    case 0x09: op_ora(addr_immediate()); cycles_ += 2; break;
    case 0x05: op_ora(addr_zero_page()); cycles_ += 3; break;
    case 0x15: op_ora(addr_zero_page_x()); cycles_ += 4; break;
    case 0x0D: op_ora(addr_absolute()); cycles_ += 4; break;
    case 0x1D: op_ora(addr_absolute_x()); cycles_ += 4; break;
    case 0x19: op_ora(addr_absolute_y()); cycles_ += 4; break;
    case 0x01: op_ora(addr_indirect_x()); cycles_ += 6; break;
    case 0x11: op_ora(addr_indirect_y()); cycles_ += 5; break;

    case 0x49: op_eor(addr_immediate()); cycles_ += 2; break;
    case 0x45: op_eor(addr_zero_page()); cycles_ += 3; break;
    case 0x55: op_eor(addr_zero_page_x()); cycles_ += 4; break;
    case 0x4D: op_eor(addr_absolute()); cycles_ += 4; break;
    case 0x5D: op_eor(addr_absolute_x()); cycles_ += 4; break;
    case 0x59: op_eor(addr_absolute_y()); cycles_ += 4; break;
    case 0x41: op_eor(addr_indirect_x()); cycles_ += 6; break;
    case 0x51: op_eor(addr_indirect_y()); cycles_ += 5; break;

    case 0xA9: op_lda(addr_immediate()); cycles_ += 2; break;
    case 0xA5: op_lda(addr_zero_page()); cycles_ += 3; break;
    case 0xB5: op_lda(addr_zero_page_x()); cycles_ += 4; break;
    case 0xAD: op_lda(addr_absolute()); cycles_ += 4; break;
    case 0xBD: op_lda(addr_absolute_x()); cycles_ += 4; break;
    case 0xB9: op_lda(addr_absolute_y()); cycles_ += 4; break;
    case 0xA1: op_lda(addr_indirect_x()); cycles_ += 6; break;
    case 0xB1: op_lda(addr_indirect_y()); cycles_ += 5; break;

    case 0xA2: op_ldx(addr_immediate()); cycles_ += 2; break;
    case 0xA6: op_ldx(addr_zero_page()); cycles_ += 3; break;
    case 0xB6: op_ldx(addr_zero_page_y()); cycles_ += 4; break;
    case 0xAE: op_ldx(addr_absolute()); cycles_ += 4; break;
    case 0xBE: op_ldx(addr_absolute_y()); cycles_ += 4; break;

    case 0xA0: op_ldy(addr_immediate()); cycles_ += 2; break;
    case 0xA4: op_ldy(addr_zero_page()); cycles_ += 3; break;
    case 0xB4: op_ldy(addr_zero_page_x()); cycles_ += 4; break;
    case 0xAC: op_ldy(addr_absolute()); cycles_ += 4; break;
    case 0xBC: op_ldy(addr_absolute_x()); cycles_ += 4; break;

    case 0x85: op_sta(addr_zero_page()); cycles_ += 3; break;
    case 0x95: op_sta(addr_zero_page_x()); cycles_ += 4; break;
    case 0x8D: op_sta(addr_absolute()); cycles_ += 4; break;
    case 0x9D: op_sta(addr_absolute_x()); cycles_ += 5; break;
    case 0x99: op_sta(addr_absolute_y()); cycles_ += 5; break;
    case 0x81: op_sta(addr_indirect_x()); cycles_ += 6; break;
    case 0x91: op_sta(addr_indirect_y()); cycles_ += 6; break;

    case 0x86: op_stx(addr_zero_page()); cycles_ += 3; break;
    case 0x96: op_stx(addr_zero_page_y()); cycles_ += 4; break;
    case 0x8E: op_stx(addr_absolute()); cycles_ += 4; break;

    case 0x84: op_sty(addr_zero_page()); cycles_ += 3; break;
    case 0x94: op_sty(addr_zero_page_x()); cycles_ += 4; break;
    case 0x8C: op_sty(addr_absolute()); cycles_ += 4; break;

    case 0xC9: op_cmp(addr_immediate()); cycles_ += 2; break;
    case 0xC5: op_cmp(addr_zero_page()); cycles_ += 3; break;
    case 0xD5: op_cmp(addr_zero_page_x()); cycles_ += 4; break;
    case 0xCD: op_cmp(addr_absolute()); cycles_ += 4; break;
    case 0xDD: op_cmp(addr_absolute_x()); cycles_ += 4; break;
    case 0xD9: op_cmp(addr_absolute_y()); cycles_ += 4; break;
    case 0xC1: op_cmp(addr_indirect_x()); cycles_ += 6; break;
    case 0xD1: op_cmp(addr_indirect_y()); cycles_ += 5; break;

    case 0xE0: op_cpx(addr_immediate()); cycles_ += 2; break;
    case 0xE4: op_cpx(addr_zero_page()); cycles_ += 3; break;
    case 0xEC: op_cpx(addr_absolute()); cycles_ += 4; break;

    case 0xC0: op_cpy(addr_immediate()); cycles_ += 2; break;
    case 0xC4: op_cpy(addr_zero_page()); cycles_ += 3; break;
    case 0xCC: op_cpy(addr_absolute()); cycles_ += 4; break;

    case 0xE6: op_inc(addr_zero_page()); cycles_ += 5; break;
    case 0xF6: op_inc(addr_zero_page_x()); cycles_ += 6; break;
    case 0xEE: op_inc(addr_absolute()); cycles_ += 6; break;
    case 0xFE: op_inc(addr_absolute_x()); cycles_ += 7; break;

    case 0xC6: op_dec(addr_zero_page()); cycles_ += 5; break;
    case 0xD6: op_dec(addr_zero_page_x()); cycles_ += 6; break;
    case 0xCE: op_dec(addr_absolute()); cycles_ += 6; break;
    case 0xDE: op_dec(addr_absolute_x()); cycles_ += 7; break;

    case 0x06: op_asl(addr_zero_page()); cycles_ += 5; break;
    case 0x16: op_asl(addr_zero_page_x()); cycles_ += 6; break;
    case 0x0E: op_asl(addr_absolute()); cycles_ += 6; break;
    case 0x1E: op_asl(addr_absolute_x()); cycles_ += 7; break;

    case 0x46: op_lsr(addr_zero_page()); cycles_ += 5; break;
    case 0x56: op_lsr(addr_zero_page_x()); cycles_ += 6; break;
    case 0x4E: op_lsr(addr_absolute()); cycles_ += 6; break;
    case 0x5E: op_lsr(addr_absolute_x()); cycles_ += 7; break;

    case 0x26: op_rol(addr_zero_page()); cycles_ += 5; break;
    case 0x36: op_rol(addr_zero_page_x()); cycles_ += 6; break;
    case 0x2E: op_rol(addr_absolute()); cycles_ += 6; break;
    case 0x3E: op_rol(addr_absolute_x()); cycles_ += 7; break;

    case 0x66: op_ror(addr_zero_page()); cycles_ += 5; break;
    case 0x76: op_ror(addr_zero_page_x()); cycles_ += 6; break;
    case 0x6E: op_ror(addr_absolute()); cycles_ += 6; break;
    case 0x7E: op_ror(addr_absolute_x()); cycles_ += 7; break;

    case 0x0A: { set_flag(StatusFlag::Carry, a_ & 0x80); a_ <<= 1; set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 2; } break;
    case 0x4A: { set_flag(StatusFlag::Carry, a_ & 0x01); a_ >>= 1; set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, false); cycles_ += 2; } break;
    case 0x2A: { bool c = get_flag(StatusFlag::Carry); set_flag(StatusFlag::Carry, a_ & 0x80); a_ = (a_ << 1) | (c ? 1 : 0); set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 2; } break;
    case 0x6A: { bool c = get_flag(StatusFlag::Carry); set_flag(StatusFlag::Carry, a_ & 0x01); a_ = (a_ >> 1) | (c ? 0x80 : 0); set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 2; } break;

    case 0x24: op_bit(addr_zero_page()); cycles_ += 3; break;
    case 0x2C: op_bit(addr_absolute()); cycles_ += 4; break;

    case 0xAA: x_ = a_; set_flag(StatusFlag::Zero, x_ == 0); set_flag(StatusFlag::Negative, x_ & 0x80); cycles_ += 2; break;
    case 0xA8: y_ = a_; set_flag(StatusFlag::Zero, y_ == 0); set_flag(StatusFlag::Negative, y_ & 0x80); cycles_ += 2; break;
    case 0x8A: a_ = x_; set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 2; break;
    case 0x98: a_ = y_; set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 2; break;
    case 0xBA: x_ = sp_; set_flag(StatusFlag::Zero, x_ == 0); set_flag(StatusFlag::Negative, x_ & 0x80); cycles_ += 2; break;
    case 0x9A: sp_ = x_; cycles_ += 2; break;

    case 0xE8: x_++; set_flag(StatusFlag::Zero, x_ == 0); set_flag(StatusFlag::Negative, x_ & 0x80); cycles_ += 2; break;
    case 0xC8: y_++; set_flag(StatusFlag::Zero, y_ == 0); set_flag(StatusFlag::Negative, y_ & 0x80); cycles_ += 2; break;
    case 0xCA: x_--; set_flag(StatusFlag::Zero, x_ == 0); set_flag(StatusFlag::Negative, x_ & 0x80); cycles_ += 2; break;
    case 0x88: y_--; set_flag(StatusFlag::Zero, y_ == 0); set_flag(StatusFlag::Negative, y_ & 0x80); cycles_ += 2; break;

    case 0x10: branch(!get_flag(StatusFlag::Negative)); cycles_ += 2; break;
    case 0x30: branch(get_flag(StatusFlag::Negative)); cycles_ += 2; break;
    case 0x50: branch(!get_flag(StatusFlag::Overflow)); cycles_ += 2; break;
    case 0x70: branch(get_flag(StatusFlag::Overflow)); cycles_ += 2; break;
    case 0x90: branch(!get_flag(StatusFlag::Carry)); cycles_ += 2; break;
    case 0xB0: branch(get_flag(StatusFlag::Carry)); cycles_ += 2; break;
    case 0xD0: branch(!get_flag(StatusFlag::Zero)); cycles_ += 2; break;
    case 0xF0: branch(get_flag(StatusFlag::Zero)); cycles_ += 2; break;

    case 0x4C: pc_ = fetch_word(); cycles_ += 3; break;
    case 0x6C: pc_ = addr_indirect(); cycles_ += 5; break;

    case 0x20: { uint16_t ret = pc_ + 1; push_word(ret); pc_ = fetch_word(); cycles_ += 6; } break;

    case 0x40: { set_flag(StatusFlag::InterruptDisable, false); pc_ = pull_word() + 1; set_flag(StatusFlag::Break, false); cycles_ += 6; } break;
    case 0x60: { pc_ = pull_word() + 1; cycles_ += 6; } break;

    case 0x00: { push_word(pc_ - 1); set_flag(StatusFlag::Break, true); set_flag(StatusFlag::InterruptDisable, true); uint16_t lo = read(0xFFFE); uint16_t hi = read(0xFFFF); pc_ = (hi << 8) | lo; cycles_ += 7; } break;

    case 0x48: push(a_); cycles_ += 3; break;
    case 0x68: a_ = pull(); set_flag(StatusFlag::Zero, a_ == 0); set_flag(StatusFlag::Negative, a_ & 0x80); cycles_ += 4; break;
    case 0x08: php(); cycles_ += 3; break;
    case 0x28: plp(); cycles_ += 4; break;

    case 0xEA: cycles_ += 2; break;

    default: break;
    }
}

void CPU::php() {
    uint8_t s = status_ | 0x30;
    push(s);
}

void CPU::plp() {
    status_ = pull();
    set_flag(StatusFlag::Break, false);
    set_flag(StatusFlag::Unused, true);
}

}
