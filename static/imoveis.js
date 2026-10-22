/* Bairro Ideal — imóveis dos corretores Pro (Worker: src/imoveis.js).
   window.BIImoveis: faixa de preço (a mesma do "Esse aluguel vale?"), veredito de um imóvel contra a estimativa da região e cartão.
   Sozinho, também monta:
   - a seção "Imóveis de corretores parceiros" da página de bairro (#imoveis-parceiros, com data-capital/regiao/al/vd/nome)
   - a página do imóvel (/imovel/?id=, #im-pagina) */
(function () {
  "use strict";
  const W = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("bi_api"); } catch (_) { return null; } })()) || "https://saigg-app.montacamisa.workers.dev";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v) => "R$ " + num(Math.round(v));

  // a estimativa é a média da região: a resposta é sempre uma faixa
  function faixa(r) {
    if (r < 0.75) return ["bem-abaixo", "Bem abaixo da estimativa da região", "Pode ser uma boa oportunidade, ou o imóvel tem algo que puxa o preço para baixo (tamanho real menor, estado de conservação, sem vaga, andar ou rua). Vale visitar com atenção."];
    if (r < 0.9) return ["abaixo", "Um pouco abaixo da estimativa da região", "Preço atraente para o bairro. Confira o estado do imóvel e o que está incluído."];
    if (r <= 1.15) return ["dentro", "Dentro do esperado para a região", "O preço está na faixa que estimamos para imóveis desse tamanho no bairro."];
    if (r <= 1.4) return ["acima", "Acima da estimativa da região", "Faz sentido se o imóvel for novo, reformado, mobiliado ou tiver lazer e vagas. Se não tiver, dá para negociar ou procurar nos bairros abaixo."];
    return ["bem-acima", "Bem acima da estimativa da região", "Só se justifica com algo especial (prédio novo com lazer completo, cobertura, mobília de alto padrão). Compare com outros anúncios do bairro antes de fechar."];
  }
  /** m2 = {al: aluguel R$/m², vd: venda R$/m²} da região. Terreno e comercial não entram (a estimativa é residencial). */
  function veredito(im, m2) {
    if (!m2 || ["Terreno", "Sala comercial", "Loja"].includes(im.tipo)) return null;
    const base = im.finalidade === "Venda" ? m2.vd : m2.al;
    if (!base || !im.area) return null;
    const est = base * im.area, [cls, titulo] = faixa(im.preco / est);
    return { cls, titulo, est };
  }
  const zapUrl = (c, im) => {
    if (!c?.whatsapp) return null;
    const d = c.whatsapp.replace(/\D/g, "");
    return `https://wa.me/${d.length <= 11 ? "55" + d : d}?text=${encodeURIComponent(`Olá, ${c.nome}! Vi no Bairro Ideal o imóvel "${im.titulo}"${im.codigo ? ` (código ${im.codigo})` : ""}: ${location.origin}/imovel/?id=${im.id}`)}`;
  };
  const resumo = (im) => [im.area && `${num(im.area)} m²`, im.quartos != null && `${im.quartos} ${im.quartos === 1 ? "quarto" : "quartos"}`, im.vagas != null && `${im.vagas} ${im.vagas === 1 ? "vaga" : "vagas"}`].filter(Boolean).join(" · ");

  function card(im, { m2, mostrarCorretor = true } = {}) {
    const v = veredito(im, m2);
    return `<a class="im-card" href="/imovel/?id=${im.id}">
      <div class="im-foto">${im.fotos[0] ? `<img src="${esc(im.fotos[0])}" alt="" loading="lazy">` : `<span>sem foto</span>`}<em>${esc(im.finalidade)}</em></div>
      <div class="im-info"><b>${brl(im.preco)}${im.finalidade === "Aluguel" ? "/mês" : ""}</b>
        <span class="im-tit">${esc(im.titulo)}</span><span class="nota">${esc(im.tipo)} · ${resumo(im)}</span>
        ${v ? `<span class="im-v ${v.cls}">${v.titulo.replace(" da estimativa da região", "").replace(" para a região", "")}</span>` : ""}
        ${mostrarCorretor && im.corretor ? `<span class="nota">${esc(im.corretor.nome)}${im.corretor.creci ? ` · ${esc(im.corretor.creci)}` : ""}</span>` : ""}</div></a>`;
  }
  window.BIImoveis = { W, faixa, veredito, card, brl };

  // ------------------------------------------------------------ seção na página de bairro
  const sec = document.getElementById("imoveis-parceiros");
  if (sec) {
    const d = sec.dataset, m2 = { al: +d.al || null, vd: +d.vd || null };
    fetch(`${W}/bi/imoveis?capital=${encodeURIComponent(d.capital)}&regiao=${encodeURIComponent(d.regiao)}`).then((r) => r.json()).then((res) => {
      const lista = res.imoveis || [];
      if (!lista.length) return;
      sec.querySelector(".im-grade").innerHTML = lista.slice(0, 12).map((im) => card(im, { m2 })).join("");
      sec.hidden = false;
    }).catch(() => {});
  }

  // ------------------------------------------------------------ página do imóvel
  const pag = document.getElementById("im-pagina");
  if (pag) {
    const id = new URLSearchParams(location.search).get("id") || "";
    (async () => {
      let im;
      try {
        const r = await fetch(`${W}/bi/imovel/${encodeURIComponent(id)}`);
        im = await r.json();
        if (!r.ok) throw new Error(im.erro || "Imóvel não encontrado.");
      } catch (e) { pag.innerHTML = `<p class="aviso">${esc(e.message)} <a href="/">Voltar ao Bairro Ideal</a></p>`; return; }
      document.title = `${im.titulo} · ${im.regiao_nome} · Bairro Ideal`;
      let p = null, cap = null, slugBairro = null;
      try {
        const [g, slugs] = await Promise.all([fetch(`/static/dados/${im.capital}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json()), fetch(`/static/dados/slugs.json?v=${window.DADOS_V || ""}`).then((r) => r.json())]);
        p = g.features.map((f) => f.properties).find((x) => x.id === im.regiao_id) || null;
        slugBairro = slugs[im.capital]?.[im.regiao_id] || null;
      } catch (_) {}
      cap = (window.CAPITAIS || []).find((c) => c.slug === im.capital);
      const v = veredito(im, p ? { al: p.aluguel_m2_est, vd: p.venda_m2_est } : null);
      const zap = zapUrl(im.corretor, im);
      const linkBairro = slugBairro ? `/${im.capital}/${slugBairro}/` : `/${im.capital}/?regiao=${encodeURIComponent(im.regiao_nome)}`;
      const extras = [im.mobiliado && "mobiliado", im.aceita_pet && "aceita pet"].filter(Boolean);
      const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Rua", lazer: "Lazer", comercio: "Comércio", seguranca: "Segurança" };
      pag.innerHTML = `
        <p class="migalhas"><a href="/">Início</a> › ${cap ? `<a href="/${cap.slug}/">${esc(cap.nome)}</a> › ` : ""}<a href="${linkBairro}">${esc(im.regiao_nome)}</a> › imóvel</p>
        <div class="im-galeria">${im.fotos.length ? im.fotos.map((f, i) => `<img src="${esc(f)}" alt="Foto ${i + 1} do imóvel"${i ? ' loading="lazy"' : ""}>`).join("") : `<div class="im-sem">Sem fotos</div>`}</div>
        <div class="im-topo">
          <div>
            <span class="selo">${esc(im.finalidade)} · ${esc(im.tipo)}</span>
            <h1>${esc(im.titulo)}</h1>
            <p class="lead">${esc(im.regiao_nome)}${cap ? `, ${esc(cap.nome)}` : ""} · ${resumo(im)}${im.banheiros != null ? ` · ${im.banheiros} ${im.banheiros === 1 ? "banheiro" : "banheiros"}` : ""}${extras.length ? " · " + extras.join(" · ") : ""}</p>
            <p class="im-preco">${brl(im.preco)}${im.finalidade === "Aluguel" ? "<small>/mês</small>" : ""}</p>
            <p class="nota">${[im.condominio ? `Condomínio ${brl(im.condominio)}` : "", im.iptu ? `IPTU ${brl(im.iptu)}` : "", im.codigo ? `Código ${esc(im.codigo)}` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <aside class="im-corretor">
            <b>${esc(im.corretor.nome)}</b><span>${[im.corretor.empresa, im.corretor.creci].filter(Boolean).map(esc).join(" · ")}</span>
            ${zap ? `<a class="btn" href="${zap}" target="_blank" rel="noopener">Falar no WhatsApp</a>` : ""}
            <small>Anúncio do corretor parceiro. Confira o CRECI e visite antes de pagar qualquer valor.</small>
          </aside>
        </div>
        ${v ? `<div class="vale-veredito ${v.cls}"><span>Estimativa para ${num(im.area)} m² em ${esc(im.regiao_nome)}: <b>${brl(Math.round(v.est * 0.9 / 10) * 10)} a ${brl(Math.round(v.est * 1.15 / 10) * 10)}</b>${im.finalidade === "Aluguel" ? "/mês" : ""}</span><h2>${v.titulo}</h2>
          <p>Comparação automática com a média da região (FipeZap ajustado pela renda do bairro). Ela não considera estado, andar, vaga, lazer ou mobília. <a href="/esse-aluguel-vale/?capital=${im.capital}&regiao=${im.regiao_id}">Como funciona</a></p></div>` : ""}
        ${im.descricao ? `<section><h2>Descrição</h2><p class="im-desc">${esc(im.descricao)}</p></section>` : ""}
        ${p ? `<section class="vale-bairro"><h3>Como é morar em ${esc(p.nome)}</h3><p>Nota geral <b>${p.geral != null ? num(p.geral, 1) : "—"}</b>${p.rank ? ` · ${p.rank}º em ${cap ? esc(cap.nome) : "sua cidade"}` : ""}</p>
          <p class="vale-temas">${Object.entries(TEMAS).filter(([k]) => p[k] != null).map(([k, n]) => `<span>${n} <b>${num(p[k], 1)}</b></span>`).join("")}</p>
          <p><a href="${linkBairro}">Tudo sobre ${esc(p.nome)}</a> · <a href="/${im.capital}/?morar=1">Onde eu poderia morar melhor?</a></p></section>` : ""}
        <p class="nota">Encontrou algo errado neste anúncio? <a href="/contato/?assunto=denuncia&ref=${encodeURIComponent("anúncio " + im.id)}">Avise a gente</a>.</p>`;
    })();
  }
})();
