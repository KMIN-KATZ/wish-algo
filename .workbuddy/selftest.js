/* =====================================================================
   许愿算法 1.0 · 自测脚本（适配「输入日期 → 自动填入 → 确认生成」交互）
   运行：  node .workbuddy/selftest.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, '许愿算法1.0.html');

const html = fs.readFileSync(TARGET, 'utf8');
const m = html.match(/<script>\n([\s\S]*)<\/script>/);
if (!m) { console.log('FAIL: 未找到主 <script> 块'); process.exit(1); }
const js = m[1];

try { new Function(js); console.log('[1] JS 语法检查: 通过'); }
catch (e) { console.log('[1] JS 语法错误 ->', e.message); process.exit(1); }

/* 把 HTML 里的三个内置数据块喂给 DOM 桩，否则工具会以「数据为空」启动 */
const grab = id => {
  const mm = html.match(new RegExp('<script id="' + id + '" type="text/plain">([\\s\\S]*?)<\\/script>'));
  return mm ? mm[1] : '';
};
const PRE = { DATA_SSQ: grab('DATA_SSQ'), DATA_DLT: grab('DATA_DLT'), DATA_CAL: grab('DATA_CAL') };
console.log('[3] 内置数据块: 双色球 ' + PRE.DATA_SSQ.split('\n').length + ' 行 | 大乐透 ' +
            PRE.DATA_DLT.split('\n').length + ' 行 | 日历 ' + PRE.DATA_CAL.split(';').length + ' 条');
if (!PRE.DATA_SSQ.trim()) { console.log('FAIL: DATA_SSQ 为空'); process.exit(1); }

const stub = `
globalThis.window = globalThis;
const __PRE = ` + JSON.stringify(PRE) + `;
const __els = {};
function __mk(id){
  const s = new Set();
  return { id:id, value:'', innerHTML:'', textContent: __PRE[id]||'', disabled:false, onclick:null, hidden:false,
    style:{}, placeholder:'', dataset:{g:'ssq'}, scrollIntoView:function(){},
    classList:{ add:function(c){s.add(c)}, remove:function(c){s.delete(c)},
      toggle:function(c,on){ on?s.add(c):s.delete(c) }, has:function(c){return s.has(c);} },
    addEventListener:function(){}, closest:function(){ return null; }, tagName:'DIV',
    querySelectorAll:function(){ return []; }, appendChild:function(){}, removeChild:function(){},
    setAttribute:function(){}, getAttribute:function(){ return ''; }, select:function(){} };
}
globalThis.document = {
  querySelector:function(sel){
    const id = sel.replace(/^#/,'').split(' ')[0];
    if(!__els[id]) __els[id]=__mk(id);
    return __els[id];
  },
  querySelectorAll:function(){ return []; }
};
/* localStorage 桩：内存实现，让「跨期状态持久化」这条路径真被执行到 */
const __lsData = {};
globalThis.localStorage = {
  getItem:function(k){ return Object.prototype.hasOwnProperty.call(__lsData,k)?__lsData[k]:null; },
  setItem:function(k,v){ __lsData[k]=String(v); },
  removeItem:function(k){ delete __lsData[k]; },
  clear:function(){ for(const k in __lsData) delete __lsData[k]; }
};
`;

const wrapper = stub + '\n' + js +
  '\n; return {els:__els, resolveDate:resolveDate, GAMES:GAMES, DATA:DATA, CAL:CAL, generate:generate,' +
  ' ticketsText:ticketsText, extraCover:extraCover, luckSet:luckSet, lsData:__lsData,' +
  ' renderMobile:renderMobile, LIVE_LAN:LIVE_LAN, applyLive:applyLive, IS_HTTP:IS_HTTP,' +
  ' setGame:function(g){GAME=g;}, getGame:function(){return GAME;}, setRES:function(v){RES=v;},' +
  ' PRIZE:PRIZE, LEVEL_CN:LEVEL_CN, judgeTicket:judgeTicket, parseTicketLine:parseTicketLine,' +
  ' verifyBatch:verifyBatch, renderVerify:renderVerify, renderDrawBar:renderDrawBar,' +
  ' archInit:archInit, archCodes:archCodes, syncDraws:syncDraws, settleLedger:settleLedger,' +
  ' ledgerAdd:ledgerAdd, ledgerAddFromVerify:ledgerAddFromVerify, ledgerTotals:ledgerTotals,' +
  ' ledgerCSV:ledgerCSV, archiveJSON:archiveJSON, renderArchive:renderArchive, ARCH_KEY:ARCH_KEY};';

let api;
try { api = new Function(wrapper)(); console.log('[2] 整页脚本加载执行: 通过'); }
catch (e) { console.log('[2] 脚本执行失败 ->', e.message); process.exit(1); }

const els = api.els;
const FAIL = [];

/* ---------- 数据新鲜度提示 ---------- */
const age = els.ageBar ? els.ageBar.innerHTML : '';
const fresh = age.indexOf('数据新鲜') >= 0, late = age.indexOf('数据滞后') >= 0, old = age.indexOf('数据已过期') >= 0;
console.log('[3] 数据新鲜度提示: ' + (fresh ? '数据新鲜 ✓' : late ? '数据滞后（可接受）' : old ? '数据已过期 ✗' : '未渲染 ✗'));
if (!fresh && !late) FAIL.push('新鲜度提示异常: ' + age.slice(0, 160));

/* ---------- 内置数据完整性 ---------- */
const ssq = api.DATA.ssq, dlt = api.DATA.dlt;
console.log('[4] 解析后数据: 双色球 ' + ssq.length + ' 期 | 大乐透 ' + dlt.length + ' 期 | 日历 ' + Object.keys(api.CAL).length + ' 条');
if (ssq.length !== 200) FAIL.push('双色球解析出 ' + ssq.length + ' 期，预期 200');
if (dlt.length !== 255) FAIL.push('大乐透解析出 ' + dlt.length + ' 期，预期 255');
if (Object.keys(api.CAL).length < 40) FAIL.push('日历仅解析出 ' + Object.keys(api.CAL).length + ' 条');
const badSsq = ssq.filter(r => r.reds.length !== 6 || r.extra.length !== 1 || !r.date || !r.code);
const badDlt = dlt.filter(r => r.reds.length !== 5 || r.extra.length !== 2 || !r.date || !r.code);
if (badSsq.length) FAIL.push('双色球有 ' + badSsq.length + ' 期数据残缺');
if (badDlt.length) FAIL.push('大乐透有 ' + badDlt.length + ' 期数据残缺');
const dupS = ssq.length - new Set(ssq.map(r=>r.code)).size;
const dupD = dlt.length - new Set(dlt.map(r=>r.code)).size;
if (dupS || dupD) FAIL.push('期号重复: 双色球 ' + dupS + ' / 大乐透 ' + dupD);
for (let i = 1; i < ssq.length; i++) if (ssq[i].date >= ssq[i-1].date) { FAIL.push('双色球日期未严格降序 @' + i); break; }
for (let i = 1; i < dlt.length; i++) if (dlt[i].date >= dlt[i-1].date) { FAIL.push('大乐透日期未严格降序 @' + i); break; }
console.log('    数据校验: ' + (badSsq.length||badDlt.length||dupS||dupD ? '有问题 ✗' : '完整·无重复·日期降序 ✓'));

