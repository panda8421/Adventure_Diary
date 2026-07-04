/* ============================================================
   数据定义文件 - 徒步路线 & 装备数据
   新增路线：复制 routes 数组中的一个条目，修改字段即可
   新增装备：复制 gears 数组中的一个条目，修改字段即可
   ============================================================ */

// 徒步路线数据
const routes = [
  {
    id: 'wangping',
    name: '王平煤矿',
    lat: 39.9700,
    lng: 115.9500,
    difficulty: 1,
    difficultyLabel: '休闲级',
    date: '2024-03-15',
    distance: 8.5,
    elevation: 320,
    maxAltitude: 780,
    description: '京西古道旁的王平煤矿，是一座废弃多年的工业遗迹。徒步路线从王平村出发，沿矿区铁路遗址深入，沿途可见锈迹斑斑的铁轨、坍塌的矿洞入口和废弃的厂房建筑。\n\n整条路线难度不高，以平路和缓坡为主，适合新手入门。矿区深处的几栋废弃办公楼是摄影爱好者的最爱，斑驳的墙面和疯长的藤蔓构成了独特的废墟美学。\n\n建议春秋两季前往，避开夏季矿区的高温和冬季的西北风。全程约4小时，带足水和简单的路餐即可。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=abandoned+coal+mine+industrial+ruins+rusty+railway+tracks+overgrown+vegetation+dark+moody+photography&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=old+abandoned+factory+building+crumbling+walls+vines+urban+exploration+atmospheric&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=ancient+trail+in+western+Beijing+mountains+rocky+path+wild+grass+outdoor+adventure&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-osprey', 'boots-salomon', 'headlamp-petzl', 'bottle-nalgene'],
    terrain: {
      style: 'industrial',
      baseHeight: 300,
      peaks: [
        { name: '主井架', height: 180, x: 0.3, y: 0.4 },
        { name: '矸石山', height: 120, x: 0.7, y: 0.6 }
      ],
      trailPoints: [
        { x: 0.1, y: 0.8, name: '王平村' },
        { x: 0.25, y: 0.65, name: '铁路遗址' },
        { x: 0.4, y: 0.5, name: '主矿区' },
        { x: 0.6, y: 0.45, name: '废弃办公楼' },
        { x: 0.8, y: 0.3, name: '矿洞入口' }
      ]
    }
  },
  {
    id: 'wutaishan',
    name: '五台山',
    lat: 39.0100,
    lng: 113.5900,
    difficulty: 3,
    difficultyLabel: '进阶级',
    date: '2024-07-20',
    distance: 52,
    elevation: 2800,
    maxAltitude: 3061,
    description: '五台山大朝台，是中国最经典的徒步路线之一。从鸿门岩出发，依次穿越东台、北台、中台、西台、南台五座台顶，全程约52公里。\n\n北台叶斗峰海拔3061米，是华北屋脊。徒步过程中可欣赏高山草甸、云海日出、古刹梵音。七月的五台山，草甸上开满金莲花，景色壮美。\n\n这条路线对体能要求较高，需连续徒步2-3天。台顶之间温差大，即使是夏季也需携带冲锋衣和保暖层。台顶寺庙可提供简单的食宿，但条件简陋。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Wutai+Mountain+alpine+meadow+golden+lotus+flowers+mountain+peak+clouds+serene&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=ancient+Buddhist+temple+on+mountain+summit+Wutai+Shan+prayer+flags+mist&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=sea+of+clouds+at+sunrise+mountain+ridgeline+trekking+trail+dramatic+sky&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-osprey', 'boots-salomon', 'poles-blackdiamond', 'headlamp-petzl', 'bottle-nalgene', 'jacket-arc'],
    terrain: {
      style: 'alpine_meadow',
      baseHeight: 2000,
      peaks: [
        { name: '东台望海峰', height: 2795, x: 0.75, y: 0.2 },
        { name: '北台叶斗峰', height: 3061, x: 0.5, y: 0.1 },
        { name: '中台翠岩峰', height: 2894, x: 0.35, y: 0.25 },
        { name: '西台挂月峰', height: 2773, x: 0.15, y: 0.35 },
        { name: '南台锦绣峰', height: 2485, x: 0.4, y: 0.75 }
      ],
      trailPoints: [
        { x: 0.7, y: 0.25, name: '鸿门岩' },
        { x: 0.75, y: 0.2, name: '东台' },
        { x: 0.6, y: 0.12, name: '华北屋脊' },
        { x: 0.5, y: 0.1, name: '北台' },
        { x: 0.35, y: 0.25, name: '中台' },
        { x: 0.15, y: 0.35, name: '西台' },
        { x: 0.25, y: 0.55, name: '吉祥寺' },
        { x: 0.4, y: 0.75, name: '南台' },
        { x: 0.5, y: 0.85, name: '佛母洞' }
      ],
      trails: [
        {
          id: 'default',
          name: '三天两夜顺朝（鸿门岩→南台）',
          direction: 1,
          points: [
            { x: 0.7, y: 0.25, name: '鸿门岩' },
            { x: 0.75, y: 0.2, name: '东台' },
            { x: 0.6, y: 0.12, name: '华北屋脊' },
            { x: 0.5, y: 0.1, name: '北台' },
            { x: 0.35, y: 0.25, name: '中台' },
            { x: 0.15, y: 0.35, name: '西台' },
            { x: 0.25, y: 0.55, name: '吉祥寺' },
            { x: 0.4, y: 0.75, name: '南台' },
            { x: 0.5, y: 0.85, name: '佛母洞' }
          ]
        },
        {
          id: 'reverse',
          name: '三天两夜逆朝（佛母洞→鸿门岩）',
          direction: 1,
          points: [
            { x: 0.5, y: 0.85, name: '佛母洞' },
            { x: 0.4, y: 0.75, name: '南台' },
            { x: 0.25, y: 0.55, name: '吉祥寺' },
            { x: 0.15, y: 0.35, name: '西台' },
            { x: 0.35, y: 0.25, name: '中台' },
            { x: 0.5, y: 0.1, name: '北台' },
            { x: 0.6, y: 0.12, name: '华北屋脊' },
            { x: 0.75, y: 0.2, name: '东台' },
            { x: 0.7, y: 0.25, name: '鸿门岩' }
          ]
        },
        {
          id: 'xiaozhaotai',
          name: '小朝台（黛螺顶→台怀镇）',
          direction: 1,
          points: [
            { x: 0.55, y: 0.42, name: '台怀镇' },
            { x: 0.58, y: 0.38, name: '显通寺' },
            { x: 0.6, y: 0.35, name: '塔院寺' },
            { x: 0.65, y: 0.32, name: '黛螺顶' }
          ]
        },
        {
          id: 'dazhaotai',
          name: '大朝台顺时针（五台连穿）',
          direction: 1,
          points: [
            { x: 0.7, y: 0.25, name: '鸿门岩' },
            { x: 0.75, y: 0.2, name: '东台' },
            { x: 0.6, y: 0.12, name: '华北屋脊' },
            { x: 0.5, y: 0.1, name: '北台' },
            { x: 0.35, y: 0.25, name: '中台' },
            { x: 0.15, y: 0.35, name: '西台' },
            { x: 0.2, y: 0.45, name: '八功德水' },
            { x: 0.3, y: 0.6, name: '金阁寺' },
            { x: 0.4, y: 0.7, name: '气象站' },
            { x: 0.4, y: 0.75, name: '南台' },
            { x: 0.5, y: 0.85, name: '佛母洞' },
            { x: 0.55, y: 0.55, name: '台怀镇' }
          ]
        },
        {
          id: 'speedrun',
          name: '一日速穿顺朝（鸿门岩→佛母洞）',
          direction: 1,
          points: [
            { x: 0.7, y: 0.25, name: '鸿门岩' },
            { x: 0.6, y: 0.15, name: '北台' },
            { x: 0.35, y: 0.25, name: '中台' },
            { x: 0.15, y: 0.35, name: '西台' },
            { x: 0.4, y: 0.75, name: '南台' },
            { x: 0.5, y: 0.85, name: '佛母洞' }
          ]
        }
      ],
      temples: [
        { x: 0.5, y: 0.5, name: '台怀镇' }
      ]
    }
  },
  {
    id: 'xiaowutai',
    name: '小五台山',
    lat: 39.9800,
    lng: 115.0300,
    difficulty: 4,
    difficultyLabel: '专业级',
    date: '2024-09-05',
    distance: 35,
    elevation: 2200,
    maxAltitude: 2882,
    description: '小五台山是太行山主峰，海拔2882米，是河北最高峰。徒步路线从赤崖堡出发，经东台、北台、中台，完成三台连穿。\n\n九月初的小五台，秋色初染，层林渐黄。山顶的金莲花虽然已过花期，但高山草甸依然壮美。东台到北台的山脊线是全程最精华的路段，两侧是陡峭的悬崖，视野开阔。\n\n这条路线属于重装徒步，需要在山上露营一晚。部分路段坡度陡峭，碎石较多，需具备一定户外经验。建议携带冰爪以防山顶结冰。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Xiaowutai+Mountain+autumn+colors+alpine+meadow+steep+cliffs+trekking+trail+dramatic&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tent+camping+on+mountain+ridge+sunset+alpine+landscape+outdoor+adventure&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=rocky+mountain+ridgeline+trekking+path+steep+terrain+clear+blue+sky+wilderness&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-osprey', 'boots-lasportiva', 'poles-blackdiamond', 'headlamp-petzl', 'bottle-nalgene', 'jacket-arc', 'tent-msr', 'aidkit-adventure'],
    terrain: {
      style: 'rocky_alpine',
      baseHeight: 1500,
      peaks: [
        { name: '东台', height: 2882, x: 0.7, y: 0.25 },
        { name: '北台', height: 2837, x: 0.5, y: 0.15 },
        { name: '中台', height: 2801, x: 0.3, y: 0.25 },
        { name: '西台', height: 2671, x: 0.15, y: 0.4 },
        { name: '南台', height: 2743, x: 0.4, y: 0.65 }
      ],
      trailPoints: [
        { x: 0.8, y: 0.8, name: '赤崖堡' },
        { x: 0.75, y: 0.5, name: '东沟' },
        { x: 0.7, y: 0.25, name: '东台' },
        { x: 0.5, y: 0.15, name: '北台' },
        { x: 0.3, y: 0.25, name: '中台' },
        { x: 0.15, y: 0.4, name: '西台' },
        { x: 0.1, y: 0.7, name: '金河口' }
      ],
      camps: [
        { x: 0.5, y: 0.2, name: '中台营地' }
      ]
    }
  },
  {
    id: 'wugongshan',
    name: '武功山',
    lat: 27.4700,
    lng: 114.1900,
    difficulty: 3,
    difficultyLabel: '进阶级',
    date: '2025-05-01',
    distance: 28,
    elevation: 1800,
    maxAltitude: 1918,
    description: '武功山是江南三大名山之一，以连绵的高山草甸闻名。徒步路线从龙山村出发，经发云界、金顶，最后从景区步道下山。\n\n五月的武功山，草甸刚刚返绿，万亩高山草甸如绿色地毯般铺展在群山之巅，被誉为"云中草原"。金顶海拔1918米，是武功山的最高点，日出时分云海翻涌，极为壮观。\n\n路线全程约28公里，适合两天一夜的行程。发云界有客栈可住宿，金顶附近也有简易住宿点。需要注意的是，武功山天气变化快，务必携带雨具。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Wugong+Mountain+endless+grassland+on+mountain+top+green+hills+rolling+clouds+spectacular&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=sunrise+over+sea+of+clouds+mountain+peak+golden+light+dramatic+sky+Wugongshan&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=wooden+boardwalk+on+mountain+ridge+grassland+hiking+trail+blue+sky+outdoor&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-osprey', 'boots-salomon', 'poles-blackdiamond', 'headlamp-petzl', 'bottle-nalgene', 'camera-sony'],
    terrain: {
      style: 'grassland',
      baseHeight: 800,
      peaks: [
        { name: '发云界', height: 1628, x: 0.2, y: 0.3 },
        { name: '千丈岩', height: 1559, x: 0.35, y: 0.35 },
        { name: '武功山金顶', height: 1918, x: 0.6, y: 0.5 },
        { name: '羊狮慕', height: 1674, x: 0.8, y: 0.4 }
      ],
      trailPoints: [
        { x: 0.1, y: 0.7, name: '龙山村' },
        { x: 0.15, y: 0.5, name: '发云界脚下' },
        { x: 0.2, y: 0.3, name: '发云界' },
        { x: 0.35, y: 0.35, name: '千丈岩' },
        { x: 0.5, y: 0.4, name: '好汉坡' },
        { x: 0.6, y: 0.5, name: '金顶' },
        { x: 0.75, y: 0.55, name: '吊马桩' },
        { x: 0.85, y: 0.7, name: '景区大门' }
      ],
      camps: [
        { x: 0.25, y: 0.32, name: '发云界客栈' },
        { x: 0.55, y: 0.48, name: '金顶营地' }
      ]
    }
  },
  {
    id: 'haba',
    name: '哈巴雪山',
    lat: 27.3100,
    lng: 100.1000,
    difficulty: 5,
    difficultyLabel: '极限级',
    date: '2025-10-10',
    distance: 18,
    elevation: 2700,
    maxAltitude: 5396,
    description: '哈巴雪山海拔5396米，是入门级技术型雪山，也是众多登山爱好者攀登第一座雪山的首选。徒步路线从哈巴村出发，经大本营、C1营地，最终冲顶。\n\n十月的哈巴，天气相对稳定，是登顶的黄金窗口期。从大本营到C1的路线以碎石坡为主，C1以上开始出现冰雪路段。登顶日需凌晨出发，在头灯的光芒中穿越雪线，迎接海拔5396米的日出。\n\n这是一条需要专业装备和向导的极限路线。高反风险、冰雪技术、体能储备都需要充分准备。但站在哈巴之巅，俯瞰玉龙雪山和金沙江大拐弯的那一刻，一切都值得。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Haba+Snow+Mountain+trekking+group+on+glacier+ice+axe+ropes+snow+capped+peak+blue+sky&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=sunrise+from+snow+mountain+summit+alpine+glow+golden+light+on+snow+peaks+panoramic&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=base+camp+at+high+altitude+tents+on+snow+mountain+stars+night+sky+alpine&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-osprey', 'boots-lasportiva', 'poles-blackdiamond', 'headlamp-petzl', 'bottle-nalgene', 'jacket-arc', 'tent-msr', 'aidkit-adventure', 'camera-sony', 'stove-jetboil'],
    terrain: {
      style: 'snow_mountain',
      baseHeight: 2000,
      peaks: [
        { name: '哈巴主峰', height: 5396, x: 0.5, y: 0.2 }
      ],
      trailPoints: [
        { x: 0.5, y: 0.9, name: '哈巴村' },
        { x: 0.5, y: 0.7, name: '大本营' },
        { x: 0.5, y: 0.5, name: 'C1营地' },
        { x: 0.5, y: 0.35, name: '雪线' },
        { x: 0.5, y: 0.2, name: '顶峰' }
      ],
      camps: [
        { x: 0.5, y: 0.7, name: '大本营 4100m' },
        { x: 0.5, y: 0.5, name: 'C1营地 4900m' }
      ]
    }
  },
  {
    id: 'gongga',
    name: '贡嘎西坡',
    lat: 29.5700,
    lng: 101.9100,
    difficulty: 5,
    difficultyLabel: '极限级',
    date: '2025-06-15',
    distance: 72,
    elevation: 4200,
    maxAltitude: 4920,
    description: '贡嘎西坡穿越，是川西最经典的徒步路线之一。从康定老榆林出发，经日乌且垭口、莫溪沟、贡嘎寺，最后到达草科乡，全程约72公里。\n\n六月正值贡嘎的花季，沿途高山杜鹃和各种野花竞相绽放。日乌且垭口海拔4920米，是全程最高点，翻越垭口后可远眺贡嘎主峰7556米的雄伟身姿。\n\n这条路线海拔高、路程长，需要6-7天完成。沿途需翻越多个4000米以上的垭口，对体能和意志力都是极大的考验。但贡嘎西坡的原始风光——雪山、冰川、海子、森林、草甸，每一帧都值得铭记。',
    images: [
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Gongga+Mountain+glacier+peak+alpine+lake+reflection+wild+flowers+snow+mountain+panorama&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=high+altitude+mountain+pass+trekking+trail+colorful+prayer+flags+blue+sky+snow+peaks&image_size=landscape_16_9',
      'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tibetan+plateau+trekking+yak+caravan+meadow+wild+rhododendron+bloom+mountain+landscape&image_size=landscape_16_9'
    ],
    gearIds: ['backpack-gregory', 'boots-lasportiva', 'poles-blackdiamond', 'headlamp-petzl', 'bottle-nalgene', 'jacket-arc', 'tent-msr', 'aidkit-adventure', 'camera-sony', 'stove-jetboil', 'sleepingbag-marmot'],
    terrain: {
      style: 'highland',
      baseHeight: 3000,
      peaks: [
        { name: '日乌且垭口', height: 4920, x: 0.3, y: 0.3 },
        { name: '贡嘎主峰', height: 7556, x: 0.6, y: 0.15 },
        { name: '那玛峰', height: 5588, x: 0.45, y: 0.2 },
        { name: '勒多曼因', height: 6112, x: 0.25, y: 0.25 }
      ],
      trailPoints: [
        { x: 0.1, y: 0.8, name: '老榆林' },
        { x: 0.2, y: 0.6, name: '格西草原' },
        { x: 0.25, y: 0.45, name: '两岔河' },
        { x: 0.3, y: 0.3, name: '日乌且垭口' },
        { x: 0.4, y: 0.35, name: '莫溪沟' },
        { x: 0.55, y: 0.4, name: '贡嘎寺' },
        { x: 0.7, y: 0.55, name: '子梅垭口' },
        { x: 0.85, y: 0.75, name: '草科' }
      ],
      camps: [
        { x: 0.2, y: 0.6, name: '格西营地' },
        { x: 0.3, y: 0.38, name: '日乌且营地' },
        { x: 0.45, y: 0.42, name: '莫溪沟营地' }
      ]
    }
  }
];

