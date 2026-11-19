// Build tracker generator.
//
// Source of truth: docs/tracker/tracker.json
// Generates:       docs/tracker/TRACKER.md and docs/tracker/tracker.html
//
// Usage:
//   npm run tracker
//       Validate tracker.json and regenerate TRACKER.md and tracker.html.
//
//   node scripts/build-tracker.js --log "What changed" --why "Reason" [--phases 1,4]
//       (Call node directly for logged changes: on Windows, `npm run tracker -- --log ...`
//       can silently drop or hang on longer quoted text.)
//       Also add a timestamped (IST) entry to CHANGELOG.md. --phases lists the
//       phases whose plan or status changed; every phase that depends on them
//       (directly or indirectly) is listed as impacted, and impacted phases that
//       are already Done/Verified are flagged "Needs re-check".

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const trackerDir = join(root, 'docs', 'tracker')
const dataPath = join(trackerDir, 'tracker.json')
const changelogPath = join(trackerDir, 'CHANGELOG.md')
const mdPath = join(trackerDir, 'TRACKER.md')
const htmlPath = join(trackerDir, 'tracker.html')

const STATUSES = ['Not started', 'In progress', 'Blocked', 'Done', 'Verified']
const COMPLETE = new Set(['Done', 'Verified'])
const STATUS_STYLE = {
  'Not started': { fill: '#eef0f2', stroke: '#9aa3ab', text: '#3b4248', icon: '○' },
  'In progress': { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', icon: '◐' },
  Blocked: { fill: '#fee2e2', stroke: '#dc2626', text: '#7f1d1d', icon: '⛔' },
  Done: { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d', icon: '✔' },
  Verified: { fill: '#bbf7d0', stroke: '#15803d', text: '#14532d', icon: '✔✔' },
}
const CHANGELOG_MARKER = '<!-- new entries go below this line, newest first -->'

// ---------- load and validate ----------

const { values: args } = parseArgs({
  options: {
    log: { type: 'string' },
    why: { type: 'string' },
    phases: { type: 'string' },
  },
})

const data = JSON.parse(readFileSync(dataPath, 'utf8'))
const phaseMap = new Map(data.phases.map((p) => [p.id, p]))
validate()

// ---------- optional change log entry ----------

if (args.log !== undefined) {
  if (!args.log.trim() || !args.why?.trim()) fail('--log and --why must both be non-empty.')
  const changed = args.phases
    ? args.phases.split(',').map((s) => Number(s.trim()))
    : []
  for (const id of changed) if (!phaseMap.has(id)) fail(`--phases: unknown phase ${id}`)

  const stamp = nowIST()
  const impacted = downstream(changed)
  const flagged = []
  for (const id of impacted) {
    const p = phaseMap.get(id)
    if (COMPLETE.has(p.status)) {
      p.needsRecheck = true
      p.recheckReason = `${stamp}: ${args.log.trim()}`
      flagged.push(id)
    }
  }
  data.updated = stamp
  writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n')
  addChangelogEntry({ stamp, what: args.log.trim(), why: args.why.trim(), changed, impacted, flagged })
  console.log(`Change log entry added (${stamp}).`)
  if (impacted.length) console.log(`Impacted phases: ${impacted.join(', ')}`)
  if (flagged.length) console.log(`Flagged "Needs re-check": ${flagged.join(', ')}`)
}

writeFileSync(mdPath, renderMarkdown())
writeFileSync(htmlPath, renderHtml())
const overall = progress(data.phases.flatMap((p) => p.tasks))
console.log(`Tracker generated: ${overall.pct}% complete (${overall.done}/${overall.total} tasks).`)

// ---------- helpers: graph and progress ----------

function validate() {
  const errors = []
  const ids = new Set()
  const taskIds = new Set()
  for (const p of data.phases) {
    if (ids.has(p.id)) errors.push(`Duplicate phase id ${p.id}`)
    ids.add(p.id)
    if (!STATUSES.includes(p.status)) errors.push(`Phase ${p.id}: invalid status "${p.status}"`)
    for (const d of p.dependsOn) if (!phaseMap.has(d)) errors.push(`Phase ${p.id}: unknown dependency ${d}`)
    for (const t of p.tasks) {
      if (taskIds.has(t.id)) errors.push(`Duplicate task id ${t.id}`)
      taskIds.add(t.id)
      if (!STATUSES.includes(t.status)) errors.push(`Task ${t.id}: invalid status "${t.status}"`)
    }
  }
  for (const a of data.acceptance) {
    for (const k of ['logicStatus', 'appStatus'])
      if (!STATUSES.includes(a[k])) errors.push(`Acceptance ${a.id}: invalid ${k} "${a[k]}"`)
    for (const k of ['logicPhase', 'appPhase'])
      if (!phaseMap.has(a[k])) errors.push(`Acceptance ${a.id}: unknown ${k} ${a[k]}`)
  }
  for (const b of data.blockers) {
    if (!['Open', 'Resolved'].includes(b.status)) errors.push(`Blocker ${b.id}: status must be Open or Resolved`)
    for (const p of b.blocksPhases) if (!phaseMap.has(p)) errors.push(`Blocker ${b.id}: unknown phase ${p}`)
    for (const t of b.blocksTasks) if (!taskIds.has(t)) errors.push(`Blocker ${b.id}: unknown task ${t}`)
  }
  if (!phaseMap.has(data.current.phase)) errors.push(`current.phase ${data.current.phase} does not exist`)
  for (const id of data.criticalPath) if (!phaseMap.has(id)) errors.push(`criticalPath: unknown phase ${id}`)
  // cycle check
  const state = new Map()
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      errors.push(`Dependency cycle: ${[...trail, id].join(' → ')}`)
      return
    }
    state.set(id, 'visiting')
    for (const d of phaseMap.get(id)?.dependsOn ?? []) visit(d, [...trail, id])
    state.set(id, 'done')
  }
  for (const p of data.phases) visit(p.id, [])
  if (errors.length) fail('tracker.json is invalid:\n  - ' + errors.join('\n  - '))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function dependents(id) {
  return data.phases.filter((p) => p.dependsOn.includes(id)).map((p) => p.id)
}

function downstream(ids) {
  const seen = new Set()
  const queue = [...ids]
  while (queue.length) {
    for (const d of dependents(queue.shift())) {
      if (!seen.has(d)) {
        seen.add(d)
        queue.push(d)
      }
    }
  }
  for (const id of ids) seen.delete(id)
  return [...seen].sort((a, b) => a - b)
}

function ancestors(id, acc = new Set()) {
  for (const d of phaseMap.get(id).dependsOn) {
    if (!acc.has(d)) {
      acc.add(d)
      ancestors(d, acc)
    }
  }
  return acc
}

// Edges for drawing: drop a dependency already implied through another one.
function drawnEdges() {
  const edges = []
  for (const p of data.phases) {
    for (const d of p.dependsOn) {
      const implied = p.dependsOn.some((e) => e !== d && ancestors(e).has(d))
      if (!implied) edges.push([d, p.id])
    }
  }
  return edges
}

function isCritical(from, to) {
  const cp = data.criticalPath
  const i = cp.indexOf(from)
  return i !== -1 && cp[i + 1] === to
}

function level(id) {
  const deps = phaseMap.get(id).dependsOn
  return deps.length ? 1 + Math.max(...deps.map(level)) : 0
}

function progress(tasks) {
  const done = tasks.filter((t) => COMPLETE.has(t.status)).length
  const total = tasks.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function phaseLabel(id) {
  return `${id} · ${phaseMap.get(id).name}`
}

function blockersFor(phase) {
  const taskIds = new Set(phase.tasks.map((t) => t.id))
  return data.blockers.filter(
    (b) => b.status === 'Open' && (b.blocksPhases.includes(phase.id) || b.blocksTasks.some((t) => taskIds.has(t))),
  )
}

function nowIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} IST`
}

function addChangelogEntry({ stamp, what, why, changed, impacted, flagged }) {
  let text
  try {
    text = readFileSync(changelogPath, 'utf8')
  } catch {
    text = `# Tracker change log\n\nEvery change to the plan or progress, newest first. Times are IST (Asia/Kolkata).\nGenerated entries come from \`node scripts/build-tracker.js --log ... --why ...\`.\n\n${CHANGELOG_MARKER}\n`
  }
  if (!text.includes(CHANGELOG_MARKER)) fail(`CHANGELOG.md is missing the marker line:\n${CHANGELOG_MARKER}`)
  const list = (ids) => (ids.length ? ids.map(phaseLabel).join('; ') : 'none')
  const entry = [
    '',
    `## ${stamp} — ${what}`,
    '',
    `- **Why:** ${why}`,
    `- **Phases changed:** ${list(changed)}`,
    `- **Impact (dependent phases):** ${list(impacted)}`,
    `- **Flagged "Needs re-check":** ${list(flagged)}`,
    `- **Overall progress after change:** ${progress(data.phases.flatMap((p) => p.tasks)).pct}%`,
  ].join('\n')
  writeFileSync(changelogPath, text.replace(CHANGELOG_MARKER, CHANGELOG_MARKER + '\n' + entry))
}

