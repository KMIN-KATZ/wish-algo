/* =====================================================================
   PWA 资源 · 一处定义，两处消费
   ---------------------------------------------------------------------
   本地服务（server.js）用运行时路由吐这几个文件；
   静态托管（build.js 产出 docs/）用落盘文件。定义只留一份，避免两边漂移。

   所有 URL 都用**相对路径**（'./'、'icon.png'），因为同一个产物要能落在
   两种位置：
       本地服务      http://127.0.0.1:17632/          （根）
       GitHub Pages  https://<用户名>.github.io/<仓库>/  （子路径）
   相对路径在两边都解析正确，写死 '/' 的话 Pages 上会 404。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const icon = require('./icon');

const NAME = '许愿算法 · 反拥挤过滤器';

function manifest() {
  return {
    name: NAME,
    short_name: '许愿算法',
    description: '输入日期，自动填入开奖数据并生成 5 注号码。不预测、不提高中奖概率。',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f1f3f5',
    theme_color: '#1d4fd8',
    lang: 'zh-CN',
    icons: [
      { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
}

/* 把 PWA 资源写进目录，返回写出的文件名列表 */
function writeAssets(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    'manifest.webmanifest': JSON.stringify(manifest()),
    'icon.png': icon.png(),
    'apple-touch-icon.png': icon.png(),
    'icon.svg': icon.svg(),
    // GitHub Pages 默认跑 Jekyll，会忽略下划线开头的文件；这里没有这种文件，
    // 但放一个 .nojekyll 能省掉整条 Jekyll 处理链，部署更快也更不容易出岔子。
    '.nojekyll': ''
  };
  Object.keys(files).forEach(function (f) {
    fs.writeFileSync(path.join(dir, f), files[f]);
  });
  return Object.keys(files);
}

module.exports = { manifest, writeAssets, NAME };
