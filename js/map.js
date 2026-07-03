/* ============================================================
   3D 地图模块 - ECharts GL 实现
   中国地形图 + 徒步点位标注 + 交互
   ============================================================ */

const MapModule = (function() {
  let chart = null;
  let currentFilter = 0;
  let defaultView = null;
  let mapLoaded = 'none';

  // 使用临时 canvas 检测 WebGL 是否真正可用
  function isWebGLSupported() {
    try {
      var testCanvas = document.createElement('canvas');
      testCanvas.width = 100;
      testCanvas.height = 100;
      var gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) return false;
      // 简单测试一下 WebGL 能否正常工作
      gl.clearColor(0.1, 0.2, 0.3, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return true;
    } catch(e) {
      return false;
    }
  }

  // 实际测试 ECharts 3D 功能是否可用（最可靠的方法）
  // 在隐藏 canvas 上尝试渲染一个最小的 3D 散点图
  function testECharts3D() {
    return new Promise(function(resolve) {
      try {
        if (typeof echarts === 'undefined') {
          console.warn('[Map] echarts 未定义');
          resolve(false);
          return;
        }

        // 创建隐藏的测试容器
        var testDiv = document.createElement('div');
        testDiv.style.position = 'absolute';
        testDiv.style.left = '-9999px';
        testDiv.style.top = '-9999px';
        testDiv.style.width = '200px';
        testDiv.style.height = '200px';
        testDiv.style.visibility = 'hidden';
        document.body.appendChild(testDiv);

        var testChart = echarts.init(testDiv);
        var testPassed = false;

        // 注册一个空地图用于测试
        echarts.registerMap('_test_map_', {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { name: 'test' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]]
            }
          }]
        });

        try {
          testChart.setOption({
            geo3D: {
              map: '_test_map_',
              itemStyle: {
                color: '#ff0000'
              }
            },
            series: [{
              type: 'scatter3D',
              coordinateSystem: 'geo3D',
              data: [[5, 5, 0]]
            }]
          });

          // 给一点时间渲染，然后检查 canvas
          setTimeout(function() {
            try {
              var canvases = testDiv.querySelectorAll('canvas');
              for (var i = 0; i < canvases.length; i++) {
                var c = canvases[i];
                if (c.width > 50 && c.height > 50) {
                  var dataUrl = c.toDataURL('image/png');
                  if (dataUrl.length > 1000) {
                    testPassed = true;
                    break;
                  }
                }
              }
            } catch(e) {
              console.warn('[Map] 3D 测试检测异常:', e.message);
            }
            try { testChart.dispose(); } catch(e) {}
            testDiv.remove();
            console.log('[Map] 3D 功能测试结果:', testPassed);
            resolve(testPassed);
          }, 1500);

        } catch(e) {
          console.warn('[Map] 3D 功能测试异常:', e.message);
          try { testChart.dispose(); } catch(e2) {}
          testDiv.remove();
          resolve(false);
        }

      } catch(e) {
        console.warn('[Map] 3D 测试初始化失败:', e.message);
        resolve(false);
      }
    });
  }

  // 重建 ECharts 实例（彻底清除旧配置，避免 2D/3D 切换时的残留问题）
  function recreateChart() {
    var container = document.getElementById('map-container');
    if (!container) return null;
    
    if (chart) {
      try { chart.dispose(); } catch(e) {}
      chart = null;
    }
    
    chart = echarts.init(container);
    
    chart.on('error', function(params) {
      console.error('[Map] 图表错误:', params);
    });
    
    chart.on('finished', function() {
      console.log('[Map] 图表渲染完成, 当前模式:', mapLoaded);
    });
    
    return chart;
  }

  // 等待 Three.js 加载完成（最多等 8 秒）
  function waitForThreeJS(callback, timeout) {
    timeout = timeout || 8000;
    var startTime = Date.now();
    
    function check() {
      if (typeof THREE !== 'undefined' && 
          typeof THREE.OrbitControls !== 'undefined' && 
          typeof ThreeMap !== 'undefined') {
        console.log('[Map] Three.js 已就绪，版本:', THREE.REVISION);
        callback(true);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        console.warn('[Map] 等待 Three.js 超时:', {
          THREE: typeof THREE,
          OrbitControls: typeof THREE !== 'undefined' ? typeof THREE.OrbitControls : 'N/A',
          ThreeMap: typeof ThreeMap
        });
        callback(false);
        return;
      }
      
      setTimeout(check, 200);
    }
    
    check();
  }

  // 初始化地图
  function init() {
    var container = document.getElementById('map-container');
    if (!container) {
      console.error('[Map] 容器 #map-container 不存在');
      return;
    }

    updateStatus('地图加载中...');
    updateToggleButton();
    setupEvents();

    // 等待 Three.js 加载，然后尝试
    waitForThreeJS(function(threeReady) {
      if (threeReady) {
        console.log('[Map] 尝试 Three.js 3D 地图...');
        try {
          ThreeMap.init('map-container', function() {
            console.log('[Map] Three.js 3D 地图初始化成功');
            mapLoaded = '3d';
            
            // 添加标记
            if (routes && routes.length > 0) {
              ThreeMap.addMarkers(routes);
            }
            
            // 设置点击回调
            ThreeMap.setOnRouteClick(function(route) {
              if (typeof App !== 'undefined' && App.openRoutePanel) {
                App.openRoutePanel(route.id);
              }
            });
            
            updateStatus('3D 地形图', true);
            updateToggleButton();
          });
          return;
        } catch (e) {
          console.error('[Map] Three.js 初始化失败:', e);
          console.error('[Map] 错误堆栈:', e.stack);
        }
      }

      // 降级到 ECharts
      console.log('[Map] 降级到 ECharts 方案');
      recreateChart();
      console.log('[Map] ECharts 实例已创建');

      // 先显示降级方案（避免白屏）
      mapLoaded = 'none';
      renderMapFallback();

    // 检测 WebGL 支持
    var webglOk = isWebGLSupported();
    console.log('[Map] WebGL 支持:', webglOk);

    // 先加载地图数据
    loadChinaMap()
      .then(function(geoJson) {
        console.log('[Map] GeoJSON 加载成功，注册地图...');
        echarts.registerMap('china', geoJson);

        if (!webglOk) {
          console.log('[Map] WebGL 不支持，直接使用 2D 模式');
          fallbackTo2D();
          return;
        }

        // WebGL 可用，先快速测试 3D 功能是否真正可用
        updateStatus('检测 3D 支持...');
        testECharts3D().then(function(available3D) {
          console.log('[Map] 3D 功能可用:', available3D);
          if (available3D) {
            // 3D 可用，尝试渲染 3D 地图
            console.log('[Map] 开始渲染 3D 地形图...');
            try {
              mapLoaded = '3d';
              recreateChart();
              setupEvents();
              renderMap();
              updateStatus('3D 地形图加载中...');
              // 3D 渲染需要更多时间，5 秒后再检测
              setTimeout(function() {
                if (mapLoaded === '3d') {
                  var rendered = is3DRendered();
                  console.log('[Map] 3D 渲染检测结果:', rendered);
                  
                  // 输出当前3D视角参数（调试用）
                  try {
                    var opt = chart.getOption();
                    var vc = null;
                    if (opt && opt.geo3D && opt.geo3D[0]) {
                      vc = opt.geo3D[0].viewControl;
                    } else if (opt && opt.globe && opt.globe[0]) {
                      vc = opt.globe[0].viewControl;
                    }
                    if (vc) {
                      console.log('[Map] 当前3D视角:', JSON.stringify({
                        alpha: vc.alpha,
                        beta: vc.beta,
                        distance: vc.distance
                      }));
                    }
                  } catch(e) {
                    console.log('[Map] 获取视角失败:', e);
                  }
                  
                  if (rendered) {
                    updateStatus('3D 地形图', true);
                    updateToggleButton();
                  } else {
                    console.log('[Map] 3D 渲染异常，降级到 2D');
                    fallbackTo2D();
                  }
                }
              }, 5000);
            } catch(e) {
              console.warn('[Map] 3D 渲染异常:', e.message);
              fallbackTo2D();
            }
          } else {
            console.log('[Map] 3D 功能不可用，使用 2D 模式');
            fallbackTo2D();
          }
        });
      })
      .catch(function(err) {
        console.warn('[Map] GeoJSON 加载失败，保持降级模式:', err.message || err);
        updateStatus('离线模式 · ' + (routes ? routes.length : 0) + ' 个点位');
      });
    });
  }

  // 降级到 2D 模式
  function fallbackTo2D() {
    mapLoaded = '2d';
    recreateChart();
    setupEvents();
    renderMap2D();
    updateStatus('2D 地图模式', true);
    updateToggleButton();
  }

  // 更新地图状态指示器
  function updateStatus(msg, autoHide) {
    var el = document.getElementById('map-status');
    if (el) {
      el.textContent = msg || '';
      el.style.opacity = msg ? '1' : '0';
      if (autoHide && msg) {
        setTimeout(function() {
          el.style.opacity = '0';
        }, 3000);
      }
    }
  }

  // 检测 3D 是否真的渲染成功
  // 使用 toDataURL 判断 canvas 是否有实际内容
  function is3DRendered() {
    try {
      var container = document.getElementById('map-container');
      var canvases = container.querySelectorAll('canvas');
      console.log('[Map] 检测到 canvas 数量:', canvases.length);

      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        if (c.width < 100 || c.height < 100) continue;

        // 方法1：通过 canvas 尺寸和 data URL 大小判断
        // 尝试多种格式
        var dataUrl = '';
        try {
          dataUrl = c.toDataURL('image/png');
        } catch(e) {
          try {
            dataUrl = c.toDataURL('image/jpeg', 0.1);
          } catch(e2) {
            dataUrl = '';
          }
        }

        console.log('[Map] Canvas[' + i + '] 尺寸:', c.width + 'x' + c.height, '| dataURL 长度:', dataUrl.length);

        // 有实际内容的 canvas 会产生较大的 dataURL
        // 注意：2D geo 地图也会有内容，所以需要结合 WebGL 检测
        if (dataUrl.length > 2000) {
          // 进一步检测是否是 WebGL canvas（3D 模式）
          var isGL = false;
          var attrCombos = [
            { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false },
            { alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false },
            { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true },
            undefined,
            {}
          ];
          for (var j = 0; j < attrCombos.length; j++) {
            var gl = c.getContext('webgl', attrCombos[j]) || c.getContext('experimental-webgl', attrCombos[j]);
            if (gl && !gl.isContextLost()) {
              isGL = true;
              console.log('[Map] Canvas[' + i + '] 是 WebGL canvas');
              break;
            }
          }

          if (isGL) {
            return true;
          }
        }
      }
      return false;
    } catch(e) {
      console.warn('[Map] is3DRendered 异常:', e.message);
      return false;
    }
  }

  // 加载中国地图 GeoJSON
  function loadChinaMap() {
    return new Promise(function(resolve, reject) {
      // 方案1：尝试 fetch 加载（需 http 协议）
      var geoUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';

      fetch(geoUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) { resolve(data); })
        .catch(function() {
          // 方案2：JSONP 方式加载（兼容 file://）
          loadMapByJSONP().then(resolve).catch(reject);
        });
    });
  }

  // JSONP 方式加载地图
  function loadMapByJSONP() {
    return new Promise(function(resolve, reject) {
      var callbackName = 'echartsChinaMapCallback_' + Date.now();
      var script = document.createElement('script');
      var jsonpUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json?callback=' + callbackName;

      window[callbackName] = function(data) {
        resolve(data);
        delete window[callbackName];
        script.remove();
      };

      script.onerror = function() {
        reject(new Error('JSONP map load failed'));
        delete window[callbackName];
        script.remove();
      };

      script.src = jsonpUrl;
      document.head.appendChild(script);

      // 超时处理
      setTimeout(function() {
        if (window[callbackName]) {
          reject(new Error('Map load timeout'));
          delete window[callbackName];
          script.remove();
        }
      }, 15000);
    });
  }

  // 渲染 3D 地图
  function renderMap() {
    var option = buildMapOption();
    chart.setOption(option);

    setTimeout(function() {
      defaultView = {
        alpha: 50,
        beta: 5,
        distance: 70
      };
    }, 500);
  }

  // 渲染 2D geo 地图（主模式）
  function renderMap2D() {
    var option = buildMapOption2D();
    chart.setOption(option);

    setTimeout(function() {
      defaultView = {
        center: [104.0, 35.0],
        zoom: 1.2
      };
    }, 500);
  }

  // 降级方案：使用普通 2D 地图 + 散点
  function renderMapFallback() {
    var option = buildMapOptionFallback();
    chart.setOption(option);
    // fallback 是 cartesian2d 模式，不需要 3D view 参数
  }

  // 构建 3D 地图配置（立体地形图效果）
  function buildMapOption() {
    return {
      backgroundColor: '#0a0b0d',
      tooltip: { show: false },
      geo3D: {
        map: 'china',
        regionHeight: 12,
        boxHeight: 10,
        shading: 'lambert',
        light: {
          main: {
            intensity: 2.5,
            alpha: 55,
            beta: 35
          },
          ambient: {
            intensity: 0.4
          }
        },
        itemStyle: {
          color: '#2a3442',
          borderColor: '#4a5668',
          borderWidth: 0.8,
          opacity: 1
        },
        label: { show: false },
        viewControl: {
          alpha: 50,
          beta: 5,
          distance: 70,
          minDistance: 40,
          maxDistance: 200,
          minAlpha: 15,
          maxAlpha: 80,
          rotateSensitivity: 1,
          zoomSensitivity: 1.2,
          panSensitivity: 1,
          panMouseButton: 'right',
          rotateMouseButton: 'left',
          autoRotate: false,
          animationDurationUpdate: 1000,
          animationEasing: 'cubicOut'
        }
      },
      series: [{
        type: 'scatter3D',
        coordinateSystem: 'geo3D',
        symbol: 'circle',
        symbolSize: 20,
        itemStyle: {
          color: '#fca311',
          borderColor: '#ffffff',
          borderWidth: 2.5,
          opacity: 1
        },
        emphasis: {
          itemStyle: {
            color: '#ffffff',
            borderColor: '#fca311',
            borderWidth: 3.5
          },
          scale: 1.6
        },
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          distance: 15,
          textStyle: {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 500,
            backgroundColor: 'rgba(0,0,0,0.65)',
            padding: [4, 8],
            borderRadius: 4
          }
        },
        data: routes.map(function(r) {
          return {
            name: r.name,
            value: [r.lng, r.lat, r.maxAltitude * 0.01],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 14 + r.difficulty * 3
          };
        })
      }]
    };
  }

  // 构建 2D geo 地图配置（主模式）
  function buildMapOption2D() {
    return {
      backgroundColor: '#121417',
      tooltip: { show: false },
      geo: {
        map: 'china',
        roam: true,
        zoom: 1.2,
        center: [104.0, 35.0],
        scaleLimit: { min: 0.6, max: 6 },
        itemStyle: {
          areaColor: '#1e2228',
          borderColor: '#2a2f36',
          borderWidth: 0.6
        },
        emphasis: {
          disabled: true,
          label: { show: false },
          itemStyle: { areaColor: '#252a32' }
        },
        label: { show: false },
        select: {
          disabled: true
        }
      },
      series: [
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          symbolSize: 10,
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke',
            scale: 2.5,
            period: 3
          },
          itemStyle: {
            color: '#ffffff',
            shadowBlur: 15,
            shadowColor: 'rgba(255,255,255,0.5)'
          },
          label: {
            show: true,
            position: 'right',
            distance: 8,
            color: '#9aa0a8',
            fontSize: 12,
            fontWeight: 500,
            formatter: '{b}'
          },
          data: routes.map(function(r) {
            return {
              name: r.name,
              value: [r.lng, r.lat],
              routeId: r.id,
              difficulty: r.difficulty,
              symbolSize: 7 + r.difficulty * 1.8,
              rippleEffect: {
                scale: 1.8 + r.difficulty * 0.5,
                period: 4 - r.difficulty * 0.4
              },
              itemStyle: {
                shadowBlur: 8 + r.difficulty * 6,
                shadowColor: 'rgba(255,255,255,' + (0.2 + r.difficulty * 0.07) + ')'
              }
            };
          })
        }
      ]
    };
  }

  // 降级方案（无地图数据时：暗色背景 + 2D散点点位）
  function buildMapOptionFallback() {
    return {
      backgroundColor: '#121417',
      title: {
        text: '熊猫历险记',
        left: 'center',
        top: 'center',
        textStyle: {
          color: 'rgba(255,255,255,0.06)',
          fontSize: 64,
          fontWeight: 200,
          letterSpacing: 12
        }
      },
      xAxis: {
        type: 'value',
        min: 73,
        max: 136,
        show: false
      },
      yAxis: {
        type: 'value',
        min: 18,
        max: 54,
        show: false
      },
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      },
      series: [{
        type: 'effectScatter',
        coordinateSystem: 'cartesian2d',
        symbolSize: 12,
        rippleEffect: {
          brushType: 'stroke',
          scale: 2.5,
          period: 3
        },
        itemStyle: {
          color: '#ffffff',
          shadowBlur: 20,
          shadowColor: 'rgba(255,255,255,0.5)'
        },
        label: {
          show: true,
          position: 'right',
          distance: 8,
          color: '#9aa0a8',
          fontSize: 12,
          fontWeight: 500
        },
        data: routes.map(function(r) {
          return {
            name: r.name,
            value: [r.lng, r.lat],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 8 + r.difficulty * 2,
            rippleEffect: {
              scale: 2 + r.difficulty * 0.6,
              period: 4 - r.difficulty * 0.4
            },
            itemStyle: {
              shadowBlur: 10 + r.difficulty * 8,
              shadowColor: 'rgba(255,255,255,' + (0.2 + r.difficulty * 0.08) + ')'
            },
            label: {
              show: true,
              position: 'right',
              distance: 10,
              color: '#9aa0a8',
              fontSize: 12
            }
          };
        })
      },
      {
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        symbolSize: 2,
        itemStyle: {
          color: 'rgba(255,255,255,0.1)',
          opacity: 0.3
        },
        data: generateBackgroundDots()
      }]
    };
  }

  // 生成背景装饰点（模拟地形纹理）
  function generateBackgroundDots() {
    var dots = [];
    for (var i = 0; i < 200; i++) {
      var lng = 73 + Math.random() * 63;
      var lat = 18 + Math.random() * 36;
      dots.push([lng, lat]);
    }
    return dots;
  }

  // 设置事件监听
  function setupEvents() {
    if (!chart) return;

    var scatterClicked = false;

    // 点击散点（3D模式）
    chart.on('click', { seriesIndex: 0 }, function(params) {
      if (params.data && params.data.routeId) {
        scatterClicked = true;
        var route = getRouteById(params.data.routeId);
        if (route) {
          flyToRoute(route);
          if (typeof App !== 'undefined' && App.openRoutePanel) {
            App.openRoutePanel(route.id);
          }
        }
      }
    });

    // 点击空白区域
    chart.getZr().on('click', function() {
      setTimeout(function() {
        if (scatterClicked) {
          scatterClicked = false;
          return;
        }
        if (typeof App !== 'undefined' && App.closeAllPanels) {
          App.closeAllPanels();
        }
        resetView();
      }, 50);
    });

    // 窗口大小变化
    window.addEventListener('resize', function() {
      chart && chart.resize();
    });

    // 地图模式切换按钮
    var toggleBtn = document.getElementById('map-mode-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleMode();
      });
    }
  }

  // 飞行到指定路线
  function flyToRoute(route) {
    if (!route) return;

    // Three.js 模式
    if (typeof ThreeMap !== 'undefined' && ThreeMap.isReady()) {
      // 有地形数据的路线直接进入山峰模式
      if (route.terrain) {
        ThreeMap.enterMountainMode(route);
      } else {
        ThreeMap.flyTo(route);
      }
      return;
    }

    if (!chart) return;

    if (mapLoaded === '3d') {
      // 3D 地形图模式
      chart.setOption({
        geo3D: {
          viewControl: {
            center: [route.lng, route.lat],
            distance: 45,
            alpha: 45,
            animationDurationUpdate: 1000,
            animationEasing: 'cubicOut'
          }
        }
      });
    } else if (mapLoaded === '2d') {
      // 2D geo 模式
      chart.setOption({
        geo: {
          center: [route.lng, route.lat],
          zoom: 4,
          animationDurationUpdate: 800,
          animationEasing: 'cubicOut'
        }
      });
    }
    // 降级2D cartesian 模式不支持飞行
  }

  // 恢复全局视角
  function resetView() {
    // Three.js 模式
    if (typeof ThreeMap !== 'undefined' && ThreeMap.isReady()) {
      // 山峰模式下先退出
      if (ThreeMap.getViewMode() === 'mountain') {
        ThreeMap.exitMountainMode();
      } else {
        ThreeMap.resetView();
      }
      return;
    }

    if (!chart) return;

    if (mapLoaded === '3d') {
      chart.setOption({
        geo3D: {
          viewControl: {
            distance: defaultView.distance,
            alpha: defaultView.alpha,
            beta: defaultView.beta,
            animationDurationUpdate: 1000,
            animationEasing: 'cubicOut'
          }
        }
      });
    } else if (mapLoaded === '2d') {
      chart.setOption({
        geo: {
          center: [104.0, 35.0],
          zoom: 1.2,
          animationDurationUpdate: 800,
          animationEasing: 'cubicOut'
        }
      });
    }
  }

  // 按星级筛选点位
  function filterByStar(starLevel) {
    currentFilter = starLevel;

    // Three.js 模式
    if (typeof ThreeMap !== 'undefined' && ThreeMap.isReady()) {
      var filteredRoutes = routes.filter(function(r) {
        return starLevel === 0 || r.difficulty === starLevel;
      });
      ThreeMap.addMarkers(filteredRoutes);
      return;
    }

    if (!chart) return;

    var filteredData = routes
      .filter(function(r) { return starLevel === 0 || r.difficulty === starLevel; })
      .map(function(r) {
        if (mapLoaded === '3d') {
          return {
            name: r.name,
            value: [r.lng, r.lat, r.maxAltitude * 0.01],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 14 + r.difficulty * 3,
            label: {
              show: true,
              formatter: '{b}',
              position: 'right',
              distance: 15,
              textStyle: {
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: 'rgba(0,0,0,0.65)',
                padding: [4, 8],
                borderRadius: 4
              }
            },
            itemStyle: {
              color: '#fca311',
              borderColor: '#ffffff',
              borderWidth: 2.5,
              opacity: 1
            },
            emphasis: {
              itemStyle: {
                color: '#ffffff',
                borderColor: '#fca311',
                borderWidth: 3.5
              },
              scale: 1.6
            }
          };
        } else if (mapLoaded === '2d') {
          return {
            name: r.name,
            value: [r.lng, r.lat],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 8 + r.difficulty * 1.5,
            rippleEffect: {
              scale: 2 + r.difficulty * 0.6
            },
            label: {
              show: true,
              position: 'right',
              distance: 10,
              color: '#9aa0a8',
              fontSize: 12
            }
          };
        } else {
          // fallback: cartesian 2d
          return {
            name: r.name,
            value: [r.lng, r.lat],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 8 + r.difficulty * 2,
            rippleEffect: {
              scale: 2 + r.difficulty * 0.6,
              period: 4 - r.difficulty * 0.4
            },
            itemStyle: {
              shadowBlur: 10 + r.difficulty * 8,
              shadowColor: 'rgba(255,255,255,' + (0.2 + r.difficulty * 0.08) + ')'
            },
            label: {
              show: true,
              position: 'right',
              distance: 10,
              color: '#9aa0a8',
              fontSize: 12
            }
          };
        }
      });

    var dimmedData = routes
      .filter(function(r) { return starLevel !== 0 && r.difficulty !== starLevel; })
      .map(function(r) {
        if (mapLoaded === '3d') {
          return {
            name: r.name,
            value: [r.lng, r.lat, r.maxAltitude * 0.01],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 8,
            label: { show: false },
            itemStyle: {
              color: 'rgba(255,255,255,0.2)',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              opacity: 0.4
            }
          };
        } else if (mapLoaded === '2d') {
          return {
            name: r.name,
            value: [r.lng, r.lat],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 5,
            rippleEffect: { scale: 1.2, period: 8 },
            itemStyle: {
              color: 'rgba(255,255,255,0.2)',
              shadowBlur: 3
            },
            label: { show: false }
          };
        } else {
          return {
            name: r.name,
            value: [r.lng, r.lat],
            routeId: r.id,
            difficulty: r.difficulty,
            symbolSize: 5,
            rippleEffect: { scale: 1.2, period: 8 },
            itemStyle: {
              color: 'rgba(255,255,255,0.2)',
              shadowBlur: 3
            },
            label: {
              show: true,
              position: 'right',
              distance: 10,
              color: 'rgba(154,160,168,0.3)',
              fontSize: 12
            }
          };
        }
      });

    if (mapLoaded === 'none') {
      // fallback 模式：保留背景点
      chart.setOption({
        series: [{
          data: filteredData.concat(dimmedData)
        }, {
          data: generateBackgroundDots()
        }]
      });
    } else {
      chart.setOption({
        series: [{
          data: filteredData.concat(dimmedData)
        }]
      });
    }
  }

  function resize() {
    chart && chart.resize();
  }

  function getChart() {
    return chart;
  }

  function getMapMode() {
    return mapLoaded;
  }

  // 切换 2D/3D 模式
  function toggleMode() {
    if (!chart) return;

    if (mapLoaded === '3d') {
      // 切换到 2D
      console.log('[Map] 手动切换到 2D 模式');
      fallbackTo2D();
    } else if (mapLoaded === '2d') {
      // 切换到 3D
      console.log('[Map] 手动切换到 3D 模式');
      var webglOk = isWebGLSupported();
      if (!webglOk) {
        updateStatus('当前浏览器不支持 WebGL', true);
        return;
      }
      try {
        mapLoaded = '3d';
        recreateChart();
        setupEvents();
        renderMap();
        updateStatus('3D 地形图加载中...');
        setTimeout(function() {
          if (mapLoaded === '3d') {
            var rendered = is3DRendered();
            console.log('[Map] 手动切换后 3D 渲染检测:', rendered);
            if (rendered) {
              updateStatus('3D 地形图', true);
            } else {
              console.log('[Map] 3D 渲染失败，切回 2D');
              fallbackTo2D();
              updateStatus('3D 不可用，已切换回 2D', true);
            }
          }
          updateToggleButton();
        }, 5000);
      } catch(e) {
        console.warn('[Map] 切换到 3D 失败:', e.message);
        fallbackTo2D();
        updateStatus('3D 不可用', true);
      }
    }
    updateToggleButton();
  }

  // 更新切换按钮显示文字
  function updateToggleButton() {
    var btn = document.getElementById('map-mode-toggle');
    if (btn) {
      if (mapLoaded === '3d') {
        btn.textContent = '3D';
        btn.title = '点击切换到 2D 模式';
      } else if (mapLoaded === '2d') {
        btn.textContent = '2D';
        btn.title = '点击切换到 3D 模式';
      } else {
        btn.textContent = '...';
        btn.title = '地图加载中';
      }
    }
  }

  return {
    init: init,
    flyToRoute: flyToRoute,
    resetView: resetView,
    filterByStar: filterByStar,
    resize: resize,
    getChart: getChart,
    getMapMode: getMapMode,
    toggleMode: toggleMode,
    updateToggleButton: updateToggleButton
  };
})();