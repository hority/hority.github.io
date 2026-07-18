# IX9 BIT ARCADE

PWA、Rust/WebAssembly、WebGL2 を組み合わせたブラウザNESホームブリュー・アーケードです。市販ROMや第三者のゲームデータは同梱していません。

## 収録ROM

- `NEON SNAKE` — 方向キーで遊ぶグリッド型スネークゲーム
- `APEX 8` — 左右で操舵し、Aボタンでブーストする縦スクロールレース
- `月影のレター` — A、右、STARTで読み進める短編日本語ノベル

3本とも `rom-src/common.asm` を共通エンジンとするオリジナルの6502コードです。`tools/build-roms.mjs` がCHRタイル、16×16日本語グリフ、ネームテーブルを生成し、ca65/ld65で40,976バイトのiNES NROM-256カートリッジに組み立てます。

## ランタイム構成

- `nes_rust_wasm` — CPU / PPU / APUを実行するRust製WebAssembly NESコア
- `WebGLRenderer.ts` — 256×240 RGBAフレームをWebGL2テクスチャに送り、nearest-neighborと軽いCRT走査線を適用
- React + Vite — ROMライブラリ、コントローラー、状態表示、PWAシェル
- Workbox — WASM、ROM、JS、CSSを事前キャッシュしてオフライン起動
- Local Storage — 入力履歴ベースの決定論的クイックセーブ／ロード

互換表示は同梱ROMで検証したMapper 0（NROM）に限定しています。

## 開発

```powershell
npm.cmd install
npm.cmd run dev
```

通常の `npm.cmd run build` はROMも再生成します。cc65がない環境では、チェックイン済みの `public/roms/*.nes` をそのまま使います。ROMを再アセンブルする場合は [cc65](https://cc65.github.io/) を導入し、`CC65_HOME` をcc65のルートへ設定してください。

```powershell
$env:CC65_HOME='C:\tools\cc65'
npm.cmd run build:roms
npm.cmd run build
```

公開ビルドは `../ix9-bit-arcade/` に生成され、GitHub Pagesでは `/ix9-bit-arcade/` から配信できます。

## 操作

| NES | キーボード | タッチ |
|---|---|---|
| D-pad | 矢印キー | 方向パッド |
| B | Z | Bボタン |
| A | X | Aボタン |
| SELECT | Shift | SELECT |
| START | Enter | START |

## ライセンス

アプリシェルと同梱オリジナルROMのソースはこのリポジトリの方針に従います。WASM NESコアのライセンスは [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt) を参照してください。
