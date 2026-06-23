// 임시 소스 아이콘(1024x1024 PNG) 생성기.
// 실제 아이콘이 준비되면 app-icon.png 를 교체하고 `pnpm tauri icon` 을 다시 실행한다.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
// accent 색 (globals.css 의 --color-accent-strong: #0ea5e9)
const [R, G, B] = [0x0e, 0xa5, 0xe9];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const row = Buffer.alloc(1 + SIZE * 3);
row[0] = 0; // filter none
for (let x = 0; x < SIZE; x++) {
  row[1 + x * 3] = R;
  row[1 + x * 3 + 1] = G;
  row[1 + x * 3 + 2] = B;
}
const raw = Buffer.concat(Array.from({ length: SIZE }, () => row));
const idat = deflateSync(raw);

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../src-tauri/app-icon.png", import.meta.url), png);
console.log("generated src-tauri/app-icon.png");
