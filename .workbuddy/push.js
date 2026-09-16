/* =====================================================================
   把本地改动提交并推送到 GitHub
   ---------------------------------------------------------------------
     node .workbuddy/push.js "提交说明"        （不传说明则自动生成）

   为什么需要这个脚本（三个坑，都踩过）：
   1) 本机 PATH 里没有 git，只有 WorkBuddy 自带的 PortableGit；
   2) 直连 github.com 在国内会被 TLS 掐断（实测：schannel 握手失败、
      openssl 报 "unexpected eof while reading"），**必须走代理**；
      代理端口不固定 —— 沙箱每次调用都会分配新的 HTTP_PROXY 端口，
      所以从环境变量读，不写死；
   3) ★真正的坑★ PortableGit 的系统配置里有 `credential.helper = helper-selector`，
      那是个 GUI 选择器。无人值守环境下它会**静默挂死**（不是报错，是一直等），
      表面上看着像"TLS 超时"，实际是 HTTP 401 之后在等用户输入。
      → 所以这里强制 `-c credential.helper=` 关掉它，改成把 token 塞进推送 URL。

   token 从哪来：
     a) 环境变量 GITHUB_TOKEN / GH_TOKEN
     b) 本地文件 .workbuddy/.git-token （已在 .gitignore 里，不会上传）
   ===================================================================== */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIT = process.env.GIT_EXE ||
  'C:/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe';
const ROOT = path.resolve(__dirname, '..');
const REPO = 'KMIN-KATZ/wish-algo';

function proxyUrl() {
  const cands = [process.env.HTTPS_PROXY, process.env.https_proxy, process.env.HTTP_PROXY, process.env.http_proxy];
  for (const c of cands) if (c && /^https?:\/\//.test(c)) return c;
  // 没有环境变量时，退到常见的本地代理端口（Clash 类客户端）
  for (const p of [7897, 7890, 10809]) return 'http://127.0.0.1:' + p;
  return null;
}

function token() {
  for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'GIT_TOKEN']) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  const f = path.join(__dirname, '.git-token');
  try {
    const v = fs.readFileSync(f, 'utf8').trim();
    if (v) return v;
  } catch (e) { /* 没文件很正常 */ }
  return null;
}

function git(args, ms) {
  try {
    return { ok: true, out: execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: ms || 300000 }).trim() };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '') + String(e.message)).split('\n').slice(0, 8).join('\n') };
  }
}

function main() {
  if (!fs.existsSync(GIT)) { console.log('找不到 git：' + GIT); process.exit(1); }
  const proxy = proxyUrl();
  if (!proxy) { console.log('拿不到代理地址：设置 HTTPS_PROXY 后重试。'); process.exit(1); }
  const tk = token();
  if (!tk) {
    console.log('拿到 token：把 PAT 写进 .workbuddy/.git-token，或设 GITHUB_TOKEN 环境变量。');
    process.exit(1);
  }

  // -c 的优先级高于仓库 config，所以即使 .git/config 里留着过期的代理也没关系。
  // credential.helper= 必须留空，否则会挂在那个人工凭据选择器上。
  const P = ['-c', 'credential.helper=', '-c', 'http.proxy=' + proxy,
    '-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.1',
    '-c', 'http.lowSpeedLimit=0', '-c', 'http.lowSpeedTime=300'];

  const st = git(['status', '--porcelain']);
  if (!st.ok) { console.log('status 失败:\n' + st.out); process.exit(1); }
  if (!st.out) { console.log('没有需要提交的改动。'); }

  if (st.out) {
    console.log('本次改动:\n' + st.out.split('\n').map(l => '   ' + l).join('\n'));
    const msg = process.argv[2] || ('chore: 更新 ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    if (!git(['add', '-A']).ok) { console.log('add 失败'); process.exit(1); }
    const c = git(['commit', '-m', msg]);
    console.log(c.ok ? ('提交: ' + (c.out.split('\n')[0] || 'ok')) : ('提交失败:\n' + c.out));
    if (!c.ok) process.exit(1);
  }

  const url = 'https://' + tk + '@github.com/' + REPO + '.git';
  const p = git(P.concat(['push', url, 'main:main']));
  console.log('推送: ' + (p.ok ? '成功 ✓（代理 ' + proxy + '）' : '失败 ✗\n' + p.out));
  process.exit(p.ok ? 0 : 1);
}

main();
