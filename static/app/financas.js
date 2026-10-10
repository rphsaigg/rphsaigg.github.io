// Módulo Finanças pessoais: receitas e despesas, orçamento por categoria, dívidas (avalanche × bola de neve) e metas.
(function () {
  const RECEITAS = ["Salário", "Renda extra", "Outras receitas"];
  const DESPESAS = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Contas e serviços", "Compras", "Dívidas", "Investimentos", "Outros"];
  const FORMAS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência"];

  const doMes = (c, k) => c.lista("lancamento").filter(l => String(l.data).slice(0, 7) === k);
  const mesesAte = (c, iso) => { if (!iso) return null; const [a, m] = iso.split("-").map(Number), [ha, hm] = c.hoje.split("-").map(Number); return Math.max(1, (a - ha) * 12 + (m - hm)); };

  SaiggModulo({
    slug: "financas",
    nome: "Finanças pessoais",
    titulo: "O dinheiro da casa sob controle",
    subtitulo: "Receitas e despesas do mês, orçamento por categoria, a ordem certa para quitar as dívidas e quanto guardar para cada meta.",
    botaoTopo: { tipo: "lancamento", texto: "Novo lançamento" },
    primeiro: { tipo: "lancamento", titulo: "Registre a primeira receita ou despesa", texto: "Com os lançamentos do mês você vê o saldo, quanto conseguiu guardar e onde o dinheiro está indo. Depois defina limites por categoria em Orçamento.", botao: "Novo lançamento" },
    abas: [["painel", "Painel"], ["lancamento", "Lançamentos"], ["orcamento", "Orçamento"], ["divida", "Dívidas"], ["meta", "Metas"], ["exportar", "Exportar"]],
    tipos: {
      lancamento: {
        titulo: "lançamento", plural: "Lançamentos", dataCampo: "data",
        campos: [
          { n: "data", r: "Data", t: "data", obrig: true },
          { n: "tipo", r: "Tipo", t: "enum", o: ["Receita", "Despesa"], obrig: true, padrao: "Despesa" },
          { n: "categoria", r: "Categoria", t: "enum", o: [...RECEITAS, ...DESPESAS], obrig: true },
          { n: "descricao", r: "Descrição", t: "texto", span: 2, ph: "Ex.: mercado do mês" },
          { n: "valor", r: "Valor (R$)", t: "moeda", obrig: true },
          { n: "forma", r: "Forma de pagamento", t: "enum", o: FORMAS },
        ],
        colunas: ["data", { r: "Tipo", v: (l, c) => c.badge(l.tipo, l.tipo === "Receita" ? "ok" : "neutro") }, "categoria", "descricao",
                  { r: "Valor", t: "moeda", v: (l, c) => `<span class="num">${l.tipo === "Despesa" ? "−" : ""}${c.brl(l.valor)}</span>` }],
      },
      orcamento: {
        titulo: "limite", plural: "Orçamento",
        ajuda: "Quanto você quer gastar por mês em cada categoria. O painel compara com o que foi gasto.",
        ordem: (a, b) => a.categoria.localeCompare(b.categoria),
        campos: [
          { n: "categoria", r: "Categoria", t: "enum", o: DESPESAS, obrig: true },
          { n: "limite", r: "Limite mensal (R$)", t: "moeda", obrig: true },
        ],
        colunas: ["categoria", "limite", { r: `Gasto este mês`, num: true, v: (o, c) => `<span class="num">${c.brl(c.somar(doMes(c, c.hoje.slice(0, 7)).filter(l => l.tipo === "Despesa" && l.categoria === o.categoria), "valor"))}</span>` }],
      },
      divida: {
        titulo: "dívida", plural: "Dívidas",
        ajuda: "Saldo devedor e juros de cada dívida. O painel mostra a ordem para quitar.",
        ordem: (a, b) => (a.quitada === true) - (b.quitada === true) || b.juros_mes - a.juros_mes,
        campos: [
          { n: "nome", r: "Dívida", t: "texto", obrig: true, ph: "Ex.: Cartão Nubank" },
          { n: "credor", r: "Credor", t: "texto" },
          { n: "saldo", r: "Saldo devedor (R$)", t: "moeda", obrig: true },
          { n: "juros_mes", r: "Juros ao mês (%)", t: "pct", dica: "veja no contrato ou na fatura (CET)" },
          { n: "parcela", r: "Parcela mensal (R$)", t: "moeda" },
          { n: "dia_vencimento", r: "Dia de vencimento", t: "numero" },
          { n: "quitada", r: "Quitada", t: "bool" },
          { n: "obs", r: "Observações", t: "textarea" },
        ],
        colunas: ["nome", "saldo", "juros_mes", "parcela", { r: "Situação", v: (d, c) => d.quitada ? c.badge("Quitada", "ok") : c.badge("Em aberto", "warn") }],
        acoes: [{ rotulo: "Marcar quitada", mostrar: d => !d.quitada, aplicar: () => ({ quitada: true, saldo: 0 }), feito: "Dívida quitada. 🎉" }],
      },
      meta: {
        titulo: "meta", plural: "Metas",
        ajuda: "Reserva de emergência, viagem, entrada do imóvel… Atualize o valor guardado quando depositar.",
        ordem: (a, b) => String(a.data_alvo || "9").localeCompare(String(b.data_alvo || "9")),
        campos: [
          { n: "nome", r: "Meta", t: "texto", obrig: true, ph: "Ex.: Reserva de emergência" },
          { n: "valor_alvo", r: "Valor da meta (R$)", t: "moeda", obrig: true },
          { n: "valor_atual", r: "Já guardado (R$)", t: "moeda" },
          { n: "data_alvo", r: "Até quando", t: "data" },
          { n: "obs", r: "Observações", t: "textarea" },
        ],
        colunas: ["nome", "valor_alvo", "valor_atual",
                  { r: "Progresso", v: (m, c) => { const p = Math.min(100, Math.round(c.num(m.valor_atual) / Math.max(1, c.num(m.valor_alvo)) * 100)); return `${p}%<div class="modulo-progresso"><i style="width:${p}%"></i></div>`; } },
                  { r: "Guardar por mês", num: true, v: (m, c) => { const n = mesesAte(c, m.data_alvo), f = c.num(m.valor_alvo) - c.num(m.valor_atual); return f <= 0 ? c.badge("Concluída", "ok") : n ? `<span class="num">${c.brl(f / n)}</span>` : "—"; } }],
      },
    },

    painel(c) {
      const k = c.state.mes, ls = doMes(c, k);
      const rec = c.somar(ls.filter(l => l.tipo === "Receita"), "valor"), desp = c.somar(ls.filter(l => l.tipo === "Despesa"), "valor"), saldo = rec - desp;
      const porCat = {};
      ls.filter(l => l.tipo === "Despesa").forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + c.num(l.valor); });
      const orc = c.lista("orcamento");
      const orcLinhas = orc.map(o => ({ o, gasto: porCat[o.categoria] || 0 })).sort((a, b) => b.gasto / Math.max(1, b.o.limite) - a.gasto / Math.max(1, a.o.limite));
      const estourados = orcLinhas.filter(x => x.gasto > c.num(x.o.limite));
      const dividas = c.lista("divida").filter(d => !d.quitada && c.num(d.saldo) > 0);
      const avalanche = [...dividas].sort((a, b) => c.num(b.juros_mes) - c.num(a.juros_mes));
      const bola = [...dividas].sort((a, b) => c.num(a.saldo) - c.num(b.saldo));
      const metas = c.lista("meta").filter(m => c.num(m.valor_atual) < c.num(m.valor_alvo));
      const hist = Array.from({ length: 6 }, (_, i) => { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1 - (5 - i), 1); return `${d.getFullYear()}-${c.pad2(d.getMonth() + 1)}`; })
        .map(m => { const x = doMes(c, m); const r = c.somar(x.filter(l => l.tipo === "Receita"), "valor"), d = c.somar(x.filter(l => l.tipo === "Despesa"), "valor"); return [c.mesBR(m), `<span class="num">${c.brl(r)}</span>`, `<span class="num">${c.brl(d)}</span>`, `<span class="num">${c.brl(r - d)}</span>`]; });
      return `<section>
        <div class="aluguel-toolbar"><div><h2>Painel do mês</h2><p>Saldo, orçamento, dívidas e metas.</p></div>
          <div class="aluguel-campo"><label for="painel-mes">Mês</label>${c.selectMes("painel-mes", k)}</div></div>
        <div class="aluguel-kpis">
          ${c.kpi("Receitas", c.brl(rec), "", "ok")}
          ${c.kpi("Despesas", c.brl(desp))}
          ${c.kpi("Saldo do mês", c.brl(saldo), "", saldo < 0 ? "atraso" : "ok")}
          ${c.kpi("Você guardou", rec ? `${Math.round(saldo / rec * 100)}%` : "—", "da renda do mês (ideal: 10% ou mais)", saldo < 0 ? "atraso" : "")}
        </div>
        ${estourados.length ? `<div class="aluguel-status vencida"><div><b>${estourados.length} categoria(s) acima do orçamento</b><small>${estourados.map(x => `${c.esc(x.o.categoria)}: ${c.brl(x.gasto)} de ${c.brl(x.o.limite)}`).join(" · ")}</small></div></div>` : ""}
        ${orc.length ? c.bloco("Orçamento × gasto", `${c.mesBR(k)}: quanto já foi de cada limite.`, c.barras(orcLinhas.map(x => ({ rotulo: x.o.categoria, valor: x.gasto, max: c.num(x.o.limite), detalhe: `${c.brl(x.gasto)} / ${c.brl(x.o.limite)}`, classe: x.gasto > c.num(x.o.limite) ? "alerta" : "recebido" }))))
          : Object.keys(porCat).length ? c.bloco("Para onde foi o dinheiro", `Despesas de ${c.mesBR(k)} por categoria. <a href="#" data-ir="orcamento">Defina limites</a> para acompanhar o orçamento.`, c.barras(Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => ({ rotulo: cat, valor: v, classe: "gasto" })))) : ""}
        <div class="aluguel-atencao-grid dois">
          ${c.bloco("Dívidas: ordem para quitar", dividas.length ? `Total: ${c.brl(c.somar(dividas, "saldo"))}. Pague o mínimo de todas e coloque o que sobrar na primeira da lista.` : "Nenhuma dívida em aberto.",
            dividas.length ? `<p class="aluguel-mutado"><b>Avalanche</b> (maiores juros primeiro — paga menos juros no total):</p><ol class="modulo-lista">${avalanche.map(d => `<li><span>${c.esc(d.nome)}</span><span>${c.num(d.juros_mes).toLocaleString("pt-BR")}% a.m. · ${c.brl(d.saldo)}</span></li>`).join("")}</ol>
              <p class="aluguel-mutado"><b>Bola de neve</b> (menor saldo primeiro — vitórias rápidas):</p><ol class="modulo-lista">${bola.map(d => `<li><span>${c.esc(d.nome)}</span><span>${c.brl(d.saldo)}</span></li>`).join("")}</ol>` : "")}
          ${c.bloco("Metas", metas.length ? "Quanto guardar por mês para chegar na data." : "Nenhuma meta em andamento.",
            metas.length ? `<ul class="modulo-lista">${metas.map(m => { const p = Math.min(100, Math.round(c.num(m.valor_atual) / Math.max(1, c.num(m.valor_alvo)) * 100)), n = mesesAte(c, m.data_alvo); return `<li style="display:block"><b>${c.esc(m.nome)}</b> — ${c.brl(m.valor_atual || 0)} de ${c.brl(m.valor_alvo)}${n ? ` · guardar ${c.brl((c.num(m.valor_alvo) - c.num(m.valor_atual)) / n)}/mês` : ""}<div class="modulo-progresso"><i style="width:${p}%"></i></div></li>`; }).join("")}</ul>` : `<button class="aluguel-btn sec pequeno" data-new="meta">Criar uma meta</button>`)}
        </div>
        ${c.bloco("Últimos 6 meses", "Receitas, despesas e saldo.", c.tabela(["Mês", "Receitas", "Despesas", "Saldo"], hist, [1, 2, 3]))}
      </section>`;
    },

    resumoExcel(c) {
      const k = c.state.mes, ls = doMes(c, k);
      const rec = c.somar(ls.filter(l => l.tipo === "Receita"), "valor"), desp = c.somar(ls.filter(l => l.tipo === "Despesa"), "valor");
      return [["Mês", c.mesBR(k)], ["Receitas", rec], ["Despesas", desp], ["Saldo", rec - desp],
              ["Dívidas em aberto", c.somar(c.lista("divida").filter(d => !d.quitada), "saldo")]];
    },
  });
})();
