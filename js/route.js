/* ============================================================
   路线详情面板模块
   右侧滑出面板 + 路线内容渲染
   ============================================================ */

const RouteModule = (function() {
  let currentRouteId = null;

  // 初始化
  function init() {
    bindEvents();
  }

  // 渲染路线详情面板
  function renderRoutePanel(routeId) {
    const panel = document.getElementById('route-panel');
    if (!panel) return;

    const route = getRouteById(routeId);
    if (!route) return;

    currentRouteId = routeId;

    const gears = getGearsByIds(route.gearIds);
    const totalWeight = gears.reduce((sum, g) => sum + g.weight, 0);

    panel.innerHTML = `
      <button class="panel-close" id="route-panel-close">&times;</button>
      <div class="route-content">
        <!-- 标题区 -->
        <div class="route-title">${route.name}</div>
        <div class="route-date">${route.date}</div>
        <div class="route-stars">
          ${renderStars(route.difficulty)}
        </div>

        <!-- 数据栏 -->
        <div class="route-stats">
          <div class="route-stat-card">
            <div><span class="stat-num">${route.distance}</span><span class="stat-unit">km</span></div>
            <div class="stat-label">里程</div>
          </div>
          <div class="route-stat-card">
            <div><span class="stat-num">${route.elevation.toLocaleString()}</span><span class="stat-unit">m</span></div>
            <div class="stat-label">累计爬升</div>
          </div>
          <div class="route-stat-card">
            <div><span class="stat-num">${route.maxAltitude.toLocaleString()}</span><span class="stat-unit">m</span></div>
            <div class="stat-label">最高海拔</div>
          </div>
          <div class="route-stat-card">
            <div><span class="stat-num">${route.difficultyLabel}</span></div>
            <div class="stat-label">难度等级</div>
          </div>
        </div>

        <!-- 正文 -->
        <div class="route-description">${route.description}</div>

        <!-- 图集 -->
        ${route.images.length > 0 ? `
          <div class="route-gallery">
            ${route.images.map(img => `
              <img src="${img}" alt="${route.name}" loading="lazy"
                   onclick="RouteModule.openImagePreview('${img}')">
            `).join('')}
          </div>
        ` : ''}

        <!-- 配装区 -->
        <div class="route-gear-section">
          <div class="section-title">本次配装</div>
          <div class="route-gear-list">
            ${gears.map(g => `
              <div class="route-gear-item" data-gear-id="${g.id}">
                ${g.name}
                <span style="font-size:10px;color:var(--text-tertiary)">${g.weight}kg</span>
              </div>
            `).join('')}
          </div>
          ${gears.length > 0 ? `
            <div class="gear-total-weight">总负重约 ${totalWeight.toFixed(2)} kg</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // 渲染星级（山峰轮廓）
  function renderStars(count) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const filled = i <= count;
      html += `
        <svg viewBox="0 0 24 24" fill="${filled ? 'var(--accent)' : 'none'}"
             stroke="${filled ? 'var(--accent)' : 'var(--text-tertiary)'}" stroke-width="1.5"
             class="${filled ? 'filled' : 'empty'}">
          <path d="M12 2L2 22h20L12 2z"/>
        </svg>
      `;
    }
    return html;
  }

  // 绑定事件
  function bindEvents() {
    document.addEventListener('click', function(e) {
      // 关闭按钮
      if (e.target.id === 'route-panel-close') {
        closePanel();
        return;
      }

      // 配装区装备点击
      const gearItem = e.target.closest('.route-gear-item');
      if (gearItem) {
        const gearId = gearItem.dataset.gearId;
        if (gearId) {
          GearModule.openPanel(gearId);
        }
        return;
      }
    });
  }

  // 打开面板
  function openPanel(routeId) {
    const panel = document.getElementById('route-panel');
    if (!panel) return;

    renderRoutePanel(routeId);
    panel.classList.add('open');
  }

  // 关闭面板
  function closePanel() {
    const panel = document.getElementById('route-panel');
    if (panel) {
      panel.classList.remove('open');
    }
    currentRouteId = null;
    MapModule.resetView();
  }

  // 图片预览
  function openImagePreview(src) {
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;

    overlay.innerHTML = `
      <button class="overlay-close">&times;</button>
      <img src="${src}" alt="预览图片" onclick="event.stopPropagation()">
    `;
    overlay.classList.add('visible');

    // 点击关闭
    overlay.querySelector('.overlay-close').addEventListener('click', closeImagePreview);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeImagePreview();
    });

    // ESC 关闭
    document.addEventListener('keydown', handleEscKey);
  }

  function closeImagePreview() {
    const overlay = document.getElementById('image-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
    }
    document.removeEventListener('keydown', handleEscKey);
  }

  function handleEscKey(e) {
    if (e.key === 'Escape') {
      closeImagePreview();
    }
  }

  // 检查面板是否打开
  function isOpen() {
    const panel = document.getElementById('route-panel');
    return panel && panel.classList.contains('open');
  }

  return {
    init,
    openPanel,
    closePanel,
    openImagePreview,
    isOpen
  };
})();