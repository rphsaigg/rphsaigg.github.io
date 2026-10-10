// Módulo MEI & pequenos negócios: caixa (entradas e saídas), limite de faturamento, DAS e produtos (margem e estoque).
(function () {
  const ENTRADAS = ["Venda de produto", "Prestação de serviço", "Outras entradas"];
  const SAIDAS = ["Compra de mercadoria", "Insumos e embalagens", "Aluguel", "Energia, água e internet", "Transporte e frete",
                  "Taxas e tarifas", "Marketing", "DAS", "Pró-labore", "Outras saídas"];
  const FORMAS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência"];
  const REF = window.SAIGG_REF || {};
  const LIMITE = REF.limite_mei_anual || 81000;
  const dasPadrao = () => Math.round(((REF.salario_minimo || 1518) * 0.05 + (REF.das_icms || 1)) * 100) / 100;

  // DAS da competência AAAA-MM vence no dia 20 do mês seguinte
  const vencDAS = comp => { const [a, m] = comp.split("-").map(Number); const d = new Date(a, m, 20); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-20`; };
  const faturamento = (c, ano) => c.lista("lancamento").filter(l => l.tipo === "Entrada" && l.categoria !== "Outras entradas" && c.anoDe(l.data) === ano);

  SaiggModulo({
    slug: "mei",
    nome: "MEI & pequenos negócios",
    titulo: "Caixa, limite e DAS do seu MEI",
    subtitulo: "Registre entradas e saídas, acompanhe o faturamento contra o limite anual, o DAS de cada mês e a margem dos seus produtos.",
    botaoTopo: { tipo: "lancamento", texto: "Novo lançamento" },
    primeiro: { tipo: "lancamento", titulo: "Registre a primeira venda ou despesa", texto: "Cada entrada e saída alimenta o painel: saldo do mês, faturamento acumulado contra o limite de " + LIMITE.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + " e para onde o dinheiro está indo.", botao: "Novo lançamento" },
    abas: [["painel", "Painel"], ["lancamento", "Caixa"], ["das", "DAS"], ["produto", "Produtos"], ["exportar", "Exportar"]],
    tipos: {
      lancamento: {
        titulo: "lançamento", plural: "Caixa", dataCampo: "data",
        ajuda: "Toda entrada (venda, serviço) e saída (compra, conta, DAS, retirada) do negócio.",
        campos: [
          { n: "data", r: "Data", t: "data", obrig: true },
          { n: "tipo", r: "Tipo", t: "enum", o: ["Entrada", "Saída"], obrig: true, padrao: "Entrada" },
          { n: "categoria", r: "Categoria", t: "enum", o: [...ENTRADAS, ...SAIDAS], obrig: true },
          { n: "descricao", r: "Descrição", t: "texto", span: 2, ph: "Ex.: 3 bolos de pote — Ana" },
          { n: "valor", r: "Valor (R$)", t: "moeda", obrig: true },
          { n: "forma", r: "Forma de pagamento", t: "enum", o: FORMAS },
          { n: "nota_fiscal", r: "Emiti nota fiscal", t: "bool" },
        ],
        colunas: ["data", { r: "Tipo", v: (l, c) => c.badge(l.tipo, l.tipo === "Entrada" ? "ok" : "neutro") }, "categoria", "descricao",
                  { r: "Valor", t: "moeda", v: (l, c) => `<span class="num">${l.tipo === "Saída" ? "−" : ""}${c.brl(l.valor)}</span>` }],
        resumo: (rs, c) => {
          const e = c.somar(rs.filter(l => l.tipo === "Entrada"), "valor"), s = c.somar(rs.filter(l => l.tipo === "Saída"), "valor");
          return `<div class="aluguel-kpis">${c.kpi("Entradas", c.brl(e), "", "ok")}${c.kpi("Saídas", c.brl(s))}${c.kpi("Saldo", c.brl(e - s), "", e - s < 0 ? "atraso" : "")}${c.kpi("Lançamentos", rs.length)}</div>`;
        },
      },
      das: {
        titulo: "DAS", plural: "DAS", dataCampo: "competencia",
        ajuda: "Guia mensal do MEI. Vence no dia 20 do mês seguinte à competência.",
        ordem: (a, b) => b.competencia.localeCompare(a.competencia),
        campos: [
          { n: "competencia", r: "Competência", t: "mes", obrig: true },
          { n: "valor", r: "Valor (R$)", t: "moeda", obrig: true, padrao: dasPadrao, dica: "5% do salário mínimo + ICMS (R$ 1) e/ou ISS (R$ 5)" },
          { n: "pago", r: "Pago", t: "bool" },
          { n: "data_pagamento", r: "Data do pagamento", t: "data" },
        ],
        colunas: ["competencia", { r: "Vencimento", v: d => window.Saigg.dataBR(vencDAS(d.competencia)) }, "valor",
                  { r: "Situação", v: (d, c) => d.pago ? c.badge("Pago", "ok") : c.hoje > vencDAS(d.competencia) ? c.badge("Atrasado", "bad") : c.badge("A pagar", "warn") }],
        acoes: [{ rotulo: "Marcar pago", mostrar: d => !d.pago, aplicar: (d, c) => ({ pago: true, data_pagamento: c.hoje }), feito: "DAS marcado como pago." }],
        gerar: {
          rotulo: "Gerar DAS do ano",
          nada: "As guias deste ano já existem.",
          registros: (c, f) => {
            const ano = +(f.ano || c.state.ano), tem = new Set(c.lista("das").map(d => d.competencia));
            return Array.from({ length: 12 }, (_, i) => `${ano}-${c.pad2(i + 1)}`).filter(k => !tem.has(k)).map(k => ({ competencia: k, valor: dasPadrao(), pago: false }));
          },
        },
      },
      produto: {
        titulo: "produto", plural: "Produtos",
        ajuda: "Custo, preço e estoque de cada produto ou serviço. A margem é calculada sobre o preço.",
        ordem: (a, b) => a.nome.localeCompare(b.nome),
        campos: [
          { n: "nome", r: "Produto ou serviço", t: "texto", obrig: true, span: 2 },
          { n: "custo", r: "Custo unitário (R$)", t: "moeda" },
          { n: "preco", r: "Preço de venda (R$)", t: "moeda" },
          { n: "estoque", r: "Estoque atual", t: "numero" },
          { n: "estoque_minimo", r: "Estoque mínimo", t: "numero", dica: "avisa no painel quando chegar nele" },
          { n: "ativo", r: "Ativo", t: "bool", padrao: true },
          { n: "obs", r: "Observações", t: "textarea" },
        ],
        colunas: ["nome", "custo", "preco",
                  { r: "Margem", num: true, v: p => p.preco > 0 ? `<span class="num">${(((p.preco - (p.custo || 0)) / p.preco) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %</span>` : "—" },
                  { r: "Estoque", num: true, v: (p, c) => p.estoque === undefined ? "—" : (p.estoque_minimo !== undefined && p.estoque <= p.estoque_minimo ? c.badge(String(p.estoque) + " · repor", "bad") : `<span class="num">${p.estoque}</span>`) }],
      },
    },

    painel(c) {
      const ano = c.state.ano, mesAtual = c.hoje.slice(0, 7);
      const ls = c.lista("lancamento").filter(l => c.anoDe(l.data) === ano);
      const ent = c.somar(ls.filter(l => l.tipo === "Entrada"), "valor"), sai = c.somar(ls.filter(l => l.tipo === "Saída"), "valor");
      const fat = c.somar(faturamento(c, ano), "valor"), pctLim = fat / LIMITE;
      const meses = c.MESES.map((nome, i) => {
        const k = `${ano}-${c.pad2(i + 1)}`, doMes = ls.filter(l => l.data.slice(0, 7) === k);
        return { k, nome, e: c.somar(doMes.filter(l => l.tipo === "Entrada"), "valor"), s: c.somar(doMes.filter(l => l.tipo === "Saída"), "valor") };
      });
      const ateMes = ano === +c.hoje.slice(0, 4) ? +c.hoje.slice(5, 7) : 12;
      const mediaMes = fat / Math.max(1, ateMes), projecao = mediaMes * 12;
      const dasAno = Array.from({ length: ateMes }, (_, i) => `${ano}-${c.pad2(i + 1)}`).filter(k => k < mesAtual || ano < +c.hoje.slice(0, 4));
      const dasReg = Object.fromEntries(c.lista("das").map(d => [d.competencia, d]));
      const dasPend = dasAno.filter(k => !(dasReg[k] && dasReg[k].pago));
      const repor = c.lista("produto").filter(p => p.ativo !== false && p.estoque !== undefined && p.estoque_minimo !== undefined && p.estoque <= p.estoque_minimo);
      const porCat = {};
      ls.filter(l => l.tipo === "Saída").forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + c.num(l.valor); });
      const alerta = pctLim >= 1 ? `<div class="aluguel-status vencida"><div><b>Faturamento passou do limite do MEI</b><small>Acima de 20% do limite o desenquadramento é retroativo a janeiro. Converse com um contador.</small></div></div>`
        : pctLim >= 0.8 ? `<div class="aluguel-status atencao"><div><b>${(pctLim * 100).toFixed(0)}% do limite anual já usado</b><small>No ritmo atual, o ano fecha em ${c.brl(projecao)}.</small></div></div>` : "";
      return `<section>
        <div class="aluguel-toolbar"><div><h2>Painel do ano</h2><p>Faturamento, saldo e obrigações.</p></div>
          <div class="aluguel-campo"><label for="painel-ano">Ano</label>${c.selectAno("painel-ano", ano)}</div></div>
        ${alerta}
        <div class="aluguel-kpis">
          ${c.kpi("Faturamento", c.brl(fat), `${(pctLim * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do limite de ${c.brl(LIMITE)}`)}
          ${c.kpi("Saídas", c.brl(sai), "todas as despesas do ano")}
          ${c.kpi("Saldo", c.brl(ent - sai), "entradas − saídas", ent - sai < 0 ? "atraso" : "ok")}
          ${c.kpi("Projeção do ano", c.brl(projecao), `média de ${c.brl(mediaMes)}/mês`, projecao > LIMITE ? "atraso" : "")}
        </div>
        ${c.bloco("Limite do MEI", `Faturamento acumulado (vendas e serviços) contra ${c.brl(LIMITE)} no ano.`,
          c.barras([{ rotulo: "Usado", valor: fat, max: LIMITE, detalhe: c.brl(fat), classe: pctLim >= 0.8 ? "alerta" : "recebido" }, { rotulo: "Disponível", valor: Math.max(0, LIMITE - fat), max: LIMITE, detalhe: c.brl(Math.max(0, LIMITE - fat)), classe: "previsto" }]))}
        <div class="aluguel-atencao-grid dois">
          ${c.bloco("DAS em aberto", dasPend.length ? "Competências sem pagamento registrado." : "Tudo em dia.",
            dasPend.length ? `<ul class="modulo-lista">${dasPend.slice(0, 6).map(k => `<li><span>${c.mesBR(k)}</span>${c.hoje > vencDAS(k) ? c.badge("atrasado", "bad") : c.badge("vence " + c.dataBR(vencDAS(k)), "warn")}</li>`).join("")}${dasPend.length > 6 ? `<li><span>e mais ${dasPend.length - 6}</span></li>` : ""}</ul><button class="aluguel-btn sec pequeno" data-ir="das">Ver DAS</button>` : `<p class="aluguel-mutado">Nenhuma guia pendente até ${c.mesBR(mesAtual)}.</p>`)}
          ${c.bloco("Repor estoque", repor.length ? "Produtos no estoque mínimo ou abaixo." : "Nenhum produto abaixo do mínimo.",
            repor.length ? `<ul class="modulo-lista">${repor.map(p => `<li><span>${c.esc(p.nome)}</span>${c.badge(String(p.estoque), "bad")}</li>`).join("")}</ul>` : "")}
        </div>
        ${c.bloco("Mês a mês", "Entradas e saídas registradas.",
          c.tabela(["Mês", "Entradas", "Saídas", "Saldo"], meses.map(m => [m.nome, `<span class="num">${c.brl(m.e)}</span>`, `<span class="num">${c.brl(m.s)}</span>`, `<span class="num">${c.brl(m.e - m.s)}</span>`]), [1, 2, 3]))}
        ${Object.keys(porCat).length ? c.bloco("Para onde vai o dinheiro", "Saídas do ano por categoria.", c.barras(Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v, classe: "gasto" })))) : ""}
      </section>`;
    },

    resumoExcel(c) {
      const ano = c.state.ano, fat = c.somar(faturamento(c, ano), "valor");
      const ls = c.lista("lancamento").filter(l => c.anoDe(l.data) === ano);
      return [["Ano", ano], ["Faturamento (vendas e serviços)", fat], ["Limite anual do MEI", LIMITE], ["Entradas", c.somar(ls.filter(l => l.tipo === "Entrada"), "valor")],
              ["Saídas", c.somar(ls.filter(l => l.tipo === "Saída"), "valor")]];
    },
  });
})();
