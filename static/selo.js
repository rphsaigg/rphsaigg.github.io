/* Bairro Ideal — gerador do código do selo de bairro (iframe para /embed/). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f = $("#f-selo"), V = window.DADOS_V || "";
  const cache = {};
  const regioes = (slug) => (cache[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${V}`).then((r) => r.json()).then((g) => g.features.map((x) => x.properties)));
  f.capital.innerHTML = `<option value="">Escolha…</option>` + window.CAPITAIS.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");
  f.capital.onchange = async () => {
    const lista = f.capital.value ? [...(await regioes(f.capital.value))].filter((p) => p.geral != null).sort((a, b) => a.nome.localeCompare(b.nome, "pt")) : [];
    f.regiao.innerHTML = `<option value="">${lista.length ? "Escolha o bairro…" : "Escolha a capital primeiro"}</option>` + lista.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
    f.regiao.disabled = !lista.length; atualizar();
  };
  function atualizar() {
    const saida = $("#selo-saida");
    if (!f.capital.value || !f.regiao.value) { saida.hidden = true; return; }
    const zap = f.zap.value.replace(/\D/g, ""), z = zap.length >= 10 && zap.length <= 11 ? "55" + zap : zap;
    const p = new URLSearchParams({ c: f.capital.value, r: f.regiao.value, cor: f.cor.value });
    if (f.nome.value.trim()) p.set("n", f.nome.value.trim());
    if (z.length >= 12) p.set("w", z);
    const src = `https://bairroideal.com.br/embed/?${p}`;
    saida.hidden = false;
    $("#selo-previa").src = location.hostname === "bairroideal.com.br" ? src : `/embed/?${p}`;
    $("#selo-codigo").value = `<iframe src="${src}" title="Nota do bairro · Bairro Ideal" style="width:100%;max-width:540px;height:300px;border:0" loading="lazy"></iframe>`;
    window.biEvento?.("selo", f.capital.value);
  }
  f.addEventListener("change", atualizar);
  f.addEventListener("input", (e) => { if (e.target.name === "nome" || e.target.name === "zap") { clearTimeout(f._t); f._t = setTimeout(atualizar, 500); } });
  $("#selo-copiar").onclick = async (e) => {
    const t = $("#selo-codigo"); t.select();
    try { await navigator.clipboard.writeText(t.value); } catch (_) { document.execCommand("copy"); }
    e.target.textContent = "Copiado!"; setTimeout(() => (e.target.textContent = "Copiar código"), 2000);
  };
})();
