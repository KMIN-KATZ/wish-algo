/* =====================================================================
   数据新鲜度门禁
   ---------------------------------------------------------------------
     node .workbuddy/check_fresh.js [允许滞后的天数，默认 4]

   为什么要单独一条：GitHub Actions 的 runner 在境外，福彩/500 那两个接口
   对海外 IP 未必放行。抓取失败时 fetch_data.js 会**保留原文件**（这是对的，
   不能写残缺数据），于是"抓取一直失败但流程一路绿灯、页面悄悄变旧"是最坏的
   结果——没人会发现。
   所以这里单独卡一道：数据比今天旧太多就直接退出码 1，让那次运行变红。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const lib = require('./lib/parse');

const LIMIT = Number(process.argv[2] || 4);
const SRC = path.join(__dirname, 'source');

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function days(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

const today = todayStr();
let bad = 0;

[['双色球', 'ssq.txt'], ['大乐透', 'dlt.txt']].forEach(function (x) {
  const label = x[0], file = x[1];
  let rows = null;
  try { rows = lib.fromText(fs.readFileSync(path.join(SRC, file), 'utf8')); }
  catch (e) { console.log('[FAIL] ' + label + ' 读不到 ' + file + ': ' + e.message); bad++; return; }
  if (!rows || !rows.length) { console.log('[FAIL] ' + label + ' ' + file + ' 是空的'); bad++; return; }

  const d = days(rows[0].date, today);
  const s = '  ' + label + ' ' + file + ' 最新 ' + rows[0].code + ' / ' + rows[0].date +
    '（' + rows.length + ' 期），距今 ' + d + ' 天';
  if (d > LIMIT) { console.log('[FAIL]' + s + ' —— 超过 ' + LIMIT + ' 天，抓取多半已经失效'); bad++; }
  else console.log('[OK]  ' + s.trim());
});

if (bad) { console.log('RESULT 数据过期 ' + bad + ' 项'); process.exit(1); }
console.log('RESULT 数据新鲜');
