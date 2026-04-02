let ws = null;
let currentTab = 'live';
const streamMax = 200;

function switchTab(tab) {
  currentTab = tab;
  ['live','spans','metrics','logs','stats'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('nav button').forEach((btn, i) => {
    const tabs = ['live','spans','metrics','logs','stats'];
    btn.className = tabs[i] === tab
      ? 'tab-active px-4 py-2 rounded-t text-sm font-medium'
      : 'tab-inactive px-4 py-2 rounded-t text-sm font-medium';
  });
  if (tab === 'spans') loadSpans();
  if (tab === 'metrics') loadMetrics();
  if (tab === 'logs') loadLogs();
  if (tab === 'stats') loadStats();
}

function badge(text, cls) {
  return `<span class="badge-${cls} text-xs rounded px-1 py-0.5 font-mono">${text}</span>`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const ms = (end - start) / 1e6;
  return ms < 1 ? `${(ms*1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

function truncate(str, n) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// WebSocket
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  
  ws.onopen = () => {
    document.getElementById('ws-dot').className = 'ws-dot ws-connected';
    document.getElementById('ws-status').textContent = 'Connected';
  };
  
  ws.onclose = () => {
    document.getElementById('ws-dot').className = 'ws-dot ws-disconnected';
    document.getElementById('ws-status').textContent = 'Reconnecting…';
    setTimeout(connect, 3000);
  };
  
  ws.onerror = () => {
    document.getElementById('ws-status').textContent = 'Error';
  };
  
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      appendToStream(data);
      updateStatsSummary();
    } catch(err) {}
  };
}

function appendToStream(data) {
  const container = document.getElementById('live-stream');
  // Remove placeholder
  const placeholder = container.querySelector('.p-4');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = 'stream-item';
  
  const type = data._type || 'event';
  const typeColors = { span: 'text-indigo-400', metric: 'text-cyan-400', log: 'text-emerald-400', event: 'text-slate-400' };
  const color = typeColors[type] || typeColors.event;
  
  let content = '';
  if (type === 'span') {
    content = `<span class="${color}">[span]</span> <span class="text-slate-300">${data.ServiceName || '?'}</span> → <span class="text-white">${data.Name || '?'}</span> <span class="text-slate-500">${fmtDuration(data.StartTimeUnixNano, data.EndTimeUnixNano)}</span>`;
  } else if (type === 'metric') {
    content = `<span class="${color}">[metric]</span> <span class="text-slate-300">${data.ServiceName || '?'}</span> <span class="text-white">${data.Name}</span> = <span class="text-cyan-300">${data.Value}</span>`;
  } else if (type === 'log') {
    content = `<span class="${color}">[log]</span> <span class="text-slate-300">${data.ServiceName || '?'}</span> <span class="text-white">${truncate(data.Body, 80)}</span>`;
  } else {
    content = `<span class="${color}">[event]</span> ${JSON.stringify(data).slice(0, 100)}`;
  }
  
  const ts = data.CapturedAt ? `<span class="text-slate-600 ml-2">${fmtTime(data.CapturedAt)}</span>` : '';
  div.innerHTML = content + ts;
  
  container.insertBefore(div, container.firstChild);
  
  // Trim old entries
  while (container.children.length > streamMax) {
    container.removeChild(container.lastChild);
  }
}

function clearStream() {
  const container = document.getElementById('live-stream');
  container.innerHTML = '<div class="p-4 text-slate-500 text-sm">Cleared. Waiting for events…</div>';
}

// Spans
async function loadSpans() {
  const tbody = document.getElementById('spans-body');
  tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-8">Loading…</td></tr>';
  try {
    const res = await fetch('/api/spans?limit=100');
    const spans = await res.json();
    if (!spans || spans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-8">No spans captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = spans.map(s => `
      <tr>
        <td class="text-indigo-300">${s.ServiceName || '—'}</td>
        <td class="text-white">${s.Name || '—'}</td>
        <td class="font-mono text-xs text-slate-400">${truncate(s.TraceID, 16)}</td>
        <td>${fmtDuration(s.StartTimeUnixNano, s.EndTimeUnixNano)}</td>
        <td>${s.StatusCode === 1 ? badge('OK','ok') : badge('ERR','err')}</td>
        <td>${badge(s.Proto || 'unknown', s.Proto || 'http')}</td>
        <td class="text-slate-500 text-xs">${fmtTime(s.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-red-400 text-center py-8">Error: ${e.message}</td></tr>`;
  }
}

// Metrics
async function loadMetrics() {
  const tbody = document.getElementById('metrics-body');
  tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-8">Loading…</td></tr>';
  try {
    const res = await fetch('/api/metrics?limit=100');
    const metrics = await res.json();
    if (!metrics || metrics.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-8">No metrics captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = metrics.map(m => `
      <tr>
        <td class="text-cyan-300">${m.ServiceName || '—'}</td>
        <td class="text-white">${m.Name || '—'}</td>
        <td>${m.DataType || '—'}</td>
        <td class="font-mono text-cyan-200">${m.Value !== undefined ? m.Value.toFixed(4) : '—'}</td>
        <td>${m.Unit || '—'}</td>
        <td>${badge(m.Proto || 'unknown', m.Proto || 'http')}</td>
        <td class="text-slate-500 text-xs">${fmtTime(m.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-red-400 text-center py-8">Error: ${e.message}</td></tr>`;
  }
}

// Logs
async function loadLogs() {
  const tbody = document.getElementById('logs-body');
  tbody.innerHTML = '<tr><td colspan="6" class="text-slate-500 text-center py-8">Loading…</td></tr>';
  try {
    const res = await fetch('/api/logs?limit=100');
    const logs = await res.json();
    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-slate-500 text-center py-8">No logs captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td class="text-emerald-300">${l.ServiceName || '—'}</td>
        <td>${l.SeverityText || '—'}</td>
        <td class="text-white">${truncate(l.Body, 60)}</td>
        <td class="font-mono text-xs text-slate-400">${truncate(l.TraceID, 16)}</td>
        <td>${badge(l.Proto || 'unknown', l.Proto || 'http')}</td>
        <td class="text-slate-500 text-xs">${fmtTime(l.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-red-400 text-center py-8">Error: ${e.message}</td></tr>`;
  }
}

// Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('stat-spans').textContent = stats.TotalSpans ?? '0';
    document.getElementById('stat-metrics').textContent = stats.TotalMetrics ?? '0';
    document.getElementById('stat-logs').textContent = stats.TotalLogs ?? '0';
  } catch(e) {}
}

async function updateStatsSummary() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('stats-summary').textContent =
      `${stats.TotalSpans ?? 0} spans · ${stats.TotalMetrics ?? 0} metrics · ${stats.TotalLogs ?? 0} logs`;
  } catch(e) {}
}

// Auto-refresh stats every 5 seconds
setInterval(updateStatsSummary, 5000);
updateStatsSummary();

// Connect WebSocket
connect();
