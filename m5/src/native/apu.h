#pragma once
#include <cstdint>
#include <cstring>
#include <array>
#include <functional>

namespace nes {

class APU {
public:
    static constexpr int SAMPLE_RATE = 44100;
    static constexpr int CPU_CLOCK = 1789773;
    static constexpr int CYCLES_PER_SAMPLE = CPU_CLOCK / SAMPLE_RATE;

    APU();

    void reset();

    uint8_t read_register(uint16_t addr);
    void write_register(uint16_t addr, uint8_t data);

    void step(int cpu_cycles);

    int16_t sample();

    int sample_count() const { return sample_count_; }

    void set_irq_callback(std::function<void()> cb) { irq_cb_ = cb; }

    struct PulseState {
        uint8_t duty;
        uint8_t volume;
        bool envelope_loop;
        bool envelope_constant;
        uint16_t timer;
        uint16_t timer_load;
        uint8_t length_counter;
        bool length_halt;
        uint8_t sweep_shift;
        bool sweep_enable;
        bool sweep_negate;
        uint8_t sweep_period;
        int envelope_counter;
        int envelope_divider;
        int sweep_counter;
        int sequence_counter;
        int duty_counter;
        bool sweep_muted;
        uint8_t sample;
    };

    struct TriangleState {
        uint16_t timer;
        uint16_t timer_load;
        uint8_t length_counter;
        bool length_halt;
        uint8_t linear_counter;
        uint8_t linear_load;
        bool linear_reload;
        int sequence_counter;
        int output;
    };

    struct NoiseState {
        uint8_t volume;
        bool envelope_loop;
        bool envelope_constant;
        uint16_t timer_period;
        uint8_t length_counter;
        bool length_halt;
        bool mode_flag;
        int envelope_counter;
        int envelope_divider;
        int timer_counter;
        uint16_t shift_register;
        uint8_t sample;
    };

    struct DMCState {
        uint8_t volume;
        uint16_t sample_address;
        uint16_t sample_length;
        bool irq_enable;
        bool loop;
        uint8_t rate_index;
        uint8_t output;
        uint8_t bits_remaining;
        uint8_t current_byte;
        bool silence;
        uint16_t sample_counter;
        int timer_counter;
    };

    struct State {
        PulseState pulse1;
        PulseState pulse2;
        TriangleState triangle;
        NoiseState noise;
        DMCState dmc;
        uint8_t frame_counter_mode;
        bool frame_irq_inhibit;
        int frame_counter;
        int frame_sequence;
        bool frame_irq_flag;
        int cycle_counter;
        int sample_counter;
        int sample_count;
    };

    State save_state() const {
        State s;
        auto save_pulse = [](const PulseChannel& p) -> PulseState {
            return { p.duty, p.volume, p.envelope_loop, p.envelope_constant, p.timer, p.timer_load,
                p.length_counter, p.length_halt, p.sweep_shift, p.sweep_enable, p.sweep_negate,
                p.sweep_period, p.envelope_counter, p.envelope_divider, p.sweep_counter,
                p.sequence_counter, p.duty_counter, p.sweep_muted, p.sample };
        };
        s.pulse1 = save_pulse(pulse1_);
        s.pulse2 = save_pulse(pulse2_);
        s.triangle = { triangle_.timer, triangle_.timer_load, triangle_.length_counter, triangle_.length_halt,
            triangle_.linear_counter, triangle_.linear_load, triangle_.linear_reload,
            triangle_.sequence_counter, triangle_.output };
        s.noise = { noise_.volume, noise_.envelope_loop, noise_.envelope_constant, noise_.timer_period,
            noise_.length_counter, noise_.length_halt, noise_.mode_flag, noise_.envelope_counter,
            noise_.envelope_divider, noise_.timer_counter, noise_.shift_register, noise_.sample };
        s.dmc = { dmc_.volume, dmc_.sample_address, dmc_.sample_length, dmc_.irq_enable, dmc_.loop,
            dmc_.rate_index, dmc_.output, dmc_.bits_remaining, dmc_.current_byte, dmc_.silence,
            dmc_.sample_counter, dmc_.timer_counter };
        s.frame_counter_mode = frame_counter_mode_;
        s.frame_irq_inhibit = frame_irq_inhibit_;
        s.frame_counter = frame_counter_;
        s.frame_sequence = frame_sequence_;
        s.frame_irq_flag = frame_irq_flag_;
        s.cycle_counter = cycle_counter_;
        s.sample_counter = sample_counter_;
        s.sample_count = sample_count_;
        return s;
    }

