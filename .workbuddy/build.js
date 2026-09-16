/* =====================================================================
   许愿算法 1.0 · 构建脚本
   ---------------------------------------------------------------------
   把 source/ 下的数据与模板注入，生成两份产物：

     ../许愿算法1.0.html  双击本地打开用
     ../docs/index.html   GitHub Pages 发布目录（+ manifest/icon 等静态资源）

   两份内容完全相同（同一份注入结果），改一处不会漏另一处。

     node .workbuddy/build.js

   source/tmpl.html   页面模板，含 __SSQ_DATA__ / __DLT_DATA__ / __CAL_DATA__ 占位符
   source/ssq.txt     双色球开奖数据，每行：
                      期号|日期|红球|蓝球|奖池(元)|一等奖注数|一等奖单注金额(元)
   source/dlt.txt     大乐透开奖数据，同上格式（前区|后区）
   source/cal.txt     日历数据，每行 YYYYMMDD|名称

   数据更新流程（数据过期时照做）：
     1) 双色球（福彩官网，200 期上限）：
        curl -H "Referer: https://www.cwl.gov.cn/" \
          "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=200" -o raw.json
        取 result[] 的 code/date/red/blue/poolmoney/prizegrades（type=1 的 typenum、typemoney）
     2) 大乐透（500 彩票网数据表）：
        curl -H "Referer: https://datachart.500.com/" \
          "https://datachart.500.com/dlt/history/newinc/history.php?start=25001&end=26200" -o dlt.html
        先剥 <!--注释--> 再匹配 <tr class="t_tr1">，td[0]=期号、td[1..5]=前区、td[6..7]=后区、
        td[8]=奖池、td[9]=一等奖注数、td[10]=一等奖单注金额、td[14]=日期
     注意：体彩官方 API webapi.sporttery.cn 会返回 HTTP 567，不要用。
     3) 改完 source/ 后重跑本脚本，再跑 node .workbuddy/selftest.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(HERE, 'source');

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').trim();

const tmpl = read('tmpl.html');
const ssq = read('ssq.txt');
const dlt = read('dlt.txt');
const cal = read('cal.txt').split('\n').map(s => s.trim()).filter(Boolean).join(';');

const ssqN = ssq.split('\n').length;
const dltN = dlt.split('\n').length;
const calN = cal.split(';').length;

// 数据体检：每行字段数与数值范围
const bad = [];
ssq.split('\n').forEach((l, i) => { if (l.split('|').length !== 7) bad.push('ssq:' + (i+1)); });
dlt.split('\n').forEach((l, i) => { if (l.split('|').length !== 7) bad.push('dlt:' + (i+1)); });
cal.split(';').forEach((l, i) => { if (!/^\d{8}\|.+$/.test(l)) bad.push('cal:' + (i+1)); });
if (bad.length) { console.log('!! 数据格式异常: ' + bad.slice(0, 8).join(', ')); process.exit(1); }

let out = tmpl;
out = out.split('__SSQ_DATA__').join(ssq);
out = out.split('__DLT_DATA__').join(dlt);
out = out.split('__CAL_DATA__').join(cal);

const left = out.match(/__[A-Z_]+__/g);
if (left) { console.log('!! 未替换的占位符: ' + [...new Set(left)].join(', ')); process.exit(1); }

const dest = path.join(ROOT, '许愿算法1.0.html');
fs.writeFileSync(dest, out);
console.log('已生成 许愿算法1.0.html | ' + (out.length / 1024).toFixed(1) + ' KB');
console.log('  双色球 ' + ssqN + ' 期 | 大乐透 ' + dltN + ' 期 | 日历 ' + calN + ' 条');
console.log('  双色球范围: ' + ssq.split('\n')[ssqN-1].split('|').slice(0,2).join(' ') +
            '  →  ' + ssq.split('\n')[0].split('|').slice(0,2).join(' '));
console.log('  大乐透范围: ' + dlt.split('\n')[dltN-1].split('|').slice(0,2).join(' ') +
            '  →  ' + dlt.split('\n')[0].split('|').slice(0,2).join(' '));

/* ---------- 静态部署产物：GitHub Pages 的发布目录 docs/ ----------
   同一个页面写两份，内容一字不差（都是上面那个 out）：
     ./许愿算法1.0.html   双击本地打开用（file:// 或本地服务）
     ./docs/index.html    Pages 发布用（主目录必须是 index.html）
   外加 PWA 的四个资源落到 docs/，GitHub Pages 没有后端，这些必须是真的静态文件。
   两份产物同源，不存在"改了这份忘了那份"。 */
const PAGES = path.join(ROOT, 'docs');
fs.mkdirSync(PAGES, { recursive: true });
fs.writeFileSync(path.join(PAGES, 'index.html'), out);
const pwaFiles = require('./lib/pwa').writeAssets(PAGES);
console.log('已生成 docs/ → GitHub Pages 发布目录');
console.log('  index.html + ' + pwaFiles.join(' + '));