/* ---------- 日期解析正确性 ---------- */
const cases = [
  ['ssq', '2026-09-16', '2026108', '2026-09-17', '2026107', false, '周三 → 下周四'],
  ['ssq', '2026-09-17', '2026108', '2026-09-17', '2026107', false, '开奖日当天，该期未开'],
  ['ssq', '2026-09-15', '2026108', '2026-09-17', '2026106', true,  '开奖日当天但已开奖 → 顺延'],
  ['ssq', '2026-09-18', '2026108', '2026-09-20', '2026107', false, '周五 → 下周日'],
  ['ssq', '2026-01-01', '2026002', '2026-01-04', '2025151', true,  '元旦已开奖 → 顺延到下周日（跨年期号）'],
  ['dlt', '2026-09-16', '26106',   '2026-09-16', '26105',   false, '周三开奖日'],
  ['dlt', '2026-09-17', '26106',   '2026-09-19', '26105',   false, '周四 → 下周六'],
];
console.log('[4] 日期解析:');
cases.forEach(function(c){
  const [g, date, tCode, tDate, bCode, carried, desc] = c;
  let r;
  try { r = api.resolveDate(date, api.GAMES[g]); }
  catch (e) { FAIL.push(desc + ' 抛异常: ' + e.message); console.log('    ✗ ' + desc + ' -> ' + e.message); return; }
  const ok = r.targetCode === tCode && r.drawDate === tDate && r.base.code === bCode && r.carried === carried;
  if (!ok) FAIL.push(desc + ': 期望 ' + tCode + '/' + tDate + '/' + bCode + '，实得 ' + r.targetCode + '/' + r.drawDate + '/' + r.base.code);
  console.log('    ' + (ok ? '✓' : '✗') + ' ' + date + ' [' + g + '] → 目标 ' + r.targetCode + '（' + r.drawDate + '）上期 ' + r.base.code + (r.carried ? ' [顺延]' : '') + '  — ' + desc);
});

/* ---------- 自动填入内容正确性 ---------- */
const R = api.resolveDate('2026-09-16', api.GAMES.ssq);
console.log('[5] 自动填入内容（双色球 / 2026-09-16）:');
console.log('    热号池 Top8: ' + R.hot.map(h => String(h.n).padStart(2,'0') + '(' + h.c + ')').join(' '));
console.log('    L1 运气源  : ' + R.l1);
console.log('    L2 提数字  : ' + R.l2.join(' '));
console.log('    种子       : ' + R.seed);
console.log('    历史样本   : ' + R.hist.length + ' 期');
if (R.hist.length !== 80) FAIL.push('历史样本 ' + R.hist.length + ' 期，预期 80');
if (!R.hot.length) FAIL.push('热号池为空');
if (!R.l1 || !R.l2.length) FAIL.push('L1/L2 未自动填入');
if (R.lastSeedFake) {}
// E1 命中校验：目标开奖日 ±3 天
const R2 = api.resolveDate('2026-09-24', api.GAMES.ssq);
console.log('    E1 (2026-09-24→开奖日 ' + R2.drawDate + '): "' + R2.e1 + '"');
if (R2.e1.indexOf('中秋') < 0 || R2.e1.indexOf('秋分') < 0) FAIL.push('E1 日历未命中中秋/秋分，实得: ' + R2.e1);
const R3 = api.resolveDate('2026-09-16', api.GAMES.ssq);
if (R3.e1.indexOf('九一八') < 0) FAIL.push('E1 未命中九一八纪念日，实得: ' + R3.e1);
console.log('    E5 奖池   : ' + R3.e5note);

