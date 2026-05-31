#pragma once
#include <cstdint>
#include <array>
#include <functional>

namespace nes {

enum class StatusFlag : uint8_t {
    Carry             = 0x01,
    Zero              = 0x02,
    InterruptDisable  = 0x04,
    DecimalMode       = 0x08,
    Break             = 0x10,
    Unused            = 0x20,
    Overflow          = 0x40,
    Negative          = 0x80,
};

class CPU {
public:
    CPU();

    void reset();
    void step();
    void nmi();
    void irq();

    void set_read_callback(std::function<uint8_t(uint16_t)> cb) { read_ = cb; }
    void set_write_callback(std::function<void(uint16_t, uint8_t)> cb) { write_ = cb; }

    uint64_t cycles() const { return cycles_; }

    struct State {
        uint8_t a;
        uint8_t x;
        uint8_t y;
        uint8_t sp;
        uint16_t pc;
        uint8_t status;
        uint64_t cycles;
    };

    State save_state() const {
        return { a_, x_, y_, sp_, pc_, status_, cycles_ };
    }

    void load_state(const State& s) {
        a_ = s.a; x_ = s.x; y_ = s.y;
        sp_ = s.sp; pc_ = s.pc; status_ = s.status; cycles_ = s.cycles;
    }

private:
    uint8_t  a_;
    uint8_t  x_;
    uint8_t  y_;
    uint8_t  sp_;
    uint16_t pc_;
    uint8_t  status_;
    uint64_t cycles_;

    std::function<uint8_t(uint16_t)> read_;
    std::function<void(uint16_t, uint8_t)> write_;

    uint8_t read(uint16_t addr);
    void write(uint16_t addr, uint8_t data);

    uint8_t fetch();
    uint16_t fetch_word();

    void push(uint8_t data);
    uint8_t pull();
    void push_word(uint16_t data);
    uint16_t pull_word();

    void set_flag(StatusFlag flag, bool value);
    bool get_flag(StatusFlag flag) const;

    uint16_t addr_immediate();
    uint16_t addr_zero_page();
    uint16_t addr_zero_page_x();
    uint16_t addr_zero_page_y();
    uint16_t addr_absolute();
    uint16_t addr_absolute_x();
    uint16_t addr_absolute_y();
    uint16_t addr_indirect();
    uint16_t addr_indirect_x();
    uint16_t addr_indirect_y();
    uint16_t addr_relative();

    void op_lda(uint16_t addr);
    void op_ldx(uint16_t addr);
    void op_ldy(uint16_t addr);
    void op_sta(uint16_t addr);
    void op_stx(uint16_t addr);
    void op_sty(uint16_t addr);
    void op_adc(uint16_t addr);
    void op_sbc(uint16_t addr);
    void op_and(uint16_t addr);
    void op_ora(uint16_t addr);
    void op_eor(uint16_t addr);
    void op_cmp(uint16_t addr);
    void op_cpx(uint16_t addr);
    void op_cpy(uint16_t addr);
    void op_inc(uint16_t addr);
    void op_dec(uint16_t addr);
    void op_asl(uint16_t addr);
    void op_lsr(uint16_t addr);
    void op_rol(uint16_t addr);
    void op_ror(uint16_t addr);
    void op_bit(uint16_t addr);

    bool branch(bool condition);

    void execute(uint8_t opcode);
};

}
