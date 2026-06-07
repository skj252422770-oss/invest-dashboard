/* ============================================================
   投资看板 - 主逻辑
   后端: http://localhost:8888
   ============================================================ */

const API = 'http://localhost:8888';
let refreshTimer = null;
let clockTimer = null;

// ============ 指数数据定义 ============
const INDICES_DEF = {
  china: [
    { code: 'sh000001', name: '上证指数', market: 'CN' },
    { code: 'sz399001', name: '深证成指', market: 'CN' },
    { code: 'sz399006', name: '创业板指', market: 'CN' },
    { code: 'sh000688', name: '科创50', market: 'CN' },
    { code: 'sh000300', name: '沪深300', market: 'CN' },
  ],
  hk: [
    { code: 'hkHSI', name: '恒生指数', market: 'HK' },
    { code: 'hkHSTECH', name: '恒生科技', market: 'HK' },
  ]
};

// ============ 时钟 ============
function updateClock() {
  const now = new Date();
  const beijing = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  document.getElementById('clock').textContent = beijing;
}

function updateMarketStatus() {
  const now = new Date();
  const beijingTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const [bh, bm] = beijingTime.split(' ')[1].split(':').map(Number);

  const markets = [
    { name: '北京', openH: 9, openM: 30, closeH: 15, closeM: 0, tzOffset: 0 },
    { name: '港股', openH: 9, openM: 30, closeH: 16, closeM: 0, tzOffset: 0 },
    { name: '美股', openH: 21, openM: 30, closeH: 4, closeM: 0, tzOffset: -13 },  // 美东21:30 = 北京次日10:30
    { name: '欧洲', openH: 15, openM: 0, closeH: 23, closeM: 0, tzOffset: -6 },   // 伦敦15:00 = 北京23:00
    { name: '日本', openH: 9, openM: 0, closeH: 15, closeM: 0, tzOffset: -1 },   // 东京9:00 = 北京10:00
  ];

  let html = '';
  markets.forEach(m => {
    let isOpen = false;
    const currentHour = (bh + m.tzOffset + 24) % 24;
    const currentMin = bm;

    if (m.openH > m.closeH) {
      // 跨天（如美股）
      isOpen = currentHour >= m.openH || currentHour < m.closeH;
      if (currentHour === m.openH && currentMin < m.openM) isOpen = false;
      if (currentHour === m.closeH && currentMin >= m.closeM) isOpen = false;
    } else {
      isOpen = (currentHour > m.openH || (currentHour === m.openH && currentMin >= m.openM))
           && (currentHour < m.closeH || (currentHour === m.closeH && currentMin < m.closeM));
    }

    // 周末全部休市
    const weekday = now.getDay();
    if (weekday === 0 || weekday === 6) isOpen = false;

    const dotClass = isOpen ? 'dot open' : 'dot closed';
    const statusText = isOpen ? '交易中' : (weekday === 0 || weekday === 6 ? '周末休市' : '已收盘');
    html += `<div class="market-tag"><span class="${dotClass}"></span> ${m.name} ${statusText}</div>`;
  });

  document.getElementById('market-status-bar').innerHTML = html;
}

