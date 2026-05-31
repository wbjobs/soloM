#pragma once
#include <cstdint>

namespace nes {

class Controller {
public:
    Controller();

    void set_button(int button, bool pressed);
    uint8_t read();
    void write(uint8_t data);

    void reset();

    struct State {
        uint8_t state;
        uint8_t shift_register;
        bool strobe;
    };

    State save_state() const {
        return { state_, shift_register_, strobe_ };
    }

    void load_state(const State& s) {
        state_ = s.state;
        shift_register_ = s.shift_register;
        strobe_ = s.strobe;
    }

    enum Button {
        A      = 0,
        B      = 1,
        SELECT = 2,
        START  = 3,
        UP     = 4,
        DOWN   = 5,
        LEFT   = 6,
        RIGHT  = 7,
    };

private:
    uint8_t state_;
    uint8_t shift_register_;
    bool strobe_;
};

}
