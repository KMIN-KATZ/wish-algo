/* =====================================================================
   把本地改动提交并推送到 GitHub
   ---------------------------------------------------------------------
     node .workbuddy/push.js "提交说明"        （不传说明则自动生成）

   为什么需要这个脚本：
   1) 本机 PATH 里没有 git，只有 WorkBuddy 自带的 PortableGit；
   2) 直连 github.com 在国内会被 TLS 掐断（实测：schannel 握手失败、
      openssl 报 "unexpected eof while reading"），**必须走代理**；
   3) 代理端口不固定 —— 沙箱每次调用都会分配新的 HTTP_PROXY 端口，
      所以这里从环境变量读，不写死。
   ===================================================================== */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIT = process.env.GIT_EXE ||
  'C:/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe';
const ROOT = path.resolve(__dirname, '..');

function proxyUrl() {
  const cands = [process.env.HTTPS_PROXY, process.env.https_proxy, process.env.HTTP_PROXY, process.env.http_proxy];
  for (const c of cands) if (c && /^https?:\/\//.test(c)) return c;
  // 没有环境变量时，退到常见的本地代理端口（Clash 类客户端）
  for (const p of [7897, 7890, 10809]) {
    try { execSync('', { timeout: 1 }); } catch (e) { }
    return 'http://127.0.0.1:' + p;   // 由 git 自己失败并报错，比这里静默跳过好
  }
  return null;
}

function git(args, ms) {
  try {
    return { ok: true, out: execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: ms || 300000 }).trim() };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '') + String(e.message)).split('\n').slice(0, 6).join('\n') };
  }
}

function main() {
  if (!fs.existsSync(GIT)) { console.log('找不到 git：' + GIT); process.exit(1); }
  const proxy = proxyUrl();
  if (!proxy) { console.log('拿不到代理地址：设置 HTTPS_PROXY 后重试。'); process.exit(1); }

  // -c 的优先级高于仓库 config，所以即使 .git/config 里留着过期的代理也没关系
  const P = ['-c', 'http.proxy=' + proxy, '-c', 'http.sslBackend=openssl',
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

  const p = git(P.concat(['push', 'origin', 'main']));
  console.log('推送: ' + (p.ok ? '成功 ✓（代理 ' + proxy + '）' : '失败 ✗\n' + p.out));
  process.exit(p.ok ? 0 : 1);
}

main();
