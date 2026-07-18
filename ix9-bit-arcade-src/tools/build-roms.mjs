import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romRoot = path.join(root, 'rom-src');
const generated = path.join(romRoot, 'generated');
const publicRoms = path.join(root, 'public', 'roms');
await mkdir(generated, { recursive: true });
await mkdir(publicRoms, { recursive: true });

const font = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'], H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'], J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
};

const tile = (fill = 0) => Array.from({ length: 8 }, () => Array(8).fill(fill));
const clone = (source) => source.map((row) => [...row]);
const setPixel = (pixels, x, y, color) => { if (x >= 0 && x < 8 && y >= 0 && y < 8) pixels[y][x] = color; };

function glyph5x7(pattern) {
  const pixels = tile();
  pattern?.forEach((row, y) => [...row].forEach((value, x) => {
    if (value === '1') pixels[y][x + 1] = 1;
  }));
  return pixels;
}

function encodeTile(pixels) {
  const out = Buffer.alloc(16);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const value = pixels[y][x] & 3;
      out[y] |= (value & 1) << (7 - x);
      out[y + 8] |= ((value >> 1) & 1) << (7 - x);
    }
  }
  return out;
}

function baseChr() {
  const tiles = Array.from({ length: 512 }, () => tile());
  for (let i = 0; i < 26; i += 1) tiles[i + 1] = glyph5x7(font[String.fromCharCode(65 + i)]);
  for (let i = 0; i < 10; i += 1) tiles[i + 27] = glyph5x7(font[String(i)]);
  tiles[37] = glyph5x7(['00000','00000','00000','11111','00000','00000','00000']);
  tiles[38] = glyph5x7(['00000','00100','00100','00000','00100','00100','00000']);
  tiles[39] = glyph5x7(['00000','00000','00000','00000','00000','00110','00110']);
  tiles[40] = glyph5x7(['00001','00010','00100','01000','10000','00000','00000']);
  tiles[41] = glyph5x7(['00100','00100','00100','00100','00100','00000','00100']);
  return tiles;
}

function writeChr(name, tiles) {
  return writeFile(path.join(generated, `${name}.chr`), Buffer.concat(tiles.map(encodeTile)));
}

const charTile = (char) => {
  if (char === ' ') return 0;
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 64;
  if (char >= '0' && char <= '9') return char.charCodeAt(0) - 48 + 27;
  return ({ '-': 37, ':': 38, '.': 39, '/': 40, '!': 41 })[char] ?? 0;
};

function makeNametable() {
  return new Uint8Array(1024);
}

function textLine(nam, row, col, value) {
  [...value].forEach((char, index) => { nam[row * 32 + col + index] = charTile(char); });
}

function setAttribute(nam, palette) {
  nam.fill((palette & 3) * 0x55, 960);
}

async function buildSnakeAssets() {
  const tiles = baseChr();
  const body = tile();
  for (let y = 1; y < 7; y += 1) for (let x = 1; x < 7; x += 1) body[y][x] = ((x + y) % 2) + 1;
  tiles[64] = body;
  const head = clone(body);
  head[2][2] = 3; head[2][5] = 3; head[5][2] = 0; head[5][3] = 2; head[5][4] = 2; head[5][5] = 0;
  tiles[65] = head;
  const fruit = tile();
  ['00110000','01111000','11111100','11111100','11111100','01111000','00110000','00010000'].forEach((row,y)=>[...row].forEach((v,x)=>{ if(v==='1') fruit[y][x]= y===0 || y===7 ? 2 : 3; }));
  tiles[66] = fruit;
  const border = tile();
  for (let i = 0; i < 8; i += 1) { border[0][i] = 1; border[7][i] = 2; }
  tiles[67] = border;
  await writeChr('snake', tiles);

  const nam = makeNametable();
  textLine(nam, 1, 3, 'NEON SNAKE');
  textLine(nam, 1, 23, 'SCORE');
  for (let x = 1; x < 31; x += 1) { nam[4 * 32 + x] = 67; nam[28 * 32 + x] = 67; }
  for (let y = 5; y < 28; y += 1) { nam[y * 32 + 1] = 67; nam[y * 32 + 30] = 67; }
  for (let y = 6; y < 28; y += 4) for (let x = 4; x < 29; x += 4) nam[y * 32 + x] = 39;
  setAttribute(nam, 0);
  await writeFile(path.join(generated, 'snake.nam'), nam);
}

function carTile(part, color) {
  const pixels = tile();
  const masks = [
    ['00111111','01111111','11111111','11001111','11001111','11111111','11111111','11000011'],
    ['11111100','11111110','11111111','11110011','11110011','11111111','11111111','11000011'],
    ['11000011','11111111','11111111','11000011','11111111','11111111','01111110','00111100'],
    ['11000011','11111111','11111111','11000011','11111111','11111111','01111110','00111100'],
  ];
  masks[part].forEach((row,y)=>[...row].forEach((v,x)=>{ if(v==='1') pixels[y][x]=color; }));
  if (part < 2) { pixels[4][part ? 2 : 5] = 3; pixels[5][part ? 2 : 5] = 3; }
  return pixels;
}

