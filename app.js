const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const STORAGE_KEY = 'daily-routine-data';

function pad2(n) { return String(n).padStart(2, '0'); }

function timesInRange(startHHMM, endHHMM, stepMin) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const endTotal = eh * 60 + em;
  const out = [];
  for (let t = sh * 60 + sm; t <= endTotal; t += stepMin) {
    out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  }
  return out;
}

const WATER_GROUPS = {
  a: { days: [1, 2, 4], start: '07:10', end: '23:10' },
  b: { days: [0, 3, 5, 6], start: '08:10', end: '22:10' }
};

function buildWaterGroupTasks(groupKey) {
  const g = WATER_GROUPS[groupKey];
  return timesInRange(g.start, g.end, 120).map((hhmm) => ({
    id: `t10_${groupKey}_${hhmm.replace(':', '')}`,
    name: '喝水／水分攝取',
    time: hhmm,
    days: g.days,
    enabled: true
  }));
}

function buildAllWaterTasks() {
  return [...buildWaterGroupTasks('a'), ...buildWaterGroupTasks('b')];
}

const DEFAULT_TASKS = [
  { id: 't1', name: '起床', time: '07:10', days: [1, 2, 4], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't2', name: '起床', time: '08:10', days: [0, 3, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't3a', name: '伏地挺身10下、卷腹10下、深蹲10下（兩組）', time: '07:30', days: [1, 2, 4], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't3b', name: '伏地挺身10下、卷腹10下、深蹲10下（兩組）', time: '08:30', days: [0, 3, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't4', name: '健身1小時', time: null, days: [0, 1, 2, 3, 4, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't5', name: '讀學校書半小時', time: null, days: [0, 1, 2, 3, 4, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't6', name: '閱讀10頁書', time: null, days: [0, 1, 2, 3, 4, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't7a', name: '冥想10分鐘', time: '23:20', days: [1, 2, 4], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't7b', name: '冥想10分鐘', time: '23:50', days: [0, 3, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't8', name: '睡覺', time: '23:30', days: [1, 2, 4], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  { id: 't9', name: '睡覺', time: '00:00', days: [0, 3, 5, 6], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' },
  ...buildAllWaterTasks().map((t) => ({ ...t, createdAt: '2026-09-06T00:00:00.000Z' })),
  { id: 't11', name: '看盤／確認庫存部位', time: '09:00', days: [1, 2, 3, 4, 5], enabled: true, createdAt: '2026-09-06T00:00:00.000Z' }
];

const DEFAULT_DATA = {
  tasks: DEFAULT_TASKS,
  logs: {},
  review: {
    day: 1,
    time: '00:00',
    questions: [
      '這週的整體表現如何？',
      '哪件事做得好，值得繼續？',
      '哪件事沒做到，下週要調整什麼？'
    ],
    entries: []
  },
  fired: { tasks: {}, review: {} },
  seededExtraIds: [],
  appliedPatches: []
};

let data = null;
let editingTaskId = null; // null = 新增
let taskModalDays = new Set();


function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowHHMM() {
  const n = new Date();
  return `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
}

const LEGACY_NAME_FIXES = { t1: '起床', t2: '起床', t8: '睡覺', t9: '睡覺' };

const LEGACY_SPLIT_MIGRATIONS = {
  t3: [
    { id: 't3a', name: '伏地挺身10下、卷腹10下、深蹲10下（兩組）', time: '07:30', days: [1, 2, 4], enabled: true },
    { id: 't3b', name: '伏地挺身10下、卷腹10下、深蹲10下（兩組）', time: '08:30', days: [0, 3, 5, 6], enabled: true }
  ],
  t7: [
    { id: 't7a', name: '冥想10分鐘', time: '23:20', days: [1, 2, 4], enabled: true },
    { id: 't7b', name: '冥想10分鐘', time: '23:50', days: [0, 3, 5, 6], enabled: true }
  ],
  t10: buildAllWaterTasks(),
  t10a: buildWaterGroupTasks('a'),
  t10b: buildWaterGroupTasks('b')
};

const FIELD_PATCHES = [
  { key: 't11-weekday-9am', taskId: 't11', patch: { time: '09:00', days: [1, 2, 3, 4, 5] } }
];

const ADDITIVE_TASKS = [
  ...buildAllWaterTasks(),
  { id: 't11', name: '看盤／確認庫存部位', time: '09:00', days: [1, 2, 3, 4, 5], enabled: true }
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    const merged = {
      ...structuredClone(DEFAULT_DATA),
      ...parsed,
      review: { ...structuredClone(DEFAULT_DATA.review), ...(parsed.review || {}) },
      fired: { ...structuredClone(DEFAULT_DATA.fired), ...(parsed.fired || {}) }
    };
    for (const task of merged.tasks) {
      const fixedName = LEGACY_NAME_FIXES[task.id];
      if (fixedName) task.name = fixedName;
    }
    for (const [legacyId, replacements] of Object.entries(LEGACY_SPLIT_MIGRATIONS)) {
      const legacyIdx = merged.tasks.findIndex((t) => t.id === legacyId);
      if (legacyIdx !== -1) {
        merged.tasks.splice(legacyIdx, 1, ...replacements.map((r) => ({ ...r, createdAt: new Date().toISOString() })));
      }
    }
    merged.appliedPatches = merged.appliedPatches || [];
    for (const p of FIELD_PATCHES) {
      if (merged.appliedPatches.includes(p.key)) continue;
      const task = merged.tasks.find((t) => t.id === p.taskId);
      if (task) Object.assign(task, p.patch);
      merged.appliedPatches.push(p.key);
    }
    if (!merged.appliedPatches.includes('review-sunday-midnight')) {
      merged.review.day = 1;
      merged.review.time = '00:00';
      merged.appliedPatches.push('review-sunday-midnight');
    }
    merged.seededExtraIds = merged.seededExtraIds || [];
    for (const extra of ADDITIVE_TASKS) {
      const exists = merged.tasks.some((t) => t.id === extra.id);
      const alreadySeeded = merged.seededExtraIds.includes(extra.id);
      if (!exists && !alreadySeeded) {
        merged.tasks.push({ ...extra, createdAt: new Date().toISOString() });
      }
      if (!alreadySeeded) merged.seededExtraIds.push(extra.id);
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

async function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- Due-time checking (runs while the page is open) ----------
function showDueBanner(text) {
  const banner = document.getElementById('due-banner');
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(showDueBanner._t);
  showDueBanner._t = setTimeout(() => { banner.hidden = true; }, 15000);
}

function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch { /* Notifications API unavailable in this context */ }
  showDueBanner(`${title} — ${body}`);
}

function checkSchedule() {
  const now = new Date();
  const hhmm = nowHHMM();
  const today = dateKey(now);
  const dow = now.getDay();
  let changed = false;

  for (const task of data.tasks) {
    if (!task.enabled || task.time !== hhmm || !task.days.includes(dow)) continue;
    const fireKey = `${today}_${task.id}`;
    if (data.fired.tasks[fireKey]) continue;
    data.fired.tasks[fireKey] = true;
    changed = true;
    notify('該做這件事了', task.name);
    renderToday();
  }

  if (changed) persist();
}

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'pet') petRender();
    });
  });
}

// ---------- Today ----------
function renderToday() {
  const today = new Date();
  const dow = today.getDay();
  const todayKey = dateKey(today);
  const hhmm = nowHHMM();

  document.getElementById('today-title').textContent =
    `今日總覽 — ${today.getMonth() + 1}/${today.getDate()} 週${DAY_LABELS[dow]}`;

  const list = data.tasks
    .filter((t) => t.enabled && t.days.includes(dow))
    .slice()
    .sort((a, b) => {
      if (!a.time && !b.time) return a.name.localeCompare(b.name);
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

  const timeline = document.getElementById('today-timeline');
  timeline.innerHTML = '';
  document.getElementById('today-empty').hidden = list.length > 0;

  for (const task of list) {
    const done = !!(data.logs[todayKey] && data.logs[todayKey][task.id]);
    const overdue = !done && !!task.time && task.time < hhmm;

    const row = document.createElement('div');
    row.className = 'timeline-row' + (done ? ' done' : '');

    const check = document.createElement('button');
    check.className = 'timeline-check' + (done ? ' checked' : '');
    check.textContent = done ? '✓' : '';
    check.addEventListener('click', async () => {
      if (!data.logs[todayKey]) data.logs[todayKey] = {};
      data.logs[todayKey][task.id] = !done;
      if (!done) petOnTaskDone(task, todayKey);
      await persist();
      renderToday();
    });

    const time = document.createElement('div');
    time.className = 'timeline-time';
    time.textContent = task.time || '整天';

    const name = document.createElement('div');
    name.className = 'timeline-name';
    name.textContent = task.name;

    const badge = document.createElement('div');
    badge.className = 'timeline-badge' + (done ? ' done' : overdue ? ' overdue' : '');
    badge.textContent = done ? '已完成' : overdue ? '已過期' : '待完成';

    row.append(check, time, name, badge);
    timeline.appendChild(row);
  }
}

// ---------- Task management ----------
function renderTaskList() {
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  const sorted = data.tasks.slice().sort((a, b) => {
    if (!a.time && !b.time) return a.name.localeCompare(b.name);
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  document.getElementById('task-empty').hidden = sorted.length > 0;

  for (const task of sorted) {
    const row = document.createElement('div');
    row.className = 'task-row' + (task.enabled ? '' : ' disabled');
    row.addEventListener('click', () => openTaskModal(task.id));

    const time = document.createElement('div');
    time.className = 'task-row-time';
    time.textContent = task.time || '整天';

    const main = document.createElement('div');
    main.className = 'task-row-main';
    const name = document.createElement('div');
    name.className = 'task-row-name';
    name.textContent = task.name;
    const days = document.createElement('div');
    days.className = 'task-row-days';
    days.textContent = task.days.length === 7
      ? '每天'
      : task.days.slice().sort().map((d) => `週${DAY_LABELS[d]}`).join(' ');
    main.append(name, days);

    row.append(time, main);
    list.appendChild(row);
  }
}

function buildDayPicker(container, selectedDays, onToggle) {
  container.innerHTML = '';
  for (let d = 0; d < 7; d++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'day-chip' + (selectedDays.has(d) ? ' active' : '');
    chip.textContent = DAY_LABELS[d];
    chip.addEventListener('click', () => {
      if (selectedDays.has(d)) selectedDays.delete(d);
      else selectedDays.add(d);
      chip.classList.toggle('active');
      onToggle();
    });
    container.appendChild(chip);
  }
}

function openTaskModal(taskId) {
  editingTaskId = taskId;
  const modal = document.getElementById('task-modal-backdrop');
  const title = document.getElementById('task-modal-title');
  const nameInput = document.getElementById('task-name');
  const timeInput = document.getElementById('task-time');
  const noTimeInput = document.getElementById('task-no-time');
  const enabledInput = document.getElementById('task-enabled');
  const deleteBtn = document.getElementById('btn-delete-task');

  if (taskId) {
    const task = data.tasks.find((t) => t.id === taskId);
    title.textContent = '編輯任務';
    nameInput.value = task.name;
    timeInput.value = task.time || '07:00';
    noTimeInput.checked = !task.time;
    timeInput.disabled = !task.time;
    enabledInput.checked = task.enabled;
    taskModalDays = new Set(task.days);
    deleteBtn.hidden = false;
  } else {
    title.textContent = '新增任務';
    nameInput.value = '';
    timeInput.value = '07:00';
    noTimeInput.checked = false;
    timeInput.disabled = false;
    enabledInput.checked = true;
    taskModalDays = new Set([0, 1, 2, 3, 4, 5, 6]);
    deleteBtn.hidden = true;
  }

  noTimeInput.onchange = () => { timeInput.disabled = noTimeInput.checked; };

  buildDayPicker(document.getElementById('task-days'), taskModalDays, () => {});
  modal.hidden = false;
  nameInput.focus();
}

function closeTaskModal() {
  document.getElementById('task-modal-backdrop').hidden = true;
  editingTaskId = null;
}

async function saveTaskFromModal() {
  const name = document.getElementById('task-name').value.trim();
  const noTime = document.getElementById('task-no-time').checked;
  const time = noTime ? null : document.getElementById('task-time').value;
  const enabled = document.getElementById('task-enabled').checked;

  if (!name) { alert('請輸入任務名稱'); return; }
  if (!noTime && !time) { alert('請設定提醒時間，或勾選不指定時間'); return; }
  if (taskModalDays.size === 0) { alert('請至少選擇一個重複日'); return; }

  const days = Array.from(taskModalDays).sort();

  if (editingTaskId) {
    const task = data.tasks.find((t) => t.id === editingTaskId);
    task.name = name;
    task.time = time;
    task.enabled = enabled;
    task.days = days;
  } else {
    data.tasks.push({
      id: Date.now().toString(),
      name, time, enabled, days,
      createdAt: new Date().toISOString()
    });
  }

  await persist();
  closeTaskModal();
  renderTaskList();
  renderToday();
}

async function deleteTaskFromModal() {
  if (!editingTaskId) return;
  if (!confirm('確定要刪除這個任務嗎？')) return;
  data.tasks = data.tasks.filter((t) => t.id !== editingTaskId);
  await persist();
  closeTaskModal();
  renderTaskList();
  renderToday();
}

// ---------- Notifications ----------
function updateNotifyStatus() {
  const el = document.getElementById('notify-status');
  if (typeof Notification === 'undefined') {
    el.textContent = '此瀏覽器不支援通知';
    el.className = 'notify-status';
    return;
  }
  if (Notification.permission === 'granted') {
    el.textContent = '已啟用';
    el.className = 'notify-status granted';
  } else if (Notification.permission === 'denied') {
    el.textContent = '已被封鎖，需到瀏覽器網站設定手動開啟';
    el.className = 'notify-status denied';
  } else {
    el.textContent = '尚未啟用';
    el.className = 'notify-status';
  }
}

async function enableNotifications() {
  try {
    if (typeof Notification !== 'undefined') await Notification.requestPermission();
  } catch { /* Notifications API unavailable in this context */ }
  updateNotifyStatus();
}

function testNotify() {
  if (typeof Notification === 'undefined') {
    alert('這個瀏覽器不支援系統通知（Notification API）。');
    return;
  }
  if (Notification.permission !== 'granted') {
    alert('還沒有通知授權，請先點「啟用系統通知」。目前狀態：' + Notification.permission);
    return;
  }
  try {
    new Notification('測試通知', {
      body: '如果你有看到這則通知，代表設定沒問題。'
    });
  } catch (err) {
    alert(
      '瀏覽器同意授權了，但建立通知時失敗：\n' + err.message +
      '\n\n這通常代表 macOS「系統設定 > 通知」裡把這個瀏覽器（或這個安裝好的App）的通知關掉了，需要去那邊手動打開。'
    );
  }
}

// ---------- Init ----------
async function init() {
  data = loadData();
  petInit();
  updateNotifyStatus();
  document.getElementById('btn-enable-notify').addEventListener('click', enableNotifications);
  document.getElementById('btn-test-notify').addEventListener('click', testNotify);

  setupTabs();
  petRender();
  renderToday();
  renderTaskList();

  document.getElementById('btn-add-task').addEventListener('click', () => openTaskModal(null));
  document.getElementById('btn-cancel-task').addEventListener('click', closeTaskModal);
  document.getElementById('btn-save-task').addEventListener('click', saveTaskFromModal);
  document.getElementById('btn-delete-task').addEventListener('click', deleteTaskFromModal);

  checkSchedule();
  setInterval(checkSchedule, 20 * 1000);
  setInterval(renderToday, 30 * 1000);
}

init();
