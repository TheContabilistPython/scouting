// Two players side by side: who they are, their functions (when they play the same position) and every
// metric as mirrored bars of percentiles, each within his own position and league.

import {
  el, state, num, euros, ratingChip, pctChip, metricIndex, metricShort, metricValue, face, roleName, playerLink,
  functionsOf, functionShort, functionLabel, GROUPS, card, pageHead, playerRef, findRef, playerSearch,
} from "./comum.js";

function go(a, b) {
  const query = new URLSearchParams();
  if (a) query.set("a", a);
  if (b) query.set("b", b);
  location.hash = "#/comparar" + ([...query].length ? `?${query}` : "");
}

const fact = (label, value) => el("div", {}, el("dt", { text: label }), el("dd", {}, value));

function playerHead(ref, side, clear) {
  const p = ref.player;
  return el("div", { class: `ooyl-card sc-compare__head is-${side}` },
    el("div", { class: "sc-compare__who" }, face(ref.slug, p, "xl"),
      el("div", { class: "sc-player__titles" },
        el("p", { class: "ooyl-kicker", text: [ref.league, roleName(p.pos), p.fn ? functionLabel(p).toLowerCase() : null].filter(Boolean).join(" · ") }),
        el("h2", { class: "ooyl-headline", text: p.nome }),
        el("p", { class: "ooyl-sub", text: [p.time, p.idade != null ? `${p.idade} anos` : null, p.altura ? `${p.altura} cm` : null].filter(Boolean).join(" · ") }))),
    el("dl", { class: "sc-facts" },
      fact("Minutos", num(p.min, 0)), fact("Nota", ratingChip(p.nota)), fact("Valor", euros(p.valor)), fact("Perfil", pctChip(p.perfil))),
    el("div", { class: "sc-actions" },
      el("a", { class: "ooyl-btn ooyl-btn--ghost ooyl-btn--sm", href: playerLink(ref.slug, p), text: "Abrir jogador" }),
      el("button", { class: "ooyl-btn ooyl-btn--ghost ooyl-btn--sm", text: "Trocar", onclick: clear })));
}

export function compareView(params) {
  const a = findRef(params.get("a")), b = findRef(params.get("b"));
  const refA = a && playerRef(a.slug, a.player), refB = b && playerRef(b.slug, b.player);
  const head = pageHead("Comparar jogadores", "Cada percentil compara o jogador com os regulares da posição dele, na liga dele "
    + `(${num(state.meta.minimo, 0)}+ minutos). As barras mostram o percentil; os números, o valor por 90 e, entre parênteses, o percentil.`);
  const side = (ref, which) => {
    if (ref) return playerHead(ref, which === "a" ? "home" : "away", () => (which === "a" ? go(null, refB) : go(refA, null)));
    const other = which === "a" ? b : a;
    return el("div", { class: `ooyl-card sc-compare__pick is-${which === "a" ? "home" : "away"}` },
      el("p", { class: "ooyl-kicker", text: which === "a" ? "Jogador 1" : "Jogador 2" }),
      el("p", { class: "sc-note", text: other
        ? `Busque pelo nome ou pelo time. Sem busca, a lista mostra os maiores perfis entre os ${roleName(other.player.pos).toLowerCase()}.`
        : "Busque pelo nome ou pelo time, nas ligas carregadas." }),
      playerSearch("Buscar jogador ou time",
        (slug, p) => (which === "a" ? go(playerRef(slug, p), refB) : go(refA, playerRef(slug, p))), other ? other.player : null));
  };
  const heads = el("div", { class: "sc-compare__heads" }, side(a, "a"), side(b, "b"));
  if (!a || !b) return el("section", { class: "view" }, head, heads);

  const pa = a.player, pb = b.player;
  let leadA = 0, leadB = 0;
  const row = (label, title, xa, xb, va, vb, bare = false) => {  // bare: the value is the score itself
    const lead = xa != null && xb != null ? (xa > xb ? "a" : xb > xa ? "b" : "") : "";
    if (lead === "a") leadA += 1;
    if (lead === "b") leadB += 1;
    const text = (v, x) => (bare || x == null ? v : `${v} (${x})`);
    return el("div", { class: "ooyl-compare__row", title },
      el("span", { class: "ooyl-compare__v is-home" + (lead === "a" ? " is-lead" : ""), text: text(va, xa) }),
      el("span", { class: "ooyl-compare__name", text: label }),
      el("span", { class: "ooyl-compare__v is-away" + (lead === "b" ? " is-lead" : ""), text: text(vb, xb) }),
      el("span", { class: "ooyl-compare__bars", "aria-hidden": "true" },
        el("span", { class: "ooyl-compare__half is-home" }, el("i", { class: lead === "a" ? "is-lead" : null, style: `width: ${xa ?? 0}%` })),
        el("span", { class: "ooyl-compare__half is-away" }, el("i", { class: lead === "b" ? "is-lead" : null, style: `width: ${xb ?? 0}%` }))));
  };
  const sections = [];
  const same = pa.pos && pa.pos === pb.pos;
  if (same && functionsOf(pa.pos).length) {
    sections.push(el("p", { class: "ooyl-compare__group", text: "Funções" }),
      functionsOf(pa.pos).map((f, i) => row(functionShort(pa.pos, f.nome), `Nota de ${f.nome}`, pa.fs[i], pb.fs[i],
        pa.fs[i] ?? "–", pb.fs[i] ?? "–", true)));
  }
  for (const [group, metrics] of GROUPS) {
    if (group === "Goleiro" && pa.pos !== "GOL" && pb.pos !== "GOL") continue;
    sections.push(el("p", { class: "ooyl-compare__group", text: group }),
      metrics.map((name) => {
        const i = metricIndex(name);
        return row(metricShort(name), name, pa.p[i], pb.p[i], metricValue(pa, name), metricValue(pb, name));
      }));
  }
  const note = same
    ? `Mesma posição (${roleName(pa.pos).toLowerCase()}), cada um comparado com os regulares da própria liga.`
    : "Posições diferentes: cada percentil compara o jogador com a posição dele, então leia como estilo, não como duelo direto.";
  const compare = el("div", { class: "ooyl-compare" },
    el("div", { class: "ooyl-compare__legend" },
      el("span", {}, el("i", { class: "swatch", style: "background: var(--home)" }), " ", el("span", { class: "tname", text: pa.nome })),
      el("span", {}, el("span", { class: "tname", text: pb.nome }), " ", el("i", { class: "swatch", style: "background: var(--away)" }))),
    sections);
  const summary = `${pa.nome} vai melhor em ${leadA} ${leadA === 1 ? "item" : "itens"}; ${pb.nome}, em ${leadB}.`;
  return el("section", { class: "view" }, head,
    el("div", { class: "sc-actions" },
      el("button", { class: "ooyl-btn ooyl-btn--ghost ooyl-btn--sm", text: "Inverter lados", onclick: () => go(refB, refA) })),
    heads, card("Métrica por métrica", `${note} ${summary}`, compare));
}