async function buildRaceAssets() {
  const tiles = baseChr();
  for (let i = 0; i < 4; i += 1) tiles[64 + i] = carTile(i, 1);
  for (let i = 0; i < 4; i += 1) tiles[68 + i] = carTile(i, 2);
  const asphalt = tile();
  asphalt[1][1]=1; asphalt[6][5]=1; asphalt[3][7]=1;
  tiles[72] = asphalt;
  const edge = tile();
  for (let y=0;y<8;y+=1) for(let x=0;x<8;x+=1) edge[y][x] = ((x+y)>>2)%2 ? 1 : 2;
  tiles[73] = edge;
  const dash = tile();
  for (let y=0;y<8;y+=1) { dash[y][3]=3; dash[y][4]=3; }
  tiles[74] = dash;
  await writeChr('race', tiles);

  const nam = makeNametable();
  textLine(nam, 1, 3, 'APEX 8');
  textLine(nam, 1, 23, 'DIST');
  for (let y=3;y<30;y+=1) {
    for (let x=4;x<28;x+=1) nam[y*32+x] = 72;
    nam[y*32+4]=73; nam[y*32+27]=73;
    if ((y%6)<3) { nam[y*32+12]=74; nam[y*32+20]=74; }
  }
  setAttribute(nam, 0);
  await writeFile(path.join(generated, 'race.nam'), nam);
}

function scenePixels() {
  const width = 128, height = 32;
  const pixels = Array.from({ length: height }, () => Array(width).fill(0));
  const circle = (cx, cy, radius, color) => {
    for (let y=cy-radius;y<=cy+radius;y+=1) for(let x=cx-radius;x<=cx+radius;x+=1) if ((x-cx)**2+(y-cy)**2 <= radius**2 && x>=0&&x<width&&y>=0&&y<height) pixels[y][x]=color;
  };
  circle(98,8,7,1);
  for(let y=22;y<31;y+=1) for(let x=8;x<120;x+=1) if ((x+y)%9<5) pixels[y][x]=1;
  for(let x=0;x<128;x+=1) { pixels[24][x]=2; pixels[25][x]=2; }
  for(let y=8;y<25;y+=1) { pixels[y][18]=2; pixels[y][19]=2; pixels[y][110]=2; pixels[y][111]=2; }
  for(let x=16;x<114;x+=1) pixels[9][x]=2;
  // two people waiting under the moon
  circle(53,14,4,2); circle(73,15,4,2);
  for(let y=18;y<25;y+=1){ for(let x=49-(y-18)/4;x<=57+(y-18)/4;x+=1) pixels[y][Math.floor(x)]=2; for(let x=69-(y-18)/4;x<=77+(y-18)/4;x+=1) pixels[y][Math.floor(x)]=2; }
  return pixels;
}

function packScene(tiles, start, pixels, sourceX, sourceY, columns, rows) {
  for (let ty=0;ty<rows;ty+=1) for(let tx=0;tx<columns;tx+=1) {
    const out = tile();
    for(let y=0;y<8;y+=1) for(let x=0;x<8;x+=1) out[y][x]=pixels[sourceY+ty*8+y]?.[sourceX+tx*8+x] ?? 0;
    tiles[start + ty*columns + tx] = out;
  }
}

