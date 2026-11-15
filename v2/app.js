/* Baseline v2. Same localStorage keys and the same GitHub contents write as index.html.
   This file does not register a service worker. */
(function () {
  const L = window.HRVLogic;
  const GH_OWNER = 'Altroad';
  const GH_REPO = 'HRV-Tracker';
  const GH_PAT_KEY = 'hrv_github_pat';
  const GH_USER_KEY = 'hrv_github_user';
  const STORAGE_KEY = 'hrv_readings_v2';
  const BACKUP_KEY = 'hrv_readings_backup';
  const LAST_RESULT_KEY = 'hrv_last_result_v1';

  const S = blank();
  let nextId = 1;
  let removed = new Set();
  let ghFileSha = null;
  let remoteReady = false;
  let remoteHadReadings = false;
  let remoteMissing = false;
  let previewMode = false;
  let previewName = '';
  let offline = false;
  let loadError = '';
  let chartRange = 14;
  let chartMetric = 'hrv';
  let chartFocus = null;
  let journalAll = false;
  let journalQuery = '';
  let chartHits = [];
  let saveTimer = null;
  let _saveInFlight = null;
  let _saveAgain = false;

  function blank() {
    return {
      readings: [], dayTags: {}, feelData: {}, rhrData: {}, rhrNotes: {},
      rrData: {}, rrBaseline: null, rrBaselineSetDate: null,
      tempData: {}, tempBaseline: null, tempBaselineSetDate: null,
      workoutData: {}, lastResult: null,
    };
  }
  function resetMemory() {
    const b = blank();
    Object.keys(S).forEach(k => { S[k] = b[k]; });
    nextId = 1;
  }
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getGHToken = () => { try { return localStorage.getItem(GH_PAT_KEY); } catch { return null; } };
  const getGHUser = () => { try { return localStorage.getItem(GH_USER_KEY); } catch { return null; } };
  const getGHPath = () => { const u = getGHUser(); return u ? `data/${u}.json` : 'data/readings.json'; };
  const userKey = (scoped, plain) => { const u = getGHUser(); return u ? scoped.replace('{u}', u) : plain; };
  const getRhrKey = () => userKey('hrv_rhr_{u}_v1', 'hrv_rhr_v1');
  const getFeelKey = () => userKey('hrv_feel_{u}_v1', 'hrv_feel_v1');
  const getDayTagsKey = () => userKey('hrv_day_tags_{u}_v1', 'hrv_day_tags_v1');
  const getRemovedKey = () => userKey('hrv_removed_{u}_v1', 'hrv_removed_v1');
  const getRhrNotesKey = () => userKey('hrv_rhr_notes_{u}_v1', 'hrv_rhr_notes_v1');
  const getRrKey = () => userKey('hrv_resp_rate_{u}_v1', 'hrv_resp_rate_v1');
  const getTempKey = () => userKey('hrv_wrist_temp_{u}_v1', 'hrv_wrist_temp_v1');
  const getRrBaselineKey = () => userKey('hrv_rr_baseline_{u}_v1', 'hrv_rr_baseline_v1');
  const getTempBaselineKey = () => userKey('hrv_temp_baseline_{u}_v1', 'hrv_temp_baseline_v1');
  const getTempBaselineDateKey = () => userKey('hrv_temp_baseline_date_{u}_v1', 'hrv_temp_baseline_date_v1');
  const getWorkoutKey = () => userKey('hrv_workout_{u}_v1', 'hrv_workout_v1');
  const getLastResultKey = () => userKey('hrv_last_result_{u}_v1', LAST_RESULT_KEY);
  const newId = () => nextId++;
  const todayISO = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  };
  const cssVar = (name, el) => getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function canWrite() {
    return !previewMode && !offline && remoteReady && !!getGHToken();
  }

  function decodeMojibake(v) {
    if (typeof v !== 'string') return v;
    for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) > 255) return v;
    try {
      const bytes = Uint8Array.from(v, c => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return v; }
  }

  function loadRemoved() {
    try { return new Set(JSON.parse(localStorage.getItem(getRemovedKey()) || '[]')); } catch { return new Set(); }
  }
  const isRemoved = r => removed.has(`${r.id}|${r.date}`);
  function dropReadings(pred) {
    const gone = S.readings.filter(pred);
    if (!gone.length) return;
    gone.forEach(r => removed.add(`${r.id}|${r.date}`));
    try { localStorage.setItem(getRemovedKey(), JSON.stringify([...removed].slice(-300))); } catch {}
    S.readings = S.readings.filter(r => !pred(r));
  }

  function loadLocalMaps() {
    const read = (key, apply) => {
      try { const raw = localStorage.getItem(key); if (raw) apply(JSON.parse(raw)); } catch { /* keep current */ }
    };
    read(getRhrKey(), v => { if (v && typeof v === 'object') S.rhrData = v; });
    read(getRhrNotesKey(), v => { if (v && typeof v === 'object') S.rhrNotes = v; });
    read(getRrKey(), v => { if (v && typeof v === 'object') S.rrData = v; });
    read(getFeelKey(), v => { if (v && typeof v === 'object') S.feelData = v; });
    read(getDayTagsKey(), v => { if (v && typeof v === 'object') S.dayTags = v; });
    read(getTempKey(), v => { if (v && typeof v === 'object') S.tempData = v; });
    read(getWorkoutKey(), v => { if (v && typeof v === 'object') S.workoutData = v; });
    try {
      const b = JSON.parse(localStorage.getItem(getRrBaselineKey()) || 'null');
      if (b) { S.rrBaseline = b.value ?? null; S.rrBaselineSetDate = b.date ?? null; }
    } catch {}
    try {
      const raw = localStorage.getItem(getTempBaselineKey());
      if (raw != null && raw !== '') S.tempBaseline = parseFloat(raw) || null;
    } catch {}
    try {
      const raw = localStorage.getItem(getTempBaselineDateKey());
      if (raw) S.tempBaselineSetDate = raw;
    } catch {}
    try {
      const raw = localStorage.getItem(getLastResultKey());
      if (raw) S.lastResult = JSON.parse(raw);
    } catch {}
  }
  function loadReadingsFromLocal() {
    try {
      let best = [];
      for (const key of ['hrv_readings', STORAGE_KEY, BACKUP_KEY]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed[0]?.hrv && parsed.length > best.length) best = parsed;
      }
      if (!best.length) return false;
      S.readings = best.map(r => ({ ...r, id: r.id ?? newId() }));
      nextId = Math.max(...S.readings.map(r => Number(r.id) || 0)) + 1;
      return true;
    } catch { return false; }
  }

  function saveJSON(key, value) {
    if (previewMode) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function saveReadings() {
    if (previewMode) return;
    try {
      const data = JSON.stringify(S.readings);
      localStorage.setItem(STORAGE_KEY, data);
      localStorage.setItem(BACKUP_KEY, data);
    } catch {}
  }
  function saveRHR() {
    saveJSON(getRhrKey(), S.rhrData);
    saveJSON(getRhrNotesKey(), S.rhrNotes);
  }
  function saveFeel() { saveJSON(getFeelKey(), S.feelData); }
  function saveDayTags() { saveJSON(getDayTagsKey(), S.dayTags); }
  function saveRR() {
    saveJSON(getRrKey(), S.rrData);
    if (!previewMode && S.rrBaseline != null) {
      try { localStorage.setItem(getRrBaselineKey(), JSON.stringify({ value: S.rrBaseline, date: S.rrBaselineSetDate })); } catch {}
    }
  }
  function saveTemp() {
    saveJSON(getTempKey(), S.tempData);
    if (!previewMode && S.tempBaseline != null) {
      try { localStorage.setItem(getTempBaselineKey(), String(S.tempBaseline)); } catch {}
    }
    if (!previewMode && S.tempBaselineSetDate) {
      try { localStorage.setItem(getTempBaselineDateKey(), S.tempBaselineSetDate); } catch {}
    }
  }
  function saveWorkout() { saveJSON(getWorkoutKey(), S.workoutData); }
  function saveAllLocal() {
    saveReadings(); saveRHR(); saveFeel(); saveDayTags(); saveRR(); saveTemp(); saveWorkout();
  }

  function addKcalItem(date, item) {
    const current = S.workoutData[date];
    if (Array.isArray(current)) S.workoutData[date] = [...current, item];
    else if (current) S.workoutData[date] = [{ name: 'Activity', kcal: current }, item];
    else S.workoutData[date] = [item];
  }

  /* Fold tags that were logged on a day before it had an HRV reading. */
  function foldDay(date, entry) {
    const t = S.dayTags[date];
    if (!L.hasTags(t)) return;
    if (!entry.tag && t.tag) entry.tag = t.tag;
    const extras = L.orderedExtras([...(entry.extras || []), ...(t.extras || [])]);
    if (extras) entry.extras = extras;
    if (!L.ectopyOf(entry) && L.ectopyOf(t)) entry.ectopy = t.ectopy;
    S.dayTags[date] = {};
  }

  function absorb(data, { persist, filterRemoved }) {
    const obj = data && !Array.isArray(data);
    const raw = Array.isArray(data) ? data : (data.readings ?? []);
    let list = raw.map(r => ({ ...r, id: r.id ?? newId() }));
    if (filterRemoved) list = list.filter(r => !isRemoved(r));
    S.readings = list;
    if (S.readings.length) nextId = Math.max(nextId, ...S.readings.map(r => Number(r.id) || 0)) + 1;
    const remoteRhr = obj && data.rhr ? data.rhr : {};
    const remoteNotes = obj && data.rhrNotes ? data.rhrNotes : {};
    const remoteTemp = obj && data.temp ? data.temp : {};
    const remoteWorkout = obj && data.workout ? data.workout : {};
    const remoteRr = obj && data.rr ? data.rr : {};
    S.rhrData = { ...remoteRhr, ...S.rhrData };
    S.rhrNotes = { ...remoteNotes, ...S.rhrNotes };
    S.rrData = { ...remoteRr, ...S.rrData };
    S.dayTags = { ...(obj && data.dayTags || {}), ...S.dayTags };
    S.feelData = { ...(obj && data.feel || {}), ...S.feelData };
    if (obj && data.rrBaseline != null) {
      S.rrBaseline = data.rrBaseline;
      S.rrBaselineSetDate = data.rrBaselineSetDate || null;
    }
    S.tempData = { ...remoteTemp, ...S.tempData };
    if (obj && data.tempBaseline != null) {
      S.tempBaseline = data.tempBaseline;
      S.tempBaselineSetDate = data.tempBaselineSetDate || null;
    }
    S.workoutData = { ...remoteWorkout, ...S.workoutData };
    if (obj && data.lastResult) {
      try {
        const fixed = Object.fromEntries(Object.entries(data.lastResult).map(([k, v]) => [k, decodeMojibake(v)]));
        S.lastResult = fixed;
        if (persist) localStorage.setItem(getLastResultKey(), JSON.stringify(fixed));
      } catch {}
    }
    if (persist) { saveRHR(); saveFeel(); saveDayTags(); saveRR(); saveTemp(); saveWorkout(); }
  }

  async function ghRequest(method, body, path) {
    const token = getGHToken();
    if (!token) return null;
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path || getGHPath()}`;
    const opts = {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);
    try { return await fetch(url, opts); } catch (e) { console.error('ghRequest', e); return null; }
  }

  async function loadFromGitHub() {
    const res = await ghRequest('GET');
    if (!res) return { ok: false, status: 0 };
    if (res.status === 404) {
      remoteMissing = true;
      remoteReady = true;
      remoteHadReadings = false;
      ghFileSha = null;
      offline = false;
      return { ok: true, empty: true };
    }
    if (!res.ok) return { ok: false, status: res.status };
    let file;
    try { file = await res.json(); } catch { return { ok: false, status: res.status }; }
    let data;
    try {
      const text = L.decodeContent(file.content);
      data = JSON.parse(text);
    } catch { return { ok: false, status: res.status }; }
    ghFileSha = file.sha;
    absorb(data, { persist: true, filterRemoved: true });
    const raw = Array.isArray(data) ? data : (data.readings || []);
    remoteHadReadings = raw.length > 0;
    remoteReady = true;
    remoteMissing = false;
    offline = false;
    return { ok: true };
  }

  function mergeRemoteMaps(data) {
    const obj = data && !Array.isArray(data);
    const remoteRhr = obj && data.rhr ? data.rhr : {};
    const remoteNotes = obj && data.rhrNotes ? data.rhrNotes : {};
    const remoteTemp = obj && data.temp ? data.temp : {};
    const remoteWorkout = obj && data.workout ? data.workout : {};
    const remoteRr = obj && data.rr ? data.rr : {};
    S.rhrData = { ...remoteRhr, ...S.rhrData };
    S.rhrNotes = { ...remoteNotes, ...S.rhrNotes };
    S.rrData = { ...remoteRr, ...S.rrData };
    S.dayTags = { ...(obj && data.dayTags || {}), ...S.dayTags };
    S.feelData = { ...(obj && data.feel || {}), ...S.feelData };
    S.tempData = { ...remoteTemp, ...S.tempData };
    S.workoutData = { ...remoteWorkout, ...S.workoutData };
    if (S.tempBaseline == null && obj && data.tempBaseline != null) {
      S.tempBaseline = data.tempBaseline;
      S.tempBaselineSetDate = data.tempBaselineSetDate || null;
    }
    if (S.rrBaseline == null && obj && data.rrBaseline != null) {
      S.rrBaseline = data.rrBaseline;
      S.rrBaselineSetDate = data.rrBaselineSetDate || null;
    }
  }

  async function mergeRemoteChanges() {
    const res = await ghRequest('GET');
    if (!res || !res.ok) return false;
    const file = await res.json();
    ghFileSha = file.sha;
    try {
      const data = JSON.parse(L.decodeContent(file.content));
      const raw = Array.isArray(data) ? data : (data.readings ?? []);
      const remoteReadings = raw.map(r => ({ ...r, id: r.id ?? newId() }));
      const { merged, maxId } = L.mergeReadings(remoteReadings, S.readings, isRemoved);
      S.readings = merged;
      nextId = Math.max(nextId, maxId + 1);
      mergeRemoteMaps(data);
      saveAllLocal();
      return true;
    } catch { return false; }
  }

  async function saveToGitHub() {
    if (previewMode || !getGHToken()) return false;
    if (!remoteReady) { toast('Not synced — reload before saving'); return false; }
    if (_saveInFlight) { _saveAgain = true; return _saveInFlight; }
    _saveInFlight = (async () => {
      let ok;
      do { _saveAgain = false; ok = await putToGitHub(); } while (_saveAgain);
      return ok;
    })();
    try { return await _saveInFlight; } finally { _saveInFlight = null; }
  }

  async function putToGitHub(attempt = 0) {
    if (previewMode || !getGHToken() || !remoteReady) return false;
    if (remoteHadReadings && S.readings.length === 0) {
      toast('Refusing to replace your history with an empty log');
      return false;
    }
    if (remoteHadReadings && !ghFileSha) {
      toast('Sync paused — reload before saving');
      return false;
    }
    let lastResult = null;
    try {
      const raw = localStorage.getItem(getLastResultKey());
      if (raw) lastResult = JSON.parse(raw);
    } catch {}
    const payload = L.buildPayload(S, lastResult);
    const body = { message: 'Update HRV readings', content: L.encodeContent(payload) };
    if (ghFileSha) body.sha = ghFileSha;
    const res = await ghRequest('PUT', body);
    if (res && res.ok) {
      try {
        const data = await res.json();
        ghFileSha = data.content && data.content.sha;
        remoteHadReadings = S.readings.length > 0;
        remoteMissing = false;
      } catch {}
      toast('Saved');
      return true;
    }
    if (res && (res.status === 409 || res.status === 422) && attempt === 0) {
      if (await mergeRemoteChanges()) return putToGitHub(1);
    }
    if (!res && attempt === 0) {
      await new Promise(r => setTimeout(r, 2000));
      return putToGitHub(1);
    }
    const status = res ? `HTTP ${res.status}` : 'network error';
    toast(`GitHub save failed (${status})`);
    return false;
  }

  function readingFor(date) {
    return S.readings.filter(r => r.date === date).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] || null;
  }

  function paintThemeIcon() {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    $('themeIcon').innerHTML = light
      ? '<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>'
      : '<circle cx="12" cy="12" r="4"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.4 5.4l1.3 1.3M17.3 17.3l1.3 1.3M18.6 5.4l-1.3 1.3M6.7 17.3l-1.3 1.3"/>';
    $('themeBtn').setAttribute('aria-label', light ? 'Switch to dark' : 'Switch to light');
  }
  function paintAccount() {
    const btn = $('accountBtn');
    const user = getGHUser();
    if (previewMode) {
      btn.textContent = 'P';
      btn.classList.remove('on');
      btn.setAttribute('aria-label', 'Account. Preview is read only');
      return;
    }
    if (user && getGHToken()) {
      btn.textContent = user.slice(0, 1).toUpperCase();
      btn.classList.add('on');
      btn.setAttribute('aria-label', `Account, signed in as ${user}`);
    } else {
      btn.classList.remove('on');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5 19.2c1.4-3 3.8-4.4 7-4.4s5.6 1.4 7 4.4"/></svg>';
      btn.setAttribute('aria-label', 'Sign in');
    }
  }
  function paintSync() {
    const btn = $('syncBtn');
    const show = !previewMode && !!getGHToken();
    btn.hidden = !show;
  }

  function setTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('hrv_v2_theme', next); } catch {}
    const meta = $('themeColor');
    if (meta) meta.content = next === 'light' ? '#f3eee4' : '#090b10';
    paintThemeIcon();
    drawChart();
  }

  function bannerHTML() {
    if (previewMode) return `<strong>Read-only preview</strong> of data/${esc(previewName)}.json. Nothing on this page is saved.`;
    if (offline) return `<strong>Offline copy.</strong> GitHub didn’t answer, so saving is turned off.`;
    if (remoteMissing) return `<strong>No file yet</strong> for this username. Logging a night creates data/${esc(getGHUser() || 'user')}.json.`;
    return '';
  }

  function pillsHTML(r, feel) {
    if (!r && !feel) return '';
    const bits = [];
    if (r && r.tag) {
      const c = (L.TAGS.find(t => t.label === r.tag) || {}).color || 'var(--muted)';
      bits.push(`<span class="pill" style="--c:${c}">${esc(r.tag)}</span>`);
    }
    (r && r.extras || []).forEach(x => {
      const c = (L.EXTRAS.find(t => t.label === x) || {}).color;
      if (c) bits.push(`<span class="pill" style="--c:${c}">${esc(x)}</span>`);
    });
    const g = L.ectopyOf(r);
    if (g) bits.push(`<span class="pill" style="--c:${g.color}">${esc(g.label)}</span>`);
    if (feel) bits.push(`<span class="pill" style="--c:${feel.color}">Feel ${feel.v}</span>`);
    return bits.length ? `<div class="pills">${bits.join('')}</div>` : '';
  }

  function captureCells(html) {
    if (!html || typeof html !== 'string') return [];
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('.calc-cell')].map(el => ({
        t: el.querySelector('.calc-cell-t')?.textContent?.trim() || '',
        v: el.querySelector('.calc-cell-v')?.textContent?.trim() || '',
        kind: el.classList.contains('deep') ? 'deep' : 'core',
        dropped: el.classList.contains('dropped'),
      })).filter(c => c.v);
    } catch { return []; }
  }
  function fmtMins(m) {
    if (m == null || Number.isNaN(m)) return '—';
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return h > 0 ? `${h}h ${r}m` : `${r}m`;
  }
  function captureHTML(sum) {
    const last = S.lastResult;
    if (!last || !last.savedAt) return '';
    let nums = null;
    let stages = null;
    try { nums = typeof last.sleepNums === 'string' ? JSON.parse(last.sleepNums) : last.sleepNums; } catch {}
    try { stages = typeof last.sleepStages === 'string' ? JSON.parse(last.sleepStages) : last.sleepStages; } catch {}
    const cells = captureCells(last.readings);
    let bar = '';
    if (stages && stages.segs && stages.winEnd > stages.winStart) {
      const span = stages.winEnd - stages.winStart;
      bar = `<div class="sleep-track" aria-hidden="true">${stages.segs.map(seg => {
        const left = ((seg.start - stages.winStart) / span) * 100;
        const width = Math.max(0.4, ((seg.end - seg.start) / span) * 100);
        const kind = ['deep', 'core', 'rem'].includes(seg.type) ? seg.type : 'core';
        return `<i class="${kind}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i>`;
      }).join('')}</div>`;
    }
    const legend = nums ? `<div class="sleep-legend">
      <span>Asleep <b>${fmtMins(nums.total)}</b></span>
      <span>Deep <b>${fmtMins(nums.deep)}</b></span>
      <span>Core <b>${fmtMins(nums.core)}</b></span>
      <span>REM <b>${fmtMins(nums.rem)}</b></span>
    </div>` : '';
    const chips = cells.length ? `<div class="chip-row">${cells.map(c =>
      `<span class="chip ${c.kind}${c.dropped ? ' dropped' : ''}"><span class="t">${esc(c.t)}</span><span class="n">${esc(c.v)}</span></span>`
    ).join('')}</div>` : '';
    const when = last.savedAt === (sum.morning || '') ? 'This morning' : L.fmtDay(last.savedAt);
    return `<section class="block" id="capture">
      <div class="section-h"><h2>Overnight capture</h2><span>${esc(when)}</span></div>
      ${bar}${legend}
      ${last.windowInfo ? `<p class="hint" style="margin:0 0 8px">${esc(last.windowInfo)}</p>` : ''}
      ${chips}
      ${cells.some(c => c.dropped) ? '<p class="hint" style="margin:8px 0 0">Struck readings were trimmed from the average.</p>' : ''}
    </section>`;
  }

  function zoneClass(zone, kind) {
    if (!zone) return '';
    if (kind === 'rhr') {
      if (zone === 'Excellent') return 'tone-excellent';
      if (zone === 'Good') return 'tone-rhr-good';
      if (zone === 'Elevated') return 'tone-elevated';
      return 'tone-low';
    }
    if (kind === 'rr' || kind === 'temp') {
      if (zone === 'Low') return 'tone-cool';
      if (zone === 'Elevated') return 'tone-elevated';
      if (zone === 'High') return 'tone-low';
      return '';
    }
    if (kind === 'kcal') {
      if (zone === 'Low') return 'tone-cool';
      if (zone === 'High') return 'tone-highkcal';
      if (zone === 'Extreme') return 'tone-low';
      return '';
    }
    return '';
  }

  function journalDates() {
    const set = new Set(S.readings.map(r => r.date));
    Object.keys(S.dayTags).forEach(d => { if (L.hasTags(S.dayTags[d])) set.add(d); });
    Object.keys(S.rhrData).forEach(d => set.add(d));
    Object.keys(S.rrData).forEach(d => set.add(d));
    Object.keys(S.tempData).forEach(d => set.add(d));
    return [...set].sort().reverse();
  }
  function rowMatch(date, q) {
    if (!q) return true;
    const r = L.tagsForDate(S, date);
    const feel = L.FEEL[S.feelData[date]];
    const blob = [
      date, L.fmtDay(date), readingFor(date)?.hrv, readingFor(date)?.note,
      r?.tag, ...(r?.extras || []), L.ectopyOf(r)?.label, feel?.label, S.rhrData[date],
    ].filter(v => v != null && v !== '').join(' ').toLowerCase();
    return blob.includes(q.toLowerCase());
  }
  function journalRows() {
    const dates = journalDates().filter(d => rowMatch(d, journalQuery));
    const shown = journalAll || journalQuery ? dates : dates.slice(0, 12);
    if (!shown.length) return '<p class="hint">No nights match.</p>';
    return shown.map(date => {
      const r = readingFor(date) || L.tagsForDate(S, date);
      const hrv = readingFor(date)?.hrv;
      const band = hrv == null ? null : L.bandOf(hrv);
      const feel = L.FEEL[S.feelData[date]];
      const note = readingFor(date)?.note || S.rhrNotes[date] || '';
      const meta = [];
      if (r && r.tag) meta.push(`<span class="mini" style="--c:${(L.TAGS.find(t => t.label === r.tag) || {}).color || 'var(--muted)'}">${esc(r.tag)}</span>`);
      (r && r.extras || []).forEach(x => {
        const c = (L.EXTRAS.find(t => t.label === x) || {}).color;
        if (c) meta.push(`<span class="mini" style="--c:${c}">${esc(x)}</span>`);
      });
      const g = L.ectopyOf(r);
      if (g) meta.push(`<span class="mini" style="--c:${g.color}">${esc(g.label)}</span>`);
      if (feel) meta.push(`<span class="mini" style="--c:${feel.color}">${esc(feel.label)}</span>`);
      if (S.rhrData[date] != null) meta.push(`<span class="mini">${S.rhrData[date]} bpm</span>`);
      return `<button class="j-row" type="button" data-date="${esc(date)}">
        <span class="j-date">${esc(L.fmtLong(date))}</span>
        <span class="j-hrv ${band ? 'tone-' + band.id : ''}">${hrv == null ? '—' : hrv}</span>
        ${meta.length ? `<span class="j-meta">${meta.join('')}</span>` : ''}
        ${note ? `<span class="j-note">${esc(note)}</span>` : ''}
      </button>`;
    }).join('') + (!journalQuery && dates.length > 12
      ? `<button class="more" id="moreBtn" type="button">${journalAll ? 'Show recent nights' : `Earlier nights · ${dates.length - 12}`}</button>`
      : '');
  }

  function homeHTML(sum) {
    const band = sum.band;
    const feel = sum.feel;
    const d = sum.fromPrev;
    const delta = d == null ? '' : `<p class="delta"><b>${d > 0 ? '▲' : d < 0 ? '▼' : '→'} ${Math.abs(Math.round(d))}</b> from ${sum.prev ? L.fmtDay(sum.prev.date) : 'the night before'} · ${Math.abs(sum.vsBase)} ${sum.vsBase < 0 ? 'below' : sum.vsBase > 0 ? 'above' : 'at'} baseline</p>`;
    const r = sum.reading;
    const stat = (k, v, s, tone) => `<div class="stat"><div class="k">${k}</div><div class="v ${tone || ''}">${v}</div><div class="s">${s}</div></div>`;
    const vital = (k, v, s, tone) => `<div class="vital"><div class="k">${k}</div><div class="v ${tone || ''}">${v}</div><div class="s">${s}</div></div>`;
    const rhr = sum.rhr;
    const rr = sum.rr;
    const temp = sum.temp;
    const kcal = sum.kcal;
    const metrics = [
      ['hrv', 'HRV'], ['rhr', 'RHR'], ['rr', 'RR'], ['temp', 'Temp'], ['kcal', 'Kcal'],
    ];
    return `
      <section class="hero" id="hero">
        <div class="date-row">
          <h1>${esc(L.fmtLong(sum.morning))}</h1>
          ${feel ? `<div class="feel" style="--c:${feel.color}">${esc(feel.label)} · ${feel.v}</div>` : ''}
        </div>
        <div class="hero-gauge" role="img" aria-label="HRV ${sum.latest.hrv} milliseconds, ${band.name} band ${band.range}">
          ${gaugeSVG(sum.latest.hrv)}
          <div class="hero-readout">
            <div class="hero-num" id="heroNum">${sum.latest.hrv}</div>
            <div class="hero-unit">${esc(band.name)} · ms</div>
          </div>
        </div>
        ${delta}
        <div class="bands" aria-hidden="true">
          ${['low', 'ok', 'good', 'high'].map(id => {
            const spec = { low: ['Low', '<59'], ok: ['OK', '59–75'], good: ['Good', '75–90'], high: ['High', '90+'] }[id];
            return `<div class="band${band.id === id ? ' on' : ''}" style="--c:var(--${id})"><b>${spec[0]}</b><small>${spec[1]}</small></div>`;
          }).join('')}
        </div>
        ${pillsHTML(r, null)}
        ${r && r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
        ${sum.status ? `<p class="status">${esc(sum.status.message)}</p>` : ''}
        <div class="stats">
          ${stat('Baseline', sum.baseline.value, sum.baseline.label, 'tone-' + L.bandOf(sum.baseline.value).id)}
          ${stat('3-day', sum.avg3 ?? '—', sum.avg3 == null ? '' : `${sum.avg3 - sum.baseline.value > 0 ? '+' : '−'}${Math.abs(sum.avg3 - sum.baseline.value)} vs base`, sum.band3 ? 'tone-' + sum.band3.id : '')}
          ${stat('7-day', sum.avg7 ?? '—', sum.avg7 == null ? '' : `${sum.avg7 - sum.baseline.value > 0 ? '+' : '−'}${Math.abs(sum.avg7 - sum.baseline.value)} vs base`, sum.band7 ? 'tone-' + sum.band7.id : '')}
          ${stat('Trend', sum.trend ? sum.trend.glyph : '—', sum.trend ? sum.trend.label : '', sum.trend ? (sum.trend.id === 'down' ? 'tone-low' : sum.trend.id === 'up' ? 'tone-high' : '') : '')}
        </div>
        <div class="vitals">
          ${vital('Resting HR', rhr ? rhr.value : '—', rhr ? `${rhr.delta > 0 ? '+' : ''}${rhr.delta} · ${rhr.zone}` : 'No reading', zoneClass(rhr && rhr.zone, 'rhr'))}
          ${vital('Breathing', rr ? rr.value.toFixed(1) : '—', rr && rr.dev != null ? `${L.fmtRrDev(rr.dev)} · ${rr.zone}` : (rr ? 'Building a baseline' : 'No reading'), zoneClass(rr && rr.zone, 'rr'))}
          ${vital('Wrist temp', temp ? temp.value.toFixed(2) + '°' : '—', temp && temp.dev != null ? `${L.fmtTempDev(temp.dev)} · ${temp.zone}` : 'No reading', zoneClass(temp && temp.zone, 'temp'))}
          ${vital('Load', kcal && kcal.value ? Math.round(kcal.value).toLocaleString('en-GB') : '—', kcal && kcal.value ? `${L.fmtDay(kcal.date)} · ${kcal.zone}` : 'No activity', zoneClass(kcal && kcal.zone, 'kcal'))}
        </div>
      </section>
      ${captureHTML(sum)}
      <section class="block" id="chartCard">
        <div class="section-h"><h2>Trend</h2><span id="chartCaption"></span></div>
        <div class="chart-card">
          <div class="chart-bar">
            <button class="seg${chartRange === 14 ? ' on' : ''}" type="button" data-range="14">14D</button>
            <button class="seg${chartRange === 60 ? ' on' : ''}" type="button" data-range="60">60D</button>
          </div>
          <div class="metrics">
            ${metrics.map(([id, label]) => `<button class="seg${chartMetric === id ? ' on' : ''}" type="button" data-metric="${id}">${label}</button>`).join('')}
          </div>
          <div class="chart-wrap">
            <canvas id="chart" aria-label="Trend chart"></canvas>
            <div class="tip" id="tip" hidden></div>
          </div>
          <div class="legend"><span><i></i>Night</span><span><i class="roll"></i>7-day</span><span><i class="dash"></i>Baseline</span></div>
        </div>
      </section>
      <section class="block" id="journal">
        <div class="section-h"><h2>Nights</h2><button class="seg" id="logBtn" type="button">Log a night</button></div>
        <input class="j-search" id="q" type="search" placeholder="Search notes, tags, ectopy" value="${esc(journalQuery)}" enterkeyhint="search" autocomplete="off">
        <div id="journalList">${journalRows()}</div>
      </section>
      <footer class="foot">
        Same username, same token, same <span style="font-family:DM Mono,monospace">data/&lt;user&gt;.json</span> file as the classic app.
        Writes use its GitHub save, including the file version and merge.
        <br><a href="index.html">Open the classic app</a>
      </footer>`;
  }

  function gaugeSVG(value) {
    const CX = 100, CY = 108, R = 78;
    const A0 = Math.PI * 0.75;
    const SWEEP = Math.PI * 1.5;
    const GAP = 0.05;
    const tOf = v => Math.max(0, Math.min(1, (v - 40) / 70));
    const edges = [0, tOf(59), tOf(75), tOf(90), 1];
    const ids = ['low', 'ok', 'good', 'high'];
    const active = L.bandOf(value).id;
    const pt = a => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
    const arc = (t1, t2) => {
      const a1 = A0 + SWEEP * t1 + GAP / 2;
      const a2 = A0 + SWEEP * t2 - GAP / 2;
      const [x1, y1] = pt(a1);
      const [x2, y2] = pt(a2);
      const large = a2 - a1 > Math.PI ? 1 : 0;
      return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    };
    const a = A0 + SWEEP * tOf(value);
    const [dx, dy] = pt(a);
    return `<svg viewBox="8 20 184 162" aria-hidden="true">
      <g fill="none" stroke-width="12" stroke-linecap="round">${ids.map((id, i) => `<path d="${arc(edges[i], edges[i + 1])}" class="seg-${id}${id === active ? ' on' : ''}"/>`).join('')}</g>
      <circle class="dot" cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="6.5"/>
    </svg>`;
  }

  function render() {
    paintAccount();
    paintSync();
    const sum = S.readings.length ? L.summarize(S) : null;
    document.body.dataset.band = sum && sum.band ? sum.band.id : '';
    const y = window.scrollY;
    const banner = bannerHTML();
    $('banner').hidden = !banner;
    $('banner').innerHTML = banner;
    if (!sum) {
      const user = getGHUser();
      const signed = !!(user && getGHToken() && !previewMode);
      const canLog = signed && remoteReady && !loadError;
      $('app').innerHTML = `<section class="gate">
        <h1>Baseline</h1>
        <p>${signed
          ? `Signed in as ${esc(user)}. ${remoteMissing ? 'Nothing has been logged under that name yet.' : canLog ? 'Log a night when you’re ready.' : 'The classic app uses this same sign-in.'}`
          : 'A quieter look at the same nights. Sign in with the username and GitHub token you already use. A session on the classic app is a session here.'}</p>
        ${loadError ? `<p class="err">${esc(loadError)}</p>` : ''}
        <button class="btn primary" id="gateSign" type="button">${canLog ? 'Log a night' : signed ? 'Account' : 'Sign in'}</button>
      </section>`;
      $('app').dataset.ready = '0';
      return;
    }
    $('app').innerHTML = homeHTML(sum);
    $('app').dataset.ready = '1';
    const q = $('q');
    if (q && document.activeElement === q) { /* focus restored below if needed */ }
    window.scrollTo(0, y);
    drawChart();
    requestAnimationFrame(() => drawChart());
  }

  function pointColor(metric, v, date) {
    if (metric === 'hrv') return cssVar('--' + L.bandOf(v).id);
    if (metric === 'rhr') {
      const z = L.rhrZone(v, L.rhrBaselineOf(S.rhrData).value);
      if (z === 'Excellent') return cssVar('--excellent');
      if (z === 'Good') return cssVar('--rhr-good');
      if (z === 'Elevated') return cssVar('--rhr-elevated');
      return cssVar('--low');
    }
    if (metric === 'rr') {
      const base = L.rrBaselineFor(S.rrData, S.rrBaseline, S.rrBaselineSetDate, date);
      const z = L.rrZone(base == null ? null : v - base);
      if (z === 'Low') return cssVar('--cool');
      if (z === 'Elevated') return cssVar('--rhr-elevated');
      if (z === 'High') return cssVar('--low');
      return cssVar('--good');
    }
    if (metric === 'temp') {
      const base = L.effectiveTemp(S.tempData, S.tempBaseline, S.tempBaselineSetDate);
      const z = L.tempZone(base == null ? null : v - base);
      if (z === 'High') return cssVar('--low');
      if (z === 'Low') return cssVar('--cool');
      return cssVar('--temp');
    }
    const z = L.kcalZone(v, L.kcalBaselineOf(S.workoutData).value);
    if (z === 'Low') return cssVar('--cool');
    if (z === 'High') return cssVar('--rhr-elevated');
    if (z === 'Extreme') return cssVar('--low');
    return cssVar('--good');
  }

  function smooth(ctx, pts) {
    if (pts.length < 2) return;
    const n = pts.length;
    const d = [];
    const m = new Array(n);
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      d.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-6) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n - 1; i++) {
      const dx = (pts[i + 1].x - pts[i].x) / 3;
      ctx.bezierCurveTo(pts[i].x + dx, pts[i].y + m[i] * dx, pts[i + 1].x - dx, pts[i + 1].y - m[i + 1] * dx, pts[i + 1].x, pts[i + 1].y);
    }
  }

  function drawChart() {
    const canvas = $('chart');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const all = L.series(S, chartMetric);
    const points = all.slice(-chartRange);
    const cap = $('chartCaption');
    if (cap) cap.textContent = points.length ? `${L.fmtDay(points[0].date)} – ${L.fmtDay(points.at(-1).date)}` : '';
    chartHits = [];
    const tip = $('tip');
    if (!points.length) {
      if (tip) tip.hidden = true;
      ctx.fillStyle = cssVar('--faint');
      ctx.font = '13px "DM Sans", sans-serif';
      ctx.fillText('No data in this range', 16, 28);
      return;
    }
    const pad = { l: 36, r: 10, t: 14, b: 22 };
    const rollAll = L.rolling(all, 7).slice(-chartRange);
    const basePts = chartMetric === 'rr'
      ? points.map(p => ({ date: p.date, v: L.rrBaselineFor(S.rrData, S.rrBaseline, S.rrBaselineSetDate, p.date) })).filter(p => p.v != null)
      : (() => {
          const v = L.referenceLine(S, chartMetric, points.at(-1).date);
          return v == null ? [] : points.map(p => ({ date: p.date, v }));
        })();
    const values = points.map(p => p.v).concat(rollAll.map(p => p.v), basePts.map(p => p.v));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (chartMetric === 'hrv') { min = Math.min(min, 59); max = Math.max(max, 90); }
    const span = max - min || 1;
    min -= span * 0.12;
    max += span * 0.14;
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const t0 = Date.parse(points[0].date + 'T12:00:00Z');
    const t1 = Date.parse(points.at(-1).date + 'T12:00:00Z');
    const xOf = date => {
      if (t1 === t0) return pad.l + plotW / 2;
      const t = Date.parse(date + 'T12:00:00Z');
      return pad.l + ((t - t0) / (t1 - t0)) * plotW;
    };
    const yOf = v => pad.t + (1 - (v - min) / (max - min)) * plotH;
    const ink = cssVar('--ink');
    const faint = cssVar('--faint');
    const line = cssVar('--line');

    if (chartMetric === 'hrv') {
      const bands = [[-Infinity, 59, '--low'], [59, 75, '--ok'], [75, 90, '--good'], [90, Infinity, '--high']];
      bands.forEach(([a, b, key]) => {
        const y1 = yOf(Math.min(max, Math.max(min, b)));
        const y2 = yOf(Math.min(max, Math.max(min, a)));
        ctx.fillStyle = cssVar(key);
        ctx.globalAlpha = 0.08;
        ctx.fillRect(pad.l, Math.min(y1, y2), plotW, Math.abs(y2 - y1));
        ctx.globalAlpha = 1;
      });
    }

    ctx.font = '10px "DM Mono", monospace';
    ctx.fillStyle = faint;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const v = min + ((max - min) * i) / 2;
      const y = yOf(v);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      const label = chartMetric === 'rr' ? v.toFixed(1) : chartMetric === 'temp' ? v.toFixed(1) : Math.round(v).toString();
      ctx.fillText(label, pad.l - 6, y);
    }

    const toXY = list => list.map(p => ({ ...p, x: xOf(p.date), y: yOf(p.v) }));
    const xy = toXY(points);
    const roll = toXY(rollAll);
    const base = toXY(basePts);

    if (xy.length > 1) {
      ctx.save();
      smooth(ctx, xy);
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
      grad.addColorStop(0, cssVar('--glow', document.body) || ink);
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = 'transparent';
      ctx.lineTo(xy.at(-1).x, pad.t + plotH);
      ctx.lineTo(xy[0].x, pad.t + plotH);
      ctx.closePath();
      ctx.globalAlpha = document.documentElement.getAttribute('data-theme') === 'light' ? 0.18 : 0.28;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      smooth(ctx, xy);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (roll.length > 1) {
      smooth(ctx, roll);
      ctx.strokeStyle = faint;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (base.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      smooth(ctx, base);
      ctx.strokeStyle = faint;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    xy.forEach((p, i) => {
      if (chartMetric === 'hrv' && chartRange <= 14) {
        const temp = S.tempData[p.date];
        const rr = S.rrData[p.date];
        if (temp != null) {
          const baseT = L.effectiveTemp(S.tempData, S.tempBaseline, S.tempBaselineSetDate);
          const z = L.tempZone(baseT == null ? null : temp - baseT);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2);
          ctx.strokeStyle = z === 'High' ? cssVar('--low') : z === 'Low' ? cssVar('--cool') : cssVar('--temp');
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (rr != null) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.6, 0, Math.PI * 2);
          ctx.strokeStyle = pointColor('rr', rr, p.date);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, chartRange > 14 ? 2.4 : 3.3, 0, Math.PI * 2);
      ctx.fillStyle = pointColor(chartMetric, p.v, p.date);
      ctx.fill();
      if (chartFocus === i) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, chartRange > 14 ? 6 : 8, 0, Math.PI * 2);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      chartHits.push(p);
    });

    ctx.fillStyle = faint;
    ctx.font = '10px "DM Mono", monospace';
    ctx.textBaseline = 'top';
    const xLabels = [xy[0], xy[Math.floor((xy.length - 1) / 2)], xy.at(-1)];
    xLabels.forEach((p, i) => {
      if (!p) return;
      const last = i === xLabels.length - 1;
      ctx.textAlign = i === 0 ? 'left' : last ? 'right' : 'center';
      const x = i === 0 ? pad.l : last ? w - pad.r : p.x;
      ctx.fillText(L.fmtDay(p.date), x, h - 14);
    });

    if (tip) {
      if (chartFocus == null || !xy[chartFocus]) tip.hidden = true;
      else {
        const p = xy[chartFocus];
        const unit = { hrv: ' ms', rhr: ' bpm', rr: '', temp: '°', kcal: ' kcal' }[chartMetric];
        const shown = chartMetric === 'temp' ? p.v.toFixed(2) : chartMetric === 'rr' ? p.v.toFixed(1) : Math.round(p.v).toLocaleString('en-GB');
        let extra = '';
        if (chartMetric === 'hrv') {
          const bits = [];
          if (S.rhrData[p.date] != null) bits.push(`RHR ${S.rhrData[p.date]}`);
          if (S.rrData[p.date] != null) bits.push(`RR ${Number(S.rrData[p.date]).toFixed(1)}`);
          if (S.tempData[p.date] != null) bits.push(`${Number(S.tempData[p.date]).toFixed(2)}°`);
          const kcal = L.getKcalTotal(S.workoutData, L.prevDay(p.date));
          if (kcal) bits.push(`${Math.round(kcal).toLocaleString('en-GB')} kcal`);
          if (bits.length) extra = `<br><span style="color:var(--muted)">${esc(bits.join(' · '))}</span>`;
        }
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(shown)}${unit}</b><br>${esc(L.fmtDay(p.date))}${extra}`;
        const alignRight = p.x > w * 0.58;
        tip.style.transform = alignRight ? 'translate(-100%, -120%)' : 'translate(0, -120%)';
        tip.style.left = (alignRight ? Math.min(w - 8, p.x) : Math.max(8, p.x - 8)) + 'px';
        tip.style.top = Math.max(28, p.y) + 'px';
      }
    }
  }

  function onChartPointer(e) {
    const canvas = $('chart');
    if (!canvas || !chartHits.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let best = null;
    let bestD = 30;
    chartHits.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) { best = i; bestD = d; }
    });
    chartFocus = best;
    drawChart();
  }

  function closeSheet() {
    $('sheetRoot').replaceChildren();
    document.body.style.overflow = '';
  }
  function openSheet(el) {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.appendChild(el);
    back.addEventListener('click', ev => { if (ev.target === back) closeSheet(); });
    $('sheetRoot').replaceChildren(back);
    document.body.style.overflow = 'hidden';
    return back;
  }
  function confirmChoice(title, body, yes, no) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'sheet-back';
      back.innerHTML = `<div class="confirm" role="dialog" aria-modal="true">
        <h2 style="margin:0;font-size:22px;letter-spacing:-0.04em">${esc(title)}</h2>
        <p>${esc(body)}</p>
        <div class="btn-row">
          <button class="btn ghost" type="button" data-no>${esc(no)}</button>
          <button class="btn primary" type="button" data-yes>${esc(yes)}</button>
        </div>
      </div>`;
      const done = v => { back.remove(); resolve(v); };
      back.querySelector('[data-no]').onclick = () => done(false);
      back.querySelector('[data-yes]').onclick = () => done(true);
      back.addEventListener('click', ev => { if (ev.target === back) done(false); });
      $('sheetRoot').appendChild(back);
    });
  }

  function choice(group, value, label, color, on) {
    return `<button type="button" class="choice${on ? ' on' : ''}" data-group="${group}" data-value="${esc(value)}" style="--c:${color}">${esc(label)}</button>`;
  }

  function openAccount() {
    const user = getGHUser() || '';
    const token = getGHToken() || '';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="grab"></div>
      <h2>Account</h2>
      <p class="sub">Letters and numbers only. The token stays in this browser under the same keys as the classic app, and it needs repo access so nights can sync.</p>
      <label class="field"><span class="k">Username</span><input id="fUser" autocomplete="username" value="${esc(user)}" placeholder="daniel"></label>
      <label class="field"><span class="k">GitHub token</span><input id="fToken" type="password" autocomplete="off" value="${esc(token)}" placeholder="ghp_…"></label>
      <div class="btn-row" style="margin-bottom:10px">
        <button class="btn ghost" type="button" id="showToken">Show</button>
        <button class="btn ghost" type="button" id="testToken">Test</button>
      </div>
      <p class="hint" id="testOut" style="min-height:16px;margin:0 0 12px"></p>
      <div class="sheet-actions">
        ${user && token && !previewMode ? '<button class="btn ghost" type="button" id="signOut">Sign out</button>' : '<button class="btn ghost" type="button" id="sheetClose">Close</button>'}
        <button class="btn primary" type="button" id="signIn">Save &amp; sync</button>
      </div>`;
    openSheet(sheet);
    sheet.querySelector('#showToken').onclick = () => {
      const input = sheet.querySelector('#fToken');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      sheet.querySelector('#showToken').textContent = show ? 'Hide' : 'Show';
    };
    sheet.querySelector('#sheetClose')?.addEventListener('click', closeSheet);
    sheet.querySelector('#testToken').onclick = async () => {
      const out = sheet.querySelector('#testOut');
      const pat = sheet.querySelector('#fToken').value.trim();
      if (!pat) { out.textContent = 'Enter a token first'; return; }
      out.textContent = 'Testing…';
      try {
        const res = await fetch('https://api.github.com/user', {
          mode: 'cors', credentials: 'omit',
          headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        });
        if (res.ok) {
          const u = await res.json();
          out.textContent = `Token valid — ${u.login}`;
        } else out.textContent = `Token rejected (HTTP ${res.status})`;
      } catch (e) { out.textContent = `Network error — ${e.message}`; }
    };
    sheet.querySelector('#signIn').onclick = () => signIn(sheet.querySelector('#fUser').value, sheet.querySelector('#fToken').value);
    sheet.querySelector('#signOut')?.addEventListener('click', async () => {
      const ok = await confirmChoice('Sign out on this device?', 'The classic app signs out too. Nights already in the repo stay there.', 'Sign out', 'Cancel');
      if (!ok) return;
      try {
        localStorage.removeItem(GH_PAT_KEY);
        localStorage.removeItem(GH_USER_KEY);
      } catch {}
      resetMemory();
      ghFileSha = null;
      remoteReady = false;
      remoteHadReadings = false;
      offline = false;
      loadError = '';
      closeSheet();
      render();
    });
    setTimeout(() => sheet.querySelector('#fUser').focus(), 50);
  }

  async function signIn(rawUser, rawToken) {
    const user = String(rawUser || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const token = String(rawToken || '').trim();
    if (!user) { toast('Enter a username'); return; }
    if (!token) { toast('Enter a token'); return; }
    if (previewMode) { toast('Leave the preview to sign in'); return; }
    try {
      localStorage.setItem(GH_USER_KEY, user);
      localStorage.setItem(GH_PAT_KEY, token);
    } catch { toast('This browser blocked storage'); return; }
    resetMemory();
    removed = loadRemoved();
    ghFileSha = null;
    remoteReady = false;
    loadError = '';
    closeSheet();
    $('app').innerHTML = '<p class="note">Syncing…</p>';
    const result = await loadFromGitHub();
    if (!result.ok) {
      offline = false;
      remoteReady = false;
      loadError = result.status === 401 || result.status === 403
        ? `GitHub rejected the token (HTTP ${result.status}).`
        : result.status ? `Could not load data/${user}.json (HTTP ${result.status}).` : 'Could not reach GitHub.';
      if (loadReadingsFromLocal()) offline = true;
    }
    render();
    if (result.ok) toast(result.empty ? `No file yet for ${user}` : `Synced as ${user}`);
  }

  async function pull() {
    if (previewMode || !getGHToken() || _saveInFlight || saveTimer) return;
    const btn = $('syncBtn');
    btn.classList.add('spin');
    const result = await loadFromGitHub();
    btn.classList.remove('spin');
    if (!result.ok) {
      loadError = result.status ? `Reload failed (HTTP ${result.status}).` : 'Could not reach GitHub.';
      toast(loadError);
    } else {
      loadError = '';
      toast(result.empty ? 'No file in the repo yet' : 'Reloaded');
    }
    render();
  }

  function openLog(date) {
    const reading = readingFor(date);
    const tags = L.tagsForDate(S, date) || {};
    const feel = S.feelData[date];
    const activity = L.prevDay(date);
    const kcalNow = L.getKcalTotal(S.workoutData, activity);
    const tempPrefill = S.tempData[date] == null ? '' : Number(S.tempData[date]).toFixed(2);
    const rrPrefill = S.rrData[date] == null ? '' : (Math.abs(S.rrData[date] - Math.round(S.rrData[date])) < 1e-6 ? String(Math.round(S.rrData[date])) : Number(S.rrData[date]).toFixed(1));
    const note = reading?.note || (!reading ? (S.rhrNotes[date] || '') : '');
    const writable = canWrite();
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const ectopyVal = tags.ectopy === undefined || tags.ectopy === null ? '' : String(tags.ectopy);
    sheet.innerHTML = `<div class="grab"></div>
      <h2>${reading ? 'Edit night' : 'Log a night'}</h2>
      <p class="sub">${writable ? 'Saves with the same GitHub write as the classic app. Removing a night stays over there.' : 'Read only here — sign in on a loaded file to save.'}</p>
      <label class="field"><span class="k">Date</span><input id="fDate" type="date" value="${esc(date)}" ${writable ? '' : 'disabled'}></label>
      <div class="grid-2">
        <label class="field"><span class="k">HRV</span><input id="fHrv" inputmode="numeric" value="${reading ? reading.hrv : ''}" placeholder="ms" ${writable ? '' : 'disabled'}></label>
        <label class="field"><span class="k">RHR</span><input id="fRhr" inputmode="numeric" value="${S.rhrData[date] ?? ''}" placeholder="bpm" ${writable ? '' : 'disabled'}></label>
        <label class="field"><span class="k">Breathing</span><input id="fRr" inputmode="decimal" value="${esc(rrPrefill)}" placeholder="breaths/min" ${writable ? '' : 'disabled'}></label>
        <label class="field"><span class="k">Temp</span><input id="fTemp" inputmode="decimal" value="${esc(tempPrefill)}" placeholder="°C" ${writable ? '' : 'disabled'}></label>
      </div>
      <label class="field"><span class="k">Note</span><textarea id="fNote" ${writable ? '' : 'disabled'}>${esc(note)}</textarea></label>
      <div class="field"><span class="k">Training</span><div class="choices" id="tagChoices">
        ${L.TAGS.map(t => choice('tag', t.label, t.label, t.color, tags.tag === t.label)).join('')}
      </div></div>
      <div class="field"><span class="k">Also</span><div class="choices">
        ${L.EXTRAS.map(t => choice('extra', t.label, t.label, t.color, !!(tags.extras || []).includes(t.label))).join('')}
      </div></div>
      <div class="field"><span class="k">Ectopy</span><div class="choices">
        ${L.ECTOPY.map(g => choice('ectopy', String(g.grade), `${g.label} ${g.desc}`, g.color, ectopyVal === String(g.grade))).join('')}
      </div></div>
      <div class="field"><span class="k">Feel</span><div class="choices">
        ${L.FEEL.slice(1).map(f => choice('feel', String(f.v), `${f.v} ${f.label}`, f.color, feel === f.v)).join('')}
      </div></div>
      <p class="hint" style="margin:0 0 8px">Previous day ${esc(L.fmtDay(activity))} is ${kcalNow ? Math.round(kcalNow).toLocaleString('en-GB') + ' kcal' : 'empty'}.</p>
      <div class="grid-2">
        <label class="field"><span class="k">Add kcal</span><input id="fKcal" inputmode="numeric" placeholder="0" ${writable ? '' : 'disabled'}></label>
        <label class="field"><span class="k">Name</span><input id="fKcalName" placeholder="Manual" ${writable ? '' : 'disabled'}></label>
      </div>
      <div class="sheet-actions">
        <button class="btn ghost" type="button" id="sheetClose">Close</button>
        <button class="btn primary" type="button" id="saveLog" ${writable ? '' : 'disabled'}>Save</button>
      </div>`;
    openSheet(sheet);
    sheet.addEventListener('click', ev => {
      const c = ev.target.closest('.choice');
      if (!c || !writable) return;
      const group = c.dataset.group;
      if (group === 'extra') { c.classList.toggle('on'); return; }
      const was = c.classList.contains('on');
      sheet.querySelectorAll(`.choice[data-group="${group}"]`).forEach(el => el.classList.remove('on'));
      if (!was) c.classList.add('on');
    });
    sheet.querySelector('#sheetClose').onclick = closeSheet;
    sheet.querySelector('#fDate').addEventListener('change', ev => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(ev.target.value)) openLog(ev.target.value);
    });
    sheet.querySelector('#saveLog').onclick = () => commitLog(sheet, {
      date,
      tempPrefill,
      rrPrefill,
      reading,
      tags,
      feel,
    });
  }

  function selected(sheet, group) {
    return [...sheet.querySelectorAll(`.choice.on[data-group="${group}"]`)].map(el => el.dataset.value);
  }
  function parseBounded(raw, min, max) {
    if (raw.trim() === '') return { empty: true };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return { bad: true };
    return { value: n };
  }

  async function commitLog(sheet, ctx) {
    const btn = sheet.querySelector('#saveLog');
    if (!canWrite()) { toast('Read only'); return; }
    const date = sheet.querySelector('#fDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Choose a date'); return; }
    if (date !== ctx.date) { openLog(date); return; }
    const hrvParsed = parseBounded(sheet.querySelector('#fHrv').value, 20, 220);
    if (hrvParsed.bad) { toast('HRV needs to be between 20 and 220'); return; }
    const rhrParsed = parseBounded(sheet.querySelector('#fRhr').value, 25, 120);
    if (rhrParsed.bad) { toast('RHR needs to be between 25 and 120'); return; }
    const rrParsed = parseBounded(sheet.querySelector('#fRr').value, 5, 40);
    if (rrParsed.bad) { toast('Breathing rate looks off'); return; }
    const tempParsed = parseBounded(sheet.querySelector('#fTemp').value, 34, 40);
    if (tempParsed.bad) { toast('Temperature looks off'); return; }
    const kcalParsed = parseBounded(sheet.querySelector('#fKcal').value, 1, 20000);
    if (kcalParsed.bad) { toast('Kcal looks off'); return; }
    const note = sheet.querySelector('#fNote').value.trim();
    const tag = selected(sheet, 'tag')[0] || '';
    const extras = L.orderedExtras(selected(sheet, 'extra'));
    const ectopyRaw = selected(sheet, 'ectopy')[0];
    const ectopy = ectopyRaw == null || ectopyRaw === '' ? undefined : (ectopyRaw === 'X' ? 'X' : Number(ectopyRaw));
    const feelRaw = selected(sheet, 'feel')[0];
    const feel = feelRaw == null || feelRaw === '' ? null : Number(feelRaw);
    const meta = { note: note || undefined, tag: tag || undefined, extras, ectopy };
    const reading = readingFor(date);
    const hasHRV = !hrvParsed.empty;
    const hasRHR = !rhrParsed.empty;
    if (reading && !hasHRV) { toast('Keep the HRV number, or change it. Deleting a night stays on the classic app.'); return; }
    const metaSame = reading ? sameMeta(reading, meta) : false;
    const rhrSame = rhrParsed.empty || (hasRHR && S.rhrData[date] === rhrParsed.value);
    const rrSame = sheet.querySelector('#fRr').value.trim() === ctx.rrPrefill;
    const tempSame = sheet.querySelector('#fTemp').value.trim() === ctx.tempPrefill;
    const feelSame = (feel == null && !(L.FEEL[S.feelData[date]])) || feel === S.feelData[date];
    const hrvSame = reading && hasHRV && reading.hrv === hrvParsed.value;
    const tagsOnly = !reading && (meta.tag || meta.extras || meta.ectopy !== undefined || note);
    if (!reading && !hasHRV && !hasRHR && !tagsOnly && feel == null && kcalParsed.empty) {
      toast('Enter HRV, RHR, or both');
      return;
    }
    if (reading && hrvSame && metaSame && rhrSame && rrSame && tempSame && feelSame && kcalParsed.empty) {
      toast('No changes');
      return;
    }
    if (reading && hasHRV && reading.hrv !== hrvParsed.value) {
      const ok = await confirmChoice(
        `Replace ${L.fmtDay(date)}?`,
        'This night already has an HRV reading. Replacing keeps this device’s version and stops the old one coming back on sync.',
        'Replace',
        'Keep'
      );
      if (!ok) { toast('Kept existing entry'); return; }
      dropReadings(r => r.date === date);
      const entry = { id: newId(), date, hrv: hrvParsed.value };
      writeMeta(entry, meta);
      S.readings.push(entry);
      foldDay(date, entry);
    } else if (reading && hasHRV) {
      writeMeta(reading, meta);
      foldDay(date, reading);
    } else if (hasHRV) {
      const entry = { id: newId(), date, hrv: hrvParsed.value };
      writeMeta(entry, meta);
      S.readings.push(entry);
      foldDay(date, entry);
    } else if (tagsOnly || note) {
      const cur = S.dayTags[date] && typeof S.dayTags[date] === 'object' ? S.dayTags[date] : {};
      const next = { ...cur };
      if (meta.tag) next.tag = meta.tag; else delete next.tag;
      if (meta.extras) next.extras = meta.extras; else delete next.extras;
      if (meta.ectopy !== undefined) next.ectopy = meta.ectopy; else delete next.ectopy;
      S.dayTags[date] = next;
      if (note) S.rhrNotes[date] = note; else if (!reading) delete S.rhrNotes[date];
    }
    if (hasRHR && S.rhrData[date] !== rhrParsed.value) S.rhrData[date] = rhrParsed.value;
    if (!rrSame && !rrParsed.empty) S.rrData[date] = rrParsed.value;
    if (!tempSame && !tempParsed.empty) S.tempData[date] = tempParsed.value;
    if (!feelSame) {
      if (feel == null) { if (S.feelData[date]) S.feelData[date] = 0; }
      else S.feelData[date] = feel;
    }
    if (!kcalParsed.empty) {
      const name = sheet.querySelector('#fKcalName').value.trim() || 'Manual';
      addKcalItem(L.prevDay(date), { name, kcal: Math.round(kcalParsed.value) });
    }
    saveAllLocal();
    render();
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const ok = await saveToGitHub();
    if (ok) closeSheet();
    else {
      btn.disabled = false;
      btn.textContent = 'Retry sync';
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Saving…';
        const again = await saveToGitHub();
        if (again) closeSheet();
        else { btn.disabled = false; btn.textContent = 'Retry sync'; }
      };
    }
  }

  function writeMeta(entry, meta) {
    if (meta.note) entry.note = meta.note; else delete entry.note;
    if (meta.tag) entry.tag = meta.tag; else delete entry.tag;
    if (meta.extras) entry.extras = meta.extras; else delete entry.extras;
    if (meta.ectopy !== undefined) entry.ectopy = meta.ectopy; else delete entry.ectopy;
  }
  function sameMeta(entry, meta) {
    const extras = entry.extras && entry.extras.length ? entry.extras : undefined;
    const ectopy = entry.ectopy === undefined ? undefined : entry.ectopy;
    return (entry.note || undefined) === meta.note
      && (entry.tag || undefined) === meta.tag
      && JSON.stringify(extras) === JSON.stringify(meta.extras)
      && ectopy === meta.ectopy;
  }

  function onAppClick(e) {
    if (e.target.closest('#gateSign')) {
      if (canWrite()) openLog(todayISO());
      else openAccount();
      return;
    }
    const range = e.target.closest('[data-range]');
    if (range) {
      chartRange = Number(range.dataset.range);
      chartFocus = null;
      document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('on', Number(b.dataset.range) === chartRange));
      drawChart();
      return;
    }
    const metric = e.target.closest('[data-metric]');
    if (metric) {
      chartMetric = metric.dataset.metric;
      chartFocus = null;
      document.querySelectorAll('[data-metric]').forEach(b => b.classList.toggle('on', b.dataset.metric === chartMetric));
      drawChart();
      return;
    }
    if (e.target.closest('#moreBtn')) {
      journalAll = !journalAll;
      const list = $('journalList');
      if (list) list.innerHTML = journalRows();
      return;
    }
    if (e.target.closest('#logBtn')) { openLog(S.readings.length ? (L.summarize(S).morning || todayISO()) : todayISO()); return; }
    const row = e.target.closest('[data-date]');
    if (row) openLog(row.dataset.date);
  }

  async function boot() {
    paintThemeIcon();
    paintAccount();
    $('themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'));
    $('accountBtn').addEventListener('click', openAccount);
    $('syncBtn').addEventListener('click', pull);
    $('app').addEventListener('click', onAppClick);
    $('app').addEventListener('input', e => {
      if (e.target.id !== 'q') return;
      journalQuery = e.target.value;
      const list = $('journalList');
      if (list) list.innerHTML = journalRows();
    });
    $('app').addEventListener('pointerup', e => {
      if (e.target.id === 'chart') onChartPointer(e);
    });
    window.addEventListener('resize', () => drawChart());
    document.fonts.ready.then(() => drawChart());

    const params = new URLSearchParams(location.search);
    const preview = params.get('preview');
    if (preview != null) {
      previewMode = true;
      previewName = preview.toLowerCase().replace(/[^a-z0-9]/g, '');
      paintAccount();
      paintSync();
      if (!previewName) { loadError = 'Preview name is empty.'; render(); return; }
      try {
        const res = await fetch(`data/${previewName}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        resetMemory();
        absorb(data, { persist: false, filterRemoved: false });
        remoteReady = false;
        render();
      } catch (e) {
        loadError = `Could not load data/${previewName}.json`;
        render();
      }
      return;
    }

    const token = getGHToken();
    const user = getGHUser();
    paintAccount();
    paintSync();
    if (!token || !user) { render(); return; }
    loadLocalMaps();
    removed = loadRemoved();
    $('app').innerHTML = '<p class="note">Syncing…</p>';
    const result = await loadFromGitHub();
    if (!result.ok) {
      loadError = result.status === 401 || result.status === 403
        ? `Signed in as ${user}, but GitHub rejected the token.`
        : result.status ? `Signed in as ${user}. Could not load data/${user}.json (HTTP ${result.status}).` : `Signed in as ${user}. Could not reach GitHub.`;
      if (loadReadingsFromLocal()) offline = true;
      else remoteReady = false;
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