// 装备数据
const gears = [
  // ===== 背包系统 =====
  {
    id: 'backpack-osprey',
    name: 'Osprey Kestrel 48',
    category: '背包系统',
    weight: 1.58,
    purchaseDate: '2023-06',
    usageCount: 15,
    totalMileage: 234,
    tier: '传奇',
    notes: '入手已三年，陪我走过了最多的路。48L的容量对于1-3天的徒步来说恰到好处，两侧弹力袋放水壶和登山杖非常方便。背负系统出色，即使负重15kg走一整天也不会觉得肩膀酸痛。唯一的遗憾是底部耐磨性稍差，在碎石路段拖行后有些磨损。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Osprey+Kestrel+48+hiking+backpack+dark+green+outdoor+gear+product+photography+on+trail&image_size=square',
    routeIds: ['wangping', 'wutaishan', 'xiaowutai', 'wugongshan', 'haba']
  },
  {
    id: 'backpack-gregory',
    name: 'Gregory Baltoro 65',
    category: '背包系统',
    weight: 2.28,
    purchaseDate: '2024-08',
    usageCount: 3,
    totalMileage: 132,
    tier: '主力',
    notes: '为了贡嘎穿越专门升级的大容量背包。65L可轻松装下6-7天的全部装备和食物。背负系统比Kestrel更厚重，适合重装长线。腰带的3D塑形非常贴合，分散重量效果极佳。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Gregory+Baltoro+65+hiking+backpack+blue+professional+outdoor+gear+product+shot&image_size=square',
    routeIds: ['gongga']
  },
  // ===== 鞋服 =====
  {
    id: 'boots-salomon',
    name: 'Salomon X Ultra 4',
    category: '鞋服',
    weight: 0.78,
    purchaseDate: '2023-05',
    usageCount: 12,
    totalMileage: 186,
    tier: '传奇',
    notes: '轻量徒步鞋中的佼佼者。Contagrip大底抓地力出色，在湿滑的岩石和泥泞路段都表现稳定。Quicklace快速系带系统非常方便。适合1-2日轻装徒步，但在重装长线下支撑力稍显不足。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Salomon+X+Ultra+4+hiking+boots+dark+brown+trail+running+shoes+outdoor+product&image_size=square',
    routeIds: ['wangping', 'wutaishan', 'wugongshan']
  },
  {
    id: 'boots-lasportiva',
    name: 'La Sportiva Trango Tech',
    category: '鞋服',
    weight: 1.12,
    purchaseDate: '2024-03',
    usageCount: 5,
    totalMileage: 125,
    tier: '主力',
    notes: '专业级徒步登山鞋，Gore-Tex防水内衬加上Vibram大底。在碎石坡和冰雪路面上表现优异，脚踝支撑力强。适合重装长线和高海拔路线。磨合期稍长，前两次穿会有些磨脚后跟。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=La+Sportiva+Trango+Tech+mountaineering+boots+GoreTex+alpine+hiking+product+photography&image_size=square',
    routeIds: ['xiaowutai', 'haba', 'gongga']
  },
  {
    id: 'jacket-arc',
    name: "Arc'teryx Beta AR",
    category: '鞋服',
    weight: 0.46,
    purchaseDate: '2024-01',
    usageCount: 8,
    totalMileage: 210,
    tier: '传奇',
    notes: '最值得投资的户外装备之一。Gore-Tex Pro面料防水透气性能顶级，腋下拉链设计在高强度行进时非常实用。修身剪裁不影响活动，作为外层防风防雨完美胜任。唯一的缺点就是贵。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Arcteryx+Beta+AR+jacket+dark+blue+GoreTex+hardshell+technical+outdoor+product&image_size=square',
    routeIds: ['wutaishan', 'xiaowutai', 'haba', 'gongga']
  },
  // ===== 登山工具 =====
  {
    id: 'poles-blackdiamond',
    name: 'Black Diamond Trail Pro',
    category: '登山工具',
    weight: 0.52,
    purchaseDate: '2023-08',
    usageCount: 14,
    totalMileage: 280,
    tier: '传奇',
    notes: '可靠耐用的铝合金登山杖。FlickLock锁扣系统比旋转锁更稳定，在寒冷天气下也容易操作。双密度握把长时间使用也不会磨手。碳化钨杖尖在各种地形上都抓地牢固。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Black+Diamond+Trail+Pro+trekking+poles+aluminum+cork+grip+outdoor+gear+product&image_size=square',
    routeIds: ['wutaishan', 'xiaowutai', 'wugongshan', 'haba', 'gongga']
  },
  // ===== 电子设备 =====
  {
    id: 'headlamp-petzl',
    name: 'Petzl Actik Core',
    category: '电子设备',
    weight: 0.075,
    purchaseDate: '2023-04',
    usageCount: 20,
    totalMileage: 310,
    tier: '传奇',
    notes: '使用频率最高的装备之一。450流明亮度足够应对夜间徒步和营地使用，可充电电池+AAA电池双供电模式非常灵活。红色夜光模式在帐篷里看书不刺眼。轻巧便携，几乎每次出行都会带上。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Petzl+Actik+Core+headlamp+outdoor+gear+LED+light+product+photography+dark+background&image_size=square',
    routeIds: ['wangping', 'wutaishan', 'xiaowutai', 'wugongshan', 'haba', 'gongga']
  },
  {
    id: 'camera-sony',
    name: 'Sony A7C II',
    category: '电子设备',
    weight: 0.51,
    purchaseDate: '2024-05',
    usageCount: 6,
    totalMileage: 140,
    tier: '主力',
    notes: '全画幅微单中最轻便的选择。搭配Tamron 28-200mm天涯镜，一镜走天下。3300万像素足够后期裁剪，色彩科学讨喜。电池续航在徒步中表现不错，一块电池可以撑一天半的拍摄。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Sony+A7C+II+mirrorless+camera+compact+full+frame+product+photography+dark+background&image_size=square',
    routeIds: ['wugongshan', 'haba', 'gongga']
  },
  // ===== 露营装备 =====
  {
    id: 'tent-msr',
    name: 'MSR Hubba Hubba NX',
    category: '露营装备',
    weight: 1.72,
    purchaseDate: '2024-06',
    usageCount: 4,
    totalMileage: 125,
    tier: '主力',
    notes: '双人三季帐，但作为单人使用空间非常宽裕。自立式结构搭建方便，即使一个人也能快速完成。雨裙和地布在暴雨中表现可靠，通风设计好，帐篷内不会有冷凝水。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=MSR+Hubba+Hubba+NX+backpacking+tent+green+set+up+in+alpine+meadow+product&image_size=square',
    routeIds: ['xiaowutai', 'haba', 'gongga']
  },
  {
    id: 'sleepingbag-marmot',
    name: 'Marmot Lithium 0°F',
    category: '露营装备',
    weight: 1.25,
    purchaseDate: '2024-08',
    usageCount: 2,
    totalMileage: 72,
    tier: '常用',
    notes: '高海拔专用的羽绒睡袋，850蓬松度鹅绒，舒适温标-18°C。在贡嘎4700米营地实测保暖效果出色，完全没有感到寒冷。压缩后体积很小，不占背包空间。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Marmot+Lithium+down+sleeping+bag+orange+850+fill+power+expedition+product&image_size=square',
    routeIds: ['gongga']
  },
  {
    id: 'stove-jetboil',
    name: 'Jetboil Flash 2.0',
    category: '露营装备',
    weight: 0.42,
    purchaseDate: '2024-07',
    usageCount: 3,
    totalMileage: 90,
    tier: '常用',
    notes: '烧水速度极快，100秒就能烧开一杯水。在高原营地清晨，能快速喝上热咖啡的感觉太棒了。一体式设计收纳方便，不过只适合烧水和简单加热，不适合复杂烹饪。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Jetboil+Flash+camping+stove+integrated+cooking+system+outdoor+gear+product&image_size=square',
    routeIds: ['haba', 'gongga']
  },
  // ===== 应急物品 =====
  {
    id: 'aidkit-adventure',
    name: 'Adventure Medical Kit',
    category: '应急物品',
    weight: 0.28,
    purchaseDate: '2023-09',
    usageCount: 5,
    totalMileage: 197,
    tier: '常用',
    notes: '轻量化的户外急救包，包含创可贴、纱布、消毒片、止血带、急救毯等基础急救用品。自己又额外补充了高原安、布洛芬和电解质粉。虽然在绝大多数路线上都用不上，但这是绝不能省的装备。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=outdoor+first+aid+kit+medical+supplies+adventure+emergency+gear+product+photography&image_size=square',
    routeIds: ['xiaowutai', 'haba', 'gongga']
  },
  // ===== 水具 =====
  {
    id: 'bottle-nalgene',
    name: 'Nalgene Wide Mouth 1L',
    category: '露营装备',
    weight: 0.18,
    purchaseDate: '2023-04',
    usageCount: 22,
    totalMileage: 310,
    tier: '传奇',
    notes: '最简单也最可靠的装备。宽口设计方便清洗和灌装，刻度标记清晰可读。Tritan材质耐摔耐冻，用了三年除了表面有些划痕外完好无损。配上保温套，在零下环境也能保持水温。',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Nalgene+wide+mouth+water+bottle+1L+blue+tritan+outdoor+product+photography&image_size=square',
    routeIds: ['wangping', 'wutaishan', 'xiaowutai', 'wugongshan', 'haba', 'gongga']
  }
];