    void load_state(const State& s) {
        auto load_pulse = [](PulseChannel& p, const PulseState& st) {
            p.duty = st.duty; p.volume = st.volume; p.envelope_loop = st.envelope_loop;
            p.envelope_constant = st.envelope_constant; p.timer = st.timer; p.timer_load = st.timer_load;
            p.length_counter = st.length_counter; p.length_halt = st.length_halt;
            p.sweep_shift = st.sweep_shift; p.sweep_enable = st.sweep_enable;
            p.sweep_negate = st.sweep_negate; p.sweep_period = st.sweep_period;
            p.envelope_counter = st.envelope_counter; p.envelope_divider = st.envelope_divider;
            p.sweep_counter = st.sweep_counter; p.sequence_counter = st.sequence_counter;
            p.duty_counter = st.duty_counter; p.sweep_muted = st.sweep_muted; p.sample = st.sample;
        };
        load_pulse(pulse1_, s.pulse1);
        load_pulse(pulse2_, s.pulse2);
        triangle_.timer = s.triangle.timer; triangle_.timer_load = s.triangle.timer_load;
        triangle_.length_counter = s.triangle.length_counter; triangle_.length_halt = s.triangle.length_halt;
        triangle_.linear_counter = s.triangle.linear_counter; triangle_.linear_load = s.triangle.linear_load;
        triangle_.linear_reload = s.triangle.linear_reload;
        triangle_.sequence_counter = s.triangle.sequence_counter; triangle_.output = s.triangle.output;
        noise_.volume = s.noise.volume; noise_.envelope_loop = s.noise.envelope_loop;
        noise_.envelope_constant = s.noise.envelope_constant; noise_.timer_period = s.noise.timer_period;
        noise_.length_counter = s.noise.length_counter; noise_.length_halt = s.noise.length_halt;
        noise_.mode_flag = s.noise.mode_flag; noise_.envelope_counter = s.noise.envelope_counter;
        noise_.envelope_divider = s.noise.envelope_divider; noise_.timer_counter = s.noise.timer_counter;
        noise_.shift_register = s.noise.shift_register; noise_.sample = s.noise.sample;
        dmc_.volume = s.dmc.volume; dmc_.sample_address = s.dmc.sample_address;
        dmc_.sample_length = s.dmc.sample_length; dmc_.irq_enable = s.dmc.irq_enable;
        dmc_.loop = s.dmc.loop; dmc_.rate_index = s.dmc.rate_index; dmc_.output = s.dmc.output;
        dmc_.bits_remaining = s.dmc.bits_remaining; dmc_.current_byte = s.dmc.current_byte;
        dmc_.silence = s.dmc.silence; dmc_.sample_counter = s.dmc.sample_counter;
        dmc_.timer_counter = s.dmc.timer_counter;
        frame_counter_mode_ = s.frame_counter_mode; frame_irq_inhibit_ = s.frame_irq_inhibit;
        frame_counter_ = s.frame_counter; frame_sequence_ = s.frame_sequence;
        frame_irq_flag_ = s.frame_irq_flag; cycle_counter_ = s.cycle_counter;
        sample_counter_ = s.sample_counter; sample_count_ = s.sample_count;
    }

private:
    struct PulseChannel {
        uint8_t duty;
        uint8_t volume;
        bool envelope_loop;
        bool envelope_constant;
        uint16_t timer;
        uint16_t timer_load;
        uint8_t length_counter;
        bool length_halt;
        uint8_t sweep_shift;
        bool sweep_enable;
        bool sweep_negate;
        uint8_t sweep_period;

        int envelope_counter;
        int envelope_divider;
        int sweep_counter;
        int sequence_counter;
        int duty_counter;
        bool sweep_muted;

        uint8_t sample;
    };

    struct TriangleChannel {
        uint16_t timer;
        uint16_t timer_load;
        uint8_t length_counter;
        bool length_halt;
        uint8_t linear_counter;
        uint8_t linear_load;
        bool linear_reload;

        int sequence_counter;
        int output;
    };

    struct NoiseChannel {
        uint8_t volume;
        bool envelope_loop;
        bool envelope_constant;
        uint16_t timer_period;
        uint8_t length_counter;
        bool length_halt;
        bool mode_flag;

        int envelope_counter;
        int envelope_divider;
        int timer_counter;
        uint16_t shift_register;

        uint8_t sample;
    };

    struct DMCChannel {
        uint8_t volume;
        uint16_t sample_address;
        uint16_t sample_length;

        bool irq_enable;
        bool loop;
        uint8_t rate_index;

        uint8_t output;
        uint8_t bits_remaining;
        uint8_t current_byte;
        bool silence;
        uint16_t sample_counter;
        int timer_counter;
    };

    PulseChannel pulse1_;
    PulseChannel pulse2_;
    TriangleChannel triangle_;
    NoiseChannel noise_;
    DMCChannel dmc_;

    uint8_t frame_counter_mode_;
    bool frame_irq_inhibit_;
    int frame_counter_;
    int frame_sequence_;
    bool frame_irq_flag_;

    int cycle_counter_;
    int sample_counter_;
    int sample_count_;

    std::function<void()> irq_cb_;

    void clock_length_counters();
    void clock_envelope(PulseChannel& ch);
    void clock_envelope(NoiseChannel& ch);
    void clock_sweep(PulseChannel& ch, int channel);
    void clock_triangle_linear();

    void clock_pulse(PulseChannel& ch, int channel);
    void clock_triangle();
    void clock_noise();
    void clock_dmc();

    void quarter_frame();
    void half_frame();

    uint8_t pulse_sample(const PulseChannel& ch, int channel) const;
    uint8_t triangle_sample() const;
    uint8_t noise_sample() const;
    uint8_t dmc_sample() const;

    static const uint16_t NOISE_PERIODS[16];
    static const uint16_t DMC_PERIODS[16];
    static const uint8_t DUTY_TABLES[4][8];
    static const uint8_t TRIANGLE_TABLE[32];
};

}
