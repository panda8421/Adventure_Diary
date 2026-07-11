/* ============================================================
   主入口 - 应用初始化与全局事件协调
   ============================================================ */

const App = (function() {
  // 初始化
  function init() {
    // 初始化 3D 地图
    MapModule.init();

    // 初始化探险者面板
    ExplorerModule.init();

    // 初始化装备系统
    GearModule.init();

    // 初始化路线详情
    RouteModule.init();

    // 绑定全局点击事件（关闭面板）
    bindGlobalEvents();

    // 绑定键盘事件
    bindKeyboardEvents();
  }

  // 全局事件
  function bindGlobalEvents() {
    // 点击地图容器空白区域（不包含面板区域）
    document.getElementById('map-container').addEventListener('click', function(e) {
      // 只在地图容器本身被点击时触发（不是子元素）
      if (e.target === this) {
        closeAllPanels();
      }
    });

    // ESC 关闭所有面板
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeAllPanels();
      }
    });
  }

  // 键盘事件
  function bindKeyboardEvents() {
    // 已通过 ESC 在全局事件中处理
  }

  // 打开路线详情面板
  function openRoutePanel(routeId) {
    // 关闭装备面板（如果打开）
    GearModule.closePanel();

    // 飞行到路线位置
    const route = getRouteById(routeId);
    if (route) {
      MapModule.flyToRoute(route);
    }

    // 打开路线详情
    RouteModule.openPanel(routeId);
  }

  // 关闭所有面板
  function closeAllPanels() {
    var inMountainMode = typeof ThreeMap !== 'undefined' && ThreeMap.getViewMode && ThreeMap.getViewMode() === 'mountain';
    RouteModule.closePanel();
    GearModule.closePanel();
    if (!inMountainMode) {
      MapModule.resetView();
    }
  }

  return {
    init,
    openRoutePanel,
    closeAllPanels
  };
})();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  App.init();
});