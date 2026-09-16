/* =====================================================================
   许愿算法 · 本地服务（零依赖，只用 Node 内置模块）
   ---------------------------------------------------------------------
   启动：  双击工作区根目录的「启动许愿算法.cmd」，或
            node .workbuddy/server.js            （--no-open 不自动开浏览器）
            node .workbuddy/server.js --port 18000
            node .workbuddy/server.js --local    （只允许本机访问，默认是对外的）

   为什么需要它：浏览器受同源策略限制，无法直接访问福彩/体彩接口
   （实测两个接口都没有 Access-Control-Allow-Origin 头），所以网页版只能靠
   内置数据快照、必须每天重新构建。Node 侧没有这个限制，于是：
       页面 → 本地服务 → 彩票接口
   打开就是最新开奖数据，"每日刷新"这件事在这里被消掉。

   手机怎么用：默认监听 0.0.0.0，启动时会打印局域网地址（如 http://192.168.x.x:17632/），
   手机连同一个 WiFi 打开 → 浏览器菜单「添加到主屏幕」→ 就是个独立 App 的入口。
   页面里也有一块「在手机上用」会把地址摆出来 + 一键复制，省得手输 IP。
   配套的 PWA 资源：
       /manifest.webmanifest   standalone 显示模式
       /icon.png               512×512 PNG（manifest 用）
       /apple-touch-icon.png   同一张 PNG —— iOS 只认 PNG，给 SVG 会退化成页面截图
       /icon.svg               Android 用的矢量图
   注意：这是本机服务，电脑关了手机就用不了（页面会退回内置快照）。

   服务只读：不写 source/，不碰构建产物。抓到的数据缓存到 .workbuddy/cache/，
   断网时用缓存兜底。
   ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const lib = require('./lib/parse');
const iconLib = require('./lib/icon');   // 运行时生成 PNG 图标（iOS 只认 PNG）

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, 'cache');
const PAGE = process.env.WA_PAGE ? path.resolve(process.env.WA_PAGE) : path.join(ROOT, '许愿算法1.0.html');
const PORT0 = 17632;
const FRESH_MS = 10 * 60 * 1000;      // 10 分钟内不重复拉取

/* 控制台窗口标题（.cmd 里不写中文，避免 chcp 切换打乱批处理解析） */
try { process.title = '许愿算法 1.0.1 · 本地版'; } catch (e) { }

const argv = process.argv.slice(2);
const NO_OPEN = argv.indexOf('--no-open') >= 0;
const pi = argv.indexOf('--port');
const PORT = pi >= 0 && argv[pi + 1] ? Number(argv[pi + 1]) : PORT0;
// 默认同时对外监听，这样手机连同一个 WiFi 就能用（添加到主屏幕 = 像 app 的入口）。
// 只想本机用就加 --local。
const LOCAL_ONLY = argv.indexOf('--local') >= 0;
const BIND = LOCAL_ONLY ? '127.0.0.1' : '0.0.0.0';

function lanURLs(port) {
  const out = [];
  try {
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach(function (name) {
      (ifs[name] || []).forEach(function (a) {
        if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + port + '/');
      });
    });
  } catch (e) { }
  return out;
}

/* ---------------- 缓存 ---------------- */
function cachePath(k) { return path.join(CACHE, k + '.txt'); }
function readCache(k) {
  try { return lib.fromText(fs.readFileSync(cachePath(k), 'utf8')); } catch (e) { return null; }
}
function writeCache(k, text) {
  try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cachePath(k), text, 'utf8'); }
  catch (e) { console.log('  ! 缓存写入失败: ' + e.message); }
}

/* ---------------- 数据状态 ---------------- */
const state = {
  ssq: null, dlt: null,        // { rows, at, from, err }
  busy: null
};
(function seedFromCache() {
  [['ssq', lib.SSQ_REDS, lib.SSQ_EXTRA], ['dlt', lib.DLT_REDS, lib.DLT_EXTRA]].forEach(function (d) {
    const rows = readCache(d[0]);
    if (rows && rows.length) {
      try { lib.validate(rows, d[1], d[2], d[0]); state[d[0]] = { rows, at: statMtime(cachePath(d[0])), from: 'cache' }; }
      catch (e) { console.log('  ! 缓存 ' + d[0] + ' 不可用: ' + e.message); }
    }
  });
})();
function statMtime(p) { try { return fs.statSync(p).mtime.toISOString(); } catch (e) { return null; } }

/* ---------------- 抓取 ---------------- */
async function pull(k) {
  const r = k === 'ssq' ? await lib.fetchSsq(200) : await lib.fetchDlt();
  lib.validate(r.rows, k === 'ssq' ? lib.SSQ_REDS : lib.DLT_REDS, k === 'ssq' ? lib.SSQ_EXTRA : lib.DLT_EXTRA, k);
  writeCache(k, lib.toText(r.rows));
  return { rows: r.rows, at: new Date().toISOString(), from: 'live', url: r.url, err: null };
}

function refresh(force) {
  const fresh = state.ssq && state.dlt && state.ssq.at &&
    (Date.now() - Date.parse(state.ssq.at) < FRESH_MS) && state.ssq.from === 'live';
  if (fresh && !force) return Promise.resolve(summary());
  if (state.busy) return state.busy;
  state.busy = (async function () {
    for (const k of ['ssq', 'dlt']) {
      try {
        const r = await pull(k);
        state[k] = r;
        console.log('  ✓ ' + (k === 'ssq' ? '双色球' : '大乐透') + ' ' + r.rows.length + ' 期 → 最新 ' +
          r.rows[0].code + '（' + r.rows[0].date + '）');
      } catch (e) {
        if (state[k]) { state[k].err = e.message; console.log('  ! ' + k + ' 抓取失败（沿用 ' + state[k].from + '）: ' + e.message); }
        else { state[k] = { rows: null, at: null, from: 'none', err: e.message }; console.log('  ! ' + k + ' 抓取失败且无缓存: ' + e.message); }
      }
    }
    state.busy = null;
    return summary();
  })();
  return state.busy;
}

