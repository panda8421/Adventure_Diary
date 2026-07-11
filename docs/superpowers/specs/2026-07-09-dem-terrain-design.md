# 真实DEM地形数据接入设计

**日期**: 2026-07-09
**状态**: 已审核，待实现

## 概述

将单山模式（路线详情）的程序化柏林噪声地形替换为 Mapbox Terrain-RGB 真实高程数据，实现地形与实际地貌一致。全国球面地图保持原有风格不变。

## 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 数据源 | Mapbox Terrain-RGB | 全球覆盖、30米精度(zoom12)、PNG编码易解码、免费额度充足 |
| 架构方案 | 前端解码 + Worker代理缓存 | Token安全不暴露、Worker逻辑轻量、前端可渐进渲染 |
| 缓存策略 | Cloudflare KV边缘缓存 + localStorage二级缓存 | 二次访问零网络请求 |
| 精度级别 | zoom 12 (约30米/像素) | 数据量与细节的平衡点 |
| 地形编辑 | 禁用（真实DEM只读） | 避免破坏真实数据，减少复杂度 |
| 视觉风格 | 基于真实高程的伪彩色着色 | 保留现有暗色科幻风格，增强层次感 |

## 整体架构

```
前端（three-map.js + dem.js）          Cloudflare Worker              Mapbox API
┌────────────────────┐  /api/terrain   ┌──────────────┐  PNG瓦片  ┌─────────────┐
│ data.js路线经纬度   │ ──────────────> │ 代理+CORS    │ ────────> │ Terrain-RGB │
│ dem.js: 坐标转换   │ <────────────── │ KV缓存(30天) │ <──────── │ PNG (z/x/y) │
│ dem.js: Canvas解码  │   PNG二进制     └──────────────┘           └─────────────┘
│ dem.js: 双线性采样  │
│ three-map.js: 渲染  │
└────────────────────┘
```

## 模块设计

### 1. 新增文件: js/dem.js

DEM地形加载器，单一职责：瓦片获取、解码、采样、坐标投影。

#### API

```javascript
const dem = await DEMLoader.loadRouteTerrain(route, {
  zoom: 12,
  gridSize: 128,
  onProgress: (loaded, total) => {}
});
```

#### 返回值结构

```javascript
{
  heights: Float32Array(128 * 128),  // 高程矩阵（米），行优先，[0,0]=西北
  minHeight: number,                  // 区域最低海拔（米）
  maxHeight: number,                  // 区域最高海拔（米）
  bounds: { west, east, south, north }, // 实际地理边界
  project(lng, lat): {x, z},         // 经纬度 → 局部3D平面坐标
  unproject(x, z): {lng, lat},       // 3D坐标 → 经纬度
  getHeight(lng, lat): number         // 查询任意经纬度的高程（双线性插值）
}
```

#### 核心函数

- `lngLatToTile(lng, lat, zoom)` → `{tx, ty, ix, iy}`: 经纬度转瓦片坐标+像素偏移
- `tileToLngLat(tx, ty, zoom)` → `{lng, lat}`: 瓦片左上角转经纬度
- `decodeTerrainRGB(R, G, B)` → `height`: 高程解码公式 `h = -10000 + (R*65536 + G*256 + B)*0.1`
- `loadTile(z, x, y)` → `Promise<ImageData>`: 加载单个瓦片（KV→Mapbox回源）
- `sampleHeight(tileImages, lng, lat)` → `number`: 从瓦片集合双线性插值取高程
- `buildHeightMatrix(tiles, bounds, gridSize)` → `Float32Array`: 重采样为规则网格
- 内存瓦片缓存: `Map<string, ImageData>`，页面生命周期内复用
- localStorage缓存: 解码后的Float32Array以base64存储，LRU淘汰，上限50MB

### 2. 修改: cloudflare-worker.js

新增路由 `GET /api/terrain/{z}/{x}/{y}.png`。

#### 处理流程

