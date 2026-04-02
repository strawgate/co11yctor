let ws = null;
let currentTab = 'live';
const streamMax = 200;

function switchTab(tab) {
  currentTab = tab;
  const tabNames = ['live','spans','metrics','logs','stats'];
  tabNames.forEach(t => {
    const panel = document.getElementById('tab-' + t);
    if (panel) panel.classList.toggle('active', t === tab);
  });
  document.querySelectorAll('nav button.tab').forEach((btn, i) => {
    btn.className = tabNames[i] === tab ? 'tab tab-active' : 'tab tab-inactive';
  });
  if (tab === 'spans')   loadSpans();
  if (tab === 'metrics') loadMetrics();
  if (tab === 'logs')    loadLogs();
  if (tab === 'stats')   loadStats();
}

function badge(text, cls) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}

function protoBadge(proto) {
  const p = (proto || 'http').toLowerCase();
  return badge(p, p === 'grpc' ? 'grpc' : 'http');
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const ms = (end - start) / 1e6;
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
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
  const placeholder = container.querySelector('.stream-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = 'stream-item';

  const type = data._type || 'event';
  const typeClass = { span: 'c-indigo', metric: 'c-cyan', log: 'c-emerald', event: 'c-muted' };
  const cls = typeClass[type] || 'c-muted';

  let content = '';
  if (type === 'span') {
    content = `<span class="${cls}">[span]</span> <span class="c-slate">${data.ServiceName || '?'}</span> → <span class="c-white">${data.Name || '?'}</span> <span class="c-muted">${fmtDuration(data.StartTimeUnixNano, data.EndTimeUnixNano)}</span>`;
  } else if (type === 'metric') {
    content = `<span class="${cls}">[metric]</span> <span class="c-slate">${data.ServiceName || '?'}</span> <span class="c-white">${data.Name}</span> = <span class="c-cyan">${data.Value}</span>`;
  } else if (type === 'log') {
    content = `<span class="${cls}">[log]</span> <span class="c-slate">${data.ServiceName || '?'}</span> <span class="c-white">${truncate(data.Body, 80)}</span>`;
  } else {
    content = `<span class="${cls}">[event]</span> ${JSON.stringify(data).slice(0, 100)}`;
  }

  const ts = data.CapturedAt ? ` <span class="c-muted">${fmtTime(data.CapturedAt)}</span>` : '';
  div.innerHTML = content + ts;

  container.insertBefore(div, container.firstChild);

  while (container.children.length > streamMax) {
    container.removeChild(container.lastChild);
  }
}

function clearStream() {
  const container = document.getElementById('live-stream');
  container.innerHTML = '<div class="stream-placeholder">Cleared. Waiting for events…</div>';
}

// Spans
async function loadSpans() {
  const tbody = document.getElementById('spans-body');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Loading…</td></tr>';
  try {
    const res = await fetch('/api/spans?limit=100');
    const spans = await res.json();
    if (!spans || spans.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No spans captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = spans.map(s => `
      <tr>
        <td class="c-indigo">${s.ServiceName || '—'}</td>
        <td class="c-white">${s.Name || '—'}</td>
        <td class="mono c-muted">${truncate(s.TraceID, 16)}</td>
        <td>${fmtDuration(s.StartTimeUnixNano, s.EndTimeUnixNano)}</td>
        <td>${s.StatusCode === 1 ? badge('OK','ok') : badge('ERR','err')}</td>
        <td>${protoBadge(s.Proto)}</td>
        <td class="c-muted mono">${fmtTime(s.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="color:#f87171">Error: ${e.message}</td></tr>`;
  }
}

// Metrics
async function loadMetrics() {
  const tbody = document.getElementById('metrics-body');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Loading…</td></tr>';
  try {
    const res = await fetch('/api/metrics?limit=100');
    const metrics = await res.json();
    if (!metrics || metrics.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No metrics captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = metrics.map(m => `
      <tr>
        <td class="c-cyan">${m.ServiceName || '—'}</td>
        <td class="c-white">${m.Name || '—'}</td>
        <td>${m.DataType || '—'}</td>
        <td class="mono c-cyan">${m.Value !== undefined ? m.Value.toFixed(4) : '—'}</td>
        <td>${m.Unit || '—'}</td>
        <td>${protoBadge(m.Proto)}</td>
        <td class="c-muted mono">${fmtTime(m.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="color:#f87171">Error: ${e.message}</td></tr>`;
  }
}

// Logs
async function loadLogs() {
  const tbody = document.getElementById('logs-body');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Loading…</td></tr>';
  try {
    const res = await fetch('/api/logs?limit=100');
    const logs = await res.json();
    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No logs captured yet.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td class="c-emerald">${l.ServiceName || '—'}</td>
        <td>${l.SeverityText || '—'}</td>
        <td class="c-white">${truncate(l.Body, 60)}</td>
        <td class="mono c-muted">${truncate(l.TraceID, 16)}</td>
        <td>${protoBadge(l.Proto)}</td>
        <td class="c-muted mono">${fmtTime(l.CapturedAt)}</td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="color:#f87171">Error: ${e.message}</td></tr>`;
  }
}

// Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('stat-spans').textContent   = stats.TotalSpans   ?? '0';
    document.getElementById('stat-metrics').textContent = stats.TotalMetrics ?? '0';
    document.getElementById('stat-logs').textContent    = stats.TotalLogs    ?? '0';
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
