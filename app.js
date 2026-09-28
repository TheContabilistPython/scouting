// Scouting page: the ranking by position, the young players, each player's page, the comparison of two
// players and the eleven built with chemistry and the team's style. Data: api/meta.json, api/ligas.json
// and api/liga/{slug}.json, answered by painel.py on this PC and written as files by publicar.py.
// Routes: #/ranking?pos=&fn=&idade=&min=&q=, #/jovens, #/jogador/{liga}/{id}, #/comparar?a=&b=, #/selecao. The Draft has
// its own page (draft.html, draft-main.js) and its own site, /draft/.

import {
  $, el, state, localGet, localSet, num, euros, ratingChip, pctChip, pctStep, chip, plain, GROUPS, metricIndex, metricShort,
  metricValue, face, country, roleName, playerLink, functionsOf, functionShort, functionLabel, functionScores, highlights,
  getJSON, bars, card, pageHead, playerRef,
} from "./comum.js";
import { compareView } from "./comparar.js";
import { selectionView } from "./selecao.js";

// ---- routing

function route() {
  const hash = location.hash.replace(/^#\/?/, "") || "ranking";
  const [path, query = ""] = hash.split("?");
  const parts = path.split("/");
  return { view: parts[0] || "ranking", parts, params: new URLSearchParams(query) };
}

function render() {
  const { view, parts, params } = route();
  for (const tab of document.querySelectorAll("#main-tabs .ooyl-tab")) {
    tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  }
  let content;
  if (view === "jogador") content = playerView(parts[1], Number(parts[2]));
  else if (view === "jovens") content = youngView();
  else if (view === "comparar") content = compareView(params);
  else if (view === "selecao") content = selectionView();
  else content = rankingView(params);
  $("#app").replaceChildren(content);
  const data = state.data[view === "jogador" ? parts[1] : state.league];
  const scope = view === "comparar" || view === "selecao" ? state.leagues.map((l) => l.nome).join(" + ")
    : data ? `${data.nome} · ${data.jogos} jogos até ${data.ate}` : "";
  $("#meta").textContent = [scope, state.meta.local ? "uso interno" : null].filter(Boolean).join(" · ");
  window.scrollTo(0, 0);
}

// ---- ranking

function rankingView(params) {
  const slug = state.league, data = state.data[slug];
  const filters = { pos: params.get("pos") || "todas", idade: params.get("idade") || "todas",
                    min: Number(params.get("min") || state.meta.minimo), q: params.get("q") || "",
                    fn: params.get("fn") || "geral" };
  const roles = ["todas", ...Object.keys(state.meta.papeis)];
  const holder = el("div", { class: "ooyl-card" });
  const count = el("span", { class: "sc-count" });
  const tabs = el("div", { class: "ooyl-tabs ooyl-tabs--segmented", role: "tablist", "aria-label": "Posição" },
    roles.map((role) => el("button", {
      class: "ooyl-tab", role: "tab", "aria-selected": String(role === filters.pos),
      text: role === "todas" ? "Todas" : state.meta.papeis[role].nome,
      onclick: (ev) => {
        filters.pos = role;
        filters.fn = "geral";
        for (const b of tabs.children) b.setAttribute("aria-selected", String(b === ev.currentTarget));
        state.sort = { key: "perfil", dir: -1 };
        drawFunctionTabs();
        update();
      },
    })));
  // Within a position: rank by the overall profile or by one function's score (how he plays it).
  const fnHolder = el("div", { class: "sc-fn-tabs" });
  function drawFunctionTabs() {
    const functions = filters.pos === "todas" ? [] : functionsOf(filters.pos);
    if (!functions.length) { fnHolder.replaceChildren(); return; }
    const pick = (key, index) => {
      filters.fn = key;
      state.sort = key === "geral" ? { key: "perfil", dir: -1 } : { key: `f:${index}`, dir: -1 };
      drawFunctionTabs();
      update();
    };
    fnHolder.replaceChildren(el("span", { class: "sc-fn-tabs__label", text: "Ordenar por" }),
      el("div", { class: "ooyl-tabs ooyl-tabs--segmented", role: "tablist", "aria-label": "Função" },
        el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(filters.fn === "geral"), text: "Perfil geral",
                       onclick: () => pick("geral") }),
        functions.map((f, i) => el("button", { class: "ooyl-tab", role: "tab", "aria-selected": String(filters.fn === f.chave),
          text: functionShort(filters.pos, f.nome), title: `Média dos percentis de: ${f.metricas.map(metricShort).join(", ")}`,
          onclick: () => pick(f.chave, i) }))));
  }
  if (filters.fn !== "geral") {
    const index = functionsOf(filters.pos).findIndex((f) => f.chave === filters.fn);
    if (index < 0) filters.fn = "geral"; else state.sort = { key: `f:${index}`, dir: -1 };
  }
  // A function's score, or a metric column the table no longer shows, can't carry over from another view.
  if ((filters.fn === "geral" && state.sort.key.startsWith("f:")) || (filters.pos === "todas" && state.sort.key.startsWith("m:"))) {
    state.sort = { key: "perfil", dir: -1 };
  }
  drawFunctionTabs();
  const ages = [["todas", "Todas as idades"], ["21", "Até 21 anos"], ["23", "Até 23 anos"], ["25", "Até 25 anos"], ["28", "Até 28 anos"]];
  const minutes = [270, 450, 900, 1350, 1800];
  const controls = el("div", { class: "filter-row sc-filters" },
    el("select", { class: "sc-select", "aria-label": "Idade", onchange: (ev) => { filters.idade = ev.target.value; update(); } },
      ages.map(([value, text]) => el("option", { value, text, selected: value === filters.idade }))),
    el("select", { class: "sc-select", "aria-label": "Minutos", onchange: (ev) => { filters.min = Number(ev.target.value); update(); } },
      minutes.map((m) => el("option", { value: m, text: `${num(m, 0)}+ minutos`, selected: m === filters.min }))),
    el("input", { class: "sc-search", type: "search", placeholder: "Buscar jogador ou time", value: filters.q,
                  "aria-label": "Buscar", oninput: (ev) => { filters.q = ev.target.value; update(); } }),
    count);

  function update() {
    const query = new URLSearchParams();
    if (filters.pos !== "todas") query.set("pos", filters.pos);
    if (filters.idade !== "todas") query.set("idade", filters.idade);
    if (filters.min !== state.meta.minimo) query.set("min", filters.min);
    if (filters.q) query.set("q", filters.q);
    if (filters.fn !== "geral") query.set("fn", filters.fn);
    state.back = "#/ranking" + ([...query].length ? `?${query}` : "");
    history.replaceState(null, "", state.back);  // the filters stay in the address, without a new render
    drawTable();
  }

  function drawTable() {
    const text = plain(filters.q);
    const list = data.jogadores.filter((p) =>
      (filters.pos === "todas" || p.pos === filters.pos) && p.min >= filters.min
      && (filters.idade === "todas" || (p.idade != null && p.idade <= Number(filters.idade)))
      && (!text || plain(p.nome).includes(text) || plain(p.time).includes(text)));
    const functions = filters.pos === "todas" ? [] : functionsOf(filters.pos);
    const chosen = functions.find((f) => f.chave === filters.fn);
    const metrics = filters.pos === "todas" ? [] : chosen ? chosen.metricas : state.meta.papeis[filters.pos].metricas;
    const value = (p, key) => key.startsWith("m:") ? p.p[Number(key.slice(2))]
      : key.startsWith("f:") ? p.fs[Number(key.slice(2))] : p[key];
    const { key, dir } = state.sort;
    list.sort((a, b) => {
      const va = value(a, key), vb = value(b, key);
      if (va == null && vb == null) return b.min - a.min;
      if (va == null) return 1;
      if (vb == null) return -1;
      return typeof va === "string" ? dir * va.localeCompare(vb) : dir * (va - vb) || b.min - a.min;
    });
    const head = (label, sortKey, title, left) => el("th", {
      class: [left ? "left" : "", sortKey === key ? "is-sorted" : ""].join(" ").trim() || null,
      "data-sort": sortKey || null, title,
      onclick: sortKey ? () => { state.sort = { key: sortKey, dir: sortKey === key ? -dir : (sortKey === "nome" ? 1 : -1) }; drawTable(); } : null,
    }, label + (sortKey === key ? (dir < 0 ? " ↓" : " ↑") : ""));
    const table = el("table", { class: "sc-table" },
      el("thead", {}, el("tr", {},
        head("#", null), head("Jogador", "nome", null, true),
        filters.pos === "todas" ? head("Pos.", "pos") : null,
        head("Idade", "idade"), head("Min", "min"), head("Nota", "nota", "Nota média do SofaScore"),
        head("Valor", "valor", "Valor de mercado estimado pelo SofaScore"),
        head("Perfil", "perfil", "Média dos percentis das métricas da posição (50 = regular mediano)"),
        head("Função", "fnome", `A função de maior nota; equilibrado quando as duas maiores ficam a menos de ${state.meta.equilibrio} pontos`, true),
        functions.map((f, i) => head(functionShort(filters.pos, f.nome), `f:${i}`,
          `Nota de ${f.nome}: média dos percentis de ${f.metricas.map(metricShort).join(", ")}`)),
        metrics.map((name) => head(metricShort(name), `m:${metricIndex(name)}`, name)),
        filters.pos === "todas" ? head("Destaques", null, "As três métricas da posição em que ele vai melhor", true) : null)),
      el("tbody", {}, list.slice(0, 300).map((p, i) => el("tr", { onclick: () => { location.hash = playerLink(slug, p); } },
        el("td", { class: "sc-rank", text: i + 1 }),
        el("td", { class: "left" }, el("div", { class: "sc-who" }, face(slug, p, "lg"),
          el("div", {}, el("a", { href: playerLink(slug, p), text: p.nome, onclick: (ev) => ev.stopPropagation() }),
            el("small", { text: p.time })))),
        filters.pos === "todas" ? el("td", { class: "muted", text: p.pos || "–", title: roleName(p.pos) }) : null,
        el("td", { text: p.idade ?? "–" }), el("td", { text: num(p.min, 0) }),
        el("td", {}, ratingChip(p.nota)), el("td", { class: "muted", text: euros(p.valor) }),
        el("td", {}, pctChip(p.perfil, p.perfil == null ? `Menos de ${state.meta.minimo} minutos ou sem posição definida` : null)),
        el("td", { class: "left sc-fn-cell", text: functionLabel(p), title: functionScores(p) || null }),
        functions.map((f, i) => el("td", {}, pctChip(p.fs[i], f.nome))),
        metrics.map((name) => el("td", {}, pctChip(p.p[metricIndex(name)], `${name}: ${metricValue(p, name)}`))),
        filters.pos === "todas" ? el("td", { class: "left sc-marks", text: highlights(p) || "–" }) : null))));
    holder.replaceChildren(el("div", { class: "scroll" }, table));
    count.textContent = list.length > 300 ? `300 de ${list.length} jogadores` : `${list.length} jogadores`;
  }

  drawTable();
  return el("section", { class: "view" },
    pageHead("Ranking por posição", `${data.nome}. Percentis dentro da posição, entre os jogadores com `
      + `${num(state.meta.minimo, 0)}+ minutos; perfil é a média dos percentis das métricas da posição `
      + "(50 = o regular mediano). Posição: a que ele mais ocupou como titular, lida da formação. Função: como ele "
      + "joga a posição, pela média dos percentis das métricas de cada função (passe o mouse no botão para ver quais)."),
    tabs, fnHolder, controls, holder);
}

