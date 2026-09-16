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
  ' setGame:function(g){GAME=g;}, getGame:function(){return GAME;}, setRES:function(v){RES=v;}};';

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

    // 体检要能拦住残缺数据
    let caught = false;
    try { lib.validate([{ line: 'x|y|01,02|03|4|5|6' }], 6, 1, 'test'); } catch (e) { caught = true; }
    if (!caught) FAIL.push('validate 没拦住残缺行（红球只有 2 个却放过了）');
    console.log('[21] 共用解析库: parseDlt/parseSsq 两个已知坑 + validate 拦截 → ' +
      ((dltLine === dltWant && ssqLine === ssqWant && caught) ? '通过 ✓' : '有问题 ✗'));

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

  console.log('');
  if (FAIL.length) { console.log('结果: 失败'); FAIL.forEach(x => console.log('  - ' + x)); process.exit(1); }
  console.log('结果: 全部通过 ✓');
})();
