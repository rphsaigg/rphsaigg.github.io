/* Bairro Ideal — "Onde abrir meu negócio?": oportunidade = demanda (moradores, com a renda no peso escolhido) ÷ estabelecimentos
   ativos do mesmo tipo (CNPJ, Receita Federal). Ranking dentro da capital; tudo no navegador. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];
  const NOMES = { mercado: "mercados, padarias e hortifrútis", restaurante: "bares e restaurantes", farmacia: "farmácias", beleza: "salões e barbearias", pet: "pet shops e veterinários", academia: "academias", loja: "lojas", banco: "bancos e lotéricas" };
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const f = $("#f-neg"), V = window.DADOS_V || "";
  let slugs = null;
  f.capital.innerHTML = window.CAPITAIS.map((c) => `<option value="${c.slug}"${c.slug === "brasilia" ? " selected" : ""}>${esc(c.nome)}</option>`).join("");
  const q = new URLSearchParams(location.search);
  if (CAP[q.get("capital")]) f.capital.value = q.get("capital");
  if (NOMES[q.get("tipo")]) f.tipo.value = q.get("tipo");

  const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const slug = f.capital.value, tipo = f.tipo.value, publico = f.publico.value, c = CAP[slug];
    const res = $("#neg-res"); res.hidden = false; res.innerHTML = `<p class="nota">Calculando…</p>`;
    const geo = await fetch(`/static/dados/${slug}.geojson?v=${V}`).then((r) => r.json());
    if (!slugs) slugs = await fetch(`/static/dados/slugs.json?v=${V}`).then((r) => r.json()).catch(() => ({}));
    const col = "cnpj_" + tipo;
    const regs = geo.features.map((x) => x.properties).filter((p) => !p.pouco && (p["pop"] || 0) >= 3000 && p[col] != null);
    if (regs.length < 5) { res.innerHTML = `<p class="aviso">Ainda não temos dados de estabelecimentos suficientes para ${esc(c.nome)}.</p>`; return; }
    const peso = (p) => {
      const renda = p.renda_mediana || 1;
      return publico === "renda" ? p["pop"] * Math.sqrt(renda) : publico === "popular" ? p["pop"] / Math.sqrt(Math.max(renda, 800)) * 30 : p["pop"];
    };
    const todos = regs.map((p) => ({ p, n: p[col], dem: peso(p), por: p["pop"] / (p[col] + 1), incerto: p[col] === 0 && p["pop"] >= 20000 }));
    // bairro grande com zero cadastros quase sempre tem empresas registradas em outro bairro (ex.: Sol Nascente no DF): não entra na nota
    const incertos = todos.filter((i) => i.incerto), itens = todos.filter((i) => !i.incerto);
    itens.forEach((i) => (i.idx = i.dem / (i.n + 1)));
    // oportunidade: posição (0–10) do índice entre as regiões da capital
    const ord = [...itens].sort((a, b) => a.idx - b.idx);
    ord.forEach((i, k) => (i.nota = ord.length > 1 ? (k / (ord.length - 1)) * 10 : 5));
    const medPor = mediana(itens.map((i) => i.por));
    itens.forEach((i) => (i.sinal = i.por >= medPor * 1.5 ? ["Pouca concorrência", "bom"] : i.por <= medPor * 0.6 ? ["Muito disputado", "ruim"] : ["Equilibrado", "meio"]));
    itens.sort((a, b) => b.nota - a.nota);
    incertos.forEach((i) => { i.nota = null; i.sinal = ["Dado incerto", "meio"]; });
    const total = itens.reduce((s, i) => s + i.n, 0);
    window.biEvento?.("negocio", `${slug}:${tipo}:${publico}`);
    const linha = (i, k) => {
      const s = slugs[slug]?.[i.p.id];
      return `<tr><td>${k + 1}</td><td><a href="${s ? `/${slug}/${s}/` : `/${slug}/?regiao=${encodeURIComponent(i.p.nome)}`}">${esc(i.p.nome)}</a></td>
        <td>${num(i.p["pop"])}</td><td>${i.p.renda_mediana ? "R$ " + num(i.p.renda_mediana) : "—"}</td><td>${num(i.n)}</td><td>${num(Math.round(i.por))}</td>
        <td>${i.nota == null ? "—" : `<span class="neg-nota" style="--cor:${cor(i.nota)}">${num(i.nota, 1)}</span>`}</td><td><span class="neg-sinal ${i.sinal[1]}">${i.sinal[0]}</span></td></tr>`;
    };
    const topo = itens.slice(0, 3).map((i) => i.p.nome);
    res.innerHTML = `
      <div class="vale-veredito dentro"><span>${esc(c.nome)} · ${NOMES[tipo]} · ${num(total)} estabelecimentos ativos</span>
        <h2>Mais espaço para ${NOMES[tipo]}: ${esc(topo.join(", "))}</h2>
        <p>Em ${esc(topo[0])} há cerca de ${num(Math.round(itens[0].por))} moradores por estabelecimento; a região típica de ${esc(c.nome)} tem ${num(Math.round(medPor))}.</p></div>
      <div class="vale-bairro tabela-rolavel"><table class="neg-tab"><thead><tr><th>#</th><th>Região</th><th>Moradores</th><th>Renda mediana</th><th>Já existem</th><th>Moradores por estab.</th><th>Oportunidade</th><th>Concorrência</th></tr></thead>
        <tbody id="neg-corpo">${itens.slice(0, 15).map(linha).join("")}</tbody></table>
        ${incertos.length ? `<p class="nota">Sem nota: ${incertos.map((i) => esc(i.p.nome)).join(", ")} (bairro grande sem nenhum cadastro; as empresas costumam estar registradas em outro bairro).</p>` : ""}
        ${itens.length > 15 ? `<p><button class="btn sec" type="button" id="neg-mais">Ver as ${itens.length} regiões com nota</button></p>` : ""}</div>
      <div class="cta"><button class="btn" type="button" id="b-cartao">Compartilhar cartão</button>
        <a class="btn sec" href="/esse-aluguel-vale/?capital=${slug}">Quanto custa o aluguel?</a></div>
      <p class="nota"><b>Como ler:</b> “Oportunidade” é a posição da região entre as de ${esc(c.nome)} (10 = mais moradores por estabelecimento). Só entram regiões com 3 mil moradores ou mais. Cada CNPJ ativo conta como um concorrente, inclusive quem atende só pela internet, e o endereço do cadastro pode não ser o ponto de venda. Não mostramos o aluguel de pontos comerciais, o fluxo de pessoas de passagem (um centro pode valer mais do que o número sugere) nem a qualidade dos concorrentes: confirme no local antes de investir. <a href="/metodologia/">Fontes e método</a></p>`;
    $("#neg-mais")?.addEventListener("click", (e) => { $("#neg-corpo").innerHTML = itens.map(linha).join(""); e.target.parentElement.remove(); });
    $("#b-cartao").onclick = () => BICartao.compartilhar({
      titulo: `Onde abrir ${NOMES[tipo]} em ${c.nome}`, subtitulo: "Bairros com mais moradores por estabelecimento ativo", nota: Math.round(itens[0].nota * 10) / 10, origem: "negocio",
      itens: itens.slice(0, 5).map((i) => [i.p.nome, `${num(Math.round(i.por))} hab/estab.`]), destaque: "Dados da Receita Federal e do Censo 2022", url: "https://bairroideal.com.br/onde-abrir-negocio/",
    });
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  };
})();