// ---- young players

function youngView() {
  const slug = state.league, data = state.data[slug], age = state.meta.jovem;
  const cards = Object.entries(state.meta.papeis).map(([role, info]) => {
    const best = data.jogadores.filter((p) => p.pos === role && p.perfil != null && p.idade != null && p.idade <= age)
      .sort((a, b) => b.perfil - a.perfil).slice(0, 5);
    return card(info.nome, null,
      best.length ? el("div", { class: "sc-list" }, best.map((p) => el("div", {
        class: "sc-row", onclick: () => { state.back = "#/jovens"; location.hash = playerLink(slug, p); } },
        face(slug, p, "lg"),
        el("div", { class: "sc-who" }, el("div", {}, el("a", { href: playerLink(slug, p), text: p.nome, onclick: (ev) => ev.stopPropagation() }),
          el("small", { text: `${p.time} · ${p.idade} anos · ${functionLabel(p).toLowerCase()} · ${highlights(p, 2)}` }))),
        el("span", { class: "sc-meta", text: euros(p.valor) }),
        pctChip(p.perfil, "Perfil")))) : el("p", { class: "sc-note", text: `Nenhum regular até ${age} anos.` }));
  });
  return el("section", { class: "view" },
    pageHead(`Até ${age} anos`, `${data.nome}: os cinco maiores perfis de cada posição entre os jogadores de até `
      + `${age} anos (idade de hoje) com ${num(state.meta.minimo, 0)}+ minutos. Perfil 50 = o regular mediano da posição.`),
    el("div", { class: "sc-columns" }, cards));
}

