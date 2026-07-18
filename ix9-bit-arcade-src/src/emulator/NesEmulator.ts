import { Button, WasmNes } from 'nes_rust_wasm';
import { WebGLRenderer } from './WebGLRenderer';

export type NesAction = 'a' | 'b' | 'select' | 'start' | 'up' | 'down' | 'left' | 'right';

export interface EmulatorTelemetry {
  fps: number;
  frame: number;
  loading: boolean;
  hasSave: boolean;
}

type InputEvent = { frame: number; button: number; down: boolean };
type ReplaySave = { version: 1; gameId: string; frame: number; events: InputEvent[]; savedAt: string };

const FRAME_MS = 1000 / 60.0988;
const SAVE_PREFIX = 'ix9-bit-arcade:replay-state:';
const actionButtons: Record<NesAction, number> = {
  a: Button.Joypad1A,
  b: Button.Joypad1B,
  select: Button.Select,
  start: Button.Start,
  up: Button.Joypad1Up,
  down: Button.Joypad1Down,
  left: Button.Joypad1Left,
  right: Button.Joypad1Right,
};

export class NesEmulator {
  private nes: WasmNes | null = null;
  private renderer: WebGLRenderer;
  private framePixels = new Uint8Array(256 * 240 * 4);
  private romBytes: Uint8Array | null = null;
  private gameId = '';
  private raf = 0;
  private paused = false;
  private loading = false;
  private frame = 0;
  private lastTick = performance.now();
  private accumulator = 0;
  private fpsFrames = 0;
  private fpsStartedAt = performance.now();
  private fps = 0;
  private events: InputEvent[] = [];
  private held = new Set<number>();
  private audioContext: AudioContext | null = null;
  private audioNode: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly onTelemetry: (telemetry: EmulatorTelemetry) => void) {
    this.renderer = new WebGLRenderer(canvas);
    this.renderer.clear();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  async load(gameId: string, romPath: string): Promise<void> {
    this.loading = true;
    this.emitTelemetry();
    const response = await fetch(`${import.meta.env.BASE_URL}${romPath}`);
    if (!response.ok) throw new Error(`ROMを読み込めませんでした (${response.status})`);
    this.romBytes = new Uint8Array(await response.arrayBuffer());
    this.gameId = gameId;
    this.boot(this.romBytes);
    this.events = [];
    this.frame = 0;
    this.paused = false;
    this.loading = false;
    this.lastTick = performance.now();
    this.accumulator = 0;
    this.emitTelemetry();
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    this.lastTick = performance.now();
    return this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    if (!this.romBytes) return;
    this.boot(this.romBytes);
    this.events = [];
    this.frame = 0;
    this.paused = false;
    this.lastTick = performance.now();
    this.emitTelemetry();
  }

  press(action: NesAction): void {
    const button = actionButtons[action];
    if (!this.nes || this.held.has(button)) return;
    this.ensureAudio().catch(() => undefined);
    this.held.add(button);
    this.nes.press_button(button);
    this.events.push({ frame: this.frame, button, down: true });
  }

  release(action: NesAction): void {
    const button = actionButtons[action];
    if (!this.nes || !this.held.has(button)) return;
    this.held.delete(button);
    this.nes.release_button(button);
    this.events.push({ frame: this.frame, button, down: false });
  }

  save(): string {
    if (!this.gameId) throw new Error('先にROMを起動してください。');
    const state: ReplaySave = {
      version: 1,
      gameId: this.gameId,
      frame: this.frame,
      events: this.events,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${SAVE_PREFIX}${this.gameId}`, JSON.stringify(state));
    this.emitTelemetry();
    return state.savedAt;
  }

  async restore(): Promise<void> {
    if (!this.romBytes || !this.gameId) throw new Error('先にROMを起動してください。');
    const raw = localStorage.getItem(`${SAVE_PREFIX}${this.gameId}`);
    if (!raw) throw new Error('このROMのクイックセーブはまだありません。');
    const state = JSON.parse(raw) as ReplaySave;
    if (state.version !== 1 || state.gameId !== this.gameId) throw new Error('セーブデータの形式が一致しません。');

    this.loading = true;
    this.paused = true;
    this.emitTelemetry();
    this.boot(this.romBytes);
    let eventIndex = 0;
    for (let replayFrame = 0; replayFrame < state.frame; replayFrame += 1) {
      while (eventIndex < state.events.length && state.events[eventIndex].frame <= replayFrame) {
        const event = state.events[eventIndex];
        if (event.down) this.nes?.press_button(event.button);
        else this.nes?.release_button(event.button);
        eventIndex += 1;
      }
      this.nes?.step_frame();
      if (replayFrame > 0 && replayFrame % 900 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    this.frame = state.frame;
    this.events = [...state.events];
    this.nes?.update_pixels(this.framePixels);
    this.renderer.render(this.framePixels);
    this.loading = false;
    this.paused = false;
    this.lastTick = performance.now();
    this.accumulator = 0;
    this.fpsFrames = 0;
    this.fpsStartedAt = performance.now();
    this.fps = 0;
    this.emitTelemetry();
  }

  hasSave(gameId = this.gameId): boolean {
    return Boolean(gameId && localStorage.getItem(`${SAVE_PREFIX}${gameId}`));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.nes?.free();
    this.audioNode?.disconnect();
    this.gain?.disconnect();
    this.audioContext?.close().catch(() => undefined);
  }

  private boot(bytes: Uint8Array): void {
    this.nes?.free();
    this.nes = WasmNes.new();
    this.nes.set_rom(bytes);
    this.nes.bootup();
    this.held.clear();
  }

  private loop(now: number): void {
    const delta = Math.min(100, now - this.lastTick);
    this.lastTick = now;
    if (this.nes && !this.paused && !this.loading) {
      this.accumulator += delta;
      let stepped = false;
      while (this.accumulator >= FRAME_MS) {
        this.nes.step_frame();
        this.frame += 1;
        this.fpsFrames += 1;
        this.accumulator -= FRAME_MS;
        stepped = true;
      }
      if (stepped) {
        this.nes.update_pixels(this.framePixels);
        this.renderer.render(this.framePixels, now);
      }
      if (now - this.fpsStartedAt >= 1000) {
        this.fps = (this.fpsFrames * 1000) / (now - this.fpsStartedAt);
        this.fpsFrames = 0;
        this.fpsStartedAt = now;
        this.emitTelemetry();
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private emitTelemetry(): void {
    this.onTelemetry({
      fps: this.fps,
      frame: this.frame,
      loading: this.loading,
      hasSave: this.hasSave(),
    });
  }

  private async ensureAudio(): Promise<void> {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      return;
    }
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.audioContext = new AudioContextClass({ sampleRate: 44100 });
    this.audioNode = this.audioContext.createScriptProcessor(4096, 0, 1);
    this.gain = this.audioContext.createGain();
    this.gain.gain.value = 0.14;
    this.audioNode.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0);
      if (!this.nes || this.paused || this.loading) output.fill(0);
      else this.nes.update_sample_buffer(output);
    };
    this.audioNode.connect(this.gain);
    this.gain.connect(this.audioContext.destination);
    await this.audioContext.resume();
  }
}
