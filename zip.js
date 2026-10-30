/* zip.js — small ZIP reader/writer, no dependencies.
   Reads stored + deflate entries, writes deflate (or stored) entries.
   Uses the browser's built-in CompressionStream / DecompressionStream. */
(function (g) {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder("utf-8");
  var LIM = { entries: 2000, single: 25 * 1024 * 1024, total: 60 * 1024 * 1024 };

  // ---- CRC32 ----
  var T = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    T[n] = c >>> 0;
  }
  function crc32(b) {
    var c = 0xffffffff;
    for (var i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---- run bytes through a (De)CompressionStream, optionally capping the output size ----
  async function pipe(bytes, stream, max) {
    var reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    var parts = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (max != null && total > max) {
        try { await reader.cancel(); } catch (e) {}
        throw new Error("a file is larger after unpacking than the ZIP says (damaged or unsafe ZIP)");
      }
      parts.push(r.value);
    }
    var out = new Uint8Array(total), o = 0;
    for (var i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  // ---- read: ArrayBuffer|Uint8Array -> [{name, dir, data}] ----
  async function read(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var e = -1, lo = Math.max(0, bytes.length - 22 - 65535);
    for (var i = bytes.length - 22; i >= lo; i--) {
      if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error("this is not a valid ZIP file");
    var count = v.getUint16(e + 10, true), cdOff = v.getUint32(e + 16, true);
    if (count === 0xffff || cdOff === 0xffffffff) throw new Error("ZIP64 archives are not supported");
    if (count > LIM.entries) throw new Error("ZIP has more than " + LIM.entries + " entries");

    var out = [], p = cdOff, total = 0;
    for (var n = 0; n < count; n++) {
      if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP directory is damaged");
      var flag = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true),
        crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true),
        nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true),
        off = v.getUint32(p + 42, true);
      var name = dec.decode(bytes.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;

      if (name.charAt(name.length - 1) === "/") { out.push({ name: name, dir: true }); continue; }
      if (flag & 1) throw new Error("password-protected ZIP files are not supported");
      if (usize > LIM.single) throw new Error(name + " is larger than " + LIM.single / 1048576 + " MB");
      total += usize;
      if (total > LIM.total) throw new Error("ZIP is larger than " + LIM.total / 1048576 + " MB when unpacked");
      if (off + 30 > bytes.length || v.getUint32(off, true) !== 0x04034b50) throw new Error("damaged entry: " + name);
      var ds = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      if (ds + csize > bytes.length) throw new Error("ZIP is cut off (incomplete download?): " + name);

      var raw = bytes.subarray(ds, ds + csize), data;
      if (method === 0) data = raw.slice();
      else if (method === 8) {
        if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot unpack ZIP files — update the browser");
        try { data = await pipe(raw, new DecompressionStream("deflate-raw"), usize); }
        catch (err) { throw new Error(name + ": " + (err.message || "damaged compressed data")); }
      } else throw new Error(name + ": unsupported compression method " + method);
      if (data.length !== usize || crc32(data) !== crc) throw new Error(name + ": checksum mismatch (damaged ZIP)");
      out.push({ name: name, dir: false, data: data });
    }
    return out;
  }

  // ---- write: [{name, data:Uint8Array}] -> Blob ----
  function dosTime(d) {
    return [
      ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
      (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
    ];
  }
  async function write(files) {
    if (files.length > 65535) throw new Error("too many files for a ZIP");
    var t = dosTime(new Date()), chunks = [], cen = [], off = 0, cs = 0;
    for (var i = 0; i < files.length; i++) {
      var nm = enc.encode(files[i].name), data = files[i].data, crc = crc32(data), method = 0, body = data;
      if (data.length > 64 && typeof CompressionStream !== "undefined") {
        try {
          var z = await pipe(data, new CompressionStream("deflate-raw"));
          if (z.length < data.length) { method = 8; body = z; }
        } catch (e) { /* fall back to stored */ }
      }
      var lh = new Uint8Array(30 + nm.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, method, true); lv.setUint16(10, t[0], true); lv.setUint16(12, t[1], true);
      lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, nm.length, true); lh.set(nm, 30);

      var ch = new Uint8Array(46 + nm.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x031e, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, t[0], true);
      cv.setUint16(14, t[1], true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true);
      cv.setUint32(24, data.length, true); cv.setUint16(28, nm.length, true);
      cv.setUint32(38, (0o100644 << 16) >>> 0, true); cv.setUint32(42, off, true); ch.set(nm, 46);

      chunks.push(lh, body); cen.push(ch);
      off += lh.length + body.length; cs += ch.length;
      if (off > 0xfff00000) throw new Error("project is too large for a ZIP");
    }
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
    return new Blob(chunks.concat(cen, [end]), { type: "application/zip" });
  }

  g.Zip = { read: read, write: write, crc32: crc32, limits: LIM };
  if (typeof module !== "undefined" && module.exports) module.exports = g.Zip;
})(typeof window !== "undefined" ? window : globalThis);
