// ===================== 寵物（三頭龍／九尾狐／鳳凰） =====================
// 依賴 app.js 的全域：data, persist, notify, dateKey, pad2
// 狀態以真實時間推進：每次打開或每 30 秒，從 pet.lastSim 補算到現在。

const PET_HATCH_HOURS = 0;   // 一建立就孵化
const PET_SIM_STEP_H = 1 / 6;          // 10 分鐘一步
const PET_MAX_CATCHUP_H = 24 * 21;     // 最多補算 21 天
const PET_GROWTH_MAX = 1000;

// 需求值（越高越糟）每小時變化
const PET_RATES = {
  // 調成大約每 3–4 小時要照顧一次（一天 4–5 次）
  hunger:  { awake: 9.0, asleep: 3.0 },
  thirst:  { awake: 12.0, asleep: 4.0 },
  fatigue: { awake: 5.5, asleep: -12.5 },
  bladder: { awake: 14.0, asleep: 5.0 },
  bowel:   { awake: 2.0, asleep: 1.0 },
  dirt:    { awake: 3.0, asleep: 1.0 },   // 大約一天泡一次澡
  nutrient: 2.5,                       // 五大營養每小時各掉多少
  growthBase: 0.4                      // 完美照顧時每小時成長值
};

const PET_NUTRIENTS = [
  { key: 'carb',    label: '澱粉',     lack: '沒力氣，容易累' },
  { key: 'protein', label: '蛋白質',   lack: '肌肉長不出來' },
  { key: 'fat',     label: '脂肪',     lack: '皮膚乾裂' },
  { key: 'vitamin', label: '綜合維生素', lack: '抵抗力變差' },
  { key: 'mineral', label: '微量金屬', lack: '骨頭和角長不硬' }
];

const PET_NEEDS = [
  { key: 'fatigue', label: '疲勞度' },
  { key: 'hunger',  label: '飢餓度' },
  { key: 'thirst',  label: '口渴度' },
  { key: 'bladder', label: '小號' },
  { key: 'bowel',   label: '大號' },
  { key: 'dirt',    label: '髒污度' }
];

// 開局可以選的三種寵物
const PET_SPECIES = {
  dragon: {
    name: '三頭龍',
    desc: '三顆頭三種個性：貪吃的饞饞、愛睏的睏睏、傲嬌的傲傲。長大會長出翅膀、角和一排背刺。',
    stages: ['雛龍', '幼龍', '少年龍', '青年龍', '成年龍', '遠古三頭龍'],
    voices: { left: '饞饞', mid: '睏睏', right: '傲傲' },
    skin: '鱗片',
    mouth: 90, bathDepth: 60,
    hatch: '🥚 蛋殼裂開，三顆小小的頭同時探了出來！',
    asleep: 'Zzz⋯⋯（三顆頭疊在一起睡）',
    sick: '咳咳⋯⋯三顆頭都好暈⋯⋯',
    sickLog: '生病了⋯⋯三顆頭都在發燒',
    bath: '咕嚕咕嚕咕嚕（三顆頭輪流吐泡泡）',
    idle: '另外兩顆頭好吵。'
  },
  fox: {
    name: '九尾狐',
    desc: '剛出生只有一條尾巴，照顧得好會一條一條長出來，最多九條；最後會變成銀白色的九尾天狐。',
    stages: ['幼狐', '小狐', '少年狐', '青年狐', '成年狐', '九尾天狐'],
    voices: { left: '狐狐', mid: '狐狐', right: '狐狐' },
    skin: '毛',
    mouth: 100, bathDepth: 45,
    hatch: '🥚 蛋殼裂開，一團毛茸茸的小狐狸滾了出來！',
    asleep: 'Zzz⋯⋯（用尾巴把自己捲成一團）',
    sick: '嗚⋯⋯耳朵都垂下來了⋯⋯',
    sickLog: '生病了⋯⋯耳朵都垂下來了',
    bath: '咕嚕咕嚕（尾巴在水面上搖來搖去）',
    idle: '我的尾巴是不是又多了一條？'
  },
  phoenix: {
    name: '鳳凰',
    desc: '從灰撲撲的雛鳥開始，尾羽和冠羽一根一根長出來、慢慢變紅，長大後羽尖會燃起火焰。',
    stages: ['雛鳥', '幼鳥', '少年鳥', '青鸞', '火鳳', '不死鳳凰'],
    voices: { left: '鳳鳳', mid: '鳳鳳', right: '鳳鳳' },
    skin: '羽毛',
    mouth: 62, bathDepth: 55,
    hatch: '🥚 蛋殼裂開，一隻灰灰的小雛鳥探出頭來啾了一聲！',
    asleep: 'Zzz⋯⋯（把頭埋進翅膀裡睡）',
    sick: '啾⋯⋯羽毛都沒有光澤了⋯⋯',
    sickLog: '生病了⋯⋯羽毛都沒有光澤了',
    bath: '啪沙啪沙（拍著翅膀潑水）',
    idle: '總有一天我會燒起來的！'
  }
};
const PET_STAGE_MINS = [0, 60, 200, 420, 680, 900];
function petSp(p) { return PET_SPECIES[(p && p.species) || 'dragon']; }
// 對話框前面顯示誰在說話：有取名就用名字；三頭龍再標是哪顆頭
function petSpeaker(p, head) {
  const voice = petSp(p).voices[head] || '';
  if (!p.name || !head) return voice;
  return p.species === 'dragon' || !p.species ? `${p.name}・${voice}` : p.name;
}
function petStages(p) { return PET_STAGE_MINS.map((min, i) => ({ min, name: petSp(p).stages[i] })); }

// effect: 直接加到 pet 上的差值；需求值負數 = 滿足
const PET_ITEMS = {
  // 任務獎勵可選的六樣
  water:       { name: '水',       icon: '💧', cat: 'water',   fx: { thirst: -40 } },
  chicken:     { name: '雞胸肉',   icon: '🍗', cat: 'food',    fx: { hunger: -35, protein: 35, fat: 3 } },
  sweetpotato: { name: '地瓜',     icon: '🍠', cat: 'food',    fx: { hunger: -35, carb: 35, vitamin: 5 } },
  olive:       { name: '橄欖油',   icon: '🫒', cat: 'food',    fx: { hunger: -8, fat: 35, vitamin: 3 } },
  multivit:    { name: '綜合維生素', icon: '💊', cat: 'supply', fx: { vitamin: 40 } },
  ironore:     { name: '鐵礦石',   icon: '🪨', cat: 'supply',  fx: { mineral: 40, hunger: -4 } },

  // 舊版掉落物（保留讓背包裡已有的還能吃）
  spring:      { name: '山泉水',   icon: '🏔️', cat: 'water',   fx: { thirst: -35, mineral: 8 } },
  electrolyte: { name: '電解飲',   icon: '🧃', cat: 'water',   fx: { thirst: -30, mineral: 12, carb: 5 } },

  bread:       { name: '烤麵包',   icon: '🍞', cat: 'food',    fx: { hunger: -18, carb: 22 } },
  rice:        { name: '飯糰',     icon: '🍙', cat: 'food',    fx: { hunger: -22, carb: 26 } },

  mutton:      { name: '烤羊腿',   icon: '🍖', cat: 'food',    fx: { hunger: -30, protein: 28, fat: 10 } },
  fish:        { name: '烤魚',     icon: '🐟', cat: 'food',    fx: { hunger: -22, protein: 24, fat: 8, mineral: 4 } },
  egg:         { name: '水煮蛋',   icon: '🥚', cat: 'food',    fx: { hunger: -12, protein: 16, fat: 6 } },

  nuts:        { name: '堅果',     icon: '🥜', cat: 'food',    fx: { hunger: -10, fat: 22, mineral: 5 } },
  cheese:      { name: '起司',     icon: '🧀', cat: 'food',    fx: { hunger: -14, fat: 20, protein: 8 } },
  avocado:     { name: '酪梨',     icon: '🥑', cat: 'food',    fx: { hunger: -14, fat: 22, vitamin: 6 } },

  berries:     { name: '綜合莓果', icon: '🫐', cat: 'food',    fx: { hunger: -8, vitamin: 24, thirst: -5 } },
  salad:       { name: '蔬菜沙拉', icon: '🥗', cat: 'food',    fx: { hunger: -12, vitamin: 20, mineral: 4 } },

  crystal:     { name: '紫水晶',   icon: '🔮', cat: 'supply',  fx: { mineral: 30 } },
  seasalt:     { name: '海鹽結晶', icon: '🧂', cat: 'supply',  fx: { mineral: 18, thirst: 10 } },

  dragonfruit: { name: '龍晶果',   icon: '💠', cat: 'rare',    fx: { hunger: -25, carb: 18, protein: 18, fat: 18, vitamin: 18, mineral: 18, growth: 3 } },
  ruby:        { name: '紅寶石',   icon: '♦️', cat: 'rare',    fx: { mineral: 40, growth: 5 } },
  lavachili:   { name: '熔岩辣椒', icon: '🌶️', cat: 'rare',    fx: { hunger: -10, carb: 10, thirst: 20, growth: 4 } },
  herb:        { name: '草藥丸',   icon: '🌿', cat: 'rare',    fx: { health: 35, cure: 1 } },
  phoenix:     { name: '鳳凰羽',   icon: '🪶', cat: 'rare',    fx: { health: 100, cure: 1, growth: 2 } }
};

// 金幣：完成任務賺，拿去商店買
const PET_COIN_PER_TASK = 15;
const PET_COIN_ALL_DONE = 30;
const PET_SHOP = [
  ['water', 5], ['olive', 8], ['sweetpotato', 10], ['multivit', 10], ['ironore', 10], ['chicken', 12],
  ['herb', 30], ['lavachili', 40], ['dragonfruit', 60], ['ruby', 80], ['phoenix', 150]
];

const PET_STARTER = { water: 4, chicken: 2, sweetpotato: 2, olive: 2, multivit: 1, ironore: 1, herb: 1 };

let petInvFilter = 'all';
let petLastStageKey = '';
let petSpeech = null;   // { head, text, until }
let petRenaming = false;
let petToiletUntil = 0;

// ---------- 工具 ----------
function petClamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
function petPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function petLerp(a, b, t) { return a + (b - a) * t; }

function petStage(growth, p = data.pet) {
  const stages = petStages(p);
  let s = stages[0];
  for (const st of stages) if (growth >= st.min) s = st;
  return s;
}
function petLevel(growth) { return Math.min(100, Math.floor(growth / 10) + 1); }

function petNewEgg() {
  const now = Date.now();
  return {
    phase: 'egg',
    name: '',
    createdAt: now,
    hatchAt: now + PET_HATCH_HOURS * 3600 * 1000,
    hatchedAt: null,
    lastSim: now,
    asleep: false,
    sick: false,
    health: 100,
    needs: { fatigue: 20, hunger: 40, thirst: 40, bladder: 10, bowel: 5, dirt: 10 },
    nutrients: { carb: 60, protein: 60, fat: 60, vitamin: 60, mineral: 60 },
    growth: 0,
    growthByDay: {},
    mess: [],
    inventory: {},
    rewarded: {},
    bonusDays: {},
    affection: 0,
    log: []
  };
}

function petLog(text, ts = Date.now()) {
  const p = data.pet;
  p.log.unshift({ ts, text });
  if (p.log.length > 60) p.log.length = 60;
}

function petAddItem(id, n = 1) {
  const inv = data.pet.inventory;
  inv[id] = (inv[id] || 0) + n;
}

// ---------- 模擬 ----------
function petGrowthRate(p) {
  // 回傳 { rate, limits: [原因...] }
  const limits = [];
  if (p.phase !== 'hatched') return { rate: 0, limits: ['還在蛋裡'] };
  if (p.sick) return { rate: 0, limits: ['生病中，停止成長'] };
  if (p.health < 60) return { rate: 0, limits: ['健康值太低'] };

  let rate = PET_RATES.growthBase;

  let nf = 1;
  for (const n of PET_NUTRIENTS) {
    const v = p.nutrients[n.key];
    let f = 1;
    if (v < 20) { f = 0; limits.push(`${n.label}嚴重不足（${n.lack}）`); }
    else if (v < 40) { f = petLerp(0.4, 1, (v - 20) / 20); limits.push(`${n.label}偏低`); }
    nf = Math.min(nf, f);
  }
  rate *= nf;

  for (const nd of PET_NEEDS) {
    if (nd.key === 'fatigue' && p.asleep) continue;
    if (p.needs[nd.key] > 70) { rate *= 0.6; limits.push(`${nd.label}太高`); }
  }
  if (p.mess.length > 0) { rate *= 0.85; limits.push('環境髒亂'); }

  if (nf === 1 && p.nutrients.protein >= 70) rate *= 1.15;
  if (p.asleep) rate *= 1.3;   // 睡覺時長最快
  return { rate, limits };
}

// 在龍附近（或隨機）留下一灘
function petMessAt(t) {
  const pos = data.pet && data.pet.pos;
  const x = pos ? pos.x + (Math.random() * 2 - 1) * 16 : PX_WALK.x0 + Math.random() * (PX_WALK.x1 - PX_WALK.x0);
  const y = pos ? pos.y + Math.random() * 6 : PX_WALK.y0 + Math.random() * (PX_WALK.y1 - PX_WALK.y0);
  return { t, x: petClamp(x, PX_WALK.x0, PX_WALK.x1), y: petClamp(y, PX_WALK.y0, PX_WALK.y1) };
}

