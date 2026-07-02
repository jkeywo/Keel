/**
 * The walking-skeleton cockpit: one server-rendered page, vanilla JS,
 * polling /api/state. Mission Board + Inbox + Runs only (Slice 1 scope).
 *
 * Rendering is keyed per section: a section's DOM is only rewritten when
 * its underlying data changes, and the Inbox snapshots/restores form state
 * across rewrites so polling never wipes an in-progress answer (#5).
 */
export function cockpitPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Keel Cockpit</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background: #14181f; color: #d7dce3; margin: 0; padding: 1.5rem; }
  h1 { font-size: 1.3rem; margin: 0 0 1rem; }
  h1 small { color: #6b7686; font-weight: normal; }
  h2 { font-size: 1rem; color: #9aa7b8; border-bottom: 1px solid #2a3341; padding-bottom: .3rem; margin-top: 1.6rem; }
  .card { background: #1c222c; border: 1px solid #2a3341; border-radius: 8px; padding: .8rem 1rem; margin: .6rem 0; }
  .muted { color: #6b7686; font-size: .85rem; }
  button { background: #2c6e49; color: #fff; border: 0; border-radius: 6px; padding: .35rem .8rem; cursor: pointer; margin-right: .4rem; }
  button.secondary { background: #37415a; }
  button.danger { background: #8a3038; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #2a3341; }
  .state { padding: .1rem .5rem; border-radius: 10px; font-size: .78rem; }
  .state.running, .state.pending { background: #1f4c8f; }
  .state.waiting_for_human { background: #8a6d1a; }
  .state.completed { background: #2c6e49; }
  .state.failed, .state.blocked { background: #8a3038; }
  .state.cancelled { background: #4a5261; }
  label { display: block; margin: .3rem 0; cursor: pointer; }
  input[type=text] { background: #14181f; color: #d7dce3; border: 1px solid #2a3341; border-radius: 6px; padding: .3rem .5rem; width: 60%; }
  pre { white-space: pre-wrap; font-size: .8rem; color: #9aa7b8; }
</style>
</head>
<body>
<h1>Keel Cockpit <small>walking skeleton — Slice 1</small></h1>
<div id="missions"></div>
<h2>Inbox</h2>
<div id="inbox"></div>
<h2>Runs</h2>
<div id="runs"></div>
<script>
var state = { missions: [], runs: [], questions: [], approvals: [] };
var lastMissionsKey = null, lastInboxKey = null, lastRunsKey = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function api(pathname, body) {
  return fetch(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function (r) {
    return r.json().then(function (d) {
      if (!r.ok) alert(d.error || ('request failed: ' + r.status));
      return d;
    });
  }).then(refresh);
}

function startRun(mission, workflow) {
  var issue = prompt('GitHub issue number to run "' + workflow + '" against:');
  if (!issue) return;
  api('/api/runs', { mission: mission, workflow: workflow, issue: Number(issue) });
}

function answer(qid) {
  var chosen = document.querySelector('input[name="q-' + qid + '"]:checked');
  var custom = document.getElementById('custom-' + qid).value.trim();
  var text = custom ? 'custom: ' + custom : (chosen ? chosen.value : '');
  if (!text) { alert('Pick an option or type a custom answer.'); return; }
  api('/api/questions/' + encodeURIComponent(qid) + '/answer', { answer: text });
}

function resolveApproval(id, approved) {
  var feedback = approved ? undefined : (prompt('Feedback for rejection (optional):') || undefined);
  api('/api/approvals/' + encodeURIComponent(id) + '/resolve', { approved: approved, feedback: feedback });
}

function cancelRun(id) {
  if (confirm('Cancel run ' + id + '?')) api('/api/runs/' + encodeURIComponent(id) + '/cancel');
}

function renderMissions() {
  var m = document.getElementById('missions');
  m.innerHTML = '<h2>Mission Board</h2>' + state.missions.map(function (mi) {
    var wfs = (mi.workflows || []).map(function (w) {
      return '<button onclick="startRun(\\'' + esc(mi.id) + '\\',\\'' + esc(w.id) + '\\')">Start ' + esc(w.workflow || w.id) + '</button>';
    }).join(' ');
    var active = state.runs.filter(function (r) { return r.mission === mi.id && ['pending','running','waiting_for_human'].indexOf(r.state) >= 0; }).length;
    return '<div class="card"><strong>' + esc(mi.title) + '</strong> <span class="muted">' + esc(mi.id) + ' — ' + active + ' active run(s)</span><br>' +
      '<span class="muted">' + esc(mi.description || '') + '</span><div style="margin-top:.5rem">' + wfs + '</div></div>';
  }).join('') || '<div class="muted">No missions defined.</div>';
}

function renderInbox() {
  var inbox = document.getElementById('inbox');

  // Snapshot in-progress form state before rewriting the DOM.
  var checkedRadios = {};
  inbox.querySelectorAll('input[type=radio]:checked').forEach(function (el) {
    checkedRadios[el.name] = el.value;
  });
  var textValues = {};
  inbox.querySelectorAll('input[type=text]').forEach(function (el) {
    if (el.value) textValues[el.id] = el.value;
  });

  var qHtml = state.questions.map(function (q) {
    var opts = (q.options || []).map(function (o, i) {
      var letter = String.fromCharCode(65 + i);
      var value = letter + '. ' + o;
      return '<label><input type="radio" name="q-' + esc(q.id) + '" value="' + esc(value) + '"> ' + esc(value) + '</label>';
    }).join('');
    return '<div class="card"><span class="muted">' + esc(q.id) + ' · issue #' + q.issue + ' · ' + esc(q.runId) + '</span>' +
      '<p>' + esc(q.text) + '</p>' + opts +
      '<label>Custom: <input type="text" id="custom-' + esc(q.id) + '"></label>' +
      '<button onclick="answer(\\'' + esc(q.id) + '\\')">Answer</button></div>';
  }).join('');
  var aHtml = state.approvals.map(function (a) {
    return '<div class="card"><span class="muted">approval · ' + esc(a.runId) + ' · step ' + esc(a.stepId) + '</span>' +
      '<p>' + esc(a.summary) + '</p>' +
      '<button onclick="resolveApproval(\\'' + esc(a.id) + '\\', true)">Approve</button>' +
      '<button class="danger" onclick="resolveApproval(\\'' + esc(a.id) + '\\', false)">Reject</button></div>';
  }).join('');
  inbox.innerHTML = (qHtml + aHtml) || '<div class="muted">Nothing waiting on you.</div>';

  // Restore form state for inputs that still exist.
  inbox.querySelectorAll('input[type=radio]').forEach(function (el) {
    if (checkedRadios[el.name] === el.value) el.checked = true;
  });
  Object.keys(textValues).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = textValues[id];
  });
}

function renderRuns() {
  var runs = document.getElementById('runs');
  runs.innerHTML = state.runs.length
    ? '<table><tr><th>Run</th><th>Workflow</th><th>Issue</th><th>State</th><th>Step</th><th>Last log</th><th></th></tr>' +
      state.runs.map(function (r) {
        var last = r.log && r.log.length ? r.log[r.log.length - 1] : '';
        var cancellable = ['pending','running','waiting_for_human','blocked'].indexOf(r.state) >= 0;
        return '<tr><td>' + esc(r.runId) + '</td><td>' + esc(r.workflow) + '</td><td>#' + r.issue + '</td>' +
          '<td><span class="state ' + esc(r.state) + '">' + esc(r.state) + '</span></td>' +
          '<td>' + esc(r.currentStep || '—') + '</td><td class="muted">' + esc(last.slice(25)) + '</td>' +
          '<td>' + (cancellable ? '<button class="secondary" onclick="cancelRun(\\'' + esc(r.runId) + '\\')">Cancel</button>' : '') + '</td></tr>';
      }).join('') + '</table>'
    : '<div class="muted">No runs yet.</div>';
}

function render() {
  var mKey = JSON.stringify([state.missions, state.runs.map(function (r) { return r.mission + '|' + r.state; })]);
  if (mKey !== lastMissionsKey) { lastMissionsKey = mKey; renderMissions(); }
  var iKey = JSON.stringify([state.questions, state.approvals]);
  if (iKey !== lastInboxKey) { lastInboxKey = iKey; renderInbox(); }
  var rKey = JSON.stringify(state.runs);
  if (rKey !== lastRunsKey) { lastRunsKey = rKey; renderRuns(); }
}

function refresh() {
  return fetch('/api/state').then(function (r) { return r.json(); }).then(function (d) { state = d; render(); });
}

refresh();
setInterval(refresh, 2500);
</script>
</body>
</html>`;
}
