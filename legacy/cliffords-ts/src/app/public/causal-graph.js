const COLORS = {
  node: "#ffffff",
  stroke: "#2563eb",
  strokeMuted: "#94a3b8",
  text: "#475569",
  root: "#1d4ed8"
};

export function renderCausalGraph(container, nodes, options = {}) {
  if (!container || !nodes.length) {
    container.innerHTML = "";
    return;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = options.animate !== false && !reduced;
  const gap = 48;
  const nodeW = 80;
  const nodeH = 36;
  const pad = 20;
  const width = pad * 2 + nodes.length * nodeW + (nodes.length - 1) * gap;
  const height = 64;
  const cy = height / 2;

  const positions = nodes.map((node, i) => ({
    ...node,
    x: pad + i * (nodeW + gap) + nodeW / 2,
    y: cy
  }));

  const parts = [`<svg class="causal-graph" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Causal chain">`];

  positions.slice(0, -1).forEach((node, i) => {
    const next = positions[i + 1];
    const x1 = node.x + nodeW / 2 - 4;
    const x2 = next.x - nodeW / 2 + 4;
    const dashed = next.isResponse ? "4 4" : "none";
    const stroke = next.isResponse ? COLORS.strokeMuted : COLORS.stroke;
    parts.push(`<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dashed}"/>`);
  });

  positions.forEach((node) => {
    const label = node.asset || node.label || "?";
    const short = label.length > 10 ? `${label.slice(0, 8)}…` : label;
    const x = node.x - nodeW / 2;
    const y = cy - nodeH / 2;
    const stroke = node.isInitiating ? COLORS.root : COLORS.stroke;
    const sw = node.isInitiating ? 2 : 1.5;
    parts.push(`<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" fill="${COLORS.node}" stroke="${stroke}" stroke-width="${sw}"/>`);
    parts.push(`<text class="causal-node-label" x="${node.x}" y="${cy + 4}" text-anchor="middle">${esc(short)}</text>`);
  });

  parts.push("</svg>");
  container.innerHTML = parts.join("");
}

function esc(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function chainToGraphNodes(chain, alarms) {
  const responseTags = new Set(["BAT101_DISCHARGE_HIGH"]);
  return chain.map((step, index) => {
    const alarm = alarms.find((a) => a.tag === step.tag);
    return {
      label: step.label,
      tag: step.tag,
      asset: alarm?.asset || step.asset || step.label,
      isInitiating: index === 0,
      isResponse: step.tag ? responseTags.has(String(step.tag).toUpperCase()) : false
    };
  });
}