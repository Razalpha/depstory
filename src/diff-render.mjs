function safeLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markdownText(value) {
  return safeLine(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]|])/g, "\\$1");
}

function inlineCode(value) {
  const text = safeLine(value);
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function versionTransition(change) {
  const before = change.before?.version ?? "—";
  const after = change.after?.version ?? "—";
  return `${before} → ${after}`;
}

function resolvedTransition(change) {
  const before = change.before?.resolvedVersion ?? "unknown";
  const after = change.after?.resolvedVersion ?? "unknown";
  return `${before} → ${after}`;
}

function statusLabel(status) {
  return status.toUpperCase();
}

export function renderDiffText(report) {
  const { comparison, summary } = report;
  const lines = [
    `${safeLine(report.project)} — dependency changes`,
    `${comparison.baseReference} (${comparison.base.slice(0, 8)}) → ${comparison.headReference} (${comparison.head.slice(0, 8)})`,
    `${summary.total} total · ${summary.added} added · ${summary.removed} removed · ${summary.changed} changed · ${summary.resolved} resolved-only`,
    "",
  ];
  if (report.changes.length === 0) lines.push("No dependency changes found.");
  for (const change of report.changes) {
    lines.push(`${statusLabel(change.status)} ${safeLine(change.name)} · ${safeLine(change.workspace)}`);
    lines.push(`  declared: ${safeLine(versionTransition(change))}`);
    if (change.before?.resolvedVersion || change.after?.resolvedVersion) {
      lines.push(`  resolved: ${safeLine(resolvedTransition(change))}`);
    }
    lines.push(`  manifest: ${safeLine(change.manifestPath)}`);
    lines.push(`  evidence: ${change.usageFiles.length} source, ${change.configurationFiles.length} configuration reference(s)`);
    lines.push(`  review: ${safeLine(change.evidence.note)}`, "");
  }
  return lines.join("\n").trimEnd();
}

function markdownLink(label, url) {
  return url ? `[${markdownText(label)}](${url})` : markdownText(label);
}

function fenced(value, language = "") {
  const text = String(value ?? "");
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${text}\n${fence}`;
}

export function renderDiffMarkdown(report) {
  const { comparison, summary } = report;
  const lines = [
    `# Dependency changes for ${markdownText(report.project)}`,
    "",
    `${inlineCode(comparison.baseReference)} (${inlineCode(comparison.base.slice(0, 8))}) → ${inlineCode(comparison.headReference)} (${inlineCode(comparison.head.slice(0, 8))})`,
    "",
    `**${summary.total} total:** ${summary.added} added, ${summary.removed} removed, ${summary.changed} changed, ${summary.resolved} resolved-only.`,
    "",
  ];
  if (report.changes.length === 0) {
    lines.push("No dependency changes found.", "");
  } else {
    lines.push("| Status | Package | Declared | Resolved | Evidence |", "| --- | --- | --- | --- | --- |");
    for (const change of report.changes) {
      lines.push(`| ${statusLabel(change.status)} | ${inlineCode(change.name)} | ${markdownText(versionTransition(change))} | ${markdownText(resolvedTransition(change))} | ${change.usageFiles.length} source, ${change.configurationFiles.length} config |`);
    }
    lines.push("");
  }

  for (const change of report.changes) {
    lines.push(`## ${statusLabel(change.status)} ${inlineCode(change.name)}`, "");
    lines.push(`- Workspace: ${inlineCode(change.workspace)} (${inlineCode(change.workspacePath)})`);
    lines.push(`- Manifest: ${inlineCode(change.manifestPath)}`);
    lines.push(`- Assessment: **${markdownText(change.evidence.assessment)}** — ${markdownText(change.evidence.note)}`);
    if (change.introduction) {
      const commitLabel = `${change.introduction.shortHash}: ${change.introduction.subject}`;
      lines.push(`- Introduction: ${markdownLink(commitLabel, change.links.commit)}`);
    }
    if (change.links.pullRequest) {
      lines.push(`- Pull request: ${markdownLink(`#${change.links.pullRequest.number}`, change.links.pullRequest.url)}`);
    }
    if (change.links.issues.length) {
      lines.push(`- Issues: ${change.links.issues.map((issue) => markdownLink(`#${issue.number}`, issue.url)).join(", ")}`);
    }
    if (change.usageFiles.length) {
      lines.push(`- Source references: ${change.usageFiles.map(inlineCode).join(", ")}`);
    }
    if (change.configurationFiles.length) {
      lines.push(`- Configuration references: ${change.configurationFiles.map(inlineCode).join(", ")}`);
    }
    lines.push("");
  }

  if (report.manifestPatch) {
    lines.push("## Manifest patch", "", fenced(report.manifestPatch, "diff"), "");
    if (report.manifestPatchTruncated) lines.push("_Patch truncated at 256 KiB._", "");
  }
  lines.push("_Static evidence is a review aid, not an automatic removal decision._");
  return lines.join("\n").trimEnd();
}

function changeCard(change) {
  const sources = change.usageFiles.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join("");
  const configs = change.configurationFiles.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join("");
  const commit = change.links.commit && change.introduction
    ? `<a href="${escapeHtml(change.links.commit)}">${escapeHtml(change.introduction.shortHash)}: ${escapeHtml(change.introduction.subject)}</a>`
    : "Not found in the available history";
  const related = [
    change.links.pullRequest
      ? `<a href="${escapeHtml(change.links.pullRequest.url)}">PR #${change.links.pullRequest.number}</a>`
      : "",
    ...change.links.issues.map((issue) =>
      `<a href="${escapeHtml(issue.url)}">Issue #${issue.number}</a>`,
    ),
  ].filter(Boolean).join(", ");
  return `<article class="change ${escapeHtml(change.status)}">
    <div class="rail" aria-hidden="true"></div>
    <div class="card">
      <header><span class="status">${escapeHtml(statusLabel(change.status))}</span><h2>${escapeHtml(change.name)}</h2></header>
      <p class="workspace">${escapeHtml(change.workspace)} · <code>${escapeHtml(change.manifestPath)}</code></p>
      <dl>
        <div><dt>Declared</dt><dd>${escapeHtml(versionTransition(change))}</dd></div>
        <div><dt>Resolved</dt><dd>${escapeHtml(resolvedTransition(change))}</dd></div>
        <div><dt>Introduced</dt><dd>${commit}</dd></div>
      </dl>
      ${related ? `<p>Related: ${related}</p>` : ""}
      <p class="assessment"><strong>${escapeHtml(change.evidence.assessment)}</strong> ${escapeHtml(change.evidence.note)}</p>
      ${sources ? `<h3>Source references</h3><ul>${sources}</ul>` : ""}
      ${configs ? `<h3>Configuration references</h3><ul>${configs}</ul>` : ""}
    </div>
  </article>`;
}

export function renderDiffHtml(report) {
  const { comparison, summary } = report;
  const cards = report.changes.length
    ? report.changes.map(changeCard).join("\n")
    : '<p class="empty">No dependency changes found.</p>';
  const patch = report.manifestPatch
    ? `<details><summary>Manifest patch${report.manifestPatchTruncated ? " (truncated)" : ""}</summary><pre>${escapeHtml(report.manifestPatch)}</pre></details>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dependency changes · ${escapeHtml(report.project)}</title>
  <style>
    :root{color-scheme:light dark;--bg:#0d1117;--panel:#161b22;--text:#e6edf3;--muted:#8b949e;--line:#30363d;--green:#3fb950;--red:#f85149;--amber:#d29922;--blue:#58a6ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}main{width:min(920px,calc(100% - 32px));margin:48px auto 80px}h1{font-size:clamp(28px,5vw,48px);line-height:1.1;margin:0 0 12px}.range,.workspace{color:var(--muted)}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:32px 0}.metric{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.metric strong{display:block;font-size:24px}.timeline{position:relative}.change{display:grid;grid-template-columns:20px 1fr;gap:16px}.rail{border-left:2px solid var(--line);position:relative;margin-left:9px}.rail:before{content:"";position:absolute;width:12px;height:12px;border-radius:50%;background:var(--blue);left:-7px;top:28px}.added .rail:before{background:var(--green)}.removed .rail:before{background:var(--red)}.changed .rail:before{background:var(--amber)}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px;margin-bottom:18px}.card header{display:flex;align-items:center;gap:12px}.card h2{margin:0;font-size:22px}.status{font-size:11px;font-weight:700;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:3px 8px}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}dl div{min-width:0}dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}dd{margin:4px 0;overflow-wrap:anywhere}.assessment{border-left:3px solid var(--blue);padding-left:12px}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}a{color:var(--blue)}h3{font-size:13px;text-transform:uppercase;color:var(--muted);letter-spacing:.05em;margin-bottom:4px}ul{margin-top:4px}.note{color:var(--muted);margin-top:32px}.empty,details{padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-top:18px}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow:auto}@media(max-width:700px){.summary{grid-template-columns:repeat(2,1fr)}dl{grid-template-columns:1fr}.change{grid-template-columns:12px 1fr}.rail{margin-left:5px}}
  </style>
</head>
<body>
  <main>
    <h1>Dependency changes</h1>
    <p class="range">${escapeHtml(report.project)} · ${escapeHtml(comparison.baseReference)} <code>${escapeHtml(comparison.base.slice(0, 8))}</code> → ${escapeHtml(comparison.headReference)} <code>${escapeHtml(comparison.head.slice(0, 8))}</code></p>
    <section class="summary" aria-label="Change summary">
      <div class="metric"><strong>${summary.total}</strong>Total</div><div class="metric"><strong>${summary.added}</strong>Added</div><div class="metric"><strong>${summary.removed}</strong>Removed</div><div class="metric"><strong>${summary.changed}</strong>Changed</div><div class="metric"><strong>${summary.resolved}</strong>Resolved-only</div>
    </section>
    <section class="timeline">${cards}</section>
    ${patch}
    <p class="note">Static evidence is a review aid, not an automatic removal decision. Generated by depstory.</p>
  </main>
</body>
</html>`;
}
