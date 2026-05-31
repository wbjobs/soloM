{
  "targets": [
    {
      "target_name": "nes_core",
      "sources": [
        "src/native/cpu.cpp",
        "src/native/ppu.cpp",
        "src/native/apu.cpp",
        "src/native/bus.cpp",
        "src/native/cartridge.cpp",
        "src/native/controller.cpp",
        "src/native/nes.cpp",
        "src/native/binding.cpp"
      ],
      "include_dirs": [
        "<!@node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1
        }
      },
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["winmm.lib"]
        }]
      ]
    }
  ]
}
