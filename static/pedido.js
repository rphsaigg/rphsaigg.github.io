/* Bairro Ideal — pedido de contato com corretor (opt-in) e gestão do pedido. Worker: src/pedidos.js
   /falar-com-corretor/?capital=slug&regioes=id,id   formulário (orçamento e objetivo vêm do "morar melhor" por sessionStorage bi_pedido,
                                                     para não irem na URL)
   /meu-pedido/?id=&t=                               a pessoa vê a quem foi enviado e cancela (apaga os dados) */
(function () {
  "use strict";
  const W = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("bi_api"); } catch (_) { return null; } })()) || "https://saigg-app.montacamisa.workers.dev";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
  const dataBR = (iso) => new Date(iso).toLocaleDateString("pt-BR");
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const q = new URLSearchParams(location.search);
  const QUANDO = { ja: "o quanto antes", "3meses": "nos próximos 3 meses", pesquisando: "ainda pesquisando" };

  async function api(caminho, opt = {}) {
    const r = await fetch(W + caminho, { method: opt.metodo || "GET", headers: { "Content-Type": "application/json" }, body: opt.corpo ? JSON.stringify(opt.corpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || "Algo deu errado. Tente de novo.");
    return d;
  }

  // ------------------------------------------------------------ formulário
  const form = $("#f-pedido");
  if (form) {
    const cache = {};
    const regioesDe = (slug) => (cache[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${window.DADOS_V || ""}`).then((r) => r.json())
      .then((g) => g.features.map((f) => ({ id: f.properties.id, nome: f.properties.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt"))));
    let escolhidas = [];
    const selCap = form.capital, selReg = $("#pd-add");
    selCap.innerHTML = `<option value="">Escolha…</option>` + window.CAPITAIS.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");

    async function trocarCapital(slug, ids = []) {
      selCap.value = CAP[slug] ? slug : "";
      $("#pd-cap-nome").textContent = CAP[slug] ? CAP[slug].nome : "a sua capital";
      const lista = CAP[slug] ? await regioesDe(slug) : [];
      escolhidas = ids.map((id) => lista.find((r) => r.id === id)).filter(Boolean).slice(0, 3);
      selReg.innerHTML = `<option value="">＋ Adicionar bairro (opcional)</option>` + lista.map((r) => `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join("");
      selReg.disabled = !lista.length;
      desenharRegioes();
    }
    function desenharRegioes() {
      $("#pd-regioes").innerHTML = escolhidas.map((r, i) => `<span class="pd-chip">${esc(r.nome)} <button type="button" data-i="${i}" aria-label="Tirar ${esc(r.nome)}">×</button></span>`).join("");
      $("#pd-regioes").querySelectorAll("button").forEach((b) => (b.onclick = () => { escolhidas.splice(+b.dataset.i, 1); desenharRegioes(); }));
      selReg.hidden = escolhidas.length >= 3;
    }
    selCap.onchange = () => trocarCapital(selCap.value);
    selReg.onchange = async () => {
      const r = (await regioesDe(selCap.value)).find((x) => x.id === selReg.value);
      if (r && !escolhidas.some((x) => x.id === r.id)) escolhidas.push(r);
      selReg.value = ""; desenharRegioes();
    };
    const rotuloValor = () => ($("#pd-valor-rot").textContent = form.objetivo.value === "comprar" ? "Até quanto quer pagar no imóvel (R$)" : "Até quanto quer pagar de aluguel por mês (R$)");
    form.addEventListener("change", (e) => { if (e.target.name === "objetivo") rotuloValor(); });

    // vindo do "morar melhor": objetivo e orçamento por sessionStorage (não vão na URL)
    try {
      const pre = JSON.parse(sessionStorage.getItem("bi_pedido") || "{}");
      if (["alugar", "comprar"].includes(pre.objetivo)) form.objetivo.value = pre.objetivo;
      if (pre.valor_max) form.valor_max.value = Math.round(pre.valor_max / 50) * 50;
    } catch (_) {}
    rotuloValor();
    trocarCapital(q.get("capital") || "", (q.get("regioes") || "").split(",").filter(Boolean));

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = $("#m-pedido");
      const corpo = {
        capital: selCap.value, capital_nome: CAP[selCap.value]?.nome, objetivo: form.objetivo.value, quando: form.quando.value || null,
        valor_max: form.valor_max.value || null, nome: form.nome.value, whatsapp: form.whatsapp.value, email: form.email.value,
        mensagem: form.mensagem.value, consentimento: form.consentimento.checked, site_web: form.site_web.value, regioes: escolhidas,
      };
      try {
        m.textContent = "Enviando…"; m.className = "c-msg";
        const d = await api("/bi/pedido", { metodo: "POST", corpo });
        window.biEvento?.("pedido", `${corpo.capital}:${corpo.objetivo}:${d.entregue_a}`);
        try { sessionStorage.removeItem("bi_pedido"); } catch (_) {}
        form.hidden = true;
        const nomeCap = esc(CAP[corpo.capital].nome);
        $("#pd-ok").hidden = false;
        $("#pd-ok-texto").innerHTML = d.entregue_a
          ? (d.entregue_a > 1 ? `Seu pedido foi enviado a <b>${d.entregue_a} corretores parceiros</b> que atendem ${nomeCap}. Eles devem chamar você no WhatsApp.`
                              : `Seu pedido foi enviado a <b>1 corretor parceiro</b> que atende ${nomeCap}. Ele deve chamar você no WhatsApp.`)
          : `Ainda não há corretor parceiro disponível em ${nomeCap}. Seu pedido fica guardado e vai para os primeiros que entrarem, até ${dataBR(d.expira_em)}. Depois disso, é apagado.`;
        $("#pd-link").href = d.link; $("#pd-link-txt").value = d.link;
        $("#pd-ok-email").hidden = !corpo.email;
        $("#pd-ok").scrollIntoView({ behavior: "smooth" });
      } catch (e) { m.textContent = e.message; m.className = "c-msg erro"; }
    };
    $("#pd-copiar").onclick = async () => { try { await navigator.clipboard.writeText($("#pd-link-txt").value); $("#pd-copiar").textContent = "Copiado!"; } catch (_) { $("#pd-link-txt").select(); } };
  }

  // ------------------------------------------------------------ gestão do pedido
  const gestao = $("#pd-gestao");
  if (gestao) {
    const id = q.get("id"), t = q.get("t");
    const caminho = `/bi/pedido/${encodeURIComponent(id || "")}?t=${encodeURIComponent(t || "")}`;
    (async () => {
      try {
        const p = await api(caminho);
        window.biEvento?.("pedido_abrir", "");
        $("#pd-g-resumo").innerHTML = `<dl class="pd-dl">
          <dt>Quer</dt><dd>${p.objetivo === "comprar" ? "comprar" : "alugar"} em ${esc(p.capital_nome)}${p.regioes.length ? ` (${p.regioes.map((r) => esc(r.nome)).join(", ")})` : ""}</dd>
          ${p.valor_max ? `<dt>Até</dt><dd>${brl(p.valor_max)}${p.objetivo === "alugar" ? "/mês" : ""}</dd>` : ""}
          ${p.quando ? `<dt>Quando</dt><dd>${QUANDO[p.quando] || ""}</dd>` : ""}
          <dt>Contato</dt><dd>${esc(p.nome)} · ${esc(p.whatsapp)}${p.email ? ` · ${esc(p.email)}` : ""}</dd>
          ${p.mensagem ? `<dt>Recado</dt><dd>${esc(p.mensagem)}</dd>` : ""}
          <dt>Enviado em</dt><dd>${dataBR(p.criado_em)} · apagado sozinho em ${dataBR(p.expira_em)}</dd></dl>`;
        $("#pd-g-corretores").innerHTML = p.corretores.length
          ? `<ul class="pd-corretores">${p.corretores.map((c) => `<li><b>${esc(c.nome)}</b>${c.empresa ? ` · ${esc(c.empresa)}` : ""}${c.creci ? ` · ${esc(c.creci)}` : ""}<span>${c.visto ? "já viu o pedido" : "ainda não viu"}</span></li>`).join("")}</ul>`
          : `<p>Ainda não há corretor parceiro disponível em ${esc(p.capital_nome)}. O pedido vai para os primeiros que entrarem, até ${dataBR(p.expira_em)}.</p>`;
        gestao.hidden = false;
      } catch (e) { $("#pd-g-erro").hidden = false; $("#pd-g-erro").textContent = e.message; }
    })();
    $("#pd-cancelar").onclick = async () => {
      if (!confirm("Cancelar o pedido e apagar seus dados? Os corretores deixam de ver o pedido.")) return;
      try { await api(caminho, { metodo: "DELETE" }); gestao.hidden = true; $("#pd-g-erro").hidden = false; $("#pd-g-erro").className = "aviso"; $("#pd-g-erro").textContent = "Pronto: o pedido foi cancelado e seus dados foram apagados. Se algum corretor já salvou o seu contato, você pode pedir diretamente a ele que o apague."; }
      catch (e) { alert(e.message); }
    };
  }
})();