1. 解析URL参数 `z`, `x`, `y`
2. 参数校验：z ∈ [0, 14]，x/y 非负整数
3. KV查找键 `terrain:{z}:{x}:{y}`
4. 命中 → 返回PNG，设置 `Content-Type: image/png`, `Cache-Control: public, max-age=2592000`, CORS头
5. 未命中 → 代理请求：
   ```
   GET https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token={MAPBOX_TOKEN}
   ```
6. Mapbox返回200 → 写入KV（expirationTtl=30天）→ 透传给客户端
7. Mapbox返回非200 → 返回502

#### 环境变量

- `MAPBOX_TOKEN`: Mapbox Access Token，通过 `wrangler secret put MAPBOX_TOKEN` 配置，不暴露到前端

#### CORS

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

### 3. 修改: js/three-map.js

#### 地形创建逻辑变更

`enterMountainMode()` 中根据 `route.useDEM` 选择路径：

- `route.useDEM === true`: 调用 `createRealDEMTerrain(route)` → 新函数
- 否则: 走原有 `createRealisticMountainTerrain()` → 保持不变（降级路径）

#### 新增函数: createRealDEMTerrain(route)

1. 显示loading提示"加载真实地形..."
2. 调用 `DEMLoader.loadRouteTerrain(route, {zoom:12, gridSize:128, onProgress})`
3. 使用返回的 `dem.heights` 填充PlaneGeometry顶点Y值
4. 应用真实高程Shader材质（见下文）
5. 将peaks/trailPoints/camps/photos/trackPoints通过 `dem.project()` 转为3D坐标，Y值用 `dem.getHeight()` 贴合地面
6. 隐藏地形编辑按钮（抬升/降低/平滑）
7. 加载完成后隐藏loading，相机轻微focus动画

#### 地形材质Shader增强

顶点着色器接收真实高程attribute，根据海拔动态着色：
- 动态色带：根据 `dem.minHeight/maxHeight` 自动划分5个颜色区间
- 坡度着色：用normal.y分量，陡坡加深，缓坡正常
- 坡向光照：模拟西北主光源，增强立体感
- 高度雾化：高海拔区域增加冷色调
- 等高线：每200米一条细线（可选，通过uniform开关）

#### 网格尺寸计算

- PlaneGeometry尺寸 = `viewRadiusKm * 2`（世界单位）
- 垂直缩放 = `dem.height * terrain.verticalScale`（默认1.5，增强立体感）
- 基底Y = dem.minHeight * verticalScale - 5（让地形最低点略高于基底平面）

### 4. 修改: js/data.js

路线数据格式变更（新增字段 + 坐标改为经纬度）：

```javascript
{
  id: 'wutai',
  name: '五台山',
  province: '山西',
  center: { lng: 113.584, lat: 39.062 },  // 新增：路线中心经纬度
  viewRadiusKm: 6,                        // 新增：视野半径(km)
  useDEM: true,                           // 新增：启用真实DEM
  terrain: {
    verticalScale: 1.5,                   // 垂直缩放系数
  },
  peaks: [
    // 改为 {name, lng, lat, height}
    { name: '北台叶斗峰', lng: 113.556, lat: 39.113, height: 3061 },
    // ...
  ],
  trailPoints: [
    // 改为 {name, lng, lat, type}
    { name: '白云寺', lng: 113.560, lat: 39.020, type: 'waypoint' },
    // ...
  ],
  camps: [
    // 改为 {name, lng, lat}
    { name: '中台营地', lng: 113.580, lat: 39.080 },
  ],
  photos: [ ... ],   // 坐标改为lng/lat
  trackPoints: [     // 先保留旧格式，后续迁移为{lng,lat,elev}
    {x: ..., y: ...}  // 未迁移的轨迹线使用x/y + DEM投影
  ],
}
```

### 5. 3D局部坐标系与缩放约定

