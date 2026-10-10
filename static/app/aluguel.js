(function () {
  window.__erros = window.__erros || [];
  window.addEventListener("error", ev => {
    window.__erros.push({ mensagem: ev.message, arquivo: ev.filename, linha: ev.lineno, coluna: ev.colno });
  });
  window.addEventListener("unhandledrejection", ev => {
    window.__erros.push({ mensagem: ev.reason && (ev.reason.message || String(ev.reason)) });
  });

  const S = window.Saigg;
  const NOMES = { igpm: "IGP-M", ipca: "IPCA", inpc: "INPC", nenhum: "Nenhum", acordo: "Acordo" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const TIPOS = {
    imovel: {
      titulo: "imóvel",
      campos: ["apelido", "endereco", "tipo_imovel", "inquilino", "cpf_inquilino", "contato", "inicio", "fim", "aluguel", "dia_vencimento", "indice", "garantia", "valor_garantia", "iptu_anual", "iptu_pago_por", "condominio", "condominio_pago_por", "taxa_adm_pct", "valor_mercado", "ativo", "obs"],
      numeros: ["aluguel", "dia_vencimento", "valor_garantia", "iptu_anual", "condominio", "taxa_adm_pct", "valor_mercado"],
      bools: ["ativo"]
    },
    recebimento: {
      titulo: "recebimento",
      campos: ["imovel_id", "competencia", "valor_previsto", "valor_pago", "data_pagamento", "multa_juros", "obs"],
      numeros: ["valor_previsto", "valor_pago", "multa_juros"]
    },
    despesa: {
      titulo: "despesa",
      campos: ["imovel_id", "data", "categoria", "descricao", "valor"],
      numeros: ["valor"]
    },
    reajuste: {
      titulo: "reajuste",
      campos: ["imovel_id", "data", "indice", "percentual", "valor_anterior", "valor_novo", "obs"],
      numeros: ["percentual", "valor_anterior", "valor_novo"]
    }
  };
  const ENUMS = {
    tipo_imovel: ["Apartamento", "Casa", "Sala comercial", "Loja", "Galpão", "Outro"],
    indice: ["igpm", "ipca", "inpc", "nenhum"],
    garantia: ["Caução", "Fiador", "Seguro-fiança", "Título de capitalização", "Sem garantia"],
    iptu_pago_por: ["Inquilino", "Locador"],
    condominio_pago_por: ["Inquilino", "Locador"],
    categoria: ["Manutenção", "IPTU", "Condomínio", "Taxa de administração", "Seguro", "Imposto", "Outros"],
    indice_reajuste: ["igpm", "ipca", "inpc", "acordo"]
  };

  const state = {
    aba: "painel",
    ano: new Date().getFullYear(),
    dados: null,
    indices: { series: {} },
    editor: null,
    filtros: {
      recebimentos: { imovel: "", ano: new Date().getFullYear() },
      despesas: { imovel: "", ano: new Date().getFullYear() }
    },
    debugVencida: new URLSearchParams(location.search).get("simular_vencida") === "1"
  };

  let root;

  document.addEventListener("DOMContentLoaded", iniciar);

  async function iniciar() {
    root = document.getElementById("aluguel-app");
    ligarEventos();
    try {
      await S.exigirLogin();
      await Promise.all([carregarDados(), carregarIndices()]);
      render();
    } catch (e) {
      erro(e);
      root.innerHTML = `<div class="aluguel-erro">Não foi possível carregar seus dados: ${S.esc(e.message || e)}</div>`;
    }
  }

  function ligarEventos() {
    root.addEventListener("click", async ev => {
      const el = ev.target.closest("[data-tab],[data-new],[data-edit],[data-delete],[data-close-editor],[data-toggle-imovel],[data-gerar-parcelas],[data-pagar],[data-aplicar-reajuste],[data-export-xlsx],[data-export-csv]");
      if (!el) return;
      ev.preventDefault();
      try {
        if (el.dataset.tab) { state.aba = el.dataset.tab; state.editor = null; render(); return; }
        if (el.dataset.new) { abrirEditor(el.dataset.new); return; }
        if (el.dataset.edit) { abrirEditor(el.dataset.tipo, el.dataset.edit); return; }
        if (el.dataset.closeEditor !== undefined) { state.editor = null; render(); return; }
        if (el.dataset.delete) { await excluirRegistro(el.dataset.tipo, el.dataset.delete); return; }
        if (el.dataset.toggleImovel) { await alternarImovel(el.dataset.toggleImovel); return; }
        if (el.dataset.gerarParcelas !== undefined) { await gerarParcelas(); return; }
        if (el.dataset.pagar) { prepararPagamento(el.dataset.pagar); return; }
        if (el.dataset.aplicarReajuste) { await aplicarReajuste(el.dataset.aplicarReajuste); return; }
        if (el.dataset.exportXlsx !== undefined) { await exportarExcel(el); return; }
        if (el.dataset.exportCsv !== undefined) { exportarCSV(); return; }
      } catch (e) {
        erro(e);
      }
    });

    root.addEventListener("change", ev => {
      const el = ev.target;
      if (el.id === "painel-ano") { state.ano = Number(el.value); render(); }
      if (el.id === "rec-filtro-imovel") { state.filtros.recebimentos.imovel = el.value; render(); }
      if (el.id === "rec-filtro-ano") { state.filtros.recebimentos.ano = Number(el.value); render(); }
      if (el.id === "desp-filtro-imovel") { state.filtros.despesas.imovel = el.value; render(); }
      if (el.id === "desp-filtro-ano") { state.filtros.despesas.ano = Number(el.value); render(); }
    });

    root.addEventListener("submit", async ev => {
      if (!ev.target.matches("[data-aluguel-form]")) return;
      ev.preventDefault();
      try {
        await salvarFormulario(ev.target);
      } catch (e) {
        erro(e);
      }
    });
  }

  async function carregarDados() {
    const d = await S.api("/dados/aluguel");
    state.dados = normalizarDados(d);
    if (state.debugVencida) {
      state.dados.somente_leitura = true;
      state.dados.expira_em = state.dados.expira_em || somarDias(S.hojeISO(), -1);
    }
  }

  function normalizarDados(d) {
    const regs = d.registros || {};
    const out = { ...d, registros: {} };
    for (const tipo of Object.keys(TIPOS)) {
      out.registros[tipo] = (regs[tipo] || []).map(r => {
        const campos = r.campos && typeof r.campos === "object" ? r.campos : r;
        return { ...campos, id: r.id, criado_em: r.criado_em, atualizado_em: r.atualizado_em };
      });
    }
    return out;
  }

  async function carregarIndices() {
    try {
      state.indices = await fetch("/static/indices.json").then(r => r.ok ? r.json() : Promise.reject(new Error("índices indisponíveis")));
    } catch (_) {
      state.indices = { series: {} };
    }
    complementarIndices().then(() => render()).catch(() => {});
  }

  async function complementarIndices() {
    const cods = { igpm: 189, ipca: 433, inpc: 188 };
    await Promise.all(Object.entries(cods).map(async ([nome, cod]) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      try {
        const dados = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados/ultimos/20?formato=json`, { signal: ctrl.signal }).then(r => r.json());
        state.indices.series[nome] = state.indices.series[nome] || {};
        dados.forEach(x => { state.indices.series[nome][`${x.data.slice(6, 10)}-${x.data.slice(3, 5)}`] = parseFloat(x.valor); });
      } catch (_) {
        // Mantém os índices do site quando o Banco Central não responde.
      } finally {
        clearTimeout(t);
      }
    }));
  }

  function render() {
    const d = state.dados;
    if (!d) return;
    const imoveis = lista("imovel");
    root.innerHTML = `
      <div class="aluguel-hero">
        <div class="aluguel-topo">
          <div>
            <span class="aluguel-selo">🏘️ Área do assinante · Aluguel & imóveis</span>
            <h1>Controle online dos seus imóveis alugados</h1>
            <p>Recebimentos, atrasos, despesas, reajustes oficiais e exportação em Excel no mesmo lugar.</p>
          </div>
          <div class="aluguel-acoes">
            <a class="aluguel-btn sec" href="/app/">Minha assinatura</a>
            ${podeEditar() ? `<button class="aluguel-btn primario" data-new="imovel">Cadastrar imóvel</button>` : ""}
          </div>
        </div>
        ${renderStatus()}
      </div>
      ${renderAbas()}
      <div class="aluguel-corpo">
        ${imoveis.length ? "" : renderVazio()}
        ${renderEditor()}
        ${renderAba()}
      </div>`;
  }

  function renderStatus() {
    const d = state.dados;
    if (d.somente_leitura) {
      return `<div class="aluguel-status vencida">
        <div><b>Assinatura vencida/inativa</b><small>Você pode ver e baixar seus dados; para registrar, renove sua assinatura.</small></div>
        <a class="aluguel-btn sec" href="/app/">Renovar</a>
      </div>`;
    }
    if (d.acesso_total) return `<div class="aluguel-status"><div><b>Acesso total</b><small>Liberado pela chave de acesso. Você pode cadastrar, editar e exportar.</small></div></div>`;
    const dias = d.expira_em ? S.diasAte(d.expira_em.slice(0, 10)) : null;
    const classe = dias !== null && dias <= 7 ? " atencao" : "";
    return `<div class="aluguel-status${classe}">
      <div><b>Assinatura ativa${d.expira_em ? ` até ${S.dataBR(d.expira_em)}` : ""}</b>
      ${dias !== null && dias <= 7 ? `<small>Faltam ${dias} dia${dias === 1 ? "" : "s"} para vencer. Renove para continuar registrando.</small>` : `<small>Você pode cadastrar, editar e exportar seus dados.</small>`}</div>
      ${dias !== null && dias <= 7 ? `<a class="aluguel-btn sec" href="/app/">Renovar</a>` : ""}
    </div>`;
  }

  function renderAbas() {
    const abas = [["painel", "Painel"], ["imoveis", "Imóveis"], ["recebimentos", "Recebimentos"], ["despesas", "Despesas"], ["reajustes", "Reajustes"], ["exportar", "Exportar"]];
    return `<nav class="aluguel-abas" aria-label="Seções do módulo">${abas.map(([id, nome]) => `<button class="aluguel-aba ${state.aba === id ? "ativa" : ""}" data-tab="${id}">${nome}</button>`).join("")}</nav>`;
  }

  function renderAba() {
    if (state.aba === "imoveis") return renderImoveis();
    if (state.aba === "recebimentos") return renderRecebimentos();
    if (state.aba === "despesas") return renderDespesas();
    if (state.aba === "reajustes") return renderReajustes();
    if (state.aba === "exportar") return renderExportar();
    return renderPainel();
  }

  function renderVazio() {
    return `<div class="aluguel-vazio">
      <h2>Cadastre seu primeiro imóvel</h2>
      <p>Depois disso você gera as parcelas do ano, marca pagamentos, lança despesas e acompanha atrasos, reajustes pelo índice oficial e rentabilidade líquida.</p>
      ${podeEditar() ? `<button class="aluguel-btn primario" data-new="imovel">Cadastrar primeiro imóvel</button>` : `<a class="aluguel-btn primario" href="/app/">Renovar para cadastrar</a>`}
    </div>`;
  }

  function renderPainel() {
    const ano = state.ano;
    const k = calcularKPIs(ano);
    const max = Math.max(1, ...k.meses.map(m => Math.max(m.previsto, m.recebido)));
    return `<section>
      <div class="aluguel-toolbar">
        <div><h2>Painel do ano</h2><p>Visão consolidada de receitas, atrasos, reajustes e rentabilidade.</p></div>
        <div class="aluguel-campo"><label for="painel-ano">Ano</label>${selectAno("painel-ano", ano)}</div>
      </div>
      <div class="aluguel-kpis">
        ${kpi("Receita prevista", S.brl(k.previsto), "Contratos/parcelas do ano")}
        ${kpi("Recebida", S.brl(k.recebido), "Pagamentos registrados", "ok")}
        ${kpi("Em atraso", S.brl(k.atraso), "Vencidas e não quitadas", "atraso")}
        ${kpi("A receber", S.brl(k.aReceber), "Parcelas futuras/em aberto")}
      </div>
      <div class="aluguel-bloco">
        <div class="aluguel-bloco-cab"><div><h2>Previsto × recebido por mês</h2><p>Barras em roxo indicam o que já entrou.</p></div><div class="aluguel-legenda"><span><i></i> Previsto</span><span><i></i> Recebido</span></div></div>
        <div class="aluguel-grafico">
          ${k.meses.map(m => `<div class="aluguel-barra-linha"><span>${MESES[m.mes - 1]}</span><div class="aluguel-barras"><span class="aluguel-barra previsto"><i style="width:${pctBar(m.previsto, max)}%"></i></span><span class="aluguel-barra recebido"><i style="width:${pctBar(m.recebido, max)}%"></i></span></div><strong>${S.brl(m.recebido)}</strong></div>`).join("")}
        </div>
      </div>
      <div class="aluguel-bloco">
        <div class="aluguel-bloco-cab"><div><h2>Mês a mês</h2><p>Valores agrupados pela competência das parcelas.</p></div></div>
        ${tabela(["Mês", "Previsto", "Recebido", "Em atraso", "A receber"], k.meses.map(m => [S.mesBR(`${ano}-${pad2(m.mes)}`), moeda(m.previsto), moeda(m.recebido), moeda(m.atraso), moeda(m.aReceber)]), [1,2,3,4])}
      </div>
      ${renderAtencao()}
      ${renderRentabilidade(ano)}
    </section>`;
  }

  function renderAtencao() {
    const hoje = S.hojeISO();
    const atrasos = lista("recebimento").filter(r => {
      const st = statusRecebimento(r);
      return st.chave === "atraso";
    }).sort((a, b) => vencimento(a).localeCompare(vencimento(b))).slice(0, 6);
    const reajustes = proximosReajustes(60);
    const contratos = lista("imovel").filter(i => i.ativo !== false && i.fim).map(i => ({ imovel: i, dias: diasEntre(hoje, i.fim) })).filter(x => x.dias >= 0 && x.dias <= 90).sort((a, b) => a.dias - b.dias);
    return `<div class="aluguel-bloco">
      <div class="aluguel-bloco-cab"><div><h2>Atenção agora</h2><p>Alertas operacionais para agir primeiro no que vence ou está atrasado.</p></div></div>
      <div class="aluguel-atencao-grid">
        ${miniLista("Aluguéis em atraso", atrasos.map(r => {
          const im = imovel(r.imovel_id);
          return `<div class="aluguel-mini-item"><b>${esc(nomeImovel(im))}</b><span>${S.mesBR(r.competencia)} · ${diasEntre(vencimento(r), hoje)} dia(s) em atraso</span></div>`;
        }))}
        ${miniLista("Reajustes em 60 dias", reajustes.map(x => `<div class="aluguel-mini-item"><b>${esc(nomeImovel(x.imovel))}</b><span>${S.dataBR(x.data)} · ${NOMES[x.imovel.indice] || x.imovel.indice} ${x.acc ? `· novo aluguel ${S.brl(x.novo)}` : "· índice indisponível"}</span></div>`))}
        ${miniLista("Contratos terminando em 90 dias", contratos.map(x => `<div class="aluguel-mini-item"><b>${esc(nomeImovel(x.imovel))}</b><span>${S.dataBR(x.imovel.fim)} · em ${x.dias} dia(s)</span></div>`))}
      </div>
    </div>`;
  }

  function miniLista(titulo, itens) {
    return `<div><h3>${titulo}</h3><div class="aluguel-mini-lista">${itens.length ? itens.join("") : `<div class="aluguel-mini-item aluguel-mutado">Nada por enquanto.</div>`}</div></div>`;
  }

  function renderRentabilidade(ano) {
    const linhas = lista("imovel").map(i => {
      const r = rentabilidadeImovel(i, ano);
      return [esc(nomeImovel(i)), moeda(r.receita), moeda(r.despesas + r.encargos), pctTaxa(r.bruta), pctTaxa(r.liquida)];
    });
    return `<div class="aluguel-bloco">
      <div class="aluguel-bloco-cab"><div><h2>Rentabilidade por imóvel</h2><p>Bruta e líquida anual sobre o valor de mercado, descontando despesas do ano e encargos pagos pelo locador.</p></div></div>
      ${linhas.length ? tabela(["Imóvel", "Receita anual", "Despesas + encargos", "Bruta", "Líquida"], linhas, [1,2,3,4]) : `<p class="aluguel-mutado">Cadastre imóveis para acompanhar rentabilidade.</p>`}
    </div>`;
  }

  function renderImoveis() {
    const imoveis = lista("imovel");
    return `<section>
      <div class="aluguel-toolbar">
        <div><h2>Imóveis</h2><p>Cadastro de contratos, aluguel, vencimento, encargos e índice de reajuste.</p></div>
        ${podeEditar() ? `<button class="aluguel-btn primario" data-new="imovel">Novo imóvel</button>` : ""}
      </div>
      <div class="aluguel-lista">
        ${imoveis.map(i => `<article class="aluguel-card">
          <div class="aluguel-card-topo">
            <div><h3>${esc(nomeImovel(i))}</h3><p>${esc(i.endereco || "Sem endereço informado")}</p></div>
            <span class="aluguel-badge ${i.ativo === false ? "neutro" : "ok"}">${i.ativo === false ? "Inativo" : "Ativo"}</span>
          </div>
          <dl>
            <div><dt>Aluguel</dt><dd>${S.brl(i.aluguel)}</dd></div>
            <div><dt>Vencimento</dt><dd>Dia ${i.dia_vencimento || "—"}</dd></div>
            <div><dt>Índice</dt><dd>${NOMES[i.indice] || "—"}</dd></div>
            <div><dt>Contrato</dt><dd>${S.dataBR(i.inicio)} → ${S.dataBR(i.fim)}</dd></div>
            <div><dt>Inquilino</dt><dd>${esc(i.inquilino || "—")}</dd></div>
            <div><dt>Valor de mercado</dt><dd>${S.brl(i.valor_mercado)}</dd></div>
          </dl>
          ${i.obs ? `<p><strong>Observações:</strong> ${esc(i.obs)}</p>` : ""}
          ${podeEditar() ? `<div class="aluguel-acoes" style="margin-top:1rem">
            <button class="aluguel-btn sec pequeno" data-tipo="imovel" data-edit="${i.id}">Editar</button>
            <button class="aluguel-btn sec pequeno" data-toggle-imovel="${i.id}">${i.ativo === false ? "Marcar ativo" : "Marcar inativo"}</button>
            <button class="aluguel-btn perigo pequeno" data-tipo="imovel" data-delete="${i.id}">Excluir</button>
          </div>` : ""}
        </article>`).join("") || `<div class="aluguel-vazio"><h3>Nenhum imóvel cadastrado</h3><p>Comece cadastrando o imóvel e depois gere as parcelas do ano.</p></div>`}
      </div>
    </section>`;
  }

  function renderRecebimentos() {
    const f = state.filtros.recebimentos;
    const recs = lista("recebimento").filter(r => (!f.imovel || r.imovel_id === f.imovel) && (!f.ano || anoDeMes(r.competencia) === Number(f.ano))).sort((a, b) => (a.competencia || "").localeCompare(b.competencia || ""));
    return `<section>
      <div class="aluguel-toolbar">
        <div><h2>Recebimentos</h2><p>Gere parcelas do contrato e acompanhe pagamento, atraso e valores parciais.</p></div>
        <div class="aluguel-acoes">
          ${selectImovel("rec-filtro-imovel", f.imovel, "Todos os imóveis")}
          ${selectAno("rec-filtro-ano", f.ano)}
          ${podeEditar() ? `<button class="aluguel-btn primario" data-gerar-parcelas>Gerar parcelas do ano</button><button class="aluguel-btn sec" data-new="recebimento">Novo recebimento</button>` : ""}
        </div>
      </div>
      ${!f.imovel && podeEditar() ? `<div class="aluguel-bloco"><p class="aluguel-mutado">Para gerar parcelas automaticamente, selecione um imóvel no filtro acima.</p></div>` : ""}
      ${tabela(["Imóvel", "Competência", "Previsto", "Pago", "Vencimento", "Status", ""], recs.map(r => {
        const st = statusRecebimento(r);
        return [esc(nomeImovel(imovel(r.imovel_id))), S.mesBR(r.competencia), moeda(r.valor_previsto), moeda(r.valor_pago), S.dataBR(vencimento(r)), badgeStatus(st), acoesLinha("recebimento", r, st)];
      }), [2,3])}
    </section>`;
  }

  function renderDespesas() {
    const f = state.filtros.despesas;
    const deps = lista("despesa").filter(r => (!f.imovel || r.imovel_id === f.imovel) && (!f.ano || anoDeData(r.data) === Number(f.ano))).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    return `<section>
      <div class="aluguel-toolbar">
        <div><h2>Despesas</h2><p>Manutenção, IPTU, condomínio, administração, seguro e outros custos.</p></div>
        <div class="aluguel-acoes">
          ${selectImovel("desp-filtro-imovel", f.imovel, "Todos os imóveis", true)}
          ${selectAno("desp-filtro-ano", f.ano)}
          ${podeEditar() ? `<button class="aluguel-btn primario" data-new="despesa">Nova despesa</button>` : ""}
        </div>
      </div>
      ${tabela(["Data", "Imóvel", "Categoria", "Descrição", "Valor", ""], deps.map(r => [S.dataBR(r.data), esc(nomeImovel(imovel(r.imovel_id)) || "Geral"), esc(r.categoria || "—"), esc(r.descricao || "—"), moeda(r.valor), acoesLinha("despesa", r)]), [4])}
    </section>`;
  }

  function renderReajustes() {
    const proximos = proximosReajustes(370);
    const hist = lista("reajuste").sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    return `<section>
      <div class="aluguel-toolbar">
        <div><h2>Reajustes</h2><p>Aplicação pelo índice oficial acumulado em 12 meses, usando a regra da calculadora do site.</p></div>
        ${podeEditar() ? `<button class="aluguel-btn sec" data-new="reajuste">Registrar reajuste manual</button>` : ""}
      </div>
      <div class="aluguel-bloco">
        <div class="aluguel-bloco-cab"><div><h2>Próximos aniversários</h2><p>Para imóveis ativos com IGP-M, IPCA ou INPC.</p></div></div>
        ${tabela(["Imóvel", "Aniversário", "Índice", "Acumulado 12 meses", "Aluguel atual", "Novo aluguel estimado", ""], proximos.map(x => {
          const ja = lista("reajuste").some(r => r.imovel_id === x.imovel.id && r.data === x.data);
          return [esc(nomeImovel(x.imovel)), S.dataBR(x.data), NOMES[x.imovel.indice], x.acc ? `${pctTaxa(x.acc.taxa)}<br><small>${esc(x.acc.periodo)}${x.acc.aviso ? " · " + esc(x.acc.aviso) : ""}</small>` : "Índice indisponível", moeda(x.imovel.aluguel), x.acc ? moeda(x.novo) : "—", podeEditar() && x.acc ? `<button class="aluguel-btn ok pequeno" data-aplicar-reajuste="${x.imovel.id}" ${ja ? "disabled" : ""}>${ja ? "Já aplicado" : "Aplicar reajuste"}</button>` : ""];
        }), [4,5])}
      </div>
      <div class="aluguel-bloco">
        <div class="aluguel-bloco-cab"><div><h2>Histórico aplicado</h2><p>Registros de reajuste salvos na sua conta.</p></div></div>
        ${tabela(["Data", "Imóvel", "Índice", "Percentual", "Valor anterior", "Valor novo", ""], hist.map(r => [S.dataBR(r.data), esc(nomeImovel(imovel(r.imovel_id))), NOMES[r.indice] || esc(r.indice), pctPercentual(r.percentual), moeda(r.valor_anterior), moeda(r.valor_novo), acoesLinha("reajuste", r)]), [3,4,5])}
      </div>
    </section>`;
  }

  function renderExportar() {
    const ano = new Date().getFullYear();
    const k = calcularKPIs(ano);
    return `<section>
      <div class="aluguel-toolbar"><div><h2>Exportar</h2><p>Baixe seus dados quando quiser. A exportação continua liberada mesmo em somente leitura.</p></div></div>
      <div class="aluguel-exporta">
        <div class="aluguel-exporta-card">
          <h3>Excel completo (.xlsx)</h3>
          <p>Gera abas Resumo, Imóveis, Recebimentos, Despesas e Reajustes, com valores em reais e datas formatadas.</p>
          <button class="aluguel-btn primario" data-export-xlsx>Baixar tudo em Excel</button>
        </div>
        <div class="aluguel-exporta-card">
          <h3>CSV simples</h3>
          <p>Alternativa leve em texto, com seções separadas por ponto e vírgula.</p>
          <button class="aluguel-btn sec" data-export-csv>Baixar em CSV</button>
        </div>
      </div>
      <div class="aluguel-bloco">
        <h2>Resumo que irá no Excel (${ano})</h2>
        <div class="aluguel-kpis">
          ${kpi("Previsto", S.brl(k.previsto))}
          ${kpi("Recebido", S.brl(k.recebido), "", "ok")}
          ${kpi("Em atraso", S.brl(k.atraso), "", "atraso")}
          ${kpi("A receber", S.brl(k.aReceber))}
        </div>
      </div>
    </section>`;
  }

  function renderEditor() {
    if (!state.editor) return "";
    const { tipo, id, dados } = state.editor;
    const titulo = `${id ? "Editar" : "Novo"} ${TIPOS[tipo].titulo}`;
    return `<section class="aluguel-editor">
      <h3>${titulo}</h3>
      <form data-aluguel-form data-tipo="${tipo}" data-id="${id || ""}">
        <div class="aluguel-form-grid">${camposForm(tipo, dados || registro(tipo, id) || {})}</div>
        <div class="aluguel-form-acoes">
          <button type="button" class="aluguel-btn sec" data-close-editor>Cancelar</button>
          <button type="submit" class="aluguel-btn primario">Salvar</button>
        </div>
      </form>
    </section>`;
  }

  function camposForm(tipo, r) {
    if (tipo === "imovel") {
      return [
        input("apelido", "Apelido do imóvel", r.apelido, "Ex.: Apto 204", "span-2", true),
        select("tipo_imovel", "Tipo", ENUMS.tipo_imovel, r.tipo_imovel),
        input("endereco", "Endereço", r.endereco, "Rua, número, complemento", "span-3"),
        input("inquilino", "Inquilino", r.inquilino),
        input("cpf_inquilino", "CPF/CNPJ do inquilino", r.cpf_inquilino),
        input("contato", "Contato", r.contato),
        input("inicio", "Início do contrato", r.inicio, "", "", false, "date"),
        input("fim", "Fim do contrato", r.fim, "", "", false, "date"),
        input("aluguel", "Aluguel atual (R$)", r.aluguel, "0,00", "", true, "text", "decimal"),
        input("dia_vencimento", "Dia de vencimento", r.dia_vencimento, "10", "", false, "number"),
        select("indice", "Índice de reajuste", ENUMS.indice, r.indice || "ipca", NOMES),
        select("garantia", "Garantia", ENUMS.garantia, r.garantia),
        input("valor_garantia", "Valor da garantia (R$)", r.valor_garantia, "0,00", "", false, "text", "decimal"),
        input("iptu_anual", "IPTU anual (R$)", r.iptu_anual, "0,00", "", false, "text", "decimal"),
        select("iptu_pago_por", "IPTU pago por", ENUMS.iptu_pago_por, r.iptu_pago_por),
        input("condominio", "Condomínio mensal (R$)", r.condominio, "0,00", "", false, "text", "decimal"),
        select("condominio_pago_por", "Condomínio pago por", ENUMS.condominio_pago_por, r.condominio_pago_por),
        input("taxa_adm_pct", "Taxa de administração (%)", r.taxa_adm_pct, "0,00", "", false, "text", "decimal"),
        input("valor_mercado", "Valor de mercado (R$)", r.valor_mercado, "0,00", "", false, "text", "decimal"),
        `<label class="aluguel-check"><input type="checkbox" name="ativo" ${r.ativo !== false ? "checked" : ""}> Imóvel ativo</label>`,
        textarea("obs", "Observações", r.obs, "span-3")
      ].join("");
    }
    if (tipo === "recebimento") {
      return [
        selectImovelCampo(r.imovel_id, true),
        input("competencia", "Competência", r.competencia, "", "", true, "month"),
        input("valor_previsto", "Valor previsto (R$)", r.valor_previsto, "0,00", "", false, "text", "decimal"),
        input("valor_pago", "Valor pago (R$)", r.valor_pago, "0,00", "", false, "text", "decimal"),
        input("data_pagamento", "Data do pagamento", r.data_pagamento, "", "", false, "date"),
        input("multa_juros", "Multa/juros (R$)", r.multa_juros, "0,00", "", false, "text", "decimal"),
        textarea("obs", "Observações", r.obs, "span-3")
      ].join("");
    }
    if (tipo === "despesa") {
      return [
        selectImovelCampo(r.imovel_id, false),
        input("data", "Data", r.data, "", "", true, "date"),
        select("categoria", "Categoria", ENUMS.categoria, r.categoria, null, true),
        input("descricao", "Descrição", r.descricao, "", "span-2"),
        input("valor", "Valor (R$)", r.valor, "0,00", "", true, "text", "decimal")
      ].join("");
    }
    return [
      selectImovelCampo(r.imovel_id, true),
      input("data", "Data", r.data, "", "", true, "date"),
      select("indice", "Índice", ENUMS.indice_reajuste, r.indice || "acordo", { ...NOMES, acordo: "Acordo" }, true),
      input("percentual", "Percentual aplicado (%)", r.percentual, "0,00", "", true, "text", "decimal"),
      input("valor_anterior", "Valor anterior (R$)", r.valor_anterior, "0,00", "", true, "text", "decimal"),
      input("valor_novo", "Valor novo (R$)", r.valor_novo, "0,00", "", true, "text", "decimal"),
      textarea("obs", "Observações", r.obs, "span-3")
    ].join("");
  }

  async function salvarFormulario(form) {
    if (!podeEditar()) return avisoSomenteLeitura();
    const tipo = form.dataset.tipo;
    const id = form.dataset.id || null;
    const atual = id ? registro(tipo, id) : {};
    const bruto = S.lerForm(form);
    const dados = limparParaAPI(tipo, { ...atual, ...bruto });
    const salvo = await S.api(`/dados/aluguel/${tipo}${id ? `/${id}` : ""}`, { metodo: id ? "PUT" : "POST", corpo: dados });
    S.aviso(`${capital(TIPOS[tipo].titulo)} salvo com sucesso.`);
    await carregarDados();
    state.editor = null;
    render();
    return salvo;
  }

  function limparParaAPI(tipo, r) {
    const cfg = TIPOS[tipo];
    const out = {};
    for (const campo of cfg.campos) {
      if (cfg.bools && cfg.bools.includes(campo)) {
        out[campo] = r[campo] === true || r[campo] === "true" || r[campo] === "on";
        continue;
      }
      let v = r[campo];
      if (v === undefined || v === null || v === "") continue;
      if (cfg.numeros.includes(campo)) v = numero(v);
      out[campo] = v;
    }
    return out;
  }

  function abrirEditor(tipo, id, dados) {
    if (!podeEditar()) return avisoSomenteLeitura();
    state.editor = { tipo, id: id || null, dados };
    render();
    document.querySelector(".aluguel-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function excluirRegistro(tipo, id) {
    if (!podeEditar()) return avisoSomenteLeitura();
    let msg = `Excluir este ${TIPOS[tipo].titulo}?`;
    if (tipo === "imovel") msg = "Excluir este imóvel? Recebimentos, despesas e reajustes vinculados a ele também serão apagados.";
    if (!confirm(msg)) return;
    const r = await S.api(`/dados/aluguel/${tipo}/${id}`, { metodo: "DELETE" });
    await carregarDados();
    state.editor = null;
    render();
    S.aviso(tipo === "imovel" && r.dependentes_excluidos ? `Imóvel excluído. ${r.dependentes_excluidos} registro(s) vinculado(s) também foram apagados.` : "Registro excluído.");
  }

  async function alternarImovel(id) {
    if (!podeEditar()) return avisoSomenteLeitura();
    const i = imovel(id);
    await S.api(`/dados/aluguel/imovel/${id}`, { metodo: "PUT", corpo: limparParaAPI("imovel", { ...i, ativo: i.ativo === false }) });
    await carregarDados();
    render();
    S.aviso("Status do imóvel atualizado.");
  }

  async function gerarParcelas() {
    if (!podeEditar()) return avisoSomenteLeitura();
    const imovelId = state.filtros.recebimentos.imovel;
    const ano = Number(state.filtros.recebimentos.ano);
    if (!imovelId) { S.aviso("Selecione um imóvel para gerar as parcelas.", "erro"); return; }
    const i = imovel(imovelId);
    if (!i) return;
    const existentes = new Set(lista("recebimento").filter(r => r.imovel_id === imovelId).map(r => r.competencia));
    const meses = mesesContratoNoAno(i, ano).filter(ym => !existentes.has(ym));
    if (!meses.length) { S.aviso("As parcelas deste ano já existem para o imóvel selecionado."); return; }
    for (const competencia of meses) {
      await S.api("/dados/aluguel/recebimento", { metodo: "POST", corpo: { imovel_id: imovelId, competencia, valor_previsto: numero(i.aluguel) } });
    }
    await carregarDados();
    render();
    S.aviso(`${meses.length} parcela(s) gerada(s).`);
  }

  function prepararPagamento(id) {
    if (!podeEditar()) return avisoSomenteLeitura();
    const r = registro("recebimento", id);
    abrirEditor("recebimento", id, { ...r, valor_pago: numero(r.valor_previsto), data_pagamento: S.hojeISO() });
  }

  async function aplicarReajuste(imovelId) {
    if (!podeEditar()) return avisoSomenteLeitura();
    const prox = proximosReajustes(370).find(x => x.imovel.id === imovelId);
    if (!prox || !prox.acc) { S.aviso("Não há índice disponível para aplicar este reajuste.", "erro"); return; }
    if (!confirm(`Aplicar reajuste de ${pctTaxa(prox.acc.taxa)} em ${nomeImovel(prox.imovel)}?`)) return;
    await S.api("/dados/aluguel/reajuste", {
      metodo: "POST",
      corpo: {
        imovel_id: imovelId,
        data: prox.data,
        indice: prox.imovel.indice,
        percentual: arred(prox.acc.taxa * 100),
        valor_anterior: numero(prox.imovel.aluguel),
        valor_novo: prox.novo,
        obs: `Aplicado pelo índice oficial acumulado (${prox.acc.periodo}).`
      }
    });
    await S.api(`/dados/aluguel/imovel/${imovelId}`, { metodo: "PUT", corpo: limparParaAPI("imovel", { ...prox.imovel, aluguel: prox.novo }) });
    await carregarDados();
    render();
    S.aviso("Reajuste aplicado e aluguel atualizado.");
  }

  function calcularKPIs(ano) {
    const meses = Array.from({ length: 12 }, (_, idx) => ({ mes: idx + 1, previsto: 0, recebido: 0, atraso: 0, aReceber: 0 }));
    for (const r of lista("recebimento")) {
      if (anoDeMes(r.competencia) !== Number(ano)) continue;
      const m = Number((r.competencia || "").slice(5, 7));
      const item = meses[m - 1];
      const previsto = numero(r.valor_previsto);
      const pago = numero(r.valor_pago);
      const saldo = Math.max(0, previsto - pago);
      const st = statusRecebimento(r);
      item.previsto += previsto;
      item.recebido += pago;
      if (st.chave === "atraso") item.atraso += saldo;
      else item.aReceber += saldo;
    }
    return meses.reduce((acc, m) => {
      acc.previsto += m.previsto;
      acc.recebido += m.recebido;
      acc.atraso += m.atraso;
      acc.aReceber += m.aReceber;
      return acc;
    }, { previsto: 0, recebido: 0, atraso: 0, aReceber: 0, meses });
  }

  function statusRecebimento(r) {
    const previsto = numero(r.valor_previsto);
    const pago = numero(r.valor_pago);
    if (previsto > 0 && pago >= previsto - 0.005) return { chave: "pago", rotulo: "Pago" };
    if (pago > 0) {
      if (vencimento(r) < S.hojeISO()) return { chave: "atraso", rotulo: "Pago parcial" };
      return { chave: "parcial", rotulo: "Pago parcial" };
    }
    if (vencimento(r) < S.hojeISO()) return { chave: "atraso", rotulo: "Em atraso" };
    return { chave: "aberto", rotulo: "A vencer" };
  }

  function vencimento(r) {
    const i = imovel(r.imovel_id);
    const dia = Number(i && i.dia_vencimento) || 10;
    const [ano, mes] = String(r.competencia || "").split("-").map(Number);
    if (!ano || !mes) return "9999-12-31";
    const ultimo = new Date(ano, mes, 0).getDate();
    return `${ano}-${pad2(mes)}-${pad2(Math.min(dia, ultimo))}`;
  }

  function rentabilidadeImovel(i, ano) {
    let receita = lista("recebimento").filter(r => r.imovel_id === i.id && anoDeMes(r.competencia) === ano).reduce((s, r) => s + numero(r.valor_previsto), 0);
    const meses = mesesContratoNoAno(i, ano).length;
    if (!receita) receita = numero(i.aluguel) * meses;
    const despesas = lista("despesa").filter(d => d.imovel_id === i.id && anoDeData(d.data) === ano).reduce((s, d) => s + numero(d.valor), 0);
    const encargos = (i.iptu_pago_por === "Locador" ? numero(i.iptu_anual) : 0) +
      (i.condominio_pago_por === "Locador" ? numero(i.condominio) * meses : 0) +
      receita * (numero(i.taxa_adm_pct) / 100);
    const base = numero(i.valor_mercado);
    return { receita, despesas, encargos, bruta: base ? receita / base : 0, liquida: base ? (receita - despesas - encargos) / base : 0 };
  }

  function proximosReajustes(janelaDias) {
    const hoje = S.hojeISO();
    return lista("imovel").filter(i => i.ativo !== false && i.inicio && i.indice && i.indice !== "nenhum").map(i => {
      const data = proximoAniversario(i.inicio, hoje);
      const dias = diasEntre(hoje, data);
      const [ano, mes] = data.split("-").map(Number);
      const acc = acumulado(i.indice, ano, mes);
      return { imovel: i, data, dias, acc, novo: acc ? arred(numero(i.aluguel) * (1 + acc.taxa)) : null };
    }).filter(x => x.dias >= 0 && x.dias <= janelaDias).sort((a, b) => a.data.localeCompare(b.data));
  }

  function acumulado(nome, ano, mes) {
    const serie = (state.indices.series && state.indices.series[nome]) || {};
    let fimA = mes === 1 ? ano - 1 : ano;
    let fimM = mes === 1 ? 12 : mes - 1;
    let aviso = "";
    if (serie[chave(fimA, fimM)] === undefined) {
      const ult = Object.keys(serie).sort().pop();
      if (!ult) return null;
      if (ult < chave(fimA, fimM)) {
        fimA = Number(ult.slice(0, 4));
        fimM = Number(ult.slice(5, 7));
        aviso = "último índice publicado";
      }
    }
    let fator = 1;
    const meses = [];
    for (let idx = 0; idx < 12; idx++) {
      let m = fimM - idx;
      let a = fimA;
      while (m < 1) { m += 12; a--; }
      const v = serie[chave(a, m)];
      if (v === undefined) return null;
      fator *= 1 + Number(v) / 100;
      meses.push(chave(a, m));
    }
    return { taxa: fator - 1, periodo: `${rotMes(meses[11])} a ${rotMes(meses[0])}`, aviso };
  }

  async function exportarExcel(botao) {
    if (!window.ExcelJS) { S.aviso("ExcelJS ainda não carregou. Tente novamente em alguns segundos.", "erro"); return; }
    const txt = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Gerando…";
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Saigg Digital";
      wb.created = new Date();
      abaResumo(wb);
      abaImoveis(wb);
      abaRecebimentos(wb);
      abaDespesas(wb);
      abaReajustes(wb);
      const buf = await wb.xlsx.writeBuffer();
      baixarBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Saigg-Aluguel-${S.hojeISO()}.xlsx`);
      S.aviso("Excel gerado com sucesso.");
    } finally {
      botao.disabled = false;
      botao.textContent = txt;
    }
  }

  function abaResumo(wb) {
    const ano = new Date().getFullYear();
    const k = calcularKPIs(ano);
    const ws = wb.addWorksheet("Resumo");
    ws.addRows([
      ["Resumo do aluguel", ""],
      ["Exportado em", S.dataBR(S.hojeISO())],
      ["Ano", ano],
      ["Receita prevista", k.previsto],
      ["Recebida", k.recebido],
      ["Em atraso", k.atraso],
      ["A receber", k.aReceber],
      [],
      ["Mês", "Previsto", "Recebido", "Em atraso", "A receber"],
      ...k.meses.map(m => [S.mesBR(`${ano}-${pad2(m.mes)}`), m.previsto, m.recebido, m.atraso, m.aReceber])
    ]);
    estiloPlanilha(ws, [2, 3, 4, 5]);
    ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C5CE7" } };
    ws.mergeCells("A1:E1");
    const sub = ws.getRow(9);
    sub.font = { bold: true, color: { argb: "FFFFFFFF" } };
    sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C5CE7" } };
    ws.getColumn(1).width = 22;
  }

  function abaImoveis(wb) {
    const ws = wb.addWorksheet("Imóveis");
    const cols = ["Apelido", "Endereço", "Tipo", "Inquilino", "CPF", "Contato", "Início", "Fim", "Aluguel", "Dia venc.", "Índice", "Garantia", "Valor garantia", "IPTU anual", "IPTU pago por", "Condomínio", "Condomínio pago por", "Taxa adm. %", "Valor mercado", "Ativo", "Obs"];
    ws.addRow(cols);
    lista("imovel").forEach(i => ws.addRow([i.apelido, i.endereco, i.tipo_imovel, i.inquilino, i.cpf_inquilino, i.contato, dataExcel(i.inicio), dataExcel(i.fim), numero(i.aluguel), i.dia_vencimento, NOMES[i.indice] || i.indice, i.garantia, numero(i.valor_garantia), numero(i.iptu_anual), i.iptu_pago_por, numero(i.condominio), i.condominio_pago_por, numero(i.taxa_adm_pct) / 100, numero(i.valor_mercado), i.ativo === false ? "Não" : "Sim", i.obs]));
    estiloPlanilha(ws, [9, 13, 14, 16, 19], [7, 8], [18]);
  }

  function abaRecebimentos(wb) {
    const ws = wb.addWorksheet("Recebimentos");
    ws.addRow(["Imóvel", "Competência", "Valor previsto", "Valor pago", "Data pagamento", "Multa/juros", "Vencimento", "Status", "Obs"]);
    lista("recebimento").forEach(r => ws.addRow([nomeImovel(imovel(r.imovel_id)), r.competencia, numero(r.valor_previsto), numero(r.valor_pago), dataExcel(r.data_pagamento), numero(r.multa_juros), dataExcel(vencimento(r)), statusRecebimento(r).rotulo, r.obs]));
    estiloPlanilha(ws, [3, 4, 6], [5, 7]);
  }

  function abaDespesas(wb) {
    const ws = wb.addWorksheet("Despesas");
    ws.addRow(["Data", "Imóvel", "Categoria", "Descrição", "Valor"]);
    lista("despesa").forEach(d => ws.addRow([dataExcel(d.data), nomeImovel(imovel(d.imovel_id)) || "Geral", d.categoria, d.descricao, numero(d.valor)]));
    estiloPlanilha(ws, [5], [1]);
  }

  function abaReajustes(wb) {
    const ws = wb.addWorksheet("Reajustes");
    ws.addRow(["Data", "Imóvel", "Índice", "Percentual", "Valor anterior", "Valor novo", "Obs"]);
    lista("reajuste").forEach(r => ws.addRow([dataExcel(r.data), nomeImovel(imovel(r.imovel_id)), NOMES[r.indice] || r.indice, numero(r.percentual) / 100, numero(r.valor_anterior), numero(r.valor_novo), r.obs]));
    estiloPlanilha(ws, [5, 6], [1], [4]);
  }

  function estiloPlanilha(ws, moedaCols, dataCols = [], pctCols = []) {
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C5CE7" } };
    header.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((c, idx) => { c.width = Math.max(14, idx === 0 ? 22 : 16); });
    moedaCols.forEach(i => { ws.getColumn(i).numFmt = '"R$" #,##0.00'; });
    dataCols.forEach(i => { ws.getColumn(i).numFmt = "dd/mm/yyyy"; });
    pctCols.forEach(i => { ws.getColumn(i).numFmt = "0.00%"; });
    ws.eachRow(row => row.eachCell(cell => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFECEAF3" } } };
      cell.alignment = { vertical: "top", wrapText: true };
    }));
  }

  function exportarCSV() {
    const linhas = [];
    const add = arr => linhas.push(arr.map(csvCampo).join(";"));
    add(["Resumo", ""]);
    const k = calcularKPIs(new Date().getFullYear());
    [["Receita prevista", k.previsto], ["Recebida", k.recebido], ["Em atraso", k.atraso], ["A receber", k.aReceber]].forEach(add);
    add([]);
    add(["Imóveis"]); add(["Apelido", "Endereço", "Aluguel", "Ativo"]);
    lista("imovel").forEach(i => add([i.apelido, i.endereco, numero(i.aluguel), i.ativo === false ? "Não" : "Sim"]));
    add([]); add(["Recebimentos"]); add(["Imóvel", "Competência", "Previsto", "Pago", "Status"]);
    lista("recebimento").forEach(r => add([nomeImovel(imovel(r.imovel_id)), r.competencia, numero(r.valor_previsto), numero(r.valor_pago), statusRecebimento(r).rotulo]));
    add([]); add(["Despesas"]); add(["Data", "Imóvel", "Categoria", "Valor"]);
    lista("despesa").forEach(d => add([d.data, nomeImovel(imovel(d.imovel_id)), d.categoria, numero(d.valor)]));
    add([]); add(["Reajustes"]); add(["Data", "Imóvel", "Índice", "Percentual", "Valor anterior", "Valor novo"]);
    lista("reajuste").forEach(r => add([r.data, nomeImovel(imovel(r.imovel_id)), r.indice, numero(r.percentual), numero(r.valor_anterior), numero(r.valor_novo)]));
    baixarBlob(new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" }), `Saigg-Aluguel-${S.hojeISO()}.csv`);
  }

  function lista(tipo) { return (state.dados && state.dados.registros[tipo]) || []; }
  function registro(tipo, id) { return lista(tipo).find(r => r.id === id); }
  function imovel(id) { return lista("imovel").find(i => i.id === id); }
  function nomeImovel(i) { return i ? (i.apelido || i.endereco || "Imóvel sem nome") : ""; }
  function podeEditar() { return state.dados && !state.dados.somente_leitura; }
  function avisoSomenteLeitura() { S.aviso("Assinatura vencida/inativa: você pode ver e exportar, mas precisa renovar para registrar.", "erro", 6000); }
  function erro(e) {
    if (e && e.status === 402) avisoSomenteLeitura();
    else S.aviso(e && e.message ? e.message : "Não foi possível concluir a ação.", "erro", 6000);
  }
  function esc(v) { return S.esc(v ?? ""); }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function numero(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (v === undefined || v === null || v === "") return 0;
    return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
  }
  function arred(v) { return Math.round(numero(v) * 100) / 100; }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function chave(a, m) { return `${a}-${pad2(m)}`; }
  function rotMes(k) { return `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(0, 4)}`; }
  function pctBar(v, max) { const n = numero(v); return n > 0 && max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0; }
  function moeda(v) { return `<span class="num">${S.brl(v)}</span>`; }
  function pctTaxa(v) { return (numero(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %"; }
  function pctPercentual(v) { return numero(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %"; }
  function anoDeMes(ym) { return Number(String(ym || "").slice(0, 4)); }
  function anoDeData(d) { return Number(String(d || "").slice(0, 4)); }
  function somarDias(iso, dias) { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.ceil((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5); }
  function dataExcel(iso) { return iso ? new Date(String(iso).slice(0, 10) + "T12:00") : null; }
  function csvCampo(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
  function baixarBlob(blob, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function proximoAniversario(inicio, hoje) {
    const [, mes, dia] = inicio.split("-").map(Number);
    let ano = Number(hoje.slice(0, 4));
    let d = dataClamped(ano, mes, dia);
    if (d < hoje) d = dataClamped(ano + 1, mes, dia);
    return d;
  }
  function dataClamped(ano, mes, dia) {
    const ultimo = new Date(ano, mes, 0).getDate();
    return `${ano}-${pad2(mes)}-${pad2(Math.min(dia, ultimo))}`;
  }
  function mesesContratoNoAno(i, ano) {
    const inicio = i.inicio || `${ano}-01-01`;
    const fim = i.fim || `${ano}-12-31`;
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const iniMes = `${ano}-${pad2(m)}-01`;
      const fimMes = `${ano}-${pad2(m)}-${pad2(new Date(ano, m, 0).getDate())}`;
      if (fimMes >= inicio && iniMes <= fim) out.push(`${ano}-${pad2(m)}`);
    }
    return out;
  }

  function kpi(titulo, valor, detalhe = "", classe = "") {
    return `<div class="aluguel-kpi ${classe}"><small>${titulo}</small><b>${valor}</b>${detalhe ? `<small>${detalhe}</small>` : ""}</div>`;
  }
  function badgeStatus(st) {
    const cls = st.chave === "pago" ? "ok" : st.chave === "atraso" ? "bad" : st.chave === "parcial" ? "warn" : "neutro";
    return `<span class="aluguel-badge ${cls}">${st.rotulo}</span>`;
  }
  function acoesLinha(tipo, r, st) {
    if (!podeEditar()) return "";
    const pagar = tipo === "recebimento" && st && st.chave !== "pago" ? `<button class="aluguel-btn ok pequeno" data-pagar="${r.id}">Marcar pago</button>` : "";
    return `<div class="aluguel-acoes">${pagar}<button class="aluguel-btn sec pequeno" data-tipo="${tipo}" data-edit="${r.id}">Editar</button><button class="aluguel-btn perigo pequeno" data-tipo="${tipo}" data-delete="${r.id}">Excluir</button></div>`;
  }
  function tabela(headers, rows, numCols = []) {
    if (!rows.length) return `<div class="aluguel-vazio"><h3>Nenhum registro encontrado</h3><p>Use os botões desta seção para começar.</p></div>`;
    return `<div class="aluguel-tabela-wrap"><table class="aluguel-tabela"><thead><tr>${headers.map((h, idx) => `<th class="${numCols.includes(idx) ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((c, idx) => `<td class="${numCols.includes(idx) ? "num" : ""}" data-label="${headers[idx]}">${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function selectAno(id, valor) {
    const atual = new Date().getFullYear();
    const anos = [];
    for (let a = atual + 2; a >= atual - 5; a--) anos.push(a);
    return `<select id="${id}" class="aluguel-filtro">${anos.map(a => `<option value="${a}" ${Number(valor) === a ? "selected" : ""}>${a}</option>`).join("")}</select>`;
  }
  function selectImovel(id, valor, vazio, incluiGeral = false) {
    return `<select id="${id}" class="aluguel-filtro"><option value="">${vazio}</option>${incluiGeral ? `<option value="" ${valor === "" ? "selected" : ""}>Geral/sem imóvel</option>` : ""}${lista("imovel").map(i => `<option value="${i.id}" ${valor === i.id ? "selected" : ""}>${esc(nomeImovel(i))}</option>`).join("")}</select>`;
  }
  function selectImovelCampo(valor, obrig) {
    return `<div class="aluguel-campo"><label>Imóvel</label><select name="imovel_id" ${obrig ? "required" : ""}><option value="">${obrig ? "Selecione" : "Geral/sem imóvel"}</option>${lista("imovel").map(i => `<option value="${i.id}" ${valor === i.id ? "selected" : ""}>${esc(nomeImovel(i))}</option>`).join("")}</select></div>`;
  }
  function input(nome, label, valor, placeholder = "", classe = "", obrig = false, tipo = "text", inputmode = "") {
    return `<div class="aluguel-campo ${classe}"><label>${label}</label><input name="${nome}" type="${tipo}" value="${esc(valor ?? "")}" placeholder="${esc(placeholder)}" ${obrig ? "required" : ""} ${inputmode ? `inputmode="${inputmode}"` : ""}></div>`;
  }
  function textarea(nome, label, valor, classe = "") {
    return `<div class="aluguel-campo ${classe}"><label>${label}</label><textarea name="${nome}">${esc(valor ?? "")}</textarea></div>`;
  }
  function select(nome, label, opcoes, valor, rotulos, obrig = false) {
    return `<div class="aluguel-campo"><label>${label}</label><select name="${nome}" ${obrig ? "required" : ""}><option value="">Selecione</option>${opcoes.map(o => `<option value="${esc(o)}" ${valor === o ? "selected" : ""}>${esc(rotulos ? rotulos[o] : o)}</option>`).join("")}</select></div>`;
  }
})();
