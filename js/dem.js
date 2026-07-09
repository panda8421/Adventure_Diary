(function(global) {
  'use strict';

  const TILE_SIZE = 256;
  const DEFAULT_ZOOM = 12;
  const DEFAULT_GRID_SIZE = 256;
  const DEFAULT_MOUNTAIN_SIZE = 80;
  const WORKER_BASE = '';
  const MEM_CACHE_LIMIT = 64;
  const LS_CACHE_KEY_PREFIX = 'dem_tile_';
  const LS_CACHE_MAX_BYTES = 50 * 1024 * 1024;

  const _memCache = new Map();
  let _lsCacheSize = -1;

  function lngLatToGlobalPixel(lng, lat, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const x = (lng + 180) / 360 * scale;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale;
    return { x, y };
  }

  function globalPixelToLngLat(px, py, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = px / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * py / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lng, lat };
  }

  function lngLatToTile(lng, lat, zoom) {
    const { x, y } = lngLatToGlobalPixel(lng, lat, zoom);
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    const ix = Math.floor(x - tx * TILE_SIZE);
    const iy = Math.floor(y - ty * TILE_SIZE);
    return { tx, ty, ix, iy };
  }

  function decodeTerrainRGB(R, G, B) {
    return -10000 + (R * 65536 + G * 256 + B) * 0.1;
  }

  function getLSCacheSize() {
    if (_lsCacheSize >= 0) return _lsCacheSize;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_CACHE_KEY_PREFIX)) {
        total += (localStorage.getItem(k) || '').length;
      }
    }
    _lsCacheSize = total;
    return _lsCacheSize;
  }

  function lsGet(key) {
    try {
      const raw = localStorage.getItem(LS_CACHE_KEY_PREFIX + key);
      if (!raw) return null;
      const buf = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      return new Float32Array(buf.buffer);
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, data) {
    try {
      const bin = new Uint8Array(data.buffer);
      const raw = btoa(String.fromCharCode.apply(null, bin));
      if (getLSCacheSize() + raw.length > LS_CACHE_MAX_BYTES) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_CACHE_KEY_PREFIX)) keys.push(k);
        }
        keys.sort();
        while (getLSCacheSize() + raw.length > LS_CACHE_MAX_BYTES && keys.length > 0) {
          const oldKey = keys.shift();
          const oldVal = localStorage.getItem(oldKey) || '';
          _lsCacheSize -= oldVal.length;
          localStorage.removeItem(oldKey);
        }
      }
      localStorage.setItem(LS_CACHE_KEY_PREFIX + key, raw);
      _lsCacheSize += raw.length;
    } catch (e) {
      // silently fail
    }
  }

  function memCacheGet(key) {
    if (!_memCache.has(key)) return null;
    const val = _memCache.get(key);
    _memCache.delete(key);
    _memCache.set(key, val);
    return val;
  }

  function memCacheSet(key, val) {
    if (_memCache.size >= MEM_CACHE_LIMIT) {
      const firstKey = _memCache.keys().next().value;
      _memCache.delete(firstKey);
    }
    _memCache.set(key, val);
  }

  async function fetchTile(z, x, y) {
    const cacheKey = `${z}_${x}_${y}`;

    const memCached = memCacheGet(cacheKey);
    if (memCached) return memCached;

    const lsCached = lsGet(cacheKey);
    if (lsCached) {
      memCacheSet(cacheKey, lsCached);
      return lsCached;
    }

    const url = `${WORKER_BASE}/api/terrain/${z}/${x}/${y}.png`;

    let img;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        img = await loadImage(url);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    const pixels = imgData.data;

    const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      heights[i] = decodeTerrainRGB(r, g, b);
    }

    memCacheSet(cacheKey, heights);
    lsSet(cacheKey, heights);
    return heights;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load tile: ' + url));
      img.src = url;
    });
  }

  function sampleTileBilinear(heights, px, py) {
    const x0 = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor(px)));
    const y0 = Math.max(0, Math.min(TILE_SIZE - 1, Math.floor(py)));
    const x1 = Math.min(TILE_SIZE - 1, x0 + 1);
    const y1 = Math.min(TILE_SIZE - 1, y0 + 1);
    const fx = px - x0;
    const fy = py - y0;

    const h00 = heights[y0 * TILE_SIZE + x0];
    const h10 = heights[y0 * TILE_SIZE + x1];
    const h01 = heights[y1 * TILE_SIZE + x0];
    const h11 = heights[y1 * TILE_SIZE + x1];

    return h00 * (1 - fx) * (1 - fy)
         + h10 * fx * (1 - fy)
         + h01 * (1 - fx) * fy
         + h11 * fx * fy;
  }

  function sampleFromTiles(tiles, z, lng, lat) {
    const { tx: baseTx, ty: baseTy } = lngLatToTile(0, 0, z);
    const { x: gx, y: gy } = lngLatToGlobalPixel(lng, lat, z);

    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const ix = gx - tx * TILE_SIZE;
    const iy = gy - ty * TILE_SIZE;

    const tileKey = `${tx}_${ty}`;
    const heights = tiles[tileKey];
    if (!heights) return null;

    return sampleTileBilinear(heights, ix, iy);
  }

  function calculateBounds(centerLng, centerLat, radiusKm, zoom) {
    const metersPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    const metersPerDegLat = 110540;

    const halfLngDeg = (radiusKm * 1000) / metersPerDegLng;
    const halfLatDeg = (radiusKm * 1000) / metersPerDegLat;

    const bounds = {
      west: centerLng - halfLngDeg,
      east: centerLng + halfLngDeg,
      south: centerLat - halfLatDeg,
      north: centerLat + halfLatDeg,
    };

    const nw = lngLatToTile(bounds.west, bounds.north, zoom);
    const se = lngLatToTile(bounds.east, bounds.south, zoom);

    const tiles = [];
    for (let ty = nw.ty; ty <= se.ty; ty++) {
      for (let tx = nw.tx; tx <= se.tx; tx++) {
        tiles.push({ z: zoom, x: tx, y: ty });
      }
    }

    const nwLL = globalPixelToLngLat(nw.tx * TILE_SIZE, nw.ty * TILE_SIZE, zoom);
    const seLL = globalPixelToLngLat((se.tx + 1) * TILE_SIZE, (se.ty + 1) * TILE_SIZE, zoom);

    bounds.actualWest = nwLL.lng;
    bounds.actualNorth = nwLL.lat;
    bounds.actualEast = seLL.lng;
    bounds.actualSouth = seLL.lat;

    return { bounds, tiles, nwTile: nw, seTile: se };
  }

  async function loadRouteTerrain(route, options) {
    const opts = Object.assign({
      zoom: DEFAULT_ZOOM,
      gridSize: DEFAULT_GRID_SIZE,
      mountainSize: DEFAULT_MOUNTAIN_SIZE,
      onProgress: null,
    }, options || {});

    const centerLng = route.center.lng;
    const centerLat = route.center.lat;
    const radiusKm = route.viewRadiusKm || 5;
    const zoom = opts.zoom;
    const gridSize = opts.gridSize;
    const mountainSize = opts.mountainSize;

    const { bounds, tiles } = calculateBounds(centerLng, centerLat, radiusKm, zoom);

    const loadedTiles = {};
    let loaded = 0;
    const total = tiles.length;

    for (const tile of tiles) {
      const heights = await fetchTile(tile.z, tile.x, tile.y);
      loadedTiles[`${tile.x}_${tile.y}`] = heights;
      loaded++;
      if (opts.onProgress) {
        opts.onProgress(loaded, total);
      }
    }

    const heightMatrix = new Float32Array(gridSize * gridSize);
    let minH = Infinity, maxH = -Infinity;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const u = col / (gridSize - 1);
        const v = row / (gridSize - 1);
        const lng = bounds.west + u * (bounds.east - bounds.west);
        const lat = bounds.north - v * (bounds.north - bounds.south);

        const h = sampleFromTiles(loadedTiles, zoom, lng, lat);
        if (h !== null) {
          heightMatrix[row * gridSize + col] = h;
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        } else {
          heightMatrix[row * gridSize + col] = 0;
        }
      }
    }

    if (minH === Infinity) minH = 0;
    if (maxH === -Infinity) maxH = 1000;

    const centerHeight = sampleFromTiles(loadedTiles, zoom, centerLng, centerLat) || (minH + maxH) / 2;

    const metersPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    const metersPerDegLat = 110540;

    function project(lng, lat) {
      const dx = (lng - centerLng) * metersPerDegLng;
      const dz = (lat - centerLat) * metersPerDegLat;
      return {
        x: (dx / (radiusKm * 2000)) * mountainSize,
        z: -(dz / (radiusKm * 2000)) * mountainSize,
      };
    }

    function unproject(x, z) {
      const dx = (x / mountainSize) * radiusKm * 2000;
      const dz = -(z / mountainSize) * radiusKm * 2000;
      return {
        lng: centerLng + dx / metersPerDegLng,
        lat: centerLat + dz / metersPerDegLat,
      };
    }

    function getHeight(lng, lat) {
      return sampleFromTiles(loadedTiles, zoom, lng, lat) || centerHeight;
    }

    function getHeightAtGrid(row, col) {
      return heightMatrix[row * gridSize + col];
    }

    return {
      heights: heightMatrix,
      minHeight: minH,
      maxHeight: maxH,
      centerHeight: centerHeight,
      bounds: bounds,
      gridSize: gridSize,
      radiusKm: radiusKm,
      mountainSize: mountainSize,
      verticalScale: (route.terrain && route.terrain.verticalScale) || 1.5,
      project: project,
      unproject: unproject,
      getHeight: getHeight,
      getHeightAtGrid: getHeightAtGrid,
    };
  }

  function clearCache() {
    _memCache.clear();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_CACHE_KEY_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
    _lsCacheSize = -1;
  }

  global.DEMLoader = {
    loadRouteTerrain: loadRouteTerrain,
    decodeTerrainRGB: decodeTerrainRGB,
    lngLatToTile: lngLatToTile,
    lngLatToGlobalPixel: lngLatToGlobalPixel,
    globalPixelToLngLat: globalPixelToLngLat,
    clearCache: clearCache,
  };

})(typeof window !== 'undefined' ? window : this);
