/* ============================================================
   Three.js 3D 地图模块 - 球面曲面地形图
   使用 Three.js + GeoJSON 实现立体曲面地图
   ============================================================ */

var ThreeMap = (function() {
  var scene, camera, renderer, controls, composer;
  var mapGroup, markersGroup, atmosphereGroup;
  var raycaster, mouse;
  var container;
  var isReady = false;
  var chinaGeoJSON = null;
  var onRouteClick = null;
  var animationId = null;
  var markerMeshes = [];
  var bloomEnabled = false;
  var hoveredProvince = null;
  var hoverLabel = null;
  var provinceMeshes = [];
  var hoveredMarker = null;

  // 视图模式：'global' 全局地图 | 'mountain' 单山地形
  var viewMode = 'global';
  var mountainGroup = null;
  var currentMountainRoute = null;
  var backButton = null;
  var isCameraAnimating = false;

  // 地形编辑器
  var editMode = false;
  var editBrushSize = 3;
  var editBrushStrength = 0.2;
  var editTool = 'raise';
  var editorPanel = null;
  var editCursor = null;
  var terrainMesh = null;
  var baseHeights = null;
  var origHeights = null;
  var isEditing = false;
  var editMouse = null;
  var editRaycaster = null;

  // 路径编辑
  var trailHandlesGroup = null;
  var selectedTrailIndex = -1;
  var isDraggingTrail = false;
  var workingTrailPoints = null;
  var pointerDownOnTrail = false;
  var activeTrailId = null;
  var workingCustomTrails = null;
  var trailDirectionOverrides = {};
  var trailCompletedStatus = {};
  var trailNameOverrides = {};
  var deletedDefaultTrailIds = {};
  var onTrailChanged = null;

  // 河流编辑
  var riverHandlesGroup = null;
  var selectedRiverIndex = -1;
  var isDraggingRiver = false;
  var workingRiverPoints = null;
  var pointerDownOnRiver = false;
  var riverWidth = 2.5;
  var riverDepth = 1.5;

  // POI用户标记系统
  var POI_TYPES = {
    water:   { name: '水源',     icon: '💧', color: 0x4499ff, emissive: 0x2266cc, shape: 'drop' },
    camp:    { name: '营地',     icon: '⛺', color: 0x66ff88, emissive: 0x228833, shape: 'tent' },
    danger:  { name: '危险',     icon: '⚠️', color: 0xff4444, emissive: 0xcc2222, shape: 'warning' },
    view:    { name: '观景台',   icon: '🏔️', color: 0xcc88ff, emissive: 0x8844cc, shape: 'binocular' },
    junction:{ name: '岔路口',   icon: '🔀', color: 0xffaa33, emissive: 0xcc7711, shape: 'fork' },
    exit:    { name: '下撤点',   icon: '🚪', color: 0x44ddff, emissive: 0x2299bb, shape: 'door' },
    supply:  { name: '补给点',   icon: '🍜', color: 0xffdd44, emissive: 0xcc9900, shape: 'box' },
    note:    { name: '备注',     icon: '📝', color: 0xaaaabb, emissive: 0x666677, shape: 'note' }
  };
  var poiGroup = null;
  var userPOIs = [];
  var poiPlacementMode = false;
  var poiPlacementType = 'note';
  var poiPreviewMarker = null;
  var poiEditPanel = null;
  var selectedPOI = null;

  // 配置
  var CONFIG = {
    sphereRadius: 100,
    mapHeight: 3,
    mapTopColor: 0x3a4a62,
    mapEmissive: 0x0a1420,
    borderColor: 0x6a8ab5,
    sideColor: 0x141c28,
    markerColor: 0xfca311,
    markerGlowColor: 0xff8800,
    bgColor: 0x05060a,
    atmosphereColor: 0x3366aa,
    oceanColor: 0x070d18,
    cameraDistance: 220,
    cameraAlpha: 48,
    cameraBeta: 105,
    cameraTargetOffsetY: -12,
    bloomStrength: 0.4,
    bloomRadius: 0.5,
    bloomThreshold: 0.6
  };

  function init(containerId, callback) {
    container = document.getElementById(containerId);
    if (!container) {
      console.error('[ThreeMap] 容器不存在:', containerId);
      return;
    }

    if (!editMouse) editMouse = new THREE.Vector2();
    if (!editRaycaster) editRaycaster = new THREE.Raycaster();

    // 初始化场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);
    scene.fog = new THREE.Fog(CONFIG.bgColor, 180, 350);

    // 初始化相机
    var aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    setCameraPosition(CONFIG.cameraBeta, CONFIG.cameraAlpha, CONFIG.cameraDistance);

    // 初始化渲染器
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 初始化后处理（Bloom 辉光）
    setupPostProcessing();

    // 初始化控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, CONFIG.cameraTargetOffsetY, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.rotateSpeed = 0.4;
    controls.zoomSpeed = 0.7;
    controls.panSpeed = 0.6;
    controls.minDistance = CONFIG.sphereRadius * 1.3;
    controls.maxDistance = CONFIG.sphereRadius * 3.0;
    controls.minPolarAngle = Math.PI * 0.1;
    controls.maxPolarAngle = Math.PI * 0.75;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.keyPanSpeed = 7.0;
    // 左键旋转，中键缩放，右键平移
    // 0=ROTATE, 1=DOLLY, 2=PAN
    controls.mouseButtons = {
      LEFT: 0,
      MIDDLE: 1,
      RIGHT: 2
    };
    controls.update();

    // 射线检测
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 灯光
    setupLights();

    // 地图组
    mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // 标记组
    markersGroup = new THREE.Group();
    scene.add(markersGroup);

    // 大气层组
    atmosphereGroup = new THREE.Group();
    scene.add(atmosphereGroup);

    // 添加星空背景
    createStars();

    // 添加大气层
    createAtmosphere();

    // 事件监听
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    // pointerdown 在捕获阶段处理，确保在OrbitControls(冒泡阶段)之前执行
    // 命中路径/地形编辑时调用stopPropagation阻止OrbitControls响应
    renderer.domElement.addEventListener('pointerdown', onTerrainPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onTerrainPointerMove, true);
    renderer.domElement.addEventListener('wheel', onTerrainWheel, { passive: false });
    window.addEventListener('pointerup', onTerrainPointerUp, true);
    // 捕获阶段拦截mousedown(兼容非PointerEvent环境)和touchstart
    // 地形编辑模式下完全阻止OrbitControls响应
    // 路径/河流编辑模式下：右键退出编辑；点击线/控制点时拦截以进行拖拽，否则允许地图旋转缩放
    renderer.domElement.addEventListener('mousedown', function(e) {
      if (!editMode || viewMode !== 'mountain') return;
      if (e.button === 2) {
        e.stopImmediatePropagation();
        e.preventDefault();
        toggleEditMode(false);
        return;
      }
      if (e.button !== 0) return;
      var isPathTool = (editTool === 'trail' || editTool === 'river');
      if (!isPathTool) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      var hitHandle = false, hitLine = false;
      if (editTool === 'trail') {
        hitHandle = pickTrailHandle(e.clientX, e.clientY) >= 0;
        hitLine = pickTrailLine(e.clientX, e.clientY);
      } else if (editTool === 'river') {
        hitHandle = pickRiverHandle(e.clientX, e.clientY) >= 0;
        hitLine = pickRiverLine(e.clientX, e.clientY);
      }
      if (hitHandle || hitLine) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
    renderer.domElement.addEventListener('touchstart', function(e) {
      if (!editMode || viewMode !== 'mountain') return;
      var isPathTool = (editTool === 'trail' || editTool === 'river');
      if (!isPathTool) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      var hitHandle = false, hitLine = false;
      if (editTool === 'trail') {
        hitHandle = pickTrailHandle(t.clientX, t.clientY) >= 0;
        hitLine = pickTrailLine(t.clientX, t.clientY);
      } else if (editTool === 'river') {
        hitHandle = pickRiverHandle(t.clientX, t.clientY) >= 0;
        hitLine = pickRiverLine(t.clientX, t.clientY);
      }
      if (hitHandle || hitLine) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, { passive: false, capture: true });
    renderer.domElement.addEventListener('wheel', function(e) {
      if (isCameraAnimating) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      // 地形笔刷编辑模式（抬升/降低/平滑）：中心缩放（保持原有行为）
      if (editMode && viewMode === 'mountain' && editTool !== 'trail' && editTool !== 'river') {
        e.stopImmediatePropagation();
        e.preventDefault();
        var delta = e.deltaY > 0 ? 1.08 : 1 / 1.08;
        var newDist = camera.position.distanceTo(controls.target) * delta;
        newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));
        var dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).add(dir.multiplyScalar(newDist));
        camera.lookAt(controls.target);
        return;
      }
      // 其余模式（全局视图、山地浏览、路径编辑）：以鼠标为中心缩放
      e.stopImmediatePropagation();
      e.preventDefault();
      zoomToCursor(e.clientX, e.clientY, e.deltaY);
    }, { passive: false, capture: true });
    renderer.domElement.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });

    setupEditorEvents();

    // 开始渲染循环
    animate();

    // 加载地图数据
    loadGeoJSON(function() {
      buildSphereMap();
      isReady = true;
      if (callback) callback();
    });
  }

  function setupLights() {
    // 半球光：天空色 + 地面色，提亮暗部
    var hemiLight = new THREE.HemisphereLight(0x7a9acc, 0x1a2030, 0.5);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    // 主光源：斜上方 45°，暖色调，照亮顶面
    var mainLight = new THREE.DirectionalLight(0xfff2e0, 1.0);
    var mainAngle = 45 * Math.PI / 180;
    mainLight.position.set(
      Math.cos(mainAngle) * 80,
      Math.sin(mainAngle) * 80,
      40
    );
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 300;
    mainLight.shadow.camera.left = -120;
    mainLight.shadow.camera.right = 120;
    mainLight.shadow.camera.top = 120;
    mainLight.shadow.camera.bottom = -120;
    scene.add(mainLight);

    // 补光：左侧冷色，柔化阴影
    var fillLight = new THREE.DirectionalLight(0x5a7aaa, 0.35);
    fillLight.position.set(-60, 30, 50);
    scene.add(fillLight);

    // 背光：后方弱光，勾勒轮廓
    var rimLight = new THREE.DirectionalLight(0x4466aa, 0.25);
    rimLight.position.set(0, 40, -70);
    scene.add(rimLight);

    // 中心点光源：微暖调，增强中心区域层次
    var pointLight = new THREE.PointLight(0xffbb88, 0.4, 160, 2);
    pointLight.position.set(0, 30, 60);
    scene.add(pointLight);
  }

  // 设置后处理（Bloom 辉光）
  function setupPostProcessing() {
    // 检查后处理依赖是否加载
    if (typeof THREE.EffectComposer === 'undefined' ||
        typeof THREE.RenderPass === 'undefined' ||
        typeof THREE.UnrealBloomPass === 'undefined') {
      console.warn('[ThreeMap] 后处理依赖未加载，跳过 Bloom');
      bloomEnabled = false;
      return;
    }

    try {
      composer = new THREE.EffectComposer(renderer);
      composer.setSize(container.clientWidth, container.clientHeight);

      // RenderPass：渲染场景
      var renderPass = new THREE.RenderPass(scene, camera);
      composer.addPass(renderPass);

      // UnrealBloomPass：辉光效果
      var bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        CONFIG.bloomStrength,  // strength
        CONFIG.bloomRadius,    // radius
        CONFIG.bloomThreshold  // threshold
      );
      composer.addPass(bloomPass);

      bloomEnabled = true;
      console.log('[ThreeMap] Bloom 后处理已启用');
    } catch (e) {
      console.warn('[ThreeMap] 后处理初始化失败:', e.message);
      bloomEnabled = false;
    }
  }

  function createStars() {
    var starCount = 3000;
    var positions = new Float32Array(starCount * 3);
    var colors = new Float32Array(starCount * 3);
    var sizes = new Float32Array(starCount);

    for (var i = 0; i < starCount; i++) {
      var radius = 400 + Math.random() * 300;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.random() * Math.PI;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      var brightness = 0.4 + Math.random() * 0.6;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness * 1.3;

      sizes[i] = 0.3 + Math.random() * 0.8;
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    var material = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    var stars = new THREE.Points(geometry, material);
    scene.add(stars);
  }

  function createAtmosphere() {
    // 外层光晕 - 非常柔和
    var outerGeometry = new THREE.SphereGeometry(CONFIG.sphereRadius + 8, 64, 64);
    var outerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(CONFIG.atmosphereColor) },
        viewVector: { value: camera.position.clone() }
      },
      vertexShader: `
        uniform vec3 viewVector;
        varying float intensity;
        void main() {
          vec3 vNormal = normalize(normalMatrix * normal);
          vec3 vView = normalize(normalMatrix * viewVector);
          intensity = pow(0.55 - dot(vNormal, vView), 2.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float intensity;
        void main() {
          vec3 glow = glowColor * intensity;
          gl_FragColor = vec4(glow, intensity * 0.3);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    var outerGlow = new THREE.Mesh(outerGeometry, outerMaterial);
    outerGlow.userData.type = 'atmosphere-outer';
    atmosphereGroup.add(outerGlow);

    // 内层微光 - 贴近球面
    var innerGeometry = new THREE.SphereGeometry(CONFIG.sphereRadius + 1.5, 64, 64);
    var innerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x5588bb) },
        viewVector: { value: camera.position.clone() }
      },
      vertexShader: `
        uniform vec3 viewVector;
        varying float intensity;
        void main() {
          vec3 vNormal = normalize(normalMatrix * normal);
          vec3 vView = normalize(normalMatrix * viewVector);
          intensity = pow(0.6 - dot(vNormal, vView), 2.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float intensity;
        void main() {
          vec3 glow = glowColor * intensity * 0.35;
          gl_FragColor = vec4(glow, intensity * 0.15);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    var innerGlow = new THREE.Mesh(innerGeometry, innerMaterial);
    innerGlow.userData.type = 'atmosphere-inner';
    atmosphereGroup.add(innerGlow);
  }

  function setCameraPosition(betaDeg, alphaDeg, distance) {
    var beta = (betaDeg * Math.PI) / 180;
    var alpha = (alphaDeg * Math.PI) / 180;

    camera.position.x = distance * Math.sin(alpha) * Math.sin(beta);
    camera.position.y = distance * Math.cos(alpha);
    camera.position.z = distance * Math.sin(alpha) * Math.cos(beta);
    camera.lookAt(0, 0, 0);
  }

  function loadGeoJSON(callback) {
    var localUrl = 'data/china.json';
    var geoUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';

    fetch(localUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('Local file not found');
        return res.json();
      })
      .then(function(data) {
        chinaGeoJSON = data;
        console.log('[ThreeMap] GeoJSON 加载成功 (本地)');
        callback();
      })
      .catch(function() {
        console.log('[ThreeMap] 本地GeoJSON加载失败，尝试远程加载...');
        fetch(geoUrl)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            chinaGeoJSON = data;
            console.log('[ThreeMap] GeoJSON 加载成功 (fetch)');
            callback();
          })
          .catch(function() {
            loadGeoJSONByJSONP(callback);
          });
      });
  }

  function loadGeoJSONByJSONP(callback) {
    var callbackName = 'threeMapChinaCallback_' + Date.now();
    var script = document.createElement('script');
    var jsonpUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json?callback=' + callbackName;

    window[callbackName] = function(data) {
      chinaGeoJSON = data;
      console.log('[ThreeMap] GeoJSON 加载成功 (JSONP)');
      callback();
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    script.src = jsonpUrl;
    script.onerror = function() {
      console.error('[ThreeMap] GeoJSON JSONP 加载失败');
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    document.head.appendChild(script);
  }

  // 经纬度转球面坐标
  function lngLatToSphere(lng, lat, radius) {
    var lngRad = (lng * Math.PI) / 180;
    var latRad = (lat * Math.PI) / 180;

    var x = radius * Math.cos(latRad) * Math.sin(lngRad);
    var y = radius * Math.sin(latRad);
    var z = radius * Math.cos(latRad) * Math.cos(lngRad);

    return new THREE.Vector3(x, y, z);
  }

  // 构建球面地图
  function buildSphereMap() {
    if (!chinaGeoJSON) return;

    var features = chinaGeoJSON.features;
    var provinceCount = 0;
    var totalPolygons = 0;
    provinceMeshes = [];

    features.forEach(function(feature) {
      var geometry = feature.geometry;
      var name = feature.properties.name;

      if (geometry.type === 'Polygon') {
        var result = createProvinceMesh(geometry.coordinates[0], name, feature.properties);
        if (result) provinceCount++;
        totalPolygons++;
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(function(polygon) {
          var result = createProvinceMesh(polygon[0], name, feature.properties);
          if (result) provinceCount++;
          totalPolygons++;
        });
      }
    });

    console.log('[ThreeMap] 构建曲面:', provinceCount, '/' , totalPolygons, '个多边形（已过滤小岛）');
    console.log('[ThreeMap] 省份网格:', provinceMeshes.length, '个');

    // 添加球体底部（海洋部分）
    createOceanBase();
  }

  // 创建悬停标签（高清精致版）
  function createHoverLabel(text, lng, lat) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var dpr = 2; // 高清渲染
    var fontSize = 14;
    var paddingX = 14;
    var paddingY = 8;

    // 先测量文字宽度
    ctx.font = '600 ' + fontSize + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    var textWidth = ctx.measureText(text).width;
    var canvasWidth = Math.ceil((textWidth + paddingX * 2) * dpr);
    var canvasHeight = Math.ceil((fontSize + paddingY * 2) * dpr);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 缩放坐标系以支持高清
    ctx.scale(dpr, dpr);
    ctx.font = '600 ' + fontSize + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var w = textWidth + paddingX * 2;
    var h = fontSize + paddingY * 2;

    // 背景：渐变 + 模糊感
    var bgGradient = ctx.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, 'rgba(25, 40, 65, 0.92)');
    bgGradient.addColorStop(1, 'rgba(15, 25, 45, 0.92)');
    ctx.fillStyle = bgGradient;
    roundRect(ctx, 0, 0, w, h, 6);
    ctx.fill();

    // 顶部细线高光
    ctx.strokeStyle = 'rgba(120, 170, 230, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 0.5);
    ctx.lineTo(w - 8, 0.5);
    ctx.stroke();

    // 边框
    ctx.strokeStyle = 'rgba(90, 140, 200, 0.3)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 6);
    ctx.stroke();

    // 文字阴影（发光感）
    ctx.shadowColor = 'rgba(100, 160, 230, 0.5)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#f0f6ff';
    ctx.fillText(text, w / 2, h / 2 + 0.5);
    ctx.shadowBlur = 0;

    // 底部小箭头
    ctx.fillStyle = 'rgba(15, 25, 45, 0.92)';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 5, h - 0.5);
    ctx.lineTo(w / 2 + 5, h - 0.5);
    ctx.lineTo(w / 2, h + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 140, 200, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 5, h - 0.5);
    ctx.lineTo(w / 2, h + 4);
    ctx.lineTo(w / 2 + 5, h - 0.5);
    ctx.stroke();

    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    var material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    var sprite = new THREE.Sprite(material);
    var pos = lngLatToSphere(lng, lat, CONFIG.sphereRadius + CONFIG.mapHeight + 5);
    sprite.position.copy(pos);

    // 设置 Sprite 大小
    var spriteHeight = 3.0;
    var spriteWidth = (w / h) * spriteHeight;
    sprite.scale.set(spriteWidth, spriteHeight, 1);

    sprite.userData.type = 'hover-label';
    sprite.userData.text = text;

    return sprite;
  }

  // 设置悬停省份
  function setHoveredProvince(mesh) {
    // 恢复之前的
    if (hoveredProvince && hoveredProvince !== mesh) {
      var prev = hoveredProvince;
      prev.material.emissiveIntensity = prev.userData.originalEmissiveIntensity;
      prev.material.emissive = new THREE.Color(CONFIG.mapEmissive);
    }

    // 移除旧标签
    if (hoverLabel) {
      mapGroup.remove(hoverLabel);
      hoverLabel = null;
    }

    hoveredProvince = mesh;

    if (mesh) {
      // 高亮当前省份
      mesh.material.emissiveIntensity = 0.7;
      mesh.material.emissive = new THREE.Color(0x2255aa);

      // 创建标签（使用地理中心坐标）
      if (mesh.userData.centerLng !== undefined && mesh.userData.centerLat !== undefined) {
        hoverLabel = createHoverLabel(
          mesh.userData.name,
          mesh.userData.centerLng,
          mesh.userData.centerLat
        );
        if (hoverLabel) mapGroup.add(hoverLabel);
      }
    }

    // 更新鼠标样式
    if (renderer && renderer.domElement) {
      renderer.domElement.style.cursor = mesh ? 'pointer' : 'default';
    }
  }

  // Canvas 圆角矩形
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 创建海洋基底
  function createOceanBase() {
    // 海洋球体
    var oceanGeometry = new THREE.SphereGeometry(CONFIG.sphereRadius - 0.5, 64, 64);
    var oceanMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.oceanColor,
      emissive: 0x03070e,
      emissiveIntensity: 0.2,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.85
    });
    var ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    ocean.receiveShadow = true;
    ocean.userData.type = 'ocean';
    mapGroup.add(ocean);

    // 海洋网格线 - 极细淡灰色
    var gridMaterial = new THREE.LineBasicMaterial({
      color: 0x2a3a50,
      transparent: true,
      opacity: 0.18
    });

    // 纬线
    for (var lat = -80; lat <= 80; lat += 20) {
      var latPoints = [];
      for (var lng = 0; lng <= 360; lng += 3) {
        var pos = lngLatToSphere(lng - 180, lat, CONFIG.sphereRadius - 0.3);
        latPoints.push(pos);
      }
      var latGeometry = new THREE.BufferGeometry().setFromPoints(latPoints);
      var latLine = new THREE.Line(latGeometry, gridMaterial);
      mapGroup.add(latLine);
    }

    // 经线
    for (var lng = -180; lng < 180; lng += 20) {
      var lngPoints = [];
      for (var lat = -90; lat <= 90; lat += 3) {
        var pos = lngLatToSphere(lng, lat, CONFIG.sphereRadius - 0.3);
        lngPoints.push(pos);
      }
      var lngGeometry = new THREE.BufferGeometry().setFromPoints(lngPoints);
      var lngLine = new THREE.Line(lngGeometry, gridMaterial);
      mapGroup.add(lngLine);
    }

    // 底部柔化阴影（模拟悬浮效果）
    createBottomShadow();
  }

  // 创建底部柔化阴影
  function createBottomShadow() {
    var shadowGeometry = new THREE.CircleGeometry(60, 48);
    var shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -CONFIG.sphereRadius - 2;
    shadow.userData.type = 'bottom-shadow';
    atmosphereGroup.add(shadow);
  }

  // 创建省份曲面网格（在球面上挤出）
  function createProvinceMesh(coordinates, name, properties) {
    var innerR = CONFIG.sphereRadius;
    var outerR = CONFIG.sphereRadius + CONFIG.mapHeight;

    // 计算地理中心（经纬度平均值）
    var centerLng = 0;
    var centerLat = 0;
    for (var ci = 0; ci < coordinates.length - 1; ci++) {
      centerLng += coordinates[ci][0];
      centerLat += coordinates[ci][1];
    }
    centerLng /= (coordinates.length - 1);
    centerLat /= (coordinates.length - 1);

    // 收集外圈顶点（球面上）
    var outerPoints = [];
    for (var i = 0; i < coordinates.length - 1; i++) {
      var lng = coordinates[i][0];
      var lat = coordinates[i][1];
      outerPoints.push(lngLatToSphere(lng, lat, outerR));
    }

    if (outerPoints.length < 3) return false;

    // 过滤太小的多边形（小岛）
    var bbox = getBoundingBox(outerPoints);
    var bboxSize = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
    if (bboxSize < 2) return false;

    // 将3D点投影到局部2D平面（用于三角化）
    var center = new THREE.Vector3();
    for (var i = 0; i < outerPoints.length; i++) {
      center.add(outerPoints[i]);
    }
    center.divideScalar(outerPoints.length);
    center.normalize();

    // 构建局部坐标系
    var up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(center.dot(up)) > 0.9) {
      up.set(1, 0, 0);
    }
    var tangent = new THREE.Vector3().crossVectors(up, center).normalize();
    var bitangent = new THREE.Vector3().crossVectors(center, tangent).normalize();

    // 投影到2D
    var points2d = [];
    for (var i = 0; i < outerPoints.length; i++) {
      var p = outerPoints[i];
      var local = new THREE.Vector3().subVectors(p, center.clone().multiplyScalar(outerR));
      var u = local.dot(tangent);
      var v = local.dot(bitangent);
      points2d.push(new THREE.Vector2(u, v));
    }

    // 使用 Three.js 内置三角化
    var faces;
    try {
      faces = THREE.ShapeUtils.triangulateShape(points2d, []);
    } catch (e) {
      console.warn('[ThreeMap] 三角化失败:', name, e.message);
      return false;
    }

    if (!faces || faces.length === 0) return false;

    // 构建几何体
    var vertices = [];
    var normals = [];
    var indices = [];
    var colorAttr = [];

    var topColor = new THREE.Color(CONFIG.mapTopColor);
    var sideColor = new THREE.Color(CONFIG.sideColor);

    // 顶面顶点
    var topStart = 0;
    for (var i = 0; i < outerPoints.length; i++) {
      var p = outerPoints[i];
      vertices.push(p.x, p.y, p.z);
      var n = p.clone().normalize();
      normals.push(n.x, n.y, n.z);
      colorAttr.push(topColor.r, topColor.g, topColor.b);
    }

    // 底面顶点（内球面上，不可见但为了完整性保留）
    var bottomStart = outerPoints.length;
    for (var i = 0; i < outerPoints.length; i++) {
      var p = outerPoints[i];
      var innerP = p.clone().normalize().multiplyScalar(innerR);
      vertices.push(innerP.x, innerP.y, innerP.z);
      var n = innerP.clone().normalize().negate();
      normals.push(n.x, n.y, n.z);
      colorAttr.push(sideColor.r * 0.4, sideColor.g * 0.4, sideColor.b * 0.4);
    }

    // 侧面顶点
    var sideStart = bottomStart + outerPoints.length;
    for (var i = 0; i < outerPoints.length; i++) {
      var next = (i + 1) % outerPoints.length;
      var v1 = outerPoints[i];
      var v2 = outerPoints[next];
      var tangent = new THREE.Vector3().subVectors(v2, v1).normalize();
      var radial = v1.clone().normalize();
      var sideNormal = new THREE.Vector3().crossVectors(tangent, radial).normalize();

      // 上顶点 - 略深于顶面
      vertices.push(v1.x, v1.y, v1.z);
      normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
      colorAttr.push(sideColor.r * 1.4, sideColor.g * 1.4, sideColor.b * 1.4);

      // 下顶点 - 更深
      var innerP = v1.clone().normalize().multiplyScalar(innerR);
      vertices.push(innerP.x, innerP.y, innerP.z);
      normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
      colorAttr.push(sideColor.r, sideColor.g, sideColor.b);
    }

    // 顶面三角形索引
    for (var i = 0; i < faces.length; i++) {
      var face = faces[i];
      indices.push(topStart + face[0], topStart + face[1], topStart + face[2]);
    }

    // 侧面三角形
    for (var i = 0; i < outerPoints.length; i++) {
      var next = (i + 1) % outerPoints.length;
      var baseIdx = sideStart + i * 2;
      var nextBaseIdx = sideStart + next * 2;
      indices.push(baseIdx, nextBaseIdx, baseIdx + 1);
      indices.push(nextBaseIdx, nextBaseIdx + 1, baseIdx + 1);
    }

    // 创建几何体
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorAttr, 3));
    geometry.setIndex(indices);

    // 材质：顶点颜色区分顶面和侧面，整体哑光质感
    var material = new THREE.MeshStandardMaterial({
      vertexColors: THREE.VertexColors,
      emissive: CONFIG.mapEmissive,
      emissiveIntensity: 0.2,
      roughness: 0.75,
      metalness: 0.08,
      side: THREE.FrontSide
    });

    var mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.name = name;
    mesh.userData.type = 'province';
    mesh.userData.properties = properties;
    mesh.userData.originalEmissiveIntensity = 0.2;
    mesh.userData.outerPoints = outerPoints;
    mesh.userData.centerLng = centerLng;
    mesh.userData.centerLat = centerLat;

    mapGroup.add(mesh);
    provinceMeshes.push(mesh);

    // 边框线：淡蓝色微发光描边
    createBorderLine(outerPoints, name);

    return true;
  }

  // 计算点集包围盒
  function getBoundingBox(points) {
    var min = new THREE.Vector3(Infinity, Infinity, Infinity);
    var max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (var i = 0; i < points.length; i++) {
      min.min(points[i]);
      max.max(points[i]);
    }
    return { min: min, max: max };
  }

  // 创建省份边界线（淡蓝色微发光描边）
  function createBorderLine(points, name) {
    var geometry = new THREE.BufferGeometry().setFromPoints(points);
    var material = new THREE.LineBasicMaterial({
      color: CONFIG.borderColor,
      transparent: true,
      opacity: 0.7
    });
    var line = new THREE.Line(geometry, material);
    line.userData.name = name;
    line.userData.type = 'border';
    mapGroup.add(line);
  }

  function addMarkers(routeData) {
    if (!isReady) {
      setTimeout(function() { addMarkers(routeData); }, 100);
      return;
    }

    // 清空现有标记
    markerMeshes.forEach(function(m) {
      if (m.userData.isMarker) {
        markersGroup.remove(m);
        disposeObject(m);
      }
    });
    markerMeshes = [];

    routeData.forEach(function(route) {
      var marker = createMarker(route);
      if (marker) {
        markersGroup.add(marker);
        markerMeshes.push(marker);
      }
    });

    console.log('[ThreeMap] 添加标记:', routeData.length, '个');
  }

  function createMarker(route) {
    var markerGroup = new THREE.Group();
    markerGroup.userData.isMarker = true;
    markerGroup.userData.routeId = route.id;
    markerGroup.userData.route = route;

    var difficulty = route.difficulty || 1;
    var baseRadius = 0.35 + difficulty * 0.15;

    // 位置
    var pos = lngLatToSphere(route.lng, route.lat, CONFIG.sphereRadius + CONFIG.mapHeight);
    markerGroup.position.copy(pos);

    // 朝向（垂直于球面）
    var normal = pos.clone().normalize();
    var quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    markerGroup.applyQuaternion(quaternion);

    // 存储缩放状态（用于平滑过渡）
    markerGroup.userData.baseScale = 1.0;
    markerGroup.userData.targetScale = 1.0;
    markerGroup.userData.currentScale = 1.0;

    // 1. 外圈细光环（外层扩散）
    var outerRingGeometry = new THREE.RingGeometry(baseRadius * 1.2, baseRadius * 1.5, 32);
    var outerRingMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.markerColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.02;
    outerRing.userData.isOuterRing = true;
    markerGroup.add(outerRing);

    // 2. 内圈亮环
    var innerRingGeometry = new THREE.RingGeometry(baseRadius * 0.5, baseRadius * 0.9, 32);
    var innerRingMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.markerColor,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.05;
    innerRing.userData.isInnerRing = true;
    markerGroup.add(innerRing);

    // 3. 中心实心亮点
    var centerDotGeometry = new THREE.CircleGeometry(baseRadius * 0.35, 24);
    var centerDotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var centerDot = new THREE.Mesh(centerDotGeometry, centerDotMaterial);
    centerDot.rotation.x = -Math.PI / 2;
    centerDot.position.y = 0.08;
    markerGroup.add(centerDot);

    // 4. 顶部微光球（不高，点缀一下）
    var topSphereGeometry = new THREE.SphereGeometry(baseRadius * 0.25, 12, 12);
    var topSphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: CONFIG.markerColor,
      emissiveIntensity: 1.0,
      roughness: 0.3,
      metalness: 0.6
    });
    var topSphere = new THREE.Mesh(topSphereGeometry, topSphereMaterial);
    topSphere.position.y = baseRadius * 0.8;
    topSphere.castShadow = true;
    markerGroup.add(topSphere);

    // 5. 顶部微光晕
    var topGlowGeometry = new THREE.SphereGeometry(baseRadius * 0.6, 12, 12);
    var topGlowMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.markerGlowColor,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var topGlow = new THREE.Mesh(topGlowGeometry, topGlowMaterial);
    topGlow.position.y = baseRadius * 0.8;
    topGlow.userData.isTopGlow = true;
    markerGroup.add(topGlow);

    return markerGroup;
  }

  function disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(function(m) { m.dispose(); });
      } else {
        obj.material.dispose();
      }
    }
    if (obj.children) {
      obj.children.forEach(disposeObject);
    }
  }

  function onMouseMove(event) {
    if (editMode && viewMode === 'mountain') return;
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 射线检测
    raycaster.setFromCamera(mouse, camera);

    // 先检测标记点
    var markerIntersects = raycaster.intersectObjects(markersGroup.children, true);
    if (markerIntersects.length > 0) {
      var obj = markerIntersects[0].object;
      while (obj && !obj.userData.isMarker) {
        obj = obj.parent;
      }
      if (obj && obj.userData.isMarker) {
        if (hoveredMarker !== obj) {
          // 之前悬停的恢复
          if (hoveredMarker) {
            hoveredMarker.userData.targetScale = 1.0;
          }
          // 新的悬停放大
          hoveredMarker = obj;
          hoveredMarker.userData.targetScale = 1.4;
        }
      }
      renderer.domElement.style.cursor = 'pointer';
      // 悬停在标记上时，清除省份悬停
      if (hoveredProvince) setHoveredProvince(null);
      return;
    } else {
      // 没有悬停标记，恢复
      if (hoveredMarker) {
        hoveredMarker.userData.targetScale = 1.0;
        hoveredMarker = null;
      }
    }

    // 再检测省份
    var provinceIntersects = raycaster.intersectObjects(provinceMeshes, false);
    if (provinceIntersects.length > 0) {
      var mesh = provinceIntersects[0].object;
      if (mesh !== hoveredProvince) {
        setHoveredProvince(mesh);
      }
      renderer.domElement.style.cursor = 'pointer';
    } else {
      if (hoveredProvince) setHoveredProvince(null);
      renderer.domElement.style.cursor = 'grab';
    }
  }

  function onMouseClick(event) {
    if (event.defaultPrevented) return;
    if (editMode && viewMode === 'mountain') return;

    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 全局视图：点击标记触发回调（由回调统一处理飞入逻辑）
    if (viewMode === 'global') {
      var intersects = raycaster.intersectObjects(markersGroup.children, true);
      if (intersects.length > 0) {
        var obj = intersects[0].object;
        while (obj && !obj.userData.routeId) {
          obj = obj.parent;
        }
        if (obj && obj.userData.routeId && obj.userData.route) {
          event.preventDefault();
          if (onRouteClick) {
            onRouteClick(obj.userData.route);
          }
        }
      }
    }
  }

  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    if (composer && bloomEnabled) {
      composer.setSize(container.clientWidth, container.clientHeight);
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    // 更新控制器（相机动画期间或编辑模式中跳过，避免冲突）
    if (controls && !isCameraAnimating && controls.enabled) {
      controls.update();
    }

    // 更新大气层着色器的 viewVector
    atmosphereGroup.children.forEach(function(child) {
      if (child.material && child.material.uniforms && child.material.uniforms.viewVector) {
        child.material.uniforms.viewVector.value.copy(camera.position);
      }
    });

    // 标记动画：呼吸缩放 + 悬停放大平滑过渡
    var time = Date.now() * 0.001;
    markerMeshes.forEach(function(marker, index) {
      // 平滑过渡到目标缩放
      var current = marker.userData.currentScale || 1.0;
      var target = marker.userData.targetScale || 1.0;
      current += (target - current) * 0.15;
      marker.userData.currentScale = current;

      // 呼吸效果（在当前缩放上叠加）
      var breathe = 1 + Math.sin(time * 0.8 + index * 0.5) * 0.05;
      var totalScale = current * breathe;
      marker.scale.set(totalScale, totalScale, totalScale);
      
      // 子元素的环和光晕独立动画
      marker.children.forEach(function(child) {
        if (child.userData.isOuterRing) {
          var pulse = 1 + Math.sin(time * 1.2 + index * 0.7) * 0.1;
          child.scale.set(1 / breathe * pulse, 1 / breathe * pulse, 1 / breathe * pulse);
        }
        if (child.userData.isInnerRing) {
          var pulse2 = 1 + Math.sin(time * 1.5 + index * 0.3) * 0.06;
          child.scale.set(1 / breathe * pulse2, 1 / breathe * pulse2, 1 / breathe * pulse2);
        }
        if (child.userData.isTopGlow) {
          var glowPulse = 1 + Math.sin(time * 1.8 + index * 0.6) * 0.15;
          child.scale.set(1 / breathe * glowPulse, 1 / breathe * glowPulse, 1 / breathe * glowPulse);
        }
      });
    });

    // POI标记呼吸动画
    if (poiGroup) {
      var poiTime = Date.now() * 0.001;
      poiGroup.children.forEach(function(marker, idx) {
        if (marker.userData.pulse) {
          var phase = (poiTime + idx * 0.7) % 2.5;
          var pulseOpacity = Math.max(0, 0.5 - phase * 0.2);
          var pulseScale = 1 + phase * 0.5;
          marker.userData.pulse.material.opacity = pulseOpacity;
          marker.userData.pulse.scale.set(pulseScale, 1, pulseScale);
        }
        if (marker.userData.icon) {
          var bob = Math.sin(poiTime * 2 + idx * 0.9) * 0.05;
          marker.userData.icon.position.y = 0.95 + bob;
        }
      });
    }

    // 渲染
    if (bloomEnabled && composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  function setOnRouteClick(callback) {
    onRouteClick = callback;
  }

  function flyTo(route, duration) {
    duration = duration || 1500;
    if (!controls || !route) return;
    if (isCameraAnimating) return;
    if (viewMode !== 'global') return;
    isCameraAnimating = true;

    var pos = lngLatToSphere(route.lng, route.lat, CONFIG.sphereRadius + CONFIG.mapHeight);

    // 目标相机位置（在目标点上方一定距离，保持在球面外）
    var targetDistance = CONFIG.sphereRadius * 1.6; // 球面半径的 1.6 倍，确保在外面
    var normal = pos.clone().normalize();
    var targetPos = normal.clone().multiplyScalar(targetDistance);

    // 稍微偏移一下视角，不要正对（制造一点角度）
    var offset = new THREE.Vector3(
      normal.z * 15 - normal.y * 8,
      normal.x * 8,
      -normal.x * 15
    );
    targetPos.add(offset);
    // 确保偏移后仍然在球面外
    if (targetPos.length() < CONFIG.sphereRadius * 1.4) {
      targetPos.normalize().multiplyScalar(CONFIG.sphereRadius * 1.4);
    }

    var startPos = camera.position.clone();
    var startTarget = controls.target.clone();
    // 目标看向点：不是球心，是标记点附近稍微偏球心的位置
    var endTarget = pos.clone().multiplyScalar(0.3);
    var startTime = Date.now();

    function animateFly() {
      var elapsed = Date.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      var easeT = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startPos, targetPos, easeT);
      controls.target.lerpVectors(startTarget, endTarget, easeT);
      camera.lookAt(controls.target);

      if (t < 1) {
        requestAnimationFrame(animateFly);
      } else {
        camera.position.copy(targetPos);
        controls.target.copy(endTarget);
        camera.lookAt(controls.target);
        isCameraAnimating = false;
      }
    }

    animateFly();
  }

  function resetView() {
    if (!controls) return;
    if (isCameraAnimating) return;
    if (viewMode !== 'global') return;
    isCameraAnimating = true;

    var endPos = new THREE.Vector3();
    var beta = (CONFIG.cameraBeta * Math.PI) / 180;
    var alpha = (CONFIG.cameraAlpha * Math.PI) / 180;
    endPos.x = CONFIG.cameraDistance * Math.sin(alpha) * Math.sin(beta);
    endPos.y = CONFIG.cameraDistance * Math.cos(alpha);
    endPos.z = CONFIG.cameraDistance * Math.sin(alpha) * Math.cos(beta);

    var targetPos = new THREE.Vector3(0, CONFIG.cameraTargetOffsetY, 0);
    var startPos = camera.position.clone();
    var startTarget = controls.target.clone();
    var startTime = Date.now();
    var duration = 1200;

    function animateReset() {
      var elapsed = Date.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      var easeT = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startPos, endPos, easeT);
      controls.target.lerpVectors(startTarget, targetPos, easeT);
      camera.lookAt(controls.target);

      if (t < 1) {
        requestAnimationFrame(animateReset);
      } else {
        camera.position.copy(endPos);
        controls.target.copy(targetPos);
        camera.lookAt(controls.target);
        isCameraAnimating = false;
      }
    }

    animateReset();
  }

  // ========== 山峰地形模式 ==========

  // 简化的柏林噪声（用于地形起伏）
  function simpleNoise(x, y, seed) {
    var n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return n - Math.floor(n);
  }

  function smoothNoise(x, y, seed) {
    var xInt = Math.floor(x);
    var yInt = Math.floor(y);
    var xFrac = x - xInt;
    var yFrac = y - yInt;
    var v00 = simpleNoise(xInt, yInt, seed);
    var v10 = simpleNoise(xInt + 1, yInt, seed);
    var v01 = simpleNoise(xInt, yInt + 1, seed);
    var v11 = simpleNoise(xInt + 1, yInt + 1, seed);
    var sx = xFrac * xFrac * (3 - 2 * xFrac);
    var sy = yFrac * yFrac * (3 - 2 * yFrac);
    var v0 = v00 * (1 - sx) + v10 * sx;
    var v1 = v01 * (1 - sx) + v11 * sx;
    return v0 * (1 - sy) + v1 * sy;
  }

  // 多层噪声
  function fbmNoise(x, y, seed, octaves) {
    octaves = octaves || 4;
    var value = 0;
    var amplitude = 1;
    var frequency = 1;
    var maxValue = 0;
    for (var i = 0; i < octaves; i++) {
      value += smoothNoise(x * frequency, y * frequency, seed + i * 100) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxValue;
  }

  // 带山脊特征的噪声（用于生成真实山脉山脊线）
  function ridgeNoiseVal(x, y, seed, octaves) {
    octaves = octaves || 4;
    var value = 0;
    var amplitude = 1;
    var frequency = 1;
    var maxValue = 0;
    for (var i = 0; i < octaves; i++) {
      var n = 1.0 - Math.abs(smoothNoise(x * frequency, y * frequency, seed + i * 100) * 2 - 1);
      n = n * n;
      value += n * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxValue;
  }

  // 计算点到线段的距离（用于山脊线生成）
  function distanceToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    if (lenSq < 0.0001) {
      var ddx = px - ax;
      var ddy = py - ay;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    var projX = ax + t * dx;
    var projY = ay + t * dy;
    var rdx = px - projX;
    var rdy = py - projY;
    return Math.sqrt(rdx * rdx + rdy * rdy);
  }

  // 真实地形高度（带山脊连接和山谷侵蚀）
  function getRealisticTerrainHeight(x, y, terrain, seed) {
    if (!terrain || !terrain.peaks) return 0;
    var baseHeight = terrain.baseHeight || 1000;
    var peaks = terrain.peaks;
    var maxPeakHeight = 0;
    for (var pi = 0; pi < peaks.length; pi++) {
      if (peaks[pi].height > maxPeakHeight) maxPeakHeight = peaks[pi].height;
    }
    var relief = maxPeakHeight - baseHeight;

    // 基础地形起伏
    var baseNoise = fbmNoise(x * 3.5, y * 3.5, seed, 6);
    var height = (baseNoise - 0.35) * relief * 0.3;

    // 主峰高斯影响
    var peakInfluence = new Array(peaks.length);
    var totalInfluence = 0;
    for (var i = 0; i < peaks.length; i++) {
      var peak = peaks[i];
      var dx = x - peak.x;
      var dy = y - peak.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var peakWidth = 0.16 + (peak.height - baseHeight) / 8000;
      var infl = Math.exp(-(dist * dist) / (peakWidth * peakWidth));
      peakInfluence[i] = infl;
      totalInfluence += infl;
      height += infl * (peak.height - baseHeight) * 0.75;
    }

    // 山脊线连接（相邻山峰之间形成连续山脊而非孤立圆锥）
    if (terrain.ridgeConnections) {
      for (var rc = 0; rc < terrain.ridgeConnections.length; rc++) {
        var conn = terrain.ridgeConnections[rc];
        var p1 = peaks[conn[0]];
        var p2 = peaks[conn[1]];
        if (!p1 || !p2) continue;
        var ridgeDist = distanceToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
        var ridgeWidth = 0.08;
        var ridgeFalloff = Math.exp(-(ridgeDist * ridgeDist) / (ridgeWidth * ridgeWidth));
        var ridgeHeight = Math.min(p1.height, p2.height) - baseHeight;
        var segLen = Math.sqrt((p2.x-p1.x)*(p2.x-p1.x)+(p2.y-p1.y)*(p2.y-p1.y));
        var t = segLen > 0.001 ? Math.max(0, Math.min(1, ((x-p1.x)*(p2.x-p1.x)+(y-p1.y)*(p2.y-p1.y))/(segLen*segLen))) : 0.5;
        var saddleDip = 0.7 + 0.3 * Math.sin(t * Math.PI);
        var rNoise = ridgeNoiseVal(x * 8, y * 8, seed + 200, 3);
        height += ridgeFalloff * ridgeHeight * 0.22 * saddleDip * (0.7 + rNoise * 0.3);
      }
    }

    // 侵蚀细节：多尺度噪声增加真实感
    var detail1 = (fbmNoise(x * 15, y * 15, seed + 50, 4) - 0.5) * relief * 0.08;
    var detail2 = (ridgeNoiseVal(x * 25, y * 25, seed + 150, 3) - 0.5) * relief * 0.04;
    height += detail1 + detail2;

    // 山谷侵蚀：低海拔区域略微下沉形成山谷
    var valleyNoise = 1 - fbmNoise(x * 2 + 100, y * 2 + 100, seed + 300, 3);
    height -= valleyNoise * relief * 0.08;

    // 边缘衰减：避免地形边界生硬
    var edgeX = Math.abs(x - 0.5) * 2;
    var edgeY = Math.abs(y - 0.5) * 2;
    var edgeDist = Math.max(edgeX, edgeY);
    if (edgeDist > 0.7) {
      var edgeFade = 1 - (edgeDist - 0.7) / 0.3;
      height *= edgeFade * edgeFade;
    }

    return Math.max(baseHeight, baseHeight + height);
  }

  // 真实地形Shader材质（海拔渐变着色）
  function createTerrainShaderMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMinHeight: { value: 0.0 },
        uMaxHeight: { value: 1.0 },
        uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
        uColorLow: { value: new THREE.Color(0x2a4a35) },
        uColorMidLow: { value: new THREE.Color(0x3d6b4a) },
        uColorMid: { value: new THREE.Color(0x6b6355) },
        uColorHigh: { value: new THREE.Color(0x7a7570) },
        uColorSummit: { value: new THREE.Color(0xe8e8f0) },
        uRoughness: { value: 0.85 },
        uAmbient: { value: 0.42 }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'varying float vHeight;',
        'varying float vSlope;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vWorldPos = wp.xyz;',
        '  vHeight = position.y;',
        '  vSlope = 1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uMinHeight;',
        'uniform float uMaxHeight;',
        'uniform vec3 uLightDir;',
        'uniform vec3 uColorLow;',
        'uniform vec3 uColorMidLow;',
        'uniform vec3 uColorMid;',
        'uniform vec3 uColorHigh;',
        'uniform vec3 uColorSummit;',
        'uniform float uRoughness;',
        'uniform float uAmbient;',
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'varying float vHeight;',
        'varying float vSlope;',
        '',
        'vec3 terrainColor(float t) {',
        '  t = clamp(t, 0.0, 1.0);',
        '  if (t < 0.25) {',
        '    return mix(uColorLow, uColorMidLow, t / 0.25);',
        '  } else if (t < 0.5) {',
        '    return mix(uColorMidLow, uColorMid, (t - 0.25) / 0.25);',
        '  } else if (t < 0.78) {',
        '    return mix(uColorMid, uColorHigh, (t - 0.5) / 0.28);',
        '  } else {',
        '    return mix(uColorHigh, uColorSummit, (t - 0.78) / 0.22);',
        '  }',
        '}',
        '',
        'void main() {',
        '  float hRange = uMaxHeight - uMinHeight;',
        '  float t = hRange > 0.001 ? (vHeight - uMinHeight) / hRange : 0.5;',
        '  vec3 baseCol = terrainColor(t);',
        '  float slopeDarken = 1.0 - vSlope * 0.25;',
        '  baseCol *= slopeDarken;',
        '  float NdotL = max(dot(normalize(vNormal), uLightDir), 0.0);',
        '  float lighting = uAmbient + NdotL * (1.0 - uAmbient);',
        '  vec3 finalCol = baseCol * lighting;',
        '  float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 3.0);',
        '  finalCol += rim * 0.08;',
        '  gl_FragColor = vec4(finalCol, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.DoubleSide
    });
  }

  // 获取某点的地形高度
  function getTerrainHeight(x, y, terrain, seed) {
    if (!terrain || !terrain.peaks) return 0;
    var baseHeight = terrain.baseHeight || 1000;
    var height = 0;
    var maxPeakHeight = 0;
    for (var pi = 0; pi < terrain.peaks.length; pi++) {
      if (terrain.peaks[pi].height > maxPeakHeight) maxPeakHeight = terrain.peaks[pi].height;
    }
    var terrainHeight = maxPeakHeight - baseHeight;
    var noiseVal = fbmNoise(x * 4, y * 4, seed, 5);
    height = noiseVal * terrainHeight * 0.25;
    for (var i = 0; i < terrain.peaks.length; i++) {
      var peak = terrain.peaks[i];
      var dx = x - peak.x;
      var dy = y - peak.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var peakWidth = 0.08 + (peak.height - baseHeight) / 15000;
      var peakInfluence = Math.exp(-(dist * dist) / (peakWidth * peakWidth));
      var peakHeight = peak.height - baseHeight - noiseVal * terrainHeight * 0.25;
      height += peakInfluence * peakHeight;
    }
    var detailNoise = fbmNoise(x * 12, y * 12, seed + 50, 3);
    height += (detailNoise - 0.5) * (terrainHeight * 0.06);
    return baseHeight + height;
  }

  // 获取地形颜色（基于高度）
  function getTerrainColor(height, terrain, baseHeight, maxHeight) {
    var t = (height - baseHeight) / (maxHeight - baseHeight);
    t = Math.max(0, Math.min(1, t));
    var style = terrain.style || 'alpine_meadow';
    var color = new THREE.Color();
    if (style === 'snow_mountain') {
      if (t < 0.25) {
        color.setHSL(0.08, 0.15, 0.22 + t * 0.08);
      } else if (t < 0.55) {
        var tt = (t - 0.25) / 0.3;
        color.setHSL(0.08, 0.12 - tt * 0.08, 0.3 + tt * 0.2);
      } else {
        color.setHSL(0.6, 0.08, 0.75 + (t - 0.55) * 0.2);
      }
    } else if (style === 'rocky_alpine') {
      if (t < 0.4) {
        color.setHSL(0.08, 0.08, 0.25 + t * 0.08);
      } else if (t < 0.8) {
        color.setHSL(0.05, 0.05, 0.33 + (t - 0.4) * 0.17);
      } else {
        color.setHSL(0.6, 0.08, 0.65 + (t - 0.8) * 0.2);
      }
    } else if (style === 'grassland') {
      if (t < 0.45) {
        color.setHSL(0.27, 0.32, 0.22 + t * 0.12);
      } else if (t < 0.8) {
        var tt = (t - 0.45) / 0.35;
        color.setHSL(0.25 - tt * 0.05, 0.28 - tt * 0.15, 0.34 + tt * 0.08);
      } else {
        color.setHSL(0.08, 0.08, 0.48);
      }
    } else if (style === 'highland') {
      if (t < 0.25) {
        color.setHSL(0.3, 0.22, 0.28 + t * 0.08);
      } else if (t < 0.55) {
        var tt = (t - 0.25) / 0.3;
        color.setHSL(0.12 - tt * 0.07, 0.12 - tt * 0.07, 0.36 + tt * 0.08);
      } else if (t < 0.8) {
        var tt2 = (t - 0.55) / 0.25;
        color.setHSL(0.05, 0.06, 0.44 + tt2 * 0.12);
      } else {
        color.setHSL(0.6, 0.08, 0.82);
      }
    } else if (style === 'industrial') {
      color.setHSL(0.08, 0.12, 0.2 + t * 0.15);
    } else {
      if (t < 0.5) {
        color.setHSL(0.3, 0.25, 0.28 + t * 0.1);
      } else {
        color.setHSL(0.1, 0.08, 0.38 + (t - 0.5) * 0.25);
      }
    }
    return color;
  }

  // 创建真实DEM风格山峰地形
  function createRealisticTerrainMesh(route) {
    var group = new THREE.Group();
    group.name = 'mountain_terrain';
    var terrain = route.terrain;
    var seed = route.lng * 1000 + route.lat;
    var baseHeight = terrain.baseHeight || 1000;
    var maxHeight = baseHeight;
    for (var p = 0; p < terrain.peaks.length; p++) {
      if (terrain.peaks[p].height > maxHeight) maxHeight = terrain.peaks[p].height;
    }
    var size = 80;
    var segments = 256;
    var heightScale = 0.016;

    var geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    var positions = geometry.attributes.position;
    var minScaledH = Infinity;
    var maxScaledH = -Infinity;
    var heightValues = new Float32Array(positions.count);

    for (var i = 0; i < positions.count; i++) {
      var x = positions.getX(i);
      var z = positions.getZ(i);
      var nx = (x + size / 2) / size;
      var nz = (z + size / 2) / size;
      var h = getRealisticTerrainHeight(nx, nz, terrain, seed);
      var scaledH = (h - baseHeight) * heightScale;
      heightValues[i] = scaledH;
      if (scaledH < minScaledH) minScaledH = scaledH;
      if (scaledH > maxScaledH) maxScaledH = scaledH;
      positions.setY(i, scaledH);
    }
    geometry.computeVertexNormals();

    var shaderMat = createTerrainShaderMaterial();
    shaderMat.uniforms.uMinHeight.value = minScaledH;
    shaderMat.uniforms.uMaxHeight.value = maxScaledH;
    shaderMat.uniforms.uLightDir.value.set(-0.4, 0.85, 0.35).normalize();

    var mesh = new THREE.Mesh(geometry, shaderMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.isTerrain = true;
    mesh.userData.routeId = route.id;
    mesh.userData.segments = segments;
    mesh.userData.size = size;
    mesh.userData.heightScale = heightScale;
    mesh.userData.isRealistic = true;
    mesh.userData.heightValues = heightValues;
    mesh.userData.baseHeight = baseHeight;
    mesh.userData.maxHeight = maxHeight;
    group.add(mesh);
    return { group: group, mesh: mesh, size: size, segments: segments, heightScale: heightScale, minScaledH: minScaledH, maxScaledH: maxScaledH };
  }

  // 获取真实地形高度（用于路径/标记贴合地面）
  function getRealisticHeightAt(nx, nz, terrainResult) {
    if (!terrainResult || !terrainResult.mesh) return 0;
    var mesh = terrainResult.mesh;
    var segments = mesh.userData.segments;
    var heightValues = mesh.userData.heightValues;
    var size = mesh.userData.size;
    nx = Math.max(0, Math.min(1, nx));
    nz = Math.max(0, Math.min(1, nz));
    var gx = nx * segments;
    var gz = nz * segments;
    var ix = Math.floor(gx);
    var iz = Math.floor(gz);
    var fx = gx - ix;
    var fz = gz - iz;
    ix = Math.min(ix, segments - 1);
    iz = Math.min(iz, segments - 1);
    var i00 = iz * (segments + 1) + ix;
    var i10 = iz * (segments + 1) + Math.min(ix + 1, segments);
    var i01 = Math.min(iz + 1, segments) * (segments + 1) + ix;
    var i11 = Math.min(iz + 1, segments) * (segments + 1) + Math.min(ix + 1, segments);
    var h00 = heightValues[i00] || 0;
    var h10 = heightValues[i10] || 0;
    var h01 = heightValues[i01] || 0;
    var h11 = heightValues[i11] || 0;
    var h0 = h00 * (1 - fx) + h10 * fx;
    var h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  // 完整真实地形场景（包含地形、山峰标记、路线、营地）
  function createRealisticMountainTerrain(route) {
    var group = new THREE.Group();
    group.name = 'mountain_terrain_realistic';
    var terrain = route.terrain;
    var seed = route.lng * 1000 + route.lat;
    var baseHeight = terrain.baseHeight || 1000;
    var result = createRealisticTerrainMesh(route);
    terrainMesh = result.mesh;
    var size = result.size;
    var heightScale = result.heightScale;
    var tMesh = result.mesh;
    group.add(tMesh);

    // 山峰标记
    for (var pi = 0; pi < terrain.peaks.length; pi++) {
      var peak = terrain.peaks[pi];
      var peakX = (peak.x - 0.5) * size;
      var peakZ = (peak.y - 0.5) * size;
      var peakY = getRealisticHeightAt(peak.x, peak.y, result);

      var peakGeo = new THREE.ConeGeometry(0.6, 2.0, 8);
      var peakMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x4488ff,
        emissiveIntensity: 0.4,
        roughness: 0.3
      });
      var peakMesh = new THREE.Mesh(peakGeo, peakMat);
      peakMesh.position.set(peakX, peakY + 1.1, peakZ);
      peakMesh.userData.isPeak = true;
      peakMesh.userData.peakName = peak.name;
      peakMesh.userData.peakHeight = peak.height;
      group.add(peakMesh);

      var lc = document.createElement('canvas');
      var lctx = lc.getContext('2d');
      lc.width = 256;
      lc.height = 64;
      lctx.font = 'bold 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      lctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      lctx.textAlign = 'center';
      lctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      lctx.shadowBlur = 6;
      lctx.fillText(peak.name, 128, 26);
      lctx.font = '16px -apple-system, "PingFang SC", sans-serif';
      lctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
      lctx.fillText(peak.height + 'm', 128, 50);
      var lt = new THREE.CanvasTexture(lc);
      var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
      var ls = new THREE.Sprite(lm);
      ls.position.set(peakX, peakY + 4.5, peakZ);
      ls.scale.set(6, 1.5, 1);
      group.add(ls);
    }

    // 徒步行走路线
    if (terrain.trailPoints && terrain.trailPoints.length > 1) {
      var ctrlPts2D = [];
      for (var ti = 0; ti < terrain.trailPoints.length; ti++) {
        var tp = terrain.trailPoints[ti];
        ctrlPts2D.push(new THREE.Vector3(tp.x, 0, tp.y));
      }
      var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.1);
      var sampleCount = Math.max(120, terrain.trailPoints.length * 25);
      var groundOffset = 0.4;
      var trailPoints = [];
      for (var si = 0; si <= sampleCount; si++) {
        var t = si / sampleCount;
        var pt = curve2D.getPoint(t);
        var ux = pt.x;
        var uz = pt.z;
        var sx = (ux - 0.5) * size;
        var sz = (uz - 0.5) * size;
        var sy = getRealisticHeightAt(ux, uz, result) + groundOffset;
        trailPoints.push(new THREE.Vector3(sx, sy, sz));
      }
      var trailCurve = new THREE.CatmullRomCurve3(trailPoints, false, 'catmullrom', 0.0);
      var tubeGeo = new THREE.TubeGeometry(trailCurve, 300, 0.12, 6, false);
      var tubeMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      var tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.renderOrder = 999;
      tubeMesh.userData.isTrail = true;
      group.add(tubeMesh);
      var glowGeo = new THREE.TubeGeometry(trailCurve, 300, 0.32, 6, false);
      var glowMat = new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.renderOrder = 998;
      glowMesh.userData.isTrail = true;
      group.add(glowMesh);

      for (var ti2 = 0; ti2 < terrain.trailPoints.length; ti2++) {
        var tp2 = terrain.trailPoints[ti2];
        var tpx = (tp2.x - 0.5) * size;
        var tpz = (tp2.y - 0.5) * size;
        var tpy = getRealisticHeightAt(tp2.x, tp2.y, result) + groundOffset + 0.2;
        var dotGeo = new THREE.SphereGeometry(0.18, 12, 12);
        var dotMat = new THREE.MeshStandardMaterial({
          color: 0xffcc44,
          emissive: 0xffaa00,
          emissiveIntensity: 1.0,
          roughness: 0.2
        });
        var dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.set(tpx, tpy, tpz);
        dotMesh.userData.isTrailDot = true;
        group.add(dotMesh);
        if (tp2.name) {
          var tplc = document.createElement('canvas');
          var tplctx = tplc.getContext('2d');
          tplc.width = 200;
          tplc.height = 48;
          tplctx.font = 'bold 17px -apple-system, "PingFang SC", sans-serif';
          tplctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
          tplctx.textAlign = 'center';
          tplctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          tplctx.shadowBlur = 4;
          tplctx.fillText(tp2.name, 100, 28);
          var tplt = new THREE.CanvasTexture(tplc);
          var tplm = new THREE.SpriteMaterial({ map: tplt, transparent: true, depthTest: false, depthWrite: false });
          var tpls = new THREE.Sprite(tplm);
          tpls.position.set(tpx, tpy + 2, tpz);
          tpls.scale.set(4, 1, 1);
          tpls.userData.isTrailLabel = true;
          group.add(tpls);
        }
      }
    }

    // 营地标记
    if (terrain.camps) {
      for (var ci = 0; ci < terrain.camps.length; ci++) {
        var camp = terrain.camps[ci];
        var cx = (camp.x - 0.5) * size;
        var cz = (camp.y - 0.5) * size;
        var cy = getRealisticHeightAt(camp.x, camp.y, result) + 0.3;
        var tentGeo = new THREE.ConeGeometry(0.7, 1.1, 4);
        var tentMat = new THREE.MeshStandardMaterial({
          color: 0x66ff88,
          emissive: 0x228833,
          emissiveIntensity: 0.4,
          roughness: 0.6
        });
        var tentMesh = new THREE.Mesh(tentGeo, tentMat);
        tentMesh.position.set(cx, cy + 0.55, cz);
        tentMesh.rotation.y = Math.PI / 4;
        tentMesh.userData.isCamp = true;
        group.add(tentMesh);
        if (camp.name) {
          var clc = document.createElement('canvas');
          var clctx = clc.getContext('2d');
          clc.width = 180;
          clc.height = 40;
          clctx.font = 'bold 15px -apple-system, "PingFang SC", sans-serif';
          clctx.fillStyle = 'rgba(120, 255, 150, 0.95)';
          clctx.textAlign = 'center';
          clctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          clctx.shadowBlur = 4;
          clctx.fillText(camp.name, 90, 25);
          var clt = new THREE.CanvasTexture(clc);
          var clm = new THREE.SpriteMaterial({ map: clt, transparent: true, depthTest: false, depthWrite: false });
          var cls = new THREE.Sprite(clm);
          cls.position.set(cx, cy + 2.2, cz);
          cls.scale.set(3.5, 0.8, 1);
          cls.userData.isCampLabel = true;
          group.add(cls);
        }
      }
    }

    tMesh.userData.terrainResult = result;
    return group;
  }

  // ========== POI用户标记系统 ==========

  function createPOIMarkerGeometry(shape) {
    switch (shape) {
      case 'drop':
        return new THREE.ConeGeometry(0.35, 0.9, 6);
      case 'tent':
        return new THREE.ConeGeometry(0.45, 0.9, 4);
      case 'warning':
        var shape = new THREE.Shape();
        shape.moveTo(0, 0.6);
        shape.lineTo(-0.5, -0.4);
        shape.lineTo(0.5, -0.4);
        shape.lineTo(0, 0.6);
        var geo = new THREE.ShapeGeometry(shape);
        return geo;
      case 'binocular':
        return new THREE.CylinderGeometry(0.25, 0.35, 0.7, 8);
      case 'fork':
        return new THREE.OctahedronGeometry(0.4, 0);
      case 'door':
        return new THREE.BoxGeometry(0.5, 0.8, 0.15);
      case 'box':
        return new THREE.BoxGeometry(0.55, 0.55, 0.55);
      case 'note':
      default:
        return new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16);
    }
  }

  function createPOIMarker3D(poi) {
    var typeDef = POI_TYPES[poi.type] || POI_TYPES.note;
    var group = new THREE.Group();

    var baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.12, 12);
    var baseMat = new THREE.MeshStandardMaterial({
      color: typeDef.color,
      emissive: typeDef.emissive,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.2
    });
    var base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.06;
    group.add(base);

    var stemGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6);
    var stemMat = new THREE.MeshStandardMaterial({
      color: typeDef.color,
      emissive: typeDef.emissive,
      emissiveIntensity: 0.3,
      roughness: 0.5
    });
    var stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.42;
    group.add(stem);

    var iconGeo = createPOIMarkerGeometry(typeDef.shape);
    var iconMat = new THREE.MeshStandardMaterial({
      color: typeDef.color,
      emissive: typeDef.emissive,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.3
    });
    var icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.y = 0.95;
    if (typeDef.shape === 'warning') icon.rotation.x = 0;
    if (typeDef.shape === 'tent') icon.rotation.y = Math.PI / 4;
    group.add(icon);

    var ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    ringGeo.rotateX(-Math.PI / 2);
    var ringMat = new THREE.MeshBasicMaterial({
      color: typeDef.color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02;
    group.add(ring);

    if (poi.name) {
      var lc = document.createElement('canvas');
      var lctx = lc.getContext('2d');
      var text = typeDef.icon + ' ' + poi.name;
      var maxWidth = 300;
      var fontSize = 15;
      lctx.font = 'bold ' + fontSize + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      var metrics = lctx.measureText(text);
      var textWidth = Math.min(maxWidth, Math.ceil(metrics.width) + 24);
      lc.width = textWidth;
      lc.height = 36;
      lctx.font = 'bold ' + fontSize + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      var r = parseInt(typeDef.color.toString(16).padStart(6, '0').substr(0, 2), 16);
      var g = parseInt(typeDef.color.toString(16).padStart(6, '0').substr(2, 2), 16);
      var b = parseInt(typeDef.color.toString(16).padStart(6, '0').substr(4, 2), 16);
      var cssColor = 'rgba(' + r + ',' + g + ',' + b + ',0.95)';
      lctx.fillStyle = cssColor;
      lctx.textAlign = 'center';
      lctx.shadowColor = 'rgba(0,0,0,0.9)';
      lctx.shadowBlur = 5;
      lctx.fillText(text, textWidth / 2, 23);
      var lt = new THREE.CanvasTexture(lc);
      var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
      var ls = new THREE.Sprite(lm);
      ls.position.y = 1.7;
      var aspect = textWidth / 36;
      ls.scale.set(aspect * 0.9, 0.9, 1);
      ls.userData.isPOILabel = true;
      group.add(ls);
    }

    var colHex = typeDef.color;
    var pulseGeo = new THREE.RingGeometry(0.7, 0.9, 32);
    pulseGeo.rotateX(-Math.PI / 2);
    var pulseMat = new THREE.MeshBasicMaterial({
      color: colHex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.position.y = 0.03;
    pulse.userData.isPulse = true;
    group.add(pulse);

    group.userData.isPOI = true;
    group.userData.poiId = poi.id;
    group.userData.poiData = poi;
    group.userData.base = base;
    group.userData.icon = icon;
    group.userData.ring = ring;
    group.userData.pulse = pulse;
    group.userData.label = ls || null;

    return group;
  }

  function getTerrainHeightAtUV(nx, nz) {
    if (!terrainMesh) return 0;
    if (terrainMesh.userData.isRealistic) {
      var terrainResult = terrainMesh.userData.terrainResult;
      return getRealisticHeightAt(nx, nz, terrainResult);
    }
    return getVertexHeightAt((nx - 0.5) * (terrainMesh.userData.size || 60), (nz - 0.5) * (terrainMesh.userData.size || 60));
  }

  function rebuildPOIMarkers() {
    if (poiGroup) {
      mountainGroup.remove(poiGroup);
      poiGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }
    poiGroup = new THREE.Group();
    poiGroup.name = 'poi_markers';
    if (!mountainGroup || !currentMountainRoute) return;

    var terrainSize = terrainMesh ? terrainMesh.userData.size : 60;
    var pois = getPOIsForRoute(currentMountainRoute.id);
    for (var i = 0; i < pois.length; i++) {
      var poi = pois[i];
      var marker = createPOIMarker3D(poi);
      var wx = (poi.x - 0.5) * terrainSize;
      var wz = (poi.y - 0.5) * terrainSize;
      var wy = getTerrainHeightAtUV(poi.x, poi.y);
      marker.position.set(wx, wy, wz);
      poiGroup.add(marker);
    }
    mountainGroup.add(poiGroup);
  }

  function createPOIPreviewMarker(type) {
    if (poiPreviewMarker) {
      mountainGroup.remove(poiPreviewMarker);
      poiPreviewMarker.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      poiPreviewMarker = null;
    }
    var fakePoi = { id: 'preview', type: type, name: '' };
    var marker = createPOIMarker3D(fakePoi);
    marker.traverse(function(obj) {
      if (obj.material) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        obj.material.opacity = 0.6;
      }
    });
    if (marker.userData.pulse) marker.remove(marker.userData.pulse);
    marker.visible = false;
    poiPreviewMarker = marker;
    if (mountainGroup) mountainGroup.add(marker);
  }

  function showPOIEditPanel(poi, isNew, screenX, screenY) {
    hidePOIEditPanel();
    var panel = document.createElement('div');
    panel.id = 'poi-edit-panel';
    var typeDef = POI_TYPES[poi.type] || POI_TYPES.note;
    var typeButtonsHTML = '';
    var typeKeys = Object.keys(POI_TYPES);
    for (var ti = 0; ti < typeKeys.length; ti++) {
      var tk = typeKeys[ti];
      var td = POI_TYPES[tk];
      var isActive = (tk === poi.type) ? 'background:rgba(100,180,255,0.3);border-color:rgba(120,200,255,0.7);' : '';
      typeButtonsHTML += '<button data-poi-type="' + tk + '" style="' + isActive + 'padding:6px 8px;margin:2px;background:rgba(40,55,80,0.6);border:1px solid rgba(80,120,160,0.4);border-radius:6px;color:#dde;cursor:pointer;font-size:18px;transition:all 0.2s;" title="' + td.name + '">' + td.icon + '</button>';
    }
    panel.style.cssText = 'position:fixed;z-index:600;padding:14px;background:rgba(15,25,45,0.96);border:1px solid rgba(100,160,220,0.4);border-radius:12px;color:#c8d8f0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;backdrop-filter:blur(12px);box-shadow:0 8px 40px rgba(0,0,0,0.7);width:280px;';
    panel.style.left = Math.min(screenX + 20, window.innerWidth - 300) + 'px';
    panel.style.top = Math.min(screenY - 20, window.innerHeight - 300) + 'px';

    panel.innerHTML = ''
      + '<div style="font-size:14px;font-weight:600;color:' + 'rgb(' + parseInt(typeDef.color.toString(16).padStart(6,'0').substr(0,2),16) + ',' + parseInt(typeDef.color.toString(16).padStart(6,'0').substr(2,2),16) + ',' + parseInt(typeDef.color.toString(16).padStart(6,'0').substr(4,2),16) + ')' + ';margin-bottom:10px;display:flex;align-items:center;gap:6px;">'
      +   (isNew ? '📍 添加标记' : '✏️ 编辑标记')
      + '</div>'
      + '<div style="margin-bottom:10px;">'
      +   '<div style="margin-bottom:5px;font-size:12px;color:#9ab;">类型</div>'
      +   '<div id="poi-type-grid" style="display:flex;flex-wrap:wrap;gap:2px;">' + typeButtonsHTML + '</div>'
      + '</div>'
      + '<div style="margin-bottom:10px;">'
      +   '<div style="margin-bottom:5px;font-size:12px;color:#9ab;">名称/备注</div>'
      +   '<input id="poi-name-input" type="text" placeholder="例如：水源点、有落石..." value="' + (poi.name || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:7px 10px;background:rgba(20,35,55,0.9);border:1px solid rgba(80,130,180,0.4);border-radius:6px;color:#e8f0ff;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit;">'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      +   '<div style="margin-bottom:5px;font-size:12px;color:#9ab;">详细说明（可选）</div>'
      +   '<textarea id="poi-desc-input" placeholder="补充说明，如水量大小、危险情况..." rows="2" style="width:100%;padding:7px 10px;background:rgba(20,35,55,0.9);border:1px solid rgba(80,130,180,0.4);border-radius:6px;color:#e8f0ff;font-size:12px;outline:none;box-sizing:border-box;resize:none;font-family:inherit;">' + (poi.desc || '') + '</textarea>'
      + '</div>'
      + '<div style="display:flex;gap:6px;">'
      +   (isNew ? '' : '<button id="poi-delete-btn" style="flex:1;padding:8px;background:rgba(180,50,50,0.25);border:1px solid rgba(220,80,80,0.5);border-radius:6px;color:#ff9999;cursor:pointer;font-size:12px;">🗑️ 删除</button>')
      +   '<button id="poi-cancel-btn" style="flex:1;padding:8px;background:rgba(60,80,100,0.25);border:1px solid rgba(100,130,160,0.4);border-radius:6px;color:#aabbcc;cursor:pointer;font-size:12px;">取消</button>'
      +   '<button id="poi-save-btn" style="flex:1;padding:8px;background:rgba(60,160,110,0.3);border:1px solid rgba(80,200,140,0.5);border-radius:6px;color:#88ffbb;cursor:pointer;font-size:12px;font-weight:600;">✓ 保存</button>'
      + '</div>';

    document.body.appendChild(panel);
    poiEditPanel = panel;

    var nameInput = panel.querySelector('#poi-name-input');
    setTimeout(function() { nameInput.focus(); nameInput.select(); }, 50);

    panel.querySelectorAll('[data-poi-type]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newType = btn.getAttribute('data-poi-type');
        poi.type = newType;
        panel.querySelectorAll('[data-poi-type]').forEach(function(b) {
          b.style.background = 'rgba(40,55,80,0.6)';
          b.style.borderColor = 'rgba(80,120,160,0.4)';
        });
        btn.style.background = 'rgba(100,180,255,0.3)';
        btn.style.borderColor = 'rgba(120,200,255,0.7)';
        var newDef = POI_TYPES[newType] || POI_TYPES.note;
        var r = parseInt(newDef.color.toString(16).padStart(6,'0').substr(0,2),16);
        var g = parseInt(newDef.color.toString(16).padStart(6,'0').substr(2,2),16);
        var b = parseInt(newDef.color.toString(16).padStart(6,'0').substr(4,2),16);
        panel.querySelector('div[style*="font-weight:600"]').style.color = 'rgb(' + r + ',' + g + ',' + b + ')';
        if (poiPreviewMarker && isNew) {
          createPOIPreviewMarker(newType);
          poiPreviewMarker.visible = true;
          var terrainSize = terrainMesh ? terrainMesh.userData.size : 60;
          var wx = (poi.x - 0.5) * terrainSize;
          var wz = (poi.y - 0.5) * terrainSize;
          var wy = getTerrainHeightAtUV(poi.x, poi.y);
          poiPreviewMarker.position.set(wx, wy, wz);
        }
      });
    });

    panel.querySelector('#poi-cancel-btn').addEventListener('click', function() {
      if (isNew && poiPreviewMarker) {
        mountainGroup.remove(poiPreviewMarker);
        poiPreviewMarker = null;
      }
      hidePOIEditPanel();
      exitPOIPlacementMode();
    });

    if (!isNew) {
      panel.querySelector('#poi-delete-btn').addEventListener('click', function() {
        deletePOI(poi.id);
        hidePOIEditPanel();
        exitPOIPlacementMode();
      });
    }

    panel.querySelector('#poi-save-btn').addEventListener('click', function() {
      poi.name = nameInput.value.trim();
      poi.desc = panel.querySelector('#poi-desc-input').value.trim();
      if (!poi.name && !poi.desc) {
        var typeDef2 = POI_TYPES[poi.type] || POI_TYPES.note;
        poi.name = typeDef2.name;
      }
      if (isNew) {
        addPOI(poi);
      } else {
        updatePOI(poi);
      }
      hidePOIEditPanel();
      exitPOIPlacementMode();
    });

    nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        panel.querySelector('#poi-save-btn').click();
      }
      if (e.key === 'Escape') {
        panel.querySelector('#poi-cancel-btn').click();
      }
    });

    function onDocClick(e) {
      if (!panel.contains(e.target)) {
        document.removeEventListener('mousedown', onDocClick);
      }
    }
    setTimeout(function() { document.addEventListener('mousedown', onDocClick); }, 100);
  }

  function hidePOIEditPanel() {
    if (poiEditPanel && poiEditPanel.parentNode) {
      poiEditPanel.parentNode.removeChild(poiEditPanel);
    }
    poiEditPanel = null;
  }

  function getPOIStorageKey() {
    return 'taillog_poi_markers';
  }

  function loadAllPOIs() {
    try {
      var raw = localStorage.getItem(getPOIStorageKey());
      if (!raw) return {};
      var data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch(e) { return {}; }
  }

  function saveAllPOIs(allData) {
    try {
      localStorage.setItem(getPOIStorageKey(), JSON.stringify(allData));
      if (typeof SyncModule !== 'undefined' && SyncModule.markDirty) SyncModule.markDirty('pois');
    } catch(e) {}
  }

  function getPOIsForRoute(routeId) {
    var all = loadAllPOIs();
    return all[routeId] || [];
  }

  function addPOI(poi) {
    var all = loadAllPOIs();
    if (!all[currentMountainRoute.id]) all[currentMountainRoute.id] = [];
    if (!poi.id) poi.id = 'poi_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    poi.createdAt = Date.now();
    all[currentMountainRoute.id].push(poi);
    saveAllPOIs(all);
    rebuildPOIMarkers();
  }

  function updatePOI(poi) {
    var all = loadAllPOIs();
    var list = all[currentMountainRoute.id] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === poi.id) {
        list[i].type = poi.type;
        list[i].name = poi.name;
        list[i].desc = poi.desc;
        break;
      }
    }
    saveAllPOIs(all);
    rebuildPOIMarkers();
  }

  function deletePOI(poiId) {
    var all = loadAllPOIs();
    var list = all[currentMountainRoute.id] || [];
    all[currentMountainRoute.id] = list.filter(function(p) { return p.id !== poiId; });
    saveAllPOIs(all);
    rebuildPOIMarkers();
  }

  function enterPOIPlacementMode(type) {
    poiPlacementMode = true;
    poiPlacementType = type || 'note';
    isEditing = false;
    editTool = null;
    renderer.domElement.style.cursor = 'crosshair';
    createPOIPreviewMarker(poiPlacementType);
    if (editorPanel) editorPanel.style.display = 'none';
    if (editCursor) editCursor.visible = false;
    showEditorToast('点击地形放置' + (POI_TYPES[poiPlacementType].name) + '标记，ESC取消');
  }

  function exitPOIPlacementMode() {
    poiPlacementMode = false;
    selectedPOI = null;
    renderer.domElement.style.cursor = 'grab';
    if (poiPreviewMarker) {
      mountainGroup.remove(poiPreviewMarker);
      poiPreviewMarker.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      poiPreviewMarker = null;
    }
    if (addMarkerBtn) {
      addMarkerBtn.style.background = 'rgba(25,30,55,0.92)';
      addMarkerBtn.style.borderColor = 'rgba(120,160,220,0.4)';
      addMarkerBtn.innerHTML = '📍 添加标记';
    }
  }

  // ========== END POI系统 ==========

  // 创建山峰地形
  function createMountainTerrain(route) {
    var terrain = route.terrain;
    if (terrain && terrain.useRealisticTerrain) {
      return createRealisticMountainTerrain(route);
    }
    var group = new THREE.Group();
    group.name = 'mountain_terrain';
    if (!route.terrain) return group;
    var seed = route.lng * 1000 + route.lat;
    var baseHeight = terrain.baseHeight || 1000;
    var maxHeight = baseHeight;
    for (var p = 0; p < terrain.peaks.length; p++) {
      if (terrain.peaks[p].height > maxHeight) maxHeight = terrain.peaks[p].height;
    }
    var size = 60;
    var segments = 128;
    var heightScale = 0.018;

    var savedMod = loadTerrainMod(route.id);

    var geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    var positions = geometry.attributes.position;
    var colors = new Float32Array(positions.count * 3);
    baseHeights = new Float32Array(positions.count);
    origHeights = new Float32Array(positions.count);

    for (var i = 0; i < positions.count; i++) {
      var x = positions.getX(i);
      var z = positions.getZ(i);
      var nx = (x + size / 2) / size;
      var nz = (z + size / 2) / size;
      var h = getTerrainHeight(nx, nz, terrain, seed);
      var scaledH = (h - baseHeight) * heightScale;
      origHeights[i] = scaledH;
      if (savedMod && savedMod.deltas) {
        var mi = Math.round(nx * segments);
        var mj = Math.round(nz * segments);
        var idx = mj * (segments + 1) + mi;
        if (idx >= 0 && idx < savedMod.deltas.length) {
          scaledH += savedMod.deltas[idx];
        }
      }
      baseHeights[i] = scaledH;
      positions.setY(i, scaledH);
      var terrainH = (scaledH / heightScale) + baseHeight;
      var color = getTerrainColor(terrainH, terrain, baseHeight, maxHeight);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    var material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.isTerrain = true;
    mesh.userData.routeId = route.id;
    mesh.userData.segments = segments;
    mesh.userData.size = size;
    mesh.userData.heightScale = heightScale;
    group.add(mesh);
    terrainMesh = mesh;

    // 山峰标记
    for (var pi = 0; pi < terrain.peaks.length; pi++) {
      var peak = terrain.peaks[pi];
      var peakX = (peak.x - 0.5) * size;
      var peakZ = (peak.y - 0.5) * size;
      var peakH = getTerrainHeight(peak.x, peak.y, terrain, seed);
      var peakY = (peakH - baseHeight) * heightScale;

      var peakGeo = new THREE.ConeGeometry(0.7, 2.2, 8);
      var peakMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x4488ff,
        emissiveIntensity: 0.3,
        roughness: 0.3
      });
      var peakMesh = new THREE.Mesh(peakGeo, peakMat);
      peakMesh.position.set(peakX, peakY + 1.2, peakZ);
      peakMesh.userData.isPeak = true;
      peakMesh.userData.peakName = peak.name;
      peakMesh.userData.peakHeight = peak.height;
      group.add(peakMesh);

      // 峰顶标签
      var lc = document.createElement('canvas');
      var lctx = lc.getContext('2d');
      lc.width = 256;
      lc.height = 64;
      lctx.font = 'bold 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      lctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      lctx.textAlign = 'center';
      lctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      lctx.shadowBlur = 6;
      lctx.fillText(peak.name, 128, 26);
      lctx.font = '16px -apple-system, "PingFang SC", sans-serif';
      lctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
      lctx.fillText(peak.height + 'm', 128, 50);
      var lt = new THREE.CanvasTexture(lc);
      var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
      var ls = new THREE.Sprite(lm);
      ls.position.set(peakX, peakY + 5, peakZ);
      ls.scale.set(6, 1.5, 1);
      group.add(ls);
    }

    // 徒步行走路线
    if (terrain.trailPoints && terrain.trailPoints.length > 1) {
      var ctrlPts2D = [];
      for (var ti = 0; ti < terrain.trailPoints.length; ti++) {
        var tp = terrain.trailPoints[ti];
        ctrlPts2D.push(new THREE.Vector3(tp.x, 0, tp.y));
      }
      var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.1);
      var sampleCount = Math.max(100, terrain.trailPoints.length * 25);
      var groundOffset = 0.35;
      var trailPoints = [];
      for (var si = 0; si <= sampleCount; si++) {
        var t = si / sampleCount;
        var pt = curve2D.getPoint(t);
        var ux = pt.x;
        var uz = pt.z;
        var sx = (ux - 0.5) * size;
        var sz = (uz - 0.5) * size;
        var sh = getTerrainHeight(ux, uz, terrain, seed);
        var sy = (sh - baseHeight) * heightScale + groundOffset;
        trailPoints.push(new THREE.Vector3(sx, sy, sz));
      }
      var trailCurve = new THREE.CatmullRomCurve3(trailPoints, false, 'catmullrom', 0.0);
      var tubeGeo = new THREE.TubeGeometry(trailCurve, 280, 0.12, 6, false);
      var tubeMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      var tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.renderOrder = 999;
      tubeMesh.userData.isTrail = true;
      group.add(tubeMesh);
      var glowGeo = new THREE.TubeGeometry(trailCurve, 280, 0.32, 6, false);
      var glowMat = new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      var glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.renderOrder = 998;
      glowMesh.userData.isTrail = true;
      group.add(glowMesh);

      // 路线点
      for (var ti2 = 0; ti2 < terrain.trailPoints.length; ti2++) {
        var tp2 = terrain.trailPoints[ti2];
        var tpx = (tp2.x - 0.5) * size;
        var tpz = (tp2.y - 0.5) * size;
        var tph = getTerrainHeight(tp2.x, tp2.y, terrain, seed);
        var tpy = (tph - baseHeight) * heightScale + groundOffset + 0.2;
        var dotGeo = new THREE.SphereGeometry(0.18, 12, 12);
        var dotMat = new THREE.MeshStandardMaterial({
          color: 0xffcc44,
          emissive: 0xffaa00,
          emissiveIntensity: 1.0,
          roughness: 0.2
        });
        var dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.set(tpx, tpy, tpz);
        dotMesh.userData.isTrailDot = true;
        group.add(dotMesh);
        if (tp2.name) {
          var tplc = document.createElement('canvas');
          var tplctx = tplc.getContext('2d');
          tplc.width = 200;
          tplc.height = 48;
          tplctx.font = 'bold 17px -apple-system, "PingFang SC", sans-serif';
          tplctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
          tplctx.textAlign = 'center';
          tplctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          tplctx.shadowBlur = 4;
          tplctx.fillText(tp2.name, 100, 28);
          var tplt = new THREE.CanvasTexture(tplc);
          var tplm = new THREE.SpriteMaterial({ map: tplt, transparent: true, depthTest: false, depthWrite: false });
          var tpls = new THREE.Sprite(tplm);
          tpls.position.set(tpx, tpy + 2, tpz);
          tpls.scale.set(4, 1, 1);
          tpls.userData.isTrailLabel = true;
          group.add(tpls);
        }
      }
    }

    // 营地标记
    if (terrain.camps) {
      for (var ci = 0; ci < terrain.camps.length; ci++) {
        var camp = terrain.camps[ci];
        var cx = (camp.x - 0.5) * size;
        var cz = (camp.y - 0.5) * size;
        var ch = getTerrainHeight(camp.x, camp.y, terrain, seed);
        var cy = (ch - baseHeight) * heightScale + 0.3;
        var tentGeo = new THREE.ConeGeometry(0.7, 1.1, 4);
        var tentMat = new THREE.MeshStandardMaterial({
          color: 0x66ff88,
          emissive: 0x228833,
          emissiveIntensity: 0.4,
          roughness: 0.6
        });
        var tentMesh = new THREE.Mesh(tentGeo, tentMat);
        tentMesh.position.set(cx, cy + 0.55, cz);
        tentMesh.rotation.y = Math.PI / 4;
        tentMesh.userData.isCamp = true;
        group.add(tentMesh);
        if (camp.name) {
          var clc = document.createElement('canvas');
          var clctx = clc.getContext('2d');
          clc.width = 180;
          clc.height = 40;
          clctx.font = 'bold 15px -apple-system, "PingFang SC", sans-serif';
          clctx.fillStyle = 'rgba(120, 255, 150, 0.95)';
          clctx.textAlign = 'center';
          clctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          clctx.shadowBlur = 4;
          clctx.fillText(camp.name, 90, 25);
          var clt = new THREE.CanvasTexture(clc);
          var clm = new THREE.SpriteMaterial({ map: clt, transparent: true, depthTest: false, depthWrite: false });
          var cls = new THREE.Sprite(clm);
          cls.position.set(cx, cy + 2.2, cz);
          cls.scale.set(3.5, 0.8, 1);
          cls.userData.isCampLabel = true;
          group.add(cls);
        }
      }
    }
    return group;
  }

  // 创建返回按钮
  function createBackButton() {
    var btn = document.createElement('div');
    btn.id = 'mountain-back-btn';
    btn.style.cssText = 'position:fixed;top:20px;left:20px;z-index:500;padding:10px 20px;background:rgba(15,25,45,0.92);border:1px solid rgba(100,150,200,0.4);border-radius:8px;color:#c8d8f0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;cursor:pointer;display:none;backdrop-filter:blur(10px);transition:all 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    btn.innerHTML = '← 返回全国地图';
    btn.addEventListener('mouseenter', function() {
      btn.style.background = 'rgba(30, 50, 80, 0.95)';
      btn.style.borderColor = 'rgba(120, 180, 240, 0.6)';
      btn.style.color = '#e8f0ff';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.background = 'rgba(15, 25, 45, 0.92)';
      btn.style.borderColor = 'rgba(100, 150, 200, 0.4)';
      btn.style.color = '#c8d8f0';
    });
    btn.addEventListener('click', function() {
      exitMountainMode();
    });
    document.body.appendChild(btn);
    return btn;
  }

  // 进入山峰模式
  function enterMountainMode(route) {
    if (!container || !route || !route.terrain) return;
    if (isCameraAnimating) return;
    if (viewMode === 'mountain' && currentMountainRoute && currentMountainRoute.id === route.id) return;
    isCameraAnimating = true;
    currentMountainRoute = route;
    viewMode = 'mountain';
    workingTrailPoints = null;
    selectedTrailIndex = -1;
    isDraggingTrail = false;
    workingRiverPoints = null;
    selectedRiverIndex = -1;
    isDraggingRiver = false;
    pointerDownOnRiver = false;
    riverWidth = 2.5;
    riverDepth = 1.5;
    workingCustomTrails = null;
    activeTrailId = null;
    trailDirectionOverrides = {};
    trailCompletedStatus = {};
    trailNameOverrides = {};
    deletedDefaultTrailIds = {};
    if (!backButton) backButton = createBackButton();
    backButton.style.display = 'block';
    if (!editEntryBtn) createEditEntryButton();
    editEntryBtn.style.display = 'block';
    if (!addMarkerBtn) createAddMarkerButton();
    addMarkerBtn.style.display = 'block';

    if (mountainGroup) {
      scene.remove(mountainGroup);
      mountainGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }
    if (trailHandlesGroup) {
      scene.remove(trailHandlesGroup);
      trailHandlesGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      trailHandlesGroup = null;
    }
    if (riverHandlesGroup) {
      scene.remove(riverHandlesGroup);
      riverHandlesGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      riverHandlesGroup = null;
    }
    mountainGroup = createMountainTerrain(route);
    mountainGroup.visible = false;
    scene.add(mountainGroup);

    var savedMod = loadAllTerrainMod(route.id);
    trailDirectionOverrides = {};
    trailCompletedStatus = {};
    trailNameOverrides = {};
    deletedDefaultTrailIds = {};
    if (savedMod) {
      if (savedMod.riverPoints && savedMod.riverPoints.length >= 2) {
        workingRiverPoints = savedMod.riverPoints.map(function(p) {
          return { x: p.x, y: p.y };
        });
      }
      if (savedMod.riverWidth !== undefined) riverWidth = savedMod.riverWidth;
      if (savedMod.riverDepth !== undefined) riverDepth = savedMod.riverDepth;
      if (savedMod.customTrails) {
        workingCustomTrails = savedMod.customTrails.map(function(t) {
          return { id: t.id, name: t.name, direction: t.direction || 1, points: (t.points || []).map(function(p) { return { x: p.x, y: p.y, name: p.name }; }) };
        });
      }
      if (savedMod.activeTrailId) {
        activeTrailId = savedMod.activeTrailId;
      }
      if (savedMod.trailDirectionOverrides) {
        trailDirectionOverrides = JSON.parse(JSON.stringify(savedMod.trailDirectionOverrides));
      }
      if (savedMod.trailCompletedStatus) {
        trailCompletedStatus = JSON.parse(JSON.stringify(savedMod.trailCompletedStatus));
      }
      if (savedMod.trailNameOverrides) {
        trailNameOverrides = JSON.parse(JSON.stringify(savedMod.trailNameOverrides));
      }
      if (savedMod.deletedDefaultTrailIds) {
        deletedDefaultTrailIds = JSON.parse(JSON.stringify(savedMod.deletedDefaultTrailIds));
      }
    }
    initActiveTrail();
    if (workingRiverPoints && workingRiverPoints.length >= 2) {
      rebuildRiverRender();
    }
    rebuildPOIMarkers();

    // 隐藏全局元素
    mapGroup.visible = false;
    markersGroup.visible = false;
    atmosphereGroup.visible = false;

    var terrain = route.terrain;
    var isRealistic = terrain && terrain.useRealisticTerrain;
    var terrainSize = isRealistic ? 80 : 60;
    var camDist = isRealistic ? 85 : 55;
    var camHeight = isRealistic ? 65 : 42;
    var lookAtY = isRealistic ? 9 : 4;
    var startPos = camera.position.clone();
    var startTarget = controls.target.clone();

    mountainGroup.position.set(0, 0, 0);
    mountainGroup.visible = true;
    mountainGroup.scale.set(0.01, 0.01, 0.01);

    var finalCamPos = new THREE.Vector3(camDist, camHeight, camDist);
    var finalLookAt = new THREE.Vector3(0, lookAtY, 0);

    var startTime = Date.now();
    var duration = 2200;
    controls.enabled = false;

    function animateEnter() {
      var elapsed = Date.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      var easeT = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, finalCamPos, easeT);
      controls.target.lerpVectors(startTarget, finalLookAt, easeT);
      camera.lookAt(controls.target);
      var scaleT = Math.min(t * 1.6, 1);
      var scaleEase = 1 - Math.pow(1 - scaleT, 4);
      var s = 0.01 + scaleEase * 0.99;
      mountainGroup.scale.set(s, s, s);
      if (t < 1) {
        requestAnimationFrame(animateEnter);
      } else {
        mountainGroup.scale.set(1, 1, 1);
        camera.position.copy(finalCamPos);
        controls.target.copy(finalLookAt);
        camera.lookAt(controls.target);
        controls.minDistance = isRealistic ? 30 : 20;
        controls.maxDistance = isRealistic ? 220 : 150;
        controls.minPolarAngle = Math.PI * 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.update();
        controls.enabled = true;
        isCameraAnimating = false;
        var finalDist = camera.position.distanceTo(controls.target);
        console.log('[DEBUG] 飞入结束 | 相机位置:', camera.position.x.toFixed(1), camera.position.y.toFixed(1), camera.position.z.toFixed(1),
          '| target:', controls.target.x.toFixed(1), controls.target.y.toFixed(1), controls.target.z.toFixed(1),
          '| 距离:', finalDist.toFixed(1));
      }
    }
    animateEnter();
  }

  // ========== 地形编辑器 ==========
  var STORAGE_KEY_PREFIX = 'taillog_terrain_mod_';

  function getStorageKey(routeId) {
    return STORAGE_KEY_PREFIX + routeId;
  }

  function loadTerrainMod(routeId) {
    try {
      var raw = localStorage.getItem(getStorageKey(routeId));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.segments && data.deltas) return data;
      return null;
    } catch(e) { return null; }
  }

  function saveTerrainMod() {
    if (!terrainMesh || !currentMountainRoute || !origHeights) return;
    var positions = terrainMesh.geometry.attributes.position;
    var segments = terrainMesh.userData.segments;
    var deltas = new Array(positions.count);
    for (var i = 0; i < positions.count; i++) {
      deltas[i] = baseHeights[i] - origHeights[i];
    }
    var data = { segments: segments, deltas: deltas };
    try {
      localStorage.setItem(getStorageKey(currentMountainRoute.id), JSON.stringify(data));
      if (typeof SyncModule !== 'undefined' && SyncModule.markDirty) SyncModule.markDirty('terrainMods');
    } catch(e) {}
  }

  function resetTerrainMod() {
    if (!terrainMesh || !currentMountainRoute) return;
    var positions = terrainMesh.geometry.attributes.position;
    var colors = terrainMesh.geometry.attributes.color;
    var route = currentMountainRoute;
    var terrain = route.terrain;
    var seed = route.lng * 1000 + route.lat;
    var baseHeight = terrain.baseHeight || 1000;
    var maxHeight = baseHeight;
    for (var p = 0; p < terrain.peaks.length; p++) {
      if (terrain.peaks[p].height > maxHeight) maxHeight = terrain.peaks[p].height;
    }
    var size = terrainMesh.userData.size;
    var heightScale = terrainMesh.userData.heightScale;
    var segments = terrainMesh.userData.segments;
    for (var i = 0; i < positions.count; i++) {
      var x = positions.getX(i);
      var z = positions.getZ(i);
      var nx = (x + size / 2) / size;
      var nz = (z + size / 2) / size;
      var h = getTerrainHeight(nx, nz, terrain, seed);
      var scaledH = (h - baseHeight) * heightScale;
      positions.setY(i, scaledH);
      baseHeights[i] = scaledH;
      var terrainH = (scaledH / heightScale) + baseHeight;
      var color = getTerrainColor(terrainH, terrain, baseHeight, maxHeight);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    try { localStorage.removeItem(getStorageKey(currentMountainRoute.id)); } catch(e) {}
    rebuildTrailsAndMarks();
    showEditorToast('地形已重置');
  }

  function saveAllMods() {
    if (!currentMountainRoute) return;
    var data = {};
    if (terrainMesh && origHeights) {
      var positions = terrainMesh.geometry.attributes.position;
      var segments = terrainMesh.userData.segments;
      var deltas = new Array(positions.count);
      for (var i = 0; i < positions.count; i++) {
        deltas[i] = baseHeights[i] - origHeights[i];
      }
      data.segments = segments;
      data.deltas = deltas;
    }
    syncWorkingPointsToActiveTrail();
    if (workingTrailPoints) {
      data.trailPoints = workingTrailPoints.map(function(p) {
        return { x: p.x, y: p.y, name: p.name };
      });
    }
    if (workingRiverPoints) {
      data.riverPoints = workingRiverPoints.map(function(p) {
        return { x: p.x, y: p.y };
      });
      data.riverWidth = riverWidth;
      data.riverDepth = riverDepth;
    }
    if (workingCustomTrails && workingCustomTrails.length > 0) {
      data.customTrails = workingCustomTrails.map(function(t) {
        return { id: t.id, name: t.name, direction: t.direction, points: t.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; }) };
      });
    }
    if (activeTrailId) {
      data.activeTrailId = activeTrailId;
    }
    var hasDirOverride = false;
    for (var dk in trailDirectionOverrides) { if (trailDirectionOverrides.hasOwnProperty(dk)) { hasDirOverride = true; break; } }
    if (hasDirOverride) {
      data.trailDirectionOverrides = JSON.parse(JSON.stringify(trailDirectionOverrides));
    }
    var hasComp = false;
    for (var cdk in trailCompletedStatus) { if (trailCompletedStatus.hasOwnProperty(cdk)) { hasComp = true; break; } }
    if (hasComp) {
      data.trailCompletedStatus = JSON.parse(JSON.stringify(trailCompletedStatus));
    }
    try {
      localStorage.setItem(getStorageKey(currentMountainRoute.id), JSON.stringify(data));
      if (typeof SyncModule !== 'undefined' && SyncModule.markDirty) SyncModule.markDirty('terrainMods');
      showEditorToast('地形、路径和河流已保存');
    } catch(e) {
      showEditorToast('保存失败');
    }
  }

  function syncWorkingPointsToActiveTrail() {
    if (!workingTrailPoints) return;
    var all = getAllTrails();
    var active = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === activeTrailId) { active = all[i]; break; }
    }
    if (!active) return;
    var pointsCopy = workingTrailPoints.map(function(p) { return { x: p.x, y: p.y, name: p.name }; });
    if (active.isDefault) {
      if (!workingCustomTrails) workingCustomTrails = [];
      var editedId = active.id + '_edited';
      var alreadyCopied = false;
      for (var j = 0; j < workingCustomTrails.length; j++) {
        if (workingCustomTrails[j].id === editedId) {
          workingCustomTrails[j].points = pointsCopy;
          alreadyCopied = true;
          activeTrailId = editedId;
          break;
        }
      }
      if (!alreadyCopied) {
        var copy = { id: editedId, name: active.name + '（已编辑）', direction: active.direction, points: pointsCopy };
        workingCustomTrails.push(copy);
        activeTrailId = editedId;
      }
    } else {
      for (var k = 0; k < workingCustomTrails.length; k++) {
        if (workingCustomTrails[k].id === activeTrailId) {
          workingCustomTrails[k].points = pointsCopy;
          break;
        }
      }
    }
  }

  function resetAllMods() {
    if (!currentMountainRoute) return;
    if (terrainMesh) {
      var positions = terrainMesh.geometry.attributes.position;
      var colors = terrainMesh.geometry.attributes.color;
      var route = currentMountainRoute;
      var terrain = route.terrain;
      var seed = route.lng * 1000 + route.lat;
      var baseHeight = terrain.baseHeight || 1000;
      var maxHeight = baseHeight;
      for (var p = 0; p < terrain.peaks.length; p++) {
        if (terrain.peaks[p].height > maxHeight) maxHeight = terrain.peaks[p].height;
      }
      var size = terrainMesh.userData.size;
      var heightScale = terrainMesh.userData.heightScale;
      var segments = terrainMesh.userData.segments;
      for (var i = 0; i < positions.count; i++) {
        var x = positions.getX(i);
        var z = positions.getZ(i);
        var nx = (x + size / 2) / size;
        var nz = (z + size / 2) / size;
        var h = getTerrainHeight(nx, nz, terrain, seed);
        var scaledH = (h - baseHeight) * heightScale;
        positions.setY(i, scaledH);
        baseHeights[i] = scaledH;
        var terrainH = (scaledH / heightScale) + baseHeight;
        var color = getTerrainColor(terrainH, terrain, baseHeight, maxHeight);
        colors.setXYZ(i, color.r, color.g, color.b);
      }
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
    }
    workingTrailPoints = null;
    selectedTrailIndex = -1;
    isDraggingTrail = false;
    workingRiverPoints = null;
    selectedRiverIndex = -1;
    isDraggingRiver = false;
    riverWidth = 2.5;
    riverDepth = 1.5;
    workingCustomTrails = null;
    activeTrailId = null;
    trailDirectionOverrides = {};
    trailCompletedStatus = {};
    trailNameOverrides = {};
    initActiveTrail();
    try { localStorage.removeItem(getStorageKey(currentMountainRoute.id)); } catch(e) {}
    rebuildRiverRender();
    var rwSlider = editorPanel ? editorPanel.querySelector('#river-width') : null;
    var rwVal = editorPanel ? editorPanel.querySelector('#river-width-val') : null;
    var rdSlider = editorPanel ? editorPanel.querySelector('#river-depth') : null;
    var rdVal = editorPanel ? editorPanel.querySelector('#river-depth-val') : null;
    if (rwSlider) rwSlider.value = riverWidth;
    if (rwVal) rwVal.textContent = riverWidth.toFixed(1);
    if (rdSlider) rdSlider.value = riverDepth;
    if (rdVal) rdVal.textContent = riverDepth.toFixed(1);
    showEditorToast('已重置为默认');
  }

  function applyBrush(worldPoint) {
    if (!terrainMesh || !editMode) return;
    var positions = terrainMesh.geometry.attributes.position;
    var colors = terrainMesh.geometry.attributes.color;
    var size = terrainMesh.userData.size;
    var segs = terrainMesh.userData.segments;
    var dir = editTool === 'raise' ? 1 : editTool === 'lower' ? -1 : 0;
    if (dir === 0 && editTool !== 'smooth') return;
    var bx = worldPoint.x;
    var bz = worldPoint.z;
    var strength = editBrushStrength * 0.5;
    var radius = editBrushSize;
    var radiusSq = radius * radius;
    var changed = false;
    for (var i = 0; i < positions.count; i++) {
      var vx = positions.getX(i);
      var vz = positions.getZ(i);
      var dx = vx - bx;
      var dz = vz - bz;
      var distSq = dx * dx + dz * dz;
      if (distSq < radiusSq) {
        var dist = Math.sqrt(distSq);
        var falloff = 1.0 - dist / radius;
        falloff = falloff * falloff * (3 - 2 * falloff);
        var dy = 0;
        if (editTool === 'smooth') {
          var avgY = 0; var cnt = 0;
          var row = Math.floor(i / (segs + 1));
          var col = i % (segs + 1);
          for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var nr = row + dr; var nc = col + dc;
            if (nr >= 0 && nr <= segs && nc >= 0 && nc <= segs) {
              avgY += positions.getY(nr * (segs + 1) + nc); cnt++;
            }
          }
          avgY /= cnt;
          dy = (avgY - positions.getY(i)) * falloff * 0.5;
        } else {
          dy = dir * strength * falloff;
        }
        positions.setY(i, positions.getY(i) + dy);
        baseHeights[i] += dy;
        changed = true;
      }
    }
    if (changed) {
      positions.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
      updateTerrainColors();
    }
  }

  function updateTerrainColors() {
    if (!terrainMesh || !currentMountainRoute) return;
    var positions = terrainMesh.geometry.attributes.position;
    var colors = terrainMesh.geometry.attributes.color;
    var terrain = currentMountainRoute.terrain;
    var baseHeight = terrain.baseHeight || 1000;
    var maxHeight = baseHeight;
    for (var p = 0; p < terrain.peaks.length; p++) {
      if (terrain.peaks[p].height > maxHeight) maxHeight = terrain.peaks[p].height;
    }
    var heightScale = terrainMesh.userData.heightScale;
    for (var i = 0; i < positions.count; i++) {
      var sy = positions.getY(i);
      var h = (sy / heightScale) + baseHeight;
      var color = getTerrainColor(h, terrain, baseHeight, maxHeight);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  function rebuildTrailsAndMarks() {
    if (!mountainGroup || !terrainMesh || !currentMountainRoute) return;
    var route = currentMountainRoute;
    var terrain = route.terrain;
    var seed = route.lng * 1000 + route.lat;
    var size = 60;
    var heightScale = 0.018;
    var baseHeight = terrain.baseHeight || 1000;
    var trailMeshes = [];
    var peakMeshes = [];
    var campMeshes = [];
    mountainGroup.traverse(function(obj) {
      if (obj.userData && (obj.userData.isTrail || obj.userData.isTrailDot || obj.userData.isTrailLabel || obj.userData.isPeak || obj.userData.isPeakLabel || obj.userData.isCamp || obj.userData.isCampLabel || obj.userData.isRiverWater || obj.userData.isRiverBed)) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
        trailMeshes.push(obj);
      }
    });
    for (var ti = 0; ti < trailMeshes.length; ti++) {
      mountainGroup.remove(trailMeshes[ti]);
    }
    for (var pi = 0; pi < terrain.peaks.length; pi++) {
      var peak = terrain.peaks[pi];
      var peakX = (peak.x - 0.5) * size;
      var peakZ = (peak.y - 0.5) * size;
      var peakY = getVertexHeightAt(peakX, peakZ);
      var peakGeo = new THREE.ConeGeometry(0.7, 2.2, 8);
      var peakMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0x4488ff, emissiveIntensity: 0.3, roughness: 0.3
      });
      var peakMesh = new THREE.Mesh(peakGeo, peakMat);
      peakMesh.position.set(peakX, peakY + 1.2, peakZ);
      peakMesh.userData.isPeak = true;
      mountainGroup.add(peakMesh);
      var lc = document.createElement('canvas');
      var lctx = lc.getContext('2d');
      lc.width = 256; lc.height = 64;
      lctx.font = 'bold 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      lctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; lctx.textAlign = 'center';
      lctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; lctx.shadowBlur = 6;
      lctx.fillText(peak.name, 128, 26);
      lctx.font = '16px -apple-system, "PingFang SC", sans-serif';
      lctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
      lctx.fillText(peak.height + 'm', 128, 50);
      var lt = new THREE.CanvasTexture(lc);
      var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
      var ls = new THREE.Sprite(lm);
      ls.position.set(peakX, peakY + 5, peakZ);
      ls.scale.set(6, 1.5, 1);
      ls.userData.isPeakLabel = true;
      mountainGroup.add(ls);
    }
    rebuildTrailRender();
    rebuildRiverRender();
    if (terrain.camps) {
      for (var ci = 0; ci < terrain.camps.length; ci++) {
        var camp = terrain.camps[ci];
        var cx = (camp.x - 0.5) * size;
        var cz = (camp.y - 0.5) * size;
        var cy = getVertexHeightAt(cx, cz);
        var tentGeo = new THREE.ConeGeometry(0.7, 1.1, 4);
        var tentMat = new THREE.MeshStandardMaterial({
          color: 0x66ff88, emissive: 0x228833, emissiveIntensity: 0.4, roughness: 0.6
        });
        var tentMesh = new THREE.Mesh(tentGeo, tentMat);
        tentMesh.position.set(cx, cy + 0.85, cz);
        tentMesh.rotation.y = Math.PI / 4;
        tentMesh.userData.isCamp = true;
        mountainGroup.add(tentMesh);
        if (camp.name) {
          var clc = document.createElement('canvas');
          var clctx = clc.getContext('2d');
          clc.width = 180; clc.height = 40;
          clctx.font = 'bold 15px -apple-system, "PingFang SC", sans-serif';
          clctx.fillStyle = 'rgba(120, 255, 150, 0.95)'; clctx.textAlign = 'center';
          clctx.shadowColor = 'rgba(0,0,0,0.9)'; clctx.shadowBlur = 4;
          clctx.fillText(camp.name, 90, 25);
          var clt = new THREE.CanvasTexture(clc);
          var clm = new THREE.SpriteMaterial({ map: clt, transparent: true, depthTest: false, depthWrite: false });
          var cls = new THREE.Sprite(clm);
          cls.position.set(cx, cy + 2.5, cz);
          cls.scale.set(3.5, 0.8, 1);
          cls.userData.isCampLabel = true;
          mountainGroup.add(cls);
        }
      }
    }
    rebuildRiverRender();
  }

  function getVertexHeightAt(wx, wz) {
    if (!terrainMesh) return 0;
    var positions = terrainMesh.geometry.attributes.position;
    var segs = terrainMesh.userData.segments;
    var size = terrainMesh.userData.size;
    var nx = (wx + size / 2) / size;
    var nz = (wz + size / 2) / size;
    nx = Math.max(0, Math.min(1, nx));
    nz = Math.max(0, Math.min(1, nz));
    var fx = nx * segs;
    var fz = nz * segs;
    var ix = Math.floor(fx), iz = Math.floor(fz);
    var tx = fx - ix, tz = fz - iz;
    ix = Math.min(ix, segs); iz = Math.min(iz, segs);
    var ixp = Math.min(ix + 1, segs);
    var izp = Math.min(iz + 1, segs);
    function v(ci, cj) { return positions.getY(cj * (segs + 1) + ci); }
    var h00 = v(ix, iz), h10 = v(ixp, iz);
    var h01 = v(ix, izp), h11 = v(ixp, izp);
    var h0 = h00 * (1 - tx) + h10 * tx;
    var h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  function createEditCursor() {
    if (editCursor) return;
    var ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide });
    editCursor = new THREE.Mesh(ringGeo, ringMat);
    editCursor.visible = false;
    editCursor.renderOrder = 1000;
    scene.add(editCursor);
    var innerGeo = new THREE.RingGeometry(0.0, 0.08, 24);
    innerGeo.rotateX(-Math.PI / 2);
    var innerMat = new THREE.MeshBasicMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.9, depthTest: false });
    var innerDot = new THREE.Mesh(innerGeo, innerMat);
    innerDot.renderOrder = 1001;
    editCursor.add(innerDot);
  }

  function updateEditCursorScale() {
    if (!editCursor) return;
    editCursor.scale.set(editBrushSize, editBrushSize, editBrushSize);
  }

  function updateEditCursorPosition(clientX, clientY) {
    if (!editCursor || !terrainMesh || !renderer) return null;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var hits = editRaycaster.intersectObject(terrainMesh, false);
    if (hits.length > 0) {
      var p = hits[0].point;
      editCursor.position.set(p.x, p.y + 0.15, p.z);
      editCursor.visible = true;
      return p;
    } else {
      editCursor.visible = false;
      return null;
    }
  }

  function showEditorToast(msg) {
    var toast = document.getElementById('terrain-edit-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'terrain-edit-toast';
      toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:8px 20px;background:rgba(20,40,30,0.92);border:1px solid rgba(100,220,160,0.5);border-radius:20px;color:#88ffbb;font-family:-apple-system,"PingFang SC",sans-serif;font-size:14px;z-index:2000;pointer-events:none;transition:opacity 0.3s;opacity:0;backdrop-filter:blur(8px);';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.style.opacity = '0'; }, 1600);
  }

  function createEditorPanel() {
    if (editorPanel) return;
    var panel = document.createElement('div');
    panel.id = 'terrain-editor-panel';
    panel.style.cssText = 'position:fixed;top:20px;right:20px;z-index:500;width:230px;padding:16px;background:rgba(15,25,45,0.94);border:1px solid rgba(100,180,140,0.3);border-radius:12px;color:#c8d8f0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;backdrop-filter:blur(12px);display:none;box-shadow:0 4px 30px rgba(0,0,0,0.6);';
    panel.innerHTML = ''
      + '<div style="font-size:15px;font-weight:600;color:#88ffbb;margin-bottom:12px;display:flex;align-items:center;gap:6px;">🏔️ 地形/路径编辑器</div>'
      + '<div style="margin-bottom:10px;">'
      + '  <div style="margin-bottom:6px;color:#9ab;">工具</div>'
      + '  <div style="display:flex;gap:4px;flex-wrap:wrap;">'
      + '    <button data-tool="raise" style="flex:1;min-width:60px;padding:6px;background:rgba(100,200,140,0.2);border:1px solid rgba(100,200,140,0.4);border-radius:6px;color:#88ffbb;cursor:pointer;font-size:12px;">⬆ 抬升</button>'
      + '    <button data-tool="lower" style="flex:1;min-width:60px;padding:6px;background:rgba(80,120,180,0.2);border:1px solid rgba(100,150,200,0.4);border-radius:6px;color:#99bbdd;cursor:pointer;font-size:12px;">⬇ 降低</button>'
      + '    <button data-tool="smooth" style="flex:1;min-width:60px;padding:6px;background:rgba(180,160,80,0.2);border:1px solid rgba(200,180,100,0.4);border-radius:6px;color:#ddcc88;cursor:pointer;font-size:12px;">≈ 平滑</button>'
      + '    <button data-tool="trail" style="flex:1;min-width:60px;padding:6px;background:rgba(60,80,100,0.2);border:1px solid rgba(100,130,160,0.3);border-radius:6px;color:#ffdd66;cursor:pointer;font-size:12px;">🛤️ 路径</button>'
      + '    <button data-tool="river" style="flex:1;min-width:60px;padding:6px;background:rgba(40,90,140,0.2);border:1px solid rgba(80,150,220,0.3);border-radius:6px;color:#66bbff;cursor:pointer;font-size:12px;">🌊 河流</button>'
      + '  </div>'
      + '</div>'
      + '<div id="terrain-tools">'
      + '<div style="margin-bottom:10px;">'
      + '  <div style="margin-bottom:4px;display:flex;justify-content:space-between;"><span>笔刷大小</span><span id="brush-size-val">3</span></div>'
      + '  <input type="range" id="brush-size" min="0.5" max="10" step="0.2" value="3" style="width:100%;accent-color:#66ffaa;">'
      + '</div>'
      + '<div style="margin-bottom:14px;">'
      + '  <div style="margin-bottom:4px;display:flex;justify-content:space-between;"><span>笔刷强度</span><span id="brush-str-val">0.2</span></div>'
      + '  <input type="range" id="brush-str" min="0.03" max="1.0" step="0.02" value="0.2" style="width:100%;accent-color:#66ffaa;">'
      + '</div>'
      + '</div>'
      + '<div id="trail-tools" style="display:none;margin-bottom:14px;padding:10px;background:rgba(20,30,50,0.6);border-radius:8px;border:1px solid rgba(100,130,160,0.2);">'
      + '  <div style="color:#ffdd66;font-size:12px;line-height:1.8;">'
      + '    <div>🖱️ 拖拽黄色控制点移动路径</div>'
      + '    <div>⇧ Shift+点击 添加路径点</div>'
      + '    <div>⌫ Delete 删除选中点</div>'
      + '  </div>'
      + '</div>'
      + '<div id="river-tools" style="display:none;margin-bottom:14px;padding:10px;background:rgba(10,25,50,0.6);border-radius:8px;border:1px solid rgba(80,150,220,0.2);">'
      + '  <div style="margin-bottom:8px;">'
      + '    <div style="margin-bottom:4px;display:flex;justify-content:space-between;"><span style="color:#66bbff;">河宽</span><span id="river-width-val">2.5</span></div>'
      + '    <input type="range" id="river-width" min="0.8" max="6" step="0.1" value="2.5" style="width:100%;accent-color:#4499dd;">'
      + '  </div>'
      + '  <div style="margin-bottom:8px;">'
      + '    <div style="margin-bottom:4px;display:flex;justify-content:space-between;"><span style="color:#66bbff;">河深</span><span id="river-depth-val">1.5</span></div>'
      + '    <input type="range" id="river-depth" min="0.3" max="4" step="0.1" value="1.5" style="width:100%;accent-color:#4499dd;">'
      + '  </div>'
      + '  <div style="color:#88ccff;font-size:12px;line-height:1.8;">'
      + '    <div>🖱️ 拖拽蓝色控制点改河道</div>'
      + '    <div>⇧ Shift+点击 添加河流点</div>'
      + '    <div>⌫ Delete 删除选中点</div>'
      + '  </div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:8px;">'
      + '  <button id="edit-save" style="flex:1;padding:7px;background:rgba(100,200,140,0.25);border:1px solid rgba(100,220,160,0.5);border-radius:6px;color:#88ffbb;cursor:pointer;font-size:12px;">💾 保存</button>'
      + '  <button id="edit-reset" style="flex:1;padding:7px;background:rgba(200,80,80,0.2);border:1px solid rgba(220,100,100,0.4);border-radius:6px;color:#ffaaaa;cursor:pointer;font-size:12px;">↺ 重置</button>'
      + '</div>'
      + '<div id="edit-toggle-btn" style="padding:7px;text-align:center;background:rgba(80,140,200,0.2);border:1px solid rgba(100,160,220,0.4);border-radius:6px;color:#aaccff;cursor:pointer;font-size:12px;">✏️ 退出编辑</div>';
    document.body.appendChild(panel);
    editorPanel = panel;

    var toolBtns = panel.querySelectorAll('[data-tool]');
    function setToolActive(tool) {
      editTool = tool;
      var terrainTools = panel.querySelector('#terrain-tools');
      var trailTools = panel.querySelector('#trail-tools');
      var riverTools = panel.querySelector('#river-tools');
      var isPathTool = (tool === 'trail' || tool === 'river');
      if (tool === 'trail') {
        if (terrainTools) terrainTools.style.display = 'none';
        if (trailTools) trailTools.style.display = 'block';
        if (riverTools) riverTools.style.display = 'none';
        if (editCursor) editCursor.visible = false;
        selectedTrailIndex = -1;
        isDraggingTrail = false;
        pointerDownOnTrail = false;
        rebuildTrailHandles();
        if (riverHandlesGroup) riverHandlesGroup.visible = false;
        if (editMode && controls) controls.enabled = true;
        if (editMode && renderer) renderer.domElement.style.cursor = 'grab';
      } else if (tool === 'river') {
        if (terrainTools) terrainTools.style.display = 'none';
        if (trailTools) trailTools.style.display = 'none';
        if (riverTools) riverTools.style.display = 'block';
        if (editCursor) editCursor.visible = false;
        selectedRiverIndex = -1;
        isDraggingRiver = false;
        pointerDownOnRiver = false;
        rebuildRiverRender();
        if (trailHandlesGroup) trailHandlesGroup.visible = false;
        if (editMode && controls) controls.enabled = true;
        if (editMode && renderer) renderer.domElement.style.cursor = 'grab';
      } else {
        if (terrainTools) terrainTools.style.display = 'block';
        if (trailTools) trailTools.style.display = 'none';
        if (riverTools) riverTools.style.display = 'none';
        selectedTrailIndex = -1;
        isDraggingTrail = false;
        pointerDownOnTrail = false;
        selectedRiverIndex = -1;
        isDraggingRiver = false;
        pointerDownOnRiver = false;
        rebuildTrailHandles();
        if (riverHandlesGroup) riverHandlesGroup.visible = false;
        if (editMode && controls) controls.enabled = false;
        if (editMode && renderer) renderer.domElement.style.cursor = 'crosshair';
        if (editCursor) { updateEditCursorScale(); editCursor.visible = true; }
      }
      for (var i = 0; i < toolBtns.length; i++) {
        var b = toolBtns[i];
        if (b.getAttribute('data-tool') === tool) {
          if (tool === 'raise') { b.style.background = 'rgba(100,220,140,0.4)'; b.style.borderColor = 'rgba(100,255,160,0.7)'; }
          else if (tool === 'lower') { b.style.background = 'rgba(80,140,220,0.4)'; b.style.borderColor = 'rgba(100,180,255,0.7)'; }
          else if (tool === 'trail') { b.style.background = 'rgba(220,180,60,0.4)'; b.style.borderColor = 'rgba(255,220,80,0.7)'; }
          else if (tool === 'river') { b.style.background = 'rgba(60,150,220,0.4)'; b.style.borderColor = 'rgba(80,180,255,0.7)'; }
          else { b.style.background = 'rgba(200,180,80,0.4)'; b.style.borderColor = 'rgba(255,220,100,0.7)'; }
        } else {
          b.style.background = 'rgba(60,80,100,0.2)';
          b.style.borderColor = 'rgba(100,130,160,0.3)';
        }
      }
    }
    setToolActive('raise');
    for (var ti = 0; ti < toolBtns.length; ti++) {
      toolBtns[ti].addEventListener('click', (function(btn) {
        return function() { setToolActive(btn.getAttribute('data-tool')); };
      })(toolBtns[ti]));
    }

    var sizeSlider = panel.querySelector('#brush-size');
    var sizeVal = panel.querySelector('#brush-size-val');
    sizeSlider.addEventListener('input', function() {
      editBrushSize = parseFloat(sizeSlider.value);
      sizeVal.textContent = editBrushSize.toFixed(1);
      updateEditCursorScale();
    });
    var strSlider = panel.querySelector('#brush-str');
    var strVal = panel.querySelector('#brush-str-val');
    strSlider.addEventListener('input', function() {
      editBrushStrength = parseFloat(strSlider.value);
      strVal.textContent = editBrushStrength.toFixed(2);
    });

    var rwSlider = panel.querySelector('#river-width');
    var rwVal = panel.querySelector('#river-width-val');
    rwSlider.addEventListener('input', function() {
      riverWidth = parseFloat(rwSlider.value);
      rwVal.textContent = riverWidth.toFixed(1);
      rebuildRiverRender();
    });
    var rdSlider = panel.querySelector('#river-depth');
    var rdVal = panel.querySelector('#river-depth-val');
    rdSlider.addEventListener('input', function() {
      riverDepth = parseFloat(rdSlider.value);
      rdVal.textContent = riverDepth.toFixed(1);
      rebuildRiverRender();
    });

    panel.querySelector('#edit-save').addEventListener('click', function() { saveAllMods(); });
    panel.querySelector('#edit-reset').addEventListener('click', function() { resetAllMods(); });
    panel.querySelector('#edit-toggle-btn').addEventListener('click', function() { toggleEditMode(false); });
  }

  var editEntryBtn = null;
  function createEditEntryButton() {
    if (editEntryBtn) return;
    var btn = document.createElement('div');
    btn.id = 'mountain-edit-btn';
    btn.style.cssText = 'position:fixed;top:20px;left:180px;z-index:500;padding:10px 18px;background:rgba(15,35,25,0.92);border:1px solid rgba(100,200,140,0.4);border-radius:8px;color:#88ffbb;font-family:-apple-system,"PingFang SC",sans-serif;font-size:14px;cursor:pointer;display:none;backdrop-filter:blur(10px);transition:all 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    btn.innerHTML = '✏️ 编辑地形';
    btn.addEventListener('mouseenter', function() {
      btn.style.background = 'rgba(30,60,45,0.95)';
      btn.style.borderColor = 'rgba(120,240,180,0.6)';
    });
    btn.addEventListener('mouseleave', function() {
      if (!editMode) {
        btn.style.background = 'rgba(15,35,25,0.92)';
        btn.style.borderColor = 'rgba(100,200,140,0.4)';
      }
    });
    btn.addEventListener('click', function() { toggleEditMode(true); });
    document.body.appendChild(btn);
    editEntryBtn = btn;
  }

  var addMarkerBtn = null;
  function createAddMarkerButton() {
    if (addMarkerBtn) return;
    var btn = document.createElement('div');
    btn.id = 'mountain-add-marker-btn';
    btn.style.cssText = 'position:fixed;top:20px;left:300px;z-index:500;padding:10px 18px;background:rgba(25,30,55,0.92);border:1px solid rgba(120,160,220,0.4);border-radius:8px;color:#aaccff;font-family:-apple-system,"PingFang SC",sans-serif;font-size:14px;cursor:pointer;display:none;backdrop-filter:blur(10px);transition:all 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    btn.innerHTML = '📍 添加标记';
    btn.addEventListener('mouseenter', function() {
      btn.style.background = 'rgba(40,55,90,0.95)';
      btn.style.borderColor = 'rgba(150,200,255,0.6)';
    });
    btn.addEventListener('mouseleave', function() {
      if (!poiPlacementMode) {
        btn.style.background = 'rgba(25,30,55,0.92)';
        btn.style.borderColor = 'rgba(120,160,220,0.4)';
      }
    });
    btn.addEventListener('click', function() {
      if (poiPlacementMode) {
        exitPOIPlacementMode();
        btn.style.background = 'rgba(25,30,55,0.92)';
        btn.style.borderColor = 'rgba(120,160,220,0.4)';
        btn.innerHTML = '📍 添加标记';
      } else {
        if (editMode) toggleEditMode(false);
        enterPOIPlacementMode('note');
        btn.style.background = 'rgba(60,100,160,0.6)';
        btn.style.borderColor = 'rgba(150,200,255,0.8)';
        btn.innerHTML = '❌ 取消放置';
      }
    });
    document.body.appendChild(btn);
    addMarkerBtn = btn;
  }

  function toggleEditMode(enable) {
    editMode = enable;
    if (!editorPanel) createEditorPanel();
    if (!editCursor) createEditCursor();
    if (enable) {
      editorPanel.style.display = 'block';
      if (editEntryBtn) editEntryBtn.style.display = 'none';
      var isPathTool = (editTool === 'trail' || editTool === 'river');
      controls.enabled = isPathTool;
      if (!isPathTool) updateEditCursorScale();
      if (backButton) backButton.style.pointerEvents = 'none';
      renderer.domElement.style.cursor = isPathTool ? 'grab' : 'crosshair';
      if (editTool === 'trail') {
        editCursor.visible = false;
        if (riverHandlesGroup) riverHandlesGroup.visible = false;
        rebuildTrailHandles();
        showEditorToast('路径编辑：拖拽黄色控制点移动路径 · 空白区域可旋转缩放地图');
      } else if (editTool === 'river') {
        editCursor.visible = false;
        if (trailHandlesGroup) trailHandlesGroup.visible = false;
        rebuildRiverRender();
        showEditorToast('河流编辑：拖拽蓝色控制点改河道 · Shift+点击添加点 · 空白区域可旋转缩放地图');
      } else {
        if (trailHandlesGroup) trailHandlesGroup.visible = false;
        if (riverHandlesGroup) riverHandlesGroup.visible = false;
        showEditorToast('选择工具编辑地形或路径 · 右键退出编辑');
      }
    } else {
      editorPanel.style.display = 'none';
      editCursor.visible = false;
      isEditing = false;
      isDraggingTrail = false;
      pointerDownOnTrail = false;
      selectedTrailIndex = -1;
      isDraggingRiver = false;
      pointerDownOnRiver = false;
      selectedRiverIndex = -1;
      controls.enabled = true;
      try { renderer.domElement.releasePointerCapture(); } catch(ex) {}
      if (editEntryBtn) editEntryBtn.style.display = 'block';
      if (backButton) backButton.style.pointerEvents = 'auto';
      renderer.domElement.style.cursor = 'grab';
      if (trailHandlesGroup) trailHandlesGroup.visible = false;
      if (riverHandlesGroup) riverHandlesGroup.visible = false;
    }
  }

  function onTerrainPointerDown(e) {
    if (viewMode !== 'mountain') return;

    if (e.button === 0 && poiPlacementMode) {
      var hit = pickTerrainPoint(e.clientX, e.clientY);
      if (hit) {
        var newPoi = {
          id: null,
          type: poiPlacementType,
          x: hit.nx,
          y: hit.nz,
          name: '',
          desc: ''
        };
        showPOIEditPanel(newPoi, true, e.clientX, e.clientY);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      return;
    }

    if (e.button === 0 && !editMode && !poiPlacementMode) {
      var poiHit = pickPOIMarker(e.clientX, e.clientY);
      if (poiHit) {
        var data = poiHit.userData.poiData;
        showPOIEditPanel(data, false, e.clientX, e.clientY);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }

    if (!editMode) return;
    if (e.button === 2) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleEditMode(false);
      return;
    }
    if (e.button !== 0) return;
    var panel = editorPanel;
    if (panel) {
      var r = panel.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    }
    var backR = backButton ? backButton.getBoundingClientRect() : null;
    if (backR && e.clientX >= backR.left && e.clientX <= backR.right && e.clientY >= backR.top && e.clientY <= backR.bottom) return;
    if (addMarkerBtn) {
      var mr = addMarkerBtn.getBoundingClientRect();
      if (e.clientX >= mr.left && e.clientX <= mr.right && e.clientY >= mr.top && e.clientY <= mr.bottom) return;
    }
    if (poiEditPanel) {
      var pr = poiEditPanel.getBoundingClientRect();
      if (e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom) return;
    }

    if (editTool === 'trail') {
      var hitIdx = pickTrailHandle(e.clientX, e.clientY);
      if (hitIdx < 0) {
        hitIdx = pickNearestTrailPointOnLine(e.clientX, e.clientY);
      }
      if (hitIdx >= 0) {
        selectedTrailIndex = hitIdx;
        isDraggingTrail = true;
        pointerDownOnTrail = true;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch(ex) {}
        rebuildTrailHandles();
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.shiftKey) {
        addTrailPoint(e.clientX, e.clientY);
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        selectedTrailIndex = -1;
        isDraggingTrail = false;
        pointerDownOnTrail = false;
        rebuildTrailHandles();
      }
      return;
    }

    if (editTool === 'river') {
      var hitIdxR = pickRiverHandle(e.clientX, e.clientY);
      if (hitIdxR < 0) {
        hitIdxR = pickNearestRiverPointOnLine(e.clientX, e.clientY);
      }
      if (hitIdxR >= 0) {
        selectedRiverIndex = hitIdxR;
        isDraggingRiver = true;
        pointerDownOnRiver = true;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch(ex) {}
        rebuildRiverHandles();
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.shiftKey) {
        addRiverPoint(e.clientX, e.clientY);
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        selectedRiverIndex = -1;
        isDraggingRiver = false;
        pointerDownOnRiver = false;
        rebuildRiverRender();
      }
      return;
    }

    isEditing = true;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch(ex) {}
    if (terrainMesh && baseHeights) {
      var _bp = terrainMesh.geometry.attributes.position;
      for (var _bi = 0; _bi < _bp.count; _bi++) {
        _bp.setY(_bi, baseHeights[_bi]);
      }
      _bp.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
      updateTerrainColors();
      var _oldRiver = [];
      if (mountainGroup) {
        mountainGroup.traverse(function(obj) {
          if (obj.userData && (obj.userData.isRiverWater || obj.userData.isRiverBed)) _oldRiver.push(obj);
        });
      }
      for (var _ri = 0; _ri < _oldRiver.length; _ri++) {
        var _ro = _oldRiver[_ri];
        if (_ro.parent) _ro.parent.remove(_ro);
        if (_ro.geometry) _ro.geometry.dispose();
        if (_ro.material) { if (_ro.material.map) _ro.material.map.dispose(); _ro.material.dispose(); }
      }
    }
    var hp = updateEditCursorPosition(e.clientX, e.clientY);
    if (hp) applyBrush(hp);
    e.preventDefault();
    e.stopPropagation();
  }

  function onTerrainPointerMove(e) {
    if (viewMode !== 'mountain') return;

    if (poiPlacementMode) {
      var hit = pickTerrainPoint(e.clientX, e.clientY);
      if (hit && poiPreviewMarker) {
        poiPreviewMarker.visible = true;
        poiPreviewMarker.position.set(hit.x, hit.y, hit.z);
      } else if (poiPreviewMarker) {
        poiPreviewMarker.visible = false;
      }
      renderer.domElement.style.cursor = hit ? 'crosshair' : 'not-allowed';
      return;
    }

    if (!editMode && !poiPlacementMode) {
      var poiHit = pickPOIMarker(e.clientX, e.clientY);
      renderer.domElement.style.cursor = poiHit ? 'pointer' : 'grab';
      return;
    }

    if (editMode) {
      if (editTool === 'trail') {
        if (isDraggingTrail) {
          dragTrailPoint(e.clientX, e.clientY);
          e.preventDefault();
          e.stopImmediatePropagation();
          renderer.domElement.style.cursor = 'move';
        } else {
          var orbitActive = (e.buttons & 1) && !isDraggingTrail;
          if (!orbitActive) {
            var hitIdx = pickTrailHandle(e.clientX, e.clientY);
            var hitLine = pickTrailLine(e.clientX, e.clientY);
            renderer.domElement.style.cursor = (hitIdx >= 0 || hitLine) ? 'pointer' : 'grab';
          }
        }
        if (editCursor) editCursor.visible = false;
        return;
      }
      if (editTool === 'river') {
        if (isDraggingRiver) {
          dragRiverPoint(e.clientX, e.clientY);
          e.preventDefault();
          e.stopImmediatePropagation();
          renderer.domElement.style.cursor = 'move';
        } else {
          var orbitActiveR = (e.buttons & 1) && !isDraggingRiver;
          if (!orbitActiveR) {
            var hitIdxR = pickRiverHandle(e.clientX, e.clientY);
            var hitLineR = pickRiverLine(e.clientX, e.clientY);
            renderer.domElement.style.cursor = (hitIdxR >= 0 || hitLineR) ? 'pointer' : 'grab';
          }
        }
        if (editCursor) editCursor.visible = false;
        return;
      }
      var hp = updateEditCursorPosition(e.clientX, e.clientY);
      if (isEditing && hp) {
        applyBrush(hp);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      renderer.domElement.style.cursor = 'crosshair';
      return;
    }
  }

  function onTerrainPointerUp(e) {
    if (isDraggingTrail) {
      isDraggingTrail = false;
      pointerDownOnTrail = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch(ex) {}
      e.preventDefault();
      return;
    }
    if (isDraggingRiver) {
      isDraggingRiver = false;
      pointerDownOnRiver = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch(ex) {}
      e.preventDefault();
      return;
    }
    if (isEditing) {
      isEditing = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch(ex) {}
      if (editMode && terrainMesh) {
        rebuildTrailsAndMarks();
      }
    }
    pointerDownOnTrail = false;
    pointerDownOnRiver = false;
    if (editMode && e.button === 2) {
      toggleEditMode(false);
    }
  }

  function onTerrainWheel(e) {
    if (!editMode || viewMode !== 'mountain' || !terrainMesh) return;
    if (editTool === 'trail' || editTool === 'river') return;
    e.preventDefault();
    e.stopPropagation();
    var delta = e.deltaY > 0 ? 1.08 : 1 / 1.08;
    var newDist = camera.position.distanceTo(controls.target) * delta;
    newDist = Math.max(20, Math.min(150, newDist));
    var dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(dir.multiplyScalar(newDist));
    camera.lookAt(controls.target);
  }

  function setupEditorEvents() {
    window.addEventListener('keydown', onEditorKeyDown);
  }

  function onEditorKeyDown(e) {
    if (viewMode !== 'mountain') return;
    if (poiPlacementMode) {
      if (e.key === 'Escape') {
        exitPOIPlacementMode();
        if (addMarkerBtn) {
          addMarkerBtn.style.background = 'rgba(25,30,55,0.92)';
          addMarkerBtn.style.borderColor = 'rgba(120,160,220,0.4)';
          addMarkerBtn.innerHTML = '📍 添加标记';
        }
        hidePOIEditPanel();
        e.preventDefault();
      }
      return;
    }
    if (!editMode) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editTool === 'trail' && selectedTrailIndex >= 0) {
        deleteTrailPoint(selectedTrailIndex);
        e.preventDefault();
      } else if (editTool === 'river' && selectedRiverIndex >= 0) {
        deleteRiverPoint(selectedRiverIndex);
        e.preventDefault();
      }
    }
    if (e.key === 'Escape') {
      toggleEditMode(false);
    }
  }

  function loadAllTerrainMod(routeId) {
    try {
      var raw = localStorage.getItem(getStorageKey(routeId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function getDefaultTrails() {
    if (!currentMountainRoute || !currentMountainRoute.terrain) return [];
    var terrain = currentMountainRoute.terrain;
    var result = [];
    if (terrain.trails && terrain.trails.length > 0) {
      var visibleTrails = terrain.trails.filter(function(t) {
        return !deletedDefaultTrailIds[t.id];
      });
      result = visibleTrails.map(function(t, idx) {
        var dir = trailDirectionOverrides[t.id] !== undefined ? trailDirectionOverrides[t.id] : (t.direction || 1);
        var completed = trailCompletedStatus[t.id] !== undefined ? trailCompletedStatus[t.id] : (idx === 0);
        var dispName = trailNameOverrides[t.id] !== undefined ? trailNameOverrides[t.id] : t.name;
        return { id: t.id, name: dispName, originalName: t.name, direction: dir, completed: completed, points: (t.points || []).map(function(p) { return { x: p.x, y: p.y, name: p.name }; }), isDefault: true };
      });
    } else if (terrain.trailPoints && terrain.trailPoints.length > 0) {
      if (deletedDefaultTrailIds['default']) return [];
      var defDir = trailDirectionOverrides['default'] !== undefined ? trailDirectionOverrides['default'] : 1;
      var defCompleted = trailCompletedStatus['default'] !== undefined ? trailCompletedStatus['default'] : true;
      var defName = trailNameOverrides['default'] !== undefined ? trailNameOverrides['default'] : '默认路线';
      result = [{ id: 'default', name: defName, originalName: '默认路线', direction: defDir, completed: defCompleted, points: terrain.trailPoints.map(function(p) { return { x: p.x, y: p.y, name: p.name }; }), isDefault: true }];
    }
    return result;
  }

  function getAllTrails() {
    var defaults = getDefaultTrails();
    var customs = (workingCustomTrails || []).map(function(t) {
      var completed = trailCompletedStatus[t.id] !== undefined ? trailCompletedStatus[t.id] : false;
      return { id: t.id, name: t.name, direction: t.direction || 1, completed: completed, points: (t.points || []).map(function(p) { return { x: p.x, y: p.y, name: p.name }; }), isDefault: false };
    });
    return defaults.concat(customs);
  }

  function getActiveTrail() {
    var all = getAllTrails();
    if (all.length === 0) return null;
    if (activeTrailId) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === activeTrailId) return all[i];
      }
    }
    activeTrailId = all[0].id;
    return all[0];
  }

  function initActiveTrail() {
    workingTrailPoints = null;
    var active = getActiveTrail();
    if (active) {
      workingTrailPoints = active.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; });
    }
    if (mountainGroup) {
      rebuildTrailRender();
    }
  }

  function setActiveTrail(trailId) {
    var all = getAllTrails();
    var found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === trailId) { found = all[i]; break; }
    }
    if (!found) return false;
    if (activeTrailId === trailId) return false;
    activeTrailId = trailId;
    workingTrailPoints = found.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; });
    selectedTrailIndex = -1;
    isDraggingTrail = false;
    if (mountainGroup) {
      rebuildTrailRender();
    }
    saveActiveTrailOnly();
    if (onTrailChanged) onTrailChanged();
    return true;
  }

  function generateTrailId() {
    return 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }

  function addCustomTrail(name) {
    if (!workingCustomTrails) workingCustomTrails = [];
    var newId = generateTrailId();
    var centerX = 0.5, centerY = 0.5;
    var active = getActiveTrail();
    if (active && active.points.length > 0) {
      var ax = 0, ay = 0;
      for (var i = 0; i < active.points.length; i++) { ax += active.points[i].x; ay += active.points[i].y; }
      centerX = ax / active.points.length;
      centerY = ay / active.points.length;
    }
    var newTrail = {
      id: newId,
      name: name || '新路线',
      direction: 1,
      points: [
        { x: Math.max(0.05, centerX - 0.1), y: Math.max(0.05, centerY - 0.05), name: '起点' },
        { x: Math.min(0.95, centerX + 0.1), y: Math.min(0.95, centerY + 0.05), name: '终点' }
      ]
    };
    workingCustomTrails.push(newTrail);
    activeTrailId = newId;
    workingTrailPoints = newTrail.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; });
    selectedTrailIndex = -1;
    if (mountainGroup) {
      rebuildTrailRender();
    }
    saveActiveTrailOnly();
    if (onTrailChanged) onTrailChanged();
    return newTrail;
  }

  function deleteCustomTrail(trailId) {
    if (!workingCustomTrails && !deletedDefaultTrailIds) return false;
    var customIdx = -1;
    if (workingCustomTrails) {
      for (var i = 0; i < workingCustomTrails.length; i++) {
        if (workingCustomTrails[i].id === trailId) { customIdx = i; break; }
      }
    }
    var isDefault = false;
    var defaults = terrain_trails_cache();
    for (var d = 0; d < defaults.length; d++) {
      if (defaults[d].id === trailId) { isDefault = true; break; }
    }
    if (customIdx >= 0) {
      workingCustomTrails.splice(customIdx, 1);
    } else if (isDefault) {
      deletedDefaultTrailIds[trailId] = true;
      delete trailDirectionOverrides[trailId];
      delete trailCompletedStatus[trailId];
      delete trailNameOverrides[trailId];
    } else {
      return false;
    }
    if (activeTrailId === trailId) {
      var all = getAllTrails();
      activeTrailId = all.length > 0 ? all[0].id : null;
      workingTrailPoints = null;
      initActiveTrail();
    }
    saveActiveTrailOnly();
    if (mountainGroup) rebuildTrailRender();
    if (onTrailChanged) onTrailChanged();
    return true;
  }

  function terrain_trails_cache() {
    if (!currentMountainRoute || !currentMountainRoute.terrain) return [];
    var terrain = currentMountainRoute.terrain;
    if (terrain.trails && terrain.trails.length > 0) return terrain.trails;
    if (terrain.trailPoints && terrain.trailPoints.length > 0) return [{ id: 'default' }];
    return [];
  }

  function renameTrail(trailId, newName) {
    var trimmed = (newName || '').trim();
    if (!trimmed) return false;
    var defaults = getDefaultTrails();
    for (var d = 0; d < defaults.length; d++) {
      if (defaults[d].id === trailId) {
        var origName = defaults[d].originalName || defaults[d].name;
        if (trimmed === origName) {
          delete trailNameOverrides[trailId];
        } else {
          trailNameOverrides[trailId] = trimmed;
        }
        saveActiveTrailOnly();
        if (onTrailChanged) onTrailChanged();
        return true;
      }
    }
    if (!workingCustomTrails) return false;
    for (var i = 0; i < workingCustomTrails.length; i++) {
      if (workingCustomTrails[i].id === trailId) {
        workingCustomTrails[i].name = trimmed;
        saveActiveTrailOnly();
        if (onTrailChanged) onTrailChanged();
        return true;
      }
    }
    return false;
  }

  function resetTrailName(trailId) {
    var defaults = getDefaultTrails();
    for (var d = 0; d < defaults.length; d++) {
      if (defaults[d].id === trailId) {
        if (trailNameOverrides[trailId] !== undefined) {
          delete trailNameOverrides[trailId];
          saveActiveTrailOnly();
          if (onTrailChanged) onTrailChanged();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  function setTrailDirection(trailId, dir) {
    var newDir = dir >= 0 ? 1 : -1;
    var defaults = getDefaultTrails();
    var isDefault = false;
    for (var i = 0; i < defaults.length; i++) {
      if (defaults[i].id === trailId) { isDefault = true; break; }
    }
    if (isDefault) {
      trailDirectionOverrides[trailId] = newDir;
    } else if (workingCustomTrails) {
      for (var j = 0; j < workingCustomTrails.length; j++) {
        if (workingCustomTrails[j].id === trailId) {
          workingCustomTrails[j].direction = newDir;
          break;
        }
      }
    } else {
      return false;
    }
    saveActiveTrailOnly();
    if (mountainGroup) rebuildTrailRender();
    if (onTrailChanged) onTrailChanged();
    return true;
  }

  function setTrailCompleted(trailId, completed) {
    trailCompletedStatus[trailId] = !!completed;
    saveActiveTrailOnly();
    if (onTrailChanged) onTrailChanged();
    return true;
  }

  function saveActiveTrailOnly() {
    if (!currentMountainRoute) return;
    try {
      var key = getStorageKey(currentMountainRoute.id);
      var existing = {};
      try { existing = JSON.parse(localStorage.getItem(key)) || {}; } catch(e) {}
      if (workingCustomTrails && workingCustomTrails.length > 0) {
        existing.customTrails = workingCustomTrails.map(function(t) {
          return { id: t.id, name: t.name, direction: t.direction, points: t.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; }) };
        });
      } else {
        delete existing.customTrails;
      }
      if (activeTrailId) {
        existing.activeTrailId = activeTrailId;
      }
      var hasOverride = false;
      for (var k in trailDirectionOverrides) { if (trailDirectionOverrides.hasOwnProperty(k)) { hasOverride = true; break; } }
      if (hasOverride) {
        existing.trailDirectionOverrides = JSON.parse(JSON.stringify(trailDirectionOverrides));
      } else {
        delete existing.trailDirectionOverrides;
      }
      var hasCompleted = false;
      for (var ck in trailCompletedStatus) { if (trailCompletedStatus.hasOwnProperty(ck)) { hasCompleted = true; break; } }
      if (hasCompleted) {
        existing.trailCompletedStatus = JSON.parse(JSON.stringify(trailCompletedStatus));
      } else {
        delete existing.trailCompletedStatus;
      }
      var hasNameOverride = false;
      for (var nk in trailNameOverrides) { if (trailNameOverrides.hasOwnProperty(nk)) { hasNameOverride = true; break; } }
      if (hasNameOverride) {
        existing.trailNameOverrides = JSON.parse(JSON.stringify(trailNameOverrides));
      } else {
        delete existing.trailNameOverrides;
      }
      var hasDeleted = false;
      for (var dk in deletedDefaultTrailIds) { if (deletedDefaultTrailIds.hasOwnProperty(dk)) { hasDeleted = true; break; } }
      if (hasDeleted) {
        existing.deletedDefaultTrailIds = JSON.parse(JSON.stringify(deletedDefaultTrailIds));
      } else {
        delete existing.deletedDefaultTrailIds;
      }
      localStorage.setItem(key, JSON.stringify(existing));
      if (typeof SyncModule !== 'undefined' && SyncModule.markDirty) SyncModule.markDirty('terrainMods');
    } catch(e) { console.warn('[Trail] saveActiveTrailOnly error:', e); }
  }

  function ensureWorkingTrailPoints() {
    if (workingTrailPoints) return workingTrailPoints;
    if (!currentMountainRoute || !currentMountainRoute.terrain) return [];
    var active = getActiveTrail();
    if (active && active.points.length > 0) {
      workingTrailPoints = active.points.map(function(p) { return { x: p.x, y: p.y, name: p.name }; });
      return workingTrailPoints;
    }
    var saved = loadAllTerrainMod(currentMountainRoute.id);
    var src = (saved && saved.trailPoints) || currentMountainRoute.terrain.trailPoints || [];
    workingTrailPoints = src.map(function(p) {
      return { x: p.x, y: p.y, name: p.name };
    });
    return workingTrailPoints;
  }

  function rebuildTrailHandles() {
    if (viewMode !== 'mountain' || !mountainGroup) {
      if (trailHandlesGroup) trailHandlesGroup.visible = false;
      return;
    }
    if (!trailHandlesGroup) {
      trailHandlesGroup = new THREE.Group();
      trailHandlesGroup.name = 'trail_handles';
      scene.add(trailHandlesGroup);
    }
    while (trailHandlesGroup.children.length > 0) {
      var c = trailHandlesGroup.children[0];
      trailHandlesGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
    }
    trailHandlesGroup.visible = (editMode && editTool === 'trail');
    if (!trailHandlesGroup.visible) return;
    var pts = ensureWorkingTrailPoints();
    var size = 60;
    var hMatU = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 0.8, roughness: 0.3 });
    var hMatS = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa00, emissiveIntensity: 1.5, roughness: 0.2 });
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var wx = (pt.x - 0.5) * size;
      var wz = (pt.y - 0.5) * size;
      var wy = getVertexHeightAt(wx, wz) + 0.6;
      var geo = new THREE.SphereGeometry(0.45, 16, 16);
      var mesh = new THREE.Mesh(geo, i === selectedTrailIndex ? hMatS : hMatU);
      mesh.position.set(wx, wy, wz);
      if (i === selectedTrailIndex) mesh.scale.setScalar(1.3);
      mesh.userData.isTrailHandle = true;
      mesh.userData.handleIndex = i;
      mesh.renderOrder = 997;
      trailHandlesGroup.add(mesh);
      if (pt.name) {
        var lc = document.createElement('canvas');
        var lctx = lc.getContext('2d');
        lc.width = 200; lc.height = 36;
        lctx.font = 'bold 14px -apple-system,"PingFang SC",sans-serif';
        lctx.fillStyle = 'rgba(255,200,80,0.95)'; lctx.textAlign = 'center';
        lctx.shadowColor = 'rgba(0,0,0,0.9)'; lctx.shadowBlur = 4;
        lctx.fillText(pt.name, 100, 20);
        var lt = new THREE.CanvasTexture(lc);
        var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
        var ls = new THREE.Sprite(lm);
        ls.position.set(wx, wy + 1.2, wz);
        ls.scale.set(4, 0.7, 1);
        trailHandlesGroup.add(ls);
      }
    }
    var linePts = [];
    for (var li = 0; li < pts.length; li++) {
      var lwx = (pts[li].x - 0.5) * size;
      var lwz = (pts[li].y - 0.5) * size;
      var lwy = getVertexHeightAt(lwx, lwz) + 0.6;
      linePts.push(new THREE.Vector3(lwx, lwy, lwz));
    }
    if (linePts.length >= 2) {
      var lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      var lineMat = new THREE.LineBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.7, depthTest: false });
      var line = new THREE.Line(lineGeo, lineMat);
      line.renderOrder = 996;
      trailHandlesGroup.add(line);
    }
  }

  function rebuildTrailRender() {
    var oldTrails = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && (obj.userData.isTrail || obj.userData.isTrailDot || obj.userData.isTrailLabel)) {
          oldTrails.push(obj);
        }
      });
    }
    for (var i = 0; i < oldTrails.length; i++) {
      var o = oldTrails[i];
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    }
    rebuildTrailHandles();
    if (!currentMountainRoute || !currentMountainRoute.terrain || !mountainGroup) return;
    var trailSrc = ensureWorkingTrailPoints();
    if (trailSrc.length < 2) return;
    var size = terrainMesh.userData.size || 60;
    var ctrlPts2D = [];
    for (var tpi = 0; tpi < trailSrc.length; tpi++) {
      ctrlPts2D.push(new THREE.Vector3(trailSrc[tpi].x, 0, trailSrc[tpi].y));
    }
    var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.1);
    var sampleCount = Math.max(100, trailSrc.length * 25);
    var groundOffset = 0.35;
    var trailPoints = [];
    for (var si = 0; si <= sampleCount; si++) {
      var t = si / sampleCount;
      var pt = curve2D.getPoint(t);
      var sx = (pt.x - 0.5) * size;
      var sz = (pt.z - 0.5) * size;
      var sy = getVertexHeightAt(sx, sz) + groundOffset;
      trailPoints.push(new THREE.Vector3(sx, sy, sz));
    }
    var trailCurve = new THREE.CatmullRomCurve3(trailPoints, false, 'catmullrom', 0.0);
    var tubeGeo = new THREE.TubeGeometry(trailCurve, 280, 0.12, 6, false);
    var tubeMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.95, depthWrite: false });
    var tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.renderOrder = 999; tubeMesh.userData.isTrail = true;
    mountainGroup.add(tubeMesh);
    var glowGeo = new THREE.TubeGeometry(trailCurve, 280, 0.32, 6, false);
    var glowMat = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    var glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.renderOrder = 998; glowMesh.userData.isTrail = true;
    mountainGroup.add(glowMesh);
    for (var ti2 = 0; ti2 < trailSrc.length; ti2++) {
      var tp2 = trailSrc[ti2];
      var tpx = (tp2.x - 0.5) * size;
      var tpz = (tp2.y - 0.5) * size;
      var tpy = getVertexHeightAt(tpx, tpz) + groundOffset + 0.2;
      var dotGeo = new THREE.SphereGeometry(0.18, 12, 12);
      var dotMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 1.0, roughness: 0.2 });
      var dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.set(tpx, tpy, tpz);
      dotMesh.userData.isTrailDot = true;
      mountainGroup.add(dotMesh);
      if (tp2.name) {
        var lc = document.createElement('canvas');
        var lctx = lc.getContext('2d');
        lc.width = 200; lc.height = 48;
        lctx.font = 'bold 17px -apple-system,"PingFang SC",sans-serif';
        lctx.fillStyle = 'rgba(255,220,150,0.95)'; lctx.textAlign = 'center';
        lctx.shadowColor = 'rgba(0,0,0,0.9)'; lctx.shadowBlur = 4;
        lctx.fillText(tp2.name, 100, 28);
        var lt = new THREE.CanvasTexture(lc);
        var lm = new THREE.SpriteMaterial({ map: lt, transparent: true, depthTest: false, depthWrite: false });
        var ls = new THREE.Sprite(lm);
        ls.position.set(tpx, tpy + 2, tpz);
        ls.scale.set(4, 1, 1);
        ls.userData.isTrailLabel = true;
        mountainGroup.add(ls);
      }
    }

    var activeT = getActiveTrail();
    var trailDir = (activeT && activeT.direction === -1) ? -1 : 1;
    var arrowCount = Math.max(4, Math.min(12, Math.floor(trailSrc.length * 1.5)));
    for (var ai = 1; ai <= arrowCount; ai++) {
      var at = ai / (arrowCount + 1);
      var aPos = trailCurve.getPointAt(at);
      var aTan = trailCurve.getTangentAt(at).clone();
      aTan.y = 0;
      aTan.normalize();
      if (aTan.lengthSq() < 0.01) aTan.set(1, 0, 0);
      if (trailDir === -1) aTan.negate();
      var arrowGeo = new THREE.ConeGeometry(0.22, 0.55, 8);
      var arrowMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false });
      var arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
      arrowMesh.position.copy(aPos);
      arrowMesh.position.y += 0.55;
      var coneDefaultDir = new THREE.Vector3(0, 1, 0);
      var q = new THREE.Quaternion().setFromUnitVectors(coneDefaultDir, aTan);
      arrowMesh.quaternion.copy(q);
      arrowMesh.renderOrder = 1000;
      arrowMesh.userData.isTrail = true;
      mountainGroup.add(arrowMesh);
    }
  }

  function pickTerrainPoint(clientX, clientY) {
    if (!terrainMesh) return null;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var hits = editRaycaster.intersectObject(terrainMesh, false);
    if (hits.length > 0) {
      var p = hits[0].point;
      var size = terrainMesh.userData.size;
      var nx = (p.x + size / 2) / size;
      var nz = (p.z + size / 2) / size;
      nx = Math.max(0, Math.min(1, nx));
      nz = Math.max(0, Math.min(1, nz));
      return { x: p.x, y: p.y, z: p.z, nx: nx, nz: nz };
    }
    return null;
  }

  function pickPOIMarker(clientX, clientY) {
    if (!poiGroup) return null;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var allMarkers = [];
    poiGroup.traverse(function(obj) {
      if (obj.userData && obj.userData.isPOI) allMarkers.push(obj);
    });
    var hits = editRaycaster.intersectObjects(allMarkers, true);
    if (hits.length > 0) {
      var obj = hits[0].object;
      while (obj && !obj.userData.isPOI && obj.parent) obj = obj.parent;
      if (obj && obj.userData.isPOI) return obj;
    }
    return null;
  }

  function pickTrailHandle(clientX, clientY) {
    if (!trailHandlesGroup || !trailHandlesGroup.visible) return -1;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var handles = [];
    trailHandlesGroup.traverse(function(obj) {
      if (obj.userData && obj.userData.isTrailHandle) handles.push(obj);
    });
    var hits = editRaycaster.intersectObjects(handles, false);
    if (hits.length > 0) return hits[0].object.userData.handleIndex;
    return -1;
  }

  function pickTrailLine(clientX, clientY) {
    if (!editMode || editTool !== 'trail') return false;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var trailMeshes = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && (obj.userData.isTrail || obj.userData.isTrailDot)) trailMeshes.push(obj);
      });
    }
    if (trailHandlesGroup && trailHandlesGroup.visible) {
      trailHandlesGroup.traverse(function(obj) {
        if (obj !== trailHandlesGroup && (obj.isLine || (obj.userData && obj.userData.isTrailHandle))) trailMeshes.push(obj);
      });
    }
    var hits = editRaycaster.intersectObjects(trailMeshes, false);
    return hits.length > 0;
  }

  function pickNearestTrailPointOnLine(clientX, clientY) {
    if (!workingTrailPoints || workingTrailPoints.length === 0) return -1;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var trailMeshes = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && (obj.userData.isTrail || obj.userData.isTrailDot)) trailMeshes.push(obj);
      });
    }
    if (trailHandlesGroup && trailHandlesGroup.visible) {
      trailHandlesGroup.traverse(function(obj) {
        if (obj !== trailHandlesGroup && obj.isLine) trailMeshes.push(obj);
      });
    }
    var hits = editRaycaster.intersectObjects(trailMeshes, false);
    if (hits.length === 0) return -1;
    var hitPoint = hits[0].point;
    var size = 60;
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var i = 0; i < workingTrailPoints.length; i++) {
      var pt = workingTrailPoints[i];
      var wx = (pt.x - 0.5) * size;
      var wz = (pt.y - 0.5) * size;
      var wy = getVertexHeightAt(wx, wz) + 0.6;
      var dx = wx - hitPoint.x;
      var dy = wy - hitPoint.y;
      var dz = wz - hitPoint.z;
      var dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function zoomToCursor(clientX, clientY, deltaY) {
    var rect = renderer.domElement.getBoundingClientRect();
    var ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(ndc, camera);

    var hitPoint = null;
    var hits;

    if (viewMode === 'mountain' && terrainMesh) {
      hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0) hitPoint = hits[0].point.clone();
    } else {
      var targets = [];
      if (mapGroup) targets.push(mapGroup);
      if (mountainGroup) targets.push(mountainGroup);
      if (targets.length > 0) {
        hits = raycaster.intersectObjects(targets, true);
        for (var hi = 0; hi < hits.length; hi++) {
          var obj = hits[hi].object;
          if (obj.userData && (obj.userData.type === 'atmosphere' || obj.userData.type === 'atmosphere-inner' || obj.userData.type === 'atmosphere-outer')) continue;
          if (!(obj instanceof THREE.Mesh)) continue;
          if (obj.material && obj.material.transparent && obj.material.opacity < 0.5) continue;
          hitPoint = hits[hi].point.clone();
          break;
        }
      }
    }

    var dollyScale = 1.0;
    if (deltaY < 0) {
      dollyScale = Math.pow(0.95, controls.zoomSpeed);
    } else if (deltaY > 0) {
      dollyScale = 1 / Math.pow(0.95, controls.zoomSpeed);
    } else {
      return;
    }

    var offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    var oldRadius = offset.length();
    var newRadius = oldRadius * dollyScale;

    var minDist = controls.minDistance;
    var maxDist = controls.maxDistance;
    if (newRadius < minDist) { dollyScale = minDist / oldRadius; newRadius = minDist; }
    if (newRadius > maxDist) { dollyScale = maxDist / oldRadius; newRadius = maxDist; }
    if (Math.abs(newRadius - oldRadius) < 0.001) return;

    var newOffset = offset.clone().multiplyScalar(dollyScale);

    if (hitPoint) {
      var toHit = new THREE.Vector3().subVectors(hitPoint, controls.target);
      controls.target.add(toHit.multiplyScalar(1 - dollyScale));
    }

    camera.position.copy(controls.target).add(newOffset);

    var spherical = new THREE.Spherical();
    spherical.setFromVector3(newOffset);
    if (spherical.phi < controls.minPolarAngle) spherical.phi = controls.minPolarAngle;
    if (spherical.phi > controls.maxPolarAngle) spherical.phi = controls.maxPolarAngle;
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(controls.target);
  }

  function getTerrainHitPoint(clientX, clientY) {
    if (!terrainMesh) return null;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var hits = editRaycaster.intersectObject(terrainMesh, false);
    if (hits.length > 0) return hits[0].point;
    return null;
  }

  function worldToUV(wx, wz) {
    var size = 60;
    var nx = (wx + size / 2) / size;
    var nz = (wz + size / 2) / size;
    return { x: Math.max(0.001, Math.min(0.999, nx)), y: Math.max(0.001, Math.min(0.999, nz)) };
  }

  function dragTrailPoint(clientX, clientY) {
    if (selectedTrailIndex < 0 || !workingTrailPoints) return;
    var hit = getTerrainHitPoint(clientX, clientY);
    if (!hit) return;
    var uv = worldToUV(hit.x, hit.z);
    workingTrailPoints[selectedTrailIndex].x = uv.x;
    workingTrailPoints[selectedTrailIndex].y = uv.y;
    rebuildTrailRender();
  }

  function addTrailPoint(clientX, clientY) {
    var hit = getTerrainHitPoint(clientX, clientY);
    if (!hit) return;
    var uv = worldToUV(hit.x, hit.z);
    var pts = ensureWorkingTrailPoints();
    if (pts.length < 2) {
      pts.push({ x: uv.x, y: uv.y, name: '途经点' + (pts.length + 1) });
      selectedTrailIndex = pts.length - 1;
    } else {
      var ctrlPts2D = [];
      for (var i = 0; i < pts.length; i++) {
        ctrlPts2D.push(new THREE.Vector3(pts[i].x, 0, pts[i].y));
      }
      var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.1);
      var steps = 400;
      var bestT = 0, bestDist = Infinity;
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var cp = curve2D.getPoint(t);
        var dx = cp.x - uv.x, dz = cp.z - uv.y;
        var dist = dx * dx + dz * dz;
        if (dist < bestDist) { bestDist = dist; bestT = t; }
      }
      var insertIdx = 1;
      for (var j = 1; j < pts.length; j++) {
        if (bestT >= (j - 1) / (pts.length - 1)) insertIdx = j;
      }
      pts.splice(insertIdx, 0, { x: uv.x, y: uv.y, name: '途经点' });
      selectedTrailIndex = insertIdx;
    }
    rebuildTrailRender();
    showEditorToast('已添加路径点');
  }

  function deleteTrailPoint(idx) {
    var pts = ensureWorkingTrailPoints();
    if (pts.length <= 2) { showEditorToast('至少需要保留2个点'); return; }
    pts.splice(idx, 1);
    if (selectedTrailIndex >= pts.length) selectedTrailIndex = pts.length - 1;
    rebuildTrailRender();
    showEditorToast('已删除路径点');
  }

  function loadRiverMod(routeId) {
    try {
      var raw = localStorage.getItem(getStorageKey(routeId));
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data.riverPoints ? data.riverPoints : null;
    } catch(e) { return null; }
  }

  function ensureWorkingRiverPoints() {
    if (workingRiverPoints) return workingRiverPoints;
    if (!currentMountainRoute || !currentMountainRoute.terrain) return [];
    var saved = loadRiverMod(currentMountainRoute.id);
    var src = saved || (currentMountainRoute.terrain.riverPoints ? currentMountainRoute.terrain.riverPoints : []);
    workingRiverPoints = src.map(function(p) {
      return { x: p.x, y: p.y };
    });
    return workingRiverPoints;
  }

  function rebuildRiverHandles() {
    if (viewMode !== 'mountain' || !mountainGroup) {
      if (riverHandlesGroup) riverHandlesGroup.visible = false;
      return;
    }
    if (!riverHandlesGroup) {
      riverHandlesGroup = new THREE.Group();
      riverHandlesGroup.name = 'river_handles';
      scene.add(riverHandlesGroup);
    }
    while (riverHandlesGroup.children.length > 0) {
      var c = riverHandlesGroup.children[0];
      riverHandlesGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
    }
    riverHandlesGroup.visible = (editMode && editTool === 'river');
    if (!riverHandlesGroup.visible) return;
    var pts = ensureWorkingRiverPoints();
    var size = 60;
    var hMatU = new THREE.MeshBasicMaterial({ color: 0x2288cc });
    var hMatS = new THREE.MeshBasicMaterial({ color: 0x66ddff });
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var wx = (pt.x - 0.5) * size;
      var wz = (pt.y - 0.5) * size;
      var wy = getVertexHeightAt(wx, wz) + 0.4;
      var geo = new THREE.SphereGeometry(0.55, 16, 16);
      geo.computeBoundingSphere();
      var mesh = new THREE.Mesh(geo, i === selectedRiverIndex ? hMatS : hMatU);
      mesh.position.set(wx, wy, wz);
      if (i === selectedRiverIndex) mesh.scale.setScalar(1.3);
      mesh.userData.isRiverHandle = true;
      mesh.userData.handleIndex = i;
      mesh.renderOrder = 997;
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrixWorld(true);
      riverHandlesGroup.add(mesh);
    }
    var linePts = [];
    for (var li = 0; li < pts.length; li++) {
      var lwx = (pts[li].x - 0.5) * size;
      var lwz = (pts[li].y - 0.5) * size;
      var lwy = getVertexHeightAt(lwx, lwz) + 0.4;
      linePts.push(new THREE.Vector3(lwx, lwy, lwz));
    }
    if (linePts.length >= 2) {
      var lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      var lineMat = new THREE.LineBasicMaterial({ color: 0x4499dd, transparent: true, opacity: 0.7, depthTest: false });
      var line = new THREE.Line(lineGeo, lineMat);
      line.renderOrder = 996;
      riverHandlesGroup.add(line);
    }
  }

  function pickRiverHandle(clientX, clientY) {
    if (!riverHandlesGroup || !riverHandlesGroup.visible) return -1;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var riverMeshes = [];
    riverHandlesGroup.traverse(function(obj) {
      if (obj !== riverHandlesGroup && obj.userData && obj.userData.isRiverHandle) riverMeshes.push(obj);
    });
    var hits = editRaycaster.intersectObjects(riverMeshes, false);
    if (hits.length > 0) return hits[0].object.userData.handleIndex;
    var waterMeshes = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && obj.userData.isRiverWater) waterMeshes.push(obj);
      });
    }
    if (waterMeshes.length > 0) {
      var waterHits = editRaycaster.intersectObjects(waterMeshes, false);
      if (waterHits.length > 0) {
        var hitPt = waterHits[0].point;
        var size = 60;
        var pts = ensureWorkingRiverPoints();
        var bestIdx = -1;
        var bestDist = Infinity;
        for (var i = 0; i < pts.length; i++) {
          var pt = pts[i];
          var px = (pt.x - 0.5) * size;
          var pz = (pt.y - 0.5) * size;
          var dx = px - hitPt.x, dz = pz - hitPt.z;
          var dist = dx * dx + dz * dz;
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        if (bestIdx >= 0 && bestDist < 64) return bestIdx;
      }
    }
    var terrainHit = getTerrainHitPoint(clientX, clientY);
    if (terrainHit) {
      var size2 = 60;
      var pts2 = ensureWorkingRiverPoints();
      var bestIdx2 = -1;
      var bestDist2 = Infinity;
      for (var j = 0; j < pts2.length; j++) {
        var pt2 = pts2[j];
        var px2 = (pt2.x - 0.5) * size2;
        var pz2 = (pt2.y - 0.5) * size2;
        var dx2 = px2 - terrainHit.x, dz2 = pz2 - terrainHit.z;
        var dist2 = dx2 * dx2 + dz2 * dz2;
        if (dist2 < bestDist2) { bestDist2 = dist2; bestIdx2 = j; }
      }
      if (bestIdx2 >= 0 && bestDist2 < 36) return bestIdx2;
    }
    return -1;
  }

  function pickRiverLine(clientX, clientY) {
    if (!editMode || editTool !== 'river') return false;
    if (!riverHandlesGroup || !riverHandlesGroup.visible) return false;
    var rect = renderer.domElement.getBoundingClientRect();
    editMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    editMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editMouse, camera);
    var riverMeshes = [];
    riverHandlesGroup.traverse(function(obj) {
      if (obj !== riverHandlesGroup && obj.isLine) riverMeshes.push(obj);
    });
    var riverRenderMeshes = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && (obj.userData.isRiverWater || obj.userData.isRiverBed)) riverRenderMeshes.push(obj);
      });
    }
    var hits = editRaycaster.intersectObjects(riverMeshes.concat(riverRenderMeshes), true);
    return hits.length > 0;
  }

  function pickNearestRiverPointOnLine(clientX, clientY) {
    if (!workingRiverPoints || workingRiverPoints.length === 0) return -1;
    var hit = getTerrainHitPoint(clientX, clientY);
    if (!hit) return -1;
    var size = 60;
    var pts = workingRiverPoints;
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var px = (pt.x - 0.5) * size;
      var pz = (pt.y - 0.5) * size;
      var dx = px - hit.x, dz = pz - hit.z;
      var dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestDist < 25 ? bestIdx : -1;
  }

  function rebuildRiverRender() {
    var oldRivers = [];
    if (mountainGroup) {
      mountainGroup.traverse(function(obj) {
        if (obj.userData && (obj.userData.isRiverWater || obj.userData.isRiverBed)) {
          oldRivers.push(obj);
        }
      });
    }
    for (var i = 0; i < oldRivers.length; i++) {
      var o = oldRivers[i];
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    }
    if (!currentMountainRoute || !currentMountainRoute.terrain || !mountainGroup || !terrainMesh) {
      console.log('[River] rebuildRiverRender: missing prerequisites', { hasRoute: !!currentMountainRoute, hasTerrain: !!(currentMountainRoute && currentMountainRoute.terrain), hasMountainGroup: !!mountainGroup, hasTerrainMesh: !!terrainMesh });
      rebuildRiverHandles();
      return;
    }
    var riverSrc = ensureWorkingRiverPoints();
    console.log('[River] rebuildRiverRender: points=' + riverSrc.length + ', width=' + riverWidth + ', depth=' + riverDepth);

    var positions = terrainMesh.geometry.attributes.position;
    for (var _ri = 0; _ri < positions.count; _ri++) {
      positions.setY(_ri, baseHeights[_ri]);
    }
    positions.needsUpdate = true;

    rebuildRiverHandles();

    if (riverSrc.length < 2) {
      terrainMesh.geometry.computeVertexNormals();
      updateTerrainColors();
      return;
    }
    var size = 60;
    var w = riverWidth;
    var d = riverDepth;
    var waterRadius = Math.max(1.0, w * 0.6);
    var waterOffsetY = waterRadius * 0.8 + 0.8;
    console.log('[River] waterRadius=' + waterRadius.toFixed(2) + ', waterOffsetY=' + waterOffsetY.toFixed(2));

    var ctrlPts2D = [];
    for (var rpi = 0; rpi < riverSrc.length; rpi++) {
      ctrlPts2D.push(new THREE.Vector3(riverSrc[rpi].x, 0, riverSrc[rpi].y));
    }
    var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.1);
    var sampleCount = Math.max(150, riverSrc.length * 40);

    var waterPoints = [];
    for (var si = 0; si <= sampleCount; si++) {
      var t = si / sampleCount;
      var pt = curve2D.getPoint(t);
      var sx = (pt.x - 0.5) * size;
      var sz = (pt.z - 0.5) * size;
      sx = Math.max(-29.5, Math.min(29.5, sx));
      sz = Math.max(-29.5, Math.min(29.5, sz));
      var sy = getVertexHeightAt(sx, sz) + waterOffsetY;
      waterPoints.push(new THREE.Vector3(sx, sy, sz));
    }
    console.log('[River] waterPoints: first=(' + waterPoints[0].x.toFixed(1) + ',' + waterPoints[0].y.toFixed(1) + ',' + waterPoints[0].z.toFixed(1) + '), last=(' + waterPoints[waterPoints.length-1].x.toFixed(1) + ',' + waterPoints[waterPoints.length-1].y.toFixed(1) + ',' + waterPoints[waterPoints.length-1].z.toFixed(1) + ')');

    var riverCurve = new THREE.CatmullRomCurve3(waterPoints, false, 'catmullrom', 0.0);
    var tubeGeo = new THREE.TubeGeometry(riverCurve, Math.max(200, riverSrc.length * 60), waterRadius, 8, false);
    var waterMat = new THREE.MeshBasicMaterial({
      color: 0x3399ff,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var waterMesh = new THREE.Mesh(tubeGeo, waterMat);
    waterMesh.renderOrder = 999;
    waterMesh.userData.isRiverWater = true;
    mountainGroup.add(waterMesh);
    console.log('[River] waterMesh added, visible=' + waterMesh.visible + ', renderOrder=' + waterMesh.renderOrder);

    var glowGeo = new THREE.TubeGeometry(riverCurve, Math.max(200, riverSrc.length * 60), waterRadius * 2.0, 8, false);
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.renderOrder = 998;
    glowMesh.userData.isRiverWater = true;
    mountainGroup.add(glowMesh);

    try {
      applyRiverToTerrain(waterRadius, d);
      console.log('[River] applyRiverToTerrain completed');
    } catch(e) {
      console.error('[River] applyRiverToTerrain error:', e);
      terrainMesh.geometry.computeVertexNormals();
      updateTerrainColors();
    }
    var riverCount = 0;
    mountainGroup.traverse(function(obj) { if (obj.userData && obj.userData.isRiverWater) riverCount++; });
    console.log('[River] Total river water meshes in mountainGroup: ' + riverCount);
  }

  function applyRiverToTerrain(waterRadius, extraDepth) {
    if (!terrainMesh || !currentMountainRoute) return;
    if (viewMode !== 'mountain') return;
    if (!baseHeights) return;

    var positions = terrainMesh.geometry.attributes.position;
    var colors = terrainMesh.geometry.attributes.color;
    var riverSrc = ensureWorkingRiverPoints();
    if (riverSrc.length < 2) {
      positions.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
      updateTerrainColors();
      return;
    }

    var size = 60;
    var w = riverWidth;
    var channelR = waterRadius || (w * 0.35);
    var d = extraDepth != null ? extraDepth : riverDepth;
    var falloffW = w * 2.0;
    var maxCarve = channelR * 2.0 + d;

    var ctrlPts2D = [];
    for (var ci = 0; ci < riverSrc.length; ci++) {
      ctrlPts2D.push(new THREE.Vector3(riverSrc[ci].x, 0, riverSrc[ci].y));
    }
    var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.2);
    var sampleCount = Math.max(200, riverSrc.length * 50);
    var curveSamples = [];
    for (var si = 0; si <= sampleCount; si++) {
      var t = si / sampleCount;
      var cp = curve2D.getPoint(t);
      curveSamples.push({ x: (cp.x - 0.5) * size, z: (cp.z - 0.5) * size });
    }

    function distToCurve(px, pz) {
      var minD = Infinity;
      var step = Math.max(1, Math.floor(curveSamples.length / 300));
      for (var k = 0; k < curveSamples.length; k += step) {
        var s = curveSamples[k];
        var dx = px - s.x, dz = pz - s.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minD) minD = dist;
      }
      for (var k2 = 0; k2 < curveSamples.length - 1; k2 += step) {
        var a = curveSamples[k2], b = curveSamples[Math.min(k2 + step, curveSamples.length - 1)];
        var abx = b.x - a.x, abz = b.z - a.z;
        var apx = px - a.x, apz = pz - a.z;
        var abLen2 = abx * abx + abz * abz;
        if (abLen2 < 0.0001) continue;
        var tt = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2));
        var cx = a.x + abx * tt, cz = a.z + abz * tt;
        var ddx = px - cx, ddz = pz - cz;
        var dd = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dd < minD) minD = dd;
      }
      return minD;
    }

    for (var i = 0; i < positions.count; i++) {
      var vx = positions.getX(i);
      var vz = positions.getZ(i);
      var dist = distToCurve(vx, vz);
      if (dist < falloffW) {
        var tn = dist / falloffW;
        var smoothT = tn * tn * (3 - 2 * tn);
        var depthFactor = 1.0 - smoothT;
        var yCut = maxCarve * depthFactor;
        positions.setY(i, positions.getY(i) - yCut);
      }
    }

    positions.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    updateTerrainColors();
  }

  function dragRiverPoint(clientX, clientY) {
    if (selectedRiverIndex < 0 || !workingRiverPoints) return;
    var hit = getTerrainHitPoint(clientX, clientY);
    if (!hit) return;
    var uv = worldToUV(hit.x, hit.z);
    workingRiverPoints[selectedRiverIndex].x = uv.x;
    workingRiverPoints[selectedRiverIndex].y = uv.y;
    rebuildRiverRender();
  }

  function addRiverPoint(clientX, clientY) {
    var hit = getTerrainHitPoint(clientX, clientY);
    if (!hit) return;
    var uv = worldToUV(hit.x, hit.z);
    var pts = ensureWorkingRiverPoints();
    if (pts.length < 2) {
      pts.push({ x: uv.x, y: uv.y });
      selectedRiverIndex = pts.length - 1;
    } else {
      var ctrlPts2D = [];
      for (var i = 0; i < pts.length; i++) {
        ctrlPts2D.push(new THREE.Vector3(pts[i].x, 0, pts[i].y));
      }
      var curve2D = new THREE.CatmullRomCurve3(ctrlPts2D, false, 'catmullrom', 0.2);
      var steps = 400;
      var bestT = 0, bestDist = Infinity;
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var cp = curve2D.getPoint(t);
        var dx = cp.x - uv.x, dz = cp.z - uv.y;
        var dist = dx * dx + dz * dz;
        if (dist < bestDist) { bestDist = dist; bestT = t; }
      }
      var insertIdx = 1;
      for (var j = 1; j < pts.length; j++) {
        if (bestT >= (j - 1) / (pts.length - 1)) insertIdx = j;
      }
      pts.splice(insertIdx, 0, { x: uv.x, y: uv.y });
      selectedRiverIndex = insertIdx;
    }
    rebuildRiverRender();
    showEditorToast('已添加河流点');
  }

  function deleteRiverPoint(idx) {
    var pts = ensureWorkingRiverPoints();
    if (pts.length <= 2) { showEditorToast('至少需要保留2个点'); return; }
    pts.splice(idx, 1);
    if (selectedRiverIndex >= pts.length) selectedRiverIndex = pts.length - 1;
    rebuildRiverRender();
    showEditorToast('已删除河流点');
  }

