# 右侧信息面板关闭/重开交互优化

## 问题

右上角信息面板（route-panel）的 X 按钮当前行为是：点击后调用 `closePanel()` → `MapModule.resetView()` → 山地模式下 `exitMountainMode()` 返回全国地图。用户期望：点击 X 只是关闭面板让 3D 地图显示更全，不退出山地视图，并且面板关闭后能再次打开。

## 设计

### 1. 修改 closePanel() 行为

- **山地模式**（`ThreeMap.getViewMode() === 'mountain'`）：仅关闭面板（移除 `open` class），**不**调用 `resetView()`，不清除 `currentRouteId`，显示右侧把手
- **全国地图模式**：保持现有行为（关闭面板 + resetView）
- 左上角"← 返回全国地图"按钮保持不变，作为退出 3D 视图的唯一入口

### 2. 右侧边缘抽屉把手

- **位置**：`position: fixed; right: 0; top: 25%;`
- **样式**：竖向窄条（约 40px 宽、80px 高），毛玻璃风格，与现有 `glass-panel` 一致，圆角在左侧，带 ℹ 图标和"路线信息"文字提示
- **显示时机**：仅在山地模式 + 面板关闭时可见；面板打开时隐藏；退出山地模式时隐藏
- **交互**：点击把手 → 打开面板（`openPanel(currentRouteId)`），把手自动隐藏
- **动画**：与面板 slide 动画配合，把手使用 opacity + translateX 过渡

### 3. 键盘快捷键

- `Esc` 键在山地模式下关闭面板（不退出视图），与已有 Esc 行为兼容

### 4. 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `index.html` | 添加把手按钮 DOM 元素 |
| `css/style.css` | 添加把手样式和动画 |
| `js/route.js` | 修改 `closePanel()`、新增 `showPanelToggle()`/`hidePanelToggle()`、把手点击事件、Esc 键处理 |
| `js/three-map.js` | `exitMountainMode()` 中调用 `RouteModule.hidePanelToggle()` |

### 5. 状态转换

```
山地模式 + 面板打开  --(X/Esc/点击把手区外?)--> 山地模式 + 面板关闭 + 把手显示
山地模式 + 面板关闭  --(点击把手)--> 山地模式 + 面板打开
山地模式             --(← 返回全国地图)--> 全国模式 + 面板关闭 + 把手隐藏
全国模式 + 面板打开  --(X)--> 全国模式 + 面板关闭 + resetView（现有行为不变）
```
