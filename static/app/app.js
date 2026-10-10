// Cliente da área do assinante (compartilhado por /app/, /app/entrar/ e módulos). Sem dependências.
// A API fica em window.SAIGG_API (injetada pelo template). Sessão: token Bearer em localStorage.
(function () {
  const API = window.SAIGG_API;
  const CHAVE = "saigg_token";

  const token = () => localStorage.getItem(CHAVE);
  const sair = () => { localStorage.removeItem(CHAVE); };

  class ErroAPI extends Error { constructor(msg, status, corpo) { super(msg); this.status = status; this.corpo = corpo || {}; } }

  async function api(caminho, { metodo = "GET", corpo, publico = false } = {}) {
    const h = { "Content-Type": "application/json" };
    if (!publico && token()) h.Authorization = `Bearer ${token()}`;
    let r;
    try { r = await fetch(API + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined }); }
    catch (e) { throw new ErroAPI("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && !publico) { sair(); irParaLogin(); throw new ErroAPI(d.erro || "Entre novamente.", 401, d); }
    if (!r.ok) throw new ErroAPI(d.erro || `Erro ${r.status}`, r.status, d);
    return d;
  }

  function irParaLogin() {
    const volta = encodeURIComponent(location.pathname + location.search);
    location.href = `/app/entrar/?volta=${volta}`;
  }

  /** Garante sessão: sem token, vai para o login. Retorna o perfil (/eu). */
  async function exigirLogin() {
    if (!token()) { irParaLogin(); return new Promise(() => {}); }
    return api("/eu");
  }

  // ---------- formatação ----------
  const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v, casas = 2) => ((Number(v) || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + " %";
  const dataBR = iso => iso ? new Date(iso.length === 10 ? iso + "T12:00" : iso).toLocaleDateString("pt-BR") : "—";
  const mesBR = ym => { if (!ym) return "—"; const [a, m] = ym.split("-"); return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][+m - 1] + "/" + a; };
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const diasAte = iso => Math.ceil((new Date(iso) - Date.now()) / 864e5);

  // ---------- UI ----------
  let toastT;
  function aviso(txt, tipo = "ok", ms = 4000) {
    let t = document.getElementById("app-toast");
    if (!t) { t = document.createElement("div"); t.id = "app-toast"; document.body.appendChild(t); }
    t.className = "app-toast " + tipo; t.textContent = txt; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms);
  }

  /** Lê um <form> em objeto, convertendo vazios para undefined e checkboxes para boolean. */
  function lerForm(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === "checkbox") o[el.name] = el.checked;
      else if (el.value !== "") o[el.name] = el.value;
    }
    return o;
  }

  /** Inicia o checkout de um plano e redireciona para o Mercado Pago. */
  async function assinar(plano, meses, botao) {
    if (botao) { botao.disabled = true; botao.dataset.txt = botao.textContent; botao.textContent = "Abrindo pagamento…"; }
    try {
      const r = await api("/checkout", { metodo: "POST", corpo: { plano, meses } });
      location.href = r.url;
    } catch (e) {
      aviso(e.message, "erro", 6000);
      if (botao) { botao.disabled = false; botao.textContent = botao.dataset.txt; }
    }
  }

  window.Saigg = { api, ErroAPI, token, sair, exigirLogin, irParaLogin, assinar, aviso, lerForm,
                   brl, pct, dataBR, mesBR, hojeISO, esc, diasAte, API };
})();
