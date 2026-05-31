#include "apu.h"

namespace nes {

const uint16_t APU::NOISE_PERIODS[16] = { 4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068 };
const uint16_t APU::DMC_PERIODS[16] = { 428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54 };
const uint8_t APU::DUTY_TABLES[4][8] = {
    { 0, 1, 0, 0, 0, 0, 0, 0 },
    { 0, 1, 1, 0, 0, 0, 0, 0 },
    { 0, 1, 1, 1, 1, 0, 0, 0 },
    { 1, 0, 0, 1, 1, 1, 1, 1 },
};
const uint8_t APU::TRIANGLE_TABLE[32] = {
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
};

APU::APU() {
    reset();
}

void APU::reset() {
    std::memset(&pulse1_, 0, sizeof(pulse1_));
    std::memset(&pulse2_, 0, sizeof(pulse2_));
    std::memset(&triangle_, 0, sizeof(triangle_));
    std::memset(&noise_, 0, sizeof(noise_));
    std::memset(&dmc_, 0, sizeof(dmc_));

    pulse1_.duty = 0;
    pulse2_.duty = 0;
    pulse1_.envelope_divider = 1;
    pulse2_.envelope_divider = 1;
    noise_.envelope_divider = 1;
    noise_.shift_register = 1;

    triangle_.sequence_counter = 0;
    triangle_.output = 0;

    frame_counter_mode_ = 0;
    frame_irq_inhibit_ = false;
    frame_counter_ = 0;
    frame_sequence_ = 0;
    frame_irq_flag_ = false;

    cycle_counter_ = 0;
    sample_counter_ = 0;
    sample_count_ = 0;
}

uint8_t APU::read_register(uint16_t addr) {
    if (addr == 0x4015) {
        uint8_t status = 0;
        if (pulse1_.length_counter > 0) status |= 0x01;
        if (pulse2_.length_counter > 0) status |= 0x02;
        if (triangle_.length_counter > 0) status |= 0x04;
        if (noise_.length_counter > 0) status |= 0x08;
        if (dmc_.sample_counter > 0) status |= 0x10;
        if (frame_irq_flag_) status |= 0x40;
        if (dmc_.irq_enable && dmc_.sample_counter == 0) status |= 0x80;
        frame_irq_flag_ = false;
        return status;
    }
    return 0;
}

void APU::write_register(uint16_t addr, uint8_t data) {
    switch (addr) {
    case 0x4000:
        pulse1_.volume = data & 0x0F;
        pulse1_.envelope_constant = (data & 0x10) != 0;
        pulse1_.envelope_loop = (data & 0x20) != 0;
        pulse1_.length_halt = (data & 0x20) != 0;
        pulse1_.duty = (data >> 6) & 0x03;
        break;
    case 0x4001:
        pulse1_.sweep_shift = data & 0x07;
        pulse1_.sweep_negate = (data & 0x08) != 0;
        pulse1_.sweep_period = (data >> 4) & 0x07;
        pulse1_.sweep_enable = (data & 0x80) != 0;
        pulse1_.sweep_counter = pulse1_.sweep_period;
        break;
    case 0x4002:
        pulse1_.timer_load = (pulse1_.timer_load & 0xFF00) | data;
        pulse1_.timer = pulse1_.timer_load;
        break;
    case 0x4003:
        pulse1_.timer_load = (pulse1_.timer_load & 0x00FF) | ((data & 0x07) << 8);
        pulse1_.timer = pulse1_.timer_load;
        pulse1_.length_counter = (data >> 3) & 0x1F;
        pulse1_.envelope_divider = 1;
        pulse1_.envelope_counter = 15;
        pulse1_.sweep_muted = false;
        break;
    case 0x4004:
        pulse2_.volume = data & 0x0F;
        pulse2_.envelope_constant = (data & 0x10) != 0;
        pulse2_.envelope_loop = (data & 0x20) != 0;
        pulse2_.length_halt = (data & 0x20) != 0;
        pulse2_.duty = (data >> 6) & 0x03;
        break;
    case 0x4005:
        pulse2_.sweep_shift = data & 0x07;
        pulse2_.sweep_negate = (data & 0x08) != 0;
        pulse2_.sweep_period = (data >> 4) & 0x07;
        pulse2_.sweep_enable = (data & 0x80) != 0;
        pulse2_.sweep_counter = pulse2_.sweep_period;
        break;
    case 0x4006:
        pulse2_.timer_load = (pulse2_.timer_load & 0xFF00) | data;
        pulse2_.timer = pulse2_.timer_load;
        break;
    case 0x4007:
        pulse2_.timer_load = (pulse2_.timer_load & 0x00FF) | ((data & 0x07) << 8);
        pulse2_.timer = pulse2_.timer_load;
        pulse2_.length_counter = (data >> 3) & 0x1F;
        pulse2_.envelope_divider = 1;
        pulse2_.envelope_counter = 15;
        pulse2_.sweep_muted = false;
        break;
    case 0x4008:
        triangle_.linear_load = data & 0x7F;
        triangle_.length_halt = (data & 0x80) != 0;
        break;
    case 0x400A:
        triangle_.timer_load = (triangle_.timer_load & 0xFF00) | data;
        triangle_.timer = triangle_.timer_load;
        break;
    case 0x400B:
        triangle_.timer_load = (triangle_.timer_load & 0x00FF) | ((data & 0x07) << 8);
        triangle_.timer = triangle_.timer_load;
        triangle_.length_counter = (data >> 3) & 0x1F;
        triangle_.linear_reload = true;
        break;
    case 0x400C:
        noise_.volume = data & 0x0F;
        noise_.envelope_constant = (data & 0x10) != 0;
        noise_.envelope_loop = (data & 0x20) != 0;
        noise_.length_halt = (data & 0x20) != 0;
        break;
    case 0x400E:
        noise_.timer_period = NOISE_PERIODS[data & 0x0F];
        noise_.mode_flag = (data & 0x80) != 0;
        break;
    case 0x400F:
        noise_.length_counter = (data >> 3) & 0x1F;
        noise_.envelope_divider = 1;
        noise_.envelope_counter = 15;
        break;
    case 0x4010:
        dmc_.irq_enable = (data & 0x80) != 0;
        dmc_.loop = (data & 0x40) != 0;
        dmc_.rate_index = data & 0x0F;
        dmc_.timer_period = DMC_PERIODS[dmc_.rate_index];
        break;
    case 0x4011:
        dmc_.volume = data & 0x7F;
        break;
    case 0x4012:
        dmc_.sample_address = 0xC000 | (data << 6);
        break;
    case 0x4013:
        dmc_.sample_length = (data << 4) | 1;
        break;
    case 0x4015:
        if ((data & 0x01) == 0) pulse1_.length_counter = 0;
        if ((data & 0x02) == 0) pulse2_.length_counter = 0;
        if ((data & 0x04) == 0) triangle_.length_counter = 0;
        if ((data & 0x08) == 0) noise_.length_counter = 0;
        if (data & 0x10) {
            if (dmc_.sample_counter == 0) {
                dmc_.sample_counter = dmc_.sample_length;
                dmc_.current_byte = 0;
                dmc_.bits_remaining = 0;
                dmc_.silence = true;
            }
        } else {
            dmc_.sample_counter = 0;
        }
        frame_irq_flag_ = false;
        break;
    case 0x4017:
        frame_counter_mode_ = (data & 0x80) >> 7;
        frame_irq_inhibit_ = (data & 0x40) != 0;
        frame_counter_ = 0;
        frame_sequence_ = 0;
        break;
    }
}

void APU::clock_length_counters() {
    static const uint8_t LENGTH_TABLE[32] = {
        10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
        12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
    };

    if (pulse1_.length_counter > 0 && !pulse1_.length_halt)
        pulse1_.length_counter--;
    if (pulse2_.length_counter > 0 && !pulse2_.length_halt)
        pulse2_.length_counter--;
    if (triangle_.length_counter > 0 && !triangle_.length_halt)
        triangle_.length_counter--;
    if (noise_.length_counter > 0 && !noise_.length_halt)
        noise_.length_counter--;
}

void APU::clock_envelope(PulseChannel& ch) {
    if (ch.envelope_divider > 0) {
        ch.envelope_divider--;
    } else {
        ch.envelope_divider = ch.envelope_constant ? 1 : (ch.volume + 1);
        if (ch.envelope_counter > 0) {
            ch.envelope_counter--;
        } else if (ch.envelope_loop) {
            ch.envelope_counter = 15;
        }
    }
}

void APU::clock_envelope(NoiseChannel& ch) {
    if (ch.envelope_divider > 0) {
        ch.envelope_divider--;
    } else {
        ch.envelope_divider = ch.envelope_constant ? 1 : (ch.volume + 1);
        if (ch.envelope_counter > 0) {
            ch.envelope_counter--;
        } else if (ch.envelope_loop) {
            ch.envelope_counter = 15;
        }
    }
}

void APU::clock_sweep(PulseChannel& ch, int channel) {
    if (ch.sweep_counter > 0) {
        ch.sweep_counter--;
    } else {
        ch.sweep_counter = ch.sweep_period;
        if (ch.sweep_enable && ch.sweep_shift > 0) {
            int delta = ch.timer_load >> ch.sweep_shift;
            int target = ch.timer_load + (ch.sweep_negate ? -delta - (channel == 1 ? 0 : 1) : delta);
            if (target >= 0x800) return;
            if (target < 0x08) return;
            ch.timer_load = target & 0x7FF;
            ch.timer = ch.timer_load;
            if (ch.timer < 0x08 || ch.timer > 0x7FF) {
                ch.sweep_muted = true;
            }
        }
    }
}

void APU::clock_triangle_linear() {
    if (triangle_.linear_reload) {
        triangle_.linear_counter = triangle_.linear_load;
    } else if (triangle_.linear_counter > 0) {
        triangle_.linear_counter--;
    }
    if (!triangle_.length_halt) {
        triangle_.linear_reload = false;
    }
}

void APU::clock_pulse(PulseChannel& ch, int channel) {
    if (ch.timer > 0) {
        ch.timer--;
    } else {
        ch.timer = ch.timer_load;
        ch.duty_counter = (ch.duty_counter + 1) % 8;
    }

    if (ch.timer < 0x08 || ch.timer > 0x7FF) ch.sweep_muted = true;
}

void APU::clock_triangle() {
    if (triangle_.timer > 0) {
        triangle_.timer--;
    } else {
        triangle_.timer = triangle_.timer_load;
        if (triangle_.linear_counter > 0 && triangle_.length_counter > 0) {
            triangle_.sequence_counter = (triangle_.sequence_counter + 1) % 32;
        }
    }
}

void APU::clock_noise() {
    if (noise_.timer_counter > 0) {
        noise_.timer_counter--;
    } else {
        noise_.timer_counter = noise_.timer_period;
        int bit = noise_.mode_flag ? 6 : 1;
        uint16_t feedback = (noise_.shift_register & 0x01) ^ ((noise_.shift_register >> bit) & 0x01);
        noise_.shift_register = (noise_.shift_register >> 1) | (feedback << 14);
    }
}

void APU::clock_dmc() {
    if (dmc_.timer_counter > 0) {
        dmc_.timer_counter--;
    } else {
        dmc_.timer_counter = dmc_.timer_period;
        if (dmc_.bits_remaining == 0) {
            if (dmc_.sample_counter > 0) {
                dmc_.sample_counter--;
                dmc_.current_byte = 0;
                dmc_.bits_remaining = 8;
                if (dmc_.sample_counter == 0 && dmc_.loop) {
                    dmc_.sample_counter = dmc_.sample_length;
                }
                if (dmc_.sample_counter == 0 && dmc_.irq_enable) {
                    if (irq_cb_) irq_cb_();
                }
            }
        }
        if (dmc_.bits_remaining > 0) {
            int delta = (dmc_.current_byte & 0x01) ? 2 : -2;
            int new_output = dmc_.output + delta;
            if (new_output >= 0 && new_output <= 127) {
                dmc_.output = new_output;
            }
            dmc_.current_byte >>= 1;
            dmc_.bits_remaining--;
        }
    }
}

void APU::quarter_frame() {
    clock_envelope(pulse1_);
    clock_envelope(pulse2_);
    clock_envelope(noise_);
    clock_triangle_linear();
}

void APU::half_frame() {
    quarter_frame();
    clock_length_counters();
    clock_sweep(pulse1_, 1);
    clock_sweep(pulse2_, 2);
}

uint8_t APU::pulse_sample(const PulseChannel& ch, int channel) const {
    if (ch.sweep_muted || ch.length_counter == 0) return 0;
    if (DUTY_TABLES[ch.duty][ch.duty_counter] == 0) return 0;
    return ch.envelope_constant ? ch.volume : ch.envelope_counter;
}

uint8_t APU::triangle_sample() const {
    if (triangle_.linear_counter == 0 || triangle_.length_counter == 0) return 0;
    return TRIANGLE_TABLE[triangle_.sequence_counter];
}

uint8_t APU::noise_sample() const {
    if (noise_.length_counter == 0) return 0;
    if (noise_.shift_register & 0x01) return 0;
    return noise_.envelope_constant ? noise_.volume : noise_.envelope_counter;
}

uint8_t APU::dmc_sample() const {
    return dmc_.output;
}

void APU::step(int cpu_cycles) {
    for (int i = 0; i < cpu_cycles; i++) {
        cycle_counter_++;

        clock_pulse(pulse1_, 1);
        clock_pulse(pulse2_, 2);
        clock_triangle();
        clock_noise();
        clock_dmc();

        if (frame_counter_mode_ == 0) {
            if (cycle_counter_ >= 7457) {
                cycle_counter_ = 0;
                if (frame_sequence_ == 0 || frame_sequence_ == 2) {
                    quarter_frame();
                } else {
                    half_frame();
                }
                frame_sequence_++;
                if (frame_sequence_ >= 4) frame_sequence_ = 0;
                if (frame_sequence_ == 3 && !frame_irq_inhibit_) {
                    frame_irq_flag_ = true;
                    if (irq_cb_) irq_cb_();
                }
            }
        } else {
            if (cycle_counter_ >= 7457) {
                cycle_counter_ = 0;
                if (frame_sequence_ < 5) {
                    if (frame_sequence_ == 0 || frame_sequence_ == 2 || frame_sequence_ == 4) {
                        quarter_frame();
                    } else {
                        half_frame();
                    }
                    frame_sequence_++;
                    if (frame_sequence_ >= 5) frame_sequence_ = 0;
                }
            }
        }

        sample_counter_++;
        if (sample_counter_ >= CYCLES_PER_SAMPLE) {
            sample_counter_ = 0;
            sample_count_++;
        }
    }
}

int16_t APU::sample() {
    int p1 = pulse_sample(pulse1_, 1);
    int p2 = pulse_sample(pulse2_, 2);
    int t = triangle_sample();
    int n = noise_sample();
    int d = dmc_sample();

    float pulse_out = 95.88f / (8128.0f / (p1 + p2) + 100.0f);
    float tnd_out = 159.79f / (1.0f / (t / 8227.0f + n / 12241.0f + d / 22638.0f) + 100.0f);

    int16_t out = static_cast<int16_t>((pulse_out + tnd_out) * 32767.0f * 0.3f);
    return out;
}

}
