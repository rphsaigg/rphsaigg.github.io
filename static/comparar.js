/* Bairro Ideal — comparação de até 3 locais (inclusive de capitais diferentes). Estado na URL (?l=slug:id,…)
   e no navegador (om_comparar, a mesma bandeja da página do mapa). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const brl = (v) => (v == null ? "—" : "R$ " + num(Math.round(v / 10) * 10));
  const km = (v) => (v == null ? "—" : v < 1 ? `${Math.round(v * 1000 / 50) * 50} m` : `${num(v, 1)} km`);
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Infraestrutura da rua", lazer: "Lazer e cultura", comercio: "Comércio e serviços", seguranca: "Segurança" };
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.max(0, Math.min(CORES.length - 1, Math.round((v / 10) * (CORES.length - 1))))];
  let pesos = Object.fromEntries(Object.keys(TEMAS).map((k) => [k, 1]));
  try { Object.assign(pesos, JSON.parse(localStorage.getItem("om_pesos") || "{}")); } catch (_) {}

  // linhas: [rótulo, valor(p), formato, melhor: "max" | "min" | null, grupo]
  const LINHAS = [
    ["Nota geral", (p) => p._geral, (v) => num(v, 1), "max", "nota"],
    ...Object.entries(TEMAS).map(([k, n]) => [n, (p) => p[k], (v) => num(v, 1), "max", "nota"]),
    ["Aluguel de 60 m² (estimado)", (p) => (p.aluguel_m2_est ? p.aluguel_m2_est * 60 : null), (v) => brl(v) + "/mês", "min", "Custo"],
    ["Compra por m² (estimada)", (p) => p.venda_m2_est, (v) => brl(v), "min", "Custo"],
    ["Moradores", (p) => p.pop, (v) => num(v), null, "Perfil"],
    ["Renda mediana do responsável", (p) => p.renda_mediana, (v) => brl(v), null, "Perfil"],
    ["IDEB médio (rede pública)", (p) => p.ideb, (v) => num(v, 1), "max", "Educação"],
    ["Escola pública mais perto", (p) => p.dist_escola_publica, km, "min", "Educação"],
    ["Creche ou pré-escola mais perto", (p) => p.dist_escola_infantil, km, "min", "Educação"],
    ["Escolas públicas · particulares", (p) => p.esc_publicas, (v, p) => `${num(v)} · ${num(p.esc_privadas)}`, null, "Educação"],
    ["UBS mais perto", (p) => p.dist_ubs, km, "min", "Saúde"],
    ["Hospital mais perto", (p) => p.dist_hospital, km, "min", "Saúde"],
    ["UPA ou pronto-socorro mais perto", (p) => p.dist_urgencia, km, "min", "Saúde"],
    ["Esgoto ligado à rede", (p) => p.esgoto, pct, "max", "Saneamento e rua"],
    ["Água da rede geral", (p) => p.agua, pct, "max", "Saneamento e rua"],
    ["Ruas com calçada", (p) => p.rua_calcada, pct, "max", "Saneamento e rua"],
    ["Ruas arborizadas", (p) => p.rua_arvores, pct, "max", "Saneamento e rua"],
    ["Ruas iluminadas", (p) => p.rua_iluminacao, pct, "max", "Saneamento e rua"],
    ["Área verde por morador", (p) => p.verde_m2_por_morador, (v) => (v == null ? "—" : num(v, 1) + " m²"), "max", "Lazer e comércio"],
    ["Bares e restaurantes", (p) => p.cnpj_restaurante ?? p.osm_gastronomia, (v) => num(v), null, "Lazer e comércio"],
    ["Mercados e padarias", (p) => p.cnpj_mercado ?? p.osm_mercado, (v) => num(v), null, "Lazer e comércio"],
    ["Lojas", (p) => p.cnpj_loja ?? p.osm_loja, (v) => num(v), null, "Lazer e comércio"],
    ["Gasolina (mediana dos postos)", (p) => p.gasolina, (v) => (v == null ? "—" : "R$ " + num(v, 2)), "min", "Lazer e comércio"],
    ["Roubos por 100 mil hab./ano", (p) => p.seg_roubo_100mil, (v) => num(v), "min", "Segurança"],
    ["Mortes violentas por 100 mil hab./ano", (p) => p.seg_cvli_100mil, (v) => num(v, 1), "min", "Segurança"],
  ];

  const cache = {};
  async function capital(slug) {
    if (!cache[slug]) {
      cache[slug] = fetch(`/static/dados/${slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json()).then((g) => {
        const ps = g.features.map((f) => f.properties);
        for (const p of ps) {  // nota geral com os pesos do visitante (igual ao mapa)
          let s = 0, w = 0;
          for (const k in TEMAS) if (p[k] != null && pesos[k] > 0) { s += p[k] * pesos[k]; w += pesos[k]; }
          p._geral = w ? Math.round((s / w) * 10) / 10 : null;
        }
        [...ps].filter((p) => p._geral != null).sort((a, b) => b._geral - a._geral).forEach((p, i) => (p._rank = i + 1));
        ps.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
        return ps;
      });
    }
    return cache[slug];
  }

  // estado inicial: URL > bandeja do mapa
  let locais = [];
  const q = new URLSearchParams(location.search).get("l");
  if (q) locais = q.split(",").map((s) => { const [slug, id] = s.split(":"); return { slug, id }; }).filter((x) => CAP[x.slug]);
  else { try { locais = JSON.parse(localStorage.getItem("om_comparar") || "[]").map((x) => ({ slug: x.slug, id: x.id })); } catch (_) {} }
  locais = locais.slice(0, 3);
  if (!locais.length) locais = [{ slug: "", id: "" }, { slug: "", id: "" }];

  async function salvar() {
    const validos = locais.filter((x) => x.slug && x.id);
    const url = validos.length ? "?l=" + validos.map((x) => `${x.slug}:${x.id}`).join(",") : location.pathname;
    history.replaceState(null, "", url);
    const bandeja = [];
    for (const x of validos) {
      const p = (await capital(x.slug)).find((y) => y.id === x.id);
      if (p) bandeja.push({ slug: x.slug, id: x.id, nome: p.nome, cidade: CAP[x.slug].nome });
    }
    try { localStorage.setItem("om_comparar", JSON.stringify(bandeja)); } catch (_) {}
    if (bandeja.length >= 2) window.biEvento?.("comparar", bandeja.map((b) => `${b.slug}:${b.nome}`).join(" × "));
  }

  async function desenhar() {
    const dados = await Promise.all(locais.map(async (x) => (x.slug ? { lista: await capital(x.slug), p: x.id ? (await capital(x.slug)).find((y) => y.id === x.id) : null } : { lista: [], p: null })));
    // cabeçalho: uma coluna por local, com capital e bairro escolhíveis
    const cab = $("#comp-cab");
    cab.innerHTML = `<th class="rot"></th>` + locais.map((x, i) => {
      const d = dados[i];
      return `<th class="col">
        <select data-i="${i}" class="sel-cap" aria-label="Capital do local ${i + 1}"><option value="">Capital…</option>${window.CAPITAIS.map((c) => `<option value="${c.slug}"${c.slug === x.slug ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
        <select data-i="${i}" class="sel-reg" aria-label="Bairro do local ${i + 1}"${x.slug ? "" : " disabled"}><option value="">Bairro ou região…</option>${d.lista.map((p) => `<option value="${esc(p.id)}"${p.id === x.id ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>
        ${d.p ? `<div class="col-info"><b>${esc(d.p.nome)}</b><span>${esc(CAP[x.slug].nome)} · ${d.p._rank ? `${d.p._rank}º de ${d.lista.length}` : ""}</span><span class="acoes-col"><a href="/${x.slug}/?regiao=${encodeURIComponent(d.p.nome)}">ver no mapa</a>${locais.length > 1 ? ` · <button class="tirar" type="button" data-i="${i}">remover</button>` : ""}</span></div>` : (locais.length > 1 ? `<button class="tirar" type="button" data-i="${i}">remover coluna</button>` : "")}
      </th>`;
    }).join("") + (locais.length < 3 ? `<th class="col add"><button type="button" id="add-local">＋ Adicionar local</button></th>` : "");

    const ps = dados.map((d) => d.p);
    let html = "", grupo = "";
    for (const [rot, get, fmt, melhor, g] of LINHAS) {
      const vals = ps.map((p) => (p ? get(p) : null));
      if (vals.every((v) => v == null) && ps.some(Boolean) && g !== "nota") continue;
      if (g !== grupo && g !== "nota") { html += `<tr class="grupo"><th colspan="${locais.length + 2}">${g}</th></tr>`; }
      grupo = g;
      const nums = vals.filter((v) => v != null);
      let best = melhor && nums.length > 1 ? (melhor === "max" ? Math.max(...nums) : Math.min(...nums)) : null;
      let worst = melhor && nums.length > 1 ? (melhor === "max" ? Math.min(...nums) : Math.max(...nums)) : null;
      // só destaca diferença relevante: 0,5 ponto nas notas, 5% nos demais números
      if (best != null && (g === "nota" ? Math.abs(best - worst) < 0.5 : Math.abs(best - worst) < 0.05 * Math.max(Math.abs(best), Math.abs(worst)))) best = worst = null;
      html += `<tr${g === "nota" ? ' class="linha-nota"' : ""}><th class="rot">${rot}</th>` + vals.map((v, i) => {
        if (!ps[i]) return `<td class="vazio"></td>`;
        const cls = v == null || best === worst ? "" : v === best ? "melhor" : v === worst ? "pior" : "";
        const barra = g === "nota" && v != null ? `<span class="mini"><span style="width:${Math.max(2, v * 10)}%;background:${cor(v)}"></span></span>` : "";
        return `<td class="${cls}">${v == null ? (rot === "Segurança" ? '<span class="sd">sem dado oficial</span>' : "—") : fmt(v, ps[i])}${barra}</td>`;
      }).join("") + (locais.length < 3 ? "<td></td>" : "") + "</tr>";
    }
    $("#comp-corpo").innerHTML = ps.some(Boolean) ? html : `<tr><td colspan="4" class="vazio-msg">Escolha a capital e o bairro em cada coluna, ou clique em "＋ Comparar" na ficha de um bairro no mapa.</td></tr>`;
    const cidades = new Set(locais.filter((x) => x.slug && x.id).map((x) => x.slug));
    $("#comp-aviso").innerHTML = cidades.size > 1 ? "<b>Atenção:</b> você está comparando cidades diferentes. As notas de 0 a 10 comparam cada bairro com os outros da <b>própria</b> cidade; entre cidades, compare pelos números (aluguel, distâncias, percentuais)." : "";

    cab.querySelectorAll(".sel-cap").forEach((s) => (s.onchange = async () => { locais[+s.dataset.i] = { slug: s.value, id: "" }; await salvar(); desenhar(); }));
    cab.querySelectorAll(".sel-reg").forEach((s) => (s.onchange = async () => { locais[+s.dataset.i].id = s.value; await salvar(); desenhar(); }));
    cab.querySelectorAll(".tirar").forEach((b) => (b.onclick = async () => { locais.splice(+b.dataset.i, 1); await salvar(); desenhar(); }));
    const add = $("#add-local");
    if (add) add.onclick = () => { const ult = locais[locais.length - 1]; locais.push({ slug: ult?.slug || "", id: "" }); desenhar(); };
  }
  desenhar();
})();