function petStep(p, dtH, t) {
  const r = PET_RATES;
  const mode = p.asleep ? 'asleep' : 'awake';
  const sickK = p.sick ? 1.25 : 1;

  for (const nd of PET_NEEDS) {
    let rate = r[nd.key][mode];
    if (rate > 0) rate *= sickK;
    if (nd.key === 'fatigue' && !p.asleep && p.nutrients.carb < 20) rate *= 1.3;
    p.needs[nd.key] = petClamp(p.needs[nd.key] + rate * dtH);
  }
  for (const n of PET_NUTRIENTS) {
    p.nutrients[n.key] = petClamp(p.nutrients[n.key] - r.nutrient * dtH);
  }

  // 自動入睡 / 醒來
  if (!p.asleep && p.needs.fatigue >= 100) {
    p.asleep = true;
    petLog('累到自己爬上床睡著了', t);
  } else if (p.asleep && p.needs.fatigue <= 0) {
    p.asleep = false;
    petLog('睡飽自己醒來了', t);
  }

  // 憋不住
  if (p.needs.bladder >= 100) {
    p.needs.bladder = 0;
    if (p.mess.length < 6) p.mess.push(petMessAt('pee'));
    p.needs.dirt = petClamp(p.needs.dirt + 15);
    petLog('憋不住，尿在地上了', t);
  }
  if (p.needs.bowel >= 100) {
    p.needs.bowel = 0;
    if (p.mess.length < 6) p.mess.push(petMessAt('poop'));
    p.needs.dirt = petClamp(p.needs.dirt + 15);
    petLog('憋不住，大在地上了', t);
  }

  // 健康
  let bad = 0;
  if (p.needs.hunger > 80) bad += (p.needs.hunger - 80) / 20;
  if (p.needs.thirst > 80) bad += 1.2 * (p.needs.thirst - 80) / 20;
  if (!p.asleep && p.needs.fatigue > 90) bad += (p.needs.fatigue - 90) / 10;
  for (const n of PET_NUTRIENTS) if (p.nutrients[n.key] < 15) bad += 0.5;
  bad += p.mess.length * 0.4;
  if (p.needs.dirt > 90) bad += (p.needs.dirt - 90) / 10 * 0.6;

  if (bad > 0.05) {
    p.health = petClamp(p.health - Math.min(bad, 4) * 0.95 * dtH);
  } else {
    let regen = p.sick ? 0.6 : 1.5;
    if (p.nutrients.vitamin < 25) regen *= 0.5;
    p.health = petClamp(p.health + regen * dtH);
  }
  if (!p.sick && p.health < 35) {
    p.sick = true;
    petLog(petSp(p).sickLog, t);
  } else if (p.sick && p.health >= 65) {
    p.sick = false;
    petLog('病好了！', t);
  }

  // 成長
  const { rate } = petGrowthRate(p);
  if (rate > 0 && p.growth < PET_GROWTH_MAX) {
    const before = p.growth;
    const gain = Math.min(rate * dtH, PET_GROWTH_MAX - before);
    p.growth += gain;
    const dk = dateKey(new Date(t));
    p.growthByDay[dk] = (p.growthByDay[dk] || 0) + gain;
    petOnGrowthCrossed(before, p.growth, t);
  }
}

function petOnGrowthCrossed(before, after, t) {
  const lb = petLevel(before), la = petLevel(after);
  if (la > lb) {
    petLog(`成長到 Lv ${la}`, t);
    const sb = petStage(before), sa = petStage(after);
    if (sa !== sb) {
      petLog(`🎉 進化成「${sa.name}」！`, t);
    }
  }
}

function petSimulate() {
  const p = data.pet;
  const now = Date.now();
  if (p.phase === 'choose') { p.lastSim = now; return; }
  let t = Math.max(p.lastSim, now - PET_MAX_CATCHUP_H * 3600 * 1000);

  if (p.phase === 'egg') {
    if (now < p.hatchAt) { p.lastSim = now; return; }
    t = Math.max(t, p.hatchAt);
    petHatch(p.hatchAt);
  }

  const stepMs = PET_SIM_STEP_H * 3600 * 1000;
  while (now - t > 1000) {
    const dt = Math.min(stepMs, now - t);
    t += dt;
    petStep(p, dt / 3600000, t);
  }
  p.lastSim = now;

  // 清掉 60 天前的每日成長紀錄
  const cutoff = dateKey(new Date(now - 60 * 86400000));
  for (const k of Object.keys(p.growthByDay)) if (k < cutoff) delete p.growthByDay[k];
}

function petHatch(ts) {
  const p = data.pet;
  p.phase = 'hatched';
  p.hatchedAt = ts;
  p.lastSim = ts;
  for (const [id, n] of Object.entries(PET_STARTER)) petAddItem(id, n);
  petLog(petSp(p).hatch, ts);
  petLog('獲得新手補給包', ts);
}

// ---------- 任務獎勵 ----------
function petOnTaskDone(task, dayKey) {
  if (!data.pet) return;
  const p = data.pet;
  const key = `${dayKey}_${task.id}`;
  if (p.rewarded[key]) return;
  p.rewarded[key] = true;
  let gain = PET_COIN_PER_TASK;
  petLog(`完成「${task.name}」→ +${PET_COIN_PER_TASK} 🪙`);

  // 全勤加碼
  const dow = new Date().getDay();
  const todays = data.tasks.filter((t) => t.enabled && t.days.includes(dow));
  const logs = data.logs[dayKey] || {};
  if (todays.length && todays.every((t) => logs[t.id]) && !p.bonusDays[dayKey]) {
    p.bonusDays[dayKey] = true;
    gain += PET_COIN_ALL_DONE;
    petLog(`🏆 今日任務全部完成！加碼 +${PET_COIN_ALL_DONE} 🪙`);
  }
  p.coins = (p.coins || 0) + gain;

  // 清掉舊的 rewarded key（保留 14 天）
  const cutoff = dateKey(new Date(Date.now() - 14 * 86400000));
  for (const k of Object.keys(p.rewarded)) if (k.slice(0, 10) < cutoff) delete p.rewarded[k];

  petToast(`🪙 +${gain} 金幣（共 ${p.coins}）`);
  if (petPanelActive()) petRender();
}