- **原点 (0,0,0)**：路线中心点在其真实海拔处的位置
- **X轴正方向**：东
- **Z轴正方向**：北
- **Y轴正方向**：上
- **地形平面尺寸**：保持与现有代码一致，总大小 = `CONFIG.mountainSize`（10世界单位），对应地理范围 `viewRadiusKm * 2` 公里
- **水平缩放**：`worldScale = (viewRadiusKm * 2000) / CONFIG.mountainSize`（米/世界单位）
  - 以viewRadiusKm=6为例：1世界单位 ≈ 1200米真实距离
- **垂直缩放**：Y轴使用与水平相同的worldScale，再乘以 `verticalScale`（默认1.5，增强立体感）
  - `y = (demHeight - centerGroundHeight) / worldScale * verticalScale`
  - centerGroundHeight取路线中心点处的DEM高程
  - 这样地形相对起伏被适度放大，但水平/垂直比例基本协调
- 经纬度到平面坐标使用Web Mercator投影的局部线性近似（在viewRadiusKm=6km范围内误差<1%，可忽略）

## 坐标转换公式

### Web Mercator 投影

```javascript
function lngLatToGlobalPixel(lng, lat, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * scale;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * scale;
  return {x, y};
}
```

### 局部投影（短距离线性近似）

在路线中心附近，1度经度≈cos(lat)×111km，1度纬度≈111km：

```javascript
function project(lng, lat) {
  const metersPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
  const metersPerDegLat = 110540;
  const x = (lng - centerLng) * metersPerDegLng;
  const z = (lat - centerLat) * metersPerDegLat;
  return {x: x / worldScale, z: z / worldScale};
}
```

## 错误处理与降级

| 场景 | 处理方式 |
|------|---------|
| Worker未配置MAPBOX_TOKEN (401) | 降级到程序化地形，控制台警告，toast提示 |
| 网络超时/单个瓦片失败 | 重试2次（指数退避0.5s, 1s），仍失败则使用降级值 |
| 所有瓦片加载失败 | 降级到程序化地形，toast提示"地形加载失败，使用近似地形" |
| KV不可用 | Worker自动回源Mapbox，用户无感知 |
| localStorage已满 | 静默跳过本地缓存，仅用内存缓存 |
| 路线无useDEM标志 | 走原有createRealisticMountainTerrain路径 |
| 路线缺少经纬度 | 控制台警告，降级到程序化地形 |

降级原则：任何DEM加载失败不导致白屏/报错，无缝回退程序化地形。

## 路线迁移计划

第一批（随本功能上线）：
- **五台山**：已有5个台顶名称，补充精确经纬度，启用useDEM

后续批次（后续迭代）：
- 武功山、小五台、王平煤矿、贡嘎、哈巴雪山
- 未迁移路线继续使用程序化地形，完全兼容

## 部署步骤

1. 在Cloudflare Dashboard配置 `MAPBOX_TOKEN` 环境变量（secret）
2. 部署更新后的 cloudflare-worker.js（新增terrain路由）
3. 部署前端代码（新增 js/dem.js，修改 three-map.js / data.js）
4. 验证：访问五台山路线，确认地形与实际地貌一致
5. git提交所有变更

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| js/dem.js | 新增 | DEM加载/解码/采样/投影模块 |
| cloudflare-worker.js | 修改 | 新增 /api/terrain 路由 |
| js/three-map.js | 修改 | 新增 createRealDEMTerrain，改造 enterMountainMode，Shader增强，隐藏编辑按钮 |
| js/data.js | 修改 | 新增 useDEM 路线配置，迁移五台山数据为经纬度格式 |
| index.html | 修改 | 引入 dem.js script标签 |

## 不做的事（Out of Scope）

- 全国球面地图不使用DEM地形（保持现有行政区划风格）
- 不实现真实影像/卫星纹理贴图
- 不支持地形编辑功能在DEM模式下工作
- 不覆盖所有6条路线的数据迁移（只迁移五台山作为首条）
- 不添加等高线以外的地图注记/路网/水系叠加（后续功能）