// ---- player

function similar(player) {
  const names = state.meta.papeis[player.pos].metricas, idx = names.map(metricIndex);
  const vector = (p) => idx.map((i) => p.p[i] ?? 50);
  const base = vector(player), found = [];
  for (const [slug, data] of Object.entries(state.data)) {
    for (const other of data.jogadores) {
      if (other.pos !== player.pos || other.perfil == null || other.id === player.id) continue;
      const v = vector(other);
      const distance = Math.sqrt(v.reduce((s, x, k) => s + (x - base[k]) ** 2, 0) / v.length);
      found.push({ slug, player: other, league: data.nome, score: Math.max(0, Math.round(100 - distance)) });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, 8);
}

function functionBars(player) {
  return el("div", { class: "sc-bars" }, functionsOf(player.pos).map((f, i) => {
    const score = player.fs[i];
    return el("div", { class: "sc-fn" + (player.fn === f.chave ? " is-mine" : "") },
      el("span", { class: "sc-bar__label", text: functionShort(player.pos, f.nome) }),
      el("span", { class: "sc-bar__track" }, el("span", { class: `sc-bar__fill sc-step-${pctStep(score ?? 0)}`, style: `width: ${score ?? 0}%` })),
      el("span", { class: "sc-bar__pct", text: score ?? "–" }),
      el("p", { class: "sc-fn__metrics", text: f.metricas.map(metricShort).join(" · ") }));
  }));
}

function playerView(slug, id) {
  const data = state.data[slug], player = data && data.jogadores.find((p) => p.id === id);
  if (!player) return el("div", { class: "empty", text: "Jogador não encontrado nesta base." });
  const regular = player.perfil != null;
  const tile = (label, value, note) => el("div", { class: "ooyl-tile" },
    el("span", { class: "ooyl-tile__label", text: label }), el("span", { class: "ooyl-tile__value", text: value }),
    note ? el("span", { class: "ooyl-tile__note", text: note }) : null);
  const details = [player.time, player.idade != null ? `${player.idade} anos` : null,
    player.altura ? `${player.altura} cm` : null, player.pais && country(player.pais)].filter(Boolean).join(" · ");
  const parts = [
    el("div", { class: "sc-actions" },
      el("a", { class: "ooyl-btn ooyl-btn--ghost ooyl-btn--sm", href: state.back, text: "← Voltar" }),
      el("a", { class: "ooyl-btn ooyl-btn--sm", href: `#/comparar?a=${playerRef(slug, player)}`, text: "Comparar com outro jogador" })),
    el("div", { class: "ooyl-card sc-player" }, face(slug, player, "xl"),
      el("div", { class: "sc-player__titles" },
        el("p", { class: "ooyl-kicker", text: [data.nome, roleName(player.pos), player.fnome].filter(Boolean).join(" · ") }),
        el("h1", { class: "ooyl-headline ooyl-headline--lg", text: player.nome }),
        el("p", { class: "ooyl-sub", text: details + (player.times && player.times !== player.time ? ` · na temporada: ${player.times}` : "") })),
      el("div", { class: "ooyl-tiles" },
        tile("Minutos", num(player.min, 0), `${player.jogos} jogos, ${player.tit} como titular`),
        tile("Nota média", player.nota == null ? "–" : num(player.nota, 2), "SofaScore"),
        tile("Valor", euros(player.valor), "estimativa do SofaScore"),
        tile("Perfil", regular ? String(player.perfil) : "–", regular ? "50 = regular mediano da posição" : `menos de ${state.meta.minimo} min`))),
  ];
  if (!regular) {
    parts.push(el("p", { class: "sc-note", text: `Com menos de ${num(state.meta.minimo, 0)} minutos (ou sem posição definida pela formação), `
      + "ele fica fora dos percentis. Os números por 90 abaixo são só referência." }));
  } else {
    if (functionsOf(player.pos).length) {
      parts.push(card(`Função em campo: ${player.fnome}`,
        "A nota de cada função é a média dos percentis das métricas dela (listadas embaixo). A função é a de maior nota; "
        + `equilibrado quando as duas maiores ficam a menos de ${state.meta.equilibrio} pontos.`, functionBars(player)));
    }
    parts.push(card(`Métricas de ${roleName(player.pos).toLowerCase()}`,
      "Valor por 90 minutos e percentil entre os regulares da posição na liga.", bars(player, state.meta.papeis[player.pos].metricas)));
  }
  const groups = GROUPS.filter(([name]) => name !== "Goleiro" || player.pos === "GOL")
    .map(([name, metrics]) => el("div", { class: "sc-group" }, el("h3", { text: name }), bars(player, metrics)));
  parts.push(card("Todas as métricas", "Percentil entre os regulares da mesma posição; físico só nos jogos com medição.",
    el("div", { class: "sc-groups" }, groups)));
  if (regular) {
    const found = similar(player);
    parts.push(card("Parecidos", "Mesma posição, nas ligas carregadas: quanto mais perto os percentis das métricas da posição, "
      + "maior a semelhança (0 a 100). Percentis são de cada liga: parecido no estilo, não no nível.",
      el("div", { class: "sc-list" }, found.map((f) => el("div", {
        class: "sc-row", onclick: () => { location.hash = playerLink(f.slug, f.player); } },
        face(f.slug, f.player, "lg"),
        el("div", { class: "sc-who" }, el("div", {}, el("a", { href: playerLink(f.slug, f.player), text: f.player.nome, onclick: (ev) => ev.stopPropagation() }),
          el("small", { text: `${f.player.time} · ${f.league} · ${f.player.idade ?? "?"} anos · ${functionLabel(f.player).toLowerCase()} · perfil ${f.player.perfil}` }))),
        el("span", { class: "sc-meta", text: euros(f.player.valor) }),
        el("a", { class: "ooyl-btn ooyl-btn--ghost ooyl-btn--sm", text: "Comparar", title: `Comparar com ${player.nome}`,
                  href: `#/comparar?a=${playerRef(slug, player)}&b=${playerRef(f.slug, f.player)}`, onclick: (ev) => ev.stopPropagation() }),
        chip(String(f.score), pctStep(f.score), "Semelhança"))))));
  }
  return el("section", { class: "view" }, parts);
}

// ---- start

async function start() {
  try {
    state.meta = await getJSON("api/meta.json");
    state.leagues = await getJSON("api/ligas.json");
    await Promise.all(state.leagues.map(async (l) => { state.data[l.slug] = await getJSON(`api/liga/${l.slug}.json`); }));
  } catch (err) {
    $("#app").replaceChildren(el("div", { class: "empty", text: `Não consegui ler os dados (${err.message}).` }));
    return;
  }
  // The local panel says so; the published copy (meta.local false) does not.
  document.body.classList.toggle("is-local", !!state.meta.local);
  if (!state.leagues.length) {
    $("#app").replaceChildren(el("div", { class: "empty", text: "Nenhuma liga com partidas salvas." }));
    return;
  }
  const select = $("#liga");
  select.replaceChildren(...state.leagues.map((l) => el("option", { value: l.slug, text: l.nome })));
  const saved = localGet("liga");
  state.league = saved && state.data[saved] ? saved : state.leagues[0].slug;
  select.value = state.league;
  select.addEventListener("change", () => {
    state.league = select.value;
    localSet("liga", state.league);
    if (route().view === "jogador") location.hash = "#/ranking"; else render();
  });
  $("#main-tabs").addEventListener("click", (ev) => {
    const tab = ev.target.closest('[role="tab"]');
    if (!tab) return;
    const view = tab.dataset.view;
    location.hash = view === "ranking" ? state.back : `#/${view}`;
  });
  window.addEventListener("hashchange", render);
  render();
}

// The brand's two editions, as in the dashboards: with nothing saved the page follows the OS; Tema flips and remembers.
$("#theme").addEventListener("click", () => {
  const light = matchMedia("(prefers-color-scheme: light)").matches;
  const now = document.documentElement.getAttribute("data-theme") || (light ? "broadsheet" : "floodlight");
  const next = now === "floodlight" ? "broadsheet" : "floodlight";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("tema", next); } catch (_) {}
});

start();
