/* Bairro Ideal — formulário de contato e suporte (/contato/). Worker: POST /contato (src/site.js), com site "bi".
   ?assunto=<valor do select>&ref=<texto curto> preenche o assunto e uma referência (ex.: id do anúncio denunciado). */
(function () {
  "use strict";
  const W = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem("bi_api"); } catch (_) { return null; } })()) || "https://saigg-app.montacamisa.workers.dev";
  const $ = (s) => document.querySelector(s);
  const f = $("#f-contato"), q = new URLSearchParams(location.search);
  const DICAS = {
    dado: "Diga a capital, o bairro e qual número parece errado. Se souber a fonte certa, mande o link.",
    problema: "Diga a página (ou cole o endereço), o aparelho e o navegador, e o que aconteceu.",
    pro: "Se for sobre a sua conta, use o mesmo e-mail com que entra na Minha área.",
    denuncia: "Diga o que está errado no anúncio (preço, fotos, imóvel que não existe…). O código do anúncio já vai junto.",
    pedido: "Use o mesmo e-mail que você informou no pedido, se informou.",
    privacidade: "Para cancelar um pedido de contato, use o link do pedido; para apagar a conta do Pro, use a Minha área. Aqui cuidamos de qualquer outro pedido sobre os seus dados.",
    empresas: "Conte qual capital, que tipo de dado (por bairro, por setor, planilha ou estudo) e para que vai usar.",
  };
  const dica = () => { const d = DICAS[f.assunto.value]; $("#ct-dica").hidden = !d; $("#ct-dica").textContent = d || ""; };
  if (q.get("assunto") && [...f.assunto.options].some((o) => o.value === q.get("assunto"))) f.assunto.value = q.get("assunto");
  const ref = (q.get("ref") || "").replace(/[^\w .:/-]/g, "").slice(0, 120);
  f.assunto.onchange = dica; dica();
  try { const e = localStorage.getItem("bi_contato_email"); if (e) f.email.value = e; } catch (_) {}

  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $("#m-contato"), rot = f.assunto.selectedOptions[0].textContent;
    const mensagem = f.mensagem.value.trim() + (ref ? `\n\n[referência: ${ref}]` : "");
    if (f.nome.value.trim().length < 2) { m.textContent = "Informe o seu nome."; m.className = "c-msg erro"; return; }
    try {
      m.textContent = "Enviando…"; m.className = "c-msg";
      const r = await fetch(`${W}/contato`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: f.nome.value, email: f.email.value, assunto: rot, mensagem, pagina: document.referrer ? new URL(document.referrer).pathname : "/contato/", site: "bi", site_web: f.site_web.value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Não foi possível enviar agora. Tente de novo em instantes.");
      try { localStorage.setItem("bi_contato_email", f.email.value.trim()); } catch (_) {}
      window.biEvento?.("contato", f.assunto.value);
      f.hidden = true; $("#ct-ok").hidden = false;
      $("#ct-ok-texto").textContent = `Recebemos sua mensagem sobre "${rot}". Vamos responder em ${f.email.value.trim()}. Se não aparecer na caixa de entrada, confira o spam.`;
    } catch (e) { m.textContent = e.message; m.className = "c-msg erro"; }
  };
  $("#ct-outra").onclick = () => { f.reset(); f.hidden = false; $("#ct-ok").hidden = true; $("#m-contato").textContent = ""; dica(); };
})();
