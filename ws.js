/* ws.js — the project workspace behind the "+" menu.
   Holds the uploaded / AI-built files in memory (and IndexedDB), checks them,
   builds the snapshot the AI sees, and applies the AI's file blocks. */
(function (g) {
  "use strict";
  var enc = new TextEncoder();
  var MAX_FILES = 2000, MAX_PUT = 5 * 1024 * 1024;

  var SKIP_DIR = /(^|\/)(__MACOSX|node_modules|\.git|\.svn|\.idea|\.vscode)(\/|$)/;
  var SKIP_FILE = /(^|\/)(\.DS_Store|Thumbs\.db)$/;
  var BIN_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|pdf|zip|gz|tgz|7z|rar|woff2?|ttf|otf|eot|mp[34]|m4a|wav|ogg|webm|mov|avi|wasm|bin|exe|dll|so|dylib|jar|class|psd|sqlite|db)$/i;
  var SECRET_FILE = /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|id_ed25519)$|\.(pem|key|p12|pfx)$/i;
  var PLACEHOLDER = /(rest of (the )?(code|file)|(remains?|stays?) (the )?same|(code|content|file) (is |remains )?unchanged|existing code|\.\.\.\s*\(?(rest|remaining|other|existing|previous))/i;
  var SECRET_RE = /(sk-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/;

  var ws = { name: "", root: "", fromZip: false, files: new Map(), base: new Map(), hidden: new Set(), skipped: 0, prev: null };

  var text = function (b) { return new TextDecoder("utf-8").decode(b); };
  function fmt(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function size() { var n = 0; ws.files.forEach(function (b) { n += b.length; }); return n; }
  function isBin(p, b) {
    if (BIN_EXT.test(p)) return true;
    for (var i = 0, n = Math.min(b.length, 8000); i < n; i++) if (b[i] === 0) return true;
    return false;
  }

  // Normalise a path from a ZIP or from the AI. Returns null when it is unsafe or empty.
  function clean(p) {
    var seg = [], parts = String(p == null ? "" : p).trim().replace(/\\/g, "/").split("/");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "" || parts[i] === ".") continue;
      if (parts[i] === "..") return null;
      seg.push(parts[i]);
    }
    if (!seg.length || /^[a-z]:$/i.test(seg[0])) return null;
    p = seg.join("/");
    return p.length <= 200 && !/[\u0000-\u001f]/.test(p) ? p : null;
  }
  function stripRoot(p) {
    p = String(p || "").replace(/\\/g, "/").replace(/^\.?\/+/, "");
    return ws.root && p.indexOf(ws.root + "/") === 0 ? p.slice(ws.root.length + 1) : p;
  }

  // ---------- load / clear ----------
  function load(entries, name) {
    var list = [], skipped = 0, i;
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.dir) continue;
      var p = clean(e.name);
      if (!p || SKIP_DIR.test(p) || SKIP_FILE.test(p)) { skipped++; continue; }
      list.push([p, e.data]);
    }
    if (!list.length) throw new Error("the ZIP has no usable files");
    var root = "", tops = {}, nTop = 0;
    list.forEach(function (x) { var t = x[0].split("/")[0]; if (!tops[t]) { tops[t] = 1; nTop++; } });
    if (nTop === 1 && list.every(function (x) { return x[0].indexOf("/") > 0; })) {
      root = Object.keys(tops)[0];
      list = list.map(function (x) { return [x[0].slice(root.length + 1), x[1]]; });
    }
    ws.files = new Map(list);
    ws.base = new Map();
    ws.files.forEach(function (b, p) { ws.base.set(p, g.Zip.crc32(b)); });
    ws.root = root;
    ws.name = name || root || "project";
    ws.fromZip = true;
    ws.skipped = skipped;
    ws.hidden = new Set();
    ws.prev = null;
    return ws;
  }
  function clear() {
    ws.files = new Map(); ws.base = new Map(); ws.hidden = new Set(); ws.prev = null;
    ws.name = ""; ws.root = ""; ws.fromZip = false; ws.skipped = 0;
  }

  // What changed compared to the uploaded ZIP.
  function diff() {
    var d = { added: [], modified: [], deleted: [] };
    ws.files.forEach(function (b, p) {
      if (!ws.base.has(p)) d.added.push(p);
      else if (ws.base.get(p) !== g.Zip.crc32(b)) d.modified.push(p);
    });
    ws.base.forEach(function (_, p) { if (!ws.files.has(p)) d.deleted.push(p); });
    return d;
  }
  function nChanged() { var d = diff(); return d.added.length + d.modified.length + d.deleted.length; }

  function entries() {
    var pre = ws.root ? ws.root + "/" : "";
    return Array.from(ws.files.keys()).sort().map(function (p) { return { name: pre + p, data: ws.files.get(p) }; });
  }
  function outName(custom) {
    var c = String(custom || "").trim().replace(/\.zip$/i, "").replace(/[^\w.\- ]+/g, "-").replace(/^-+|-+$/g, "");
    if (c) return c + ".zip";
    var n = (ws.name || "project").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
    return n + (ws.fromZip && nChanged() ? "-fixed" : "") + ".zip";
  }

  // ---------- check ----------
  function jsErr(src) {
    try { new Function(src.replace(/^#!.*/, "")); return ""; }   // compiles only, never runs
    catch (e) { return e instanceof SyntaxError ? e.message : ""; }
  }
  function resolve(dir, ref) {
    var seg = ref.charAt(0) === "/" ? [] : dir.split("/").filter(Boolean), parts = ref.replace(/^\/+/, "").split("/");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "" || parts[i] === ".") continue;
      if (parts[i] === "..") { if (!seg.length) return null; seg.pop(); } else seg.push(parts[i]);
    }
    return seg.join("/");
  }

  function check() {
    var out = [], names = new Set(ws.files.keys()), lower = new Map(), modules = 0, hasHtml = false;
    function add(sev, file, msg) { out.push({ sev: sev, file: file, msg: msg }); }
    names.forEach(function (n) {
      var l = n.toLowerCase();
      if (lower.has(l)) add("warn", n, "same name as " + lower.get(l) + " except for upper/lower case");
      else lower.set(l, n);
    });

    ws.files.forEach(function (b, p) {
      if (SECRET_FILE.test(p)) { add("warn", p, "secrets file — kept in your ZIP, never sent to the AI. Don't publish it."); return; }
      if (!b.length) { add("info", p, "file is empty"); return; }
      if (isBin(p, b)) return;
      var s = text(b), m = p.match(/\.([^./]+)$/), ext = m ? m[1].toLowerCase() : "", err, hit;

      if ((hit = s.match(SECRET_RE))) add("warn", p, "looks like a real API key (" + hit[0].slice(0, 6) + "…). Remove it before publishing.");

      if (ext === "json") {
        if (!/(^|\/)(tsconfig|jsconfig)[^/]*\.json$|\.eslintrc\.json$/.test(p)) {
          try { JSON.parse(s); } catch (e) { add("error", p, "invalid JSON: " + e.message); }
        }
      } else if (ext === "js" || ext === "cjs" || ext === "mjs") {
        if (ext === "mjs" || /^\s*(import\s[^(]|export\s)/m.test(s)) modules++;
        else if ((err = jsErr(s))) add("error", p, "JavaScript syntax error: " + err);
      } else if (ext === "css") {
        var t = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, ""), d = 0, extra = false;
        for (var i = 0; i < t.length; i++) {
          if (t[i] === "{") d++;
          else if (t[i] === "}") { if (--d < 0) { extra = true; d = 0; } }
        }
        if (d > 0) add("error", p, d + " unclosed '{' in CSS");
        if (extra) add("error", p, "extra '}' in CSS");
      } else if (ext === "html" || ext === "htm") {
        hasHtml = true;
        var dir = p.indexOf("/") > 0 ? p.slice(0, p.lastIndexOf("/")) : "", re = /<(?:script|link|img|source|a|iframe|video|audio)\b[^>]*?\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, mm, seen = {};
        while ((mm = re.exec(s))) {
          var ref = (mm[1] != null ? mm[1] : mm[2]).trim().split(/[?#]/)[0];
          if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) || !/\.[A-Za-z0-9]{1,6}$/.test(ref) || /[{}<$]/.test(ref) || seen[ref]) continue;
          seen[ref] = 1;
          try { ref = decodeURIComponent(ref); } catch (e) {}
          var r = resolve(dir, ref);
          if (r == null || names.has(r)) continue;
          if (lower.has(r.toLowerCase())) add("warn", p, 'links to "' + ref + '" but the file is named "' + lower.get(r.toLowerCase()) + '" (case matters on GitHub Pages)');
          else add("warn", p, 'links to "' + ref + '" which is not in the project');
        }
        var sr = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, sm;
        while ((sm = sr.exec(s))) {
          if (/\ssrc\s*=/i.test(sm[1]) || !sm[2].trim()) continue;
          var ty = sm[1].match(/\stype\s*=\s*["']?([^"'\s>]+)/i);
          if (ty && !/^(text|application)\/(x-)?javascript$/i.test(ty[1])) continue;
          if ((err = jsErr(sm[2]))) add("error", p, "JavaScript syntax error in an inline <script>: " + err);
        }
      }
    });

    if (hasHtml && !names.has("index.html")) add("warn", "(project)", "no index.html in the project root — GitHub Pages needs one");
    if (modules) add("info", "(project)", modules + " JavaScript module file" + (modules > 1 ? "s were" : " was") + " not syntax-checked (import/export)");
    var rank = { error: 0, warn: 1, info: 2 };
    return out.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
  }

  function report(r) {
    var head = "Project check  " + ws.files.size + " files  " + fmt(size());
    if (!r.length) return head + "\n✓ No problems found (JSON, JavaScript syntax, CSS braces, HTML links, leaked keys).";
    var ic = { error: "✗", warn: "!", info: "-" };
    return head + "\n" + r.map(function (x) { return ic[x.sev] + " " + x.file + "  " + x.msg; }).join("\n");
  }

  // ---------- what the AI sees ----------
  var PROTOCOL = [
    "You work inside a browser-based project workspace. The user can upload a ZIP project and download the whole project as a ZIP at any time.",
    "When you create or change project files, output every changed or new file COMPLETELY (never partial code, diffs, or \"rest unchanged\") as a fenced block whose info string is file:<relative path>. Example:",
    "```file:src/app.js",
    "...complete file content...",
    "```",
    "Use a longer fence (four backticks) if the file itself contains triple backticks. To delete a file, use a block with info string delete:<path> and an empty body. Use forward slashes; no leading slash and no \"..\". Include only files you actually changed or created, and briefly explain the changes outside the blocks.",
    "For questions and short snippets, use normal code blocks without file:. You cannot run code or reach the network, so never claim you tested something."
  ].join("\n");

  function snapshot(budget) {
    ws.hidden = new Set();
    if (!ws.files.size) return "";
    budget = budget || 60000;
    var all = Array.from(ws.files.keys()).sort(), cand = [];
    var tree = all.map(function (p) { return "- " + p + " (" + fmt(ws.files.get(p).length) + ")"; }).join("\n");
    all.forEach(function (p) {
      var b = ws.files.get(p);
      if (SECRET_FILE.test(p) || isBin(p, b)) ws.hidden.add(p); else cand.push([p, text(b)]);
    });
    var shown = new Map(), used = 0;
    cand.slice().sort(function (a, b) { return a[1].length - b[1].length; }).forEach(function (x) {
      if (used + x[1].length + 40 > budget) ws.hidden.add(x[0]); else { used += x[1].length + 40; shown.set(x[0], x[1]); }
    });
    var body = all.filter(function (p) { return shown.has(p); }).map(function (p) {
      var s = shown.get(p);
      return '<file path="' + p + '">\n' + s + (s.slice(-1) === "\n" || !s ? "" : "\n") + "</file>";
    }).join("\n");
    var hid = Array.from(ws.hidden);
    return 'Current project "' + ws.name + '" (' + ws.files.size + " files):\n" + tree + "\n\n" + body +
      (hid.length ? "\n\nNot shown to you (binary, secret, or too large): " + hid.join(", ") + ". Leave these files unchanged and do not output them." : "");
  }

  // ---------- AI replies -> file changes ----------
  function fileInfo(info) {
    info = String(info || "").trim();
    var unq = function (s) { return s.replace(/^["'`]+|["'`,;]+$/g, ""); };
    var m = info.match(/^(?:[\w+#.-]+\s+)?(file|delete)\s*[:=]\s*(\S+)/i);
    if (m) { var p = unq(m[2]); return p ? { op: m[1].toLowerCase() === "delete" ? "delete" : "put", path: p } : null; }
    m = info.match(/^[\w+#-]+:([^\s:]*\.[A-Za-z0-9]+)$/);          // e.g. ```js:src/app.js
    return m ? { op: "put", path: unq(m[1]) } : null;
  }

  // Returns {edits:[{op,path,content}], cut:[path]}; blocks that never closed are reported in `cut`.
  function parse(reply) {
    var L = String(reply || "").split("\n"), edits = [], cut = [], i = 0;
    while (i < L.length) {
      var o = L[i].match(/^\s{0,3}(`{3,}|~{3,})\s*(.*)$/);
      if (!o) { i++; continue; }
      var fence = o[1], fi = fileInfo(o[2]), body = [], closed = false;
      i++;
      while (i < L.length) {
        var c = L[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (c && c[1].charAt(0) === fence.charAt(0) && c[1].length >= fence.length) { closed = true; i++; break; }
        body.push(L[i++]);
      }
      if (!fi) continue;
      if (!closed) { cut.push(fi.path); break; }
      edits.push({ op: fi.op, path: fi.path, content: body.length ? body.join("\n") + "\n" : "" });
    }
    return { edits: edits, cut: cut };
  }

  function apply(edits) {
    var r = { added: [], modified: [], deleted: [], skipped: [], warn: [] }, before = new Map(ws.files);
    if (!ws.files.size && !ws.name) { ws.name = "project"; ws.root = "project"; ws.fromZip = false; ws.base = new Map(); }
    edits.forEach(function (e) {
      var p = clean(stripRoot(e.path));
      if (!p) { r.skipped.push(e.path + " (invalid path)"); return; }
      if (ws.hidden.has(p) && ws.files.has(p)) { r.skipped.push(p + " (was not shown to the AI — kept as is)"); return; }
      if (e.op === "delete") {
        if (ws.files.delete(p)) r.deleted.push(p); else r.skipped.push(p + " (not in the project)");
        return;
      }
      var b = enc.encode(e.content), had = ws.files.get(p);
      if (b.length > MAX_PUT) { r.skipped.push(p + " (file too large)"); return; }
      if (!had && ws.files.size >= MAX_FILES) { r.skipped.push(p + " (too many files)"); return; }
      if (had && had.length === b.length && g.Zip.crc32(had) === g.Zip.crc32(b)) return;
      if (had) {   // catch the classic failure: the AI returns only part of a file
        if (had.length > 400 && b.length < had.length * 0.4) r.warn.push(p + " shrank from " + fmt(had.length) + " to " + fmt(b.length) + " — the AI may have left parts out");
        else if (PLACEHOLDER.test(e.content) && !PLACEHOLDER.test(text(had))) r.warn.push(p + " contains a placeholder such as \"rest unchanged\" — parts may be missing");
      }
      ws.files.set(p, b);
      (had ? r.modified : r.added).push(p);
    });
    if (r.added.length + r.modified.length + r.deleted.length) ws.prev = before;   // lets /undo go back one step
    return r;
  }
  function undo() {
    if (!ws.prev) return false;
    ws.files = ws.prev; ws.prev = null; ws.hidden = new Set();
    if (!ws.files.size) clear();
    return true;
  }

  // ---------- persistence (IndexedDB) so a reload or a discarded tab doesn't lose the project ----------
  function idb() {
    return new Promise(function (res, rej) {
      if (typeof indexedDB === "undefined") return rej(new Error("no IndexedDB"));
      var r = indexedDB.open("codeagent", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("ws"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  async function persist() {
    try {
      var db = await idb();
      await new Promise(function (res, rej) {
        var t = db.transaction("ws", "readwrite"), s = t.objectStore("ws");
        if (ws.files.size) s.put({ name: ws.name, root: ws.root, fromZip: ws.fromZip, skipped: ws.skipped, files: Array.from(ws.files), base: Array.from(ws.base) }, "cur");
        else s.delete("cur");
        t.oncomplete = res; t.onerror = t.onabort = function () { rej(t.error); };
      });
      db.close();
    } catch (e) { /* storage unavailable or full: keep working in memory */ }
  }
  async function restore() {
    try {
      var db = await idb();
      var d = await new Promise(function (res, rej) {
        var q = db.transaction("ws").objectStore("ws").get("cur");
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      });
      db.close();
      if (!d || !d.files || !d.files.length) return false;
      ws.files = new Map(d.files); ws.base = new Map(d.base || []);
      ws.name = d.name; ws.root = d.root || ""; ws.fromZip = !!d.fromZip; ws.skipped = d.skipped || 0; ws.hidden = new Set();
      return true;
    } catch (e) { return false; }
  }

  g.W = {
    ws: ws, load: load, clear: clear, diff: diff, nChanged: nChanged, entries: entries, outName: outName,
    check: check, report: report, snapshot: snapshot, PROTOCOL: PROTOCOL,
    fileInfo: fileInfo, parse: parse, apply: apply, undo: undo, persist: persist, restore: restore, fmt: fmt, size: size, clean: clean
  };
  if (typeof module !== "undefined" && module.exports) module.exports = g.W;
})(typeof window !== "undefined" ? window : globalThis);
