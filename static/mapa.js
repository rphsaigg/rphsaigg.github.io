/* Bairro Ideal — mapa de uma capital (MapLibre GL 4 + OpenFreeMap). Dados: /static/dados/<slug>.geojson e -pontos.json */
(function () {
  "use strict";
  const C = window.CAPITAL;
  const $ = (s) => document.querySelector(s);
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Infraestrutura da rua", lazer: "Lazer e cultura", comercio: "Comércio e serviços", seguranca: "Segurança" };
  const IND = {
    ideb: "IDEB das escolas públicas", esc_por_mil_criancas: "escolas por criança", infra_escolas: "escolas com biblioteca, laboratório e quadra",
    esc_privadas_10mil: "oferta de escolas particulares", sau_ubs_10mil: "UBS por morador", sau_hospital_10mil: "hospitais por morador",
    sau_urgencia_10mil: "UPAs e prontos-socorros", sau_especialidade_10mil: "clínicas de especialidades", sau_exames_10mil: "laboratórios e exames",
    agua: "água da rede geral", esgoto: "esgoto ligado à rede", lixo: "coleta de lixo", rua_pavimentada: "ruas pavimentadas",
    rua_iluminacao: "iluminação pública", rua_calcada: "calçadas", rua_arvores: "arborização", rua_bueiro: "bueiros (drenagem)",
    rua_rampa: "rampas de acessibilidade", rua_onibus: "pontos de ônibus na rua", verde_m2_por_morador: "área verde por morador",
    osm_parque_10mil: "parques", osm_praca_playground_10mil: "praças e playgrounds", osm_esporte_10mil: "quadras e espaços de esporte",
    osm_cultura_10mil: "cultura (teatro, cinema, biblioteca)", osm_gastronomia_10mil: "bares e restaurantes", osm_mercado_10mil: "mercados e padarias",
    osm_loja_10mil: "lojas", osm_shopping_10mil: "shoppings", osm_servico_10mil: "bancos e correios", sau_farmacia_10mil: "farmácias",
    gasolina_rel: "preço da gasolina", dist_ubs: "distância até a UBS", dist_hospital: "distância até o hospital",
    dist_urgencia: "distância até UPA ou pronto-socorro", dist_escola_publica: "distância até a escola pública",
    dist_escola_infantil: "distância até creche ou pré-escola", seg_cvli_100mil: "mortes violentas", seg_roubo_100mil: "roubos",
    cnpj_mercado_10mil: "mercados, padarias e hortifrútis", cnpj_loja_10mil: "lojas", cnpj_farmacia_10mil: "farmácias",
    cnpj_banco_10mil: "bancos e lotéricas", cnpj_beleza_10mil: "salões e barbearias", cnpj_pet_10mil: "pet shops e veterinários",
    cnpj_restaurante_10mil: "bares e restaurantes", cnpj_academia_10mil: "academias",
  };
  // do pior (vermelho) ao melhor (verde), passando pelo amarelo — escala RdYlGn (ColorBrewer)
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"]; // 0 → 10
  const CORES_CUSTO = ["#f3eefa", "#d9c8ef", "#b79fe0", "#9172cc", "#6b48b0", "#4a2d85"];
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const num = (v, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const km1 = (v) => (v == null ? "—" : v < 1 ? `${Math.round(v * 1000 / 50) * 50} m` : `${num(v, 1)} km`);
  const brl = (v) => (v == null ? "—" : "R$ " + num(v, 0));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let dados = null, pontos = null, tema = "geral", selecionado = null;
  let trabalho = null, tempos = null, modoTrabalho = false, marcadorTrab = null;
  const pesos = Object.fromEntries(Object.keys(TEMAS).map((k) => [k, 1]));
  try { Object.assign(pesos, JSON.parse(localStorage.getItem("om_pesos") || "{}")); } catch (_) {}

  // ---------- mapa ----------
  const zoomNoLink = /[#&]v=/.test(location.hash);  // antes do mapa: ele escreve o próprio #v= ao abrir
  const [x0, y0, x1, y1] = C.bbox;
  const mapa = new maplibregl.Map({
    container: "mapa", style: "https://tiles.openfreemap.org/styles/positron",
    bounds: [[x0, y0], [x1, y1]], fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true },
    hash: "v",  // zoom/centro no endereço (#v=z/lat/lon): quem compartilha o link manda a mesma tela
  });
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
  const gps = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 14 }, trackUserLocation: false });
  mapa.addControl(gps, "top-right");
  gps.on("geolocate", (e) => {
    const f = regiaoEm([e.coords.longitude, e.coords.latitude]);
    window.biEvento?.("gps", C.slug);
    if (f) ficha(f.properties.id);
    else aviso(`Você está fora de ${C.nome}. Escolha outra capital no topo do painel.`);
  });

  // ponto dentro de qual região (GPS, local do trabalho): teste de polígono simples, sem biblioteca
  function dentro(pt, anel) {
    let ok = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i], [xj, yj] = anel[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
  }
  function regiaoEm(pt) {
    if (!dados) return null;
    return dados.features.find((f) => {
      const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      return polis.some((pl) => dentro(pt, pl[0]) && !pl.slice(1).some((buraco) => dentro(pt, buraco)));
    }) || null;
  }
  function aviso(txt) {
    const el = $("#ficha"); el.hidden = false;
    el.innerHTML = `<button class="fechar" aria-label="Fechar">×</button><p>${esc(txt)}</p>`;
    el.querySelector(".fechar").onclick = () => (el.hidden = true);
  }

  // ---------- endereço da página: região, tema e local do trabalho (o zoom vai no #v=) ----------
  function salvarURL() {
    const q = new URLSearchParams(location.search);
    const p = selecionado && dados ? dados.features.find((f) => f.properties.id === selecionado)?.properties : null;
    p ? q.set("regiao", p.nome) : q.delete("regiao");
    tema !== "geral" && tema !== "morar" ? q.set("tema", tema) : q.delete("tema");
    trabalho ? q.set("trabalho", trabalho.id) : q.delete("trabalho");
    q.delete("morar");
    const qs = q.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (_) {}
  }

  function calcular() {
    const soma = Object.values(pesos).reduce((a, b) => a + b, 0) || 1;
    for (const f of dados.features) {
      const p = f.properties;
      let s = 0, w = 0;
      for (const k in TEMAS) if (p[k] != null && pesos[k] > 0) { s += p[k] * pesos[k]; w += pesos[k]; }
      p.geral_p = w ? Math.round((s / w) * 10) / 10 : null;
      p._v = tema === "custo" ? p.aluguel_m2_est : tema === "geral" ? p.geral_p : tema === "morar" ? (p._ok ? p.geral_p : null)
        : tema === "tempo" ? (p._t ?? null) : tema === "calor" ? (p.calor_anom ?? null) : p[tema];
    }
    const ord = [...dados.features].filter((f) => f.properties.geral_p != null).sort((a, b) => b.properties.geral_p - a.properties.geral_p);
    ord.forEach((f, i) => (f.properties.rank_p = i + 1));
    void soma;
  }

  // calor: diferença para a média da cidade, azul (fresco) → branco → vermelho (quente); mesma rampa da imagem de satélite
  const PARADAS_CALOR = [[-4, "#2166ac"], [-2, "#67a9cf"], [-0.8, "#d1e5f0"], [0, "#f7f7f7"], [0.8, "#fddbc7"], [2, "#ef8a62"], [4, "#b2182b"]];
  const grau = (v) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), 1) + " °C");
  const PARADAS_TEMPO = [[0, "#1a9850"], [10, "#66bd63"], [20, "#d9ef8b"], [30, "#fee08b"], [45, "#fdae61"], [60, "#f46d43"], [90, "#d73027"]];
  function corExpr() {
    if (tema === "tempo") return ["case", ["==", ["get", "_v"], null], "#e4e4e4", ["interpolate", ["linear"], ["get", "_v"], ...PARADAS_TEMPO.flat()]];
    if (tema === "calor") return ["case", ["==", ["get", "_v"], null], "#e4e4e4", ["interpolate", ["linear"], ["get", "_v"], ...PARADAS_CALOR.flat()]];
    if (tema === "custo") {
      const vs = dados.features.map((f) => f.properties.aluguel_m2_est).filter((v) => v != null).sort((a, b) => a - b);
      const q = (p) => vs[Math.min(vs.length - 1, Math.floor(p * vs.length))];
      const paradas = [0, 0.2, 0.4, 0.6, 0.8, 1].map(q);
      const expr = ["interpolate", ["linear"], ["get", "_v"]];
      paradas.forEach((v, i) => { if (i === 0 || v > expr[expr.length - 2]) expr.push(v, CORES_CUSTO[i]); });
      return ["case", ["==", ["get", "_v"], null], "#e4e4e4", expr.length > 4 ? expr : CORES_CUSTO[2]];
    }
    // cores distribuídas pela posição na cidade (quantis): o pior fica vermelho e o melhor verde, mesmo quando
    // as notas estão próximas (ex.: quase todos os distritos de SP entre 6 e 8)
    const vs = dados.features.map((f) => f.properties._v).filter((v) => v != null).sort((a, b) => a - b);
    if (vs.length < 3 || vs[0] === vs[vs.length - 1]) return ["case", ["==", ["get", "_v"], null], "#e4e4e4", CORES[4]];
    const expr = ["interpolate", ["linear"], ["get", "_v"]];
    let ultimo = -Infinity;
    CORES.forEach((c, i) => {
      const v = vs[Math.min(vs.length - 1, Math.round((i / (CORES.length - 1)) * (vs.length - 1)))];
      if (v > ultimo) { expr.push(v, c); ultimo = v; }
    });
    return ["case", ["==", ["get", "_v"], null], "#e4e4e4", expr.length > 4 ? expr : CORES[4]];
  }

  function legenda() {
    const el = $("#legenda");
    if (tema === "tempo") {
      el.innerHTML = trabalho ? `<b>Minutos de carro até o trabalho</b><div class="barra" style="background:linear-gradient(90deg,${PARADAS_TEMPO.map((x) => x[1]).join(",")})"></div><div class="extremos"><span>perto</span><span>1h30 ou mais</span></div><small>Sem trânsito, pelas ruas do OpenStreetMap. No pico, conte de 1,5 a 2 vezes mais.</small>`
        : `<b>Tempo até o trabalho</b><small>Toque no mapa onde você trabalha.</small>`;
      return;
    }
    if (tema === "calor") {
      const tem = dados.features.some((f) => f.properties.calor_anom != null);
      el.innerHTML = tem ? `<b>Calor em relação à média da cidade</b><div class="barra" style="background:linear-gradient(90deg,${PARADAS_CALOR.map((x) => x[1]).join(",")})"></div><div class="extremos"><span>mais fresco</span><span>mais quente</span></div><small>Temperatura do chão e dos telhados por satélite (Landsat), ±4 °C.</small>`
        : `<b>Calor</b><small>Sem imagens de satélite limpas o bastante para ${esc(C.nome)} (muita nuvem).</small>`;
      return;
    }
    if (tema === "custo") {
      el.innerHTML = `<b>Aluguel estimado (R$/m²)</b><div class="barra custo"></div><div class="extremos"><span>mais barato</span><span>mais caro</span></div><small>Estimativa a partir do FipeZap ${esc(C.fipezap_ref || "")} e da renda da região</small>`;
    } else {
      const vs = dados.features.map((f) => f.properties._v).filter((v) => v != null);
      const mn = vs.length ? Math.min(...vs) : null, mx = vs.length ? Math.max(...vs) : null;
      el.innerHTML = `<b>${tema === "geral" ? "Nota geral" : tema === "morar" ? "Cabem no seu orçamento e trajeto" : TEMAS[tema]}</b><div class="barra"></div><div class="extremos"><span>pior da cidade${mn != null ? ` (${num(mn, 1)})` : ""}</span><span>melhor${mx != null ? ` (${num(mx, 1)})` : ""}</span></div>`;
    }
  }

  function atualizar() {
    calcular();
    if (mapa.getSource("unidades")) {
      mapa.getSource("unidades").setData(dados);
      mapa.setPaintProperty("unidades-fill", "fill-color", corExpr());
    }
    legenda();
    ranking();
    if (selecionado) ficha(selecionado);
  }

  // ---------- painel ----------
  function ranking() {
    const lista = dados.features.map((f) => f.properties).filter((p) => p._v != null);
    lista.sort((a, b) => (tema === "custo" || tema === "tempo" || tema === "calor" ? a._v - b._v : b._v - a._v));
    const titulo = tema === "custo" ? "Do aluguel mais em conta ao mais caro" : tema === "morar" ? "Regiões que cabem no seu orçamento e trajeto"
      : tema === "calor" ? "Do mais fresco ao mais quente"
      : tema === "tempo" ? (trabalho ? `Mais perto de ${trabalho.nome}, de carro` : "Tempo até o trabalho")
      : `Ranking: ${tema === "geral" ? "nota geral" : TEMAS[tema].toLowerCase()}`;
    $("#ranking").innerHTML = `<h2>${titulo}</h2><ol>` + lista.map((p) =>
      `<li><button data-id="${esc(p.id)}"${p.id === selecionado ? ' class="sel"' : ""}><span class="n">${esc(p.nome)}${p.pouco ? ' <i title="Menos de mil moradores: números oscilam">·</i>' : ""}</span>` +
      `<span class="v">${tema === "custo" ? "R$ " + num(p._v, 0) + "/m²" : tema === "tempo" ? (trabalho && p.id === trabalho.id ? "aqui" : num(p._v) + " min") : tema === "calor" ? grau(p._v) : num(p._v, 1)}</span></button></li>`).join("") + "</ol>";
  }

  function barra(v) {
    const w = v == null ? 0 : Math.max(2, v * 10);
    const c = v == null ? "#ccc" : CORES[Math.max(0, Math.min(CORES.length - 1, Math.round((v / 10) * (CORES.length - 1))))];
    return `<span class="mini"><span style="width:${w}%;background:${c}"></span></span>`;
  }

  // ---------- comparação (até 3 locais, inclusive de capitais diferentes; guardada no navegador) ----------
  const lerComp = () => { try { return JSON.parse(localStorage.getItem("om_comparar") || "[]"); } catch (_) { return []; } };
  const salvarComp = (l) => { try { localStorage.setItem("om_comparar", JSON.stringify(l)); } catch (_) {} };
  const naComparacao = (id) => lerComp().some((x) => x.slug === C.slug && x.id === id);
  function alternarComparacao(p) {
    let l = lerComp();
    if (naComparacao(p.id)) l = l.filter((x) => !(x.slug === C.slug && x.id === p.id));
    else { if (l.length >= 3) l.shift(); l.push({ slug: C.slug, id: p.id, nome: p.nome, cidade: C.nome }); }
    salvarComp(l);
    bandeja();
  }
  function bandeja() {
    const l = lerComp(), el = $("#bandeja");
    el.hidden = !l.length;
    if (!l.length) return;
    const url = "/comparar/?l=" + l.map((x) => `${x.slug}:${x.id}`).join(",");
    el.innerHTML = `<b>Comparar (${l.length}/3)</b><div class="chips">${l.map((x, i) =>
      `<span>${esc(x.nome)}${x.slug !== C.slug ? ` <small>${esc(x.cidade)}</small>` : ""}<button type="button" data-i="${i}" aria-label="Tirar ${esc(x.nome)}">×</button></span>`).join("")}</div>
      <div class="acoes"><a class="btn" href="${url}">Ver comparação →</a><button class="link" type="button" id="comp-limpar">Limpar</button></div>
      ${l.length < 2 ? '<p class="nota">Escolha mais um bairro no mapa ou no ranking e clique em "＋ Comparar".</p>' : ""}`;
    el.querySelectorAll("button[data-i]").forEach((b) => (b.onclick = () => { const l2 = lerComp(); l2.splice(+b.dataset.i, 1); salvarComp(l2); bandeja(); if (selecionado) ficha(selecionado); }));
    $("#comp-limpar").onclick = () => { salvarComp([]); bandeja(); if (selecionado) ficha(selecionado); };
  }

  const sinal = (v, d = 0, esc = 100, suf = "%") => { if (v == null) return "—"; const x = Math.round(v * esc * 10 ** d) / 10 ** d; return (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x), d) + (suf === "%" ? "%" : " " + suf); };
  // evolução 2010 → 2022 (só onde o contorno é comparável; mapa/evolucao.py). Textos iguais aos de bairros.py → evolucao()
  function evolucao(p) {
    if (!p.evo) return "";
    const rot = { ascensao: "Em ascensão", declinio: "Em declínio", estavel: "Estável" }[p.evo];
    const frase = { ascensao: "A renda dos responsáveis subiu mais do que a da cidade e, sem a inflação, também cresceu.",
      declinio: "A renda dos responsáveis subiu menos do que a da cidade ou caiu.", estavel: "A renda dos responsáveis acompanhou a da cidade." }[p.evo];
    const linhas = [["Moradores", sinal(p.evo_pop)], ["Renda real do responsável", sinal(p.evo_renda_real)], ["Renda em relação à cidade", sinal(p.evo_renda_rel)]];
    [["esgoto", "Esgoto na rede"], ["agua", "Água da rede"]].forEach(([k, n]) => { if (p["evo_" + k] != null) linhas.push([n, sinal(p["evo_" + k], 1, 1, "p.p.")]); });
    return `<h3>De 2010 a 2022</h3><p class="evo-selo evo-${p.evo}"><b>${rot}</b> ${frase}</p>
      <table class="ind">${linhas.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</table>
      <p class="nota">Censo 2010 × 2022, só onde os contornos coincidem. <a href="/metodologia/#evolucao">Como calculamos</a></p>`;
  }

  // áreas de risco (mapa/risco.py). Textos iguais aos de bairros.py → risco()
  function risco(p) {
    if (!p.risco_fonte) return "";
    const pct = p.risco_pct || 0, pess = p.risco_pess || 0, n = p.risco_setores || 0;
    const fonte = p.risco_fonte === "sgb" ? `Serviço Geológico do Brasil, setores de risco alto e muito alto mapeados em ${p.risco_ano}` : "IBGE e CEMADEN, áreas de risco de 2010";
    let k, rot, frase;
    if (pess < 1 && n === 0) { k = "nenhum"; rot = "Sem área de risco mapeada"; frase = "Nenhuma área de risco de deslizamento ou inundação foi mapeada aqui."; }
    else {
      [k, rot] = pct < 0.05 ? ["pontual", "Áreas de risco pontuais"] : pct < 0.25 ? ["parte", "Parte da região em área de risco"] : ["grande", "Boa parte em área de risco"];
      frase = pess >= 1 ? `Cerca de ${num(pess)} moradores (${pct < 0.01 ? "menos de 1%" : num(pct * 100) + "%"}) vivem em áreas mapeadas como de risco` : `${n} área${n > 1 ? "s" : ""} de risco mapeada${n > 1 ? "s" : ""}, com poucos moradores`;
      const T = { deslizamento: "deslizamento", inundacao: "inundação", erosao: "erosão" };
      const tipos = (p.risco_tipos || "").split(",").filter((t) => T[t]).map((t) => T[t]);
      if (tipos.length) frase += ", de " + (tipos.length > 1 ? tipos.slice(0, -1).join(", ") + " e " + tipos[tipos.length - 1] : tipos[0]);
      frase += ".";
      if (p.risco_muito_alto) frase += ` ${p.risco_muito_alto} ${p.risco_muito_alto === 1 ? "setor tem" : "setores têm"} risco muito alto.`;
    }
    return `<h3>Alaga? Áreas de risco</h3><p class="risco-selo risco-${k}"><b>${rot}</b> ${frase}</p>
      <p class="nota">Fonte: ${fonte}. Não vale como laudo de imóvel. <a href="/metodologia/#risco">Como calculamos</a></p>`;
  }

  function porque(p, k) {
    if (p[k] == null) return k === "seguranca" ? "Sem dado de segurança desta região (a secretaria do estado não publica por bairro ou a delegacia tem registros incompletos)." : "Sem dados suficientes.";
    const forte = p[k + "_forte"], fraco = p[k + "_fraco"], partes = [];
    if (forte) partes.push(`Ponto forte: <em>${esc(IND[forte] || forte)}</em>.`);
    if (fraco && fraco !== forte) partes.push(`Ponto fraco: <em>${esc(IND[fraco] || fraco)}</em>.`);
    if (!fraco) partes.push("Sem ponto fraco relevante.");
    if (k === "seguranca" && p.seg_fonte) partes.push(`<span class="nota">Fonte: ${esc(p.seg_fonte)}.${p.seg_fonte.includes("CISP") ? " Bairros da mesma delegacia compartilham a mesma taxa." : ""}</span>`);
    return partes.join(" ");
  }

  function ficha(id) {
    selecionado = id;
    const f = dados.features.find((x) => x.properties.id === id);
    if (!f) return;
    window.biEvento?.("regiao", `${C.slug}:${f.properties.nome}`);
    const p = f.properties;
    const total = dados.features.length;
    const temas = Object.entries(TEMAS).map(([k, nome]) => `
      <div class="tema-linha"><div class="t"><span>${nome}</span><b>${num(p[k], 1)}</b></div>${barra(p[k])}
      <p class="porque">${porque(p, k)}</p></div>`).join("");
    const aluguel60 = p.aluguel_m2_est ? p.aluguel_m2_est * 60 : null;
    const pagina = document.querySelector(`#todas-regioes a[data-id="${CSS.escape(p.id)}"]`)?.getAttribute("href");
    $("#ficha").hidden = false;
    $("#ficha").innerHTML = `
      <button class="fechar" aria-label="Fechar">×</button>
      <h2>${esc(p.nome)}</h2>
      <p class="pos">${p.rank_p ? `${p.rank_p}º de ${total} em ${esc(C.nome)}` : ""}${p.pouco ? " · região pouco populosa" : ""}</p>
      <div class="nota-geral"><b>${num(p.geral_p, 1)}</b><span>nota geral${Object.values(pesos).some((v) => v !== 1) ? " (com os seus pesos)" : ""}</span></div>
      <button class="btn-comparar" type="button" data-id="${esc(p.id)}">${naComparacao(p.id) ? "✓ Na comparação" : "＋ Comparar"}</button>
      ${pagina ? `<a class="link-pagina" href="${esc(pagina)}">Página completa de ${esc(p.nome)} →</a>` : ""}
      ${temas}
      <h3>Custo de moradia <span class="est">estimativa</span></h3>
      <p class="custo">Aluguel ≈ <b>${p.aluguel_m2_est ? "R$ " + num(p.aluguel_m2_est, 0) + "/m²" : "—"}</b>${aluguel60 ? ` · apartamento de 60 m² ≈ <b>${brl(Math.round(aluguel60 / 50) * 50)}</b> por mês` : ""}<br>
      Compra ≈ <b>${p.venda_m2_est ? "R$ " + num(p.venda_m2_est, 0) + "/m²" : "—"}</b></p>
      <p class="nota">Não existe preço oficial por bairro. A estimativa parte da média da cidade no FipeZap (${esc(C.fipezap_ref || "sem dado")}) e da renda da região.</p>
      <h3>Números da região</h3>
      <table class="ind">
        <tr><td>Moradores</td><td>${num(p.pop)}</td></tr>
        <tr><td>Renda mediana do responsável</td><td>${brl(p.renda_mediana)}</td></tr>
        <tr><td>Esgoto ligado à rede</td><td>${pct(p.esgoto)}</td></tr>
        <tr><td>Água da rede geral</td><td>${pct(p.agua)}</td></tr>
        <tr><td>Ruas com calçada · com árvores</td><td>${pct(p.rua_calcada)} · ${pct(p.rua_arvores)}</td></tr>
        <tr><td>Escolas públicas · particulares</td><td>${num(p.esc_publicas)} · ${num(p.esc_privadas)}</td></tr>
        <tr><td>IDEB médio (rede pública)</td><td>${num(p.ideb, 1)}</td></tr>
        <tr><td>UBS · hospitais · UPAs</td><td>${num(p.sau_ubs)} · ${num(p.sau_hospital)} · ${num(p.sau_urgencia)}</td></tr>
        <tr><td>Mais perto: UBS · hospital · UPA</td><td>${km1(p.dist_ubs)} · ${km1(p.dist_hospital)} · ${km1(p.dist_urgencia)}</td></tr>
        <tr><td>Mais perto: escola pública · creche</td><td>${km1(p.dist_escola_publica)} · ${km1(p.dist_escola_infantil)}</td></tr>
        <tr><td>Área verde por morador</td><td>${p.verde_m2_por_morador == null ? "—" : num(p.verde_m2_por_morador, 1) + " m²"}</td></tr>
        <tr><td>Bares e restaurantes · mercados</td><td>${num(p.cnpj_restaurante ?? p.osm_gastronomia)} · ${num(p.cnpj_mercado ?? p.osm_mercado)}</td></tr>
        ${p.cnpj_loja != null ? `<tr><td>Lojas · farmácias · academias</td><td>${num(p.cnpj_loja)} · ${num(p.cnpj_farmacia)} · ${num(p.cnpj_academia)}</td></tr>` : ""}
        ${p.seg_roubo_100mil != null ? `<tr><td>Roubos · mortes violentas (por 100 mil hab./ano)</td><td>${num(p.seg_roubo_100mil)} · ${num(p.seg_cvli_100mil, 1)}</td></tr>` : ""}
        <tr><td>Gasolina (mediana dos postos)</td><td>${p.gasolina ? "R$ " + num(p.gasolina, 2) : "—"}</td></tr>
        ${p.est_nome ? `<tr><td>Estação mais próxima (${MODOS[p.est_modo] || "trilho"})</td><td>${esc(p.est_nome)} · ${km1(p.est_dist)}</td></tr>` : ""}
        ${p.calor_anom != null ? `<tr><td>Calor da superfície × média da cidade</td><td>${grau(p.calor_anom)}</td></tr>` : ""}
        ${trabalho && p._t != null ? `<tr><td>De carro até ${esc(trabalho.nome)} (sem trânsito)</td><td>≈ ${num(p._t)} min</td></tr>` : ""}
      </table>
      ${risco(p)}
      ${evolucao(p)}
      <p class="fontes">Fontes: IBGE Censo 2022${p.evo ? " e 2010" : ""}, INEP 2024/IDEB 2023, CNES, OpenStreetMap, ANP 1º sem. 2026, FipeZap${p.cnpj_loja != null ? ", Receita Federal (CNPJ, out/2026)" : ""}${p.seg_roubo_100mil != null ? ", secretaria estadual de segurança 2025" : ""}. <a href="/metodologia/">Como calculamos</a></p>`;
    $("#ficha .btn-comparar").onclick = () => { alternarComparacao(p); ficha(id); };
    $("#ficha .fechar").onclick = () => { selecionado = null; $("#ficha").hidden = true; if (mapa.getLayer("unidades-sel")) mapa.setFilter("unidades-sel", ["==", ["get", "id"], ""]); ranking(); salvarURL(); };
    salvarURL();
    if (mapa.getLayer("unidades-sel")) mapa.setFilter("unidades-sel", ["==", ["get", "id"], id]);
    ranking();
    $("#painel").scrollTo({ top: 0, behavior: "smooth" });
  }

  function focar(id) {
    const f = dados.features.find((x) => x.properties.id === id);
    if (!f) return;
    const b = new maplibregl.LngLatBounds();
    const percorre = (c) => (typeof c[0] === "number" ? b.extend(c) : c.forEach(percorre));
    percorre(f.geometry.coordinates);
    mapa.fitBounds(b, { padding: 60, maxZoom: 14 });
    ficha(id);
  }

  function montarPesos() {
    $("#pesos-lista").innerHTML = Object.entries(TEMAS).map(([k, nome]) =>
      `<label>${nome}<input type="range" min="0" max="3" step="1" value="${pesos[k]}" data-k="${k}"><output>${["ignorar", "normal", "importante", "muito importante"][pesos[k]]}</output></label>`).join("");
    $("#pesos-lista").querySelectorAll("input").forEach((i) => i.addEventListener("input", () => {
      pesos[i.dataset.k] = +i.value;
      i.nextElementSibling.textContent = ["ignorar", "normal", "importante", "muito importante"][+i.value];
      try { localStorage.setItem("om_pesos", JSON.stringify(pesos)); } catch (_) {}
      if (tema !== "geral") selecionarTema("geral"); else atualizar();
    }));
    $("#pesos-lista").querySelectorAll("input").forEach((i) => i.addEventListener("change", () => window.biEvento?.("pesos", `${C.slug}:${i.dataset.k}=${i.value}`)));
  }
  $("#pesos-zerar").onclick = () => { for (const k in pesos) pesos[k] = 1; try { localStorage.removeItem("om_pesos"); } catch (_) {} montarPesos(); atualizar(); };

  function selecionarTema(t) {
    if (t !== tema) window.biEvento?.("tema", `${C.slug}:${t}`);
    tema = t;
    $("#trabalho").hidden = t !== "tempo";
    if (t === "tempo" && !trabalho) entrarModoTrabalho();
    else sairModoTrabalho();
    document.querySelectorAll(".temas button").forEach((b) => b.classList.toggle("ativo", b.dataset.tema === t));
    atualizar();
    salvarURL();
  }
  document.querySelectorAll(".temas button").forEach((b) => (b.onclick = () => selecionarTema(b.dataset.tema)));
  $("#ranking").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) focar(b.dataset.id); });
  $("#troca-capital").onchange = (e) => (location.href = `/${e.target.value}/`);

  // ---------- camadas de pontos ----------
  const dicaRegiao = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dica-mapa" });
  // risco conta só para a dica: o clique numa área de risco ainda abre a ficha da região
  const pontoSobCursor = (e, comRisco = true) => ["escolas", "saude", "transp-est", "transp-lin", "transp-brt", ...(comRisco ? ["risco-fill", "risco-pt"] : [])].some((c) => mapa.getLayer(c) && mapa.getLayoutProperty(c, "visibility") === "visible"
    && mapa.queryRenderedFeatures(e.point, { layers: [c] }).length);

  async function carregarPontos() {
    if (pontos) return pontos;
    pontos = await fetch(`/static/dados/${C.slug}-pontos.json?v=${window.DADOS_V || ""}`).then((r) => r.json());
    const fc = (arr, f) => ({ type: "FeatureCollection", features: arr.map((a) => ({ type: "Feature", geometry: { type: "Point", coordinates: [a[0], a[1]] }, properties: f(a) })) });
    mapa.addSource("escolas", { type: "geojson", data: fc(pontos.escolas, (a) => ({ nome: a[2], rede: a[3], ideb: a[4] ?? a[5] ?? a[6] })) });
    mapa.addSource("saude", { type: "geojson", data: fc(pontos.saude, (a) => ({ nome: a[2], cat: a[3], sus: a[4] })) });
    mapa.addLayer({ id: "escolas", type: "circle", source: "escolas", layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 6], "circle-color": ["match", ["get", "rede"], "privada", "#e07b39", "#1f6fb2"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
    mapa.addLayer({ id: "saude", type: "circle", source: "saude", layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 8], "circle-color": ["match", ["get", "cat"], "hospital", "#c0392b", "urgencia", "#8e44ad", "#16a085"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } });
    // informação ao passar o cursor (no celular, o toque também abre)
    const dicaPonto = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dica-ponto", offset: 10 });
    const descricao = (camada, p) => camada === "escolas"
      ? `${p.rede === "privada" ? "Escola particular" : "Escola pública (" + p.rede + ")"}${p.ideb && p.ideb !== "null" ? " · IDEB " + num(+p.ideb, 1) : ""}`
      : `${{ hospital: "Hospital", ubs: "UBS / posto de saúde", urgencia: "UPA / pronto-socorro" }[p.cat]}${p.sus === true || p.sus === "true" ? " · atende SUS" : ""}`;
    const mostrar = (camada, e) => {
      const f = e.features[0], p = f.properties;
      dicaPonto.setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(p.nome)}</b><br>${esc(descricao(camada, p))}`).addTo(mapa);
    };
    for (const camada of ["escolas", "saude"]) {
      mapa.on("mousemove", camada, (e) => { mapa.getCanvas().style.cursor = "pointer"; dicaRegiao.remove(); mostrar(camada, e); });
      mapa.on("mouseleave", camada, () => { mapa.getCanvas().style.cursor = ""; dicaPonto.remove(); });
      mapa.on("click", camada, (e) => { mostrar(camada, e); e.preventDefault(); });
    }
    return pontos;
  }
  for (const [chk, camada] of [["#cam-escolas", "escolas"], ["#cam-saude", "saude"]]) {
    $(chk).addEventListener("change", async (e) => {
      await carregarPontos(); mapa.setLayoutProperty(camada, "visibility", e.target.checked ? "visible" : "none");
      const esc_ = $("#cam-escolas").checked, sau = $("#cam-saude").checked;
      $("#leg-pontos").hidden = !(esc_ || sau);
      document.querySelectorAll(".lp-esc").forEach((s) => (s.hidden = !esc_));
      document.querySelectorAll(".lp-sau").forEach((s) => (s.hidden = !sau));
    });
  }

  // ---------- metrô, trem e BRT · áreas de risco · relevo (camadas carregadas só quando ligadas) ----------
  const MODOS = { metro: "metrô", trem: "trem", vlt: "VLT", monotrilho: "monotrilho", brt: "BRT" };
  const COR_RISCO = { ma: "#6a0dad", a: "#b10dc9", m: "#e08ee8", bater: "#8e24aa" };
  const COR_MODO = { metro: "#2166ac", trem: "#762a83", vlt: "#1b7837", monotrilho: "#e08214", brt: "#c51b7d" };
  const corModo = ["match", ["get", "m"], ...Object.entries(COR_MODO).flat(), "#555"];
  const antesDosRotulos = () => mapa.getStyle().layers.find((l) => l.type === "symbol")?.id;
  const dicaCamada = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dica-ponto", offset: 8 });
  function dicaEm(camada, texto) {
    mapa.on("mousemove", camada, (e) => { mapa.getCanvas().style.cursor = "pointer"; dicaRegiao.remove(); dicaCamada.setLngLat(e.lngLat).setHTML(texto(e.features[0].properties)).addTo(mapa); });
    mapa.on("mouseleave", camada, () => { mapa.getCanvas().style.cursor = ""; dicaCamada.remove(); });
    mapa.on("click", camada, (e) => { dicaCamada.setLngLat(e.lngLat).setHTML(texto(e.features[0].properties)).addTo(mapa); });
  }
  const carregadas = {};
  async function carregarCamada(nome) {
    if (carregadas[nome] !== undefined) return carregadas[nome];
    const r = await fetch(`/static/dados/${C.slug}-${nome}.geojson?v=${window.DADOS_V || ""}`).catch(() => null);
    const d = r && r.ok ? await r.json() : { type: "FeatureCollection", features: [] };
    carregadas[nome] = d;
    if (!d.features.length) return d;
    mapa.addSource(nome, { type: "geojson", data: d });
    if (nome === "transporte") {
      const largura = ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 6];
      mapa.addLayer({ id: "transp-lin", type: "line", source: "transporte", filter: ["all", ["!", ["has", "e"]], ["!=", ["get", "m"], "brt"]], layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: { "line-color": corModo, "line-width": largura } }, antesDosRotulos());
      // BRT tracejado (o dasharray não aceita expressão por feição, então é outra camada)
      mapa.addLayer({ id: "transp-brt", type: "line", source: "transporte", filter: ["all", ["!", ["has", "e"]], ["==", ["get", "m"], "brt"]], layout: { visibility: "none", "line-join": "round" },
        paint: { "line-color": COR_MODO.brt, "line-width": largura, "line-dasharray": [2, 1] } }, antesDosRotulos());
      mapa.addLayer({ id: "transp-est", type: "circle", source: "transporte", filter: ["has", "e"], layout: { visibility: "none" },
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 6], "circle-color": "#fff", "circle-stroke-color": corModo, "circle-stroke-width": 2 } });
      dicaEm("transp-est", (p) => `<b>${esc(p.n)}</b><br>Estação de ${MODOS[p.m] || p.m}`);
      for (const c of ["transp-lin", "transp-brt"]) dicaEm(c, (p) => `<b>${esc(p.n || MODOS[p.m])}</b><br>${MODOS[p.m] || p.m}${p.r && p.r !== p.n ? " · " + esc(p.r) : ""}`);
    } else {
      // roxo/magenta: fora da escala vermelho→verde das notas, para não se confundir com o bairro de nota baixa
      const cor = ["case", ["==", ["get", "f"], "bater"], COR_RISCO.bater, ["match", ["get", "g"], "ma", COR_RISCO.ma, "a", COR_RISCO.a, COR_RISCO.m]];
      mapa.addLayer({ id: "risco-fill", type: "fill", source: "risco", layout: { visibility: "none" },
        paint: { "fill-color": cor, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.85, 13, 0.6, 16, 0.4] } }, antesDosRotulos());
      mapa.addLayer({ id: "risco-linha", type: "line", source: "risco", layout: { visibility: "none" },
        paint: { "line-color": "#2d0a3e", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 2] } }, antesDosRotulos());
      // muitas áreas têm poucos metros: de longe, um marcador no meio de cada uma mostra onde estão
      const centros = { type: "FeatureCollection", features: d.features.map((f) => {
        let a = [Infinity, Infinity, -Infinity, -Infinity];
        const percorre = (c) => (typeof c[0] === "number" ? (a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]) : c.forEach(percorre));
        percorre(f.geometry.coordinates);
        return { type: "Feature", properties: f.properties, geometry: { type: "Point", coordinates: [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2] } };
      }) };
      mapa.addSource("risco-pt", { type: "geojson", data: centros });
      mapa.addLayer({ id: "risco-pt", type: "circle", source: "risco-pt", maxzoom: 13.5, layout: { visibility: "none" },
        paint: { "circle-color": cor, "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 5], "circle-stroke-color": "#fff", "circle-stroke-width": 1.2,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 1, 13.5, 0], "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 1, 13.5, 0] } });
      const T = { deslizamento: "deslizamento", inundacao: "inundação", erosao: "erosão" };
      for (const c of ["risco-fill", "risco-pt"]) dicaEm(c, (p) => p.f === "bater" ? "<b>Área de risco</b><br>Enchente, enxurrada ou deslizamento · IBGE/CEMADEN 2010"
        : `<b>Risco ${{ ma: "muito alto", a: "alto", m: "médio" }[p.g] || ""}</b>${p.t ? " de " + String(p.t).split(",").map((t) => T[t] || t).join(", ") : ""}<br>${p.p && p.p !== "null" ? "≈ " + num(+p.p) + " moradores · " : ""}SGB ${p.a && p.a !== "null" ? p.a : ""}`);
    }
    return d;
  }
  async function alternarCamada(nome, camadas, ligar, legenda) {
    const d = await carregarCamada(nome);
    const vazio = !d.features.length;
    camadas.forEach((c) => mapa.getLayer(c) && mapa.setLayoutProperty(c, "visibility", ligar ? "visible" : "none"));
    $(legenda).hidden = !ligar;
    return vazio;
  }
  $("#cam-transporte").addEventListener("change", async (e) => {
    const vazio = await alternarCamada("transporte", ["transp-lin", "transp-brt", "transp-est"], e.target.checked, "#leg-transporte");
    window.biEvento?.("camada", `${C.slug}:transporte`);
    $("#leg-transporte-nota").textContent = vazio ? `Não há metrô, trem ou BRT de ${C.nome} no OpenStreetMap.` : "Linhas e estações do OpenStreetMap (colaborativo): pode faltar linha nova ou em obra.";
  });
  $("#cam-risco").addEventListener("change", async (e) => {
    const vazio = await alternarCamada("risco", ["risco-fill", "risco-linha", "risco-pt"], e.target.checked, "#leg-risco");
    // com o risco ligado, as notas ficam bem claras para as áreas aparecerem por cima
    if (mapa.getLayer("unidades-fill")) mapa.setPaintProperty("unidades-fill", "fill-opacity",
      ["case", ["boolean", ["feature-state", "hover"], false], e.target.checked ? 0.4 : 0.92, e.target.checked ? 0.22 : 0.72]);
    window.biEvento?.("camada", `${C.slug}:risco`);
    const bater = (carregadas.risco?.features[0]?.properties.f) === "bater";
    document.querySelectorAll("#leg-risco span").forEach((sp) => (sp.hidden = vazio || (bater ? !sp.classList.contains("lr-bater") : sp.classList.contains("lr-bater"))));
    $("#leg-risco-nota").innerHTML = vazio ? `${esc(C.nome)} não tem áreas de risco no mapeamento do Serviço Geológico do Brasil nem no do IBGE/CEMADEN.`
      : bater ? 'Áreas de risco de enchente, enxurrada ou deslizamento do IBGE e CEMADEN (2010). Mais amplas que o risco real. <a href="/metodologia/#risco">Fontes e limites</a>'
      : 'Setores do Serviço Geológico do Brasil: deslizamento, inundação e erosão. <a href="/metodologia/#risco">Fontes e limites</a>';
  });
  // calor por satélite: imagem pré-calculada (mapa/calor.py) por cima das notas, com os cantos em lon/lat
  $("#cam-calor").addEventListener("change", async (e) => {
    const ligar = e.target.checked;
    window.biEvento?.("camada", `${C.slug}:calor`);
    if (ligar && !mapa.getSource("calor-img")) {
      const meta = await fetch(`/static/dados/${C.slug}-calor.json?v=${window.DADOS_V || ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!meta) {
        $("#leg-calor").hidden = false;
        $("#leg-calor-nota").textContent = `Não há imagens de satélite limpas o bastante para ${C.nome} (muita nuvem nas passagens de 2023 a 2025).`;
        return;
      }
      mapa.addSource("calor-img", { type: "image", url: `/static/dados/${C.slug}-calor.png?v=${window.DADOS_V || ""}`, coordinates: meta.cantos });
      mapa.addLayer({ id: "calor-img", type: "raster", source: "calor-img", paint: { "raster-opacity": 0.8, "raster-fade-duration": 0 } }, "unidades-linha");
    }
    if (mapa.getLayer("calor-img")) mapa.setLayoutProperty("calor-img", "visibility", ligar ? "visible" : "none");
    $("#leg-calor").hidden = !ligar;
  });

  // relevo: altitude do Terrarium (Mapzen/AWS, dados abertos) + sombreamento; o mapa inclina para mostrar os morros
  $("#cam-relevo").addEventListener("change", (e) => {
    const ligar = e.target.checked;
    window.biEvento?.("camada", `${C.slug}:relevo`);
    if (ligar && !mapa.getSource("dem")) {
      const src = { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14,
        attribution: 'Relevo: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen Terrain Tiles</a>' };
      mapa.addSource("dem", src);
      mapa.addSource("dem-sombra", src);
      mapa.addLayer({ id: "sombra", type: "hillshade", source: "dem-sombra", paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#3d3d3d" } }, "unidades-fill");
    }
    if (mapa.getLayer("sombra")) mapa.setLayoutProperty("sombra", "visibility", ligar ? "visible" : "none");
    mapa.setTerrain(ligar ? { source: "dem", exaggeration: 1.6 } : null);
    mapa.easeTo({ pitch: ligar ? 60 : 0, bearing: ligar ? mapa.getBearing() : 0, duration: 900 });
  });

  // ---------- tempo de carro até o trabalho (matriz pré-calculada pelas ruas: mapa/tempos.py) ----------
  async function carregarTempos() {
    if (tempos) return tempos;
    const d = await fetch(`/static/dados/${C.slug}-tempos.json?v=${window.DADOS_V || ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) return null;
    const bin = atob(d.m), m = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) m[i] = bin.charCodeAt(i);
    const idx = Object.fromEntries(d.ids.map((id, i) => [id, i]));
    tempos = { n: d.ids.length, m, idx, min: (de, para) => { const a = idx[de], b = idx[para]; if (a == null || b == null) return null; const v = m[a * d.ids.length + b]; return v === 255 ? null : v; } };
    return tempos;
  }
  function entrarModoTrabalho() {
    modoTrabalho = true; document.body.classList.add("modo-trabalho");
    $("#trabalho-msg").textContent = "Toque no mapa onde você trabalha (ou estuda).";
    $("#trabalho-trocar").hidden = true;
  }
  function sairModoTrabalho() { modoTrabalho = false; document.body.classList.remove("modo-trabalho"); }
  async function definirTrabalho(id, lngLat) {
    const f = dados.features.find((x) => x.properties.id === id);
    if (!f) return;
    const t = await carregarTempos();
    if (!t) { $("#trabalho-msg").textContent = "Os tempos de trajeto desta cidade ainda não estão disponíveis."; return; }
    trabalho = { id, nome: f.properties.nome };
    for (const g of dados.features) g.properties._t = t.min(g.properties.id, id);
    const pos = lngLat || f.properties.c;
    if (!marcadorTrab) { const el = document.createElement("div"); el.className = "marcador-trabalho"; el.textContent = "★"; el.title = "Trabalho"; marcadorTrab = new maplibregl.Marker({ element: el }); }
    marcadorTrab.setLngLat(pos).addTo(mapa);
    sairModoTrabalho();
    $("#trabalho-msg").innerHTML = `Trabalho em <b>${esc(trabalho.nome)}</b>. Cores: minutos de carro, sem trânsito, saindo do centro de cada região.`;
    $("#trabalho-trocar").hidden = false;
    window.biEvento?.("tempo", `${C.slug}:${trabalho.nome}`);
    if (tema !== "tempo") selecionarTema("tempo"); else { atualizar(); salvarURL(); }
  }
  $("#trabalho-trocar").onclick = () => entrarModoTrabalho();

  // ---------- recomendação pessoal (tudo no navegador) ----------
  // velocidade média (km/h) cresce com a distância: trajeto curto é rua com semáforo, longo usa via expressa/eixo
  const VEL = { carro: [18, 50], onibus: [12, 28], bike: [12, 14], pe: [4.5, 4.5] };
  const FIXO = { carro: 5, onibus: 12, bike: 2, pe: 0 };      // minutos fixos: estacionar, esperar o ônibus
  const DESVIO = 1.25;                                         // a rua não é linha reta
  const valor = (s) => { const v = parseFloat(String(s || "").replace(/[^\d,]/g, "").replace(",", ".")); return isNaN(v) ? 0 : v; };
  function km(a, b) {
    const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  const minutos = (a, b, modo) => {
    const d = km(a, b) * DESVIO, [v0, v1] = VEL[modo];
    const v = v0 + (v1 - v0) * (1 - Math.exp(-d / 15));
    return Math.round(FIXO[modo] + (d / v) * 60);
  };
  const form = $("#morar");
  $("#abrir-morar").onclick = () => {
    const abrir = form.hidden; form.hidden = !abrir; $("#abrir-morar").setAttribute("aria-expanded", abrir);
    if (abrir) form.renda.focus();
  };
  form.addEventListener("change", (e) => {
    if (e.target.name !== "moradia") return;
    const prop = form.moradia.value === "propria";
    form.querySelector(".so-aluguel").hidden = prop; form.querySelector(".so-propria").hidden = !prop;
  });
  function preencherRegioes() {
    const nomes = dados.features.map((f) => f.properties).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    for (const sel of [form.atual, form.trabalho]) sel.insertAdjacentHTML("beforeend", nomes.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join(""));
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!dados) return;
    const tm = form.modo.value === "carro" && form.trabalho.value ? await carregarTempos() : null;
    window.biEvento?.("morar", `${C.slug}:${form.moradia.value}:${form.modo.value}`);
    const renda = valor(form.renda.value), area = +form.area.value, modo = form.modo.value, max = +form.max.value;
    const propria = form.moradia.value === "propria", aluguelAtual = valor(form.aluguel.value), imovel = valor(form.imovel.value);
    const feats = dados.features.map((f) => f.properties);
    const atual = feats.find((p) => p.id === form.atual.value), trab = feats.find((p) => p.id === form.trabalho.value);
    const res = $("#resultado");
    if (!renda) { res.hidden = false; res.innerHTML = `<p>Informe a renda da família para calcular.</p>`; return; }
    if (!feats.some((p) => p.aluguel_m2_est)) {
      res.hidden = false; res.innerHTML = `<p>Ainda não temos preço de imóveis para ${esc(C.nome)} (o FipeZap não cobre a cidade). As notas dos bairros continuam valendo no mapa.</p>`; return;
    }
    // teto: imóvel próprio → trocar pelo valor do imóvel; aluguel → o maior entre o aluguel atual e 30% da renda
    const teto30 = renda * 0.3, teto = propria ? imovel : Math.max(aluguelAtual, teto30);
    if (propria && !imovel) { res.hidden = false; res.innerHTML = `<p>Informe o valor aproximado do seu imóvel para compararmos com o preço de compra em outros bairros.</p>`; return; }
    calcular();
    for (const p of feats) {
      p._custo = propria ? (p.venda_m2_est ? p.venda_m2_est * area : null) : (p.aluguel_m2_est ? p.aluguel_m2_est * area : null);
      const real = tm ? tm.min(p.id, trab.id) : null;  // carro: tempo pelas ruas (sem trânsito) + estacionar
      p._min = real != null ? real + FIXO.carro : trab && p.c && trab.c ? minutos(p.c, trab.c, modo) : null;
      p._ok = p._custo != null && p._custo <= teto && (p._min == null || p._min <= max);
    }
    const base = atual ? atual.geral_p : null;
    const cands = feats.filter((p) => p._ok && (!atual || (p.id !== atual.id && p.geral_p > base + 0.3))).sort((a, b) => b.geral_p - a.geral_p);
    const cabem = feats.filter((p) => p._ok).length;
    const r = (v) => "R$ " + num(Math.round(v / 50) * 50);
    const porque = (p) => {
      if (!atual) return Object.keys(TEMAS).filter((k) => p[k] != null).sort((a, b) => p[b] - p[a]).slice(0, 2).map((k) => `${TEMAS[k].toLowerCase()} (${num(p[k], 1)})`).join(" e ");
      const m = Object.keys(TEMAS).filter((k) => p[k] != null && atual[k] != null && p[k] - atual[k] >= 1).sort((a, b) => (p[b] - atual[b]) - (p[a] - atual[a]));
      return m.length ? m.slice(0, 3).map((k) => `${TEMAS[k].toLowerCase()} (+${num(p[k] - atual[k], 1)})`).join(", ") : "um pouco melhor em vários temas";
    };
    let resumo = propria
      ? `Com o valor do seu imóvel (${r(imovel)}), dá para comprar cerca de ${area} m² em <b>${cabem}</b> ${cabem === 1 ? "região" : "regiões"}${trab ? ` a até ${max === 999 ? "qualquer distância" : max + " min"} do trabalho` : ""}.`
      : `Até <b>${r(teto)}</b> de aluguel${aluguelAtual > teto30 ? " (o que você já paga)" : " (30% da renda)"}, cerca de ${area} m² cabem em <b>${cabem}</b> ${cabem === 1 ? "região" : "regiões"}${trab ? ` a até ${max === 999 ? "qualquer distância" : max + " min"} do trabalho` : ""}.`;
    if (!propria && aluguelAtual > teto30) resumo += ` <span class="alerta">Seu aluguel hoje é ${num(aluguelAtual / renda * 100)}% da renda; o recomendado é até 30%.</span>`;
    let corpo;
    const lista = (arr) => `<ol class="cands">` + arr.slice(0, 6).map((p) =>
      `<li><button type="button" data-id="${esc(p.id)}"><span class="cn">${esc(p.nome)}</span><span class="cv">${num(p.geral_p, 1)}</span>
      <span class="cd">${propria ? "compra" : "aluguel"} ≈ ${r(p._custo)}${propria ? "" : "/mês"}${p._min != null ? ` · ≈ ${p._min} min até o trabalho` : ""}</span>
      <span class="cp">${atual && p.geral_p > base ? "Melhor em " + porque(p) : "Destaques: " + Object.keys(TEMAS).filter((k) => p[k] != null).sort((a, b) => p[b] - p[a]).slice(0, 2).map((k) => TEMAS[k].toLowerCase()).join(" e ")}</span></button></li>`).join("") + "</ol>";
    const okLista = feats.filter((p) => p._ok).sort((a, b) => b.geral_p - a.geral_p);
    if (atual && trab && atual._min != null) resumo += ` Hoje, de ${esc(atual.nome)} até o trabalho, são cerca de ${atual._min} min.`;
    if (!cabem) corpo = `<p>Nenhuma região cabe nesse orçamento${trab ? " e trajeto" : ""}. Tente um imóvel menor, aceitar um trajeto maior ou outro meio de transporte.</p>`;
    else if (atual && !cands.length && atual._ok) corpo = `<p class="bom">Boa notícia: <b>${esc(atual.nome)}</b> (nota ${num(base, 1)}) já é das melhores opções que cabem no seu orçamento${trab ? " e trajeto" : ""}.</p>`;
    else if (atual && !cands.length) corpo = `<p>Nenhuma região que cabe tem nota claramente maior que <b>${esc(atual.nome)}</b> (${num(base, 1)}), mas estas cabem${trab ? " e ficam mais perto do trabalho" : ""}:</p>` + lista(okLista);
    else corpo = `<p>${atual ? `Estas têm nota geral melhor que <b>${esc(atual.nome)}</b> (${num(base, 1)}):` : "As de melhor nota que cabem:"}</p>` + lista(cands);
    res.hidden = false;
    res.innerHTML = `<h2>O que encontramos</h2><p>${resumo}</p>${corpo}
      <p class="nota">Estimativas: o preço vem da média da cidade no FipeZap ajustada pela renda da região, e o trajeto, ${tm ? "do caminho pelas ruas, de carro e sem trânsito (no pico, conte mais)" : `da distância em linha reta com velocidade típica de ${{ carro: "carro", onibus: "ônibus", bike: "bicicleta", pe: "caminhada" }[modo]}`}. Confira anúncios e rotas reais antes de decidir. As notas seguem os pesos escolhidos em "Ajustar o que importa".</p>
      <p class="pd-cta">Quer ajuda para ${propria ? "comprar" : "alugar"} numa dessas regiões? <a href="/falar-com-corretor/?capital=${C.slug}&regioes=${(cands.length ? cands : okLista).slice(0, 3).map((p) => encodeURIComponent(p.id)).join(",")}" id="morar-pedido">Peça contato de um corretor parceiro</a> (grátis; a sua renda não é enviada).</p>
      <button class="link" type="button" id="limpar-morar">Limpar e ver o mapa completo</button>`;
    // objetivo e teto vão por sessionStorage para o formulário, não na URL; a renda nunca sai daqui
    $("#morar-pedido").onclick = () => { try { sessionStorage.setItem("bi_pedido", JSON.stringify({ objetivo: propria ? "comprar" : "alugar", valor_max: Math.round(teto) })); } catch (_) {} };
    res.querySelectorAll("button[data-id]").forEach((b) => (b.onclick = () => focar(b.dataset.id)));
    $("#limpar-morar").onclick = () => { res.hidden = true; for (const p of feats) p._ok = false; selecionarTema("geral"); };
    selecionarTema("morar");
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------- início ----------
  // os dados das regiões chegam sem esperar o mapa-base: painel, ranking e formulário funcionam mesmo com tiles lentos
  const pDados = fetch(`/static/dados/${C.slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json()).then((d) => {
    dados = d;
    calcular();
    montarPesos();
    preencherRegioes();
    bandeja();
    if (!dados.features.some((f) => f.properties.seguranca != null)) { const b = document.querySelector('.temas button[data-tema="seguranca"]'); if (b) b.hidden = true; }
    legenda();
    ranking();
    const q = new URLSearchParams(location.search);
    if (q.has("morar")) $("#abrir-morar").click();
    const alvo = q.get("regiao");
    const temQ = q.get("tema");
    if (temQ && (TEMAS[temQ] || ["custo", "geral", "calor"].includes(temQ))) selecionarTema(temQ);
    if (q.get("trabalho")) definirTrabalho(q.get("trabalho"));
    else if (temQ === "tempo") selecionarTema("tempo");
    if (alvo) {
      const f = dados.features.find((x) => x.properties.nome.toLowerCase() === alvo.toLowerCase());
      if (f) zoomNoLink ? ficha(f.properties.id) : focar(f.properties.id);  // com zoom no link, respeita o zoom
    }
    return d;
  });
  mapa.on("load", async () => {
    await pDados;
    calcular();
    mapa.addSource("unidades", { type: "geojson", data: dados, promoteId: "id" });
    const antes = mapa.getStyle().layers.find((l) => l.type === "symbol")?.id;
    mapa.addLayer({ id: "unidades-fill", type: "fill", source: "unidades", paint: { "fill-color": corExpr(),
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.92, 0.72] } }, antes);
    mapa.addLayer({ id: "unidades-linha", type: "line", source: "unidades", paint: { "line-color": "#ffffff", "line-width": 0.8 } }, antes);
    mapa.addLayer({ id: "unidades-sel", type: "line", source: "unidades", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#1b1f1d", "line-width": 2.5 } }, antes);
    let hover = null;
    const dica = dicaRegiao;
    mapa.on("mousemove", "unidades-fill", (e) => {
      if (pontoSobCursor(e)) return;  // a dica da escola/hospital tem prioridade
      const f = e.features[0];
      if (hover !== null) mapa.setFeatureState({ source: "unidades", id: hover }, { hover: false });
      hover = f.id; mapa.setFeatureState({ source: "unidades", id: hover }, { hover: true });
      mapa.getCanvas().style.cursor = "pointer";
      const p = f.properties, v = p._v === "null" ? null : +p._v;
      if (modoTrabalho) { dica.setLngLat(e.lngLat).setHTML(`<b>${esc(p.nome)}</b><br>toque para marcar o trabalho aqui`).addTo(mapa); return; }
      dica.setLngLat(e.lngLat).setHTML(`<b>${esc(p.nome)}</b><br>${tema === "custo" ? (v ? "≈ R$ " + num(v, 0) + "/m²" : "sem dado") : tema === "tempo" ? (v == null || isNaN(v) ? "sem dado" : "≈ " + num(v) + " min de carro") : tema === "calor" ? (v == null || isNaN(v) ? "sem dado" : grau(v) + " × média da cidade") : (v == null || isNaN(v) ? "sem dado" : "nota " + num(v, 1))}`).addTo(mapa);
    });
    mapa.on("mouseleave", "unidades-fill", () => { if (hover !== null) mapa.setFeatureState({ source: "unidades", id: hover }, { hover: false }); hover = null; dica.remove(); mapa.getCanvas().style.cursor = ""; });
    mapa.on("click", (e) => {
      if (!modoTrabalho) return;
      const f = regiaoEm([e.lngLat.lng, e.lngLat.lat]);
      if (f) definirTrabalho(f.properties.id, [e.lngLat.lng, e.lngLat.lat]);
      else $("#trabalho-msg").textContent = `Esse ponto fica fora de ${C.nome}. Toque dentro da cidade.`;
      e.preventDefault();
    });
    mapa.on("click", "unidades-fill", (e) => { if (modoTrabalho || e.defaultPrevented || pontoSobCursor(e, false)) return; ficha(e.features[0].properties.id); });
    if (selecionado) mapa.setFilter("unidades-sel", ["==", ["get", "id"], selecionado]);
  });
})();
