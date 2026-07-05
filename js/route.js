/* ============================================================
   路线详情面板模块
   右侧滑出面板 + 路线内容渲染 + 多路线选择
   ============================================================ */

const RouteModule = (function() {
  let currentRouteId = null;
  var ROUTE_STATS_KEY = 'adventure_diary_route_stats';
  var ROUTE_RATINGS_KEY = 'adventure_diary_route_ratings';
  var routeStatsOverrides = {};
  var routeRatingsOverrides = {};

  try {
    var savedStats = localStorage.getItem(ROUTE_STATS_KEY);
    if (savedStats) routeStatsOverrides = JSON.parse(savedStats) || {};
  } catch(e) { routeStatsOverrides = {}; }

  try {
    var savedRatings = localStorage.getItem(ROUTE_RATINGS_KEY);
    if (savedRatings) routeRatingsOverrides = JSON.parse(savedRatings) || {};
  } catch(e) { routeRatingsOverrides = {}; }

  function saveRouteStats() {
    try { localStorage.setItem(ROUTE_STATS_KEY, JSON.stringify(routeStatsOverrides)); } catch(e) {}
  }

  function saveRouteRatings() {
    try { localStorage.setItem(ROUTE_RATINGS_KEY, JSON.stringify(routeRatingsOverrides)); } catch(e) {}
  }

  function getRouteStats(route) {
    if (!route) return { distance: 0, elevation: 0, maxAltitude: 0, difficultyLabel: '' };
    var overrides = routeStatsOverrides[route.id] || {};
    return {
      distance: overrides.distance !== undefined ? overrides.distance : route.distance,
      elevation: overrides.elevation !== undefined ? overrides.elevation : route.elevation,
      maxAltitude: overrides.maxAltitude !== undefined ? overrides.maxAltitude : route.maxAltitude,
      difficultyLabel: overrides.difficultyLabel !== undefined ? overrides.difficultyLabel : route.difficultyLabel
    };
  }

  function getRouteRatings(route) {
    if (!route) return { scenery: 3, difficulty: 1 };
    var overrides = routeRatingsOverrides[route.id] || {};
    var defaultScenery = route.scenery !== undefined ? route.scenery : route.difficulty;
    return {
      scenery: overrides.scenery !== undefined ? overrides.scenery : defaultScenery,
      difficulty: overrides.difficulty !== undefined ? overrides.difficulty : route.difficulty
    };
  }

  function setRouteRating(routeId, field, value) {
    if (!routeRatingsOverrides[routeId]) routeRatingsOverrides[routeId] = {};
    routeRatingsOverrides[routeId][field] = value;
    saveRouteRatings();
  }

  function setRouteStat(routeId, field, value) {
    if (!routeStatsOverrides[routeId]) routeStatsOverrides[routeId] = {};
    routeStatsOverrides[routeId][field] = value;
    saveRouteStats();
  }

  function init() {
    bindEvents();
    if (typeof ThreeMap !== 'undefined' && ThreeMap.setOnTrailChangedCallback) {
      ThreeMap.setOnTrailChangedCallback(function() {
        if (currentRouteId) {
          renderTrailSelector();
        }
      });
    }
  }

  function getTrailsForRoute(route) {
    if (!route || !route.terrain) return [];
    if (typeof ThreeMap !== 'undefined' && ThreeMap.getViewMode && ThreeMap.getViewMode() === 'mountain' && ThreeMap.getAllTrails) {
      var all = ThreeMap.getAllTrails();
      return all.map(function(t) {
        return { id: t.id, name: t.name, originalName: t.originalName, direction: t.direction || 1, isDefault: !!t.isDefault, completed: !!t.completed };
      });
    }
    var defaults = [];
    if (route.terrain.trails && route.terrain.trails.length > 0) {
      defaults = route.terrain.trails.map(function(t, idx) {
        return { id: t.id, name: t.name, direction: t.direction || 1, isDefault: true, completed: idx === 0 };
      });
    } else if (route.terrain.trailPoints && route.terrain.trailPoints.length > 0) {
      defaults = [{ id: 'default', name: '默认路线', direction: 1, isDefault: true, completed: true }];
    }
    return defaults;
  }

  function getActiveTrailId() {
    if (typeof ThreeMap !== 'undefined' && ThreeMap.getViewMode && ThreeMap.getViewMode() === 'mountain' && ThreeMap.getActiveTrail) {
      var active = ThreeMap.getActiveTrail();
      return active ? active.id : null;
    }
    return null;
  }

  function getTrailDirection(trailId) {
    if (typeof ThreeMap !== 'undefined' && ThreeMap.getViewMode && ThreeMap.getViewMode() === 'mountain' && ThreeMap.getAllTrails) {
      var all = ThreeMap.getAllTrails();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === trailId) return all[i].direction || 1;
      }
    }
    var route = getRouteById(currentRouteId);
    if (route && route.terrain && route.terrain.trails) {
      for (var j = 0; j < route.terrain.trails.length; j++) {
        if (route.terrain.trails[j].id === trailId) return route.terrain.trails[j].direction || 1;
      }
    }
    return 1;
  }

  function getShortName(name, isDefault, isRenamed) {
    if (!name) return '';
    var maxLen = 10;
    if (!isDefault) {
      var base = name.replace(/^五台山/, '');
      if (base.length > maxLen) return base.substring(0, maxLen);
      return base;
    }
    if (isRenamed) {
      var parenMatch2 = name.match(/^[^（(]+/);
      var base2 = parenMatch2 ? parenMatch2[0].trim() : name;
      if (base2.length > maxLen) return base2.substring(0, maxLen);
      return base2;
    }
    var parenMatch = name.match(/^[^（(]+/);
    var base = parenMatch ? parenMatch[0].trim() : name;
    if (base.indexOf('顺朝') !== -1 || base.indexOf('顺穿') !== -1) {
      if (base.indexOf('大朝台') !== -1) return '大朝台';
      if (base.indexOf('速穿') !== -1 || base.indexOf('一日') !== -1) return '速穿';
      if (base.indexOf('三天两夜') !== -1) return '顺穿';
      return '顺穿';
    }
    if (base.indexOf('逆朝') !== -1 || base.indexOf('逆穿') !== -1) return '逆穿';
    if (base.indexOf('小朝台') !== -1) return '小朝台';
    if (base.indexOf('大朝台') !== -1) return '大朝台';
    if (base.length > maxLen) return base.substring(0, maxLen);
    return base;
  }

  function renderTrailSelector() {
    var container = document.getElementById('trail-selector-section');
    if (!container) return;
    var route = getRouteById(currentRouteId);
    if (!route || !route.terrain) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    var trails = getTrailsForRoute(route);
    var activeId = getActiveTrailId() || (trails.length > 0 ? trails[0].id : null);

    var activeTrail = null;
    for (var i = 0; i < trails.length; i++) {
      if (trails[i].id === activeId) { activeTrail = trails[i]; break; }
    }
    if (!activeTrail && trails.length > 0) activeTrail = trails[0];
    var isCustom = activeTrail ? !activeTrail.isDefault : false;

    var cardsHtml = trails.map(function(t, idx) {
      var isActive = t.id === activeId;
      var statusIcon = t.completed ? '🏆' : '🔒';
      var statusClass = t.completed ? 'completed' : 'locked';
      var isRenamed = !!(t.isDefault && t.originalName && t.name !== t.originalName);
      var isCustom = !t.isDefault;
      var shortName = getShortName(t.name, t.isDefault, isRenamed);
      var trashBtn = '<button class="level-card-trash" data-trail-id="' + t.id + '" title="删除路线">🗑️</button>';
      return (
        '<div class="level-card ' + (isActive ? 'active ' : '') + statusClass + '" data-trail-id="' + t.id + '">' +
          '<div class="level-card-status">' + statusIcon + '</div>' +
          '<div class="level-card-number">LV.' + (idx + 1) + '</div>' +
          '<div class="level-card-name" data-full-name="' + escapeHtml(t.name) + '" title="双击编辑名称">' + escapeHtml(shortName) + '</div>' +
          trashBtn +
        '</div>'
      );
    }).join('');

    container.innerHTML =
      '<div class="level-section-header">' +
        '<span class="level-section-icon">⚔️</span>' +
        '<span class="level-section-title">选择路线</span>' +
        '<span class="level-section-sub">CHAPTER SELECT</span>' +
      '</div>' +
      '<div class="level-cards-container">' + cardsHtml + '</div>' +
      '<div class="level-control-bar">' +
        '<div class="level-current-name" id="level-current-name" title="点击编辑名称">' +
          '<span class="level-current-label">当前路线:</span>' +
          '<span class="level-current-text" data-trail-id="' + (activeTrail ? activeTrail.id : '') + '">' + escapeHtml(activeTrail ? activeTrail.name : '') + '</span>' +
        '</div>' +
        '<div class="level-action-group">' +
          '<button id="trail-dir-btn" class="level-ctrl-btn" title="切换行进方向">' +
            '<span class="ctrl-icon">' + (activeTrail && activeTrail.direction === -1 ? '⬅' : '➡') + '</span>' +
          '</button>' +
          '<button id="trail-complete-btn" class="level-ctrl-btn level-ctrl-trophy" title="标记为已通关">' +
            '<span class="ctrl-icon">' + (activeTrail && activeTrail.completed ? '🏆' : '🔒') + '</span>' +
          '</button>' +
          '<button id="trail-info-btn" class="level-ctrl-btn level-ctrl-info" title="关卡详情">' +
            '<span class="ctrl-icon">ⓘ</span>' +
          '</button>' +
          '<button id="trail-add-btn" class="level-ctrl-btn level-ctrl-add" title="新增自定义路线">+</button>' +
          '<button id="trail-export-btn" class="level-ctrl-btn level-ctrl-export" title="导出路线数据">⬇</button>' +
          '<button id="trail-import-btn" class="level-ctrl-btn level-ctrl-import" title="导入路线数据">⬆</button>' +
          '<input type="file" id="trail-import-file" accept=".json" style="display:none">' +
        '</div>' +
      '</div>' +
      '<div class="level-edit-row" id="trail-edit-row" style="display:none">' +
        '<input type="text" id="trail-name-input" class="level-name-input" value="' + escapeHtml(activeTrail ? activeTrail.name : '') + '" placeholder="输入路线名称...">' +
        '<button id="trail-rename-btn" class="level-edit-btn level-edit-save" title="保存">✓</button>' +
        '<button id="trail-delete-btn" class="level-edit-btn level-edit-del" title="删除">✕</button>' +
      '</div>';

    bindTrailSelectorEvents();
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  var activeEditInput = null;
  var cardClickTimer = null;

  function removeInputSafe(input) {
    if (!input || !input.parentNode) return;
    try {
      if (input.parentNode.contains(input)) {
        input.parentNode.removeChild(input);
      }
    } catch(e) {}
  }

  function cancelInlineEdit() {
    if (!activeEditInput) return;
    var input = activeEditInput;
    activeEditInput = null;
    var placeholder = input._placeholder;
    var originalText = input._originalText || '';
    if (placeholder) {
      try {
        placeholder.textContent = originalText;
        placeholder.style.display = '';
      } catch(e) {}
    }
    removeInputSafe(input);
  }

  function commitInlineEdit(input) {
    if (!input) return;
    var trailId = input._trailId;
    var newName = input.value.trim();
    var placeholder = input._placeholder;
    var originalText = input._originalText || '';
    activeEditInput = null;
    if (placeholder) {
      try { placeholder.style.display = ''; } catch(e) {}
    }
    removeInputSafe(input);
    if (!newName || newName === originalText) {
      return;
    }
    if (typeof ThreeMap !== 'undefined' && ThreeMap.renameTrail) {
      ThreeMap.renameTrail(trailId, newName);
    }
  }

  function startInlineEdit(placeholderEl, trailId, initialValue, selectOnFocus) {
    if (activeEditInput) {
      commitInlineEdit(activeEditInput);
    }
    if (cardClickTimer) { clearTimeout(cardClickTimer); cardClickTimer = null; }
    var card = placeholderEl.closest('.level-card');
    if (card) {
      card.style.overflow = 'visible';
    }
    var input = document.createElement('input');
    input.type = 'text';
    input.value = initialValue || '';
    input.maxLength = 10;
    input.className = 'level-name-edit-input';
    input._placeholder = placeholderEl;
    input._trailId = trailId;
    input._originalText = initialValue || '';
    input._isCardName = !!placeholderEl.classList.contains('level-card-name');
    placeholderEl.style.display = 'none';
    placeholderEl.parentNode.insertBefore(input, placeholderEl.nextSibling);
    activeEditInput = input;
    var commit = function() { commitInlineEdit(input); };
    var cancel = function() {
      if (activeEditInput !== input) return;
      cancelInlineEdit();
    };
    input.addEventListener('mousedown', function(e) {
      e.stopPropagation();
    });
    input.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = initialValue || '';
        cancel();
      }
    });
    input.addEventListener('blur', commit);
    setTimeout(function() {
      input.focus();
      if (selectOnFocus) {
        input.select();
      } else {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 0);
  }

  function bindTrailSelectorEvents() {
    var cards = document.querySelectorAll('.level-card');
    for (var ci = 0; ci < cards.length; ci++) {
      (function(card) {
        card.addEventListener('click', function(e) {
          if (e.target.closest('.level-card-status')) return;
          if (e.target.closest('.level-name-edit-input')) return;
          if (e.target.closest('.level-card-trash')) return;
          var trailId = card.getAttribute('data-trail-id');
          if (!trailId) return;
          var wasActive = card.classList.contains('active');
          if (typeof ThreeMap !== 'undefined' && ThreeMap.setActiveTrail) {
            ThreeMap.setActiveTrail(trailId);
          }
          if (cardClickTimer) { clearTimeout(cardClickTimer); cardClickTimer = null; }
          var clickedName = !!e.target.closest('.level-card-name');
          if (wasActive && !clickedName) {
            (function(tid) {
              cardClickTimer = setTimeout(function() {
                cardClickTimer = null;
                openTrailInfoModal(tid);
              }, 260);
            })(trailId);
          }
        });
        var statusEl = card.querySelector('.level-card-status');
        if (statusEl) {
          statusEl.addEventListener('click', function(e) {
            e.stopPropagation();
            var trailId = card.getAttribute('data-trail-id');
            if (!trailId) return;
            var isCompleted = card.classList.contains('completed');
            if (typeof ThreeMap !== 'undefined' && ThreeMap.setTrailCompleted) {
              ThreeMap.setTrailCompleted(trailId, !isCompleted);
            }
          });
        }
        var trashBtn = card.querySelector('.level-card-trash');
        if (trashBtn) {
          trashBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var trailId = trashBtn.getAttribute('data-trail-id');
            if (!trailId) return;
            var trail = null;
            if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail && ThreeMap.getAllTrails) {
              var all = ThreeMap.getAllTrails();
              for (var ti = 0; ti < all.length; ti++) {
                if (all[ti].id === trailId) { trail = all[ti]; break; }
              }
            }
            if (!trail) return;
            if (confirm('确定要删除路线「' + trail.name + '」吗？此操作不可撤销。')) {
              if (typeof ThreeMap !== 'undefined' && ThreeMap.deleteCustomTrail) {
                ThreeMap.deleteCustomTrail(trailId);
              }
            }
          });
        }
        var nameEl = card.querySelector('.level-card-name');
        if (nameEl) {
          (function(nEl) {
            nEl.addEventListener('dblclick', function(e) {
              e.stopPropagation();
              e.preventDefault();
              var trailId = card.getAttribute('data-trail-id');
              if (!trailId) return;
              var fullName = nEl.getAttribute('data-full-name') || nEl.textContent;
              startInlineEdit(nEl, trailId, fullName, true);
            });
          })(nameEl);
        }
      })(cards[ci]);
    }

    var dirBtn = document.getElementById('trail-dir-btn');
    if (dirBtn) {
      dirBtn.addEventListener('click', function() {
        var active = null;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail) {
          active = ThreeMap.getActiveTrail();
        }
        if (!active) return;
        var newDir = active.direction === 1 ? -1 : 1;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.setTrailDirection) {
          ThreeMap.setTrailDirection(active.id, newDir);
        }
      });
    }

    var completeBtn = document.getElementById('trail-complete-btn');
    if (completeBtn) {
      completeBtn.addEventListener('click', function() {
        var active = null;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail) {
          active = ThreeMap.getActiveTrail();
        }
        if (!active) return;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.setTrailCompleted) {
          ThreeMap.setTrailCompleted(active.id, !active.completed);
        }
      });
    }

    var trailInfoBtn = document.getElementById('trail-info-btn');
    if (trailInfoBtn) {
      trailInfoBtn.addEventListener('click', function() {
        var active = null;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail) {
          active = ThreeMap.getActiveTrail();
        }
        if (active) openTrailInfoModal(active.id);
      });
    }

    var addBtn = document.getElementById('trail-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var name = prompt('⚔️ 输入新关卡名称：', '新路线');
        if (name && name.trim()) {
          if (typeof ThreeMap !== 'undefined' && ThreeMap.addCustomTrail) {
            ThreeMap.addCustomTrail(name.trim());
          }
        }
      });
    }

    var exportBtn = document.getElementById('trail-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        if (typeof ThreeMap === 'undefined' || !ThreeMap.exportAllRouteData) {
          alert('导出功能不可用');
          return;
        }
        var exportData = ThreeMap.exportAllRouteData();
        if (!exportData) {
          alert('导出失败：没有数据可导出');
          return;
        }
        var jsonStr = JSON.stringify(exportData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'adventure_diary_backup_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    var importBtn = document.getElementById('trail-import-btn');
    var importFile = document.getElementById('trail-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', function() {
        importFile.click();
      });
      importFile.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!confirm('导入数据将覆盖当前浏览器中的路线数据，确定继续吗？')) {
          importFile.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function(evt) {
          try {
            var data = JSON.parse(evt.target.result);
            if (typeof ThreeMap !== 'undefined' && ThreeMap.importRouteData) {
              var success = ThreeMap.importRouteData(data);
              if (success) {
                alert('导入成功！页面将刷新以加载新数据。');
                location.reload();
              } else {
                alert('导入失败：数据格式无效');
              }
            }
          } catch(err) {
            alert('导入失败：文件格式错误 - ' + err.message);
          }
          importFile.value = '';
        };
        reader.onerror = function() {
          alert('导入失败：无法读取文件');
          importFile.value = '';
        };
        reader.readAsText(file);
      });
    }

    var currentTextEl = document.querySelector('.level-current-text');
    if (currentTextEl) {
      currentTextEl.addEventListener('click', function(e) {
        e.stopPropagation();
        var trailId = currentTextEl.getAttribute('data-trail-id');
        if (!trailId) {
          var active = null;
          if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail) {
            active = ThreeMap.getActiveTrail();
          }
          if (active) trailId = active.id;
        }
        if (!trailId) return;
        startInlineEdit(currentTextEl, trailId, currentTextEl.textContent, true);
      });
    }

    var deleteBtn = document.getElementById('trail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        var active = null;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.getActiveTrail) {
          active = ThreeMap.getActiveTrail();
        }
        if (!active) return;
        if (!confirm('确定要删除路线「' + active.name + '」吗？此操作不可撤销。')) return;
        if (typeof ThreeMap !== 'undefined' && ThreeMap.deleteCustomTrail) {
          ThreeMap.deleteCustomTrail(active.id);
        }
      });
    }
  }

  function renderRoutePanel(routeId) {
    const panel = document.getElementById('route-panel');
    if (!panel) return;

    const route = getRouteById(routeId);
    if (!route) return;

    currentRouteId = routeId;

    const gears = getGearsByIds(route.gearIds);
    const totalWeight = gears.reduce((sum, g) => sum + g.weight, 0);
    const hasTerrain = !!(route.terrain);
    const stats = getRouteStats(route);
    const ratings = getRouteRatings(route);

    panel.innerHTML = `
      <button class="panel-close" id="route-panel-close">&times;</button>
      <div class="route-content">
        <div class="route-title">${route.name}</div>
        <div class="route-date">${route.date}</div>
        ${renderRatings(ratings, routeId)}

        <div class="route-stats">
          <div class="route-stat-card editable-stat" data-field="distance" data-route-id="${routeId}" title="点击编辑">
            <div><span class="stat-num">${stats.distance}</span><span class="stat-unit">km</span></div>
            <div class="stat-label">里程</div>
          </div>
          <div class="route-stat-card editable-stat" data-field="elevation" data-route-id="${routeId}" title="点击编辑">
            <div><span class="stat-num">${Number(stats.elevation).toLocaleString()}</span><span class="stat-unit">m</span></div>
            <div class="stat-label">累计爬升</div>
          </div>
          <div class="route-stat-card editable-stat" data-field="maxAltitude" data-route-id="${routeId}" title="点击编辑">
            <div><span class="stat-num">${Number(stats.maxAltitude).toLocaleString()}</span><span class="stat-unit">m</span></div>
            <div class="stat-label">最高海拔</div>
          </div>
          <div class="route-stat-card editable-stat" data-field="difficultyLabel" data-route-id="${routeId}" title="点击编辑">
            <div><span class="stat-num">${escapeHtml(stats.difficultyLabel)}</span></div>
            <div class="stat-label">难度等级</div>
          </div>
        </div>

        <div id="trail-selector-section" class="trail-selector-section"></div>

        <div class="route-desc-preview">
          <div class="desc-preview-text">${escapeHtml(route.description.substring(0, 60))}${route.description.length > 60 ? '...' : ''}</div>
          <button class="desc-info-btn" id="route-info-btn" title="查看完整攻略">
            <span class="info-icon">ⓘ</span>
            <span class="info-label">详情</span>
          </button>
        </div>

        ${route.images.length > 0 ? `
          <div class="route-gallery">
            ${route.images.map(img => `
              <img src="${img}" alt="${route.name}" loading="lazy"
                   onclick="RouteModule.openImagePreview('${img}')">
            `).join('')}
          </div>
        ` : ''}

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

    var routeInfoBtn = document.getElementById('route-info-btn');
    if (routeInfoBtn) {
      routeInfoBtn.addEventListener('click', function() {
        if (currentRouteId) openRouteInfoModal(currentRouteId);
      });
    }

    if (hasTerrain) {
      renderTrailSelector();
    }
  }

  function renderStar(count, filled, interactive, routeId, field, starIndex) {
    var goldColor = '#ffd700';
    var emptyColor = '#555';
    var fillColor = filled ? goldColor : 'none';
    var strokeColor = filled ? goldColor : emptyColor;
    var className = filled ? 'filled' : 'empty';
    if (interactive) className += ' interactive-star';
    var dataAttrs = interactive ? ' data-route-id="' + routeId + '" data-field="' + field + '" data-value="' + starIndex + '"' : '';
    return '<svg viewBox="0 0 24 24" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="1.5" class="' + className + '"' + dataAttrs + '>' +
      '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
    '</svg>';
  }

  function renderStars(count, interactive, routeId, field) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const filled = i <= count;
      html += renderStar(count, filled, interactive, routeId, field, i);
    }
    return html;
  }

  function renderRatingRow(label, count, routeId, field) {
    return '<div class="rating-row">' +
      '<span class="rating-label">' + label + '</span>' +
      '<div class="rating-stars">' + renderStars(count, true, routeId, field) + '</div>' +
    '</div>';
  }

  function renderRatings(ratings, routeId) {
    return '<div class="route-ratings">' +
      renderRatingRow('风景', ratings.scenery, routeId, 'scenery') +
      renderRatingRow('难度', ratings.difficulty, routeId, 'difficulty') +
    '</div>';
  }

  function bindEvents() {
    document.addEventListener('click', function(e) {
      if (e.target.id === 'route-panel-close') {
        closePanel();
        return;
      }
      var starEl = e.target.closest('.interactive-star');
      if (starEl) {
        var routeId = starEl.getAttribute('data-route-id');
        var field = starEl.getAttribute('data-field');
        var value = parseInt(starEl.getAttribute('data-value'), 10);
        if (routeId && field && !isNaN(value)) {
          setRouteRating(routeId, field, value);
          var route = getRouteById(routeId);
          if (route) {
            var ratings = getRouteRatings(route);
            var starsContainer = starEl.closest('.rating-stars');
            if (starsContainer) {
              var newHtml = renderStars(ratings[field], true, routeId, field);
              starsContainer.innerHTML = newHtml;
            }
          }
        }
        return;
      }
      const gearItem = e.target.closest('.route-gear-item');
      if (gearItem) {
        const gearId = gearItem.dataset.gearId;
        if (gearId) {
          GearModule.openPanel(gearId);
        }
        return;
      }
      var statCard = e.target.closest('.editable-stat');
      if (statCard) {
        var field = statCard.getAttribute('data-field');
        var rId = statCard.getAttribute('data-route-id');
        if (field && rId) {
          startEditStat(statCard, rId, field);
        }
        return;
      }
    });
  }

  function startEditStat(card, routeId, field) {
    if (card.classList.contains('editing')) return;
    var route = getRouteById(routeId);
    if (!route) return;
    var stats = getRouteStats(route);
    var currentVal = stats[field];
    var numEl = card.querySelector('.stat-num');
    var unitEl = card.querySelector('.stat-unit');
    var labelEl = card.querySelector('.stat-label');
    if (!numEl) return;

    var isNumeric = (field !== 'difficultyLabel');
    var displayVal = isNumeric ? String(currentVal).replace(/,/g, '') : currentVal;
    var unitText = unitEl ? unitEl.textContent : '';
    var labelText = labelEl ? labelEl.textContent : '';

    card.classList.add('editing');
    var originalHTML = card.innerHTML;

    var input = document.createElement('input');
    input.type = isNumeric ? 'number' : 'text';
    input.className = 'stat-edit-input';
    input.value = displayVal;
    if (isNumeric) {
      input.step = field === 'distance' ? '0.1' : '1';
      input.min = '0';
    } else {
      input.maxLength = 10;
    }

    card.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';
    var valWrap = document.createElement('div');
    valWrap.style.cssText = 'display:flex;align-items:baseline;gap:2px;width:100%;justify-content:center;';
    valWrap.appendChild(input);
    if (unitText) {
      var unitSpan = document.createElement('span');
      unitSpan.className = 'stat-unit';
      unitSpan.textContent = unitText;
      valWrap.appendChild(unitSpan);
    }
    wrap.appendChild(valWrap);
    var lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    card.appendChild(wrap);

    setTimeout(function() { input.focus(); input.select(); }, 10);

    function finishEdit(save) {
      if (!card.classList.contains('editing')) return;
      card.classList.remove('editing');
      if (save) {
        var newVal = input.value.trim();
        if (newVal !== '') {
          if (isNumeric) {
            var numVal = parseFloat(newVal);
            if (!isNaN(numVal) && numVal >= 0) {
              setRouteStat(routeId, field, numVal);
            }
          } else {
            if (newVal.length > 0) {
              setRouteStat(routeId, field, newVal);
            }
          }
        }
      }
      renderRoutePanel(routeId);
    }

    input.addEventListener('blur', function() { finishEdit(true); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    });
    input.addEventListener('click', function(e) { e.stopPropagation(); });
    input.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  }

  function openPanel(routeId) {
    const panel = document.getElementById('route-panel');
    if (!panel) return;
    renderRoutePanel(routeId);
    panel.classList.add('open');
  }

  function closePanel() {
    const panel = document.getElementById('route-panel');
    if (panel) {
      panel.classList.remove('open');
    }
    currentRouteId = null;
    MapModule.resetView();
  }

  function openImagePreview(src) {
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <button class="overlay-close">&times;</button>
      <img src="${src}" alt="预览图片" onclick="event.stopPropagation()">
    `;
    overlay.classList.add('visible');
    overlay.querySelector('.overlay-close').addEventListener('click', closeImagePreview);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeImagePreview();
    });
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
      closeInfoModal();
    }
  }

  function isOpen() {
    const panel = document.getElementById('route-panel');
    return panel && panel.classList.contains('open');
  }

  function refreshTrailSelector() {
    if (currentRouteId) {
      renderTrailSelector();
    }
  }

  function openInfoModal(htmlContent, opts) {
    opts = opts || {};
    var modal = document.getElementById('info-modal');
    if (!modal) return;
    var title = opts.title || '详情';
    var icon = opts.icon || '📜';
    var accentClass = opts.accent || 'gold';
    modal.innerHTML =
      '<div class="info-modal-backdrop" id="info-modal-backdrop"></div>' +
      '<div class="info-modal-panel info-modal-' + accentClass + '">' +
        '<button class="info-modal-close" id="info-modal-close">&times;</button>' +
        '<div class="info-modal-header">' +
          '<span class="info-modal-icon">' + icon + '</span>' +
          '<span class="info-modal-title">' + escapeHtml(title) + '</span>' +
        '</div>' +
        '<div class="info-modal-body">' + htmlContent + '</div>' +
        '<div class="info-modal-footer">' +
          '<button class="info-modal-btn" id="info-modal-ok">确认</button>' +
        '</div>' +
      '</div>';
    modal.classList.add('visible');
    requestAnimationFrame(function() {
      var panel = modal.querySelector('.info-modal-panel');
      if (panel) panel.classList.add('in');
    });
    var close1 = document.getElementById('info-modal-close');
    var close2 = document.getElementById('info-modal-ok');
    var backdrop = document.getElementById('info-modal-backdrop');
    if (close1) close1.addEventListener('click', closeInfoModal);
    if (close2) close2.addEventListener('click', closeInfoModal);
    if (backdrop) backdrop.addEventListener('click', closeInfoModal);
  }

  function closeInfoModal() {
    var modal = document.getElementById('info-modal');
    if (!modal) return;
    var panel = modal.querySelector('.info-modal-panel');
    if (panel) panel.classList.remove('in');
    setTimeout(function() {
      modal.classList.remove('visible');
      modal.innerHTML = '';
    }, 200);
  }

  function openRouteInfoModal(routeId) {
    var route = getRouteById(routeId);
    if (!route) return;
    var stats = getRouteStats(route);
    var ratings = getRouteRatings(route);
    var ratingsHtml =
      '<div class="info-ratings-row">' +
        '<div class="info-rating-item"><span class="info-rating-label">风景</span><span class="info-rating-stars">' + renderStars(ratings.scenery, false) + '</span></div>' +
        '<div class="info-rating-item"><span class="info-rating-label">难度</span><span class="info-rating-stars">' + renderStars(ratings.difficulty, false) + '</span></div>' +
      '</div>';
    var statsHtml =
      '<div class="info-stats-row">' +
        '<div class="info-stat"><div class="info-stat-val">' + stats.distance + '<span class="info-stat-unit">km</span></div><div class="info-stat-lbl">里程</div></div>' +
        '<div class="info-stat"><div class="info-stat-val">' + Number(stats.elevation).toLocaleString() + '<span class="info-stat-unit">m</span></div><div class="info-stat-lbl">累计爬升</div></div>' +
        '<div class="info-stat"><div class="info-stat-val">' + Number(stats.maxAltitude).toLocaleString() + '<span class="info-stat-unit">m</span></div><div class="info-stat-lbl">最高海拔</div></div>' +
        '<div class="info-stat"><div class="info-stat-val">' + escapeHtml(stats.difficultyLabel) + '</div><div class="info-stat-lbl">难度等级</div></div>' +
      '</div>';
    var descHtml = '<div class="info-desc">' + escapeHtml(route.description).replace(/\n/g, '<br>') + '</div>';
    openInfoModal(ratingsHtml + statsHtml + descHtml, {
      title: route.name + ' · 攻略详情',
      icon: '🗺️',
      accent: 'gold'
    });
  }

  function openTrailInfoModal(trailId) {
    var trail = null;
    if (typeof ThreeMap !== 'undefined' && ThreeMap.getAllTrails) {
      var all = ThreeMap.getAllTrails();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === trailId) { trail = all[i]; break; }
      }
    }
    if (!trail) return;
    var statusIcon = trail.completed ? '🏆' : '🔒';
    var statusText = trail.completed ? '已通关' : '未解锁';
    var dirText = trail.direction === -1 ? '逆向 ⬅' : '顺向 ➡';
    var pointsList = (trail.points || []).map(function(p, idx) {
      return '<div class="info-point-item">' +
        '<span class="info-point-dot"></span>' +
        '<span class="info-point-idx">' + (idx + 1) + '</span>' +
        '<span class="info-point-name">' + escapeHtml(p.name || ('点' + (idx + 1))) + '</span>' +
      '</div>';
    }).join('');
    var contentHtml =
      '<div class="info-trail-banner ' + (trail.completed ? 'completed' : 'locked') + '">' +
        '<span class="info-trail-status">' + statusIcon + ' ' + statusText + '</span>' +
        '<span class="info-trail-dir">' + dirText + '</span>' +
        (trail.isDefault ? '' : '<span class="info-trail-custom">✏️ 自定义</span>') +
      '</div>' +
      '<div class="info-section-title">途经点位</div>' +
      '<div class="info-points-list">' + pointsList + '</div>';
    openInfoModal(contentHtml, {
      title: trail.name,
      icon: trail.completed ? '🏆' : '⚔️',
      accent: trail.completed ? 'gold' : 'steel'
    });
  }

  return {
    init,
    openPanel,
    closePanel,
    openImagePreview,
    isOpen,
    refreshTrailSelector
  };
})();
