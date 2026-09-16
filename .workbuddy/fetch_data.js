/* =====================================================================
   许愿算法 1.0 · 拉取最新开奖数据并写入 source/（定时任务用）
   ---------------------------------------------------------------------
     node .workbuddy/fetch_data.js

   写入：
     .workbuddy/source/ssq.txt   双色球 200 期
     .workbuddy/source/dlt.txt   大乐透 255 期
   每行：期号|日期|红球(前区)|蓝球(后区)|奖池(元)|一等奖注数|一等奖单注金额(元)
   按日期从新到旧，末尾不留空行。

   抓取与解析逻辑在 .workbuddy/lib/parse.js，本地服务 server.js 共用同一份，
   不再各写一遍（大乐透「先剥 HTML 注释再匹配 t_tr1」那个坑就只存在一处）。

   容错：任一源失败则**保留该文件原样不动**，绝不把空数据或残缺数据写进去
   （那会让页面静默失效）。两个源全失败时退出码 1。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const lib = require('./lib/parse');

const SRC = path.join(__dirname, 'source');

async function run(label, fn, file, redsN, extraN) {
  try {
    const { rows } = await fn();
    lib.validate(rows, redsN, extraN, label);
    fs.writeFileSync(path.join(SRC, file), lib.toText(rows), 'utf8');
    const nw = rows[0], od = rows[rows.length - 1];
    console.log('[OK]   ' + label + ' ' + rows.length + ' 行 → ' + file +
      ' | 最新 ' + nw.code + ' ' + nw.date + ' | 最旧 ' + od.code + ' ' + od.date);
    return { name: label, ok: true, n: rows.length, newest: nw.code, newestDate: nw.date };
  } catch (e) {
    console.log('[FAIL] ' + label + ' 保留 ' + file + ' 原样不动 -> ' + e.message);
    return { name: label, ok: false, err: e.message };
  }
}

(async function () {
  const r = [
    await run('双色球', lib.fetchSsq, 'ssq.txt', lib.SSQ_REDS, lib.SSQ_EXTRA),
    await run('大乐透', lib.fetchDlt, 'dlt.txt', lib.DLT_REDS, lib.DLT_EXTRA)
  ];
  console.log('RESULT ' + JSON.stringify(r));
  process.exit(r.every(x => !x.ok) ? 1 : 0);
})();
