// usage: node events.cjs <session.v4.jsonl.zstd>  -> JSONL on stdout (concatenated zstd frames)
const fs = require('fs'), zlib = require('zlib')
const buf = fs.readFileSync(process.argv[2])
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const starts = []
for (let i = buf.indexOf(magic); i >= 0; i = buf.indexOf(magic, i + 1)) starts.push(i)
let out = ''
for (let k = 0; k < starts.length; k++) {
  try { out += zlib.zstdDecompressSync(buf.subarray(starts[k], starts[k + 1] ?? buf.length)).toString() } catch {}
}
process.stdout.write(out)