// 依目前狀態挑最缺的那一樣，在商店標「推薦」
function petRecommend(p) {
  if (p.phase !== 'hatched') return null;
  let best = null, bestScore = 0;
  for (const [id] of PET_SHOP) {
    if (PET_ITEMS[id].cat === 'rare') continue;
    // 補的量 × 缺的程度，越缺越優先；背包裡已經有的打折
    let score = 0;
    for (const [k, v] of Object.entries(PET_ITEMS[id].fx)) {
      if (k in p.needs && v < 0) score += Math.min(-v, p.needs[k]) * (p.needs[k] / 100);
      else if (k in p.nutrients && v > 0) score += Math.min(v, 100 - p.nutrients[k]) * ((100 - p.nutrients[k]) / 100);
    }
    score /= 1 + (p.inventory[id] || 0);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

function petBuy(id) {
  const price = (PET_SHOP.find(([k]) => k === id) || [])[1];
  if (!price) return;
  if ((data.pet.coins || 0) < price) { petToast(`金幣不夠，還差 ${price - (data.pet.coins || 0)} 🪙`); return; }
  petAct((p) => {
    p.coins -= price;
    petAddItem(id);
    petLog(`花 ${price} 🪙 買了 ${PET_ITEMS[id].icon}${PET_ITEMS[id].name}`);
  });
}

// ---------- 動作 ----------
function petSay(head, text, ms = 6000) {
  petSpeech = { head, text, until: Date.now() + ms };
}

async function petAct(fn) {
  petSimulate();
  fn(data.pet);
  await persist();
  petRender();
  petUpdateTabBadge();
}

// 現在想不想吃這樣東西（不想吃就回傳原因台詞）
function petRefuse(p, id) {
  const item = PET_ITEMS[id];
  if (p.phase !== 'hatched' || p.asleep) return ['mid', '呼⋯⋯（睡著了）'];
  if (item.fx.hunger && item.fx.hunger < -10 && p.needs.hunger < 5) return ['left', '吃不下了⋯⋯肚子要爆了'];
  if (item.cat === 'water' && p.needs.thirst < 5) return ['right', '哼，我現在不渴。'];
  return null;
}

function petEat(p, id) {
  const item = PET_ITEMS[id];
  const fx = item.fx;
  for (const [k, v] of Object.entries(fx)) {
    if (k in p.needs) p.needs[k] = petClamp(p.needs[k] + v);
    else if (k in p.nutrients) p.nutrients[k] = petClamp(p.nutrients[k] + v);
    else if (k === 'health') p.health = petClamp(p.health + v);
    else if (k === 'growth') {
      const before = p.growth;
      p.growth = Math.min(PET_GROWTH_MAX, p.growth + v);
      const dk = dateKey(new Date());
      p.growthByDay[dk] = (p.growthByDay[dk] || 0) + (p.growth - before);
      petOnGrowthCrossed(before, p.growth, Date.now());
    }
  }
  if (fx.cure && p.sick) { p.sick = false; petLog(`吃了${item.name}，病好了`); }
  // 吃的東西會變成大號
  if (fx.hunger && fx.hunger < 0) p.needs.bowel = petClamp(p.needs.bowel + (-fx.hunger) * 0.5);
  if (item.cat === 'water') p.needs.bladder = petClamp(p.needs.bladder + (-fx.thirst) * 0.25);
  petLog(`吃了 ${item.icon}${item.name}`);

  if (item.cat === 'water') petSay('right', petPick(['⋯⋯還、還不錯喝啦。', '咕嚕咕嚕。哼。', '這水勉強合格。']));
  else if (item.cat === 'rare') petSay('mid', petPick(['身體熱熱的⋯⋯好像長大了一點？', '哇，這個好特別！']));
  else petSay('left', petPick(['好吃！還有嗎？', '嚼嚼嚼⋯⋯', `${item.name}！我的最愛！`, '再一口就好⋯⋯']));
}

const PET_GROUND_MAX = 12;
// 吃完一樣要花的秒數
function petEatSeconds(id) {
  const cat = PET_ITEMS[id].cat;
  return cat === 'water' ? 3 : cat === 'food' ? 4 : 2;
}

// 從背包拿一樣放到地上（像素座標）
function petDropItem(id, x, y) {
  petAct((p) => {
    if (!p.inventory[id]) return;
    p.ground = p.ground || [];
    if (p.ground.length >= PET_GROUND_MAX) { petToast('地上東西太多了，等牠吃一些再放'); return; }
    p.inventory[id]--;
    if (p.inventory[id] <= 0) delete p.inventory[id];
    p.ground.push({ id, x: petClamp(x, PX_WALK.x0, PX_WALK.x1), y: petClamp(y, PX_WALK.y0, PX_WALK.y1) });
    petLog(`把 ${PET_ITEMS[id].icon}${PET_ITEMS[id].name} 放在地上`);
  });
  petEatTarget = -1;
}

function petToilet() {
  petAct((p) => {
    if (p.phase !== 'hatched') return;
    if (p.asleep) { petSay('mid', '呼⋯⋯（睡著了）'); return; }
    if (p.needs.bladder < 15 && p.needs.bowel < 15) { petSay('right', '我又不想上！'); return; }
    p.needs.bladder = 0;
    p.needs.bowel = 0;
    petLog('帶去馬桶，乖乖上完了');
    petSay('left', '舒服～');
    petToiletUntil = Date.now() + 4000;
  });
}

function pxBedSide() { const fk = pxFurnScale(data.pet); return { x: PX_BED.x + 130 * fk + 10, y: PX_BED.y + 2 }; }
function pxToiletSide() { const tk = pxFurnScale(data.pet) * 1.45; return { x: PX_TOILET.x - 40 * tk - 8, y: PX_TOILET.y + 6 }; }

function petWake() {
  petAct((p) => {
    if (!p.asleep) return;
    p.asleep = false;
    p.pos = pxBedSide();
    petFace = 1;
    petLog('被叫醒了');
    petSay('mid', p.needs.fatigue > 50 ? '⋯⋯幹嘛啦，我還沒睡飽。' : '早安～');
  });
}

function petGoBed() {
  const p = data.pet;
  if (p.phase !== 'hatched') return;
  if (p.asleep) { petWake(); return; }
  if (p.needs.fatigue < 25) { petSay('mid', '我還不睏欸。'); petRender(); return; }
  const side = pxBedSide();
  pxWalkTo(side.x, side.y, () => petAct((pp) => {
    if (pp.asleep) return;
    pp.asleep = true;
    petLog('自己爬上床睡覺了');
  }));
}

function petGoToilet() {
  const p = data.pet;
  if (p.phase !== 'hatched') return;
  if (p.asleep) { petSay('mid', '呼⋯⋯（睡著了）'); petRender(); return; }
  if (p.needs.bladder < 15 && p.needs.bowel < 15) { petSay('right', '我又不想上！'); petRender(); return; }
  const side = pxToiletSide();
  pxWalkTo(side.x, side.y, petToilet);
}

function petPat() {
  const box = petHit.dragon;
  if (box) {
    const now = performance.now();
    for (let i = 0; i < 3; i++) petFx.push({ kind: 'heart', x: (box[0] + box[2]) / 2 - 6 + i * 5, y: box[1] + 2 - i * 3, t0: now + i * 120 });
  }
  petAct((p) => {
    if (p.phase !== 'hatched') { petSay('mid', '（蛋好像動了一下）'); return; }
    p.affection++;
    if (p.asleep) { petSay('mid', '⋯⋯呼嚕（睡夢中蹭了蹭你）'); return; }
    const lines = [
      ['left', '再摸一下！然後給我吃的。'],
      ['mid', '嗯⋯⋯好舒服⋯⋯要睡著了⋯⋯'],
      ['right', '別、別以為摸我就會開心！⋯⋯再一下。'],
      ['left', '你身上有食物的味道嗎？']
    ];
    const [h, text] = petPick(lines);
    petSay(h, text);
  });
}

// ---------- 台詞 ----------
function petAutoSpeech(p) {
  if (p.phase === 'egg') return { head: 'mid', text: '（蛋裡傳來三種不同的心跳聲）' };
  if (p.asleep) return { head: 'mid', text: petSp(p).asleep };
  if (p.sick) return { head: 'mid', text: petSp(p).sick };
  const n = p.needs;
  if (Math.max(n.bladder, n.bowel) >= 80) return { head: 'right', text: '快、快帶我去馬桶！不然我就⋯⋯' };
  if (n.hunger >= 75) return { head: 'left', text: '肚子在叫了⋯⋯有雞胸肉嗎？' };
  if (n.thirst >= 75) return { head: 'right', text: '才、才不是口渴，只是想喝點水而已。' };
  if (n.fatigue >= 80) return { head: 'mid', text: '呼⋯⋯好想爬上床⋯⋯' };
  if (p.mess.length) return { head: 'right', text: '地上好髒，受不了。' };
  if (n.dirt >= 75) return { head: 'right', text: '身上好黏⋯⋯想去湖裡泡個澡。' };
  const low = PET_NUTRIENTS.filter((x) => p.nutrients[x.key] < 30);
  if (low.length) {
    const lines = {
      carb: ['mid', '沒力氣⋯⋯想吃地瓜。'],
      protein: ['left', '好想吃雞胸肉，最近都長不大。'],
      fat: ['right', `${petSp(p).skin}好乾，給我一點橄欖油。`],
      vitamin: ['mid', '眼睛有點花，該吃綜合維生素了。'],
      mineral: ['left', '想啃石頭⋯⋯鐵礦石那種。']
    };
    const [h, text] = lines[low[0].key];
    return { head: h, text };
  }
  const idle = [
    ['left', '今天也要記得餵我喔。'],
    ['mid', '曬太陽好舒服⋯⋯'],
    ['right', '哼，今天的你還算勤勞。'],
    ['left', '我覺得我又長大了一點點！'],
    ['right', petSp(p).idle],
    ['mid', '（打了一個好大的哈欠）']
  ];
  const idx = Math.floor(Date.now() / 60000) % idle.length;
  return { head: idle[idx][0], text: idle[idx][1] };
}

// ---------- 繪圖 ----------
function petHsl(h, s, l, a = 1) { return `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${a})`; }

function petVisual(p) {
  const g = petClamp(p.growth / PET_GROWTH_MAX, 0, 1);
  const sickK = p.sick ? 1 : 0;
  const hue = petLerp(150, 160, g) - 55 * sickK;
  const sat = petLerp(52, 58, g) - 20 * sickK;
  const light = petLerp(66, 38, g);
  return {
    g,
    scale: 0.5 + 0.28 * g,
    headK: 1.45 - 0.45 * g,
    neckK: 0.62 + 0.38 * g,
    wingK: 0.22 + 0.78 * g,
    hornK: 0.12 + 0.88 * g,
    tailK: 0.35 + 0.65 * g,
    spikes: 3 + Math.round(g * 10),
    spikeK: 0.5 + 0.7 * g,
    eyeR: 6.2 - 2.2 * g,
    body: petHsl(hue, sat, light),
    bodyDark: petHsl(hue, sat, light - 12),
    belly: g > 0.9 ? '#f4cf6a' : petHsl(45, 70, petLerp(88, 74, g)),
    wing: petHsl(hue + 10, sat - 5, light + 8, 0.85),
    horn: g > 0.9 ? '#e8b839' : petHsl(40, petLerp(30, 55, g), petLerp(92, 78, g)),
    spike: petHsl(hue - 10, sat, light - 18)
  };
}

function petDrawHead(v, p, which, blink) {
  const n = p.needs;
  const asleep = p.asleep;
  let eye = 'open', brow = 'none', mouth = 'smile', extra = '';
  if (which === 'left') {
    if (n.hunger >= 60) { mouth = 'open'; brow = 'sad'; extra = 'drool'; }
  } else if (which === 'mid') {
    if (n.fatigue >= 60) eye = 'half';
  } else {
    brow = 'proud';
    if (n.thirst >= 60) { mouth = 'tongue'; brow = 'sad'; }
  }
  if (p.sick) { eye = 'sick'; brow = 'sad'; mouth = 'flat'; extra = 'sweat'; }
  if (asleep) { eye = 'closed'; mouth = 'flat'; brow = 'none'; extra = ''; }
  if (blink && (eye === 'open' || eye === 'half')) eye = 'closed';

  const hl = v.hornK;
  const er = v.eyeR;
  const hornTint = which === 'left' ? '#f0b979' : which === 'right' ? '#c9b6ef' : v.horn;
  let s = '';
  // 角
  s += `<path d="M -8 -11 Q ${-14 - 6 * hl} ${-20 - 8 * hl} ${-10 - 16 * hl} ${-18 - 18 * hl}" stroke="${hornTint}" stroke-width="${3 + 2 * hl}" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M -1 -14 Q ${-4 - 5 * hl} ${-24 - 8 * hl} ${-2 - 12 * hl} ${-22 - 18 * hl}" stroke="${hornTint}" stroke-width="${3 + 2 * hl}" fill="none" stroke-linecap="round"/>`;
  // 頸後鰭
  s += `<path d="M -17 -6 L -29 -2 L -17 6 Z" fill="${v.spike}"/>`;
  // 頭、吻
  s += `<ellipse cx="0" cy="0" rx="20" ry="16" fill="${v.body}"/>`;
  s += `<ellipse cx="16" cy="4" rx="14" ry="10" fill="${v.body}"/>`;
  s += `<ellipse cx="14" cy="9" rx="10" ry="4" fill="${v.belly}" opacity="0.7"/>`;
  s += `<circle cx="26" cy="1" r="1.6" fill="#1d2b22"/>`;
  // 嘴
  if (mouth === 'open') s += `<ellipse cx="21" cy="10" rx="6" ry="4" fill="#5a1f22"/>`;
  else if (mouth === 'tongue') s += `<path d="M 12 10 Q 20 13 28 9" stroke="#1d2b22" stroke-width="1.4" fill="none"/><path d="M 22 11 q 3 7 6 1" fill="#e46a7a"/>`;
  else if (mouth === 'flat') s += `<path d="M 12 10 L 27 9" stroke="#1d2b22" stroke-width="1.4"/>`;
  else s += `<path d="M 12 9 Q 20 14 28 8" stroke="#1d2b22" stroke-width="1.4" fill="none"/>`;
  // 眼
  if (eye === 'closed') {
    s += `<path d="M ${-er} -4 Q 2 ${-4 + er * 0.8} ${4 + er} -4" stroke="#1d2b22" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  } else if (eye === 'sick') {
    s += `<path d="M -3 -9 l 8 8 M 5 -9 l -8 8" stroke="#1d2b22" stroke-width="1.8" stroke-linecap="round"/>`;
  } else {
    s += `<g class="pd-eye"><ellipse cx="2" cy="-5" rx="${er}" ry="${er * 1.1}" fill="#fff"/><circle cx="${2 + er * 0.25}" cy="-4.5" r="${er * 0.58}" fill="#1d2b22"/><circle cx="${2 + er * 0.45}" cy="${-5.5 - er * 0.2}" r="${er * 0.2}" fill="#fff"/></g>`;
    if (eye === 'half') s += `<path d="M ${2 - er - 1} ${-5 - er * 1.2} h ${2 * er + 2} v ${er * 1.15} h ${-(2 * er + 2)} Z" fill="${v.body}"/><path d="M ${2 - er} -5 h ${2 * er}" stroke="#1d2b22" stroke-width="1.2"/>`;
  }
  // 眉
  if (brow === 'proud') s += `<path d="M ${-er} ${-7 - er * 1.2} L ${4 + er} ${-4 - er * 1.1}" stroke="#1d2b22" stroke-width="2" stroke-linecap="round"/>`;
  else if (brow === 'sad') s += `<path d="M ${-er} ${-4 - er * 1.1} L ${4 + er} ${-8 - er * 1.2}" stroke="#1d2b22" stroke-width="2" stroke-linecap="round"/>`;
  // 腮紅
  if (!p.sick && !asleep) s += `<ellipse cx="9" cy="3" rx="3.5" ry="2" fill="#ff8fa3" opacity="0.45"/>`;
  if (extra === 'drool') s += `<path d="M 20 13 q 1 6 0 8" stroke="#9fd8ff" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
  if (extra === 'sweat') s += `<path d="M -14 -14 q 3 -6 3 0 a 3 3 0 1 1 -3 0 Z" fill="#9fd8ff"/>`;
  return s;
}

function petDrawDragon(p, opts = {}) {
  const v = petVisual(p);
  const leg = (opts.leg || 0) * 6;   // 走路時前後腳交錯
  if (opts.eyeK) v.eyeR *= opts.eyeK;   // 像素圖很小，眼睛放大才看得到表情
  let s = '';

  // 遠側翅膀、遠側腳
  const wing = (fill) => `<path d="M0,0 C -10,-60 -40,-110 -70,-135 L -78,-128 C -90,-100 -110,-80 -125,-70 C -100,-62 -85,-55 -78,-40 C -65,-40 -50,-30 -40,-12 C -25,-12 -10,-5 0,0 Z" fill="${fill}"/>` +
    `<path d="M0,0 L -74,-132 M0,0 L -125,-70 M0,0 L -78,-40" stroke="${v.bodyDark}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  s += `<g transform="translate(18,-104) rotate(12) scale(${v.wingK * 0.85})" opacity="0.8">${wing(v.wing)}</g>`;
  s += `<ellipse cx="${-12 - leg}" cy="-22" rx="15" ry="22" fill="${v.bodyDark}"/><ellipse cx="${52 - leg}" cy="-22" rx="12" ry="20" fill="${v.bodyDark}"/>`;

  // 尾巴
  const tx = -60 - 110 * v.tailK, ty = -28 - 30 * v.tailK;
  s += `<path d="M -40 -88 Q ${tx * 0.6} -72 ${tx} ${ty} Q ${tx * 0.6} -18 -40 -30 Z" fill="${v.body}"/>`;
  s += `<path d="M ${tx} ${ty} l -16 -12 l 6 18 l 16 4 Z" fill="${v.spike}"/>`;

  // 近側翅膀
  s += `<g transform="translate(-4,-100) scale(${v.wingK})">${wing(v.wing)}</g>`;

  // 身體（呼吸動畫）
  s += '<g>';
  // 背刺
  for (let i = 0; i < v.spikes; i++) {
    const a = (205 + (i + 0.5) * (120 / v.spikes)) * Math.PI / 180;
    const cx = Math.cos(a) * 62, cy = -62 + Math.sin(a) * 46;
    const nx = Math.cos(a), ny = Math.sin(a);
    const sz = 9 * v.spikeK;
    s += `<path d="M ${cx - ny * sz * 0.6} ${cy + nx * sz * 0.6} L ${cx + nx * sz * 1.4} ${cy + ny * sz * 1.4} L ${cx + ny * sz * 0.6} ${cy - nx * sz * 0.6} Z" fill="${v.spike}"/>`;
  }
  s += `<ellipse cx="0" cy="-62" rx="62" ry="46" fill="${v.body}"/>`;
  s += `<ellipse cx="14" cy="-54" rx="40" ry="31" fill="${v.belly}"/>`;
  for (let i = 0; i < 4; i++) {
    const y = -74 + i * 11;
    s += `<path d="M ${-14 + Math.abs(i - 1.5) * 4} ${y} Q 14 ${y + 4} ${42 - Math.abs(i - 1.5) * 4} ${y}" stroke="${v.bodyDark}" stroke-width="1.2" fill="none" opacity="0.35"/>`;
  }
  s += '</g>';

  // 近側腳
  s += `<ellipse cx="${-30 + leg}" cy="-26" rx="21" ry="25" fill="${v.body}"/><ellipse cx="${-24 + leg}" cy="-5" rx="19" ry="7" fill="${v.body}"/>`;
  s += `<ellipse cx="${36 + leg}" cy="-24" rx="14" ry="22" fill="${v.body}"/><ellipse cx="${42 + leg}" cy="-5" rx="16" ry="7" fill="${v.body}"/>`;
  for (const fx of [-38, -30, -22, 32, 40, 48]) s += `<circle cx="${fx + 6 + leg}" cy="-1" r="2.2" fill="#f5f1e6"/>`;

  // 三條脖子、三顆頭
  const necks = {
    left:  { base: [16, -100], end: [-70, -78] },
    right: { base: [42, -98], end: [96, -58] },
    mid:   { base: [30, -106], end: [16, -132] }
  };
  const neckW = 19;
  for (const which of ['left', 'right', 'mid']) {
    const nk = necks[which];
    const ex = nk.base[0] + nk.end[0] * v.neckK;
    const ey = nk.base[1] + nk.end[1] * v.neckK;
    const cx = nk.base[0] + nk.end[0] * v.neckK * 0.15;
    const cy = nk.base[1] + nk.end[1] * v.neckK * 0.75;
    s += `<path d="M ${nk.base[0]} ${nk.base[1]} Q ${cx} ${cy} ${ex} ${ey}" stroke="${v.body}" stroke-width="${neckW}" fill="none" stroke-linecap="round"/>`;
    const flip = which === 'left' ? -1 : 1;
    const tilt = which === 'left' ? 8 : which === 'right' ? 8 : -4;
    s += `<g transform="translate(${ex},${ey - 4}) scale(${v.headK * flip},${v.headK}) rotate(${tilt})"><g>${petDrawHead(v, p, which, opts.blink)}</g></g>`;
  }

  return { svg: s, v };
}

// ---------- 九尾狐、鳳凰（座標系跟龍一樣：腳在 y=0、面朝右） ----------
function petEyeState(p, blink) {
  if (p.asleep) return 'closed';
  if (p.sick) return 'sick';
  if (blink) return 'closed';
  if (p.needs.fatigue >= 60) return 'half';
  return 'open';
}

function petEyeSVG(x, y, r, state, lid) {
  const ink = '#1d2b22';
  if (state === 'closed') return `<path d="M ${x - r} ${y} Q ${x} ${y + r * 0.9} ${x + r} ${y}" stroke="${ink}" stroke-width="${Math.max(1.8, r * 0.45)}" fill="none" stroke-linecap="round"/>`;
  if (state === 'sick') return `<path d="M ${x - r} ${y - r} L ${x + r} ${y + r} M ${x + r} ${y - r} L ${x - r} ${y + r}" stroke="${ink}" stroke-width="${Math.max(1.8, r * 0.4)}" stroke-linecap="round"/>`;
  let s = `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.1}" fill="#fff"/><circle cx="${x + r * 0.25}" cy="${y + r * 0.1}" r="${r * 0.6}" fill="${ink}"/><circle cx="${x + r * 0.45}" cy="${y - r * 0.25}" r="${r * 0.2}" fill="#fff"/>`;
  if (state === 'half') s += `<rect x="${x - r - 1}" y="${y - r * 1.3}" width="${2 * r + 2}" height="${r * 1.2}" fill="${lid}"/><path d="M ${x - r} ${y - r * 0.1} h ${2 * r}" stroke="${ink}" stroke-width="1.3"/>`;
  return s;
}

function petDrawFox(p, opts = {}) {
  const g = petClamp(p.growth / PET_GROWTH_MAX, 0, 1);
  const leg = (opts.leg || 0) * 6;
  // 奶油色 → 橘紅 → 最後的九尾天狐轉成銀白帶金
  let h, sa, l;
  if (g < 0.85) { const t = g / 0.85; h = petLerp(32, 22, t); sa = petLerp(60, 85, t); l = petLerp(74, 55, t); }
  else { const t = (g - 0.85) / 0.15; h = petLerp(22, 44, t); sa = petLerp(85, 55, t); l = petLerp(55, 84, t); }
  if (p.sick) { h -= 18; sa -= 25; }
  const fur = petHsl(h, sa, l), furDark = petHsl(h, sa, l - 14), sock = petHsl(h, sa * 0.6, Math.max(18, l - 36));
  const cream = '#fbf3e4', tip = g >= 0.85 ? '#f6d36b' : cream;
  const headK = 1.35 - 0.35 * g, earK = 0.6 + 0.6 * g, tailK = 0.45 + 0.55 * g;
  const tails = Math.min(9, 1 + Math.floor(g * 9));
  const eyeR = (5.5 - 1.5 * g) * (opts.eyeK || 1);
  let s = '';
  // 遠側的腳
  s += `<ellipse cx="${-20 - leg}" cy="-20" rx="8" ry="19" fill="${furDark}"/><ellipse cx="${42 - leg}" cy="-20" rx="8" ry="19" fill="${furDark}"/>`;
  // 尾巴：一條一條往上散開
  const L = 150 * tailK, W = 26 + 8 * g;
  const spread = tails === 1 ? 0 : Math.min(100, 13 * (tails - 1));
  for (let i = 0; i < tails; i++) {
    const a = 222 - spread / 2 + (tails === 1 ? 0 : (i * spread) / (tails - 1));
    s += `<g transform="translate(-48,-58) rotate(${a.toFixed(1)})"><path d="M 0 ${-W * 0.35} Q ${L * 0.45} ${-W} ${L} 0 Q ${L * 0.45} ${W} 0 ${W * 0.35} Z" fill="${i % 2 ? furDark : fur}"/><ellipse cx="${L * 0.86}" cy="0" rx="${L * 0.16}" ry="${W * 0.42}" fill="${tip}"/></g>`;
  }
  // 身體
  s += `<ellipse cx="0" cy="-50" rx="50" ry="28" fill="${fur}"/><ellipse cx="16" cy="-42" rx="28" ry="15" fill="${cream}"/>`;
  // 近側的腳＋深色襪子
  for (const fx of [-32, 30]) {
    s += `<ellipse cx="${fx + leg}" cy="-20" rx="9" ry="20" fill="${fur}"/><ellipse cx="${fx + leg + 1}" cy="-4" rx="9" ry="6" fill="${sock}"/>`;
  }
  // 頭
  const n = p.needs;
  let hd = '';
  hd += `<path d="M -16 -12 L ${-12 - 4 * earK} ${-14 - 30 * earK} L 0 -16 Z" fill="${furDark}"/>`;
  hd += `<path d="M -4 -16 L ${4} ${-18 - 32 * earK} L 14 -12 Z" fill="${fur}"/><path d="M 0 -17 L ${4} ${-14 - 24 * earK} L 9 -14 Z" fill="#f2a6a0"/>`;
  hd += `<ellipse cx="0" cy="-4" rx="22" ry="19" fill="${fur}"/><ellipse cx="6" cy="6" rx="16" ry="10" fill="${cream}"/>`;
  hd += `<path d="M 10 -8 L 40 2 L 12 12 Z" fill="${fur}"/><path d="M 12 3 L 40 2 L 14 12 Z" fill="${cream}"/><circle cx="40" cy="1" r="3.2" fill="#1d2b22"/>`;
  hd += petEyeSVG(12, -6, eyeR, petEyeState(p, opts.blink), fur);
  if (!p.asleep && !p.sick && n.hunger >= 60) hd += `<ellipse cx="28" cy="10" rx="4" ry="3" fill="#5a1f22"/>`;
  else hd += `<path d="M 20 10 Q 26 13 32 9" stroke="#1d2b22" stroke-width="1.4" fill="none"/>`;
  if (!p.sick && !p.asleep) hd += `<ellipse cx="2" cy="4" rx="4" ry="2.2" fill="#ff8fa3" opacity="0.45"/>`;
  if (p.sick) hd += `<path d="M -16 -14 q 3 -6 3 0 a 3 3 0 1 1 -3 0 Z" fill="#9fd8ff"/>`;
  s += `<g transform="translate(56,-80) scale(${headK})">${hd}</g>`;
  return { svg: s };
}

function petDrawPhoenix(p, opts = {}) {
  const g = petClamp(p.growth / PET_GROWTH_MAX, 0, 1);
  const leg = (opts.leg || 0) * 5;
  // 灰褐雛鳥 → 赤紅鳳凰
  let h = petLerp(30, 6, g), sa = petLerp(18, 80, g), l = petLerp(68, 50, g);
  if (p.sick) { h += 40; sa -= 25; }
  const body = petHsl(h, sa, l), bodyDark = petHsl(h, sa, l - 14);
  const belly = petHsl(petLerp(35, 38, g), petLerp(30, 90, g), petLerp(82, 62, g));
  const gold = '#f2c14e', flame = g > 0.6;
  const headK = 1.4 - 0.4 * g, tailK = 0.3 + 0.7 * g, wingK = 0.55 + 0.45 * g;
  const tailN = Math.min(8, 2 + Math.floor(g * 7)), crestN = Math.min(5, 1 + Math.floor(g * 5));
  const eyeR = (4.8 - 1.2 * g) * (opts.eyeK || 1);
  const flameAt = (x, y, r) => `<path d="M ${x} ${y + r} Q ${x - r} ${y} ${x} ${y - r * 1.8} Q ${x + r} ${y} ${x} ${y + r} Z" fill="#ff7a1f"/><path d="M ${x} ${y + r * 0.6} Q ${x - r * 0.5} ${y} ${x} ${y - r} Q ${x + r * 0.5} ${y} ${x} ${y + r * 0.6} Z" fill="#ffd23f"/>`;
  let s = '';
  // 尾羽
  const L = 150 * tailK;
  for (let i = 0; i < tailN; i++) {
    const a = 158 + (tailN === 1 ? 0 : (i * 46) / (tailN - 1));
    const tipR = 5 + 6 * g;
    s += `<g transform="translate(-26,-50) rotate(${a.toFixed(1)})"><path d="M 0 0 Q ${L * 0.5} ${i % 2 ? -8 : 8} ${L} 0" stroke="${i % 2 ? bodyDark : body}" stroke-width="${3 + 2.5 * g}" fill="none" stroke-linecap="round"/>`;
    s += `<ellipse cx="${L}" cy="0" rx="${tipR}" ry="${tipR * 0.7}" fill="${gold}"/><ellipse cx="${L}" cy="0" rx="${tipR * 0.45}" ry="${tipR * 0.35}" fill="${bodyDark}"/>`;
    if (flame) s += `<g transform="translate(${L + tipR},0) rotate(90)">${flameAt(0, 0, 3 + 4 * g)}</g>`;
    s += '</g>';
  }
  // 腳
  s += `<path d="M -6 -36 L ${-8 + leg} 0 M ${-8 + leg} 0 l -6 1 M ${-8 + leg} 0 l 6 1" stroke="#e0a030" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M 8 -36 L ${10 - leg} 0 M ${10 - leg} 0 l -6 1 M ${10 - leg} 0 l 6 1" stroke="#e0a030" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  // 身體、翅膀
  s += `<ellipse cx="0" cy="-60" rx="33" ry="29" fill="${body}"/><ellipse cx="11" cy="-52" rx="18" ry="19" fill="${belly}"/>`;
  s += `<g transform="translate(-4,-70) scale(${wingK})"><path d="M 0 0 Q -42 -12 -62 22 Q -34 18 -12 32 Z" fill="${bodyDark}"/><path d="M -14 8 L -46 16 M -10 16 L -36 26" stroke="${body}" stroke-width="2" fill="none"/></g>`;
  // 脖子、頭
  s += `<path d="M 14 -78 Q 24 -96 30 -108" stroke="${body}" stroke-width="17" fill="none" stroke-linecap="round"/>`;
  const n = p.needs;
  let hd = '';
  for (let i = 0; i < crestN; i++) {
    const a = -100 - (crestN === 1 ? 20 : (i * 60) / (crestN - 1));
    const len = 10 + 24 * g;
    hd += `<g transform="translate(-4,-10) rotate(${a.toFixed(1)})"><path d="M 0 0 Q ${len * 0.5} -4 ${len} 0" stroke="${bodyDark}" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="${len}" cy="0" r="${2.5 + 1.5 * g}" fill="${gold}"/>`;
    if (flame) hd += `<g transform="translate(${len + 2},0) rotate(90)">${flameAt(0, 0, 2 + 2 * g)}</g>`;
    hd += '</g>';
  }
  hd += `<circle cx="0" cy="0" r="15" fill="${body}"/>`;
  const open = !p.asleep && !p.sick && (n.hunger >= 60 || n.thirst >= 60);
  hd += open
    ? `<path d="M 11 -5 L 30 -2 L 12 1 Z" fill="#f2b134"/><path d="M 12 3 L 27 6 L 11 7 Z" fill="#d9952a"/>`
    : `<path d="M 11 -5 L 30 1 L 11 6 Z" fill="#f2b134"/>`;
  hd += petEyeSVG(4, -3, eyeR, petEyeState(p, opts.blink), body);
  if (!p.sick && !p.asleep) hd += `<ellipse cx="2" cy="6" rx="3.5" ry="2" fill="#ff8fa3" opacity="0.45"/>`;
  if (p.sick) hd += `<path d="M -12 -12 q 3 -6 3 0 a 3 3 0 1 1 -3 0 Z" fill="#9fd8ff"/>`;
  s += `<g transform="translate(32,-112) scale(${headK})">${hd}</g>`;
  return { svg: s };
}

function petDrawPet(p, opts) {
  if (p.species === 'fox') return petDrawFox(p, opts);
  if (p.species === 'phoenix') return petDrawPhoenix(p, opts);
  return petDrawDragon(p, opts);
}

function petDrawBed() {
  // 原點 = 床的地面中心，床墊頂在 y = -36；床頭在右邊（龍頭那側）
  const wood = '#8b5a3c', woodDark = '#6e432b';
  return `<rect x="-126" y="-14" width="10" height="14" fill="${woodDark}"/><rect x="116" y="-14" width="10" height="14" fill="${woodDark}"/>` +
    `<rect x="118" y="-104" width="14" height="92" rx="6" fill="${wood}"/>` +
    `<rect x="-134" y="-62" width="12" height="50" rx="5" fill="${wood}"/>` +
    `<rect x="-130" y="-24" width="260" height="12" rx="4" fill="${wood}"/>` +
    `<rect x="-126" y="-38" width="246" height="16" rx="7" fill="#f4f1ea"/>` +
    `<ellipse cx="94" cy="-42" rx="24" ry="8" fill="#ffffff" stroke="#ddd8cc" stroke-width="1.5"/>`;
}

function petDrawBlanket() {
  return `<path d="M -112 -36 L -112 -74 Q -10 -88 104 -70 L 112 -36 Z" fill="#6f8fd8"/>` +
    `<path d="M -112 -60 Q -10 -72 106 -56" stroke="#fff" stroke-width="3" fill="none" opacity="0.5"/>` +
    `<path d="M -112 -48 Q -10 -58 109 -44" stroke="#fff" stroke-width="3" fill="none" opacity="0.5"/>`;
}

function petDrawToilet(front) {
  // 原點 = 馬桶地面中心，座圈頂在 y ≈ -42
  if (front) {
    return `<path d="M -36 -38 Q -32 -14 0 -14 Q 32 -14 36 -38 Z" fill="#f4f4f0" stroke="#cfcfc6" stroke-width="1.5"/>` +
      `<path d="M -14 0 L 14 0 L 10 -16 L -10 -16 Z" fill="#ececE6" stroke="#cfcfc6" stroke-width="1.5"/>`;
  }
  return `<rect x="-46" y="-104" width="30" height="58" rx="5" fill="#f4f4f0" stroke="#cfcfc6" stroke-width="1.5"/>` +
    `<rect x="-40" y="-112" width="18" height="6" rx="2" fill="#cfcfc6"/>` +
    `<ellipse cx="0" cy="-40" rx="36" ry="9" fill="#e9e9e3" stroke="#cfcfc6" stroke-width="1.5"/>` +
    `<ellipse cx="0" cy="-40" rx="24" ry="5" fill="#bfe3f5"/>` +
    petDrawToilet(true);
}

// ===================== 像素場景 =====================
// 低解析度 canvas 放大顯示。龍和家具沿用上面的向量造型，直接畫到小 canvas 上，
// 把半透明邊緣二值化並加一圈深色描邊，做成像素圖（會隨成長一像素一像素變大）。
const PX_W = 384, PX_H = 216, PX_HORIZON = 132;
const PX_WALK = { x0: 16, x1: 368, y0: 152, y1: 210 };
const PX_BED = { x: 72, y: 202 };
const PX_TOILET = { x: 318, y: 186 };
const PX_POND = { x: 214, y: 150, rx: 34, ry: 7 };
const PX_OUTLINE = [30, 36, 34];

let petMove = null;          // { tx, ty, then }
let petEatTarget = -1;       // 正在走去吃的地上物品（索引）
let petEating = null;        // { g, dur }：正在吃的那一樣
let petBathing = null;       // { dur, start }：正在湖裡泡澡
const PET_BATH_SECONDS = 6;
let petFace = 1;             // 1 朝右、-1 朝左
let petNextWander = 0;
let petFx = [];              // { kind, x, y, t0 }
let petHit = {};             // 點擊判定框（像素座標）
let petLastFrame = 0;
let petLastDraw = 0;
const petSprites = new Map();

function pxScale(p) { return 0.14 + 0.11 * petClamp(p.growth / PET_GROWTH_MAX, 0, 1); }
// 黑白（1-bit 抖色）或彩色；預設黑白
function pxMono() { return data.pet.mono !== false; }
function pxModeLabel() {
  const b = document.getElementById('pet-mode-btn');
  if (b) b.textContent = pxMono() ? '◐ 黑白 → 彩色' : '◑ 彩色 → 黑白';
}
const PX_INK = [24, 24, 22], PX_PAPER = [232, 230, 220];
// 亮度分六階，每階一種固定網點：白、稀疏點、25%、50% 棋盤、75%、黑
function pxInkAt(l, x, y) {
  if (l >= 200) return false;
  if (l >= 165) return (x & 3) === 0 && (y & 3) === 0;
  if (l >= 130) return (x & 1) === 0 && (y & 1) === 0;
  if (l >= 95) return ((x + y) & 1) === 0;
  if (l >= 60) return !((x & 1) === 0 && (y & 1) === 0);
  return true;
}
function pxDither(c) {
  const id = c.getImageData(0, 0, PX_W, PX_H);
  const d = id.data;
  for (let y = 0; y < PX_H; y++) {
    for (let x = 0; x < PX_W; x++) {
      const i = (y * PX_W + x) * 4;
      const col = pxInkAt(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], x, y) ? PX_INK : PX_PAPER;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
    }
  }
  c.putImageData(id, 0, 0);
}

// 家具有最小尺寸，幼龍睡大床、坐大馬桶
function pxFurnScale(p) { return Math.max(0.22, pxScale(p)); }

// 直接把自己產生的 SVG 片段畫到 canvas（不走 <img>，避開 claude.ai 對 data: 圖片的限制）
function pxApplyTransform(ctx, t) {
  const re = /(translate|scale|rotate)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(t))) {
    const a = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (m[1] === 'translate') ctx.translate(a[0], a[1] || 0);
    else if (m[1] === 'scale') ctx.scale(a[0], a.length > 1 ? a[1] : a[0]);
    else ctx.rotate((a[0] * Math.PI) / 180);
  }
}

function pxPaintSVG(ctx, el) {
  for (const n of el.children) {
    const at = (k) => n.getAttribute(k);
    const num = (k) => Number(at(k) || 0);
    ctx.save();
    if (at('transform')) pxApplyTransform(ctx, at('transform'));
    if (at('opacity')) ctx.globalAlpha *= Number(at('opacity'));
    const tag = n.tagName;
    if (tag === 'g') { pxPaintSVG(ctx, n); ctx.restore(); continue; }
    let path = new Path2D();
    if (tag === 'ellipse') path.ellipse(num('cx'), num('cy'), num('rx'), num('ry'), 0, 0, Math.PI * 2);
    else if (tag === 'circle') path.arc(num('cx'), num('cy'), num('r'), 0, Math.PI * 2);
    else if (tag === 'rect') {
      if (at('rx') && path.roundRect) path.roundRect(num('x'), num('y'), num('width'), num('height'), num('rx'));
      else path.rect(num('x'), num('y'), num('width'), num('height'));
    } else if (tag === 'path') path = new Path2D(at('d'));
    else if (tag === 'polyline') {
      at('points').trim().split(/\s+/).forEach((pt, i) => {
        const [x, y] = pt.split(',').map(Number);
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
      });
    } else { ctx.restore(); continue; }
    const fill = at('fill');
    if (fill !== 'none' && tag !== 'polyline') { ctx.fillStyle = fill || '#000'; ctx.fill(path); }
    const stroke = at('stroke');
    if (stroke && stroke !== 'none') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Number(at('stroke-width') || 1);
      ctx.lineCap = at('stroke-linecap') || 'butt';
      ctx.lineJoin = at('stroke-linejoin') || 'miter';
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

// 把一段 SVG 畫成像素圖並快取
function pxSprite(key, makeInner, vb, scale) {
  const hit = petSprites.get(key);
  if (hit) return hit;
  const [x0, y0, w, h] = vb;
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const cv = document.createElement('canvas');
  cv.width = W + 2; cv.height = H + 2;
  const cx = cv.getContext('2d');
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${makeInner()}</svg>`, 'image/svg+xml');
  cx.save();
  cx.translate(1, 1);
  cx.scale(W / w, H / h);
  cx.translate(-x0, -y0);
  pxPaintSVG(cx, doc.documentElement);
  cx.restore();

  // 半透明邊緣二值化，再描一圈深色外框
  const id = cx.getImageData(0, 0, cv.width, cv.height);
  const d = id.data, cw = cv.width, ch = cv.height;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  const solid = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && d[(y * cw + x) * 4 + 3] === 255;
  const edge = [];
  let mx = cw, my = ch, Mx = -1, My = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (solid(x, y)) { if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y; continue; }
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push((y * cw + x) * 4);
    }
  }
  for (const i of edge) { d[i] = PX_OUTLINE[0]; d[i + 1] = PX_OUTLINE[1]; d[i + 2] = PX_OUTLINE[2]; d[i + 3] = 255; }
  cx.putImageData(id, 0, 0);

  const entry = { canvas: cv, ax: 1 - x0 * scale, ay: 1 - y0 * scale, bbox: Mx >= 0 ? [mx - 1, my - 1, Mx + 1, My + 1] : [0, 0, cw, ch] };
  petSprites.set(key, entry);
  if (petSprites.size > 160) petSprites.delete(petSprites.keys().next().value);
  return entry;
}

