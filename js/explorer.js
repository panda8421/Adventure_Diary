/* ============================================================
   探险者角色面板模块
   左上角状态栏 + 星级筛选器
   ============================================================ */

const ExplorerModule = (function() {
  let currentFilter = 0;

  // 初始化面板
  function init() {
    renderExplorerPanel();
    bindFilterEvents();
  }

  // 渲染探险者面板
  function renderExplorerPanel() {
    const panel = document.getElementById('explorer-panel');
    if (!panel) return;

    const rank = getExplorerRank();
    const totalDist = getTotalDistance();
    const totalElev = getTotalElevation();
    const peakCount = routes.length;

    // 计算阶位进度
    const rankProgress = getRankProgress(rank);

    panel.innerHTML = `
      <div class="explorer-header">
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
          </svg>
          <!-- 头像占位：替换为真实头像图片 -->
          <!-- <img src="avatar.jpg" alt="avatar" /> -->
        </div>
        <div class="explorer-info">
          <div class="title">山野行者</div>
          <div class="rank">${rank.name}</div>
        </div>
      </div>

      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">累计里程</span>
          <span><span class="stat-value">${totalDist}</span><span class="stat-unit">km</span></span>
        </div>
        <div class="stat-item">
          <span class="stat-label">累计爬升</span>
          <span><span class="stat-value">${totalElev.toLocaleString()}</span><span class="stat-unit">m</span></span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已解锁山峰</span>
          <span><span class="stat-value">${peakCount}</span><span class="stat-unit">座</span></span>
        </div>
      </div>

      <div class="rank-badge">
        <span class="rank-icon">${getRankIcon(rank.level)}</span>
        <span class="rank-text">${rank.name}</span>
        <div class="rank-progress">
          <div class="rank-progress-fill" style="width: ${rankProgress}%"></div>
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-label">难度筛选</div>
        <div class="star-filters">
          <button class="star-filter-btn all-btn active" data-star="0">全部</button>
          ${[1,2,3,4,5].map(s => `
            <button class="star-filter-btn" data-star="${s}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 22h20L12 2z"/>
              </svg>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 绑定筛选器事件
  function bindFilterEvents() {
    const panel = document.getElementById('explorer-panel');
    if (!panel) return;

    panel.addEventListener('click', function(e) {
      const btn = e.target.closest('.star-filter-btn');
      if (!btn) return;

      const star = parseInt(btn.dataset.star);

      // 更新按钮状态
      panel.querySelectorAll('.star-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 触发筛选
      currentFilter = star;
      MapModule.filterByStar(star);
    });
  }

  // 获取阶位图标
  function getRankIcon(level) {
    const icons = { 1: '🏔️', 2: '⛰️', 3: '🗻', 4: '🌋' };
    return icons[level] || '🏔️';
  }

  // 获取阶位进度百分比
  function getRankProgress(rank) {
    const levels = {
      1: { min: 0, max: 60 },
      2: { min: 60, max: 150 },
      3: { min: 150, max: 300 },
      4: { min: 300, max: 500 }
    };

    const totalDist = getTotalDistance();
    const range = levels[rank.level];
    if (!range) return 100;

    const progress = ((totalDist - range.min) / (range.max - range.min)) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  // 更新面板数据
  function update() {
    renderExplorerPanel();
    bindFilterEvents();
  }

  return {
    init,
    update
  };
})();