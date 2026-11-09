/* Bairro Ideal — "Comprar ou alugar?": simula mês a mês quem financia (Tabela Price) contra quem aluga e investe a diferença
   (e a entrada). Compara o patrimônio líquido no horizonte escolhido. Tudo no navegador; as premissas são editáveis. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v) => (v < 0 ? "−" : "") + "R$ " + num(Math.round(Math.abs(v) / 100) * 100);
  const valor = (s) => Number(String(s || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
  const f = $("#f-ca"), V = window.DADOS_V || "", CAP = window.CAPITAIS;
  const cache = {};
  const regioes = (slug) => (cache[slug] ||= fetch(`/static/dados/${slug}.geojson?v=${V}`).then((r) => r.json()).then((g) => g.features.map((x) => x.properties)));
  const pc = (s) => Number(String(s || "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;   // percentuais: vírgula ou ponto decimal
  const fmtIn = (el) => { const n = valor(el.value); el.value = n ? num(n) : ""; };

  f.capital.innerHTML = `<option value="">Preencher sozinho…</option>` + CAP.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");
  async function carregarCapital() {
    const lista = f.capital.value ? [...(await regioes(f.capital.value))].filter((p) => p.venda_m2_est && p.aluguel_m2_est).sort((a, b) => a.nome.localeCompare(b.nome, "pt")) : [];
    f.regiao.innerHTML = `<option value="">${lista.length ? "Escolha o bairro…" : f.capital.value ? "Sem estimativa nesta capital" : "—"}</option>` + lista.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
    f.regiao.disabled = !lista.length;
  }
  async function preencher() {
    if (!f.capital.value || !f.regiao.value) return;
    const p = (await regioes(f.capital.value)).find((x) => x.id === f.regiao.value), area = valor(f.area.value) || 60;
    if (!p) return;
    f.preco.value = num(Math.round((p.venda_m2_est * area) / 1000) * 1000);
    f.aluguel.value = num(Math.round((p.aluguel_m2_est * area) / 10) * 10);
    f.entrada.value = num(Math.round((p.venda_m2_est * area * 0.2) / 1000) * 1000);
  }
  f.capital.onchange = carregarCapital;
  f.regiao.onchange = preencher;
  f.area.onchange = preencher;
  ["preco", "aluguel", "entrada"].forEach((n) => f[n].addEventListener("blur", () => fmtIn(f[n])));

  const taxaMensal = (aa) => Math.pow(1 + aa / 100, 1 / 12) - 1;

  function simular(o) {
    const L = Math.max(0, o.preco - o.entrada), n = o.prazo * 12, i = taxaMensal(o.juros);
    const parcela = L === 0 ? 0 : i === 0 ? L / n : (L * i) / (1 - Math.pow(1 + i, -n));
    const rv = taxaMensal(o.valoriza), ra = taxaMensal(o.reajuste), rr = taxaMensal(o.rende);
    let saldo = L, valorImovel = o.preco, aluguel = o.aluguel, carteira = o.entrada + o.preco * (o.custos / 100);   // quem aluga investe o que o dono gastaria no começo
    let pagoDono = o.entrada + o.preco * (o.custos / 100), pagoInq = 0, ponto = null;
    const anos = [];
    for (let m = 1; m <= o.horizonte * 12; m++) {
      const juros = saldo * i, amort = m <= n ? Math.max(0, parcela - juros) : 0;
      const parc = m <= n ? parcela : 0;
      saldo = Math.max(0, saldo - amort);
      valorImovel *= 1 + rv;
      const custoDono = valorImovel * (o.dono / 100) / 12;
      const saiDono = parc + custoDono, saiInq = aluguel;
      pagoDono += saiDono; pagoInq += saiInq;
      carteira = carteira * (1 + rr) + (saiDono - saiInq);   // o inquilino investe a diferença (ou saca, se o aluguel for maior)
      aluguel *= 1 + ra;
      if (m % 12 === 0) {
        const patDono = valorImovel * (1 - 0.06) - saldo;   // 6% de corretagem na hora de vender
        anos.push({ ano: m / 12, dono: patDono, inq: carteira, saldo, valorImovel });
        if (ponto == null && patDono > carteira) ponto = m / 12;
      }
    }
    return { parcela, anos, ponto, final: anos[anos.length - 1], pagoDono, pagoInq };
  }

  f.onsubmit = (ev) => {
    ev.preventDefault();
    const o = { preco: valor(f.preco.value), aluguel: valor(f.aluguel.value), entrada: valor(f.entrada.value), prazo: valor(f.prazo.value) || 30,
      juros: pc(f.juros.value), valoriza: pc(f.valoriza.value), reajuste: pc(f.reajuste.value), rende: pc(f.rende.value),
      custos: pc(f.custos.value), dono: pc(f.dono.value), horizonte: Math.min(40, valor(f.horizonte.value) || 10) };
    const res = $("#ca-res"); res.hidden = false;
    if (!o.preco || !o.aluguel) { res.innerHTML = `<p class="aviso">Informe o preço de compra e o aluguel mensal (ou escolha capital e bairro para preencher).</p>`; return; }
    if (o.entrada > o.preco) { res.innerHTML = `<p class="aviso">A entrada não pode ser maior que o preço do imóvel.</p>`; return; }
    const s = simular(o), fim = s.final, dif = fim.dono - fim.inq;
    const comprando = dif > 0;
    window.biEvento?.("comprar_alugar", comprando ? "comprar" : "alugar");
    const renda = s.parcela * 3.3;   // regra usual dos bancos: parcela até ~30% da renda
    res.innerHTML = `
      <div class="vale-veredito ${comprando ? "dentro" : "abaixo"}"><span>Em ${o.horizonte} anos, com estas premissas</span>
        <h2>${comprando ? "Comprar" : "Alugar e investir"} deixa ${brl(Math.abs(dif))} a mais</h2>
        <p>Patrimônio de quem compra: <b>${brl(fim.dono)}</b> (imóvel de ${brl(fim.valorImovel)} menos corretagem e dívida de ${brl(fim.saldo)}). Patrimônio de quem aluga e investe: <b>${brl(fim.inq)}</b>.
        ${s.ponto ? `Comprar passa a compensar a partir do <b>${s.ponto}º ano</b>.` : `Nestas premissas, comprar não compensa dentro de ${o.horizonte} anos.`}</p></div>
      <div class="vale-bairro tabela-rolavel"><h3>Ano a ano</h3><table class="neg-tab"><thead><tr><th>Ano</th><th>Comprar (patrimônio)</th><th>Alugar e investir</th><th>Diferença</th></tr></thead><tbody>
        ${s.anos.filter((a) => a.ano <= 3 || a.ano % 5 === 0 || a.ano === o.horizonte).map((a) => `<tr><td>${a.ano}</td><td>${brl(a.dono)}</td><td>${brl(a.inq)}</td><td class="${a.dono > a.inq ? "bom" : "ruim"}">${brl(a.dono - a.inq)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="vale-bairro"><h3>O que pesa</h3><ul class="vale-lista">
        <li>Parcela do financiamento: <b>${brl(s.parcela)}</b>/mês (${o.prazo} anos a ${num(o.juros, 1)}% ao ano). Os bancos costumam pedir renda de cerca de <b>${brl(renda)}</b>/mês para uma parcela assim.</li>
        <li>Aluguel hoje: <b>${brl(o.aluguel)}</b>/mês. Na compra você também paga IPTU e manutenção (≈ ${brl(o.preco * o.dono / 100 / 12)}/mês no começo) e perdeu ${brl(o.entrada + o.preco * o.custos / 100)} de entrada e custos que renderiam ${num(o.rende, 1)}% ao ano.</li>
        <li>Total gasto em ${o.horizonte} anos: ${brl(s.pagoDono)} comprando (com entrada e custos) e ${brl(s.pagoInq)} de aluguel.</li></ul></div>
      <p class="pd-cta">Já tem um bairro em mente? <a href="/esse-aluguel-vale/">Confira se o preço do anúncio está no esperado</a> · <a href="/falar-com-corretor/">Falar com um corretor</a></p>
      <p class="nota">Simulação educativa, não recomendação de compra nem de investimento. Ela usa Tabela Price com juros fixos, valorização e reajuste constantes, 6% de corretagem na venda e deixa de fora seguro, condomínio (igual nos dois lados), FGTS, imposto de renda sobre ganho de capital, mudança de juros e a segurança de ter a própria casa. Pequenas mudanças nas premissas mudam o resultado: teste cenários.</p>`;
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  };
})();
