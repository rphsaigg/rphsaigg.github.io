/* Bairro Ideal — busca da página inicial: capitais e bairros (índice em /static/dados/busca.json). */
(function () {
  "use strict";
  const campo = document.getElementById("busca"), lista = document.getElementById("sugestoes");
  if (!campo) return;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let indice = null, capitais = null, itens = [], ativo = -1;

  async function carregar() {
    if (indice) return;
    const [b, c] = await Promise.all([fetch(`/static/dados/busca.json?v=${window.DADOS_V || ""}`).then((r) => r.json()), fetch(`/static/dados/capitais.json?v=${window.DADOS_V || ""}`).then((r) => r.json())]);
    capitais = Object.fromEntries(c.map((x) => [x.slug, x.nome]));
    indice = [...c.map((x) => ({ tipo: "capital", nome: x.nome, slug: x.slug, k: norm(x.nome) })),
      ...b.map(([nome, slug]) => ({ tipo: "bairro", nome, slug, k: norm(nome) }))];
  }

  function mostrar() {
    const q = norm(campo.value);
    if (q.length < 2) { lista.hidden = true; campo.setAttribute("aria-expanded", "false"); return; }
    const comeca = indice.filter((i) => i.k.startsWith(q)), contem = indice.filter((i) => !i.k.startsWith(q) && i.k.includes(q));
    itens = [...comeca, ...contem].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "capital" ? -1 : 1)).slice(0, 8);
    ativo = itens.length ? 0 : -1;
    lista.innerHTML = itens.length ? itens.map((i, n) =>
      `<li role="option" id="s${n}"${n === ativo ? ' aria-selected="true"' : ""} data-n="${n}"><b>${esc(i.nome)}</b><span>${i.tipo === "capital" ? "capital" : esc(capitais[i.slug])}</span></li>`).join("")
      : `<li class="vazio">Nada encontrado. Por enquanto, 24 capitais.</li>`;
    lista.hidden = false;
    campo.setAttribute("aria-expanded", "true");
  }

  function ir(i) {
    if (!i) return;
    window.biEvento?.("busca", i.tipo === "capital" ? i.slug : `${i.slug}:${i.nome}`);
    location.href = i.tipo === "capital" ? `/${i.slug}/` : `/${i.slug}/?regiao=${encodeURIComponent(i.nome)}`;
  }

  campo.addEventListener("focus", carregar, { once: true });
  campo.addEventListener("input", async () => { await carregar(); mostrar(); });
  campo.addEventListener("keydown", (e) => {
    if (lista.hidden || !itens.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      ativo = (ativo + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
      lista.querySelectorAll("li").forEach((li, n) => li.toggleAttribute("aria-selected", n === ativo));
    } else if (e.key === "Enter") { e.preventDefault(); ir(itens[ativo]); }
    else if (e.key === "Escape") { lista.hidden = true; }
  });
  lista.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-n]"); if (li) ir(itens[+li.dataset.n]); });
  campo.addEventListener("blur", () => setTimeout(() => (lista.hidden = true), 150));
})();