function pxDragonSprite(p, blink, leg) {
  const n = p.needs;
  const expr = [p.asleep, p.sick, n.hunger >= 60, n.fatigue >= 60, n.thirst >= 60].map(Number).join('');
  const key = `${p.species || 'dragon'}|${Math.round(p.growth)}|${expr}|${blink ? 1 : 0}|${leg}`;
  return pxSprite(key, () => petDrawPet(p, { blink, leg, eyeK: 1.7 }).svg, [-215, -305, 410, 320], pxScale(p));
}

// ---------- 像素小工具 ----------
function pxRect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function pxEllipse(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    c.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}
function pxMap(c, rows, pal, x, y) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const col = pal[rows[j][i]];
      if (col) { c.fillStyle = col; c.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1); }
    }
  }
}
const PX_HEART = ['.a.a.', 'aaaaa', 'aaaaa', '.aaa.', '..a..'];
const PX_Z = ['aaaa', '..a.', '.a..', 'a...', 'aaaa'];
const PX_POOP = ['...a...', '..aba..', '.aaaaa.', '.abbba.', 'aaaaaaa', 'abbbbba', '.aaaaa.'];
const PX_FLOWER = ['.a.', 'aba', '.a.', '.c.'];

function pxTree(c, x, y, s) {
  pxRect(c, x - 2 * s, y - 10 * s, 4 * s, 10 * s, '#6b4a2b');
  pxEllipse(c, x, y - 16 * s, 9 * s, 8 * s, '#3f8f4f');
  pxEllipse(c, x - 4 * s, y - 20 * s, 6 * s, 5 * s, '#4fa65d');
  pxEllipse(c, x + 3 * s, y - 13 * s, 5 * s, 4 * s, '#357a43');
}
function pxCloud(c, x, y) {
  pxEllipse(c, x, y, 12, 4, '#ffffff');
  pxEllipse(c, x + 8, y - 3, 8, 4, '#ffffff');
  pxEllipse(c, x - 7, y - 2, 6, 3, '#ffffff');
}

