import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Braces,
  Check,
  Cpu,
  Download,
  Expand,
  Gauge,
  HardDriveDownload,
  Pause,
  Play,
  Power,
  RotateCcw,
  Save,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { games, type GameInfo } from './games';
import { NesEmulator, type EmulatorTelemetry, type NesAction } from './emulator/NesEmulator';
import snakeCover from './assets/covers/neon-snake.webp';
import raceCover from './assets/covers/apex-8.webp';
import novelCover from './assets/covers/tsukikage-letter.webp';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const initialTelemetry: EmulatorTelemetry = { fps: 0, frame: 0, loading: true, hasSave: false };
const coverImages = { snake: snakeCover, race: raceCover, novel: novelCover } as const;
const keyboardActions: Record<string, NesAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  z: 'b', Z: 'b', x: 'a', X: 'a', Enter: 'start', Shift: 'select',
};

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function Cover({ game }: { game: GameInfo }) {
  return (
    <div className={`game-cover cover--${game.kind}`} aria-hidden="true">
      <img src={coverImages[game.kind]} alt="" />
      <strong>{game.kind === 'novel' ? '月影' : game.title}</strong>
    </div>
  );
}

function GameCard({ game, selected, onSelect }: { game: GameInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`game-card${selected ? ' is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <Cover game={game} />
      <span className="game-card__copy">
        <strong>{game.title}</strong>
        <span>{game.genre}</span>
        <span className="player-count">1 PLAYER</span>
        <small>{game.size}</small>
      </span>
      <span className="game-card__arrow" aria-hidden="true">→</span>
    </button>
  );
}

interface PadButtonProps {
  action: NesAction;
  label: React.ReactNode;
  className?: string;
  onPress: (action: NesAction) => void;
  onRelease: (action: NesAction) => void;
}

function PadButton({ action, label, className = '', onPress, onRelease }: PadButtonProps) {
  return (
    <button
      className={className}
      aria-label={typeof label === 'string' ? label : action}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onPress(action); }}
      onPointerUp={() => window.setTimeout(() => onRelease(action), 42)}
      onPointerCancel={() => onRelease(action)}
      onContextMenu={(event) => event.preventDefault()}
    >{label}</button>
  );
}

function Controller({ onPress, onRelease }: { onPress: (action: NesAction) => void; onRelease: (action: NesAction) => void }) {
  return (
    <section className="controller" aria-label="タッチコントローラー">
      <div className="speaker speaker--left" aria-hidden="true" />
      <div className="dpad">
        <PadButton action="up" label="▲" className="dpad__up" onPress={onPress} onRelease={onRelease} />
        <PadButton action="left" label="◀" className="dpad__left" onPress={onPress} onRelease={onRelease} />
        <span className="dpad__center" />
        <PadButton action="right" label="▶" className="dpad__right" onPress={onPress} onRelease={onRelease} />
        <PadButton action="down" label="▼" className="dpad__down" onPress={onPress} onRelease={onRelease} />
      </div>
      <div className="system-buttons">
        <label><PadButton action="select" label="" onPress={onPress} onRelease={onRelease} /><span>SELECT</span></label>
        <label><PadButton action="start" label="" onPress={onPress} onRelease={onRelease} /><span>START</span></label>
      </div>
      <div className="action-buttons">
        <label><PadButton action="b" label="" onPress={onPress} onRelease={onRelease} /><span>B</span></label>
        <label><PadButton action="a" label="" onPress={onPress} onRelease={onRelease} /><span>A</span></label>
      </div>
      <div className="speaker speaker--right" aria-hidden="true" />
    </section>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emulatorRef = useRef<NesEmulator | null>(null);
  const [selected, setSelected] = useState(games[0]);
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [paused, setPaused] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [message, setMessage] = useState('WASMコアを起動しています…');
  const [error, setError] = useState('');

  const flash = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 2400);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const emulator = new NesEmulator(canvasRef.current, setTelemetry);
      emulatorRef.current = emulator;
      emulator.load(games[0].id, games[0].rom)
        .then(() => flash('NEON SNAKE — READY'))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
      return () => emulator.destroy();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [flash]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const action = keyboardActions[event.key];
      if (!action || event.repeat) return;
      event.preventDefault();
      emulatorRef.current?.press(action);
    };
    const up = (event: KeyboardEvent) => {
      const action = keyboardActions[event.key];
      if (!action) return;
      event.preventDefault();
      emulatorRef.current?.release(action);
    };
    const releaseAll = () => Object.values(keyboardActions).forEach((action) => emulatorRef.current?.release(action));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const installedHandler = () => { setInstalled(true); setInstallPrompt(null); flash('アプリをインストールしました'); };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    window.addEventListener('beforeinstallprompt', installHandler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
      window.removeEventListener('beforeinstallprompt', installHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [flash]);

  const selectGame = useCallback(async (game: GameInfo) => {
    if (game.id === selected.id || telemetry.loading) return;
    setSelected(game);
    setPaused(false);
    setError('');
    setMessage(`${game.title} をロード中…`);
    try {
      await emulatorRef.current?.load(game.id, game.rom);
      flash(`${game.title} — READY`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [flash, selected.id, telemetry.loading]);

  const press = useCallback((action: NesAction) => emulatorRef.current?.press(action), []);
  const release = useCallback((action: NesAction) => emulatorRef.current?.release(action), []);

  const palette = useMemo(() => selected.kind === 'snake'
    ? ['#05080a','#2437a0','#5a27b7','#165ccc','#55c73e','#ef5d52','#f7aaa9','#eee8d8']
    : selected.kind === 'race'
      ? ['#05080a','#193777','#d84f39','#f08c3e','#e8d55b','#40b7c9','#ede6d5','#ffffff']
      : ['#05080a','#20206e','#512889','#cf5267','#ef9b68','#f2d399','#d7d0ec','#ffffff'], [selected.kind]);

  const doInstall = async () => {
    if (!installPrompt) { flash(installed ? 'インストール済みです' : 'ブラウザの「ホーム画面に追加」を使えます'); return; }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  };

  const save = () => {
    try { emulatorRef.current?.save(); flash('クイックセーブを保存しました'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const load = async () => {
    try { setMessage('入力履歴から状態を復元中…'); await emulatorRef.current?.restore(); flash('クイックセーブを復元しました'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const togglePause = () => setPaused(emulatorRef.current?.togglePause() ?? false);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="IX9 BIT ARCADE ホーム"><Mark /><span>IX9 BIT ARCADE</span></a>
        <div className="topbar__actions">
          <button className="top-action top-action--accent" onClick={doInstall}><Download size={17} />{installed ? 'INSTALLED' : 'INSTALL APP'}</button>
          <button className="top-action" onClick={() => document.documentElement.requestFullscreen?.()}><Expand size={17} />FULLSCREEN</button>
          <span className={`network-state ${online ? 'is-online' : ''}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'OFFLINE READY' : 'PLAYING OFFLINE'}</span>
        </div>
      </header>

      <section className="workbench">
        <aside className="library">
          <div className="panel-title"><span>ROM LIBRARY</span><Braces size={18} /></div>
          <div className="library__items">
            {games.map((game) => <GameCard key={game.id} game={game} selected={game.id === selected.id} onSelect={() => selectGame(game)} />)}
          </div>
          <p className="library__note">3 ORIGINAL NROM CARTRIDGES<br />NO COPYRIGHTED ROMS INCLUDED.</p>
        </aside>

        <section className="console-stage">
          <div className="screen-frame">
            <canvas ref={canvasRef} aria-label={`${selected.title} のNESエミュレーション画面`} />
            <span className="screen-reflection" aria-hidden="true" />
            {telemetry.loading && <div className="screen-state"><span className="loader" />LOADING CARTRIDGE</div>}
            {paused && !telemetry.loading && <div className="screen-state">PAUSED</div>}
            {error && <div className="screen-state screen-state--error">ERROR<br /><small>{error}</small></div>}
          </div>
          <div className="transport">
            <button className="transport__danger" onClick={() => { emulatorRef.current?.reset(); setPaused(false); flash('カートリッジをリセットしました'); }}><RotateCcw size={18} />RESET</button>
            <button onClick={togglePause}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? 'RESUME' : 'PAUSE'}</button>
            <button onClick={save}><Save size={18} />SAVE</button>
            <button onClick={load} disabled={!telemetry.hasSave}><Upload size={18} />LOAD</button>
            <span className="keyboard-hint">⌨ ARROWS · Z/B · X/A · ENTER/START</span>
          </div>
          <div className="mobile-game-switcher">
            {games.map((game) => <button key={game.id} className={game.id === selected.id ? 'is-selected' : ''} onClick={() => selectGame(game)}>{game.title}</button>)}
          </div>
        </section>

        <aside className="telemetry">
          <div className="metric"><Cpu /><span>WASM CORE</span><strong>OK</strong></div>
          <div className="metric"><Box /><span>WEBGL2</span><strong>OK</strong></div>
          <div className="metric"><Gauge /><span>60 FPS</span><strong>{telemetry.fps ? telemetry.fps.toFixed(1) : '—'}</strong></div>
          <div className="metric"><HardDriveDownload /><span>MAPPER 0</span><strong>NROM</strong></div>
          <div className="palette"><h2>PALETTE</h2><div>{palette.map((color) => <i key={color} style={{ background: color }} />)}</div></div>
          <div className="how-to">
            <h2>HOW TO PLAY</h2>
            <p>{selected.controls}</p>
            <dl><div><dt>ARROWS</dt><dd>MOVE</dd></div><div><dt>Z / X</dt><dd>B / A</dd></div><div><dt>ENTER</dt><dd>START</dd></div></dl>
          </div>
          <p className="build-note"><Check size={14} /> BUILT FOR NES HOMEBREW.<br />PLAY. CREATE. PRESERVE.</p>
          <span className="frame-count">FRAME {telemetry.frame.toString().padStart(7, '0')}</span>
        </aside>
      </section>

      <Controller onPress={press} onRelease={release} />

      {(message || error) && <div className={`toast${error ? ' toast--error' : ''}`} role="status" onClick={() => { setMessage(''); setError(''); }}>
        {error ? <Power size={16} /> : <Check size={16} />}{error || message}
      </div>}
    </main>
  );
}