// ============ 指数渲染 ============
function renderIndices(data) {
  const container = document.getElementById('indices-container');
  let html = '';

  // 合并所有指数
  const all = [
    ...data.china.map(d => ({ ...d, market: 'CN' })),
    ...data.hk.map(d => ({ ...d, market: 'HK' }))
  ];

  all.forEach(item => {
    const cls = item.change_pct >= 0 ? 'up' : 'down';
    const arrow = item.change_pct >= 0 ? '▲' : '▼';
    const marketClass = `market-${item.market}`;

    html += `
      <div class="index-card">
        <div class="card-top">
          <span class="card-name">${item.name}</span>
          <span class="card-market ${marketClass}">${item.market}</span>
        </div>
        <div class="card-price">${item.price.toFixed(2)}</div>
        <div class="card-change ${cls}">
          ${arrow} ${item.change > 0 ? '+' : ''}${item.change.toFixed(2)}
          &nbsp;(${item.change_pct > 0 ? '+' : ''}${item.change_pct.toFixed(2)}%)
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============ 板块渲染 ============
function renderSectors(data) {
  if (!data || data.length === 0) {
    document.getElementById('sector-top').innerHTML =
      '<div class="sector-row" style="justify-content:center;color:var(--text-muted)">暂无数据，服务器未连接</div>';
    document.getElementById('sector-bottom').innerHTML =
      '<div class="sector-row" style="justify-content:center;color:var(--text-muted)">暂无数据，服务器未连接</div>';
    return;
  }

  // 按涨跌幅排序
  const sorted = [...data].sort((a, b) => b.change_pct - a.change_pct);
  const top10 = sorted.slice(0, 10);
  const bottom10 = sorted.slice(-10).reverse();

  function renderList(items, type) {
    return items.map((item, i) => {
      const cls = item.change_pct >= 0 ? 'up' : 'down';
      const pctStr = (item.change_pct > 0 ? '+' : '') + item.change_pct.toFixed(2) + '%';
      const maxBarWidth = 80; // max percentage bar width
      const barWidth = Math.min(Math.abs(item.change_pct) / 2 * 100, maxBarWidth);

      return `
        <div class="sector-row">
          <span class="rank ${type === 'top' ? 'rank-top' : 'rank-bottom'}">${i + 1}</span>
          <span class="name">${item.name}</span>
          <div class="bar-wrap">
            <div class="bar ${cls}" style="width:${barWidth}%"></div>
          </div>
          <span class="pct ${cls}">${pctStr}</span>
        </div>
      `;
    }).join('');
  }

  document.getElementById('sector-top').innerHTML = renderList(top10, 'top');
  document.getElementById('sector-bottom').innerHTML = renderList(bottom10, 'bottom');
}

// ============ 新闻渲染 ============
function renderNews(news) {
  const container = document.getElementById('news-container');
  if (!news || news.length === 0) {
    container.innerHTML = '<div class="loading-placeholder" style="grid-column:1/-1">暂无新闻数据</div>';
    return;
  }

  container.innerHTML = news.map(item => {
    const tags = extractTags(item.title);
    return `
      <div class="news-card">
        <div class="news-header">
          <span class="news-source">${item.source || '财经'}</span>
          <span class="news-time">${formatTime(item.displayTime || item.time || item.date)}</span>
        </div>
        <div class="news-title">
          <a href="${item.url || '#'}" target="_blank">${item.title || item.digest || '无标题'}</a>
        </div>
        ${item.digest ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${item.digest.substring(0, 80)}...</div>` : ''}
        <div class="news-tags">
          ${tags.map(t => `<span class="news-tag">${t}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function extractTags(title) {
  const tagMap = {
    '政策': '政策', '央行': '央行', '降准': '降准', '降息': '降息',
    'AI': 'AI', '芯片': '芯片', '科技': '科技', '新能源': '新能源',
    '地产': '地产', '消费': '消费', '金融': '金融', '军工': '军工',
    '港股': '港股', '美股': '美股', '外资': '外资', '北向': '北向',
    '营收': '财报', '利润': '财报', '财报': '财报',
  };
  const tags = [];
  for (const [key, val] of Object.entries(tagMap)) {
    if (title.includes(key) && !tags.includes(val)) tags.push(val);
  }
  return tags.length > 0 ? tags : ['综合'];
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return d.toLocaleDateString('zh-CN');
  } catch { return ts; }
}

// ============ 大佬观点渲染 ============
function renderInfluencers(data) {
  const container = document.getElementById('influencers-container');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="loading-placeholder" style="grid-column:1/-1">暂无数据</div>';
    return;
  }

  container.innerHTML = data.map(item => {
    const sentimentClass = item.sentiment === '乐观' ? 'sentiment-bullish' :
                           item.sentiment === '谨慎' ? 'sentiment-bearish' : 'sentiment-neutral';
    const tags = (item.tags || []).map(t => `<span class="news-tag">${t}</span>`).join('');

    return `
      <div class="influencer-card">
        <div class="inf-header">
          <div class="avatar">${item.name.charAt(0)}</div>
          <div>
            <div class="inf-name">${item.name}</div>
            <div class="inf-source">${item.source || ''}</div>
          </div>
        </div>
        <div class="inf-quote">"${item.quote || item.title || ''}"</div>
        <div class="inf-footer">
          <span class="inf-date">${item.date || ''}</span>
          <div class="news-tags">
            <span class="sentiment-tag ${sentimentClass}">${item.sentiment || '中性'}</span>
            ${tags}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============ 自选股 ============
function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem('invest_watchlist') || '[]');
  } catch { return []; }
}

function saveWatchlist(list) {
  localStorage.setItem('invest_watchlist', JSON.stringify(list));
}

function renderWatchlist() {
  const container = document.getElementById('watchlist-container');
  const list = getWatchlist();
  if (list.length === 0) {
    container.innerHTML = '<div class="loading-placeholder">暂无自选股，点击 + 添加 →</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="index-card" data-code="${item.code}">
      <div class="card-top">
        <span class="card-name">${item.name || item.code}</span>
        <button onclick="removeWatchlist('${item.code}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:0 4px">✕</button>
      </div>
      <div class="card-price" id="wl-price-${item.code}">--</div>
      <div class="card-change neutral" id="wl-change-${item.code}">--</div>
    </div>
  `).join('');
}

function showAddModal() {
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('stock-code-input').value = '';
  document.getElementById('stock-code-input').focus();
}

function hideAddModal() {
  document.getElementById('add-modal').classList.remove('show');
}

function addWatchlistStock() {
  const input = document.getElementById('stock-code-input').value.trim();
  if (!input) return;

  let code, name, market;
  if (/^\d{6}$/.test(input)) {
    code = 'sh' + input;
    name = input;
    market = 'CN';
  } else if (/^\d{5}$/.test(input)) {
    code = 'hk' + input;
    name = input;
    market = 'HK';
  } else {
    code = input.toLowerCase();
    name = input;
    market = 'US';
  }

  const list = getWatchlist();
  if (list.find(s => s.code === code)) {
    alert('已存在');
    return;
  }

  list.push({ code, name, market });
  saveWatchlist(list);
  renderWatchlist();
  hideAddModal();
}

function removeWatchlist(code) {
  let list = getWatchlist().filter(s => s.code !== code);
  saveWatchlist(list);
  renderWatchlist();
}

// ============ 数据刷新 ============
async function fetchAPI(path) {
  try {
    const resp = await fetch(`${API}${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.error(`API error: ${path}`, e);
    return null;
  }
}

async function loadIndices() {
  const data = await fetchAPI('/api/indices');
  if (data) renderIndices(data);
}

async function loadSectors() {
  const data = await fetchAPI('/api/sectors');
  if (data) renderSectors(data);
}

async function loadNews() {
  const data = await fetchAPI('/api/news');
  if (data) renderNews(data);
}

async function loadInfluencers() {
  const data = await fetchAPI('/api/influencers');
  if (data) renderInfluencers(data);
}

async function refreshAll() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('loading');

  await Promise.all([loadIndices(), loadSectors(), loadNews(), loadInfluencers()]);

  btn.classList.remove('loading');
}

// ============ 初始化 ============
async function init() {
  updateClock();
  updateMarketStatus();
  clockTimer = setInterval(updateClock, 1000);
  setInterval(updateMarketStatus, 60000);
  renderWatchlist();

  await refreshAll();

  // 每30秒自动刷新（交易时段），每5分钟非交易时段
  refreshTimer = setInterval(refreshAll, 30 * 1000);
}

// 回车键添加自选股
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('stock-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addWatchlistStock();
    if (e.key === 'Escape') hideAddModal();
  });
  init();
});

// 快捷键
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    refreshAll();
  }
});