// ---------- Markdown ----------

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function mermaid() {
  const lines = ['flowchart LR']
  for (const p of data.phases) {
    const pr = progress(p.tasks)
    const here = p.id === data.current.phase ? '▶ ' : ''
    const recheck = p.needsRecheck ? '<br/>⚠ Needs re-check' : ''
    const label = `${here}${p.id} · ${p.name}<br/>${p.status} · ${pr.pct}%${recheck}`.replace(/"/g, '#quot;')
    lines.push(`  P${p.id}["${label}"]`)
  }
  for (const [from, to] of drawnEdges()) {
    lines.push(`  P${from} ${isCritical(from, to) ? '==>' : '-->'} P${to}`)
  }
  const classOf = { 'Not started': 'notstarted', 'In progress': 'inprogress', Blocked: 'blocked', Done: 'done', Verified: 'verified' }
  for (const [status, cls] of Object.entries(classOf)) {
    const s = STATUS_STYLE[status]
    lines.push(`  classDef ${cls} fill:${s.fill},stroke:${s.stroke},color:${s.text}`)
  }
  lines.push('  classDef current stroke-width:4px')
  lines.push('  classDef recheck stroke:#d97706,stroke-dasharray:5 3')
  for (const p of data.phases) {
    lines.push(`  class P${p.id} ${classOf[p.status]}`)
  }
  lines.push(`  class P${data.current.phase} current`)
  const rechecks = data.phases.filter((p) => p.needsRecheck).map((p) => `P${p.id}`)
  if (rechecks.length) lines.push(`  class ${rechecks.join(',')} recheck`)
  return lines.join('\n')
}

function renderMarkdown() {
  const all = data.phases.flatMap((p) => p.tasks)
  const overall = progress(all)
  const cur = phaseMap.get(data.current.phase)
  const openBlockers = data.blockers.filter((b) => b.status === 'Open')
  const out = []

  out.push(`# ${data.project} — build tracker`)
  out.push('')
  out.push('> Generated from `tracker.json` by `npm run tracker`. **Do not edit this file by hand.**')
  out.push('> Visual version: [tracker.html](tracker.html) · History: [CHANGELOG.md](CHANGELOG.md)')
  out.push('')
  out.push(`**Last updated:** ${data.updated || 'not yet logged'}  `)
  out.push(`**Overall progress:** \`${bar(overall.pct)}\` **${overall.pct}%** (${overall.done} of ${overall.total} tasks done)  `)
  out.push(`**Open blockers:** ${openBlockers.length}`)
  out.push('')
  out.push('## ▶ Where we are now')
  out.push('')
  out.push(`**Phase ${cur.id} · ${cur.name}** — ${cur.status}, ${progress(cur.tasks).pct}% done`)
  out.push('')
  out.push(`**Current step:** ${data.current.step}`)
  if (data.current.comment) {
    out.push('')
    out.push(`**Comment:** ${data.current.comment}`)
  }
  out.push('')
  out.push('## Next steps')
  out.push('')
  data.next.forEach((n, i) => out.push(`${i + 1}. ${n}`))
  out.push('')
  out.push('## Flowchart')
  out.push('')
  out.push('Thick arrows = critical path · ▶ = current phase · ⚠ = needs re-check after an upstream change.')
  out.push('')
  out.push('```mermaid')
  out.push(mermaid())
  out.push('```')
  out.push('')
  out.push('## Phases')
  out.push('')
  out.push('| # | Phase | Status | Progress | Depends on | Unlocks | Comment |')
  out.push('|---|---|---|---|---|---|---|')
  for (const p of data.phases) {
    const pr = progress(p.tasks)
    const status = `${STATUS_STYLE[p.status].icon} ${p.status}${p.needsRecheck ? ' · ⚠ re-check' : ''}`
    const deps = p.dependsOn.length ? p.dependsOn.join(', ') : '—'
    const unlocks = dependents(p.id).join(', ') || '—'
    const comment = [p.comment, p.needsRecheck ? `Re-check: ${p.recheckReason}` : ''].filter(Boolean).join(' ')
    const name = p.id === data.current.phase ? `**▶ ${p.name}**` : p.name
    out.push(`| ${p.id} | ${mdEscape(name)} | ${status} | ${pr.pct}% (${pr.done}/${pr.total}) | ${deps} | ${unlocks} | ${mdEscape(comment)} |`)
  }
  out.push('')
  out.push('## Open decisions and blockers')
  out.push('')
  out.push('| ID | Decision / blocker | Blocks | Status | Comment |')
  out.push('|---|---|---|---|---|')
  for (const b of data.blockers) {
    const blocks = [...b.blocksPhases.map((p) => `Phase ${p}`), ...b.blocksTasks.map((t) => `Task ${t}`)].join(', ') || '—'
    out.push(`| ${b.id} | ${mdEscape(b.title)} | ${blocks} | ${b.status} | ${mdEscape(b.comment)} |`)
  }
  out.push('')
  out.push('## Acceptance scenarios')
  out.push('')
  out.push('Each scenario is proven twice: an automated logic test, then a check in the real app.')
  out.push('')
  out.push('| # | Scenario | Logic test | App check |')
  out.push('|---|---|---|---|')
  for (const a of data.acceptance) {
    out.push(
      `| ${a.id} | ${mdEscape(a.title)} | ${STATUS_STYLE[a.logicStatus].icon} ${a.logicStatus} (Phase ${a.logicPhase}) | ${STATUS_STYLE[a.appStatus].icon} ${a.appStatus} (Phase ${a.appPhase}) |`,
    )
  }
  out.push('')
  out.push('## Phase details')
  for (const p of data.phases) {
    const pr = progress(p.tasks)
    out.push('')
    out.push(`### ${p.id === data.current.phase ? '▶ ' : ''}Phase ${p.id} · ${p.name} — ${p.status} (${pr.pct}%)${p.needsRecheck ? ' ⚠ Needs re-check' : ''}`)
    out.push('')
    out.push(`**Outcome:** ${p.outcome}  `)
    out.push(`**Depends on:** ${p.dependsOn.map(phaseLabel).join(', ') || '—'}  `)
    out.push(`**Unlocks:** ${dependents(p.id).map(phaseLabel).join(', ') || '—'}`)
    const bl = blockersFor(p)
    if (bl.length) out.push(`  \n**Blocked by:** ${bl.map((b) => `${b.id} (${b.title})`).join('; ')}`)
    if (p.needsRecheck) out.push(`  \n**Re-check reason:** ${p.recheckReason}`)
    if (p.comment) out.push(`  \n**Comment:** ${p.comment}`)
    out.push('')
    out.push('| Task | Description | Status | Comment |')
    out.push('|---|---|---|---|')
    for (const t of p.tasks) {
      out.push(`| ${t.id} | ${mdEscape(t.title)} | ${STATUS_STYLE[t.status].icon} ${t.status} | ${mdEscape(t.comment)} |`)
    }
  }
  out.push('')
  out.push('## How to update')
  out.push('')
  out.push('1. Edit `docs/tracker/tracker.json` (statuses, comments, current step, next steps, blockers).')
  out.push('2. Run `node scripts/build-tracker.js --log "What changed" --why "Reason" --phases <changed phase ids>`.')
  out.push('3. Review any phase flagged ⚠ Needs re-check; set its `needsRecheck` back to `false` once reviewed, and log that too.')
  out.push('4. Commit `tracker.json`, `TRACKER.md`, `tracker.html` and `CHANGELOG.md` together.')
  out.push('')
  return out.join('\n')
}

// ---------- HTML ----------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function svgFlowchart() {
  const W = 200
  const H = 78
  const COL = 64
  const ROW = 26
  const PAD = 24
  const TOP = 30
  const columns = new Map()
  for (const p of data.phases) {
    const l = level(p.id)
    if (!columns.has(l)) columns.set(l, [])
    columns.get(l).push(p.id)
  }
  const pos = new Map()
  const maxRows = Math.max(...[...columns.values()].map((c) => c.length))
  const totalH = TOP + maxRows * H + (maxRows - 1) * ROW + PAD
  for (const [l, ids] of columns) {
    const colH = ids.length * H + (ids.length - 1) * ROW
    const offset = TOP + (totalH - TOP - PAD - colH) / 2
    ids.forEach((id, i) => pos.set(id, { x: PAD + l * (W + COL), y: offset + i * (H + ROW) }))
  }
  const totalW = PAD * 2 + columns.size * W + (columns.size - 1) * COL
  const parts = []
  parts.push(`<svg viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" role="img" aria-label="Phase flowchart">`)
  parts.push(
    '<defs>' +
      '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8a949c"/></marker>' +
      '<marker id="arrow-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#334155"/></marker>' +
      '</defs>',
  )
  for (const [from, to] of drawnEdges()) {
    const a = pos.get(from)
    const b = pos.get(to)
    const x1 = a.x + W
    const y1 = a.y + H / 2
    const x2 = b.x - 2
    const y2 = b.y + H / 2
    const mx = (x1 + x2) / 2
    const crit = isCritical(from, to)
    parts.push(
      `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${crit ? '#334155' : '#a3acb4'}" stroke-width="${crit ? 3 : 1.5}" marker-end="url(#${crit ? 'arrow-crit' : 'arrow'})"/>`,
    )
  }
  for (const p of data.phases) {
    const { x, y } = pos.get(p.id)
    const s = STATUS_STYLE[p.status]
    const pr = progress(p.tasks)
    const current = p.id === data.current.phase
    const strokeColor = p.needsRecheck ? '#d97706' : s.stroke
    const dash = p.needsRecheck ? ' stroke-dasharray="6 3"' : ''
    parts.push(`<g><title>${esc(`Phase ${p.id} · ${p.name}: ${p.status}, ${pr.pct}% (${pr.done}/${pr.total} tasks)`)}</title>`)
    if (current) {
      parts.push(`<text x="${x}" y="${y - 8}" class="here">▶ You are here</text>`)
    }
    parts.push(
      `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" fill="${s.fill}" stroke="${strokeColor}" stroke-width="${current ? 4 : 1.5}"${dash}/>`,
    )
    parts.push(`<text x="${x + 10}" y="${y + 20}" class="n" fill="${s.text}">${esc(`${p.id} · ${p.name}`)}</text>`)
    parts.push(
      `<text x="${x + 10}" y="${y + 39}" class="s" fill="${s.text}">${esc(`${s.icon} ${p.status} · ${pr.pct}%`)}${p.needsRecheck ? ' <tspan fill="#b45309">⚠ re-check</tspan>' : ''}</text>`,
    )
    parts.push(`<rect x="${x + 10}" y="${y + 52}" width="${W - 20}" height="8" rx="4" fill="#ffffff" opacity="0.8"/>`)
    if (pr.pct > 0) {
      parts.push(`<rect x="${x + 10}" y="${y + 52}" width="${((W - 20) * pr.pct) / 100}" height="8" rx="4" fill="${s.stroke}"/>`)
    }
    parts.push('</g>')
  }
  parts.push('</svg>')
  return parts.join('\n')
}

