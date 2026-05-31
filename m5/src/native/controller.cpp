#include "controller.h"

namespace nes {

Controller::Controller() : state_(0), shift_register_(0), strobe_(false) {}

void Controller::set_button(int button, bool pressed) {
    if (pressed)
        state_ |= (1 << button);
    else
        state_ &= ~(1 << button);
}

uint8_t Controller::read() {
    if (strobe_) {
        return (state_ & 0x01);
    }
    uint8_t val = (shift_register_ & 0x01);
    shift_register_ >>= 1;
    shift_register_ |= 0x80;
    return val;
}

void Controller::write(uint8_t data) {
    strobe_ = (data & 0x01) != 0;
    if (strobe_) {
        shift_register_ = state_;
    }
}

void Controller::reset() {
    state_ = 0;
    shift_register_ = 0;
    strobe_ = false;
}

}