// 退出山峰模式
  function exitMountainMode() {
    if (viewMode !== 'mountain') return;
    if (isCameraAnimating) return;
    isCameraAnimating = true;
    viewMode = 'global';
    currentMountainRoute = null;
    workingTrailPoints = null;
    selectedTrailIndex = -1;
    isDraggingTrail = false;
    pointerDownOnTrail = false;
    workingRiverPoints = null;
    selectedRiverIndex = -1;
    isDraggingRiver = false;
    pointerDownOnRiver = false;
    workingCustomTrails = null;
    activeTrailId = null;
    trailDirectionOverrides = {};
    trailCompletedStatus = {};
    trailNameOverrides = {};
    if (backButton) backButton.style.display = 'none';
    if (editEntryBtn) editEntryBtn.style.display = 'none';
    if (addMarkerBtn) addMarkerBtn.style.display = 'none';
    toggleEditMode(false);
    exitPOIPlacementMode();
    hidePOIEditPanel();
    poiGroup = null;
    userPOIs = [];
    terrainMesh = null;
    baseHeights = null;
    origHeights = null;
    riverWidth = 2.5;
    riverDepth = 1.5;
    if (editCursor) { editCursor.visible = false; }
    if (trailHandlesGroup) { scene.remove(trailHandlesGroup); trailHandlesGroup = null; }
    if (riverHandlesGroup) { scene.remove(riverHandlesGroup); riverHandlesGroup = null; }

    var startPos = camera.position.clone();
    var startTarget = controls.target.clone();
    var endPos = new THREE.Vector3();
    var beta = (CONFIG.cameraBeta * Math.PI) / 180;
    var alpha = (CONFIG.cameraAlpha * Math.PI) / 180;
    endPos.x = CONFIG.cameraDistance * Math.sin(alpha) * Math.sin(beta);
    endPos.y = CONFIG.cameraDistance * Math.cos(alpha);
    endPos.z = CONFIG.cameraDistance * Math.sin(alpha) * Math.cos(beta);
    var targetPos = new THREE.Vector3(0, CONFIG.cameraTargetOffsetY, 0);

    var startTime = Date.now();
    var duration = 1500;
    controls.enabled = false;

    mapGroup.visible = true;
    markersGroup.visible = true;
    atmosphereGroup.visible = true;

    function animateExit() {
      var elapsed = Date.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      var easeT = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, endPos, easeT);
      controls.target.lerpVectors(startTarget, targetPos, easeT);
      camera.lookAt(controls.target);
      if (mountainGroup) {
        var scaleT = 1 - t;
        var s = Math.max(0.01, scaleT);
        mountainGroup.scale.set(s, s, s);
      }
      if (t < 1) {
        requestAnimationFrame(animateExit);
      } else {
        camera.position.copy(endPos);
        controls.target.copy(targetPos);
        camera.lookAt(controls.target);
        controls.minDistance = CONFIG.sphereRadius * 1.3;
        controls.maxDistance = CONFIG.sphereRadius * 3.0;
        controls.minPolarAngle = Math.PI * 0.1;
        controls.maxPolarAngle = Math.PI * 0.75;
        controls.enableDamping = true;
        controls.dampingFactor = 0.15;
        controls.update();
        controls.enabled = true;
        isCameraAnimating = false;
        if (mountainGroup) {
          scene.remove(mountainGroup);
          mountainGroup.traverse(function(obj) {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            }
          });
          mountainGroup = null;
        }
      }
    }
    animateExit();
  }

  function getViewMode() {
    return viewMode;
  }

  function dispose() {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (backButton) {
      backButton.remove();
      backButton = null;
    }
    window.removeEventListener('resize', onWindowResize);
  }

  function setOnTrailChangedCallback(cb) {
    onTrailChanged = cb;
  }

  function exportAllRouteData() {
    var exportData = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.indexOf(STORAGE_KEY_PREFIX) === 0 || key === 'adventure_diary_route_stats' || key === 'adventure_diary_route_ratings')) {
          var raw = localStorage.getItem(key);
          if (raw) {
            try {
              exportData[key] = JSON.parse(raw);
            } catch(e) {
              exportData[key] = raw;
            }
          }
        }
      }
    } catch(e) {
      console.warn('[Export] 导出数据失败:', e);
      return null;
    }
    return {
      version: '1.0',
      exportTime: new Date().toISOString(),
      data: exportData
    };
  }

  function importRouteData(importObj) {
    if (!importObj || !importObj.data) return false;
    try {
      var importData = importObj.data;
      var importedCount = 0;
      for (var key in importData) {
        if (importData.hasOwnProperty(key) && (key.indexOf(STORAGE_KEY_PREFIX) === 0 || key === 'adventure_diary_route_stats' || key === 'adventure_diary_route_ratings')) {
          var value = importData[key];
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
          importedCount++;
        }
      }
      if (currentMountainRoute) {
        var routeId = currentMountainRoute.id;
        workingCustomTrails = null;
        activeTrailId = null;
        trailDirectionOverrides = {};
        trailCompletedStatus = {};
        trailNameOverrides = {};
        deletedDefaultTrailIds = {};
        workingRiverPoints = null;
        var savedMod = loadAllTerrainMod(routeId);
        if (savedMod) {
          if (savedMod.riverPoints && savedMod.riverPoints.length >= 2) {
            workingRiverPoints = savedMod.riverPoints.map(function(p) {
              return { x: p.x, y: p.y };
            });
          }
          if (savedMod.riverWidth !== undefined) riverWidth = savedMod.riverWidth;
          if (savedMod.riverDepth !== undefined) riverDepth = savedMod.riverDepth;
          if (savedMod.customTrails) {
            workingCustomTrails = savedMod.customTrails.map(function(t) {
              return { id: t.id, name: t.name, direction: t.direction || 1, points: (t.points || []).map(function(p) { return { x: p.x, y: p.y, name: p.name }; }) };
            });
          }
          if (savedMod.activeTrailId) {
            activeTrailId = savedMod.activeTrailId;
          }
          if (savedMod.trailDirectionOverrides) {
            trailDirectionOverrides = JSON.parse(JSON.stringify(savedMod.trailDirectionOverrides));
          }
          if (savedMod.trailCompletedStatus) {
            trailCompletedStatus = JSON.parse(JSON.stringify(savedMod.trailCompletedStatus));
          }
          if (savedMod.trailNameOverrides) {
            trailNameOverrides = JSON.parse(JSON.stringify(savedMod.trailNameOverrides));
          }
          if (savedMod.deletedDefaultTrailIds) {
            deletedDefaultTrailIds = JSON.parse(JSON.stringify(savedMod.deletedDefaultTrailIds));
          }
        }
        initActiveTrail();
        if (workingRiverPoints && workingRiverPoints.length >= 2) {
          rebuildRiverRender();
        }
        if (mountainGroup) rebuildTrailRender();
        if (onTrailChanged) onTrailChanged();
      }
      return importedCount > 0;
    } catch(e) {
      console.warn('[Import] 导入数据失败:', e);
      return false;
    }
  }

  return {
    init: init,
    addMarkers: addMarkers,
    setOnRouteClick: setOnRouteClick,
    flyTo: flyTo,
    resetView: resetView,
    dispose: dispose,
    isReady: function() { return isReady; },
    enterMountainMode: enterMountainMode,
    exitMountainMode: exitMountainMode,
    getViewMode: getViewMode,
    getAllTrails: getAllTrails,
    getActiveTrail: getActiveTrail,
    setActiveTrail: setActiveTrail,
    addCustomTrail: addCustomTrail,
    deleteCustomTrail: deleteCustomTrail,
    renameTrail: renameTrail,
    resetTrailName: resetTrailName,
    setTrailDirection: setTrailDirection,
    setTrailCompleted: setTrailCompleted,
    setOnTrailChangedCallback: setOnTrailChangedCallback,
    exportAllRouteData: exportAllRouteData,
    importRouteData: importRouteData,
    refreshPOIs: function() { if (viewMode === 'mountain') rebuildPOIMarkers(); }
  };
})();