function badge(status) {
  const s = STATUS_STYLE[status]
  return `<span class="badge" style="background:${s.fill};color:${s.text};border-color:${s.stroke}">${esc(`${s.icon} ${status}`)}</span>`
}

function progressBar(pct, color = '#1f6f5c') {
  return `<span class="bar"><span style="width:${pct}%;background:${color}"></span></span>`
}

function renderHtml() {
  const all = data.phases.flatMap((p) => p.tasks)
  const overall = progress(all)
  const cur = phaseMap.get(data.current.phase)
  const openBlockers = data.blockers.filter((b) => b.status === 'Open')

  const phaseRows = data.phases
    .map((p) => {
      const pr = progress(p.tasks)
      const here = p.id === data.current.phase
      return `<tr${here ? ' class="current"' : ''}>
  <td>${p.id}</td>
  <td>${here ? '▶ ' : ''}${esc(p.name)}</td>
  <td>${badge(p.status)}${p.needsRecheck ? ' <span class="recheck">⚠ re-check</span>' : ''}</td>
  <td class="prog">${progressBar(pr.pct, STATUS_STYLE[p.status].stroke)} ${pr.pct}% <small>(${pr.done}/${pr.total})</small></td>
  <td>${p.dependsOn.join(', ') || '—'}</td>
  <td>${dependents(p.id).join(', ') || '—'}</td>
  <td>${esc([p.comment, p.needsRecheck ? `Re-check: ${p.recheckReason}` : ''].filter(Boolean).join(' '))}</td>
</tr>`
    })
    .join('\n')

  const blockerRows = data.blockers
    .map((b) => {
      const blocks = [...b.blocksPhases.map((p) => `Phase ${p}`), ...b.blocksTasks.map((t) => `Task ${t}`)].join(', ') || '—'
      return `<tr><td>${b.id}</td><td>${esc(b.title)}</td><td>${blocks}</td><td><span class="pill ${b.status === 'Open' ? 'open' : 'resolved'}">${b.status}</span></td><td>${esc(b.comment)}</td></tr>`
    })
    .join('\n')

  const acceptanceRows = data.acceptance
    .map(
      (a) =>
        `<tr><td>${a.id}</td><td>${esc(a.title)}</td><td>${badge(a.logicStatus)} <small>Phase ${a.logicPhase}</small></td><td>${badge(a.appStatus)} <small>Phase ${a.appPhase}</small></td></tr>`,
    )
    .join('\n')

  const details = data.phases
    .map((p) => {
      const pr = progress(p.tasks)
      const here = p.id === data.current.phase
      const bl = blockersFor(p)
      const tasks = p.tasks
        .map((t) => `<tr><td>${t.id}</td><td>${esc(t.title)}</td><td>${badge(t.status)}</td><td>${esc(t.comment)}</td></tr>`)
        .join('\n')
      return `<details${here ? ' open' : ''} class="phase${here ? ' current' : ''}">
<summary><span class="ptitle">${here ? '▶ ' : ''}Phase ${p.id} · ${esc(p.name)}</span> ${badge(p.status)}${p.needsRecheck ? ' <span class="recheck">⚠ Needs re-check</span>' : ''} <span class="prog">${progressBar(pr.pct, STATUS_STYLE[p.status].stroke)} ${pr.pct}%</span></summary>
<p><strong>Outcome:</strong> ${esc(p.outcome)}<br>
<strong>Depends on:</strong> ${esc(p.dependsOn.map(phaseLabel).join(', ') || '—')}<br>
<strong>Unlocks:</strong> ${esc(dependents(p.id).map(phaseLabel).join(', ') || '—')}${bl.length ? `<br><strong>Blocked by:</strong> ${esc(bl.map((b) => `${b.id} (${b.title})`).join('; '))}` : ''}${p.needsRecheck ? `<br><strong>Re-check reason:</strong> ${esc(p.recheckReason)}` : ''}${p.comment ? `<br><strong>Comment:</strong> ${esc(p.comment)}` : ''}</p>
<table><thead><tr><th>Task</th><th>Description</th><th>Status</th><th>Comment</th></tr></thead><tbody>
${tasks}
</tbody></table>
</details>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(data.project)} — build tracker</title>
<!-- Generated from tracker.json by npm run tracker. Do not edit by hand. -->
<style>
  :root { font: 15px/1.5 system-ui, 'Segoe UI', Roboto, sans-serif; color: #1c2321; background: #f6f7f6; }
  body { margin: 0; padding: 24px; max-width: 1400px; margin-inline: auto; }
  h1 { margin: 0 0 4px; font-size: 1.6rem; }
  h2 { margin: 32px 0 12px; font-size: 1.2rem; }
  .muted { color: #5b6662; }
  .card { background: #fff; border: 1px solid #dde2df; border-radius: 14px; padding: 16px 20px; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
  .big { font-size: 1.8rem; font-weight: 700; }
  .now { border-left: 6px solid #2563eb; }
  .chart { overflow-x: auto; }
  .chart svg { display: block; }
  .chart .n { font-size: 13px; font-weight: 600; }
  .chart .s { font-size: 12px; }
  .chart .here { font-size: 12px; font-weight: 700; fill: #2563eb; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6e9e7; vertical-align: top; }
  th { background: #f0f2f1; font-weight: 600; font-size: 13px; }
  tr.current td { background: #eff6ff; }
  .table-wrap { overflow-x: auto; border: 1px solid #dde2df; border-radius: 12px; }
  .badge { display: inline-block; white-space: nowrap; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; border: 1px solid; }
  .recheck { color: #b45309; font-weight: 600; font-size: 12px; white-space: nowrap; }
  .pill { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; }
  .pill.open { background: #fee2e2; color: #7f1d1d; }
  .pill.resolved { background: #dcfce7; color: #14532d; }
  .bar { display: inline-block; width: 90px; height: 8px; background: #e6e9e7; border-radius: 4px; vertical-align: middle; overflow: hidden; }
  .bar > span { display: block; height: 100%; }
  .bar.wide { width: 100%; height: 12px; border-radius: 6px; }
  .prog { white-space: nowrap; }
  details.phase { background: #fff; border: 1px solid #dde2df; border-radius: 12px; margin-bottom: 10px; padding: 4px 16px; }
  details.phase.current { border: 2px solid #2563eb; }
  details.phase summary { cursor: pointer; padding: 10px 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  details.phase .ptitle { font-weight: 600; }
  details.phase table { margin-bottom: 12px; }
  ol { margin: 0; padding-left: 20px; }
  @media (prefers-color-scheme: dark) {
    :root { color: #e8ecea; background: #121615; }
    .card, table, details.phase { background: #1b211f; border-color: #2d3532; }
    th { background: #232a28; }
    th, td { border-color: #2d3532; }
    tr.current td { background: #1e293b; }
    .muted { color: #a3ada9; }
    .table-wrap { border-color: #2d3532; }
  }
</style>
</head>
<body>
<h1>${esc(data.project)} — build tracker</h1>
<div class="muted">Last updated: ${esc(data.updated || 'not yet logged')} · Source: tracker.json · History: <a href="CHANGELOG.md">CHANGELOG.md</a></div>

<div class="summary">
  <div class="card"><div class="muted">Overall progress</div><div class="big">${overall.pct}%</div>${progressBar(overall.pct).replace('class="bar"', 'class="bar wide"')}<div class="muted">${overall.done} of ${overall.total} tasks done</div></div>
  <div class="card"><div class="muted">Phases complete</div><div class="big">${data.phases.filter((p) => COMPLETE.has(p.status)).length} / ${data.phases.length}</div></div>
  <div class="card"><div class="muted">Open blockers</div><div class="big">${openBlockers.length}</div></div>
  <div class="card"><div class="muted">Acceptance scenarios passing (logic / app)</div><div class="big">${data.acceptance.filter((a) => COMPLETE.has(a.logicStatus)).length} / ${data.acceptance.filter((a) => COMPLETE.has(a.appStatus)).length} <span class="muted" style="font-size:1rem">of ${data.acceptance.length}</span></div></div>
</div>

<h2>▶ Where we are now</h2>
<div class="card now">
  <div><strong>Phase ${cur.id} · ${esc(cur.name)}</strong> ${badge(cur.status)} ${progress(cur.tasks).pct}% done</div>
  <p><strong>Current step:</strong> ${esc(data.current.step)}</p>
  ${data.current.comment ? `<p class="muted"><strong>Comment:</strong> ${esc(data.current.comment)}</p>` : ''}
  <strong>Next steps</strong>
  <ol>${data.next.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
</div>

<h2>Flowchart</h2>
<div class="card chart">
${svgFlowchart()}
<div class="legend">${STATUSES.map((s) => badge(s)).join(' ')} <span><strong>Thick arrow</strong> = critical path</span> <span class="recheck">⚠ dashed orange = needs re-check</span></div>
</div>

<h2>Phases</h2>
<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Phase</th><th>Status</th><th>Progress</th><th>Depends on</th><th>Unlocks</th><th>Comment</th></tr></thead>
<tbody>
${phaseRows}
</tbody></table></div>

<h2>Open decisions and blockers</h2>
<div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Decision / blocker</th><th>Blocks</th><th>Status</th><th>Comment</th></tr></thead>
<tbody>
${blockerRows}
</tbody></table></div>

<h2>Acceptance scenarios</h2>
<p class="muted">Each scenario is proven twice: an automated logic test, then a check in the real app.</p>
<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Scenario</th><th>Logic test</th><th>App check</th></tr></thead>
<tbody>
${acceptanceRows}
</tbody></table></div>

<h2>Phase details</h2>
${details}
</body>
</html>
`
}
