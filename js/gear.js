/* ============================================================
   装备库系统模块
   底部快捷装备栏 + 左侧装备图鉴面板
   ============================================================ */

const GearModule = (function() {
  let activeCategory = '全部';
  let expandedGearId = null;

  // 初始化（绑定一次性事件委托）
  function init() {
    renderQuickBar();
    renderCollectionPanel();
    bindGearPanelEvents();
    bindQuickBarEvents();
  }

  // 绑定装备图鉴面板事件委托（仅执行一次）
  function bindGearPanelEvents() {
    const panel = document.getElementById('gear-collection-panel');
    if (!panel) return;

    panel.addEventListener('click', function(e) {
      // 关闭按钮
      if (e.target.id === 'gear-panel-close' || e.target.closest('#gear-panel-close')) {
        closePanel();
        return;
      }

      // 分类标签
      const tab = e.target.closest('.category-tab');
      if (tab) {
        const category = tab.dataset.category;
        activeCategory = category;
        expandedGearId = null;
        renderCollectionPanel();
        return;
      }

      // 装备卡片点击（展开/折叠）
      const card = e.target.closest('.gear-card');
      if (card && !e.target.closest('.gear-route-item')) {
        const gearId = card.dataset.gearId;
        if (expandedGearId === gearId) {
          expandedGearId = null;
        } else {
          expandedGearId = gearId;
        }
        renderCollectionPanel();
        return;
      }

      // 装备足迹中的路线点击
      const routeItem = e.target.closest('.gear-route-item');
      if (routeItem) {
        const routeId = routeItem.dataset.routeId;
        closePanel();
        if (typeof App !== 'undefined' && App.openRoutePanel) {
          App.openRoutePanel(routeId);
        }
        return;
      }
    });
  }

  // 绑定快捷装备栏事件
  function bindQuickBarEvents() {
    const quickBar = document.getElementById('quick-gear-bar');
    if (!quickBar) return;

    quickBar.addEventListener('click', function(e) {
      const slot = e.target.closest('.gear-slot');
      if (slot) {
        const gearId = slot.dataset.gearId;
        openPanel(gearId);
        return;
      }

      if (e.target.closest('.view-all-btn')) {
        openPanel();
        return;
      }
    });
  }

  // 渲染底部快捷装备栏
  function renderQuickBar() {
    const bar = document.getElementById('quick-gear-bar');
    if (!bar) return;

    // 取前6件装备作为快捷栏主力装备
    const quickGears = gears.slice(0, 6);

    bar.innerHTML = `
      ${quickGears.map(g => `
        <div class="gear-slot" data-gear-id="${g.id}">
          <img src="${g.image}" alt="${g.name}" loading="lazy"
               onerror="this.style.display='none';this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#5f6368\\' stroke-width=\\'1.5\\' style=\\'width:20px;height:20px\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/></svg>'">
          <div class="gear-tooltip">${g.name}</div>
        </div>
      `).join('')}
      <div class="gear-divider"></div>
      <button class="view-all-btn">查看全部</button>
    `;
  }

  // 渲染装备图鉴面板
  function renderCollectionPanel() {
    const panel = document.getElementById('gear-collection-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="gear-content">
        <div class="panel-title">装备图鉴</div>
        <div class="category-tabs">
          <button class="category-tab ${activeCategory === '全部' ? 'active' : ''}" data-category="全部">全部</button>
          ${gearCategories.map(cat => `
            <button class="category-tab ${activeCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</button>
          `).join('')}
        </div>
        <div class="gear-list" id="gear-list"></div>
      </div>
      <button class="panel-close" id="gear-panel-close">&times;</button>
    `;

    renderGearList();
  }

  // 渲染装备列表
  function renderGearList() {
    const list = document.getElementById('gear-list');
    if (!list) return;

    const filtered = activeCategory === '全部'
      ? gears
      : gears.filter(g => g.category === activeCategory);

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--text-tertiary); font-size: 13px;">
          该分类暂无装备<br><span style="font-size:11px; opacity:0.6;">待解锁</span>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(g => {
      const isExpanded = expandedGearId === g.id;
      const tierClass = g.tier === '传奇' ? 'tier-legendary' : g.tier === '主力' ? 'tier-main' : '';
      const gearRoutes = getRoutesByGearId(g.id);

      return `
        <div class="gear-card ${isExpanded ? 'expanded' : ''}" data-gear-id="${g.id}">
          <div class="gear-card-header">
            <img class="gear-card-img" src="${g.image}" alt="${g.name}" loading="lazy"
                 onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div style=\\'width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.04);flex-shrink:0\\'></div>')">
            <div class="gear-card-info">
              <div class="gear-card-name">${g.name}</div>
              <div class="gear-card-meta">${g.category} · ${g.weight}kg · ${g.purchaseDate}入手</div>
            </div>
            <span class="gear-card-tier ${tierClass}">${g.tier}</span>
          </div>
          <div class="gear-detail">
            <img class="gear-detail-image" src="${g.image}" alt="${g.name}" loading="lazy">
            <div class="gear-detail-stats">
              <div class="gear-detail-stat">
                <div class="stat-label">重量</div>
                <div class="stat-value">${g.weight} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">kg</span></div>
              </div>
              <div class="gear-detail-stat">
                <div class="stat-label">使用次数</div>
                <div class="stat-value">${g.usageCount} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">次</span></div>
              </div>
              <div class="gear-detail-stat">
                <div class="stat-label">累计陪伴里程</div>
                <div class="stat-value">${g.totalMileage} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">km</span></div>
              </div>
              <div class="gear-detail-stat">
                <div class="stat-label">入手时间</div>
                <div class="stat-value">${g.purchaseDate}</div>
              </div>
            </div>
            <div class="gear-detail-notes">${g.notes}</div>
            ${gearRoutes.length > 0 ? `
              <div class="gear-detail-routes">
                <div class="sub-title">探险足迹</div>
                ${gearRoutes.map(route => `
                  <div class="gear-route-item" data-route-id="${route.id}">
                    <span class="route-name">${route.name}</span>
                    <span class="route-date">${route.date}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // 打开装备图鉴面板
  function openPanel(gearId) {
    const panel = document.getElementById('gear-collection-panel');
    if (!panel) return;

    if (gearId) {
      // 找到装备所属分类
      const gear = getGearById(gearId);
      if (gear) {
        activeCategory = gear.category;
        expandedGearId = gearId;
      }
    }

    renderCollectionPanel();
    panel.classList.add('open');
  }

  // 关闭装备图鉴面板
  function closePanel() {
    const panel = document.getElementById('gear-collection-panel');
    if (panel) {
      panel.classList.remove('open');
    }
  }

  // 检查面板是否打开
  function isOpen() {
    const panel = document.getElementById('gear-collection-panel');
    return panel && panel.classList.contains('open');
  }

  return {
    init,
    openPanel,
    closePanel,
    isOpen
  };
})();