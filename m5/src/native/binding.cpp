#include <napi.h>
#include "nes.h"
#include <cstring>
#include <string>

static nes::NES* g_nes = nullptr;

class NesWrapper : public Napi::ObjectWrap<NesWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    NesWrapper(const Napi::CallbackInfo& info);

private:
    Napi::Value LoadROM(const Napi::CallbackInfo& info);
    Napi::Value Reset(const Napi::CallbackInfo& info);
    Napi::Value StepFrame(const Napi::CallbackInfo& info);
    Napi::Value StepBySamples(const Napi::CallbackInfo& info);
    Napi::Value GetFrameBuffer(const Napi::CallbackInfo& info);
    Napi::Value GetAudioSamples(const Napi::CallbackInfo& info);
    Napi::Value ClearAudioSamples(const Napi::CallbackInfo& info);
    Napi::Value SetButton(const Napi::CallbackInfo& info);
    Napi::Value IsLoaded(const Napi::CallbackInfo& info);

    std::unique_ptr<nes::NES> nes_;
    std::vector<int16_t> audio_cache_;
};

Napi::Object NesWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "NesEmulator", {
        InstanceMethod("loadROM", &NesWrapper::LoadROM),
        InstanceMethod("reset", &NesWrapper::Reset),
        InstanceMethod("stepFrame", &NesWrapper::StepFrame),
        InstanceMethod("stepBySamples", &NesWrapper::StepBySamples),
        InstanceMethod("getFrameBuffer", &NesWrapper::GetFrameBuffer),
        InstanceMethod("getAudioSamples", &NesWrapper::GetAudioSamples),
        InstanceMethod("clearAudioSamples", &NesWrapper::ClearAudioSamples),
        InstanceMethod("setButton", &NesWrapper::SetButton),
        InstanceMethod("isLoaded", &NesWrapper::IsLoaded),
    });
    exports.Set("NesEmulator", func);
    return exports;
}

NesWrapper::NesWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<NesWrapper>(info) {
    nes_ = std::make_unique<nes::NES>();
}

Napi::Value NesWrapper::LoadROM(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "ROM path string expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string path = info[0].As<Napi::String>().Utf8Value();
    bool result = nes_->load_rom(path);
    return Napi::Boolean::New(env, result);
}

Napi::Value NesWrapper::Reset(const Napi::CallbackInfo& info) {
    nes_->reset();
    return info.Env().Null();
}

Napi::Value NesWrapper::StepFrame(const Napi::CallbackInfo& info) {
    nes_->step_frame();
    return info.Env().Null();
}

Napi::Value NesWrapper::StepBySamples(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Sample count expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    int samples = info[0].As<Napi::Number>().Int32Value();
    nes_->step_by_samples(samples);
    return env.Null();
}

Napi::Value NesWrapper::GetFrameBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    const uint32_t* buf = nes_->frame_buffer();
    int size = 256 * 240;
    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::New(env, size * 4, [buf](Napi::Env, uint8_t* data) {
        std::memcpy(data, buf, 256 * 240 * 4);
    });
    std::memcpy(buffer.Data(), buf, size * 4);
    return buffer;
}

Napi::Value NesWrapper::GetAudioSamples(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    audio_cache_.clear();
    int count = nes_->get_audio_samples(audio_cache_);
    if (count == 0) {
        return Napi::Buffer<int16_t>::New(env, 0);
    }
    Napi::Buffer<int16_t> buffer = Napi::Buffer<int16_t>::New(env, count);
    std::memcpy(buffer.Data(), audio_cache_.data(), count * sizeof(int16_t));
    return buffer;
}

Napi::Value NesWrapper::ClearAudioSamples(const Napi::CallbackInfo& info) {
    nes_->clear_audio_samples();
    return info.Env().Null();
}

Napi::Value NesWrapper::SetButton(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
        Napi::TypeError::New(env, "Button number and boolean expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    int button = info[0].As<Napi::Number>().Int32Value();
    bool pressed = info[1].As<Napi::Boolean>().Value();
    nes_->set_button(button, pressed);
    return env.Null();
}

Napi::Value NesWrapper::IsLoaded(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), nes_->bus().cartridge() != nullptr);
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    NesWrapper::Init(env, exports);
    exports.Set("BUTTON_A", Napi::Number::New(env, nes::Controller::A));
    exports.Set("BUTTON_B", Napi::Number::New(env, nes::Controller::B));
    exports.Set("BUTTON_SELECT", Napi::Number::New(env, nes::Controller::SELECT));
    exports.Set("BUTTON_START", Napi::Number::New(env, nes::Controller::START));
    exports.Set("BUTTON_UP", Napi::Number::New(env, nes::Controller::UP));
    exports.Set("BUTTON_DOWN", Napi::Number::New(env, nes::Controller::DOWN));
    exports.Set("BUTTON_LEFT", Napi::Number::New(env, nes::Controller::LEFT));
    exports.Set("BUTTON_RIGHT", Napi::Number::New(env, nes::Controller::RIGHT));
    return exports;
}

NODE_API_MODULE(nes_core, InitModule)
