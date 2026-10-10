// Busca da home: índice gerado no build (/static/busca.json), filtrado no navegador. Tecla "/" foca o campo.
(function () {
  const q = document.getElementById("busca-q"), res = document.getElementById("busca-res");
  if (!q) return;
  let indice = null, itens = [], ativo = -1;
  const norm = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function carregar() {
    if (!indice) indice = (await fetch("/static/busca.json").then(r => r.json()).catch(() => [])).map(i => ({ ...i, _t: norm(i.t), _k: norm(i.t + " " + i.k) }));
    return indice;
  }
  function pontuar(i, termos, frase) {
    if (!termos.every(t => i._k.includes(t))) return 0;
    let p = 1 + (i._t.includes(frase) ? 4 : 0) + termos.filter(t => i._t.includes(t)).length * 2;
    return p + ({ calculadora: 1.5, planilha: 1, guia: 0.5 }[i.tipo] || 0);
  }
  function mostrar(lista, texto) {
    itens = lista; ativo = -1;
    res.innerHTML = lista.length
      ? lista.map((i, n) => `<a href="${i.u}" role="option" id="br-${n}"><b>${esc(i.t)}</b><span class="tipo">${esc(i.rot)}</span></a>`).join("")
      : `<p class="vazio">Nada encontrado para “${esc(texto)}”. Tente outra palavra ou veja <a href="/calculadoras/">todas as calculadoras</a>.</p>`;
    res.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  async function buscar() {
    const texto = q.value.trim();
    if (texto.length < 2) { res.hidden = true; q.setAttribute("aria-expanded", "false"); return; }
    const frase = norm(texto), termos = frase.split(/\s+/).filter(t => t.length > 1);
    const idx = await carregar();
    mostrar(idx.map(i => [pontuar(i, termos, frase), i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]), texto);
  }
  function marcar(n) {
    const as = res.querySelectorAll("a[role=option]");
    if (!as.length) return;
    ativo = (n + as.length) % as.length;
    as.forEach((a, k) => a.classList.toggle("ativo", k === ativo));
    q.setAttribute("aria-activedescendant", as[ativo].id);
  }
  q.addEventListener("focus", carregar, { once: true });
  q.addEventListener("input", buscar);
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); marcar(ativo + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcar(ativo - 1); }
    else if (e.key === "Enter" && itens.length) { e.preventDefault(); location.href = itens[Math.max(ativo, 0)].u; }
    else if (e.key === "Escape") { res.hidden = true; q.blur(); }
  });
  document.addEventListener("click", e => { if (!e.target.closest("#busca")) res.hidden = true; });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });
})();