async function renderJapaneseGlyph(char) {
  const escaped = char.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="black"/><text x="8" y="14" text-anchor="middle" font-family="Yu Gothic UI, Meiryo, sans-serif" font-size="15" font-weight="700" fill="white">${escaped}</text></svg>`);
  const { data } = await sharp(svg).greyscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => data[y*16+x] > 72 ? 1 : 0));
  return pixels;
}

function writeJapanese(nam, row, col, value, glyphMap) {
  let cursor = col;
  for (const char of value) {
    if (char === ' ') { cursor += 2; continue; }
    const indexes = glyphMap.get(char);
    if (!indexes) continue;
    nam[row*32+cursor] = indexes[0]; nam[row*32+cursor+1] = indexes[1];
    nam[(row+1)*32+cursor] = indexes[2]; nam[(row+1)*32+cursor+1] = indexes[3];
    cursor += 2;
  }
}

async function buildNovelAssets() {
  const tiles = baseChr();
  const scene = scenePixels();
  packScene(tiles, 64, scene, 0, 0, 16, 4);
  const lines = ['月影のレター','雨の駅。','彼女を待つ。','手紙には','「また春に」','朝。','二人の物語は続く。'];
  const chars = [...new Set(lines.join(''))];
  const glyphMap = new Map();
  let next = 128;
  for (const char of chars) {
    const pixels = await renderJapaneseGlyph(char);
    const indexes = [next, next+1, next+2, next+3];
    glyphMap.set(char, indexes);
    for(let gy=0;gy<2;gy+=1) for(let gx=0;gx<2;gx+=1) {
      const out = tile();
      for(let y=0;y<8;y+=1) for(let x=0;x<8;x+=1) out[y][x]=pixels[gy*8+y][gx*8+x];
      tiles[indexes[gy*2+gx]] = out;
    }
    next += 4;
  }
  await writeChr('novel', tiles);

  for (let page=0;page<4;page+=1) {
    const nam = makeNametable();
    textLine(nam,1,3,'TSUKIKAGE LETTER');
    textLine(nam,27,3,page===0?'PRESS A':'A : NEXT');
    // scene is a 16 x 4 tile window
    for(let y=0;y<4;y+=1) for(let x=0;x<16;x+=1) nam[(4+y)*32+8+x] = 64+y*16+x;
    if(page===0) {
      writeJapanese(nam,13,9,'月影のレター',glyphMap);
      textLine(nam,18,8,'A JAPANESE NOVEL');
    } else if(page===1) {
      textLine(nam,12,3,'CHAPTER 1 / RAIN');
      writeJapanese(nam,17,5,'雨の駅。',glyphMap);
      writeJapanese(nam,21,5,'彼女を待つ。',glyphMap);
    } else if(page===2) {
      textLine(nam,12,3,'THE LETTER');
      writeJapanese(nam,17,5,'手紙には',glyphMap);
      writeJapanese(nam,21,5,'「また春に」',glyphMap);
    } else {
      textLine(nam,12,3,'EPILOGUE');
      writeJapanese(nam,17,5,'朝。',glyphMap);
      writeJapanese(nam,21,3,'二人の物語は続く。',glyphMap);
    }
    setAttribute(nam, page === 0 ? 0 : 1);
    await writeFile(path.join(generated, `novel-${page}.nam`), nam);
  }
}

await Promise.all([buildSnakeAssets(), buildRaceAssets(), buildNovelAssets()]);

async function buildPwaIcon(size, filename) {
  const icon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="64" fill="#080d11"/>
    <path fill="#f16458" d="M70 88h126v48H70zm0 72h126v48H70zm0 72h126v48H70z"/>
    <path fill="#eee8d8" d="M236 88h206v48H236zm0 72h166v48H236zm0 72h206v48H236z"/>
    <rect x="70" y="344" width="372" height="76" rx="8" fill="none" stroke="#685f54" stroke-width="12"/>
    <circle cx="352" cy="382" r="24" fill="#f16458"/><circle cx="410" cy="382" r="24" fill="#f16458"/>
    <path fill="#65d34c" d="M120 350h28v22h22v28h-22v22h-28v-22H98v-28h22z"/>
  </svg>`);
  await sharp(icon).resize(size, size).png().toFile(path.join(root, 'public', filename));
}

await Promise.all([
  buildPwaIcon(192, 'pwa-192.png'),
  buildPwaIcon(512, 'pwa-512.png'),
  buildPwaIcon(180, 'apple-touch-icon.png'),
]);

const expected = [
  path.join(publicRoms, 'neon-snake.nes'),
  path.join(publicRoms, 'apex-8.nes'),
  path.join(publicRoms, 'tsukikage-letter.nes'),
];

const exe = (name) => {
  const envHome = process.env.CC65_HOME;
  const fallback = path.resolve(root, '..', '..', '.codex-local', 'cc65-current', 'bin');
  const base = envHome ? path.resolve(envHome, 'bin') : fallback;
  return path.join(base, process.platform === 'win32' ? `${name}.exe` : name);
};

const canExecute = async (target) => {
  try { await access(target, fsConstants.X_OK); return true; } catch { return false; }
};

const ca65 = exe('ca65');
const ld65 = exe('ld65');
if (!await canExecute(ca65) || !await canExecute(ld65)) {
  const existing = await Promise.all(expected.map(async (file) => { try { await access(file); return true; } catch { return false; } }));
  if (existing.every(Boolean)) {
    console.log('cc65 was not found; kept the checked-in ROM binaries. Set CC65_HOME to rebuild them.');
    process.exit(0);
  }
  throw new Error('cc65 was not found and ROM binaries are missing. Set CC65_HOME to a cc65 installation.');
}

const carts = [
  ['snake', 'neon-snake'],
  ['race', 'apex-8'],
  ['novel', 'tsukikage-letter'],
];
for (const [source, output] of carts) {
  const objectPath = path.join(generated, `${source}.o`);
  const assembled = spawnSync(ca65, [`${source}.asm`, '-o', objectPath, '-g'], { cwd: romRoot, encoding: 'utf8' });
  if (assembled.status !== 0) throw new Error(`${source} assembly failed:\n${assembled.error ?? ''}\n${assembled.stdout}\n${assembled.stderr}`);
  const linked = spawnSync(ld65, ['-C', 'nrom.cfg', '-o', path.join(publicRoms, `${output}.nes`), objectPath, '-m', path.join(generated, `${source}.map`)], { cwd: romRoot, encoding: 'utf8' });
  if (linked.status !== 0) throw new Error(`${source} link failed:\n${linked.stdout}\n${linked.stderr}`);
  console.log(`built ${output}.nes`);
}