// 背景（不會動的部分）快取
let pxBgCache = { key: '', canvas: null };
function pxBackground(night) {
  const mono = pxMono();
  const key = (night ? 'n' : 'd') + (mono ? 'm' : 'c');
  if (pxBgCache.key === key) return pxBgCache.canvas;
  const cv = document.createElement('canvas');
  cv.width = PX_W; cv.height = PX_H;
  const c = cv.getContext('2d');
  const sky = night
    ? ['#10162c', '#151c38', '#1b2345', '#222b53', '#2a3462', '#323e70']
    : ['#7cc6ee', '#8ecff1', '#a0d8f3', '#b3e0f5', '#c6e8f6', '#d9f0f6'];
  const bh = Math.ceil(PX_HORIZON / sky.length);
  sky.forEach((col, i) => pxRect(c, 0, i * bh, PX_W, bh, col));
  if (night) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) pxRect(c, Math.floor(rnd() * PX_W), Math.floor(rnd() * 72) + 4, 1, 1, i % 5 ? '#c9d2ff' : '#ffffff');
    pxEllipse(c, 334, 26, 9, 9, '#f4eccb');
    pxEllipse(c, 339, 22, 8, 8, sky[0]);
  } else {
    pxEllipse(c, 334, 28, 10, 10, '#ffe27a');
    pxEllipse(c, 334, 28, 7, 7, '#fff1a8');
  }
  // 遠山、近丘
  for (let x = 0; x < PX_W; x++) {
    const h1 = Math.round(30 + 11 * Math.sin(x * 0.031) + 6 * Math.sin(x * 0.087 + 1.3));
    pxRect(c, x, PX_HORIZON - h1, 1, h1, night ? '#2b3558' : '#8fb6c9');
    const snow = h1 > 41 ? h1 - 41 : 0;
    if (snow) pxRect(c, x, PX_HORIZON - h1, 1, Math.min(3, snow), night ? '#5a6488' : '#eef6f8');
  }
  for (let x = 0; x < PX_W; x++) {
    const h2 = Math.round(13 + 6 * Math.sin(x * 0.047 + 2) + 4 * Math.sin(x * 0.13));
    pxRect(c, x, PX_HORIZON - h2, 1, h2, night ? '#24443a' : '#6fae6a');
  }
  // 草地
  pxRect(c, 0, PX_HORIZON, PX_W, PX_H - PX_HORIZON, night ? '#2f5a3a' : mono ? '#7a9e6c' : '#8fcf72');
  for (let i = 0; i < 420; i++) {
    const x = (i * 53 + (i >> 3) * 7) % PX_W, y = PX_HORIZON + 2 + ((i * 29) % (PX_H - PX_HORIZON - 2));
    pxRect(c, x, y, 1, i % 3 ? 1 : 2, i % 2 ? (night ? '#27503a' : mono ? '#6a8e5c' : '#7dbf62') : (night ? '#3a6a45' : mono ? '#8fb382' : '#a3dc84'));
  }
  // 池塘
  pxEllipse(c, PX_POND.x, PX_POND.y, PX_POND.rx, PX_POND.ry, night ? '#1f3f66' : '#4aa3d8');
  pxEllipse(c, 214, 149, 30, 5, night ? '#28507e' : '#6fc0ea');
  pxRect(c, 200, 147, 8, 1, '#e8f7ff'); pxRect(c, 222, 151, 5, 1, '#e8f7ff');
  // 樹、花
  pxTree(c, 26, 146, 2); pxTree(c, 150, 138, 1); pxTree(c, 368, 150, 2); pxTree(c, 270, 137, 1);
  const flowers = [[110, 170, '#ff7aa2'], [182, 196, '#ffd23f'], [250, 176, '#ff7aa2'], [40, 186, '#c39bff'], [290, 206, '#ffd23f'], [140, 208, '#c39bff'], [356, 172, '#ff7aa2']];
  for (const [fx, fy, col] of flowers) pxMap(c, PX_FLOWER, { a: col, b: '#fff3b0', c: '#3f8f4f' }, fx, fy);
  pxBgCache = { key, canvas: cv };
  return cv;
}

