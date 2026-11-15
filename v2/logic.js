/* Shared numbers and the GitHub payload shape. No DOM.
   The write encoding matches index.html's putToGitHub exactly. */
(function (root) {
  const TAGS = [
    { label: 'Rest', color: '#4caf50' },
    { label: 'Active Recovery', color: '#00bcd4' },
    { label: '<100TSS', color: '#ff9800' },
    { label: '100-200TSS', color: '#ffd600' },
    { label: '200-300TSS', color: '#536dfe' },
    { label: '300TSS+', color: '#e040fb' },
    { label: 'Race', color: '#ff80ab' },
  ];
  const EXTRAS = [
    { label: 'Sick', color: '#f44336' },
    { label: 'Sauna', color: '#ff7043' },
    { label: 'Cold', color: '#90caf9' },
  ];
  const ECTOPY = [
    { grade: 'X', label: 'ECT X', desc: 'Untested', color: '#90a4ae' },
    { grade: 0, label: 'ECT 0', desc: 'None', color: '#66bb6a' },
    { grade: 1, label: 'ECT 1', desc: 'Transitions', color: '#fbc02d' },
    { grade: 2, label: 'ECT 2', desc: 'Sustained', color: '#f57c00' },
    { grade: 3, label: 'ECT 3', desc: 'Session-breaking', color: '#ff1744' },
  ];
  const FEEL = [
    null,
    { v: 1, label: 'Wrecked', color: '#f44336' },
    { v: 2, label: 'Flat', color: '#ff9800' },
    { v: 3, label: 'OK', color: '#ffd600' },
    { v: 4, label: 'Good', color: '#4caf50' },
    { v: 5, label: 'Great', color: '#00e5ff' },
  ];
  const EXTRA_ORDER = EXTRAS.map(t => t.label);
  const STATUS = {
    'High,Excellent': 'Both systems optimally recovered — ideal physiological window.',
    'High,Good': 'Strong autonomic recovery with minor cardiovascular stress — systems in good order.',
    'High,Elevated': 'Contradictory signal — autonomic recovered but RHR elevated; suspect dehydration, heat, or early illness.',
    'High,High': 'Rare conflict — high HRV with significantly elevated RHR; check for illness or dehydration.',
    'Good,Excellent': 'Well recovered with strong cardiovascular efficiency.',
    'Good,Good': 'Solid baseline state — body handling load well.',
    'Good,Elevated': 'Mild cumulative stress emerging — monitor the trend over coming days.',
    'Good,High': 'Cardiovascular strain despite adequate HRV — monitor sleep and hydration.',
    'OK,Excellent': 'Autonomic fatigue present but cardiovascular system coping.',
    'OK,Good': 'Moderate accumulated load — nervous system under pressure.',
    'OK,Elevated': 'Significant dual-system stress — address sleep, nutrition, and hydration.',
    'OK,High': 'Clear overreaching signal — both systems compromised.',
    'Low,Excellent': 'Autonomic suppression despite cardiovascular efficiency — common under chronic load, and during a taper.',
    'Low,Good': 'Nervous system significantly suppressed — overreaching likely.',
    'Low,Elevated': 'Dual-system fatigue with compounding stress — monitor closely.',
    'Low,High': 'Alarm state — classic overtraining or acute illness signature; monitor closely.',
  };
  const FALLBACK = {
    High: 'High — autonomic system well recovered.',
    Good: 'Good — all systems should be in order.',
    OK: 'OK — monitor trend direction.',
    Low: 'Low — nervous system under pressure.',
  };

  const prevDay = d => {
    const dt = new Date(d + 'T12:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  };
  const nextDay = d => {
    const dt = new Date(d + 'T12:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };
  const parseISO = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDay = iso => {
    const dt = parseISO(iso);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const fmtLong = iso => parseISO(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  function bandOf(v) {
    if (v == null || Number.isNaN(v)) return null;
    if (v >= 90) return { id: 'high', name: 'High', range: '90+' };
    if (v >= 75) return { id: 'good', name: 'Good', range: '75–90' };
    if (v >= 59) return { id: 'ok', name: 'OK', range: '59–75' };
    return { id: 'low', name: 'Low', range: '<59' };
  }

  function getKcalTotal(workoutData, date) {
    const v = workoutData[date];
    if (!v) return 0;
    if (Array.isArray(v)) return v.reduce((s, e) => s + (e.kcal || 0), 0);
    return v;
  }
  function getKcalItems(workoutData, date) {
    const v = workoutData[date];
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return [{ name: 'Activity', kcal: v }];
  }

  const RR_MIN = 7, RR_N = 30;
  function rrBaselineFor(rrData, rrBaseline, rrBaselineSetDate, date) {
    const prior = Object.keys(rrData).filter(d => d < date).sort();
    if (rrBaseline != null && rrBaselineSetDate && date > rrBaselineSetDate &&
        prior.filter(d => d > rrBaselineSetDate).length < RR_MIN) return rrBaseline;
    const last = prior.slice(-RR_N);
    if (last.length < RR_MIN) return rrBaseline;
    return last.reduce((a, d) => a + rrData[d], 0) / last.length;
  }
  function rrZone(dev) {
    if (dev == null) return null;
    if (dev <= -1) return 'Low';
    if (dev < 1) return 'Normal';
    if (dev < 2) return 'Elevated';
    return 'High';
  }
  const fmtRrDev = dv => {
    const r = Math.round(dv * 10) / 10;
    return (r >= 0 ? '+' : '') + r.toFixed(1);
  };
  const fmtTempDev = dv => {
    const r = Math.round(dv * 100) / 100;
    return (r >= 0 ? '+' : '') + r.toFixed(2) + '°';
  };

  function rollingMedian(tempData) {
    const vals = Object.keys(tempData).sort().slice(-14).map(k => tempData[k]).sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }
  function effectiveTemp(tempData, tempBaseline, tempBaselineSetDate) {
    const keys = Object.keys(tempData);
    const count = tempBaselineSetDate == null ? keys.length : keys.filter(d => d > tempBaselineSetDate).length;
    return count >= 7 ? rollingMedian(tempData) : tempBaseline;
  }
  function tempZone(dev) {
    if (dev == null) return null;
    if (dev > 0.5) return 'High';
    if (dev < -0.5) return 'Low';
    return 'Normal';
  }

  function rhrBaselineOf(rhrData) {
    const dates = Object.keys(rhrData).sort().slice(-90);
    if (!dates.length) return { value: null, n: 0, label: '—' };
    const value = Math.round(dates.reduce((a, d) => a + rhrData[d], 0) / dates.length);
    return { value, n: dates.length, label: dates.length >= 90 ? '90-day' : `${dates.length}-day` };
  }
  function rhrZone(rhr, baseline) {
    if (rhr == null || baseline == null) return null;
    if (rhr <= baseline + 1) return 'Excellent';
    if (rhr <= baseline + 4) return 'Good';
    if (rhr <= baseline + 7) return 'Elevated';
    return 'High';
  }

  function kcalBaselineOf(workoutData) {
    const dates = Object.keys(workoutData).sort();
    if (!dates.length) return { value: null, label: '—' };
    const n = dates.length;
    if (n < 42) {
      const value = Math.round(dates.reduce((s, d) => s + getKcalTotal(workoutData, d), 0) / n);
      return { value, label: `${n}-day` };
    }
    const lastD = new Date(dates[n - 1] + 'T12:00:00Z');
    const startD = new Date(lastD);
    startD.setUTCDate(startD.getUTCDate() - 41);
    let sum = 0;
    const cur = new Date(startD);
    while (cur <= lastD) {
      sum += getKcalTotal(workoutData, cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { value: Math.round(sum / 42), label: '42-day' };
  }
  function kcalZone(kcal, baseline) {
    if (kcal == null || !baseline) return null;
    if (kcal >= baseline * 2) return 'Extreme';
    if (kcal >= baseline * 1.4) return 'High';
    if (kcal >= baseline * 0.7) return 'Medium';
    return 'Low';
  }

  function averagedByDate(readings) {
    const groups = {};
    for (const r of readings) (groups[r.date] ||= []).push(r.hrv);
    return Object.keys(groups).sort().map(date => ({
      date,
      hrv: Math.round(groups[date].reduce((a, b) => a + b, 0) / groups[date].length),
      count: groups[date].length,
    }));
  }

  function hrvBaseline(readings, now) {
    if (!readings.length) return { value: 80, label: 'default', n: 0 };
    const cutoff = new Date(now || Date.now());
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const pool = readings.filter(r => new Date(r.date) >= cutoff);
    const src = pool.length ? pool : readings;
    return {
      value: Math.round(src.reduce((a, b) => a + b.hrv, 0) / src.length),
      label: pool.length ? '12-month' : `${readings.length}-day`,
      n: src.length,
    };
  }

  function summarize(state, now) {
    const averaged = averagedByDate(state.readings);
    const latest = averaged.at(-1) || null;
    const prev = averaged.length > 1 ? averaged.at(-2) : null;
    const base = hrvBaseline(state.readings, now);
    const last3 = averaged.slice(-3);
    const last7 = averaged.slice(-7);
    const avg3 = last3.length ? Math.round(last3.reduce((a, b) => a + b.hrv, 0) / last3.length) : null;
    const avg7 = last7.length ? Math.round(last7.reduce((a, b) => a + b.hrv, 0) / last7.length) : null;
    let trend = null;
    if (averaged.length >= 3 && avg3 != null && avg7 != null) {
      const diff = avg3 - avg7;
      trend = diff > 3 ? { id: 'up', label: 'Rising', glyph: '↑' }
        : diff < -3 ? { id: 'down', label: 'Falling', glyph: '↓' }
        : { id: 'flat', label: 'Stable', glyph: '→' };
    }
    const morning = latest ? latest.date : null;
    const rhrBase = rhrBaselineOf(state.rhrData);
    const rhr = morning && state.rhrData[morning] != null ? state.rhrData[morning]
      : (Object.keys(state.rhrData).sort().at(-1) ? state.rhrData[Object.keys(state.rhrData).sort().at(-1)] : null);
    const rhrDate = morning && state.rhrData[morning] != null ? morning : Object.keys(state.rhrData).sort().at(-1) || null;
    const rrBase = morning ? rrBaselineFor(state.rrData, state.rrBaseline, state.rrBaselineSetDate, morning) : null;
    const rr = morning && state.rrData[morning] != null ? state.rrData[morning] : null;
    const rrDev = rr != null && rrBase != null ? rr - rrBase : null;
    const tBase = effectiveTemp(state.tempData, state.tempBaseline, state.tempBaselineSetDate);
    const temp = morning && state.tempData[morning] != null ? state.tempData[morning] : null;
    const tempDev = temp != null && tBase != null ? temp - tBase : null;
    const kcalBase = kcalBaselineOf(state.workoutData);
    const activityDate = morning ? prevDay(morning) : null;
    const kcal = activityDate ? getKcalTotal(state.workoutData, activityDate) : 0;
    const reading = morning ? state.readings.filter(r => r.date === morning).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] : null;
    const feel = morning && FEEL[state.feelData[morning]] ? FEEL[state.feelData[morning]] : null;
    const status = buildStatus({
      hrv: latest ? latest.hrv : null,
      rhr, rhrBase: rhrBase.value,
      tempDev, rrDev,
    });
    return {
      latest, prev, reading, morning, feel,
      baseline: base,
      avg3, avg7, trend,
      band: latest ? bandOf(latest.hrv) : null,
      band3: avg3 != null ? bandOf(avg3) : null,
      band7: avg7 != null ? bandOf(avg7) : null,
      fromPrev: latest && prev ? latest.hrv - prev.hrv : null,
      vsBase: latest ? latest.hrv - base.value : null,
      rhr: rhr == null ? null : { value: rhr, date: rhrDate, baseline: rhrBase, zone: rhrZone(rhr, rhrBase.value), delta: rhrBase.value == null ? null : rhr - rhrBase.value },
      rr: rr == null ? null : { value: rr, baseline: rrBase, dev: rrDev, zone: rrZone(rrDev) },
      temp: temp == null ? null : { value: temp, baseline: tBase, dev: tempDev, zone: tempZone(tempDev) },
      kcal: morning ? { value: kcal, date: activityDate, baseline: kcalBase, zone: kcal ? kcalZone(kcal, kcalBase.value) : null, items: getKcalItems(state.workoutData, activityDate) } : null,
      status,
    };
  }

  function listOf(a) {
    if (a.length > 1) return a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
    return a[0];
  }
  function buildStatus({ hrv, rhr, rhrBase, tempDev, rrDev }) {
    if (hrv == null) return null;
    const hrvZone = bandOf(hrv).name;
    const zone = rhrZone(rhr, rhrBase);
    const tempHigh = tempDev != null && tempDev > 0.5;
    const rrRaised = rrDev != null && rrDev >= 1;
    const signals = [
      hrvZone === 'Low' && 'suppressed HRV',
      zone === 'High' && 'elevated RHR',
      tempHigh && 'raised wrist temperature',
      rrRaised && 'elevated breathing rate',
    ].filter(Boolean);
    let tone = bandOf(hrv).id;
    let message;
    if (signals.length === 4) {
      tone = 'low';
      message = 'Quadruple-system alarm — suppressed HRV, elevated RHR, raised wrist temperature and elevated breathing rate. Rest and monitor symptoms closely.';
    } else if (signals.length === 3) {
      tone = 'low';
      message = `Triple-system alarm — ${listOf(signals)}. Rest and monitor symptoms closely.`;
    } else if (tempHigh && rrRaised) {
      tone = 'ok';
      message = 'Early illness signal — wrist temperature and breathing rate both up while HRV holds. This often shows a day or two before symptoms.';
    } else {
      message = zone ? STATUS[`${hrvZone},${zone}`] : FALLBACK[hrvZone];
      if (tempHigh) message += ' Raised wrist temperature — monitor for early illness or systemic stress.';
      if (rrDev != null && rrDev >= 2) message += ` Breathing rate well up (${fmtRrDev(rrDev)}).`;
      else if (rrRaised) message += ` Breathing rate elevated (${fmtRrDev(rrDev)}).`;
      else if (rrZone(rrDev) === 'Low') message += ` Breathing rate lower than usual (${fmtRrDev(rrDev)}) — often deeper sleep or improving fitness.`;
    }
    return { message, tone, hrvZone, rhrZone: zone };
  }

  function ectopyOf(r) {
    if (!r || r.ectopy === undefined || r.ectopy === null) return null;
    return ECTOPY.find(g => g.grade === r.ectopy) || null;
  }
  function hasTags(t) {
    return !!(t && (t.tag || (t.extras && t.extras.length) || ectopyOf(t)));
  }
  function tagsForDate(state, date) {
    return state.readings.find(r => r.date === date) || state.dayTags[date] || null;
  }

  function series(state, metric) {
    if (metric === 'hrv') return averagedByDate(state.readings).map(r => ({ date: r.date, v: r.hrv }));
    if (metric === 'rhr') return Object.keys(state.rhrData).sort().map(date => ({ date, v: state.rhrData[date] }));
    if (metric === 'rr') return Object.keys(state.rrData).sort().map(date => ({ date, v: state.rrData[date] }));
    if (metric === 'temp') return Object.keys(state.tempData).sort().map(date => ({ date, v: state.tempData[date] }));
    const dates = Object.keys(state.workoutData).sort();
    return dates.map(date => ({ date, v: getKcalTotal(state.workoutData, date) })).filter(p => p.v);
  }
  function rolling(points, window) {
    return points.map((p, i) => {
      const slice = points.slice(Math.max(0, i - window + 1), i + 1);
      const v = slice.reduce((a, b) => a + b.v, 0) / slice.length;
      return { date: p.date, v };
    });
  }

  function referenceLine(state, metric, date) {
    if (metric === 'hrv') return hrvBaseline(state.readings).value;
    if (metric === 'rhr') return rhrBaselineOf(state.rhrData).value;
    if (metric === 'rr') return date ? rrBaselineFor(state.rrData, state.rrBaseline, state.rrBaselineSetDate, date) : null;
    if (metric === 'temp') return effectiveTemp(state.tempData, state.tempBaseline, state.tempBaselineSetDate);
    if (metric === 'kcal') return kcalBaselineOf(state.workoutData).value;
    return null;
  }

  /* Same rule as index.html mergeReadings. Local wins on the same date.
     Same id + different date keeps both, renumbering the remote copy. */
  function mergeReadings(remote, local, isRemoved) {
    const localById = new Map(local.map(r => [String(r.id), r]));
    const localDates = new Set(local.map(r => r.date));
    const merged = local.slice();
    let maxId = local.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    remote.forEach(rr => {
      const lr = localById.get(String(rr.id));
      if (isRemoved(rr) || (localDates.has(rr.date) && !(lr && lr.date === rr.date))) return;
      if (!lr) {
        maxId = Math.max(maxId, Number(rr.id) || 0);
        merged.push(rr);
      } else if (lr.date !== rr.date) {
        maxId += 1;
        merged.push({ ...rr, id: maxId });
      }
    });
    return { merged, maxId };
  }

  function buildPayload(s, lastResult) {
    return {
      readings: s.readings,
      dayTags: s.dayTags,
      feel: s.feelData,
      rhr: s.rhrData,
      rhrNotes: s.rhrNotes,
      rr: s.rrData,
      rrBaseline: s.rrBaseline,
      rrBaselineSetDate: s.rrBaselineSetDate,
      temp: s.tempData,
      tempBaseline: s.tempBaseline,
      tempBaselineSetDate: s.tempBaselineSetDate,
      workout: s.workoutData,
      lastResult: lastResult ?? null,
    };
  }

  /* Byte-for-byte the same UTF-8 base64 index.html sends. */
  function encodeContent(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  }
  function decodeContent(b64) {
    const binary = atob(String(b64).replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function orderedExtras(list) {
    const on = new Set(list || []);
    const out = EXTRA_ORDER.filter(l => on.has(l));
    return out.length ? out : undefined;
  }

  const api = {
    TAGS, EXTRAS, ECTOPY, FEEL, EXTRA_ORDER, STATUS,
    prevDay, nextDay, parseISO, fmtDay, fmtLong,
    bandOf, getKcalTotal, getKcalItems,
    rrBaselineFor, rrZone, fmtRrDev, fmtTempDev,
    effectiveTemp, tempZone, rhrBaselineOf, rhrZone, kcalBaselineOf, kcalZone,
    averagedByDate, hrvBaseline, summarize, ectopyOf, hasTags, tagsForDate,
    series, rolling, referenceLine, mergeReadings, buildPayload, encodeContent, decodeContent,
    orderedExtras,
  };
  root.HRVLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
