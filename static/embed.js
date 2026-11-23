/* Bairro Ideal — selo de bairro para colocar no site de um corretor (iframe). Parâmetros: c = capital (slug), r = id da região,
   cor = #hex da marca, n = nome do corretor, w = WhatsApp só com dígitos. Valida tudo; nada é enviado a servidor. */
(function () {
  "use strict";
  const q = new URLSearchParams(location.search);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Rua", lazer: "Lazer", comercio: "Comércio", seguranca: "Segurança" };
  const el = document.getElementById("sel");
  const slug = (q.get("c") || "").replace(/[^a-z-]/g, ""), id = (q.get("r") || "").replace(/[^A-Za-z0-9]/g, "");
  const marca = /^#[0-9a-fA-F]{6}$/.test(q.get("cor") || "") ? q.get("cor") : "#0b6b56";
  const nome = (q.get("n") || "").slice(0, 50), zap = (q.get("w") || "").replace(/\D/g, "");
  el.style.setProperty("--m", marca);
  const fim = (msg) => { el.innerHTML = `<p class="erro">${esc(msg)}</p>`; };
  if (!slug || !id) return fim("Selo sem bairro. Gere o código em bairroideal.com.br/selo-para-site/.");
  Promise.all([fetch(`/static/dados/${slug}.geojson`).then((r) => r.json()), fetch("/static/dados/slugs.json").then((r) => r.json()).catch(() => ({})), fetch("/static/dados/capitais.json").then((r) => r.json())])
    .then(([geo, slugs, caps]) => {
      const p = geo.features.map((x) => x.properties).find((x) => x.id === id), c = caps.find((x) => x.slug === slug);
      if (!p || !c) return fim("Bairro não encontrado.");
      const temas = Object.entries(TEMAS).filter(([k]) => p[k] != null);
      const href = `https://bairroideal.com.br/${slug}/${slugs[slug]?.[id] || ""}${slugs[slug]?.[id] ? "/" : ""}?utm_source=selo`;
      const msg = encodeURIComponent(`Olá${nome ? ", " + nome : ""}! Vi o bairro ${p.nome} no seu site e gostaria de saber mais.`);
      el.innerHTML = `
        <div class="topo"><div class="nota" style="background:${cor(p.geral ?? 0)};${p.geral >= 3.5 && p.geral < 7 ? "color:#1b1f1d" : ""}"><div>${p.geral != null ? num(p.geral, 1) : "—"}<small>de 10</small></div></div>
          <div><h1>${esc(p.nome)}, ${esc(c.nome)}</h1><p class="sub">${p.rank ? `${p.rank}º de ${geo.features.length} ${c.nivel === "bairros" ? "bairros" : "regiões"} · ` : ""}dados oficiais (IBGE, INEP, DataSUS)</p></div></div>
        <ul class="temas">${temas.map(([k, n]) => `<li><span>${n}<b>${num(p[k], 1)}</b></span><div class="barra"><i style="width:${p[k] * 10}%;background:${cor(p[k])}"></i></div></li>`).join("")}</ul>
        ${p.aluguel_m2_est ? `<p class="preco">Aluguel estimado (60 m²): <b>≈ R$ ${num(Math.round(p.aluguel_m2_est * 60 / 10) * 10)}/mês</b></p>` : ""}
        <div class="acoes">${zap.length >= 10 && zap.length <= 13 ? `<a class="zap" target="_blank" rel="noopener" href="https://wa.me/${zap}?text=${msg}">Falar no WhatsApp</a>` : ""}
          <a class="rodape" target="_blank" rel="noopener" href="${href}">Ver mais no <b>Bairro Ideal</b> →</a></div>`;
    }).catch(() => fim("Não foi possível carregar o selo."));
})();
