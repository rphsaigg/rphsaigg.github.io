/* Bairro Ideal Pro — relatório de bairro para o cliente do profissional.
   ?id=<20 hex>   relatório salvo no Worker (GET /bi/relatorio/:id); a marca só vem com a assinatura ativa
   ?l=slug:id,…   prévia montada na /conta/ (texto e marca em sessionStorage bi_previa) ou exemplo (&exemplo=1)
   Usa as notas com pesos iguais (as mesmas das páginas de bairro), não os pesos do visitante. */
(function () {
  "use strict";
  // em localhost dá para apontar para um Worker local: localStorage.bi_api = "http://localhost:8787"
  const W = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("bi_api"); } catch (_) { return null; } })()) || "https://saigg-app.montacamisa.workers.dev";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const brl = (v) => (v == null ? "—" : "R$ " + num(Math.round(v / 10) * 10));
  const km = (v) => (v == null ? "—" : v < 1 ? `${Math.round((v * 1000) / 50) * 50} m` : `${num(v, 1)} km`);
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Infraestrutura da rua", lazer: "Lazer e cultura", comercio: "Comércio e serviços", seguranca: "Segurança" };
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => (v == null ? "#c9cec9" : CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))]);
  const IND = {  // mesmo texto de mapa.js
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
  };  const EXEMPLO = { nome: "Seu nome aqui", empresa: "Sua imobiliária", creci: "CRECI 00000-F", apresentacao: "Aqui aparece a sua apresentação, com o seu WhatsApp e o seu e-mail para o cliente falar com você." };

  // números da ficha: [rótulo, valor(p), formato]
  const NUMEROS = [
    ["Moradia", [
      ["Aluguel de 60 m² (estimado)", (p) => (p.aluguel_m2_est ? p.aluguel_m2_est * 60 : null), (v) => brl(v) + "/mês"],
      ["Compra por m² (estimada)", (p) => p.venda_m2_est, brl],
      ["Renda mediana do responsável", (p) => p.renda_mediana, brl],
      ["Moradores", (p) => p.pop, (v) => num(v)],
    ]],
    ["Educação e saúde", [
      ["Escolas públicas · particulares", (p) => p.esc_publicas, (v, p) => `${num(v)} · ${num(p.esc_privadas)}`],
      ["IDEB médio (rede pública)", (p) => p.ideb, (v) => num(v, 1)],
      ["Creche ou pré-escola mais perto", (p) => p.dist_escola_infantil, km],
      ["UBS mais perto", (p) => p.dist_ubs, km],
      ["Hospital mais perto", (p) => p.dist_hospital, km],
    ]],
    ["Rua e entorno", [
      ["Esgoto ligado à rede", (p) => p.esgoto, pct],
      ["Ruas com calçada", (p) => p.rua_calcada, pct],
      ["Ruas arborizadas", (p) => p.rua_arvores, pct],
      ["Área verde por morador", (p) => p.verde_m2_por_morador, (v) => num(v, 1) + " m²"],
      ["Mercados e padarias", (p) => p.cnpj_mercado ?? p.osm_mercado, (v) => num(v)],
      ["Roubos por 100 mil hab./ano", (p) => p.seg_roubo_100mil, (v) => num(v)],
    ]],
  ];

  const cache = {};
  const capital = (slug) => (cache[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json()).then((g) => g.features.map((f) => f.properties)));

  async function carregar() {
    const q = new URLSearchParams(location.search);
    const id = q.get("id");
    if (id) {
      const r = await fetch(`${W}/bi/relatorio/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(r.status === 404 ? "Este relatório não existe ou foi excluído por quem o enviou." : "Não foi possível abrir o relatório agora. Tente de novo em instantes.");
      return await r.json();
    }
    const l = q.get("l");
    if (!l) throw new Error("Link incompleto: falta o relatório.");
    let previa = {};
    if (q.get("exemplo")) previa = { titulo: "Exemplo: três opções em Brasília", cliente: "Família Souza", marca: EXEMPLO,
      observacao: "Separei três regiões que cabem no orçamento de vocês e ficam a até 40 minutos do trabalho. Guará e Taguatinga têm o aluguel mais em conta; o Plano Piloto tem a melhor nota geral. Podemos visitar no sábado?" };
    else { try { previa = JSON.parse(sessionStorage.getItem("bi_previa") || "{}"); } catch (_) {} }
    return { titulo: previa.titulo || "Relatório de bairros", cliente: previa.cliente || null, observacao: previa.observacao || null, locais: l, marca: previa.marca || null,
             previa: q.get("exemplo") ? "Exemplo: é assim que o seu cliente vê o relatório, com a sua marca no topo." : "Pré-visualização: este relatório ainda não foi salvo." };
  }

  function cabecalho(r) {
    const m = r.marca;
    if (m && m.cor) document.querySelector(".relatorio").style.setProperty("--marca", m.cor);
    const zap = m && m.whatsapp ? m.whatsapp.replace(/\D/g, "") : "";
    const zapUrl = zap ? `https://wa.me/${zap.length <= 11 ? "55" + zap : zap}?text=${encodeURIComponent(`Olá, ${m.nome}! Vi o relatório "${r.titulo}".`)}` : "";
    $("#rel-marca").innerHTML = m
      ? `<div class="rm-nome"><span class="rm-ini" aria-hidden="true">${esc(m.nome.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase())}</span>
           <div><b>${esc(m.nome)}</b><span>${[m.empresa, m.creci].filter(Boolean).map(esc).join(" · ")}</span></div></div>
         ${m.apresentacao ? `<p class="rm-apres">${esc(m.apresentacao)}</p>` : ""}
         <div class="rm-contato">${zapUrl ? `<a class="btn" href="${zapUrl}" target="_blank" rel="noopener">Falar no WhatsApp</a>` : ""}${m.email_contato ? `<a class="btn sec" href="mailto:${esc(m.email_contato)}">E-mail</a>` : ""}${m.site ? `<a class="btn sec" href="${esc(m.site)}" target="_blank" rel="noopener">Site</a>` : ""}</div>`
      : `<p class="nota">Relatório gerado no <a href="/">Bairro Ideal</a>, com dados oficiais de todas as capitais.</p>`;
    $("#rel-titulo").textContent = r.titulo;
    document.title = `${r.titulo} · Bairro Ideal`;
    const quando = r.criado_em ? new Date(r.criado_em).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
    $("#rel-sub").textContent = [r.cliente ? `Preparado para ${r.cliente}` : "", m ? `por ${m.nome}` : "", quando].filter(Boolean).join(" · ");
    $("#rel-obs").hidden = !r.observacao;
    if (r.observacao) $("#rel-obs").textContent = r.observacao;
    $("#rel-previa").hidden = !r.previa;
    if (r.previa) $("#rel-previa").textContent = r.previa;
  }

  function ficha(x, i) {
    const { p, c, total } = x;
    const temas = Object.entries(TEMAS).filter(([k]) => p[k] != null);
    const fortes = temas.filter(([k]) => p[k] >= 7).map(([, n]) => n), fracos = temas.filter(([k]) => p[k] < 4).map(([, n]) => n);
    return `<article class="rel-ficha">
      <div class="rf-topo">
        <div><span class="rf-n">${i + 1}</span><h2>${esc(p.nome)}</h2><p class="nota">${esc(c.nome)} · ${p.rank ? `${p.rank}º de ${total} na cidade` : ""}${p.pouco ? " · região com poucos moradores" : ""}</p></div>
        <div class="b-nota" style="--cor:${cor(p.geral)}"><b>${num(p.geral, 1)}</b><span>nota geral</span></div>
      </div>
      <p class="rf-resumo">${fortes.length ? `Destaques: <b>${fortes.join(", ")}</b>.` : "Sem tema com nota alta."} ${fracos.length ? `Atenção: <b>${fracos.join(", ")}</b>.` : ""}</p>
      <ul class="b-temas">${temas.map(([k, n]) => {
        const forte = p[k + "_forte"], fraco = p[k + "_fraco"];
        return `<li><div class="t-cab"><span>${n}</span><b>${num(p[k], 1)}</b></div><div class="t-barra"><i style="width:${p[k] * 10}%;background:${cor(p[k])}"></i></div>
          <p>${forte ? `Ponto forte: ${esc(IND[forte] || forte)}.` : ""} ${fraco && fraco !== forte ? `Ponto fraco: ${esc(IND[fraco] || fraco)}.` : ""}</p></li>`;
      }).join("")}</ul>
      <div class="b-numeros">${NUMEROS.map(([g, linhas]) => `<div><h3>${g}</h3><dl>${linhas.map(([rot, get, fmt]) => { const v = get(p); return v == null ? "" : `<dt>${rot}</dt><dd>${fmt(v, p)}</dd>`; }).join("")}</dl></div>`).join("")}</div>
      <p class="rf-links"><a href="/${c.slug}/?regiao=${encodeURIComponent(p.nome)}">Ver ${esc(p.nome)} no mapa</a></p>
    </article>`;
  }

  function comparacao(xs) {
    if (xs.length < 2) return "";
    const linhas = [["Nota geral", (p) => p.geral, (v) => num(v, 1), "max"], ...Object.entries(TEMAS).map(([k, n]) => [n, (p) => p[k], (v) => num(v, 1), "max"]),
      ["Aluguel de 60 m²", (p) => (p.aluguel_m2_est ? p.aluguel_m2_est * 60 : null), brl, "min"], ["Compra por m²", (p) => p.venda_m2_est, brl, "min"],
      ["UBS mais perto", (p) => p.dist_ubs, km, "min"], ["Escola pública mais perto", (p) => p.dist_escola_publica, km, "min"]];
    const corpo = linhas.map(([rot, get, fmt, melhor]) => {
      const vals = xs.map((x) => get(x.p));
      if (vals.every((v) => v == null)) return "";
      const nums = vals.filter((v) => v != null);
      const best = nums.length > 1 ? (melhor === "max" ? Math.max(...nums) : Math.min(...nums)) : null;
      const worst = nums.length > 1 ? (melhor === "max" ? Math.min(...nums) : Math.max(...nums)) : null;
      return `<tr><th class="rot">${rot}</th>${vals.map((v) => `<td class="${v == null || best === worst ? "" : v === best ? "melhor" : v === worst ? "pior" : ""}">${v == null ? "—" : fmt(v)}</td>`).join("")}</tr>`;
    }).join("");
    const cidades = new Set(xs.map((x) => x.c.slug));
    return `<section class="rel-comp"><h2>Lado a lado</h2><div class="comp-wrap"><table class="comp"><thead><tr><th class="rot"></th>${xs.map((x, i) => `<th class="col"><b>${i + 1}. ${esc(x.p.nome)}</b><br><span class="nota">${esc(x.c.nome)}</span></th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div>
      ${cidades.size > 1 ? `<p class="nota">As notas comparam cada região com as outras da própria cidade. Entre cidades diferentes, compare pelos números.</p>` : ""}</section>`;
  }

  async function iniciar() {
    let r;
    try { r = await carregar(); } catch (e) { $("#rel-corpo").innerHTML = `<p class="aviso">${esc(e.message)}</p>`; $("#rel-titulo").textContent = "Relatório indisponível"; return; }
    cabecalho(r);
    const xs = (await Promise.all(String(r.locais).split(",").slice(0, 3).map(async (s) => {
      const [slug, id] = s.split(":"); const c = CAP[slug];
      if (!c) return null;
      const lista = await capital(slug); const p = lista.find((y) => y.id === id);
      return p ? { p, c, total: lista.length } : null;
    }))).filter(Boolean);
    if (!xs.length) { $("#rel-corpo").innerHTML = `<p class="aviso">As regiões deste relatório não foram encontradas.</p>`; return; }
    let imoveis = "";
    if (r.imoveis?.length && window.BIImoveis) {   // imóveis do corretor anexados ao relatório, com o preço contra a estimativa da região
      const cards = await Promise.all(r.imoveis.map(async (im) => {
        const p = CAP[im.capital] ? (await capital(im.capital)).find((y) => y.id === im.regiao_id) : null;
        return window.BIImoveis.card(im, { m2: p ? { al: p.aluguel_m2_est, vd: p.venda_m2_est } : null, mostrarCorretor: false });
      }));
      imoveis = `<section class="rel-imoveis"><h2>Imóveis selecionados para você</h2><div class="im-grade">${cards.join("")}</div></section>`;
    }
    $("#rel-corpo").innerHTML = imoveis + comparacao(xs) + xs.map(ficha).join("");
    window.biEvento?.("relatorio", r.previa ? "previa" : "aberto");
  }

  $("#rel-imprimir").onclick = () => window.print();
  iniciar();
})();
