/* Bairro Ideal — "Esse aluguel vale?": a pessoa digita bairro, tamanho e preço de um anúncio (não lemos o anúncio)
   e vê se o preço está dentro da estimativa da região, as notas do bairro e bairros parecidos mais baratos por perto.
   ?capital=slug&regiao=id preenche. Tudo roda no navegador; nada é enviado (só o evento agregado "aluguel_vale"). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v) => "R$ " + num(Math.round(v / 10) * 10);
  const valor = (s) => Number(String(s || "").replace(/[^\d,]/g, "").replace(",", ".")) || 0;
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Rua", lazer: "Lazer", comercio: "Comércio", seguranca: "Segurança" };
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];
  const q = new URLSearchParams(location.search);
  const f = $("#f-vale");
  let slugs = {};
  const pSlugs = fetch(`/static/dados/slugs.json?v=${window.DADOS_V || ""}`).then((r) => r.json()).then((d) => (slugs = d)).catch(() => {});
  const cache = {};
  const capital = (slug) => (cache[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json()).then((g) => g.features.map((x) => x.properties)));
  const linkBairro = (slug, p) => (slugs[slug]?.[p.id] ? `/${slug}/${slugs[slug][p.id]}/` : `/${slug}/?regiao=${encodeURIComponent(p.nome)}`);

  f.capital.innerHTML = `<option value="">Escolha…</option>` + window.CAPITAIS.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");
  async function trocarCapital(slug, id) {
    f.capital.value = CAP[slug] ? slug : "";
    const lista = CAP[slug] ? [...(await capital(slug))].sort((a, b) => a.nome.localeCompare(b.nome, "pt")) : [];
    f.regiao.innerHTML = `<option value="">${lista.length ? "Escolha o bairro…" : "Escolha a capital primeiro"}</option>` + lista.map((p) => `<option value="${esc(p.id)}"${p.id === id ? " selected" : ""}>${esc(p.nome)}</option>`).join("");
    f.regiao.disabled = !lista.length;
    $("#sem-preco").hidden = !lista.length || lista.some((p) => p.aluguel_m2_est);
  }
  f.capital.onchange = () => trocarCapital(f.capital.value);
  f.addEventListener("change", (e) => { if (e.target.name === "tipo") $("#rot-preco").textContent = f.tipo.value === "compra" ? "Preço pedido (R$)" : "Aluguel pedido por mês, sem condomínio e IPTU (R$)"; });
  trocarCapital(q.get("capital") || "", q.get("regiao") || "");

  const faixa = window.BIImoveis.faixa;   // as mesmas faixas dos imóveis dos corretores (imoveis.js)

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const res = $("#vale-res");
    const slug = f.capital.value, compra = f.tipo.value === "compra", area = valor(f.area.value), preco = valor(f.preco.value);
    const lista = slug ? await capital(slug) : [];
    const p = lista.find((x) => x.id === f.regiao.value);
    if (!p || !area || !preco) { res.hidden = false; res.innerHTML = `<p class="aviso">Preencha a capital, o bairro, o tamanho e o preço.</p>`; return; }
    const m2 = compra ? p.venda_m2_est : p.aluguel_m2_est;
    if (!m2) { res.hidden = false; res.innerHTML = `<p class="aviso">Ainda não temos estimativa de preço para ${esc(CAP[slug].nome)} (o FipeZap não cobre a cidade). As notas do bairro continuam na <a href="${linkBairro(slug, p)}">página de ${esc(p.nome)}</a>.</p>`; return; }
    await pSlugs;
    const est = m2 * area, r = preco / est, [cls, titulo, texto] = faixa(r);
    window.biEvento?.("aluguel_vale", `${slug}:${cls}`);
    // parecidos mais baratos: nota geral no máximo 0,3 abaixo, preço por m² pelo menos 15% menor, os mais perto
    const k = Math.cos((p.c?.[1] || 0) * Math.PI / 180);
    const dist = (x) => (p.c && x.c ? Math.hypot((x.c[0] - p.c[0]) * k, x.c[1] - p.c[1]) * 111.2 : 999);
    const parecidos = lista.filter((x) => x.id !== p.id && !x.pouco && x.geral != null && p.geral != null && x.geral >= p.geral - 0.3 && (compra ? x.venda_m2_est : x.aluguel_m2_est) && (compra ? x.venda_m2_est : x.aluguel_m2_est) <= m2 * 0.85)
      .sort((a, b) => dist(a) - dist(b)).slice(0, 4);
    const temas = Object.entries(TEMAS).filter(([t]) => p[t] != null);
    try { sessionStorage.setItem("bi_pedido", JSON.stringify({ objetivo: compra ? "comprar" : "alugar", valor_max: Math.round(Math.min(preco, est * 1.15)) })); } catch (_) {}
    res.hidden = false;
    res.innerHTML = `
      <div class="vale-veredito ${cls}">
        <span>${compra ? "Preço pedido" : "Aluguel pedido"}: <b>${brl(preco)}${compra ? "" : "/mês"}</b> · estimativa para ${num(area)} m² em ${esc(p.nome)}: <b>${brl(est * 0.9)} a ${brl(est * 1.15)}</b></span>
        <h2>${titulo}</h2>
        <p>${texto}</p>
        <div class="vale-barra" aria-hidden="true"><i style="left:${Math.max(0, Math.min(100, (r - 0.5) / 1.2 * 100))}%"></i></div>
        <div class="vale-escala"><span>bem abaixo</span><span>dentro</span><span>bem acima</span></div>
      </div>
      <div class="vale-bairro">
        <h3>${esc(p.nome)} em números</h3>
        <p>Nota geral <b style="border-left:4px solid ${cor(p.geral ?? 0)};padding-left:.4rem">${p.geral != null ? num(p.geral, 1) : "—"}</b>${p.rank ? ` · ${p.rank}º de ${lista.length} em ${esc(CAP[slug].nome)}` : ""}</p>
        <p class="vale-temas">${temas.map(([t, n]) => `<span>${n} <b>${num(p[t], 1)}</b></span>`).join("")}</p>
        <p><a href="${linkBairro(slug, p)}">Tudo sobre morar em ${esc(p.nome)}</a> · <a href="/${slug}/?morar=1">Onde eu poderia morar melhor?</a></p>
      </div>
      ${parecidos.length ? `<div class="vale-bairro"><h3>Parecidos e mais baratos por perto</h3><ul class="vale-lista">${parecidos.map((x) => {
        const xm2 = compra ? x.venda_m2_est : x.aluguel_m2_est;
        return `<li><a href="${linkBairro(slug, x)}">${esc(x.nome)}</a> · nota ${num(x.geral, 1)} · ≈ ${brl(xm2 * area)}${compra ? "" : "/mês"} por ${num(area)} m² · ${num(dist(x), 1)} km</li>`;
      }).join("")}</ul></div>` : ""}
      <p class="pd-cta">Quer ajuda para negociar ou achar outras opções? <a href="/falar-com-corretor/?capital=${slug}&regioes=${[p, ...parecidos.slice(0, 2)].map((x) => encodeURIComponent(x.id)).join(",")}">Peça contato de um corretor parceiro</a> (grátis).</p>
      <p class="nota">A estimativa é a média do bairro para imóveis do tamanho informado: vem do FipeZap da cidade (${compra ? "venda" : "aluguel"}, R$/m²) ajustado pela renda da região. Ela não sabe o estado, o andar, a vaga, o lazer ou a mobília do imóvel, por isso mostramos uma faixa. <a href="/metodologia/">Como calculamos</a></p>`;
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  };
})();
