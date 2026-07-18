/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'nes_rust_wasm' {
  export enum Button {
    Poweroff,
    Reset,
    Select,
    Start,
    Joypad1A,
    Joypad1B,
    Joypad1Up,
    Joypad1Down,
    Joypad1Left,
    Joypad1Right,
  }

  export class WasmNes {
    static new(): WasmNes;
    free(): void;
    set_rom(contents: Uint8Array): void;
    bootup(): void;
    reset(): void;
    step_frame(): void;
    update_pixels(pixels: Uint8Array): void;
    update_sample_buffer(buffer: Float32Array): void;
    press_button(button: number): void;
    release_button(button: number): void;
  }
}