// ---------- 走路 ----------
function pxWalkTo(x, y, then) {
  petEating = null;
  if (petBathing) pxEndBath(false);
  petMove = { tx: petClamp(x, PX_WALK.x0, PX_WALK.x1), ty: petClamp(y, PX_WALK.y0, PX_WALK.y1), then };
}

function pxUpdate(dt, ts) {
  const p = data.pet;
  if (!p.pos) p.pos = { x: 190, y: 184 };
  if (p.asleep || Date.now() < petToiletUntil) { petMove = null; petEating = null; return; }
  if (petBathing) {
    const b = petBathing;
    b.t += dt;
    p.needs.dirt = petClamp(b.start * (1 - b.t / b.dur));
    if (b.t >= b.dur) pxEndBath(true);
    return;
  }
  if (petEating) {
    const g = petEating.g;
    if ((p.ground || []).indexOf(g) < 0) { petEating = null; petEatTarget = -1; return; }
    if (g.left === undefined) g.left = 1;
    const before = g.left;
    g.left = Math.max(0, g.left - dt / petEating.dur);
    // 每咬一口掉一點碎屑
    if (Math.floor(before * 8) !== Math.floor(g.left * 8)) {
      for (let k = 0; k < 3; k++) petFx.push({ kind: 'crumb', x: g.x + (Math.random() * 2 - 1) * 5, y: g.y - 4, vx: (Math.random() * 2 - 1) * 10, t0: ts });
    }
    if (g.left <= 0) {
      petEating = null;
      petEatTarget = -1;
      petAct((pp) => {
        const j = pp.ground.indexOf(g);
        if (j < 0) return;
        pp.ground.splice(j, 1);
        petEat(pp, g.id);
      });
      const box = petHit.dragon;
      if (box) petFx.push({ kind: 'heart', x: (box[0] + box[2]) / 2, y: box[1], t0: performance.now() });
    }
    return;
  }
  if (petMove) {
    const dx = petMove.tx - p.pos.x, dy = petMove.ty - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const speed = (p.sick ? 14 : 28) + 30 * pxScale(p);
    if (Math.abs(dx) > 0.5) petFace = dx < 0 ? -1 : 1;
    if (dist <= speed * dt) {
      p.pos.x = petMove.tx; p.pos.y = petMove.ty;
      const then = petMove.then;
      petMove = null;
      if (then) then();
    } else {
      p.pos.x += (dx / dist) * speed * dt;
      p.pos.y += (dy / dist) * speed * dt;
    }
  } else if (pxSeekFood()) {
    // 已經出發去吃
  } else if (ts > petNextWander) {
    petNextWander = ts + 6000 + Math.random() * 9000;
    if (!p.sick && p.needs.fatigue < 85 && Math.random() < 0.7) {
      pxWalkTo(p.pos.x + (Math.random() * 2 - 1) * 70, p.pos.y + (Math.random() * 2 - 1) * 18);
    }
  }
}