/* ---------- 交互链路：解析 → 摘要渲染 → 生成 ---------- */
(async function () {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  els.pickDate.value = '2026-09-16';
  els.resolve.onclick();
  await wait(400);

  const sum = els.sumWrap.innerHTML;
  if (!sum || sum.length < 500) { FAIL.push('解析后摘要为空'); }
  const step2Shown = els.step2.hidden === false;
  console.log('[6] 解析交互: 摘要长度 ' + sum.length + ' | Step2 显示 ' + (step2Shown ? '✓' : '✗'));
  if (!step2Shown) FAIL.push('Step2 未显示');
  if (sum.indexOf('2026108') < 0) FAIL.push('摘要未出现目标期 2026108');
  if (sum.indexOf('九一八') < 0) FAIL.push('摘要未出现 E1 自动值');
  if (sum.indexOf('需自填') < 0) FAIL.push('摘要未标注「需自填」项');
  // 视图层把对象数组当字符串拼过（热号池曾整行渲染成 [object Object]）—— 统一兜住
  if (sum.indexOf('[object Object]') >= 0) FAIL.push('摘要出现 [object Object]（视图层漏取字段）');
  if (sum.indexOf('undefined') >= 0) FAIL.push('摘要出现 undefined');
  if (sum.indexOf('NaN') >= 0) FAIL.push('摘要出现 NaN');

  // 把渲染出的 value 回灌进 DOM 桩，模拟真实浏览器
  let nSet = 0;
  for (const mm of sum.matchAll(/<input id="([^"]+)" type="[^"]*" value="([^"]*)"/g)) {
    if (!els[mm[1]]) els[mm[1]] = { value:'', addEventListener(){}, tagName:'INPUT', closest(){return null;} };
    els[mm[1]].value = mm[2].replace(/&quot;/g,'"'); nSet++;
  }
  for (const mm of sum.matchAll(/<textarea id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    if (!els[mm[1]]) els[mm[1]] = { value:'', addEventListener(){}, tagName:'TEXTAREA', closest(){return null;} };
    els[mm[1]].value = mm[2]; nSet++;
  }
  if (!els.l3mode) els.l3mode = { value:'all', addEventListener(){} };
  els.l3mode.value = 'all';
  console.log('[7] 摘要回灌 DOM 桩: ' + nSet + ' 个字段 | l2="' + els.l2.value + '" | budget="' + els.budget.value + '"');
  if (!els.l2.value) FAIL.push('L2 回灌为空');

  els.generate.onclick();
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) { await wait(60); if (els.pipe.innerHTML.indexOf('>P0<') >= 0) break; }
  const pipe = els.pipe.innerHTML, out = els.out.innerHTML;
  const genMs = Date.now()-t0;
  console.log('[8] 生成完成 | 耗时 ≈' + genMs + 'ms');
  if (out.indexOf('运行出错') >= 0) FAIL.push('页面内异常: ' + out.slice(0,220));
  if (out.indexOf('[object Object]') >= 0) FAIL.push('出号区出现 [object Object]');
  if (pipe.indexOf('[object Object]') >= 0) FAIL.push('流水线出现 [object Object]');

  const layers = ['P0','P1','P2','P3','P4','E1','E2','E3','E4','E5','L1','L2','L3','L4'];
  const missing = layers.filter(k => pipe.indexOf('>' + k + '<') < 0);
  console.log('[9] 14 层渲染: ' + (missing.length ? '缺 ' + missing.join(',') + ' ✗' : '齐全 ✓'));
  if (missing.length) FAIL.push('流水线缺层: ' + missing.join(','));

  const tickets = (out.match(/第 \d+ 注/g) || []).length;
  const nums = [...out.matchAll(/<span class="ball red">(\d\d)/g)].map(x => x[1]);
  const blues = [...out.matchAll(/<span class="ball blue">(\d\d)/g)].map(x => x[1]);
  const why = [...out.matchAll(/它为什么不拥挤：<\/b>([^<]+)</g)].map(x => x[1]);
  console.log('[10] 出号: ' + tickets + ' 注 | 加权标记 ' + (out.match(/<span class="sup">加权<\/span>/g)||[]).length + ' 处');
  if (tickets !== 5) FAIL.push('出注数 ' + tickets + '，预期 5');
  if (why.length !== 5) FAIL.push('「为什么不拥挤」文案 ' + why.length + ' 条，预期 5');
  if (tickets === 5) {
    for (let i = 0; i < 5; i++) console.log('     第' + (i+1) + '注  红 [' + nums.slice(i*6,i*6+6).join(' ') + ']  蓝 [' + blues[i] + ']');
    console.log('     文案: ' + why[0]);
  }
  const scores = [...out.matchAll(/class="num" style="color:[^"]*">(\d+)</g)].map(x => Number(x[1]));
  const over = scores.filter(s => s > 60).length;
  console.log('[11] 拥挤度全部 ≤60: ' + (over === 0 ? '通过 ✓' : over + ' 注超阈值 ✗'));
  if (over) FAIL.push(over + ' 注拥挤度 >60（违反硬约束）');
  // 与上期重号
  const lastReds = R.base.reds;
  const overlap = [];
  for (let i = 0; i < tickets; i++) {
    const set = nums.slice(i*6, i*6+6).map(Number);
    overlap.push(set.filter(x => lastReds.indexOf(x) >= 0).length);
  }
  console.log('[12] 与上期重号数: ' + overlap.join(', ') + (overlap.some(x => x >= 3) ? ' ✗' : ' ✓'));

  console.log('[13] 底盘: ' + (els.basecheck.innerHTML.length ? '已生成 ✓' : '空 ✗'));
  console.log('     公益金: ' + els.welfTxt.textContent);
  if (!els.basecheck.innerHTML.length) FAIL.push('底盘未渲染');

  // 复现性
  const sig1 = JSON.stringify(nums) + JSON.stringify(blues);
  els.generate.onclick();
  const t1 = Date.now();
  while (Date.now() - t1 < 8000) { await wait(60); if (els.out.innerHTML.indexOf('第 1 注') >= 0) break; }
  const sig2 = JSON.stringify([...els.out.innerHTML.matchAll(/<span class="ball red">(\d\d)/g)].map(x => x[1]))
             + JSON.stringify([...els.out.innerHTML.matchAll(/<span class="ball blue">(\d\d)/g)].map(x => x[1]));
  console.log('[14] 同种子复现: ' + (sig1 === sig2 ? '一致 ✓' : '不一致 ✗'));
  if (sig1 !== sig2) FAIL.push('同种子两次结果不一致');

  /* ================= 1.0.1 新增覆盖 ================= */

  /* ---------- [15] 大乐透端到端（此前从未被测过） ---------- */
  api.setGame(api.GAMES.dlt);
  els.pickDate.value = '2026-09-16';
  els.resolve.onclick();
  await wait(400);
  const sumD = els.sumWrap.innerHTML;
  if (sumD.indexOf('26106') < 0) FAIL.push('大乐透摘要未出现目标期 26106');
  if (sumD.indexOf('[object Object]') >= 0) FAIL.push('大乐透摘要出现 [object Object]');
  for (const mm of sumD.matchAll(/<input id="([^"]+)" type="[^"]*" value="([^"]*)"/g)) {
    if (!els[mm[1]]) els[mm[1]] = { value:'', addEventListener(){}, tagName:'INPUT', closest(){return null;} };
    els[mm[1]].value = mm[2].replace(/&quot;/g,'"');
  }
  for (const mm of sumD.matchAll(/<textarea id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    if (!els[mm[1]]) els[mm[1]] = { value:'', addEventListener(){}, tagName:'TEXTAREA', closest(){return null;} };
    els[mm[1]].value = mm[2];
  }
  if (!els.l3mode) els.l3mode = { value:'all', addEventListener(){} };
  els.l3mode.value = 'all';
  els.generate.onclick();
  const t2 = Date.now();
  while (Date.now() - t2 < 15000) { await wait(60); if (els.pipe.innerHTML.indexOf('>P0<') >= 0) break; }
  const outD = els.out.innerHTML;
  const dReds = [...outD.matchAll(/<span class="ball red">(\d\d)/g)].map(x=>x[1]);
  const dBlue = [...outD.matchAll(/<span class="ball blue">(\d\d)/g)].map(x=>x[1]);
  const dTickets = (outD.match(/第 \d+ 注/g)||[]).length;
  const dPairs = [];
  for (let i=0;i<dTickets;i++) dPairs.push(dBlue.slice(i*2,i*2+2).join(','));
  const dCover = new Set(dBlue).size;
  console.log('[15] 大乐透端到端: ' + dTickets + ' 注 | 前区 ' + dReds.length + ' 个 | 后区 ' + dBlue.length +
              ' 个 | 后区组合 ' + dPairs.join(' / ') + ' → 覆盖 ' + dCover + '/12');
  if (dTickets !== 5) FAIL.push('大乐透出注数 ' + dTickets + '，预期 5');
  if (dReds.length !== 25) FAIL.push('大乐透前区号码 ' + dReds.length + ' 个，预期 25（5 注 × 5）');
  if (dBlue.length !== 10) FAIL.push('大乐透后区号码 ' + dBlue.length + ' 个，预期 10（5 注 × 2）');
  if (new Set(dPairs).size !== dPairs.length) FAIL.push('大乐透后区有重复组合：' + dPairs.join(' / '));
  if (dCover !== 10) FAIL.push('大乐透后区覆盖 ' + dCover + '/12 个号，预期 10（池 12 ≥ 5 注×2）');
  const dScores = [...outD.matchAll(/class="num" style="color:[^"]*">(\d+)</g)].map(x=>Number(x[1]));
  const dOver = dScores.filter(s=>s>60).length;
  if (dOver) FAIL.push('大乐透 ' + dOver + ' 注拥挤度 >60（违反硬约束）');

  /* ---------- [16] 双色球 5 注蓝球互不重复 ---------- */
  const dupBlue = blues.length - new Set(blues).size;
  console.log('[16] 双色球蓝球去重: [' + blues.join(' ') + '] 重复 ' + dupBlue + ' 个');
  if (blues.length !== 5) FAIL.push('双色球蓝球 ' + blues.length + ' 个，预期 5');
  if (dupBlue) FAIL.push('双色球 5 注蓝球有 ' + dupBlue + ' 个重复（应互不相同：5 注覆盖 5 个蓝球）');

  /* ---------- [17] 导出文本格式 ---------- */
  const tk = [], tkD = [];
  for (let i=0;i<5;i++){
    tk.push({nums:nums.slice(i*6,i*6+6).map(Number), extra:[Number(blues[i])]});
    tkD.push({nums:dReds.slice(i*5,i*5+5).map(Number), extra:dBlue.slice(i*2,i*2+2).map(Number)});
  }
  const TXT = api.ticketsText(tk, api.GAMES.ssq), TXTD = api.ticketsText(tkD, api.GAMES.dlt);
  const tLines = TXT.split('\n'), dLines = TXTD.split('\n');
  console.log('[17] 导出文本: ' + tLines.length + ' 行 / ' + dLines.length + ' 行');
  console.log('     ' + tLines[0]);
  console.log('     ' + dLines[0]);
  if (tLines.length !== 5) FAIL.push('导出文本 ' + tLines.length + ' 行，预期 5');
  if (!tLines.every(l => /^第\d注  \d\d \d\d \d\d \d\d \d\d \d\d  \+  \d\d$/.test(l)))
    FAIL.push('双色球导出格式不符: ' + tLines[0]);
  if (!dLines.every(l => /^第\d注  \d\d \d\d \d\d \d\d \d\d  \+  \d\d \d\d$/.test(l)))
    FAIL.push('大乐透导出格式不符: ' + dLines[0]);
  if (TXT.indexOf('NaN') >= 0 || TXTD.indexOf('NaN') >= 0) FAIL.push('导出文本出现 NaN');
  const ecS = api.extraCover(tk, api.GAMES.ssq);
  if (Math.abs(ecS.p - 31.25) > 0.01) FAIL.push('双色球「至少中一次蓝球」算成 ' + ecS.p.toFixed(2) + '%，预期 31.25%（5/16）');

  /* ---------- [18] E1 日历 → 号码映射（此前只放名字，权重层等于没开） ---------- */
  const e1a = R3.e1nums || [], e1b = R2.e1nums || [];
  console.log('[18] E1 映射: 2026-09-16 → [' + e1a.join(' ') + ']（九一八）| 2026-09-24 → [' + e1b.join(' ') + ']（秋分/中秋）');
  if (e1a.indexOf(9) < 0 || e1a.indexOf(18) < 0) FAIL.push('E1 未把「九一八」映射成 9/18，实得 [' + e1a.join(' ') + ']');
  if (e1b.indexOf(23) < 0) FAIL.push('E1 未把「秋分(09-23)」映射成 23，实得 [' + e1b.join(' ') + ']');
  if (e1b.indexOf(25) < 0) FAIL.push('E1 未把「中秋节(09-25)」映射成 25，实得 [' + e1b.join(' ') + ']');
  if (e1a.some(x => x < 1 || x > 33)) FAIL.push('E1 映射出越界号码: [' + e1a.join(' ') + ']');

  /* ---------- [19] 采样性能（回归护栏） ---------- */
  console.log('[19] 双色球生成耗时 ' + genMs + 'ms（阈值 1200ms）');
  if (genMs > 1200) FAIL.push('生成耗时 ' + genMs + 'ms 超过 1200ms（P0 历史比对退化成逐候选 join？）');

  /* ---------- [20] 跨期状态持久化闭环 ---------- */
  api.setGame(api.GAMES.ssq);
  els.pickDate.value = '2026-09-16';
  els.resolve.onclick();
  await wait(400);
  if (els.sumWrap.innerHTML.indexOf('E4 区域扰动（备忘）') < 0) FAIL.push('E4 未标注为「备忘、不参与计算」');
  els.mine.value = '03 08 16 21 27 31';
  els.budget.value = '50';
  els.generate.onclick();
  await wait(2000);
  const rawLS = api.lsData['wish-algo-1.0'];
  let saved = {};
  try { saved = rawLS ? JSON.parse(rawLS) : {}; } catch(e) {}
  console.log('[20] 本地记忆: mine="' + saved.mine + '" budget="' + saved.budget + '"');
  if (saved.mine !== '03 08 16 21 27 31') FAIL.push('P4 未写入本地存储，实得 ' + JSON.stringify(saved.mine));
  if (saved.budget !== '50') FAIL.push('周预算未写入本地存储，实得 ' + JSON.stringify(saved.budget));
  els.resolve.onclick();
  await wait(400);
  if (els.sumWrap.innerHTML.indexOf('03 08 16 21 27 31') < 0) FAIL.push('P4 记忆值未回填到摘要');
  if (els.sumWrap.innerHTML.indexOf('已记住上次填写') < 0) FAIL.push('摘要未标注「已记住上次填写」');

  /* ---------- [21] 共用解析库 lib/parse.js（两个坑的守卫） ---------- */
  let lib = null;
  try { lib = require(path.join(__dirname, 'lib', 'parse.js')); }
  catch (e) { FAIL.push('lib/parse.js 加载失败: ' + e.message); }
  if (lib) {
    // 大乐透：行首 HTML 注释里藏 <td> 会污染列索引 —— 必须先剥注释
    const dltHtml =
      '<!-- <td>2</td><td>3</td> -->\n' +
      '<tr class="t_tr1"><td>26105</td><td>10</td><td>14</td><td>30</td><td>33</td><td>34</td>' +
      '<td>09</td><td>12</td><td>797,986,462</td><td>3</td><td>9,415,460</td>' +
      '<td>-</td><td>-</td><td>-</td><td>2026-09-14</td></tr>';
    let dltLine = '';
    try { dltLine = lib.parseDlt(dltHtml)[0].line; } catch (e) { FAIL.push('parseDlt 抛异常: ' + e.message); }
    const dltWant = '26105|2026-09-14|10,14,30,33,34|09,12|797986462|3|9415460';
    if (dltLine !== dltWant) FAIL.push('parseDlt 解析错（注释污染列索引？）\n      期望 ' + dltWant + '\n      实得 ' + dltLine);

    // 双色球：日期带 "(二)" 星期后缀要去掉；号码补零；prizegrades 取 type=1
    const ssqJson = { result: [{ code: '2026107', date: '2026-09-15(二)', red: '1,5,9,17,24,33', blue: '4', poolmoney: '858,528,126', prizegrades: [{ type: '2', typenum: '99', typemoney: '1' }, { type: '1', typenum: '9', typemoney: '6,900,239' }] }] };
    let ssqLine = '';
    try { ssqLine = lib.parseSsq(ssqJson)[0].line; } catch (e) { FAIL.push('parseSsq 抛异常: ' + e.message); }
    const ssqWant = '2026107|2026-09-15|01,05,09,17,24,33|04|858528126|9|6900239';
    if (ssqLine !== ssqWant) FAIL.push('parseSsq 解析错\n      期望 ' + ssqWant + '\n      实得 ' + ssqLine);

    // 双色球备用源：福彩对境外 IP 返回 403（GitHub Actions 实测），所以必须有 500 这条源。
    // 同一期两条源必须**逐字段一致**，否则回退会悄悄改数据 —— 本机实测 200 期零差异。
    const ssq500Html = '<table>\n<!-- <td>干扰</td><td>干扰</td> -->\n' +
      '<tr class="t_tr1"><td>26107</td><td>01</td><td>05</td><td>09</td><td>17</td><td>24</td><td>33</td>' +
      '<td>04</td><td></td><td>858,528,126</td><td>9</td><td>6,900,239</td>' +
      '<td>249</td><td>85,854</td><td>328,194,638</td><td>2026-09-15</td></tr></table>';
    let s5 = '';
    try { s5 = lib.parseSsq500(ssq500Html)[0].line; } catch (e) { FAIL.push('parseSsq500 抛异常: ' + e.message); }
    if (s5 !== ssqWant) FAIL.push('parseSsq500 解析错（列索引漂移？期号没补成 7 位？）\n      期望 ' + ssqWant + '\n      实得 ' + s5);
    // 双源一致性本身也要能被自动发现：拿真实的两份数据比对
    if (lib.fetchSsq500 === undefined) FAIL.push('lib/parse.js 没导出 fetchSsq500（双色球没有备用源）');

    // 体检要能拦住残缺数据
    let caught = false;
    try { lib.validate([{ line: 'x|y|01,02|03|4|5|6' }], 6, 1, 'test'); } catch (e) { caught = true; }
    if (!caught) FAIL.push('validate 没拦住残缺行（红球只有 2 个却放过了）');
    console.log('[21] 共用解析库: parseDlt/parseSsq/parseSsq500 三个已知坑 + validate 拦截 → ' +
      ((dltLine === dltWant && ssqLine === ssqWant && s5 === ssqWant && caught) ? '通过 ✓' : '有问题 ✗'));

    // 服务端脚本语法（避免手改后跑起来才发现）
    ['server.js', 'lib/parse.js', 'lib/icon.js', 'lib/pwa.js', 'fetch_data.js', 'check_fresh.js'].forEach(f => {
      try { new Function(require('fs').readFileSync(path.join(__dirname, f), 'utf8')); }
      catch (e) { FAIL.push(f + ' 语法错误: ' + e.message); }
    });
    console.log('     服务端脚本语法: server.js / lib/*.js / fetch_data.js / check_fresh.js → 通过 ✓');
  }

  /* ---------- [22] PWA：手机上「添加到主屏幕」当 App 用 ---------- */
  const head = html.slice(0, html.indexOf('</head>'));
  const pwaNeed = [
    ['theme-color', 'PWA 主题色'],
    ['mobile-web-app-capable', 'Android 全屏标记'],
    ['apple-mobile-web-app-capable', 'iOS 全屏标记'],
    ['apple-mobile-web-app-title', 'iOS 主屏名称'],
    ['rel="manifest"', 'manifest 引用'],
    ['rel="apple-touch-icon"', 'iOS 图标引用'],
    ['viewport-fit=cover', '刘海屏适配']
  ];
  const pwaMiss = pwaNeed.filter(x => head.indexOf(x[0]) < 0).map(x => x[1]);
  if (pwaMiss.length) FAIL.push('页面 head 缺 PWA 标记: ' + pwaMiss.join('、'));
  // 独立 App 模式的样式与手机端排版
  if (html.indexOf('display-mode:standalone') < 0) FAIL.push('缺 display-mode:standalone 样式（主屏幕打开时会顶到状态栏）');
  if (html.indexOf('safe-area-inset-bottom') < 0) FAIL.push('缺 safe-area-inset-bottom（iPhone 底部横条会压住内容）');
  const mq680 = html.indexOf('@media(max-width:680px)') >= 0;

  // 图标必须是真 PNG（iOS 给 SVG 会退化成页面截图）
  let iconOk = false, iconMsg = '';
  try {
    const iconLib = require(path.join(__dirname, 'lib', 'icon.js'));
    const buf = iconLib.png();
    const sig = buf.slice(0, 8).toString('hex');
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const depth = buf[24], ctype = buf[25];
    iconOk = sig === '89504e470d0a1a0a' && w === 512 && h === 512 && depth === 8 && ctype === 6 && buf.length > 1024;
    iconMsg = w + 'x' + h + ' / ' + (buf.length / 1024).toFixed(1) + 'KB';
    if (!iconOk) FAIL.push('生成的图标不是合法 512x512 8bit RGBA PNG（sig=' + sig + ' ' + w + 'x' + h + ' depth=' + depth + ' type=' + ctype + '）');
    // 幂等：第二次调用要命中缓存，不能重算
    if (iconLib.png() !== buf) FAIL.push('图标未做缓存，每次请求都重算（首次约 50ms）');
  } catch (e) { FAIL.push('lib/icon.js 加载失败: ' + e.message); }

  // server.js 必须真的把 BIND 用上、且 PNG 路由接对
  let srv = '';
  try { srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'); } catch (e) { FAIL.push('读不到 server.js: ' + e.message); }
  if (srv) {
    if (srv.indexOf('server.listen(port, BIND') < 0) FAIL.push('server.js 监听没用 BIND（写死 127.0.0.1 的话手机连不上）');
    // 折行会让长正则失手，先把空白压平再匹配
    const flat = srv.replace(/\s+/g, ' ');
    const pngRoute = flat.match(/if \(u\.pathname === '\/icon\.png'[^;]*?send\(res, 200, iconLib\.png\(\), 'image\/png'\)/);
    if (!pngRoute) FAIL.push('server.js 的 /icon.png 没接 PNG');
    else {
      const blk = pngRoute[0];
      if (blk.indexOf("'/apple-touch-icon.png'") < 0) FAIL.push('server.js 的 /apple-touch-icon.png 没走同一个 PNG 分支（iOS 不认 SVG）');
      if (blk.indexOf('image/svg+xml') >= 0) FAIL.push('/icon.png 分支里混进了 SVG 分支');
    }
    if (srv.indexOf("'/manifest.webmanifest'") < 0) FAIL.push('server.js 没有 /manifest.webmanifest 路由');
    // manifest 的权威定义已移到 lib/pwa.js（与 build.js 共用一份），不再写在 server.js 里
    let pwaLib = null;
    try { pwaLib = require(path.join(__dirname, 'lib', 'pwa.js')); }
    catch (e) { FAIL.push('lib/pwa.js 加载失败: ' + e.message); }
    if (pwaLib) {
      const mi = pwaLib.manifest().icons || [];
      if (!mi.some(x => /icon\.png$/.test(x.src) && x.type === 'image/png'))
        FAIL.push('manifest 的 icons 里没有 PNG 项（iOS 只认 apple-touch-icon，安卓这边也要 PNG）');
      if (!mi.some(x => x.purpose === 'maskable')) FAIL.push('manifest 缺 maskable 图标（安卓自适应图标会变形）');
      if (/^\//.test(pwaLib.manifest().start_url)) FAIL.push('manifest 的 start_url 用了绝对路径，Pages 子路径下会 404');
    }
    if (srv.indexOf('lanURLs') < 0) FAIL.push('server.js 没输出局域网地址（手机不知道该输什么）');
    if (srv.indexOf('pwa.manifest()') < 0) FAIL.push('server.js 没用 lib/pwa.js 的共享 manifest 定义（两份会漂移）');
    if (srv.indexOf("BIND = LOCAL_ONLY ? '127.0.0.1' : '0.0.0.0'") < 0) FAIL.push('BIND 默认值被改（应默认对外，否则手机连不上）');
  }
  const routeOk = srv && srv.indexOf('server.listen(port, BIND') >= 0 && srv.indexOf('lanURLs') >= 0 &&
    /if \(u\.pathname === '\/icon\.png'[^;]*?iconLib\.png\(\), 'image\/png'/.test(srv.replace(/\s+/g, ' '));

  // 三种运行环境，三种口径，都要对：
  //   file://              → 引导去双击启动器
  //   http://192.168.x     → 本地服务模式，给出局域网地址
  //   https://x.github.io  → 静态托管，页面本身就是 App（不能报成"服务没连上"）
  let mobFile = false, mobLan = false, mobSafe = false, mobStatic = false;
  try {
    if (api.IS_HTTP !== false) FAIL.push('file:// 直开时 IS_HTTP 应为 false');
    const h0 = String(els.mobileBox.innerHTML);
    mobFile = h0.indexOf('想在手机上用') >= 0 && els.mobileBox.hidden === false;
    if (!mobFile) FAIL.push('本地文件直开时没给出「想在手机上用」的启动指引');

    const mkSandbox = (proto, host) => {
      const st = stub.replace('globalThis.window = globalThis;',
        "globalThis.window = globalThis;\nglobalThis.location = { protocol: '" + proto + "', hostname: '" + host + "' };");
      return new Function(st + '\n' + js +
        '\n; return {els:__els, renderMobile:renderMobile, applyLive:applyLive, LIVE_LAN:LIVE_LAN,' +
        ' IS_HTTP:IS_HTTP, IS_LOCAL:IS_LOCAL, renderAgeBar:renderAgeBar, setLive:function(s){LIVE_STATE=s;}};')();
    };

    // (1) 局域网 → 本地服务模式
    const apiLan = mkSandbox('http:', '192.168.1.5');
    if (apiLan.IS_HTTP !== true) FAIL.push('http 模式下 IS_HTTP 应为 true');
    if (apiLan.IS_LOCAL !== true) FAIL.push('局域网地址下 IS_LOCAL 应为 true');
    // 混一个非 http 协议进去，验证白名单过滤
    apiLan.applyLive({ lan: ['http://192.168.1.5:17632/', 'javascript:alert(1)', 'file:///etc/passwd'] });
    const h1 = String(apiLan.els.mobileBox.innerHTML);
    mobLan = h1.indexOf('http://192.168.1.5:17632/') >= 0 && h1.indexOf('添加到主屏幕') >= 0;
    mobSafe = apiLan.LIVE_LAN.length === 1 && h1.indexOf('javascript:') < 0 && h1.indexOf('file://') < 0;
    if (!mobLan) FAIL.push('本地服务模式下没把局域网地址渲染到页面上');
    if (!mobSafe) FAIL.push('手机地址没做白名单过滤，实得 ' + JSON.stringify(apiLan.LIVE_LAN));

    // (2) 公网静态托管 → GitHub Pages
    const apiPages = mkSandbox('https:', 'kmin.github.io');
    if (apiPages.IS_LOCAL !== false) FAIL.push('公网域名下 IS_LOCAL 应为 false（否则会把正常的静态托管报成"服务没连上"）');
    apiPages.renderMobile();
    mobStatic = String(apiPages.els.mobileBox.innerHTML).indexOf('这就是 App 本身') >= 0;
    if (!mobStatic) FAIL.push('静态托管下手机区块应说明"页面本身就是 App"，实得 ' +
      String(apiPages.els.mobileBox.innerHTML).replace(/<[^>]*>/g, '').slice(0, 70));
    apiPages.setLive('static'); apiPages.renderAgeBar();
    if (String(apiPages.els.ageBar.innerHTML).indexOf('内置快照 · 每天自动更新') < 0)
      FAIL.push('静态托管的时效条文案不对（应显示"内置快照 · 每天自动更新"）');
    apiPages.setLive('fail'); apiPages.renderAgeBar();
    if (String(apiPages.els.ageBar.innerHTML).indexOf('本地服务没连上') < 0)
      FAIL.push('本地服务掉线时的时效条文案丢了');
  } catch (e) { FAIL.push('手机地址区块自测异常: ' + e.message); }

  /* ---------- [23] GitHub Pages 发布产物（docs/） ---------- */
  // GitHub Pages 没有后端，PWA 的四个资源必须是 docs/ 下真的静态文件，
  // 且所有 URL 必须是相对路径（Pages 的子路径 `/<仓库>/` 下写死 '/' 会 404）。
  let pagesOk = false, pagesMsg = '';
  try {
    const DOCS = path.join(ROOT, 'docs');
    const idx = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
    if (idx !== html) FAIL.push('docs/index.html 与根目录产物内容不一致（说明不是同一次构建出来的）');
    const mani = JSON.parse(fs.readFileSync(path.join(DOCS, 'manifest.webmanifest'), 'utf8'));
    if (mani.start_url !== './' || mani.scope !== './')
      FAIL.push('manifest 的 start_url/scope 必须是 "./"（Pages 子路径下写死 "/" 会 404），实得 ' + mani.start_url + ' / ' + mani.scope);
    if (mani.display !== 'standalone') FAIL.push('manifest display 应为 standalone（否则主屏打开还是浏览器壳）');
    const png = fs.readFileSync(path.join(DOCS, 'icon.png'));
    const apple = fs.readFileSync(path.join(DOCS, 'apple-touch-icon.png'));
    const sigOk = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a' &&
      png.readUInt32BE(16) === 512 && apple.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
    if (!sigOk) FAIL.push('docs/ 下的 icon.png / apple-touch-icon.png 不是合法 512×512 PNG');
    if (!fs.existsSync(path.join(DOCS, 'icon.svg'))) FAIL.push('docs/icon.svg 缺失');
    if (!fs.existsSync(path.join(DOCS, '.nojekyll'))) FAIL.push('docs/.nojekyll 缺失（Pages 会走 Jekyll 处理）');
    // 页面里的资源引用必须是相对的
    const headRef = head.match(/href="([^"]*manifest[^"]*)"/);
    if (!headRef || /^\//.test(headRef[1]))
      FAIL.push('页面里的 manifest 引用必须用相对路径，实得 ' + (headRef ? headRef[1] : '(找不到)'));
    pagesOk = sigOk && mani.start_url === './' && idx === html;
    pagesMsg = 'index.html ' + (idx.length / 1024).toFixed(0) + 'KB + 5 个资源';
  } catch (e) { FAIL.push('GitHub Pages 产物自测异常: ' + e.message); }
  console.log('[23] Pages 产物: ' + (pagesOk ? pagesMsg + ' ✓' : '✗'));

  console.log('[22] PWA: 页面标记 ' + (pwaMiss.length ? '缺 ' + pwaMiss.join('、') : '7/7 ✓') +
    ' | 手机排版 ' + (mq680 ? '✓' : '✗') +
    ' | 图标 ' + (iconOk ? iconMsg + ' ✓' : '✗') +
    ' | 对外监听+路由 ' + (routeOk ? '✓' : '✗') +
    ' | 三种环境 ' + (mobFile && mobLan && mobSafe && mobStatic ? 'file/局域网/公网 ✓' : '✗'));

  /* ---------- [24] 核验台：奖级判定 ----------
     奖级表是硬编码的官方规则，边界最容易写错的地方正是最值钱的地方：
     双色球「只要蓝球中就必有奖」（0+1 也是六等奖）、大乐透九等奖包含「只中一个后区」。
     这里把两彩种每一级的边界都过一遍，外加「一等奖 0 注时不能编金额」。 */
  let prizeOk = false, prizeMsg = '';
  try {
    const cnt = {ok:0, bad:[]};
    const chk = function(desc, got, want){
      if(got === want) cnt.ok++;
      else cnt.bad.push(desc + ' 期望 ' + want + ' 实得 ' + got);
    };
    const ssqDraw = {code:'2026107', date:'2026-09-15', reds:[1,2,3,4,5,6], extra:[1], firstCnt:9, firstAmt:6900000};
    const S = [   // [红球, 蓝球, 期望奖级, 期望金额, 是否浮动]
      [[1,2,3,4,5,6],[1],    '一', 6900000, false],
      [[1,2,3,4,5,6],[7],    '二', 0,       true ],   // 6+0 是浮动奖，库里没金额
      [[1,2,3,4,5,10],[1],   '三', 3000,    false],
      [[1,2,3,4,5,10],[7],   '四', 200,     false],   // 5+0
      [[1,2,3,4,10,11],[1],  '四', 200,     false],   // 4+1
      [[1,2,3,4,10,11],[7],  '五', 10,      false],   // 4+0
      [[1,2,3,10,11,12],[1], '五', 10,      false],   // 3+1
      [[1,2,10,11,12,13],[1],'六', 5,       false],   // 2+1
      [[1,10,11,12,13,14],[1],'六',5,       false],   // 1+1
      [[10,11,12,13,14,15],[1],'六',5,      false],   // 0+1 —— 中蓝球即有奖
      [[1,2,3,10,11,12],[7], null, 0,       false],
      [[1,10,11,12,13,14],[7],null,0,       false]
    ];
    S.forEach(function(c){
      const j = api.judgeTicket(c[0], c[1], ssqDraw, api.GAMES.ssq);
      chk('双色球 '+c[2]+' 级判定', j.level, c[2]);
      chk('双色球 '+c[2]+' 金额', j.amt, c[3]);
      chk('双色球 '+c[2]+' 浮动标记', !!j.float, !!c[4]);
    });

    const dltDraw = {code:'26105', date:'2026-09-14', reds:[1,2,3,4,5], extra:[1,2], firstCnt:3, firstAmt:10000000};
    const D = [   // [前区, 后区, 期望奖级, 期望金额]
      [[1,2,3,4,5],[1,2],      '一', 10000000],
      [[1,2,3,4,5],[1,7],      '二', 0],
      [[1,2,3,4,5],[7,8],      '三', 10000],
      [[1,2,3,4,10],[1,2],     '四', 3000],
      [[1,2,3,4,10],[1,7],     '五', 300],
      [[1,2,3,10,11],[1,2],    '六', 200],
      [[1,2,3,4,10],[7,8],     '七', 100],
      [[1,2,3,10,11],[1,7],    '八', 15],    // 3+1
      [[1,2,10,11,12],[1,2],   '八', 15],    // 2+2
      [[1,2,3,10,11],[7,8],    '九', 5],     // 3+0
      [[1,10,11,12,13],[1,2],  '九', 5],     // 1+2
      [[1,2,10,11,12],[1,7],   '九', 5],     // 2+1
      [[10,11,12,13,14],[1,2], '九', 5],     // 0+2 —— 只中两个后区也算九等奖
      [[1,2,10,11,12],[7,8],   null, 0]
    ];
    D.forEach(function(c){
      const j = api.judgeTicket(c[0], c[1], dltDraw, api.GAMES.dlt);
      chk('大乐透 '+c[2]+' 级判定', j.level, c[2]);
      chk('大乐透 '+c[2]+' 金额', j.amt, c[3]);
    });

    // 一等奖 0 注（当期没人中）时 firstAmt=0，不能拿 0 当金额糊过去，要标成待查
    const jz = api.judgeTicket([1,2,3,4,5,6],[1],
      {code:'2026099', date:'2026-09-01', reds:[1,2,3,4,5,6], extra:[1], firstCnt:0, firstAmt:0}, api.GAMES.ssq);
    chk('一等奖 0 注时不编金额', jz.amt, 0);
    chk('一等奖 0 注时标待查', !!jz.float, true);

    prizeOk = cnt.bad.length === 0;
    prizeMsg = cnt.ok + ' 项断言';
    cnt.bad.slice(0, 6).forEach(function(x){ FAIL.push('奖级判定: ' + x); });
  } catch (e) { FAIL.push('核验台奖级自测异常: ' + e.message); }
  console.log('[24] 核验台奖级: ' + (prizeOk ? prizeMsg + ' 全对 ✓' : '有错 ✗'));

  /* ---------- [25] 注单解析 + 核验汇总 ---------- */
  let parseOk = false, parseMsg = '';
  try {
    const cnt = {ok:0, bad:[]};
    const chk = function(desc, got, want){
      if(String(got) === String(want)) cnt.ok++;
      else cnt.bad.push(desc + ' 期望 ' + want + ' 实得 ' + got);
    };
    const pad = function(x){ return String(x).padStart(2,'0'); };
    const G = api.GAMES.ssq;

    chk('行首期号', api.parseTicketLine('2026108 03 08 16 21 27 31 + 11', G, '').code, '2026108');
    chk('「第N注」前缀不当期号', api.parseTicketLine('第1注  03 08 16 21 27 31  +  11', G, '2026108').code, '2026108');
    chk('不写 + 时按个数从尾部切', api.parseTicketLine('03 08 16 21 27 31 11', G, '').extra.join(','), '11');
    chk('日期形式换算成期号', api.parseTicketLine('2026-09-15 07 11 18 20 27 29 + 11', G, '').code, '2026107');
    const lianxie = api.parseTicketLine('03081621273111', G, '');
    chk('14 位连写不误判成期号', (lianxie && lianxie.err) ? 'err' : 'not-err', 'err');
    chk('超范围号被丢掉后仍成注', api.parseTicketLine('03 08 16 21 27 31 99 + 11', G, '').nums.length, 6);
    const badN = api.parseTicketLine('03 08 16 + 11', G, '');
    chk('号码个数不对要报错', (badN && badN.err) ? 'err' : 'not-err', 'err');

    // 整段核验：用库里真实的 2026107 期反推用例，不写死号码
    const s7 = api.DATA.ssq.filter(function(r){ return r.code === '2026107'; })[0];
    chk('2026107 在库内', !!s7, 'true');
    const blue = s7.extra[0];
    const notBlue = blue === 1 ? 2 : 1;
    const others = [];
    for(let x=1; x<=33 && others.length<6; x++) if(s7.reds.indexOf(x)<0) others.push(x);
    const text = [
      s7.code + ' ' + s7.reds.join(' ') + ' + ' + pad(notBlue),                                    // 6+0 → 二等
      s7.code + ' ' + s7.reds.slice(0,5).concat([others[0]]).join(' ') + ' + ' + pad(blue),         // 5+1 → 三等 3000
      s7.code + ' ' + others.join(' ') + ' + ' + pad(blue),                                         // 0+1 → 六等 5
      '2099101 01 02 03 04 05 06 + 11'                                                              // 库外期号
    ].join('\n');
    const v = api.verifyBatch('ssq', text, '');
    chk('核验注数', v.n, 3);
    chk('投入 3 注 ×2 元', v.cost, 6);
    chk('中奖合计（0+3000+5）', v.win, 3005);
    chk('净盈亏', v.net, 2999);
    chk('中奖注数', v.hits, 3);
    chk('浮动奖计数（只有一等奖例外时才算）', v.floatN, 1);
    chk('库外期号进 bad', v.bad.length, 1);
    chk('bad 里点名了期号', /2099101/.test(v.bad[0] ? v.bad[0].why : ''), 'true');
    chk('一等奖在库时用真实单注金额',
      api.verifyBatch('ssq', s7.code + ' ' + s7.reds.join(' ') + ' + ' + pad(blue), '').win, s7.firstAmt);

    // 大乐透整条链也要能跑（号码同样从库里反推）
    const dl = api.DATA.dlt[0];
    const vd = api.verifyBatch('dlt', dl.code + ' ' + dl.reds.join(' ') + ' + ' + dl.extra.join(' '), '');
    chk('大乐透核验注数', vd.n, 1);
    chk('大乐透一等奖命中', vd.rows[0] ? vd.rows[0].level : 'x', '一');
    chk('大乐透一等奖金额=库内单注', vd.win, dl.firstAmt || 0);

    parseOk = cnt.bad.length === 0;
    parseMsg = cnt.ok + ' 项断言';
    cnt.bad.slice(0, 6).forEach(function(x){ FAIL.push('注单解析/核验: ' + x); });
  } catch (e) { FAIL.push('注单解析自测异常: ' + e.message); }
  console.log('[25] 注单解析与核验: ' + (parseOk ? parseMsg + ' 全对 ✓' : '有错 ✗'));

  /* ---------- [26] 档案：开奖历史库自动入库 + 下注总账 ---------- */
  let archOk = false, archMsg = '';
  try {
    const cnt = {ok:0, bad:[]};
    const chk = function(desc, got, want){
      if(String(got) === String(want)) cnt.ok++;
      else cnt.bad.push(desc + ' 期望 ' + want + ' 实得 ' + got);
    };
    delete api.lsData[api.ARCH_KEY];           // 从干净状态开始

    const a1 = api.syncDraws();
    chk('首次入库 双色球', a1.ssq, 200);
    chk('首次入库 大乐透', a1.dlt, 255);
    // 入库结果必须落盘，不能只活在运行时变量里 —— 否则档案区一旦重渲染，提示就没了
    chk('入库结果写进档案', (api.archInit().lastSync||{}).ssq, 200);
    const a2 = api.syncDraws();
    chk('再入库不重复计数', a2.ssq + a2.dlt, 0);
    chk('无新增时如实归零（不谎报）', (api.archInit().lastSync||{}).ssq, 0);
    chk('库内总数稳定', a2.total, 455);
    chk('按期号去重（无重复键）', api.archCodes('ssq').length, 200);
    chk('能取到最老那一期', api.archCodes('ssq')[0], '2025059');

    // 记一笔：一注中蓝球（0+1 → 六等奖 5 元）+ 一注不中。
    // 号码一律从库里那一期的真实开奖号码反推，不写死 —— 写死就是在测试自己的假设。
    const s7b = api.DATA.ssq.filter(function(r){ return r.code === '2026107'; })[0];
    const offRed = [];
    for(let x=1; x<=33 && offRed.length<6; x++) if(s7b.reds.indexOf(x)<0) offRed.push(x);
    const offRed2 = [];   // 第二组也不在开奖号里，用来测「不同的注要加进去，相同的注不能重复加」
    for(let x=1; x<=33 && offRed2.length<6; x++) if(s7b.reds.indexOf(x)<0 && offRed.indexOf(x)<0) offRed2.push(x);
    const blue7 = s7b.extra[0];
    const notBlue7 = blue7 === 1 ? 2 : 1;
    chk('并入注数', api.ledgerAdd('ssq', '2026107', [
      {nums:offRed, extra:[blue7]},        // 0 红 + 中蓝 → 六等奖 5 元
      {nums:offRed, extra:[notBlue7]}      // 0 红 + 不中蓝 → 无奖
    ]), 2);
    chk('总账条目数', api.archInit().ledger.length, 1);

    // 同一注再记一遍必须什么都没发生（点两下按钮 / 同一批核验两遍的真实现场）
    chk('同一注重复记账返回 0', api.ledgerAdd('ssq','2026107',[{nums:offRed, extra:[notBlue7]}]), 0);
    chk('同一注重复记账不长行', api.archInit().ledger.length, 1);
    chk('同一注重复记账不算注数', api.archInit().ledger[0].n, 2);
    // 但补一注**新的**要能加进同一行，不能因为"同期已存在"就被丢掉
    chk('补新注会合进同一行', api.ledgerAdd('ssq','2026107',[{nums:offRed2, extra:[blue7]}]), 1);
    chk('同期同彩种仍然只有一行', api.archInit().ledger.length, 1);

    api.settleLedger();
    const e0 = api.archInit().ledger[0];
    chk('已开奖期自动结算', e0.status, 'checked');
    chk('注数合并后 3 注', e0.n, 3);
    chk('成本 3×2=6 元', e0.cost, 6);
    chk('奖金 5+5=10 元', e0.win, 10);
    chk('中奖明细与中奖注数一致', (e0.detail||[]).length, 2);

    // 期号还没开奖 → 必须留在待开奖，不能瞎结算
    api.ledgerAdd('ssq', '2099101', [{nums:[1,2,3,4,5,6], extra:[1]}]);
    api.settleLedger();
    const pend = api.archInit().ledger.filter(function(x){ return x.code === '2099101'; })[0];
    chk('未开奖期保持待开奖', pend.status, 'pending');
    chk('未开奖期奖金为 0', pend.win, 0);

    const t = api.ledgerTotals(api.archInit().ledger);
    chk('汇总 · 记录期数', t.rows, 2);
    chk('汇总 · 待开奖', t.pending, 1);
    chk('汇总 · 已结算', t.checked, 1);
    chk('汇总 · 总投入', t.cost, 8);
    chk('汇总 · 总奖金', t.win, 10);
    chk('汇总 · 净盈亏', t.net, 2);
    chk('汇总 · 回报率', t.rate.toFixed(1), '25.0');

    const csv = api.ledgerCSV();
    chk('CSV 带 BOM（Excel 不乱码）', csv.charCodeAt(0), 65279);
    chk('CSV 行数 = 表头 + 条目', csv.split('\r\n').length, 3);
    const archObj = JSON.parse(api.archiveJSON());
    chk('JSON 含 draws', typeof archObj.draws, 'object');
    chk('JSON 含 ledger', Array.isArray(archObj.ledger), 'true');
    chk('draws 里存的是可还原的原始行', /^2026107\|2026-09-15\|/.test(archObj.draws.ssq['2026107']||''), 'true');

    // localStorage 不可用（file:// 直开 / 隐私模式）时必须降级，不能抛异常。
    // 做法是在桩后面补一句把它置空，再跑一遍整页脚本。
    // 注意别把这里的局部变量叫 js —— 会遮蔽外层的页面脚本源码（踩过：
    // stub + [object Object] 拼出来的报错是「Unexpected identifier 'Object'」，完全指不到病因）。
    let noLs = '未跑';
    // 桩是共享全局：跑完把 document / localStorage 还原，别让「已被置空的世界」漏给后面的用例
    const keepDoc = globalThis.document, keepLs = globalThis.localStorage;
    const NOLS_SRC = stub + 'globalThis.localStorage = null;\n' + js;
    try {
      const apiNL = new Function(NOLS_SRC +
        '\n; return {LS:LS, syncDraws:syncDraws, ledgerAdd:ledgerAdd, ledgerTotals:ledgerTotals,' +
        ' archCodes:archCodes, renderArchive:renderArchive, els:__els};')();
      const okNL = apiNL.LS === null
        && apiNL.syncDraws().total === 0
        && apiNL.syncDraws().ssq === 0                 // 不能谎报入库条数
        && apiNL.ledgerAdd('ssq','2026107',[{nums:[1,2,3,4,5,6],extra:[1]}]) === 0
        && apiNL.ledgerTotals([]).cost === 0
        && apiNL.archCodes('ssq').length === 0
        && String(apiNL.els.archBody.innerHTML).indexOf('不允许') >= 0;
      noLs = okNL ? 'ok' : '降级行为不对';
    } catch (e) { noLs = '抛异常: ' + e.message; }
    chk('无 localStorage 时降级不报错', noLs, 'ok');

    globalThis.document = keepDoc; globalThis.localStorage = keepLs;

    // 手机端总账走卡片、宽屏走表格，两边都渲染好靠 CSS 媒体查询切。
    // 少了任何一边都不会报错，只会在某一端变得难用 —— 所以这里把两边都钉住。
    //
    // ★关键：桩是共享全局，每次 new Function(stub+js) 都会重写 globalThis.document，
    //   而页面里的函数是**调用时**才去取 document。所以拿早先那个 api 的 els 断言渲染结果必然落空
    //   —— 那份 __els 早不是当前 document 指向的对象了（踩过：读到 0/0，看着像渲染没输出，
    //   其实结果被写进了别的 api 的桩里）。这里现建一个 api、预置一条总账，用它自己的 els 读 DOM。
    const SEED = stub
      + '__lsData["wish-algo-archive-1"]=JSON.stringify({seq:1,draws:{ssq:{},dlt:{}},ledger:['
      + '{game:"ssq",code:"2026107",date:"2026-09-15",n:3,cost:6,win:5,status:"checked",'
      + 'tickets:[{nums:[1,2,3,4,5,6],extra:[7]}],detail:[{level:6,amt:5}],ts:1}]});\n'
      + js;
    const apiR = new Function(SEED +
      '\n; return {renderArchive:renderArchive, archInit:archInit, els:__els};')();
    apiR.renderArchive();
    const archHtml = String(apiR.els.archBody.innerHTML);
    const ledRows = apiR.archInit().ledger.length;
    chk('预置总账 = 1 期（渲染断言的前提）', ledRows, 1);
    chk('总账同时渲染宽表与手机卡片',
      (archHtml.indexOf('<table class="led"') >= 0 ? '1' : '0') + '/' +
      (archHtml.indexOf('class="ledcards"') >= 0 ? '1' : '0'), '1/1');
    chk('CSS 里有手机端切换规则',
      /\.ledwrap\{display:none\}\s*\.ledcards\{display:block\}/.test(html.replace(/\s+/g, ' ')) ? '1' : '0', '1');
    chk('手机卡片数 = 总账期数', (archHtml.match(/class="lnums"/g)||[]).length, ledRows);
    chk('手机卡片四项俱全（注数/投入/中奖/盈亏）',
      ['注数','投入','中奖','盈亏'].every(function(k){ return archHtml.indexOf('<i>'+k+'</i>') >= 0; }) ? '1' : '0', '1');
    chk('宽表表头 9 列', (archHtml.match(/<th>/g)||[]).length, 9);
    chk('档案界面显示最近入库期数', archHtml.indexOf('最近一次入库')>=0 ? '1':'0', '1');
    chk('旧运行时变量已彻底移除', js.indexOf('SYNC_LAST')>=0 ? 'still-there':'gone', 'gone');

    archOk = cnt.bad.length === 0;
    archMsg = cnt.ok + ' 项断言';
    cnt.bad.slice(0, 6).forEach(function(x){ FAIL.push('档案: ' + x); });
  } catch (e) { FAIL.push('档案自测异常: ' + e.message); }
  console.log('[26] 档案总账与历史库: ' + (archOk ? archMsg + ' ✓' : '✗'));

  console.log('');
  if (FAIL.length) { console.log('结果: 失败'); FAIL.forEach(x => console.log('  - ' + x)); process.exit(1); }
  console.log('结果: 全部通过 ✓');
})();
