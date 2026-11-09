/* Bairro Ideal — "Descreva o bairro que você procura": interpreta uma frase por palavras-chave (sem IA e sem enviar nada) e
   ranqueia as regiões da capital pelos temas pedidos, respeitando o valor. Mostra sempre o que entendeu, para a pessoa corrigir. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v) => "R$ " + num(Math.round(v / 10) * 10);
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Rua", lazer: "Lazer", comercio: "Comércio", seguranca: "Segurança" };
  const CAPS = window.CAPITAIS, f = $("#f-achar"), V = window.DADOS_V || "";
  let slugs = null;

  // palavra-chave → temas com peso (a soma de várias palavras acumula)
  const REGRAS = [
    [/escola|crianca|filho|filha|familia|colegio|creche|educacao|estudar|faculdade/, { educacao: 3, lazer: 1, saude: 1 }, "escolas e família"],
    [/hospital|saude|posto|ubs|idos|aposentad|terceira idade|medic|clinica/, { saude: 3, saneamento: 1 }, "saúde por perto"],
    [/seguro|segur|violencia|assalto|roubo|crime/, { seguranca: 3 }, "segurança"],
    [/parque|verde|arvore|natureza|correr|caminhar|ar livre|pracas?|lazer|esporte|academia|cultura/, { lazer: 3, rua: 1 }, "lazer e áreas verdes"],
    [/comercio|mercado|padaria|restaurante|bares?|farmacia|servicos|agitad|movimentad|vida noturna|conveniente/, { comercio: 3 }, "comércio e serviços"],
    [/tranquil|sossego|silenc|calmo|pacato|residencial/, { rua: 2, saneamento: 1, lazer: 1 }, "tranquilidade (ruas bem cuidadas, menos agito)"],
    [/saneamento|esgoto|agua|lixo|limpo|limpeza|enchente|alag/, { saneamento: 3 }, "saneamento"],
    [/onibus|transporte|sem carro|a pe|andar a pe|calcada|ciclovia|bicicleta/, { rua: 3, comercio: 1 }, "ir sem carro (calçada, ponto de ônibus, comércio perto)"],
  ];
  const BARATO = /barato|economic|em conta|acessivel|bom e barato|custo.beneficio|pouco/;

  function interpretar(texto) {
    const t = norm(texto);
    const r = { texto, capital: null, compra: /compra|comprar|financi|vend[ae]|casa propria|imovel proprio/.test(t) && !/alug/.test(t), valor: null, area: null, pesos: {}, rotulos: [], barato: BARATO.test(t), tranquilo: /tranquil|sossego|silenc|calmo|pacato/.test(t) };
    // capital: o maior nome que aparece (evita "Rio" casar com "Rio Branco")
    const achadas = CAPS.filter((c) => new RegExp("(^|[^a-z])" + norm(c.nome) + "([^a-z]|$)").test(t)).sort((a, b) => b.nome.length - a.nome.length);
    r.capital = achadas[0] || null;
    if (!r.capital && /\bsampa\b/.test(t)) r.capital = CAPS.find((c) => c.slug === "sao-paulo");
    // valor: "até 2.500", "R$ 2500", "2 mil", "500 mil", "1,2 milhao"
    let m = t.match(/(\d+(?:[.,]\d+)?)\s*(milhoes?|milhao|mil|k)\b/);
    if (m) { const n = Number(m[1].replace(/\./g, "").replace(",", ".")); r.valor = /milh/.test(m[2]) ? n * 1e6 : n * 1e3; }
    else {
      m = t.match(/(?:ate|r\$|max(?:imo)?|por|de)\s*r?\$?\s*(\d{1,3}(?:\.\d{3})+|\d{3,9})(?!\s*(?:m2|m²|metros))/);
      if (m) r.valor = Number(m[1].replace(/\./g, ""));
    }
    m = t.match(/(\d{2,3})\s*(?:m2|m²|metros|m\b)/); if (m) r.area = Number(m[1]);
    const rot = [];
    for (const [re, w, nome] of REGRAS) if (re.test(t)) { for (const [k, v] of Object.entries(w)) r.pesos[k] = (r.pesos[k] || 0) + v; rot.push(nome); }
    r.rotulos = rot;
    return r;
  }

  async function responder(texto) {
    const res = $("#achar-res"); res.hidden = false;
    const it = interpretar(texto);
    if (!it.capital) {
      res.innerHTML = `<div class="vale-bairro"><h3>Em qual capital?</h3><p>Não achamos o nome da cidade na sua frase. Escolha uma:</p>
        <p class="achar-caps">${CAPS.map((c) => `<button type="button" class="chip" data-c="${c.nome}">${esc(c.nome)}</button>`).join("")}</p></div>`;
      res.onclick = (e) => { const b = e.target.closest("button[data-c]"); if (b) { f.texto.value = `${f.texto.value.trim()} em ${b.dataset.c}`; f.requestSubmit(); } };
      return;
    }
    res.onclick = null;
    const slug = it.capital.slug;
    const geo = await fetch(`/static/dados/${slug}.geojson?v=${V}`).then((r) => r.json());
    if (!slugs) slugs = await fetch(`/static/dados/slugs.json?v=${V}`).then((r) => r.json()).catch(() => ({}));
    const regs = geo.features.map((x) => x.properties).filter((p) => !p.pouco && p.geral != null);
    const area = it.area || 60, col = it.compra ? "venda_m2_est" : "aluguel_m2_est";
    const temPreco = regs.some((p) => p[col]);
    const pesos = Object.keys(it.pesos).length ? it.pesos : Object.fromEntries(Object.keys(TEMAS).map((k) => [k, 1]));
    const temSeg = regs.some((p) => p.seguranca != null);
    if (pesos.seguranca && !temSeg) delete pesos.seguranca;
    const avisos = [];
    if (it.pesos.seguranca && !temSeg) avisos.push(`Segurança: ${esc(it.capital.nome)} ainda não tem dado de segurança por bairro, então esse critério ficou de fora.`);
    if (it.valor && !temPreco) avisos.push(`Ainda não temos estimativa de preço para ${esc(it.capital.nome)} (o FipeZap não cobre a cidade), então o valor não foi usado.`);
    if (it.valor && it.valor < (it.compra ? 50000 : 300)) avisos.push(`O valor ${brl(it.valor)} parece baixo para ${it.compra ? "comprar" : "alugar"}; confira se digitou certo.`);
    let cand = regs.map((p) => {
      let soma = 0, peso = 0;
      for (const [k, w] of Object.entries(pesos)) if (p[k] != null) { soma += w * p[k]; peso += w; }
      const preco = p[col] ? p[col] * area : null;
      let nota = peso ? soma / peso : p.geral;
      if (it.tranquilo && p.comercio != null) nota -= 0.25 * Math.max(0, p.comercio - 6);   // "tranquilo" não combina com os centros de maior movimento
      return { p, nota, preco };
    });
    if (it.valor && temPreco) cand = cand.filter((x) => x.preco != null && x.preco <= it.valor * 1.05);
    // "barato e bom": pesa o custo-benefício (nota alta com preço por m² abaixo da mediana)
    if (it.barato && temPreco) {
      const med = regs.map((p) => p[col]).filter(Boolean).sort((a, b) => a - b)[Math.floor(regs.length / 2)];
      cand = cand.filter((x) => x.preco != null && x.p[col] <= med);
    }
    cand.sort((a, b) => b.nota - a.nota);
    const top = cand.slice(0, 8);
    window.biEvento?.("achar", `${slug}:${top.length}`);
    const entendi = [`<b>${esc(it.capital.nome)}</b>`, it.compra ? "comprar" : "alugar",
      it.valor ? `até <b>${brl(it.valor)}</b>${it.compra ? "" : "/mês"}` : null, `imóvel de ${area} m²${it.area ? "" : " (padrão)"}`,
      ...(it.rotulos.length ? it.rotulos : ["sem prioridade específica (nota geral)"]), it.barato ? "preço abaixo da região típica" : null].filter(Boolean);
    const motivo = (p) => {
      const bons = Object.keys(pesos).filter((k) => p[k] != null && p[k] >= 7).sort((a, b) => p[b] - p[a]).slice(0, 3).map((k) => `${TEMAS[k].toLowerCase()} ${num(p[k], 1)}`);
      return bons.length ? `Pontos fortes: ${bons.join(", ")}.` : "Atende à média do que você pediu.";
    };
    res.innerHTML = `
      <div class="vale-bairro"><h3>O que entendemos</h3><p class="achar-chips">${entendi.map((e) => `<span class="chip fixo">${e}</span>`).join("")}</p>
        <p class="nota">Não é isso? Ajuste a frase acima e busque de novo.</p>${avisos.map((a) => `<p class="aviso">${a}</p>`).join("")}</div>
      ${top.length ? `<div class="vale-bairro"><h3>${top.length} bairros que mais combinam</h3><ol class="achar-lista">${top.map((x, i) => {
        const s = slugs[slug]?.[x.p.id], href = s ? `/${slug}/${s}/` : `/${slug}/?regiao=${encodeURIComponent(x.p.nome)}`;
        return `<li><div><a href="${href}"><b>${esc(x.p.nome)}</b></a><small>${motivo(x.p)}</small>
          <small>${x.preco ? `≈ ${brl(x.preco)}${it.compra ? "" : "/mês"} por ${area} m² (estimativa)` : "sem estimativa de preço"}</small></div>
          <span class="b-nota-mini" style="--cor:${cor(x.nota)}">${num(x.nota, 1)}</span></li>`; }).join("")}</ol>
        <p class="cta"><a class="btn sec" href="/comparar/?l=${top.slice(0, 3).map((x) => slug + ":" + x.p.id).join(",")}">Comparar os 3 primeiros</a>
        <a class="btn sec" href="/falar-com-corretor/?capital=${slug}&regioes=${top.slice(0, 3).map((x) => encodeURIComponent(x.p.id)).join(",")}">Falar com um corretor</a></p></div>`
        : `<p class="aviso">Nenhum bairro de ${esc(it.capital.nome)} cabe nesse valor com esses critérios. Tente um valor maior ou menos prioridades.</p>`}
      <p class="nota">As notas vêm do mesmo cálculo do mapa, com os pesos dos temas que você citou. Preço é estimativa (FipeZap da cidade ajustado pela renda do bairro), não anúncio. <a href="/metodologia/">Como calculamos</a></p>`;
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  f.onsubmit = (ev) => { ev.preventDefault(); const t = f.texto.value.trim(); if (t.length >= 3) responder(t); };
  document.querySelectorAll(".achar-exemplos .chip").forEach((b) => (b.onclick = () => { f.texto.value = b.textContent; f.requestSubmit(); }));
  const q = new URLSearchParams(location.search).get("q");
  if (q) { f.texto.value = q.slice(0, 300); f.requestSubmit(); }
})();
