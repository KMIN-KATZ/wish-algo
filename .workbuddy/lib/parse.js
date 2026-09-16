/* =====================================================================
   开奖数据抓取 + 解析（共用库）
   ---------------------------------------------------------------------
   被两处复用：
     .workbuddy/fetch_data.js   定时任务：拉数据 → 写 source/*.txt
     .workbuddy/server.js       本地服务：拉数据 → 直接喂给页面

   两个数据源互相独立，任一失败由调用方决定回退策略，本库只抛错不吞错。
     - 双色球：**优先福彩官网 JSON 接口**，失败自动回退 500 彩票网历史表格
     - 大乐透：500 彩票网历史表格
   为什么双色球要两条源：福彩官网对**境外 IP 返回 HTTP 403**（实测 GitHub Actions
   的美国 runner 就是 403），而 500 彩票网境外可达。两条源解析出的字段完全一致，
   所以回退是无损的（同一期数据实测逐字段相同）。
   500 表格解析**必须先剥 HTML 注释**，否则行首注释里的 <td> 会污染列索引，
   解析出 0 行 —— 这是踩过的坑。

   行格式（两种彩种一致，7 字段）：
     期号|日期|红球(前区)|蓝球(后区)|奖池(元)|一等奖注数|一等奖单注金额(元)
   全部按日期从新到旧。
   注意期号格式：福彩给 7 位（2026107），500 给 5 位（26107），
   统一成**福彩的 7 位**，否则同一天的两条源数据会被当成不同期。
   ===================================================================== */
const pad = n => String(n).padStart(2, '0');
const num = s => String(s == null ? '' : s).replace(/,/g, '').trim();
const desc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};
const REF_500 = 'https://datachart.500.com/';
const REF_CWL = 'https://www.cwl.gov.cn/';

/* 500 的 5 位期号 → 福彩的 7 位（26107 → 2026107）。
   只在长度确实是 5 时补，避免上游哪天改了格式反而把数据改坏。 */
const ssqCode = c => { const s = String(c).replace(/\D/g, ''); return s.length === 5 ? '20' + s : s; };

/* 双色球：优先福彩官网，403/超时等任何失败都回退 500 表格 */
async function fetchSsq(count) {
  const n = count || 200;
  try {
    const r = await fetch('https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=' + n,
      { headers: Object.assign({ Referer: REF_CWL }, UA) });
    if (!r.ok) throw new Error('福彩接口 HTTP ' + r.status);
    const rows = parseSsq(await r.json());
    return { rows, url: 'cwl.gov.cn', from: 'cwl' };
  } catch (e) {
    const r2 = await fetchSsq500(n).catch(e2 => { throw new Error('福彩失败(' + e.message + ')，500 也失败(' + e2.message + ')'); });
    r2.note = '福彩不可用，已回退 500：' + e.message;
    return r2;
  }
}

/* 双色球备用源：500 彩票网历史表格 */
async function fetchSsq500(count) {
  const n = count || 200;
  const y = new Date().getFullYear();
  const url = 'https://datachart.500.com/ssq/history/newinc/history.php?start=' +
    String(y - 1).slice(2) + '001&end=' + String(y).slice(2) + '200';
  const r = await fetch(url, { headers: Object.assign({ Referer: REF_500 }, UA) });
  if (!r.ok) throw new Error('500 双色球表格 HTTP ' + r.status);
  const rows = parseSsq500(await r.text()).slice(0, n);   // 只取最新 n 期，和福彩口径对齐
  return { rows, url: 'datachart.500.com/ssq', from: '500' };
}

/* 大乐透：按滚动窗口拉历史（start=去年001，end=今年200；2026 年即 25001→26200） */
async function fetchDlt() {
  const y = new Date().getFullYear();
  const url = 'https://datachart.500.com/dlt/history/newinc/history.php?start=' +
    String(y - 1).slice(2) + '001&end=' + String(y).slice(2) + '200';
  const r = await fetch(url, { headers: Object.assign({ Referer: REF_500 }, UA) });
  if (!r.ok) throw new Error('500 表格 HTTP ' + r.status);
  const html = await r.text();
  return { rows: parseDlt(html), url, from: '500' };
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

/* 纯函数：500 双色球表格 HTML → rows
   列位（实测 26107 期）：td[0]=期号 td[1..6]=红球6个 td[7]=蓝球 td[8]=空
   td[9]=奖池 td[10]=一等奖注数 td[11]=一等奖单注 td[12]=二等奖注数
   td[13]=二等奖单注 td[14]=总投注额 td[15]=日期 */
function parseSsq500(html) {
  const raw = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const trs = raw.match(/<tr[^>]*class="t_tr1"[^>]*>[\s\S]*?<\/tr>/g) || [];
  if (!trs.length) throw new Error('500 双色球未匹配到 t_tr1 行（已剥注释）');
  const rows = trs.map(tr => {
    const td = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [])
      .map(x => x.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (td.length < 16) return null;
    const code = ssqCode(td[0]);
    const reds = td.slice(1, 7).map(x => pad(num(x))).join(',');
    const blue = pad(num(td[7]));
    const date = num(td[15]).replace(/[^\d-]/g, '');
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !reds || !blue) return null;
    return { code, date, line: [code, date, reds, blue, num(td[9]) || '0', num(td[10]) || '0', num(td[11]) || '0'].join('|') };
  }).filter(Boolean);
  if (!rows.length) throw new Error('500 双色球 t_tr1 行存在但解析出 0 条有效记录');
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

module.exports = {
  fetchSsq, fetchSsq500, fetchDlt,
  parseSsq, parseSsq500, parseDlt,
  validate, toText, fromText,
  SSQ_REDS: 6, SSQ_EXTRA: 1, DLT_REDS: 5, DLT_EXTRA: 2
};