function summary() {
  const one = function (k, label) {
    const s = state[k];
    if (!s || !s.rows || !s.rows.length) return { ok: false, err: (s && s.err) || '无数据', label: label };
    return {
      ok: true, label: label, n: s.rows.length, from: s.from, at: s.at,
      newest: s.rows[0].code, newestDate: s.rows[0].date,
      oldest: s.rows[s.rows.length - 1].code, oldestDate: s.rows[s.rows.length - 1].date,
      err: s.err || null, text: lib.toText(s.rows)
    };
  };
  return { ok: !!(state.ssq && state.ssq.rows && state.dlt && state.dlt.rows), serverTime: new Date().toISOString(), lan: lanURLs(PORT), ssq: one('ssq', '双色球'), dlt: one('dlt', '大乐透') };
}

/* ---------------- PWA：让手机「添加到主屏幕」后像个 app ----------------
   定义在 lib/pwa.js，与 build.js 共用一份：本地服务用 HTTP 吐出去，
   静态托管（GitHub Pages）用落盘文件。两边必须完全一致，所以不能各写一份。 */
const pwa = require('./lib/pwa');
const MANIFEST = pwa.manifest();
const ICON = iconLib.svg();

/* ---------------- HTTP ---------------- */
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/' || u.pathname === '/index.html') {
    try {
      const html = fs.readFileSync(PAGE, 'utf8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch (e) {
      return send(res, 500, '<h1>读不到页面文件</h1><p>' + PAGE + '</p><p>' + e.message + '</p>', 'text/html; charset=utf-8');
    }
  }
  if (u.pathname === '/api/data') {
    try { await refresh(u.searchParams.get('force') === '1'); }
    catch (e) { /* summary 里已带各源错误 */ }
    return send(res, 200, JSON.stringify(summary()));
  }
  if (u.pathname === '/api/health') return send(res, 200, JSON.stringify({ ok: true, app: 'wish-algo', port: PORT }));
  if (u.pathname === '/manifest.webmanifest') return send(res, 200, JSON.stringify(MANIFEST), 'application/manifest+json; charset=utf-8');
  if (u.pathname === '/icon.svg') return send(res, 200, ICON, 'image/svg+xml; charset=utf-8');
  // iOS 只认 PNG（给 SVG 会退化成页面截图），所以这两个走运行时生成的真 PNG
  if (u.pathname === '/icon.png' || u.pathname === '/apple-touch-icon.png' ||
    u.pathname === '/apple-touch-icon-precomposed.png')
    return send(res, 200, iconLib.png(), 'image/png');
  return send(res, 404, JSON.stringify({ ok: false, err: 'not found' }));
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  execFile(cmd[0], cmd[1], function () { });
}

/* 单实例守卫：双击两次不该起两个服务（Windows 上两进程抢同一端口的行为并不总是报错） */
function probe(port) {
  return new Promise(function (res) {
    const req = http.get({ host: '127.0.0.1', port: port, path: '/api/health', timeout: 700 }, function (r) {
      let d = ''; r.on('data', function (c) { d += c; });
      r.on('end', function () { try { const j = JSON.parse(d); res(!!(j && j.ok && j.app === 'wish-algo')); } catch (e) { res(false); } });
    });
    req.on('error', function () { res(false); });
    req.on('timeout', function () { req.destroy(); res(false); });
  });
}

function listen(port, left) {
  server.once('error', function (e) {
    if (e.code === 'EADDRINUSE' && left > 0) { console.log('  ! 端口 ' + port + ' 被占用，换 ' + (port + 1)); return listen(port + 1, left - 1); }
    console.log('启动失败: ' + e.message); process.exit(1);
  });
  server.listen(port, BIND, function () {
    const url = 'http://127.0.0.1:' + port + '/';
    console.log('');
    console.log('  许愿算法 · 本地服务已启动');
    console.log('  本机：' + url);
    if (LOCAL_ONLY) {
      console.log('  手机：已用 --local 关闭对外监听');
    } else {
      const lan = lanURLs(port);
      if (lan.length) {
        console.log('  手机：' + lan.join('    '));
        console.log('        （手机连同一个 WiFi → 浏览器打开上面地址 → 分享/菜单里选');
        console.log('          「添加到主屏幕」，之后就是个独立 App）');
      } else {
        console.log('  手机：没检测到局域网地址（电脑要先连上 WiFi 或网线）');
      }
    }
    console.log('  数据：' + (state.ssq && state.ssq.rows ? '已有缓存，正在后台拉最新…' : '首次拉取中…'));
    console.log('  停止：关掉这个窗口，或按 Ctrl+C');
    console.log('');
    refresh(false).then(function () { console.log('  数据就绪。'); });
    if (!NO_OPEN) openBrowser(url);
  });
}

   (async function () {
  if (await probe(PORT)) {
    const url = 'http://127.0.0.1:' + PORT + '/';
    console.log('');
    console.log('  已经有一个许愿算法服务在跑了（' + url + '），不重复启动。');
    if (!LOCAL_ONLY) { const lan = lanURLs(PORT); if (lan.length) console.log('  手机：' + lan.join('    ')); }
    console.log('  直接给你打开页面。');
    if (!NO_OPEN) openBrowser(url);
    process.exit(0);
  }
  listen(PORT, 10);
})();

