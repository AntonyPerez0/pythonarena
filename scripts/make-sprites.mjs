// Draws the images the pygame lessons use (content/assets/*.png): pixel art written below as rows of
// letters, one letter per pixel, each pixel drawn as a square of SCALE x SCALE. They are Python Arena's
// own (MIT, like the rest of the site), and the same bytes every time the script runs.
// Run: node scripts/make-sprites.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "content", "assets");
const SCALE = 2;

const PALETTE = {
  ".": null,
  k: [31, 41, 55], // outline
  g: [107, 114, 128], // gray
  l: [209, 213, 219], // light gray
  w: [255, 255, 255],
  b: [55, 118, 171], // Python blue
  d: [38, 84, 124], // dark blue
  y: [255, 212, 59], // Python yellow
  o: [214, 160, 20], // dark yellow
  r: [220, 38, 38],
  p: [252, 165, 165], // pink
  n: [146, 94, 46], // brown
  m: [101, 63, 31], // dark brown
  t: [196, 145, 88], // light brown
  e: [34, 160, 90], // green
  f: [21, 110, 60], // dark green
  s: [214, 205, 185], // sand
  q: [190, 180, 158], // dark sand
  c: [160, 72, 52], // brick
  h: [120, 50, 36], // dark brick
};

const SPRITES = {
  robot: [
    ".........yy.........",
    ".........yy.........",
    "..........k.........",
    "....kkkkkkkkkkkk....",
    "...kllllllllllllk...",
    "...klwwwllllwwwlk...",
    "...klwkwllllwkwlk...",
    "...klwwwllllwwwlk...",
    "...kllllllllllllk...",
    "...kllkkkkkkkkllk...",
    "...kllllllllllllk...",
    "....kkkkkkkkkkkk....",
    ".kk.kbbbbbbbbbbk.kk.",
    ".kgkkbbyybbyybbkkgk.",
    ".kgk.kbbbbbbbbk.kgk.",
    ".kk..kbbbbbbbbk..kk.",
    "......kbbbbbbk......",
    "......kgk..kgk......",
    "......kgk..kgk......",
    ".....kkkk..kkkk.....",
  ],
  coin: [
    "....kkkk....",
    "..kkyyyykk..",
    ".kyyyyyyyyk.",
    ".kyywyyyoyk.",
    "kyywyyyyyoyk",
    "kyyyyyyyyoyk",
    "kyyyyyyyyoyk",
    "kyyyyyyyyoyk",
    ".kyyyyyyoyk.",
    ".kyyooooyyk.",
    "..kkyyyykk..",
    "....kkkk....",
  ],
  ball: [
    "....kkkkkk....",
    "..kkrrrrrrkk..",
    ".krrwwrrrrrrk.",
    ".krwwrrrrrrrk.",
    "krrwrrrrrrrrrk",
    "krrrrrrrrrrrrk",
    "krrrrrrrrrrrrk",
    "krrrrrrrrrrrrk",
    "krrrrrrrrrrrrk",
    "krrrrrrrrrrrhk",
    ".krrrrrrrrrhk.",
    ".krrrrrrrrhhk.",
    "..kkrrrrhhkk..",
    "....kkkkkk....",
  ],
  monster: [
    "......kkkkkkkk......",
    "....kkeeeeeeeekk....",
    "...keeeeeeeeeeeek...",
    "..keeeeeeeeeeeeeek..",
    "..keewwweeeewwweek..",
    ".keeewkwweewkwweeek.",
    ".keeewwweeeewwweeek.",
    ".keeeeeeeeeeeeeeeek.",
    "keeeeeeeeeeeeeeeeeek",
    "keeekkkkkkkkkkkkeeek",
    "keeekwkwkwkwkwkkeeek",
    "keeeekkkkkkkkkkeeeek",
    "keeeeeeeeeeeeeeeeeek",
    "kfeeeeeeeeeeeeeeeefk",
    "kffeeeeeeeeeeeeeeffk",
    "kfffeeeeeeeeeeeefffk",
    ".kffffeeeeeeeeffffk.",
    ".kffkffffffffffkffk.",
    "..kk.kffk..kffk.kk..",
    "......kk....kk......",
  ],
  floor: [
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "sssssssssqssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssqsss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "sssqssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssqsssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssqsssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "qqqqqqqqqqqqqqqqqqqq",
  ],
  wall: [
    "hhhhhhhhhhhhhhhhhhhh",
    "ccccccchccccccccchcc",
    "ccccccchccccccccchcc",
    "ccccccchccccccccchcc",
    "hhhhhhhhhhhhhhhhhhhh",
    "cchccccccccchccccccc",
    "cchccccccccchccccccc",
    "cchccccccccchccccccc",
    "hhhhhhhhhhhhhhhhhhhh",
    "ccccccchccccccccchcc",
    "ccccccchccccccccchcc",
    "ccccccchccccccccchcc",
    "hhhhhhhhhhhhhhhhhhhh",
    "cchccccccccchccccccc",
    "cchccccccccchccccccc",
    "cchccccccccchccccccc",
    "hhhhhhhhhhhhhhhhhhhh",
    "ccccccchccccccccchcc",
    "ccccccchccccccccchcc",
    "hhhhhhhhhhhhhhhhhhhh",
  ],
  box: [
    "mmmmmmmmmmmmmmmmmmmm",
    "mttttttttttttttttttm",
    "mtmmmmmmmmmmmmmmmmtm",
    "mtmnnnnnnnnnnnnnmmtm",
    "mtmmnnnnnnnnnnnmmmtm",
    "mtmnmmnnnnnnnnmmnmtm",
    "mtmnnmmnnnnnnmmnnmtm",
    "mtmnnnmmnnnnmmnnnmtm",
    "mtmnnnnmmnnmmnnnnmtm",
    "mtmnnnnnmmmmnnnnnmtm",
    "mtmnnnnnmmmmnnnnnmtm",
    "mtmnnnnmmnnmmnnnnmtm",
    "mtmnnnmmnnnnmmnnnmtm",
    "mtmnnmmnnnnnnmmnnmtm",
    "mtmnmmnnnnnnnnmmnmtm",
    "mtmmmnnnnnnnnnnmmmtm",
    "mtmmnnnnnnnnnnnnmmtm",
    "mtmmmmmmmmmmmmmmmmtm",
    "mttttttttttttttttttm",
    "mmmmmmmmmmmmmmmmmmmm",
  ],
  target: [
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "sssssssrrrrrrsssssss",
    "sssssrrrrrrrrrrsssss",
    "ssssrrrssssssrrrssss",
    "ssssrrssssssssrrssss",
    "sssrrsssrrrrsssrrsss",
    "sssrrssrrrrrrssrrsss",
    "sssrrssrrrrrrssrrsss",
    "sssrrssrrrrrrssrrsss",
    "sssrrssrrrrrrssrrsss",
    "sssrrsssrrrrsssrrsss",
    "ssssrrssssssssrrssss",
    "ssssrrrssssssrrrssss",
    "sssssrrrrrrrrrrsssss",
    "sssssssrrrrrrsssssss",
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "qqqqqqqqqqqqqqqqqqqq",
  ],
  "box-done": [
    "ffffffffffffffffffff",
    "feeeeeeeeeeeeeeeeeef",
    "fefffffffffffffffeef",
    "fefeeeeeeeeeeeeeffef",
    "feffeeeeeeeeeeefffef",
    "fefeffeeeeeeeeffefef",
    "fefeeffeeeeeeffeefef",
    "fefeeeffeeeeffeeefef",
    "fefeeeeffeeffeeeefef",
    "fefeeeeeffffeeeeefef",
    "fefeeeeeffffeeeeefef",
    "fefeeeeffeeffeeeefef",
    "fefeeeffeeeeffeeefef",
    "fefeeffeeeeeeffeefef",
    "fefeffeeeeeeeeffefef",
    "fefffeeeeeeeeeefffef",
    "feffeeeeeeeeeeeeffef",
    "feffffffffffffffffef",
    "feeeeeeeeeeeeeeeeeef",
    "ffffffffffffffffffff",
  ],
};

function png(rows) {
  const h = rows.length;
  const w = rows[0].length;
  for (const [i, r] of rows.entries()) if (r.length !== w) throw new Error(`row ${i + 1} is ${r.length} letters, not ${w}`);
  const W = w * SCALE;
  const H = h * SCALE;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const at = y * (W * 4 + 1);
    raw[at] = 0;
    for (let x = 0; x < W; x++) {
      const ch = rows[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
      if (!(ch in PALETTE)) throw new Error(`unknown letter ${ch}`);
      const c = PALETTE[ch];
      const p = at + 1 + x * 4;
      if (c) {
        raw[p] = c[0];
        raw[p + 1] = c[1];
        raw[p + 2] = c[2];
        raw[p + 3] = 255;
      }
    }
  }
  const chunk = (kind, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, rows] of Object.entries(SPRITES)) {
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, png(rows));
  console.log(`content/assets/${name}.png: ${rows[0].length * SCALE}x${rows.length * SCALE}`);
}
