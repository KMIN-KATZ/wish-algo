/* =====================================================================
   开奖数据抓取 + 解析（共用库）
   ---------------------------------------------------------------------
   被两处复用：
     .workbuddy/fetch_data.js   定时任务：拉数据 → 写 source/*.txt
     .workbuddy/server.js       本地服务：拉数据 → 直接喂给页面

   两个数据源互相独立，任一失败由调用方决定回退策略，本库只抛错不吞错。
     - 双色球：福彩官网 JSON 接口
     - 大乐透：500 彩票网历史表格（**必须先剥 HTML 注释**，否则行首注释里的 <td>
       会污染列索引，解析出 0 行 —— 这是踩过的坑）

   行格式（两种彩种一致，7 字段）：
     期号|日期|红球(前区)|蓝球(后区)|奖池(元)|一等奖注数|一等奖单注金额(元)
   全部按日期从新到旧。
   ===================================================================== */
const pad = n => String(n).padStart(2, '0');
const num = s => String(s == null ? '' : s).replace(/,/g, '').trim();
const desc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

const UA = { 'User-Agent': 'Mozilla/5.0' };

/* 双色球：拉最新 n 期 */
async function fetchSsq(count) {
  const n = count || 200;
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${n}`;
  const r = await fetch(url, { headers: Object.assign({ Referer: 'https://www.cwl.gov.cn/' }, UA) });
  if (!r.ok) throw new Error('福彩接口 HTTP ' + r.status);
  const json = await r.json();
  const rows = parseSsq(json);
  return { rows, url };
}

/* 大乐透：按滚动窗口拉历史（start=去年001，end=今年200；2026 年即 25001→26200） */
async function fetchDlt() {
  const y = new Date().getFullYear();
  const url = 'https://datachart.500.com/dlt/history/newinc/history.php?start=' +
    String(y - 1).slice(2) + '001&end=' + String(y).slice(2) + '200';
  const r = await fetch(url, { headers: Object.assign({ Referer: 'https://datachart.500.com/' }, UA) });
  if (!r.ok) throw new Error('500 表格 HTTP ' + r.status);
  const html = await r.text();
  return { rows: parseDlt(html), url };
}

/* 纯函数：福彩 JSON → rows */
function parseSsq(json) {
  if (!json || !Array.isArray(json.result)) throw new Error('JSON 无 result 数组 (state=' + (json && json.state) + ')');
  const rows = json.result.map(it => {
    const code = String(it.code || '').trim();
    const date = String(it.date || '').replace(/\(.*?\)/g, '').trim();   // 去掉 "(二)" 星期后缀
    const reds = String(it.red || '').split(',').map(s => pad(s.trim())).join(',');
    const blue = pad(String(it.blue || '').trim());
    const g = (it.prizegrades || []).find(x => String(x.type) === '1') || {};
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !reds || !blue) return null;
    return { code, date, line: [code, date, reds, blue, num(it.poolmoney) || '0', num(g.typenum) || '0', num(g.typemoney) || '0'].join('|') };
  }).filter(Boolean);
  if (!rows.length) throw new Error('result 非空但解析出 0 行');
  return rows.sort(desc);
}

/* 纯函数：500 表格 HTML → rows */
function parseDlt(html) {
  const raw = String(html).replace(/<!--[\s\S]*?-->/g, '');     // 先剥注释！
  const trs = raw.match(/<tr[^>]*class="t_tr1"[^>]*>[\s\S]*?<\/tr>/g) || [];
  if (!trs.length) throw new Error('未匹配到 t_tr1 行（已剥注释）');
  const rows = trs.map(tr => {
    const td = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [])
      .map(x => x.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (td.length < 15) return null;
    const code = td[0].replace(/\D/g, '');
    const reds = td.slice(1, 6).map(x => pad(num(x))).join(',');
    const extra = td.slice(6, 8).map(x => pad(num(x))).join(',');
    const date = num(td[14]).replace(/[^\d-]/g, '');
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !reds || !extra) return null;
    return { code, date, line: [code, date, reds, extra, num(td[8]) || '0', num(td[9]) || '0', num(td[10]) || '0'].join('|') };
  }).filter(Boolean);
  if (!rows.length) throw new Error('t_tr1 行存在但解析出 0 条有效记录');
  return rows.sort(desc);
}

/* 字段体检：红球/后区个数 + 两位补零 + 7 字段 */
function validate(rows, redsN, extraN, label) {
  const bad = [];
  rows.forEach(r => {
    const f = r.line.split('|');
    if (f.length !== 7) return bad.push(r.line);
    const reds = f[2].split(','), extra = f[3].split(',');
    if (reds.length !== redsN || extra.length !== extraN) return bad.push(r.line);
    if (reds.some(x => !/^\d{2}$/.test(x)) || extra.some(x => !/^\d{2}$/.test(x))) return bad.push(r.line);
  });
  if (bad.length) throw new Error((label || '') + ' 有 ' + bad.length + ' 行字段异常，示例: ' + bad[0]);
  return rows;
}

const toText = rows => rows.map(r => r.line).join('\n');
const fromText = txt => String(txt).trim().split('\n').filter(Boolean).map(l => {
  const f = l.split('|');
  return { code: f[0], date: f[1], line: l };
});

module.exports = { fetchSsq, fetchDlt, parseSsq, parseDlt, validate, toText, fromText, SSQ_REDS: 6, SSQ_EXTRA: 1, DLT_REDS: 5, DLT_EXTRA: 2 };
