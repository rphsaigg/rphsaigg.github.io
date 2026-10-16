/* Bairro Ideal — painel de analytics (/painel/). Entra com código por e-mail (Worker saigg-app) e lê GET /admin/analytics. */
(function () {
  "use strict";
  const API = "https://saigg-app.montacamisa.workers.dev";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");
  const CHAVE = "bi_painel_token";
  const UF = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
  const EVENTOS = { regiao: "Abriu um bairro no mapa", morar: "Usou o “Morar melhor”", comparar: "Comparou bairros", busca: "Buscou na página inicial",
    pesos: "Ajustou o que importa", tema: "Trocou o tema do mapa", compartilhar: "Compartilhou" };
  const CAP = window.CAPITAIS || {};
  const site = "bi";   // só o Bairro Ideal
  let token = null, dias = 30;
  try { token = localStorage.getItem(CHAVE); } catch (_) {}

  async function api(caminho, opcoes = {}) {
    const r = await fetch(API + caminho, { ...opcoes, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 401) { sair(); throw new Error(corpo.erro || "Entre novamente."); }
    if (!r.ok) throw new Error(corpo.erro || `Erro ${r.status}`);
    return corpo;
  }

  // ---------------------------------------------------------------- entrar
  function mostrarLogin() { $("#entrar").hidden = false; $("#conteudo").hidden = true; $("#sair").hidden = true; }
  function sair() { token = null; try { localStorage.removeItem(CHAVE); } catch (_) {} mostrarLogin(); }
  let email = "";
  $("#f-email").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#erro-login").textContent = "";
    email = e.target.email.value.trim().toLowerCase();
    try { await api("/auth/codigo", { method: "POST", body: JSON.stringify({ email }) }); $("#f-email").hidden = true; $("#f-codigo").hidden = false; $("#f-codigo").codigo.focus(); }
    catch (err) { $("#erro-login").textContent = err.message; }
  });
  $("#f-codigo").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#erro-login").textContent = "";
    try {
      const r = await api("/auth/entrar", { method: "POST", body: JSON.stringify({ email, codigo: e.target.codigo.value }) });
      token = r.token; try { localStorage.setItem(CHAVE, token); } catch (_) {}
      await carregar();
    } catch (err) { $("#erro-login").textContent = err.message; }
  });
  $("#sair").onclick = async () => { try { await api("/auth/sair", { method: "POST" }); } catch (_) {} sair(); $("#f-email").hidden = false; $("#f-codigo").hidden = true; };

  // ---------------------------------------------------------------- filtros
  for (const [id, set] of [["#f-dias", (v) => (dias = +v)]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
      set(b.dataset.v); carregar();
    });
  }

  // ---------------------------------------------------------------- dica (tooltip)
  const dica = $("#dica");
  document.addEventListener("pointermove", (e) => {
    const alvo = e.target.closest("[data-dica]");
    if (!alvo) { dica.hidden = true; return; }
    dica.innerHTML = alvo.dataset.dica; dica.hidden = false;
    const w = dica.offsetWidth, x = Math.min(e.clientX + 14, innerWidth - w - 8);
    dica.style.left = `${Math.max(8, x)}px`; dica.style.top = `${e.clientY + 16}px`;
  });

  // ---------------------------------------------------------------- desenho
  function nomePagina(c) {
    if (c === "/") return "Início";
    if (c === "/comparar/") return "Comparar";
    if (c === "/metodologia/") return "Como calculamos";
    if (c === "/painel/") return "Painel";
    const slug = c.split("/")[1];
    return CAP[slug] || c;
  }
  function variacao(agora, antes) {
    if (!antes) return agora ? `<span class="var">novo período</span>` : "";
    const p = Math.round((agora / antes - 1) * 100);
    return `<span class="var ${p > 0 ? "sobe" : p < 0 ? "desce" : ""}">${p > 0 ? "▲" : p < 0 ? "▼" : "="} ${Math.abs(p)}% vs. período anterior</span>`;
  }
  function barras(el, linhas, vazio = "Nada ainda neste período.") {
    if (!linhas.length) { el.innerHTML = `<p class="vazio">${vazio}</p>`; return; }
    const max = Math.max(...linhas.map((l) => l.n)), tot = linhas.reduce((s, l) => s + l.n, 0);
    el.innerHTML = `<ol class="barras">${linhas.map((l) => `<li data-dica="<b>${esc(l.rotulo)}</b><br>${num(l.n)} (${Math.round((l.n / tot) * 100)}%)${l.extra ? "<br>" + esc(l.extra) : ""}">
      <span class="rot">${esc(l.rotulo)}</span><span class="v">${num(l.n)}</span><span class="trilho"><i style="width:${Math.max(2, (l.n / max) * 100)}%"></i></span></li>`).join("")}</ol>`;
  }
  function serieDias(d) {
    const porDia = Object.fromEntries(d.serie.map((x) => [x.dia, x.n])), ent = Object.fromEntries(d.serie_entradas.map((x) => [x.dia, x.n]));
    const lista = [];
    let ini = d.inicio && d.inicio > d.desde ? d.inicio : d.desde;
    for (let t = new Date(ini + "T12:00:00Z"); t.toISOString().slice(0, 10) <= d.hoje; t = new Date(+t + 864e5)) lista.push(t.toISOString().slice(0, 10));
    return lista.map((dia) => ({ dia, n: porDia[dia] || 0, e: ent[dia] || 0 }));
  }
  function graficoDias(el, s, dicaDe = (x) => `${num(x.n)} visualizações<br>${num(x.e)} visitas`) {
    const W = 800, H = 200, m = { t: 12, r: 8, b: 26, l: 36 };
    const max = Math.max(4, ...s.map((x) => x.n)), passo = Math.pow(10, Math.floor(Math.log10(max))), topo = Math.ceil(max / passo) * passo;
    const bw = (W - m.l - m.r) / s.length, y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
    const fmt = (dia) => dia.slice(8, 10) + "/" + dia.slice(5, 7);
    const marcas = [0, topo / 2, topo].map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grade-l"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`).join("");
    const cada = Math.ceil(s.length / 10);
    const cols = s.map((x, i) => {
      const w = Math.max(1, Math.min(bw - 2, 44)), x0 = m.l + i * bw + (bw - w) / 2 - 1, h = y(0) - y(x.n);
      const dicaTxt = `<b>${fmt(x.dia)}</b><br>${dicaDe(x)}`;
      return `<g data-dica="${esc(dicaTxt)}"><rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" class="alvo"/>`
        + (x.n ? `<path d="M${x0 + 1},${y(0)} v${-(h - Math.min(4, h, w / 2))} q0,${-Math.min(4, h, w / 2)} ${Math.min(4, h, w / 2)},${-Math.min(4, h, w / 2)} h${w - 2 * Math.min(4, h, w / 2)} q${Math.min(4, h, w / 2)},0 ${Math.min(4, h, w / 2)},${Math.min(4, h, w / 2)} V${y(0)} z" class="barra"/>` : "")
        + (i % cada === 0 || i === s.length - 1 ? `<text x="${m.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${fmt(x.dia)}</text>` : "") + "</g>";
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visualizações por dia">${marcas}${cols}</svg>`;
  }
  function graficoHoras(el, horas) {
    const n = Array(24).fill(0); horas.forEach((h) => (n[h.hora] = h.n));
    const max = Math.max(1, ...n);
    el.innerHTML = `<div class="horas">${n.map((v, h) => `<span data-dica="<b>${h}h</b><br>${num(v)} visualizações"><i style="height:${v ? Math.max(4, (v / max) * 100) : 0}%"></i></span>`).join("")}</div>
      <div class="horas-eixo"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>`;
  }

  const pct = (v) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const pos = (v) => (v ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "–");
  let vezG = 0, vez = 0;   // descarta respostas que chegam depois de trocar o filtro
  async function carregarGoogle() {
    const el = $("#google-kpis"), minha = ++vezG;
    el.innerHTML = `<p class="nota">Buscando no Google…</p>`;
    let g;
    try { g = await api(`/admin/google?site=${site}&dias=${dias}`); }
    catch (err) {
      if (minha !== vezG) return; el.innerHTML = `<p class="erro">${esc(err.message)}</p>`; ["#g-google-dias", "#g-termos", "#g-google-paginas"].forEach((s) => ($(s).innerHTML = "")); return; }
    if (minha !== vezG) return;
    const fmt = (x) => x.split("-").reverse().join("/");
    $("#google-periodo").textContent = `${fmt(g.desde)} a ${fmt(g.ate)}`;
    el.innerHTML = [["Cliques", num(g.cliques)], ["Impressões", num(g.impressoes)], ["Taxa de clique", g.impressoes ? pct(g.ctr) : "–"], ["Posição média", pos(g.posicao)]]
      .map(([r, v]) => `<div class="kpi"><span class="r">${r}</span><b>${v}</b></div>`).join("");
    const porDia = Object.fromEntries(g.serie.map((x) => [x.dia, x])), lista = [];
    for (let t = new Date(g.desde + "T12:00:00Z"); t.toISOString().slice(0, 10) <= g.ate; t = new Date(+t + 864e5)) {
      const dia = t.toISOString().slice(0, 10), x = porDia[dia] || { cliques: 0, impressoes: 0 };
      lista.push({ dia, n: x.impressoes, c: x.cliques });
    }
    graficoDias($("#g-google-dias"), lista, (x) => `${num(x.n)} impressões<br>${num(x.c)} cliques`);
    barras($("#g-termos"), g.termos.slice(0, 12).map((x) => ({ rotulo: x.chave, n: x.impressoes, extra: `${num(x.cliques)} cliques · posição ${pos(x.posicao)}` })),
      "O Google ainda não mostrou o site em nenhuma busca neste período.");
    barras($("#g-google-paginas"), g.paginas.slice(0, 12).map((x) => {
      const c = x.chave.replace(/^https?:\/\/[^/]+/, "");
      return { rotulo: nomePagina(c), n: x.impressoes, extra: `${c} · ${num(x.cliques)} cliques · posição ${pos(x.posicao)}` };
    }), "Nenhuma página apareceu no Google ainda.");
  }

  async function carregar() {
    if (!token) return mostrarLogin();
    $("#entrar").hidden = true; $("#conteudo").hidden = false; $("#sair").hidden = false;
    $("#conteudo").classList.add("carregando");
    carregarGoogle();
    const minha = ++vez;
    let d;
    try { d = await api(`/admin/analytics?site=${site}&dias=${dias}`); }
    catch (err) {
      if (minha !== vez) return; $("#conteudo").classList.remove("carregando"); if (token) $("#kpis").innerHTML = `<p class="erro">${esc(err.message)}</p>`; return; }
    if (minha !== vez) return;
    $("#conteudo").classList.remove("carregando");
    const fmt = (x) => x.split("-").reverse().join("/");
    $("#periodo").textContent = dias === 1 ? `Hoje, ${fmt(d.hoje)}` : `${fmt(d.inicio && d.inicio > d.desde ? d.inicio : d.desde)} a ${fmt(d.hoje)}`;
    const cel = (d.aparelhos.find((a) => a.disp === "celular") || {}).n || 0;
    // visitas só são contadas desde 16/10: páginas por visita usa apenas os dias que têm as duas contagens
    const diasEnt = new Set(d.serie_entradas.map((x) => x.dia)), vistasEnt = d.serie.filter((x) => diasEnt.has(x.dia)).reduce((s, x) => s + x.n, 0);
    const ppv = d.entradas ? (vistasEnt / d.entradas).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "–";
    const usos = d.eventos.reduce((s, e) => s + e.n, 0);
    $("#kpis").innerHTML = [
      ["Visualizações de página", num(d.total), variacao(d.total, d.total_antes)],
      ["Visitas", num(d.entradas), variacao(d.entradas, d.entradas_antes)],
      ["Páginas por visita", ppv, ""],
      ["No celular", d.total ? Math.round((cel / d.total) * 100) + "%" : "–", ""],
      ["Interações", num(usos), "abrir bairro, comparar, morar…"],
    ].map(([r, v, s]) => `<div class="kpi"><span class="r">${r}</span><b>${v}</b>${s ? `<span class="s">${s}</span>` : ""}</div>`).join("");
    graficoDias($("#g-dias"), serieDias(d));
    barras($("#g-paginas"), d.paginas.slice(0, 12).map((p) => ({ rotulo: nomePagina(p.caminho), n: p.n, extra: `${p.caminho} · ${Math.round((p.celular / p.n) * 100)}% no celular` })));
    barras($("#g-origens"), d.origens.slice(0, 10).map((o) => ({ rotulo: o.origem || "Direto / dentro do site", n: o.n })));
    barras($("#g-eventos"), d.eventos.map((e) => ({ rotulo: EVENTOS[e.nome] || e.nome, n: e.n })), "Ninguém interagiu ainda neste período.");
    const alvos = (nome) => d.eventos_alvo.filter((e) => e.nome === nome);
    barras($("#g-regioes"), alvos("regiao").slice(0, 10).map((e) => { const [s, ...r] = e.alvo.split(":"); return { rotulo: `${r.join(":")} · ${CAP[s] || s}`, n: e.n }; }), "Nenhum bairro aberto ainda.");
    barras($("#g-estados"), d.estados.slice(0, 10).map((e) => ({ rotulo: UF[e.valor] || (e.valor === "BR?" ? "Brasil (sem estado)" : `Exterior (${e.valor})`), n: e.n })), "Sem dados de estado ainda (começou em 16/10).");
    graficoHoras($("#g-horas"), d.horas);
    barras($("#g-comparar"), alvos("comparar").slice(0, 8).map((e) => ({ rotulo: e.alvo.split(" × ").map((x) => x.split(":").slice(1).join(":")).join(" × "), n: e.n })), "Nenhuma comparação ainda.");
  }

  carregar();
})();
