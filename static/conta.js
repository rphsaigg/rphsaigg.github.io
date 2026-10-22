/* Bairro Ideal Pro — área do profissional (/conta/): login por código no e-mail, teste grátis e pagamento,
   marca (perfil) e relatórios para clientes. Tudo no Worker saigg-app (módulo "bi_pro"); a sessão fica em localStorage bi_token.
   ?l=slug:id,…  abre o formulário de relatório com esses locais (vem do botão da página /comparar/)
   ?pagamento=ID volta do Mercado Pago */
(function () {
  "use strict";
  // em localhost dá para apontar para um Worker local: localStorage.bi_api = "http://localhost:8787"
  const W = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("bi_api"); } catch (_) { return null; } })()) || "https://saigg-app.montacamisa.workers.dev";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataBR = (iso) => new Date(iso).toLocaleDateString("pt-BR");
  const brl = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const q = new URLSearchParams(location.search);
  let token = null, eu = null, dados = null;
  try { token = localStorage.getItem("bi_token"); } catch (_) {}

  async function api(caminho, { metodo = "GET", corpo } = {}) {
    const r = await fetch(W + caminho, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && token) { sair(); }
    if (!r.ok) throw Object.assign(new Error(d.erro || "Algo deu errado. Tente de novo."), { status: r.status });
    return d;
  }
  const msg = (el, txt, erro) => { el.textContent = txt || ""; el.className = "c-msg" + (erro ? " erro" : ""); };
  function sair() { token = null; try { localStorage.removeItem("bi_token"); } catch (_) {} mostrar(); }

  // ------------------------------------------------------------ entrar
  let emailDigitado = "";
  $("#f-email").onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-entrar"); emailDigitado = $("#c-email").value.trim();
    // chave de acesso total (gerada na Central): SAIGG-XXXXX-… no mesmo campo, entra direto
    if (/^saigg[\s-]*([a-z0-9]{5}[\s-]*){4}$/i.test(emailDigitado)) {
      try {
        msg(m, "Entrando…");
        const d = await api("/auth/chave", { metodo: "POST", corpo: { chave: emailDigitado } });
        token = d.token; try { localStorage.setItem("bi_token", token); } catch (_) {}
        $("#c-email").value = ""; msg(m, ""); return mostrar();
      } catch (e) { return msg(m, e.message, true); }
    }
    try {
      msg(m, "Enviando…");
      const d = await api("/auth/codigo", { metodo: "POST", corpo: { email: emailDigitado, site: "bi" } });
      $("#f-email").hidden = true; $("#f-codigo").hidden = false; $("#c-codigo").focus();
      msg(m, d.codigo_teste ? `Código de teste: ${d.codigo_teste}` : `Enviamos um código de 6 dígitos para ${emailDigitado}. Confira também o spam.`);
    } catch (e) { msg(m, e.message, true); }
  };
  $("#f-codigo").onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-entrar");
    try {
      const d = await api("/auth/entrar", { metodo: "POST", corpo: { email: emailDigitado, codigo: $("#c-codigo").value } });
      token = d.token; try { localStorage.setItem("bi_token", token); } catch (_) {}
      msg(m, ""); mostrar();
    } catch (e) { msg(m, e.message, true); }
  };
  $("#c-voltar").onclick = () => { $("#f-codigo").hidden = true; $("#f-email").hidden = false; msg($("#m-entrar"), ""); };

  // ------------------------------------------------------------ painel
  const pro = () => eu?.assinaturas.find((a) => a.modulo === "bi_pro");
  const ativo = () => !!pro()?.ativa;

  function desenharPlano() {
    const a = pro(), planos = eu.planos.bairroideal, precos = planos.precos.bi_pro;
    const pagou = eu.pagamentos.some((p) => p.plano === "bi_pro" && p.status === "aprovado");
    let estado;
    if (a?.acesso_total) estado = `<b>Acesso total</b> pela chave da Central.`;
    else if (planos.gratis) estado = `<b>Pro liberado de graça</b> durante o lançamento: relatórios, imóveis e pedidos de contato, sem prazo e sem cartão. Se um dia passarmos a cobrar, avisaremos com 30 dias de antecedência.`;
    else if (a?.ativa) estado = `<b>Pro ativo</b> até <b>${dataBR(a.expira_em)}</b>${pagou ? "" : " (teste grátis)"}. Sem renovação automática: avisamos por e-mail antes de vencer.`;
    else if (a) estado = `Seu acesso venceu em <b>${dataBR(a.expira_em)}</b>. Os links que você já enviou continuam abrindo, mas sem a sua marca. Renove para voltar a aparecer neles.`;
    else estado = `Você ainda não tem o Pro.`;
    $("#c-estado").innerHTML = estado;
    $("#c-teste").hidden = !eu.teste_bi_disponivel || !!a;
    $("#c-teste").textContent = `Começar teste grátis de ${planos.teste_dias} dias`;
    $("#c-periodos").hidden = !!a?.acesso_total || !!planos.gratis;
    $("#c-periodos").innerHTML = Object.entries(precos).map(([meses, v]) => {
      const mensal = v / +meses;
      return `<button type="button" class="periodo" data-meses="${meses}"><b>${meses} ${+meses > 1 ? "meses" : "mês"}</b><span>${brl(v)}</span>${+meses > 1 ? `<small>${brl(Math.round(mensal * 100) / 100)}/mês</small>` : "<small>&nbsp;</small>"}</button>`;
    }).join("");
    $("#c-periodos").querySelectorAll(".periodo").forEach((b) => (b.onclick = () => pagar(+b.dataset.meses)));
  }

  async function pagar(meses) {
    const m = $("#m-plano");
    try {
      msg(m, "Abrindo o Mercado Pago…");
      window.biEvento?.("pro_checkout", String(meses));
      const d = await api("/checkout", { metodo: "POST", corpo: { plano: "bi_pro", meses } });
      location.href = d.url;
    } catch (e) { msg(m, e.message, true); }
  }
  $("#c-teste").onclick = async () => {
    const m = $("#m-plano");
    try { await api("/bi/teste", { metodo: "POST" }); window.biEvento?.("pro_teste", ""); msg(m, "Teste grátis ativo. Preencha a sua marca e crie o primeiro relatório."); await carregar(); }
    catch (e) { msg(m, e.message, true); }
  };

  async function retornoPagamento() {
    const id = q.get("pagamento");
    if (!id) return;
    const m = $("#m-plano");
    history.replaceState(null, "", location.pathname);
    for (let i = 0; i < 6; i++) {
      try {
        const d = await api(`/pagamento/${encodeURIComponent(id)}`);
        if (d.status === "aprovado") { msg(m, "Pagamento aprovado. Seu Pro está ativo."); return carregar(); }
        if (d.status === "recusado") return msg(m, "O pagamento foi recusado. Tente outro meio.", true);
        msg(m, "Aguardando a confirmação do Mercado Pago… (Pix pode levar alguns instantes)");
      } catch (e) { return msg(m, e.message, true); }
      await new Promise((r) => setTimeout(r, 4000));
    }
    msg(m, "Ainda não recebemos a confirmação. Se você já pagou, ela chega em alguns minutos: recarregue esta página.");
  }

  // ------------------------------------------------------------ marca
  const CAMPOS = ["nome", "empresa", "creci", "whatsapp", "email_contato", "site", "cor", "apresentacao"];
  const caixaCaps = $("#p-capitais");
  caixaCaps.innerHTML = window.CAPITAIS.map((c) => `<label><input type="checkbox" value="${c.slug}"> ${esc(c.nome)}</label>`).join("");
  caixaCaps.addEventListener("change", (e) => {   // no máximo 3
    if (e.target.checked && caixaCaps.querySelectorAll("input:checked").length > 3) { e.target.checked = false; alert("Escolha até 3 capitais."); }
  });
  const perfil = () => dados?.registros.perfil?.[0] || null;
  function desenharMarca() {
    const p = perfil() || {};
    for (const c of CAMPOS) { const el = $(`#p-${c}`); if (el) el.value = p[c] ?? (c === "cor" ? "#0b6b56" : ""); }
    const caps = String(p.capitais || "").split(",");
    caixaCaps.querySelectorAll("input").forEach((i) => (i.checked = caps.includes(i.value)));
    $("#p-recebe_contatos").checked = !!p.recebe_contatos;
    $("#f-marca").querySelectorAll("input,textarea,button").forEach((el) => (el.disabled = !ativo()));
  }
  $("#f-marca").onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-marca"), corpo = {};
    for (const c of CAMPOS) { const v = $(`#p-${c}`).value.trim(); if (v) corpo[c] = v; }
    const caps = [...caixaCaps.querySelectorAll("input:checked")].map((i) => i.value);
    if (caps.length) corpo.capitais = caps.join(",");
    corpo.recebe_contatos = $("#p-recebe_contatos").checked;
    if (corpo.recebe_contatos && !caps.length) return msg(m, "Escolha pelo menos uma capital para receber pedidos.", true);
    try {
      const p = perfil();
      await api(p ? `/dados/bi_pro/perfil/${p.id}` : "/dados/bi_pro/perfil", { metodo: p ? "PUT" : "POST", corpo });
      msg(m, "Marca salva. Ela aparece em todos os seus relatórios."); await carregarDados();
    } catch (e) { msg(m, e.message, true); }
  };

  // ------------------------------------------------------------ relatórios
  const linkRel = (id) => `${location.origin}/relatorio/?id=${id}`;
  const cacheCap = {};
  const regioes = (slug) => (cacheCap[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json())
    .then((g) => g.features.map((f) => ({ id: f.properties.id, nome: f.properties.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt"))));
  const nomesLocais = async (locais) => (await Promise.all(locais.split(",").map(async (s) => {
    const [slug, id] = s.split(":"); if (!CAP[slug]) return "?";
    const r = (await regioes(slug)).find((x) => x.id === id); return `${r ? r.nome : "?"} (${CAP[slug].nome})`;
  }))).join(" · ");

  async function desenharRelatorios() {
    const lista = [...(dados?.registros.relatorio || [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const el = $("#c-lista");
    if (!lista.length) { el.innerHTML = `<p class="nota">Nenhum relatório ainda.</p>`; return; }
    const nomes = await Promise.all(lista.map((r) => nomesLocais(r.locais)));
    el.innerHTML = lista.map((r, i) => `<div class="c-rel">
      <div><b>${esc(r.titulo)}</b><span>${r.cliente ? esc(r.cliente) + " · " : ""}${dataBR(r.criado_em)}</span><small>${esc(nomes[i])}</small></div>
      <div class="c-rel-acoes"><a href="/relatorio/?id=${r.id}" target="_blank" rel="noopener">Abrir</a>
        <button type="button" class="link" data-copiar="${r.id}">Copiar link</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`${r.titulo}: ${linkRel(r.id)}`)}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="link perigo" data-excluir="${r.id}"${ativo() ? "" : " disabled"}>Excluir</button></div></div>`).join("");
    el.querySelectorAll("[data-copiar]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(linkRel(b.dataset.copiar)); b.textContent = "Copiado!"; } catch (_) { prompt("Copie o link:", linkRel(b.dataset.copiar)); } }));
    el.querySelectorAll("[data-excluir]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Excluir este relatório? O link deixa de funcionar para quem o recebeu.")) return;
      try { await api(`/dados/bi_pro/relatorio/${b.dataset.excluir}`, { metodo: "DELETE" }); await carregarDados(); } catch (e) { alert(e.message); }
    }));
  }

  // formulário: até 3 locais (capital + região)
  let locais = [];
  const inicial = q.get("l");
  if (inicial) locais = inicial.split(",").map((s) => { const [slug, id] = s.split(":"); return { slug, id }; }).filter((x) => CAP[x.slug]).slice(0, 3);
  else { try { locais = JSON.parse(localStorage.getItem("om_comparar") || "[]").map((x) => ({ slug: x.slug, id: x.id })).slice(0, 3); } catch (_) {} }
  if (!locais.length) locais = [{ slug: "", id: "" }];

  async function desenharLocais() {
    const el = $("#r-locais");
    const listas = await Promise.all(locais.map((x) => (x.slug ? regioes(x.slug) : [])));
    el.innerHTML = locais.map((x, i) => `<div class="r-local"><span>${i + 1}</span>
      <select data-i="${i}" class="r-cap" aria-label="Capital do local ${i + 1}"><option value="">Capital…</option>${window.CAPITAIS.map((c) => `<option value="${c.slug}"${c.slug === x.slug ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
      <select data-i="${i}" class="r-reg" aria-label="Bairro do local ${i + 1}"${x.slug ? "" : " disabled"}><option value="">Bairro ou região…</option>${listas[i].map((p) => `<option value="${esc(p.id)}"${p.id === x.id ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>
      ${locais.length > 1 ? `<button type="button" class="link" data-tirar="${i}">remover</button>` : ""}</div>`).join("")
      + (locais.length < 3 ? `<button type="button" class="link" id="r-mais">＋ Adicionar outro local</button>` : "");
    el.querySelectorAll(".r-cap").forEach((s) => (s.onchange = () => { locais[+s.dataset.i] = { slug: s.value, id: "" }; desenharLocais(); }));
    el.querySelectorAll(".r-reg").forEach((s) => (s.onchange = () => { locais[+s.dataset.i].id = s.value; }));
    el.querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => { locais.splice(+b.dataset.tirar, 1); desenharLocais(); }));
    const mais = $("#r-mais"); if (mais) mais.onclick = () => { locais.push({ slug: locais[locais.length - 1]?.slug || "", id: "" }); desenharLocais(); };
    if (!ativo()) el.querySelectorAll("select,button").forEach((x) => (x.disabled = true));
  }
  const locaisTexto = () => locais.filter((x) => x.slug && x.id).map((x) => `${x.slug}:${x.id}`).join(",");
  const camposRel = () => ({ titulo: $("#r-titulo").value.trim(), cliente: $("#r-cliente").value.trim(), observacao: $("#r-obs").value.trim() });

  $("#r-previa").onclick = () => {
    const l = locaisTexto(); if (!l) return msg($("#m-rel"), "Escolha pelo menos um bairro.", true);
    try { sessionStorage.setItem("bi_previa", JSON.stringify({ ...camposRel(), marca: ativo() ? perfil() : null })); } catch (_) {}
    window.open(`/relatorio/?l=${encodeURIComponent(l)}`, "_blank");
  };
  $("#f-rel").onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-rel"), l = locaisTexto(), c = camposRel();
    if (!l) return msg(m, "Escolha pelo menos um bairro.", true);
    const corpo = { titulo: c.titulo || "Relatório de bairros", locais: l };
    if (c.cliente) corpo.cliente = c.cliente; if (c.observacao) corpo.observacao = c.observacao;
    const ims = [...$("#r-imoveis").querySelectorAll("input:checked")].map((i) => i.value);
    if (ims.length) corpo.imoveis = ims.join(",");
    try {
      const r = await api("/dados/bi_pro/relatorio", { metodo: "POST", corpo });
      window.biEvento?.("pro_relatorio", l);
      try { await navigator.clipboard.writeText(linkRel(r.id)); msg(m, "Relatório criado e link copiado. Cole na conversa com o cliente."); } catch (_) { msg(m, `Relatório criado: ${linkRel(r.id)}`); }
      $("#r-titulo").value = ""; $("#r-cliente").value = ""; $("#r-obs").value = "";
      await carregarDados();
    } catch (e) { msg(m, e.message, true); }
  };

  // ------------------------------------------------------------ imóveis do corretor
  const fi = $("#f-imovel");
  const meusImoveis = () => [...(dados?.registros.imovel || [])].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  let fotosForm = [];   // ids, na ordem (a primeira é a capa)
  const urlFoto = (id) => `${W}/bi/foto/${id}`;
  $("#i-capital").innerHTML = `<option value="">Escolha…</option>` + window.CAPITAIS.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");
  async function capitalImovel(slug, id) {
    $("#i-capital").value = slug || "";
    const lista = slug ? await regioes(slug) : [];
    $("#i-regiao").innerHTML = `<option value="">Escolha…</option>` + lista.map((r) => `<option value="${esc(r.id)}"${r.id === id ? " selected" : ""}>${esc(r.nome)}</option>`).join("");
    $("#i-regiao").disabled = !lista.length;
  }
  $("#i-capital").onchange = () => capitalImovel($("#i-capital").value);
  $("#i-finalidade").onchange = () => ($("#i-preco-rot").textContent = $("#i-finalidade").value === "Venda" ? "Preço de venda (R$)" : "Aluguel por mês (R$)");
  function desenharFotos() {
    $("#i-fotos").innerHTML = fotosForm.map((id, i) => `<figure><img src="${urlFoto(id)}" alt="">${i === 0 ? "<figcaption>capa</figcaption>" : `<button type="button" class="link" data-capa="${i}">tornar capa</button>`}<button type="button" class="i-tirar" data-tirar="${i}" aria-label="Tirar foto">×</button></figure>`).join("");
    $("#i-fotos").querySelectorAll("[data-capa]").forEach((b) => (b.onclick = () => { const [x] = fotosForm.splice(+b.dataset.capa, 1); fotosForm.unshift(x); desenharFotos(); }));
    $("#i-fotos").querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => { fotosForm.splice(+b.dataset.tirar, 1); desenharFotos(); }));   // o cron apaga a foto que ficar sem imóvel
    $("#i-arquivos").hidden = fotosForm.length >= 8;
  }
  // reduz no navegador: lado maior até 1600 px, JPEG 0,82; se passar de ~550 KB, tenta de novo menor
  async function reduzir(arquivo) {
    const img = await createImageBitmap(arquivo);
    for (const [lado, q] of [[1600, 0.82], [1280, 0.75], [1024, 0.7]]) {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const cv = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q));
      if (blob.size <= 550 * 1024) return blob;
    }
    throw new Error("Não consegui reduzir esta foto o bastante. Tente outra.");
  }
  $("#i-arquivos").onchange = async () => {
    const m = $("#m-imovel"), arqs = [...$("#i-arquivos").files].slice(0, 8 - fotosForm.length);
    for (const [i, a] of arqs.entries()) {
      try {
        msg(m, `Enviando foto ${i + 1} de ${arqs.length}…`);
        const blob = await reduzir(a);
        const r = await fetch(`${W}/bi/foto`, { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}` }, body: blob });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.erro || "Não foi possível enviar a foto.");
        fotosForm.push(d.id); desenharFotos();
      } catch (e) { msg(m, e.message, true); $("#i-arquivos").value = ""; return; }
    }
    msg(m, arqs.length ? "Fotos enviadas. Salve o imóvel para publicar." : "");
    $("#i-arquivos").value = "";
  };
  const CAMPOS_IM = ["titulo", "finalidade", "tipo", "preco", "area", "condominio", "iptu", "quartos", "banheiros", "vagas", "codigo", "descricao"];
  async function abrirImovel(im) {
    fi.hidden = false; fi.reset(); msg($("#m-imovel"), "");
    $("#i-id").value = im?.id || "";
    for (const c of CAMPOS_IM) if (im && im[c] != null) $(`#i-${c}`).value = im[c];
    for (const c of ["mobiliado", "aceita_pet"]) $(`#i-${c}`).checked = !!im?.[c];
    $("#i-ativo").checked = im ? !!im.ativo : true;
    $("#i-finalidade").onchange();
    fotosForm = String(im?.fotos || "").split(",").filter(Boolean);
    desenharFotos();
    await capitalImovel(im?.capital || perfil()?.capitais?.split(",")[0] || "", im?.regiao_id);
    fi.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#im-novo").onclick = () => abrirImovel(null);
  $("#i-cancelar").onclick = () => { fi.hidden = true; };
  fi.onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-imovel"), id = $("#i-id").value, sel = $("#i-regiao");
    const corpo = { capital: $("#i-capital").value, regiao_id: sel.value, regiao_nome: sel.selectedOptions[0]?.textContent || "",
                    mobiliado: $("#i-mobiliado").checked, aceita_pet: $("#i-aceita_pet").checked, ativo: $("#i-ativo").checked };
    for (const c of CAMPOS_IM) { const v = $(`#i-${c}`).value.trim(); if (v) corpo[c] = ["titulo", "finalidade", "tipo", "codigo", "descricao"].includes(c) ? v : v.replace(/\./g, "").replace(",", "."); }
    if (fotosForm.length) corpo.fotos = fotosForm.join(",");
    if (!corpo.capital || !corpo.regiao_id) return msg(m, "Escolha a capital e o bairro do imóvel.", true);
    try {
      await api(id ? `/dados/bi_pro/imovel/${id}` : "/dados/bi_pro/imovel", { metodo: id ? "PUT" : "POST", corpo });
      fi.hidden = true; msg(m, corpo.ativo ? "Imóvel salvo e publicado na página do bairro." : "Imóvel salvo (inativo: não aparece no site).");
      await carregarDados();
    } catch (e) { msg(m, e.message, true); }
  };
  function desenharImoveis() {
    const el = $("#c-imoveis"), lista = meusImoveis();
    $("#im-novo").disabled = !ativo();
    el.innerHTML = lista.length ? lista.map((im) => `<div class="c-rel">
      <div><b>${esc(im.titulo)}</b><span>${esc(im.finalidade)} · ${window.BIImoveis.brl(im.preco)}${im.finalidade === "Aluguel" ? "/mês" : ""} · ${esc(im.regiao_nome)}${CAP[im.capital] ? ` (${esc(CAP[im.capital].nome)})` : ""}</span>
        <small>${im.ativo ? "ativo" : "inativo"} · ${((n) => `${n} ${n === 1 ? "foto" : "fotos"}`)(String(im.fotos || "").split(",").filter(Boolean).length)}</small></div>
      <div class="c-rel-acoes">${im.ativo ? `<a href="/imovel/?id=${im.id}" target="_blank" rel="noopener">Ver</a>` : ""}
        <button type="button" class="link" data-editar="${im.id}"${ativo() ? "" : " disabled"}>Editar</button>
        <button type="button" class="link perigo" data-excluir-im="${im.id}"${ativo() ? "" : " disabled"}>Excluir</button></div></div>`).join("") : `<p class="nota">Nenhum imóvel cadastrado.</p>`;
    el.querySelectorAll("[data-editar]").forEach((b) => (b.onclick = () => abrirImovel(lista.find((x) => x.id === b.dataset.editar))));
    el.querySelectorAll("[data-excluir-im]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Excluir este imóvel? Ele sai do site e dos relatórios.")) return;
      try { await api(`/dados/bi_pro/imovel/${b.dataset.excluirIm}`, { metodo: "DELETE" }); await carregarDados(); } catch (e) { alert(e.message); }
    }));
    // relatório: escolher imóveis ativos (até 6)
    const ativos = lista.filter((im) => im.ativo);
    $("#r-imoveis-caixa").hidden = !ativos.length;
    const marcados = new Set([...$("#r-imoveis").querySelectorAll("input:checked")].map((i) => i.value));
    $("#r-imoveis").innerHTML = ativos.map((im) => `<label><input type="checkbox" value="${im.id}"${marcados.has(im.id) ? " checked" : ""}> ${esc(im.titulo)} · ${esc(im.regiao_nome)}</label>`).join("");
  }
  $("#r-imoveis").addEventListener("change", (e) => {
    if (e.target.checked && $("#r-imoveis").querySelectorAll("input:checked").length > 6) { e.target.checked = false; alert("Escolha até 6 imóveis."); }
  });

  // ------------------------------------------------------------ conta
  $("#c-sair").onclick = async () => { try { await api("/auth/sair", { metodo: "POST" }); } catch (_) {} sair(); };
  $("#c-excluir").onclick = async () => {
    const e = prompt(`Isto apaga a conta, a marca e todos os relatórios (os links param de funcionar). Para confirmar, digite o seu e-mail:`);
    if (!e) return;
    try { await api("/eu", { metodo: "DELETE", corpo: { confirmar: e } }); alert("Conta excluída."); sair(); } catch (er) { alert(er.message); }
  };

  // pedidos de contato entregues a este corretor
  const QUANDO = { ja: "o quanto antes", "3meses": "nos próximos 3 meses", pesquisando: "ainda pesquisando" };
  async function desenharPedidos() {
    const el = $("#c-pedidos");
    if (!ativo()) { el.innerHTML = `<p class="nota">Disponível com o Pro ativo.</p>`; return; }
    let d;
    try { d = await api("/bi/contatos"); } catch (e) { el.innerHTML = `<p class="c-msg erro">${esc(e.message)}</p>`; return; }
    const aviso = !d.recebe_contatos ? `<p class="aviso">Para receber pedidos, marque as capitais em que atende e "Quero receber pedidos" em <a href="#f-marca">Sua marca</a>.</p>` : "";
    if (!d.pedidos.length) { el.innerHTML = aviso + `<p class="nota">Nenhum pedido no momento${d.recebe_contatos ? `. Quando alguém pedir contato em ${d.capitais.map((s) => esc(CAP[s]?.nome || s)).join(", ")}, ele aparece aqui e você recebe um e-mail` : ""}.</p>`; return; }
    el.innerHTML = aviso + d.pedidos.map((p) => {
      const zap = p.whatsapp.replace(/\D/g, ""), meu = perfil()?.nome || "";
      const texto = `Olá, ${p.nome}! Sou ${meu}${perfil()?.creci ? ` (${perfil().creci})` : ""}. Recebi pelo Bairro Ideal o seu pedido para ${p.objetivo} em ${p.capital_nome}. Posso ajudar?`;
      return `<div class="c-ped"><b>${esc(p.nome)}</b>${p.novo ? '<span class="novo">novo</span>' : ""}
        <p>Quer <b>${p.objetivo}</b> em ${esc(p.capital_nome)}${p.regioes.length ? ` · ${p.regioes.map((r) => esc(r.nome)).join(", ")}` : ""}${p.valor_max ? ` · até ${brl(p.valor_max)}${p.objetivo === "alugar" ? "/mês" : ""}` : ""}${p.quando ? ` · ${QUANDO[p.quando] || ""}` : ""}</p>
        ${p.mensagem ? `<p>“${esc(p.mensagem)}”</p>` : ""}
        <p><a class="btn" href="https://wa.me/${zap.length <= 11 ? "55" + zap : zap}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">WhatsApp ${esc(p.whatsapp)}</a>${p.email ? ` <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}</p>
        <p class="nota">Recebido em ${dataBR(p.entregue_em)} · some em ${dataBR(p.expira_em)}</p></div>`;
    }).join("");
  }

  async function carregarDados() {
    dados = await api("/dados/bi_pro");
    desenharMarca(); desenharImoveis(); await desenharRelatorios(); await desenharPedidos();
    $("#f-rel").querySelectorAll("input,textarea,select,button").forEach((el) => (el.disabled = !ativo()));
    $("#r-bloqueio").hidden = ativo();
  }
  async function carregar() {
    eu = await api("/eu");
    $("#c-quem").textContent = eu.usuario.email;
    desenharPlano();
    await carregarDados();
  }
  async function mostrar() {
    $("#c-login").hidden = !!token; $("#c-painel").hidden = !token;
    if (!token) return;
    try { await carregar(); await desenharLocais(); await retornoPagamento(); }
    catch (e) { if (e.status !== 401) msg($("#m-plano"), e.message, true); }
  }
  mostrar();
})();