// 找最近、而且現在想吃的地上物品，走過去吃
function pxSeekFood() {
  const p = data.pet;
  const ground = p.ground || [];
  let best = -1, bestD = Infinity;
  ground.forEach((g, i) => {
    if (!PET_ITEMS[g.id] || petRefuse(p, g.id)) return;
    const d = Math.hypot(g.x - p.pos.x, g.y - p.pos.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best < 0) return false;
  const g = ground[best];
  petEatTarget = best;
  const side = g.x >= p.pos.x ? -1 : 1;
  // 停在嘴巴（朝向那側的頭）剛好碰到食物的位置
  pxWalkTo(g.x + side * (petSp(p).mouth * pxScale(p) + 3), g.y + 1, () => {
    const i = (p.ground || []).indexOf(g);
    petEatTarget = -1;
    if (i < 0) return;
    petFace = side < 0 ? 1 : -1;
    const no = petRefuse(p, g.id);
    if (no) { petSay(no[0], no[1]); petRender(); return; }
    petEating = { g, dur: petEatSeconds(g.id) };
    petEatTarget = i;
    const it = PET_ITEMS[g.id];
    if (it.cat === 'water') petSay('right', '（咕嚕⋯⋯咕嚕⋯⋯）', 4000);
    else petSay('left', `（嚼嚼嚼⋯⋯${it.name}）`, 5000);
    petRender();
  });
  return true;
}

// 物品圖示（emoji）轉成像素圖：二值化＋描邊
function pxItemSprite(id) {
  const key = `item|${id}`;
  const hit = petSprites.get(key);
  if (hit) return hit;
  const S = 13;
  const cv = document.createElement('canvas');
  cv.width = S + 2; cv.height = S + 2;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.font = `${S - 1}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(PET_ITEMS[id].icon, (S + 2) / 2, (S + 2) / 2 + 1);
  const imgd = cx.getImageData(0, 0, S + 2, S + 2);
  const d = imgd.data, w = S + 2;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 120 ? 255 : 0;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < w && d[(y * w + x) * 4 + 3] === 255;
  const edge = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * w + x) * 4);
  }
  for (const i of edge) { d[i] = PX_OUTLINE[0]; d[i + 1] = PX_OUTLINE[1]; d[i + 2] = PX_OUTLINE[2]; d[i + 3] = 255; }
  cx.putImageData(imgd, 0, 0);
  const entry = { canvas: cv, w };
  petSprites.set(key, entry);
  return entry;
}

// ---------- 泡澡 ----------
function pxInPond(x, y) {
  const dx = (x - PX_POND.x) / (PX_POND.rx + 2), dy = (y - PX_POND.y) / (PX_POND.ry + 3);
  return dx * dx + dy * dy <= 1;
}

function petGoBath() {
  const p = data.pet;
  if (p.phase !== 'hatched') return;
  if (p.asleep) { petSay('mid', '呼⋯⋯（睡著了）'); petRender(); return; }
  if (petBathing) return;
  pxWalkTo(PX_POND.x + 14, PX_POND.y + 8, () => {
    petBathing = { t: 0, dur: PET_BATH_SECONDS, start: p.needs.dirt };
    petFace = -1;
    petSay('right', petPick(['⋯⋯哈～水溫剛剛好。', '才、才不是喜歡泡澡呢。', petSp(p).bath]), 7000);
    petRender();
  });
}

// done = 泡完；false = 中途被叫走（只洗掉一部分）
function pxEndBath(done) {
  const p = data.pet;
  petBathing = null;
  p.pos = { x: PX_POND.x + 14, y: PX_POND.y + 8 };
  petAct((pp) => {
    petLog(done ? '在湖裡泡了個澡，乾乾淨淨' : '泡澡泡到一半就跑走了');
    if (done) petSay('left', '好舒服～全身香香的！');
  });
}

// ---------- 畫面 ----------
function pxDraw(ts) {
  const cv = document.getElementById('pet-canvas');
  if (!cv) return;
  // 黑白模式每格都要讀回像素，讓畫布走 CPU 才不會拖慢整頁
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  const p = data.pet;
  const hr = new Date().getHours();
  const night = hr >= 19 || hr < 6;
  const k = pxScale(p);
  const fk = pxFurnScale(p);
  c.drawImage(pxBackground(night), 0, 0);

  // 雲慢慢飄
  if (!night) for (let i = 0; i < 3; i++) pxCloud(c, ((i * 150 + ts / 1000 * (3 + i)) % (PX_W + 80)) - 40, 16 + i * 13);

  const ents = [];
  // 床
  const bed = pxSprite(`bed|${fk.toFixed(3)}`, petDrawBed, [-140, -110, 280, 114], fk);
  if (bed) ents.push({ y: PX_BED.y, draw: () => { c.drawImage(bed.canvas, Math.round(PX_BED.x - bed.ax), Math.round(PX_BED.y - bed.ay)); petHit.bed = pxBox(bed, PX_BED.x, PX_BED.y, 1); } });
  // 馬桶
  const tk = fk * 1.45;
  const toilet = pxSprite(`toilet|${tk.toFixed(3)}`, () => petDrawToilet(false), [-50, -116, 90, 120], tk);
  if (toilet) ents.push({ y: PX_TOILET.y, draw: () => { c.drawImage(toilet.canvas, Math.round(PX_TOILET.x - toilet.ax), Math.round(PX_TOILET.y - toilet.ay)); petHit.toilet = pxBox(toilet, PX_TOILET.x, PX_TOILET.y, 1); } });
  // 地上的髒亂
  petHit.mess = [];
  p.mess.forEach((m, i) => {
    ents.push({ y: m.y, draw: () => {
      if (m.t === 'pee') { pxEllipse(c, m.x, m.y, 7, 2, night ? '#9c9440' : '#e8d55a'); petHit.mess.push([m.x - 8, m.y - 4, m.x + 8, m.y + 4, i]); }
      else { pxMap(c, PX_POOP, { a: '#5b3a1f', b: '#8a6038' }, m.x - 3, m.y - 6); petHit.mess.push([m.x - 5, m.y - 8, m.x + 5, m.y + 2, i]); }
    } });
  });

  // 地上的食物和水
  (p.ground || []).forEach((g, i) => {
    if (!PET_ITEMS[g.id]) return;
    ents.push({ y: g.y, draw: () => {
      const spr = pxItemSprite(g.id);
      const hop = i === petEatTarget && !petEating ? Math.floor(ts / 250) % 2 : 0;   // 被盯上的那個會輕輕跳
      pxEllipse(c, g.x, g.y, 5, 1, 'rgba(0,0,0,0.18)');
      const left = g.left === undefined ? 1 : g.left;
      const sh = Math.max(1, Math.ceil(spr.w * left));   // 還剩下的高度
      c.drawImage(spr.canvas, 0, spr.w - sh, spr.w, sh, Math.round(g.x - spr.w / 2), Math.round(g.y - sh + 2 - hop), spr.w, sh);
    } });
  });

  // 龍
  const onToilet = !p.asleep && Date.now() < petToiletUntil;
  const inBath = !p.asleep && !!petBathing;
  const waterline = PX_POND.y - 1;
  const walking = !!petMove;
  const step = Math.floor(ts / 170) % 2;
  const leg = walking ? (step ? 1 : -1) : 0;
  const blink = !p.asleep && (ts % 4300) < 150;
  const spr = pxDragonSprite(p, blink, leg);
  let dx = p.pos.x, dy = p.pos.y, face = petFace;
  if (p.asleep) { dx = PX_BED.x - 8 * fk; dy = PX_BED.y - 36 * fk; face = 1; }
  else if (onToilet) { dx = PX_TOILET.x + 6 * k; dy = PX_TOILET.y - 40 * tk + 14 * k; face = 1; }
  else if (inBath) { dx = PX_POND.x; dy = waterline + petSp(p).bathDepth * k; }
  const bob = walking ? step : petEating ? Math.floor(ts / 180) % 2 : (p.asleep ? Math.floor(ts / 1600) % 2 : Math.floor(ts / 900) % 2);
  const sortY = p.asleep ? PX_BED.y + 1 : onToilet ? PX_TOILET.y + 1 : inBath ? PX_POND.y : dy;
  ents.push({ y: sortY, draw: () => {
    if (!spr) return;
    if (inBath) { c.save(); c.beginPath(); c.rect(0, 0, PX_W, waterline + 1); c.clip(); }
    if (!p.asleep && !onToilet && !inBath) pxEllipse(c, dx, dy, Math.max(3, Math.round(58 * k)), Math.max(1, Math.round(5 * k)), 'rgba(0,0,0,0.18)');
    const x = Math.round(dx), y = Math.round(dy) - bob;
    if (face < 0) {
      c.save(); c.translate(x, 0); c.scale(-1, 1);
      c.drawImage(spr.canvas, -Math.round(spr.ax), Math.round(y - spr.ay));
      c.restore();
    } else {
      c.drawImage(spr.canvas, Math.round(x - spr.ax), Math.round(y - spr.ay));
    }
    petHit.dragon = pxBox(spr, x, y, face);
    if (inBath) {
      c.restore();
      petHit.dragon[3] = Math.min(petHit.dragon[3], waterline);
      const t = ts / 1000;
      // 水波
      const ring = 8 + Math.floor((t * 6) % 6);
      for (let i = -ring; i <= ring; i += 2) pxRect(c, PX_POND.x + i, waterline + (Math.abs(i) > ring - 3 ? 1 : 0), 1, 1, '#e8f7ff');
      // 蒸氣
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.6 + i * 0.25) % 1;
        pxRect(c, PX_POND.x - 18 + i * 12 + Math.round(Math.sin(t * 3 + i) * 2), waterline - 4 - ph * 18, 1, 2, `rgba(255,255,255,${(1 - ph).toFixed(2)})`);
      }
      // 泡泡
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i * 0.33) % 1;
        pxRect(c, PX_POND.x - 10 + i * 9, waterline - ph * 6, 1, 1, '#ffffff');
      }
    }
    if (p.asleep) {
      const blanket = pxSprite(`blanket|${fk.toFixed(3)}`, petDrawBlanket, [-140, -110, 280, 114], fk);
      if (blanket) c.drawImage(blanket.canvas, Math.round(PX_BED.x - blanket.ax), Math.round(PX_BED.y - blanket.ay));
    }
    if (onToilet) {
      const front = pxSprite(`toiletf|${tk.toFixed(3)}`, () => petDrawToilet(true), [-50, -116, 90, 120], tk);
      if (front) c.drawImage(front.canvas, Math.round(PX_TOILET.x - front.ax), Math.round(PX_TOILET.y - front.ay));
      const t = Math.floor(ts / 200) % 3;
      pxRect(c, PX_TOILET.x + 22 * tk, PX_TOILET.y - 34 * tk - t * 2, 1, 2, '#6fc0ea');
      pxRect(c, PX_TOILET.x + 28 * tk, PX_TOILET.y - 30 * tk - ((t + 1) % 3) * 2, 1, 2, '#6fc0ea');
    }
  } });

  ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

  // 夜晚把地面和角色壓暗
  if (night) { c.fillStyle = 'rgba(12,18,52,0.38)'; c.fillRect(0, PX_HORIZON - 44, PX_W, PX_H); }

  // 睡覺 Zzz、生病汗滴
  const box = petHit.dragon;
  if (box && p.asleep) {
    for (let i = 0; i < 2; i++) {
      const t = ((ts / 1000 + i * 0.9) % 1.8) / 1.8;
      pxMap(c, PX_Z, { a: '#ffffff' }, box[2] - 6 + i * 6 + t * 4, box[1] - 2 - t * 14 - i * 4);
    }
  }
  if (box && p.sick && !p.asleep) {
    const t = Math.floor(ts / 300) % 4;
    pxRect(c, box[2] - 4, box[1] + 2 + t, 1, 2, '#9fd8ff');
    pxRect(c, box[0] + 4, box[1] + 4 + ((t + 2) % 4), 1, 2, '#9fd8ff');
  }

  // 特效：愛心、點擊落點
  const now = performance.now();
  petFx = petFx.filter((f) => now - f.t0 < 1200);
  for (const f of petFx) {
    const a = (now - f.t0) / 1200;
    if (f.kind === 'heart') pxMap(c, PX_HEART, { a: '#ff5c86' }, f.x, f.y - a * 22);
    else if (f.kind === 'crumb') { const t = (now - f.t0) / 1000; if (t < 0.6) pxRect(c, f.x + f.vx * t, f.y + Math.min(5, 40 * t * t - 8 * t), 1, 1, '#7a5a30'); }
    else if (f.kind === 'mark' && a < 0.5) { pxRect(c, f.x - 3, f.y, 7, 1, '#ffffff'); pxRect(c, f.x, f.y - 3, 1, 7, '#ffffff'); }
  }
  if (pxMono()) pxDither(c);
}

// 精靈圖在畫面上的判定框
function pxBox(spr, x, y, face) {
  const [bx0, by0, bx1, by1] = spr.bbox;
  const top = y - spr.ay + by0, bottom = y - spr.ay + by1;
  if (face < 0) return [x + spr.ax - bx1, top, x + spr.ax - bx0, bottom];
  return [x - spr.ax + bx0, top, x - spr.ax + bx1, bottom];
}

function pxLoop(ts) {
  requestAnimationFrame(pxLoop);
  if (!data.pet || data.pet.phase !== 'hatched' || !petPanelActive()) { petLastFrame = ts; return; }
  const dt = Math.min(0.1, (ts - petLastFrame) / 1000 || 0);
  petLastFrame = ts;
  pxUpdate(dt, ts);
  // 像素風不需要 60 格，每秒 20 格就好
  if (ts - petLastDraw >= 50) { petLastDraw = ts; pxDraw(ts); }
}

// ---------- 從背包拖到場景 ----------
let petDrag = null;   // { id, x0, y0, ghost }

function pxStartDrag(e, id) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  petDrag = { id, x0: e.clientX, y0: e.clientY, ghost: null };
  document.addEventListener('pointermove', pxDragMove);
  document.addEventListener('pointerup', pxDragEnd);
  document.addEventListener('pointercancel', pxDragCancel);
}

function pxDragMove(e) {
  if (!petDrag) return;
  if (!petDrag.ghost) {
    if (Math.hypot(e.clientX - petDrag.x0, e.clientY - petDrag.y0) < 4) return;
    const g = document.createElement('div');
    g.className = 'pet-drag-ghost';
    g.textContent = PET_ITEMS[petDrag.id].icon;
    document.body.appendChild(g);
    petDrag.ghost = g;
    document.body.classList.add('pet-dragging');
  }
  petDrag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  const cv = document.getElementById('pet-canvas');
  if (cv) cv.classList.toggle('drop-ok', pxPointOnCanvas(cv, e) !== null);
}

function pxPointOnCanvas(cv, e) {
  const r = cv.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  return { x: (e.clientX - r.left) * PX_W / r.width, y: (e.clientY - r.top) * PX_H / r.height };
}

function pxDragCancel() {
  if (petDrag && petDrag.ghost) petDrag.ghost.remove();
  petDrag = null;
  document.body.classList.remove('pet-dragging');
  const cv = document.getElementById('pet-canvas');
  if (cv) cv.classList.remove('drop-ok');
  document.removeEventListener('pointermove', pxDragMove);
  document.removeEventListener('pointerup', pxDragEnd);
  document.removeEventListener('pointercancel', pxDragCancel);
}

function pxDragEnd(e) {
  const drag = petDrag;
  pxDragCancel();
  if (!drag) return;
  if (!drag.ghost) { petToast(`把 ${PET_ITEMS[drag.id].icon}${PET_ITEMS[drag.id].name} 拖到場景的地上，牠會自己過去吃`); return; }
  const cv = document.getElementById('pet-canvas');
  const pt = cv && pxPointOnCanvas(cv, e);
  if (!pt) return;
  petDropItem(drag.id, pt.x, pt.y);
  petFx.push({ kind: 'mark', x: Math.round(pt.x), y: Math.round(petClamp(pt.y, PX_WALK.y0, PX_WALK.y1)), t0: performance.now() });
}

// ---------- 點擊 ----------
function pxOnClick(e) {
  const cv = e.currentTarget;
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * PX_W / r.width;
  const y = (e.clientY - r.top) * PX_H / r.height;
  const p = data.pet;
  const inBox = (b) => b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

  const mess = (petHit.mess || []).find(inBox);
  if (mess) {
    petAct((pp) => { pp.mess.splice(mess[4], 1); petLog('清掉地上的一灘'); });
    return;
  }
  if (inBox(petHit.dragon)) { if (p.asleep) petWake(); else petPat(); return; }
  if (inBox(petHit.bed)) { petGoBed(); return; }
  if (inBox(petHit.toilet)) { petGoToilet(); return; }
  if (pxInPond(x, y)) { petGoBath(); return; }
  if (y >= PX_WALK.y0 - 12) {
    if (p.asleep) { petSay('mid', 'Zzz⋯⋯（點牠或點床可以叫醒）'); petRender(); return; }
    if (Date.now() < petToiletUntil) return;
    pxWalkTo(x, y);
    petEatTarget = -1;
    petNextWander = performance.now() + 12000;
    petFx.push({ kind: 'mark', x: Math.round(x), y: Math.round(y), t0: performance.now() });
  }
}

// ---------- 介面 ----------
function petPanelActive() {
  const el = document.getElementById('panel-pet');
  return !!(el && el.classList.contains('active'));
}

function petToast(text) {
  let el = document.getElementById('pet-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pet-toast';
    el.className = 'pet-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(petToast._t);
  petToast._t = setTimeout(() => el.classList.remove('show'), 4000);
}

function petUrgent(p) {
  if (!p || p.phase !== 'hatched') return null;
  if (p.sick) return '生病';
  const n = p.needs;
  if (Math.max(n.bladder, n.bowel) >= 80) return '想上廁所';
  if (n.hunger >= 75) return '餓了';
  if (n.thirst >= 75) return '渴了';
  if (!p.asleep && n.fatigue >= 85) return '很累';
  if (p.mess.length) return '要清理';
  if (n.dirt >= 80) return '要洗澡';
  if (PET_NUTRIENTS.some((x) => p.nutrients[x.key] < 20)) return '營養不良';
  return null;
}

function petUpdateTabBadge() {
  const tab = document.querySelector('.tab[data-tab="pet"]');
  if (!tab || !data.pet) return;
  const u = petUrgent(data.pet);
  tab.textContent = '寵物';
  if (u) {
    const dot = document.createElement('span');
    dot.className = 'pet-tab-dot';
    dot.title = u;
    tab.appendChild(dot);
  }
}

function petFmtAge(ms) {
  const h = ms / 3600000;
  if (h < 24) return `${Math.floor(h)} 小時`;
  return `${Math.floor(h / 24)} 天 ${Math.floor(h % 24)} 小時`;
}

function petEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function petBar(label, value, mode) {
  // mode 'need'：越高越糟；'good'：越高越好
  const v = Math.round(value);
  const badness = mode === 'need' ? value : 100 - value;
  const cls = badness >= 75 ? 'bad' : badness >= 50 ? 'warn' : 'ok';
  return `<div class="pet-bar"><div class="pet-bar-label">${label}</div><div class="pet-bar-track"><div class="pet-bar-fill ${cls}" style="width:${v}%"></div></div><div class="pet-bar-val">${v}</div></div>`;
}

function petFxText(fx) {
  const names = { hunger: '飽足', thirst: '解渴', carb: '澱粉', protein: '蛋白質', fat: '脂肪', vitamin: '維生素', mineral: '金屬', health: '健康', growth: '成長' };
  return Object.entries(fx).map(([k, val]) => {
    if (k === 'cure') return '治病';
    if (k === 'hunger' || k === 'thirst') return val < 0 ? `${names[k]}+${-val}` : `${k === 'thirst' ? '口渴' : '飢餓'}+${val}`;
    return `${names[k]}+${val}`;
  }).join(' ');
}

function petRender() {
  const panel = document.getElementById('panel-pet');
  if (!panel || !data.pet) return;
  const p = data.pet;
  const now = Date.now();

  if (p.phase === 'choose') { petRenderChooser(panel); return; }

  const speech = petSpeech && petSpeech.until > now ? petSpeech : petAutoSpeech(p);

  // 畫布只建一次，之後只換文字資訊，畫面才不會閃
  if (!document.getElementById('pet-canvas')) {
    panel.innerHTML = `<div id="pet-head"></div>
      <div class="pet-main">
        <div class="pet-left">
          <div class="pet-stage"><canvas id="pet-canvas" class="pet-canvas" width="${PX_W}" height="${PX_H}"></canvas></div>
          <div class="pet-stage-bar">
            <p class="pet-note pet-stage-hint">點地面＝走過去・點床＝睡覺／叫醒・點馬桶＝上廁所・點牠＝摸摸・點湖＝泡澡・點便便＝清掉</p>
            <button class="pet-mode-btn" id="pet-mode-btn"></button>
          </div>
          <div id="pet-body"></div>
        </div>
        <aside class="pet-side" id="pet-side"></aside>
      </div>`;
    document.getElementById('pet-canvas').addEventListener('click', pxOnClick);
    document.getElementById('pet-mode-btn').addEventListener('click', () => {
      data.pet.mono = !pxMono();
      pxBgCache.key = '';
      persist();
      pxModeLabel();
    });
  }

  pxModeLabel();
  let head = '';
  let html = '';
  if (p.phase === 'egg') {
    const left = Math.max(0, p.hatchAt - now);
    const prog = petClamp((now - p.createdAt) / (p.hatchAt - p.createdAt), 0, 1);
    head += `<div class="panel-head"><h1>神秘的龍蛋</h1></div>`;
    html += `<div class="pet-speech">${petEsc(speech.text)}</div>`;
    html += `<div class="pet-card"><div class="pet-card-title">孵化進度</div>${petBar('孵化', prog * 100, 'good')}<p class="pet-note">大約再 ${Math.ceil(left / 60000)} 分鐘破殼。現在完成任務拿到的食物會先存起來。</p></div>`;
  } else {
    const st = petStage(p.growth);
    const lv = petLevel(p.growth);
    const lvProg = lv >= 100 ? 100 : (p.growth % 10) * 10;
    const g = p.growth / PET_GROWTH_MAX;
    const lengthCm = 25 + 575 * g;
    const weightKg = 1.2 + 798 * Math.pow(g, 1.6);
    const today = p.growthByDay[dateKey(new Date())] || 0;
    const { rate, limits } = petGrowthRate(p);
    const status = p.sick ? '🤒 生病中' : p.asleep ? '💤 睡覺中' : '☀️ 醒著';

    head += `<div class="panel-head"><h1 class="pet-name" id="pet-name" title="點一下改名">${petEsc(p.name || `${petSp(p).name}（點我取名）`)}</h1><span class="pet-chip">${st.name}・Lv ${lv}</span></div>`;
    if (!p.name || petRenaming) {
      head += `<div class="pet-naming"><input type="text" id="pet-name-input" maxlength="12" placeholder="幫牠取個名字" value="${petEsc(p.name)}"><button class="btn primary small" id="pet-name-save">取名</button></div>`;
    }
    html += `<div class="pet-speech"><b>${petEsc(petSpeaker(p, speech.head))}</b>${speech.head ? '：' : ''}${petEsc(speech.text)}</div>`;

    html += `<div class="pet-grid">`;
    html += `<div class="pet-card"><div class="pet-card-title">狀態 <span class="pet-sub">${status}・${petFmtAge(now - p.hatchedAt)}大</span></div>`;
    html += petBar('健康', p.health, 'good');
    for (const nd of PET_NEEDS) html += petBar(nd.label, p.needs[nd.key], 'need');
    html += `</div>`;

    html += `<div class="pet-card"><div class="pet-card-title">營養度</div>`;
    for (const n of PET_NUTRIENTS) html += petBar(n.label, p.nutrients[n.key], 'good');
    html += `<p class="pet-note">任何一項低於 20 就會停止長大。</p></div>`;
    html += `</div>`;

    html += `<div class="pet-card"><div class="pet-card-title">成長</div>
      <div class="pet-growth-row">
        <div><div class="pet-big">${p.growth.toFixed(2)}</div><div class="pet-sub">成長值 / ${PET_GROWTH_MAX}</div></div>
        <div><div class="pet-big">+${today.toFixed(2)}</div><div class="pet-sub">今天</div></div>
        <div><div class="pet-big">${lengthCm.toFixed(1)}<small> cm</small></div><div class="pet-sub">身長</div></div>
        <div><div class="pet-big">${weightKg.toFixed(1)}<small> kg</small></div><div class="pet-sub">體重</div></div>
      </div>
      ${petBar(`Lv ${lv} → ${Math.min(100, lv + 1)}`, lvProg, 'good')}
      <p class="pet-note">目前成長速度：每小時 +${rate.toFixed(3)}${limits.length ? `　<span class="pet-limit">受限：${petEsc(limits.join('、'))}</span>` : '　狀態完美'}</p>
      <p class="pet-note">下一階段：${(() => { const nx = petStages(p).find((s) => s.min > p.growth); return nx ? `${nx.name}（還差 ${(nx.min - p.growth).toFixed(1)}）` : '已是最終型態'; })()}</p>
    </div>`;
  }

  let side = '';
  // 商店
  const coins = p.coins || 0;
  const rec = petRecommend(p);
  side += `<div class="pet-card pet-shop"><div class="pet-card-title pet-shop-head">商店 <span class="pet-coins">🪙 ${coins}</span></div>`;
  side += `<p class="pet-note" style="margin:-4px 0 10px">完成一個任務 +${PET_COIN_PER_TASK}，全部完成再 +${PET_COIN_ALL_DONE}</p><div class="pet-shop-grid">`;
  for (const [id, price] of PET_SHOP) {
    const it = PET_ITEMS[id];
    const poor = coins < price;
    side += `<button class="pet-buy${it.cat === 'rare' ? ' rare' : ''}${poor ? ' poor' : ''}" data-buy="${id}" title="${petEsc(petFxText(it.fx))}">
      ${id === rec ? '<span class="pet-pick-rec">推薦</span>' : ''}
      <span class="pet-buy-icon">${it.icon}</span><span class="pet-buy-name">${it.name}</span><span class="pet-buy-price">🪙 ${price}</span></button>`;
  }
  side += `</div></div>`;

  // 背包
  const inv = Object.entries(p.inventory).filter(([id, n]) => n > 0 && PET_ITEMS[id]);
  const filters = [['all', '全部'], ['food', '食物'], ['water', '飲水'], ['supply', '補給'], ['rare', '稀有']];
  side += `<div class="pet-card" id="pet-inventory"><div class="pet-card-title">背包 <span class="pet-sub">拖到地上，牠會過去吃</span></div>`;
  side += `<div class="pet-filter">${filters.map(([k, l]) => `<button class="pet-filter-btn${petInvFilter === k ? ' active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>`;
  const shown = inv.filter(([id]) => petInvFilter === 'all' || PET_ITEMS[id].cat === petInvFilter);
  if (!shown.length) side += `<p class="pet-note">空空的。用金幣在上面的商店買吧。</p>`;
  side += `<div class="pet-inv">`;
  for (const [id, n] of shown) {
    const it = PET_ITEMS[id];
    side += `<button class="pet-item${it.cat === 'rare' ? ' rare' : ''}" data-item="${id}" title="${petEsc(petFxText(it.fx))}"><span class="pet-item-icon">${it.icon}</span><span class="pet-item-name">${it.name}</span><span class="pet-item-n">×${n}</span><span class="pet-item-fx">${petEsc(petFxText(it.fx))}</span></button>`;
  }
  side += `</div></div>`;

  // 金幣說明
  html += `<details class="pet-card pet-details"><summary class="pet-card-title">金幣怎麼賺、怎麼用</summary><ul class="pet-droplist">`;
  html += `<li>每完成一個每日任務 +${PET_COIN_PER_TASK} 🪙；當天任務全部完成再加碼 +${PET_COIN_ALL_DONE} 🪙</li>`;
  html += `<li>在右邊的商店用金幣買食物、水、補給和稀有道具，買到的東西放進背包</li>`;
  html += `<li>把背包裡的東西拖到地上，牠會自己走過去吃</li>`;
  html += `<li>大約每 3–4 小時照顧一次（一天 4–5 次）最剛好，一天大約要花 110 🪙</li>`;
  html += `</ul></details>`;

  // 重新開始
  html += `<details class="pet-card pet-details"><summary class="pet-card-title">重新開始</summary>
    <p class="pet-note" style="margin-top:0">換一隻寵物從頭養。金幣和背包會保留，現在的${petEsc(petSp(p).name)}${p.name ? `「${petEsc(p.name)}」` : ''}會離開。</p>
    <button class="btn small" id="pet-btn-restart">${petRestartArmed > Date.now() ? '確定要重新開始？再按一次' : '重新開始，選新的寵物'}</button></details>`;

  // 紀錄
  html += `<details class="pet-card pet-details"><summary class="pet-card-title">成長日記</summary><div class="pet-log">`;
  for (const e of p.log.slice(0, 30)) {
    const d = new Date(e.ts);
    html += `<div class="pet-log-row"><span class="pet-log-t">${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}</span>${petEsc(e.text)}</div>`;
  }
  html += `</div></details>`;

  const body = document.getElementById('pet-body');
  const openDetails = [...body.querySelectorAll('details')].map((d) => d.open);
  const headEl = document.getElementById('pet-head');
  // 正在打字取名時不要蓋掉輸入框
  const typing = document.activeElement && document.activeElement.id === 'pet-name-input';
  if (!typing) headEl.innerHTML = head;
  body.innerHTML = html;
  const sideEl = document.getElementById('pet-side');
  sideEl.innerHTML = side;
  body.querySelectorAll('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });

  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('pet-btn-restart', () => {
    if (petRestartArmed > Date.now()) { petRestart(); return; }
    petRestartArmed = Date.now() + 5000;   // 5 秒內再按一次才算數
    petRender();
    setTimeout(() => { if (petRestartArmed && petRestartArmed <= Date.now()) petRender(); }, 5100);
  });
  on('pet-name', () => { petRenaming = true; petRender(); const el = document.getElementById('pet-name-input'); if (el) el.focus(); });
  const saveName = () => {
    const val = document.getElementById('pet-name-input').value.trim();
    if (!val) return;
    petRenaming = false;
    petAct((pp) => { pp.name = val.slice(0, 12); petLog(`取名為「${pp.name}」`); });
  };
  on('pet-name-save', saveName);
  const nameInput = document.getElementById('pet-name-input');
  if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
  sideEl.querySelectorAll('.pet-buy').forEach((b) => b.addEventListener('click', () => petBuy(b.dataset.buy)));
  sideEl.querySelectorAll('.pet-filter-btn').forEach((b) => b.addEventListener('click', () => { petInvFilter = b.dataset.filter; petRender(); }));
  sideEl.querySelectorAll('.pet-item').forEach((b) => b.addEventListener('pointerdown', (e) => pxStartDrag(e, b.dataset.item)));
}

// 只在畫面需要時重畫，避免動畫每 30 秒被重設
// ---------- 開局選寵物 ----------
let petRestartArmed = 0;

function petRenderChooser(panel) {
  let html = `<div class="panel-head"><h1>選一隻寵物</h1></div>
    <p class="pet-note" style="margin:-8px 0 16px">從蛋開始養，照顧得好會一點一點長大。選了之後就不能換，除非重新開始。</p>
    <div class="pet-choose-grid">`;
  for (const [key, sp] of Object.entries(PET_SPECIES)) {
    html += `<div class="pet-card pet-choose">
      <canvas class="pet-choose-canvas" data-species="${key}" width="150" height="104"></canvas>
      <div class="pet-choose-name">${sp.name}</div>
      <div class="pet-choose-stages">${sp.stages[0]} → ${sp.stages[5]}</div>
      <p class="pet-note">${sp.desc}</p>
      <button class="btn primary" data-choose="${key}">就是牠</button>
    </div>`;
  }
  html += `</div>`;
  panel.innerHTML = html;
  // 預覽：畫成年前的樣子
  panel.querySelectorAll('.pet-choose-canvas').forEach((cv) => {
    const fake = { ...structuredClone(data.pet), species: cv.dataset.species, phase: 'hatched', growth: 520, asleep: false, sick: false,
      needs: { fatigue: 10, hunger: 10, thirst: 10, bladder: 10, bowel: 10, dirt: 10 } };
    const spr = pxSprite(`preview|${fake.species}`, () => petDrawPet(fake, { eyeK: 1.5 }).svg, [-215, -305, 410, 320], 0.3);
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const [bx0, by0, bx1, by1] = spr.bbox;
    const w = bx1 - bx0, h = by1 - by0;
    c.drawImage(spr.canvas, bx0, by0, w, h, Math.round((cv.width - w) / 2), Math.round(cv.height - h - 4), w, h);
  });
  panel.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => petChoose(b.dataset.choose)));
}

function petChoose(species) {
  const p = data.pet;
  p.species = species;
  p.phase = 'egg';
  p.createdAt = p.hatchAt = p.lastSim = Date.now();
  petSimulate();   // 直接破殼
  petLastStageKey = '';
  persist();
  petRender();
  petUpdateTabBadge();
}

function petRestart() {
  const old = data.pet;
  const p = petNewEgg();
  p.phase = 'choose';
  // 金幣、背包、今天已領過的任務獎勵、黑白設定都留著
  p.coins = old.coins || 0;
  p.inventory = old.inventory || {};
  p.rewarded = old.rewarded || {};
  p.bonusDays = old.bonusDays || {};
  if (old.mono !== undefined) p.mono = old.mono;
  data.pet = p;
  petRestartArmed = 0;
  petMove = null; petEating = null; petBathing = null;
  petLog(`告別了${petSp(old).name}${old.name ? `「${old.name}」` : ''}，重新開始`);
  persist();
  petRender();
  petUpdateTabBadge();
}

function petRenderIfChanged() {
  const p = data.pet;
  const key = [
    p.phase, p.asleep, p.sick, p.mess.length, Math.round(p.growth * 4),
    ...Object.values(p.needs).map((v) => Math.round(v)),
    ...Object.values(p.nutrients).map((v) => Math.round(v)),
    Math.round(p.health),
    petSpeech && petSpeech.until > Date.now() ? 1 : 0,
    p.coins || 0
  ].join('|');
  if (key === petLastStageKey) return;
  petLastStageKey = key;
  petRender();
}

async function petTick() {
  if (!data.pet) return;
  petSimulate();
  await persist();
  petUpdateTabBadge();
  if (petPanelActive()) petRenderIfChanged();
}

function petInit() {
  if (!data.pet) {
    data.pet = petNewEgg();
    data.pet.phase = 'choose';
  } else if (!data.pet.species && data.pet.phase !== 'choose') {
    data.pet.species = 'dragon';
  }
  // 舊版「待選獎勵」換成金幣
  if (data.pet.pendingPicks && data.pet.pendingPicks.length) {
    data.pet.coins = (data.pet.coins || 0) + data.pet.pendingPicks.length * PET_COIN_PER_TASK;
    petLog(`${data.pet.pendingPicks.length} 個還沒選的獎勵換成 ${data.pet.pendingPicks.length * PET_COIN_PER_TASK} 🪙`);
  }
  delete data.pet.pendingPicks;
  data.pet.coins = data.pet.coins || 0;
  // 舊版髒亂只有種類，補上位置
  data.pet.mess = data.pet.mess.map((m) => (typeof m === 'string' ? petMessAt(m) : m));
  if (!data.pet.pos) data.pet.pos = { x: 190, y: 184 };
  data.pet.ground = data.pet.ground || [];
  if (data.pet.needs.dirt === undefined) data.pet.needs.dirt = 10;
  // 還在孵的舊蛋直接破殼
  if (data.pet.phase === 'egg') data.pet.hatchAt = Math.min(data.pet.hatchAt, Date.now());
  petSimulate();
  persist();
  petUpdateTabBadge();
  setInterval(petTick, 30 * 1000);
  petNextWander = performance.now() + 4000;
  requestAnimationFrame(pxLoop);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) petTick(); });
}