// 装备分类定义
const gearCategories = ['背包系统', '鞋服', '登山工具', '电子设备', '露营装备', '应急物品'];

// 辅助函数：根据装备ID获取装备对象
function getGearById(id) {
  return gears.find(g => g.id === id);
}

// 辅助函数：根据路线ID获取路线对象
function getRouteById(id) {
  return routes.find(r => r.id === id);
}

// 辅助函数：根据装备ID列表获取装备对象列表
function getGearsByIds(ids) {
  return ids.map(id => getGearById(id)).filter(Boolean);
}

// 辅助函数：获取装备的归属路线
function getRoutesByGearId(gearId) {
  const gear = getGearById(gearId);
  if (!gear) return [];
  return gear.routeIds.map(id => getRouteById(id)).filter(Boolean);
}

// 辅助函数：计算总里程
function getTotalDistance() {
  return routes.reduce((sum, r) => sum + r.distance, 0);
}

// 辅助函数：计算总爬升
function getTotalElevation() {
  return routes.reduce((sum, r) => sum + r.elevation, 0);
}

// 辅助函数：判断探险者阶位
function getExplorerRank() {
  const totalDist = getTotalDistance();
  const highStarCount = routes.filter(r => r.difficulty >= 4).length;

  if (totalDist >= 300 && highStarCount >= 3) return { name: '极境探索者', level: 4 };
  if (totalDist >= 150 && highStarCount >= 2) return { name: '峰峦旅人', level: 3 };
  if (totalDist >= 60) return { name: '山野行者', level: 2 };
  return { name: '徒步新手', level: 1 };
}

// 辅助函数：根据装备使用次数判定等级
function getGearTier(usageCount) {
  if (usageCount >= 15) return '传奇';
  if (usageCount >= 8) return '主力';
  return '常用';
}