/* ============================================================
   云端同步模块 - 通过Cloudflare Worker同步数据到GitHub
   ============================================================ */

var SyncModule = (function() {
  var SYNC_CONFIG_KEY = 'adventure_diary_sync_config';
  var LAST_SYNC_TIME_KEY = 'adventure_diary_last_sync';
  var DIRTY_KEY = 'adventure_dirty_flags';

  var config = { workerUrl: '', syncKey: '' };
  var dirtyFlags = {};

  function loadConfig() {
    try {
      var saved = localStorage.getItem(SYNC_CONFIG_KEY);
      if (saved) {
        var p = JSON.parse(saved);
        config.workerUrl = p.workerUrl || '';
        config.syncKey = p.syncKey || '';
      }
    } catch(e) {}
    try {
      var f = localStorage.getItem(DIRTY_KEY);
      if (f) dirtyFlags = JSON.parse(f) || {};
    } catch(e) { dirtyFlags = {}; }
  }

  function saveConfig() {
    try { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config)); } catch(e) {}
  }

  function markDirty(type) {
    dirtyFlags[type] = true;
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyFlags)); } catch(e) {}
    updateBtn();
  }

  function clearDirty() {
    dirtyFlags = {};
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyFlags)); } catch(e) {}
    updateBtn();
  }

  function isConfigured() { return !!config.workerUrl; }
  function hasChanges() {
    for (var k in dirtyFlags) { if (dirtyFlags[k]) return true; }
    return false;
  }

  function collectAll() {
    var d = { version: 1, timestamp: Date.now(), routeStats: {}, routeRatings: {}, terrainMods: {} };
    try { var s = localStorage.getItem('adventure_diary_route_stats'); if (s) d.routeStats = JSON.parse(s) || {}; } catch(e) {}
    try { var r = localStorage.getItem('adventure_diary_route_ratings'); if (r) d.routeRatings = JSON.parse(r) || {}; } catch(e) {}
    var prefix = 'taillog_terrain_mod_';
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(prefix) === 0) {
          var rid = key.substring(prefix.length);
          try { var m = localStorage.getItem(key); if (m) d.terrainMods[rid] = JSON.parse(m); } catch(e) {}
        }
      }
    } catch(e) {}
    return d;
  }

  function applyCloud(cloud) {
    if (!cloud) return;
    if (cloud.routeStats) {
      try {
        var ls = {}; try { ls = JSON.parse(localStorage.getItem('adventure_diary_route_stats')) || {}; } catch(e) {}
        localStorage.setItem('adventure_diary_route_stats', JSON.stringify(Object.assign({}, cloud.routeStats, ls)));
      } catch(e) {}
    }
    if (cloud.routeRatings) {
      try {
        var lr = {}; try { lr = JSON.parse(localStorage.getItem('adventure_diary_route_ratings')) || {}; } catch(e) {}
        localStorage.setItem('adventure_diary_route_ratings', JSON.stringify(Object.assign({}, cloud.routeRatings, lr)));
      } catch(e) {}
    }
    if (cloud.terrainMods) {
      var p = 'taillog_terrain_mod_';
      for (var rid in cloud.terrainMods) {
        if (!cloud.terrainMods.hasOwnProperty(rid)) continue;
        try {
          var k = p + rid, lm = null;
          try { var raw = localStorage.getItem(k); if (raw) lm = JSON.parse(raw); } catch(e) {}
          if (!lm || (cloud.timestamp && (!lm.lastSync || cloud.timestamp > lm.lastSync))) {
            localStorage.setItem(k, JSON.stringify(Object.assign({}, cloud.terrainMods[rid], { lastSync: cloud.timestamp })));
          }
        } catch(e) {}
      }
    }
  }

  function toast(msg, err) {
    var t = document.getElementById('sync-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sync-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = err ? 'rgba(220,50,50,0.9)' : 'rgba(30,180,100,0.9)';
    t.style.color = '#fff';
    t.style.opacity = '1';
    setTimeout(function(){ t.style.opacity = '0'; }, 2500);
  }

  function updateBtn() {
    var btn = document.getElementById('sync-cloud-btn');
    if (!btn) return;
    if (hasChanges()) { btn.classList.add('has-changes'); btn.title = '有未同步的更改，点击同步到云端'; }
    else { btn.classList.remove('has-changes'); btn.title = '云同步 (Shift+点击配置)'; }
  }

  async function pull(showMsg) {
    if (!config.workerUrl) return { success: false, error: '未配置' };
    try {
      var url = config.workerUrl.replace(/\/$/, '') + '/api/sync';
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var res = await resp.json();
      if (res.success && res.data) {
        applyCloud(res.data);
        try { localStorage.setItem(LAST_SYNC_TIME_KEY, Date.now().toString()); } catch(e) {}
        if (showMsg) toast('☁️ 已从云端同步最新数据');
        return { success: true };
      } else if (res.success && !res.data) {
        if (showMsg) toast('☁️ 云端暂无数据');
        return { success: true, data: null };
      } else { throw new Error(res.error || '失败'); }
    } catch(e) {
      if (showMsg) toast('❌ 同步失败: ' + e.message, true);
      return { success: false, error: e.message };
    }
  }

  async function push(showMsg) {
    if (!config.workerUrl) return { success: false, error: '未配置' };
    var data = collectAll();
    try {
      var url = config.workerUrl.replace(/\/$/, '') + '/api/sync';
      var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (config.syncKey) h['X-Sync-Key'] = config.syncKey;
      var resp = await fetch(url, {
        method: 'POST', headers: h,
        body: JSON.stringify({ data: data, message: '☁️ Sync: ' + new Date().toLocaleString('zh-CN') })
      });
      var res = await resp.json();
      if (res.success) {
        clearDirty();
        try { localStorage.setItem(LAST_SYNC_TIME_KEY, Date.now().toString()); } catch(e) {}
        if (showMsg) toast('✅ 已同步到云端');
        return res;
      } else { throw new Error(res.error || '失败'); }
    } catch(e) {
      if (showMsg) toast('❌ 同步失败: ' + e.message, true);
      return { success: false, error: e.message };
    }
  }

  async function doSync() {
    var btn = document.getElementById('sync-cloud-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">⏳</span>'; }
    await pull(true);
    if (typeof RouteModule !== 'undefined' && RouteModule.refreshTrailSelector) RouteModule.refreshTrailSelector();
    await push(true);
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '☁️'; }
    updateBtn();
  }

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML;
  }

  function openConfig() {
    closeConfig();
    var lastSync = '';
    try { var ts = localStorage.getItem(LAST_SYNC_TIME_KEY); if (ts) lastSync = new Date(parseInt(ts)).toLocaleString('zh-CN'); } catch(e) {}
    var modal = document.createElement('div');
    modal.className = 'sync-config-modal';
    modal.id = 'sync-config-modal';
    modal.innerHTML =
      '<div class="sync-config-panel" style="position:relative;">' +
        '<div class="sync-config-title">☁️ 云端同步配置</div>' +
        '<div class="sync-config-field"><label class="sync-config-label">Worker URL</label>' +
        '<input type="text" class="sync-config-input" id="sync-worker-url" value="' + escHtml(config.workerUrl) + '" placeholder="https://xxx.workers.dev">' +
        '<div class="sync-config-hint">部署Cloudflare Worker后获得的地址</div></div>' +
        '<div class="sync-config-field"><label class="sync-config-label">同步密钥（可选）</label>' +
        '<input type="password" class="sync-config-input" id="sync-key-input" value="' + escHtml(config.syncKey) + '" placeholder="留空则不启用密钥验证">' +
        '<div class="sync-config-hint">与Worker环境变量SYNC_KEY一致</div></div>' +
        '<div class="sync-status">' + (lastSync ? '上次同步: ' + escHtml(lastSync) : '尚未同步过') + '</div>' +
        '<div class="sync-config-actions">' +
          '<button class="sync-config-btn secondary" id="sync-cancel">取消</button>' +
          '<button class="sync-config-btn secondary" id="sync-pull">仅拉取</button>' +
          '<button class="sync-config-btn primary" id="sync-save">保存并同步</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', closeConfig);
    modal.querySelector('.sync-config-panel').addEventListener('click', function(e){ e.stopPropagation(); });
    document.getElementById('sync-cancel').addEventListener('click', closeConfig);
    document.getElementById('sync-save').addEventListener('click', function(){
      config.workerUrl = document.getElementById('sync-worker-url').value.trim();
      config.syncKey = document.getElementById('sync-key-input').value.trim();
      saveConfig(); closeConfig();
      if (config.workerUrl) doSync();
    });
    document.getElementById('sync-pull').addEventListener('click', function(){
      config.workerUrl = document.getElementById('sync-worker-url').value.trim();
      config.syncKey = document.getElementById('sync-key-input').value.trim();
      saveConfig(); closeConfig();
      if (config.workerUrl) pull(true).then(function(){
        if (typeof RouteModule !== 'undefined' && RouteModule.refreshTrailSelector) RouteModule.refreshTrailSelector();
      });
    });
    setTimeout(function(){ var el = document.getElementById('sync-worker-url'); if(el) el.focus(); }, 100);
  }

  function closeConfig() {
    var m = document.getElementById('sync-config-modal');
    if (m) m.remove();
  }

  function init() {
    loadConfig();
    var btn = document.getElementById('sync-cloud-btn');
    if (btn) {
      btn.addEventListener('click', function(e) {
        if (e.shiftKey || !isConfigured()) { openConfig(); return; }
        doSync();
      });
    }
    updateBtn();
    if (config.workerUrl) {
      pull(false).then(function(){
        if (typeof RouteModule !== 'undefined' && RouteModule.refreshTrailSelector) RouteModule.refreshTrailSelector();
      });
    }
  }

  return {
    init: init, markDirty: markDirty, isConfigured: isConfigured,
    pullFromCloud: pull, pushToCloud: push, openConfig: openConfig
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SyncModule.init);
} else {
  SyncModule.init();
}
