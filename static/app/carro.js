// Módulo Carro: abastecimentos com consumo real, gastos, custo por mês e por km, e agenda de manutenção.
(function () {
  const CATEG = ["Manutenção", "Pneus", "Seguro", "IPVA", "Licenciamento", "Multa", "Estacionamento", "Pedágio", "Lavagem", "Financiamento", "Outros"];
  const ITENS = "Troca de óleo e filtro, Revisão, Pneus (rodízio), Pastilhas de freio, Correia dentada, Filtro de ar, Bateria";

  const doVeiculo = (c, tipo, vid) => c.lista(tipo).filter(r => r.veiculo_id === vid);
  function kmAtual(c, v) {
    return Math.max(c.num(v.km_inicial), ...doVeiculo(c, "abastecimento", v.id).map(a => c.num(a.km)), ...doVeiculo(c, "gasto", v.id).map(g => c.num(g.km)), 0);
  }
  function consumo(c, vid) {
    const ab = doVeiculo(c, "abastecimento", vid).filter(a => a.combustivel !== "Recarga elétrica").sort((a, b) => a.km - b.km);
    if (ab.length < 2) return null;
    const litros = c.somar(ab.slice(1), "litros");
    return litros > 0 ? (ab.at(-1).km - ab[0].km) / litros : null;
  }
  function kmNoAno(c, vid, ano) {
    const ab = doVeiculo(c, "abastecimento", vid).sort((a, b) => a.km - b.km);
    const doAno = ab.filter(a => c.anoDe(a.data) === ano);
    if (!doAno.length) return 0;
    const antes = ab.filter(a => c.anoDe(a.data) < ano).at(-1);
    return doAno.at(-1).km - (antes ? antes.km : doAno[0].km);
  }
  function situacao(c, m, v) {
    const km = kmAtual(c, v);
    const proxKm = m.a_cada_km && m.ultimo_km !== undefined ? c.num(m.ultimo_km) + c.num(m.a_cada_km) : null;
    const proxData = m.a_cada_meses && m.ultima_data ? c.somarMeses(m.ultima_data, c.num(m.a_cada_meses)) : null;
    const faltaKm = proxKm !== null ? proxKm - km : null, faltaDias = proxData ? c.diasEntre(c.hoje, proxData) : null;
    const vencida = (faltaKm !== null && faltaKm < 0) || (faltaDias !== null && faltaDias < 0);
    const perto = !vencida && ((faltaKm !== null && faltaKm <= 1000) || (faltaDias !== null && faltaDias <= 30));
    const partes = [];
    if (proxKm !== null) partes.push(faltaKm < 0 ? `passou ${(-faltaKm).toLocaleString("pt-BR")} km` : `em ${faltaKm.toLocaleString("pt-BR")} km`);
    if (proxData) partes.push(faltaDias < 0 ? `venceu em ${c.dataBR(proxData)}` : `até ${c.dataBR(proxData)}`);
    return { vencida, perto, texto: partes.join(" · ") || "defina o intervalo", proxKm, proxData };
  }

  SaiggModulo({
    slug: "carro",
    nome: "Carro",
    titulo: "Quanto o seu carro custa de verdade",
    subtitulo: "Abastecimentos com consumo real, todos os gastos, custo por mês e por km, e a próxima revisão antes de vencer.",
    botaoTopo: { tipo: "abastecimento", texto: "Registrar abastecimento" },
    primeiro: { tipo: "veiculo", titulo: "Cadastre seu veículo", texto: "Depois registre os abastecimentos (com a quilometragem do painel) e os gastos. O consumo, o custo por km e a agenda de manutenção são calculados sozinhos.", botao: "Cadastrar veículo" },
    abas: [["painel", "Painel"], ["abastecimento", "Abastecimentos"], ["gasto", "Gastos"], ["manutencao", "Manutenção"], ["veiculo", "Veículos"], ["exportar", "Exportar"]],
    tipos: {
      veiculo: {
        titulo: "veículo", plural: "Veículos", nome: v => v.apelido,
        aviso_excluir: "Excluir este veículo? Abastecimentos, gastos e itens de manutenção dele também serão apagados.",
        campos: [
          { n: "apelido", r: "Apelido", t: "texto", obrig: true, ph: "Ex.: Onix prata" },
          { n: "modelo", r: "Modelo", t: "texto", ph: "Ex.: Chevrolet Onix 1.0 LT" },
          { n: "ano", r: "Ano", t: "numero" },
          { n: "placa", r: "Placa", t: "texto" },
          { n: "combustivel", r: "Combustível", t: "enum", o: ["Flex", "Gasolina", "Etanol", "Diesel", "Elétrico", "Híbrido"] },
          { n: "valor_fipe", r: "Valor (FIPE) (R$)", t: "moeda", dica: "para estimar a depreciação" },
          { n: "km_inicial", r: "Km atual no cadastro", t: "numero" },
          { n: "ativo", r: "Em uso", t: "bool", padrao: true },
        ],
        colunas: ["apelido", "modelo", "ano", "placa", "valor_fipe", { r: "Km atual", num: true, v: (v, c) => `<span class="num">${kmAtual(c, v).toLocaleString("pt-BR")}</span>` }],
      },
      abastecimento: {
        titulo: "abastecimento", plural: "Abastecimentos", dataCampo: "data",
        ajuda: "Anote a quilometragem do painel a cada abastecimento: é com ela que o consumo real é calculado.",
        ordem: (a, b) => b.data.localeCompare(a.data) || b.km - a.km,
        campos: [
          { n: "veiculo_id", r: "Veículo", t: "ref", ref: "veiculo", obrig: true },
          { n: "data", r: "Data", t: "data", obrig: true },
          { n: "km", r: "Km no painel", t: "numero", obrig: true },
          { n: "litros", r: "Litros (ou kWh)", t: "numero", obrig: true },
          { n: "valor", r: "Valor pago (R$)", t: "moeda", obrig: true },
          { n: "combustivel", r: "Combustível", t: "enum", o: ["Gasolina", "Etanol", "Diesel", "GNV", "Recarga elétrica"] },
          { n: "tanque_cheio", r: "Completei o tanque", t: "bool", padrao: true },
        ],
        colunas: ["data", "veiculo_id", "km", "litros", "combustivel", { r: "R$/litro", num: true, v: (a, c) => a.litros ? `<span class="num">${c.brl(a.valor / a.litros)}</span>` : "—" }, "valor"],
      },
      gasto: {
        titulo: "gasto", plural: "Gastos", dataCampo: "data",
        ajuda: "Seguro, IPVA, manutenção, pneus, estacionamento, pedágio, multas, parcela do financiamento…",
        campos: [
          { n: "veiculo_id", r: "Veículo", t: "ref", ref: "veiculo", obrig: true },
          { n: "data", r: "Data", t: "data", obrig: true },
          { n: "categoria", r: "Categoria", t: "enum", o: CATEG, obrig: true },
          { n: "descricao", r: "Descrição", t: "texto", span: 2 },
          { n: "valor", r: "Valor (R$)", t: "moeda", obrig: true },
          { n: "km", r: "Km no painel", t: "numero" },
        ],
        colunas: ["data", "veiculo_id", "categoria", "descricao", "valor"],
      },
      manutencao: {
        titulo: "item de manutenção", plural: "Manutenção",
        ajuda: `Itens com intervalo por km e/ou por tempo (ex.: ${ITENS}). Ao fazer o serviço, use “Feito hoje”.`,
        ordem: (a, b) => a.item.localeCompare(b.item),
        campos: [
          { n: "veiculo_id", r: "Veículo", t: "ref", ref: "veiculo", obrig: true },
          { n: "item", r: "Item", t: "texto", obrig: true, ph: "Ex.: Troca de óleo e filtro" },
          { n: "a_cada_km", r: "A cada (km)", t: "numero", ph: "10000" },
          { n: "a_cada_meses", r: "A cada (meses)", t: "numero", ph: "12" },
          { n: "ultima_data", r: "Última vez (data)", t: "data" },
          { n: "ultimo_km", r: "Última vez (km)", t: "numero" },
          { n: "obs", r: "Observações", t: "textarea" },
        ],
        colunas: ["item", "veiculo_id", { r: "Próxima", v: (m, c) => situacao(c, m, c.registro("veiculo", m.veiculo_id) || {}).texto },
                  { r: "Situação", v: (m, c) => { const s = situacao(c, m, c.registro("veiculo", m.veiculo_id) || {}); return s.vencida ? c.badge("Vencida", "bad") : s.perto ? c.badge("Em breve", "warn") : c.badge("Em dia", "ok"); } }],
        acoes: [{ rotulo: "Feito hoje", aplicar: (m, c) => ({ ultima_data: c.hoje, ultimo_km: kmAtual(c, c.registro("veiculo", m.veiculo_id) || {}) }), feito: "Manutenção registrada. A próxima foi recalculada." }],
      },
    },

    painel(c) {
      const vs = c.lista("veiculo");
      if (!vs.length) return "";
      const v = vs.find(x => x.id === c.state.painelRef) || vs.find(x => x.ativo !== false) || vs[0];
      const ano = c.state.ano;
      const ab = doVeiculo(c, "abastecimento", v.id).filter(a => c.anoDe(a.data) === ano);
      const gs = doVeiculo(c, "gasto", v.id).filter(g => c.anoDe(g.data) === ano);
      const comb = c.somar(ab, "valor"), outros = c.somar(gs, "valor"), total = comb + outros;
      const km = kmNoAno(c, v.id, ano), kml = consumo(c, v.id);
      // meses com uso no ano: do primeiro registro até o mês atual (ou dezembro, em anos passados)
      const primeiro = [...ab, ...gs].map(x => x.data).sort()[0];
      const mesFim = ano === +c.hoje.slice(0, 4) ? +c.hoje.slice(5, 7) : 12;
      const mesesDecorridos = primeiro ? Math.max(1, mesFim - +primeiro.slice(5, 7) + 1) : 1;
      const depMes = c.num(v.valor_fipe) * 0.10 / 12;
      const manut = doVeiculo(c, "manutencao", v.id).map(m => ({ m, s: situacao(c, m, v) })).filter(x => x.s.vencida || x.s.perto);
      const porCat = { Combustível: comb };
      gs.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + c.num(g.valor); });
      const meses = c.MESES.map((nome, i) => {
        const k = `${ano}-${c.pad2(i + 1)}`;
        const cb = c.somar(ab.filter(a => a.data.slice(0, 7) === k), "valor"), ou = c.somar(gs.filter(g => g.data.slice(0, 7) === k), "valor");
        return [nome, `<span class="num">${c.brl(cb)}</span>`, `<span class="num">${c.brl(ou)}</span>`, `<span class="num">${c.brl(cb + ou)}</span>`];
      });
      return `<section>
        <div class="aluguel-toolbar"><div><h2>Painel do ano</h2><p>${c.esc(v.apelido)}${v.modelo ? " · " + c.esc(v.modelo) : ""} · ${kmAtual(c, v).toLocaleString("pt-BR")} km</p></div>
          <div class="aluguel-acoes">
            ${vs.length > 1 ? `<select class="aluguel-filtro" data-painel-ref>${vs.map(x => `<option value="${x.id}" ${x.id === v.id ? "selected" : ""}>${c.esc(x.apelido)}</option>`).join("")}</select>` : ""}
            ${c.selectAno("painel-ano", ano)}
          </div></div>
        <div class="aluguel-kpis">
          ${c.kpi("Gasto no ano", c.brl(total), `${c.brl(total / mesesDecorridos)} por mês`)}
          ${c.kpi("Custo por km", km ? c.brl(total / km) : "—", km ? `${km.toLocaleString("pt-BR")} km rodados no ano` : "registre 2+ abastecimentos")}
          ${c.kpi("Consumo médio", kml ? `${kml.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/l` : "—", kml ? "calculado pela quilometragem" : "precisa de 2+ abastecimentos")}
          ${c.kpi("Com depreciação", depMes ? c.brl(total / mesesDecorridos + depMes) : "—", depMes ? `por mês (estimativa de 10% ao ano sobre a FIPE)` : "informe o valor FIPE no veículo")}
        </div>
        ${manut.length ? `<div class="aluguel-status ${manut.some(x => x.s.vencida) ? "vencida" : "atencao"}"><div><b>${manut.length} manutenção(ões) ${manut.some(x => x.s.vencida) ? "vencida(s) ou próxima(s)" : "chegando"}</b><small>${manut.map(x => `${c.esc(x.m.item)} (${x.s.texto})`).join(" · ")}</small></div><button class="aluguel-btn sec" data-ir="manutencao">Ver agenda</button></div>` : ""}
        ${c.bloco("Para onde vai o dinheiro", `Gastos de ${ano} por categoria.`, total ? c.barras(Object.entries(porCat).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([k, x]) => ({ rotulo: k, valor: x, classe: k === "Combustível" ? "recebido" : "gasto" }))) : `<p class="aluguel-mutado">Nenhum gasto registrado em ${ano}.</p>`)}
        ${c.bloco("Mês a mês", "Combustível e demais gastos.", c.tabela(["Mês", "Combustível", "Outros gastos", "Total"], meses, [1, 2, 3]))}
      </section>`;
    },

    resumoExcel(c) {
      const ano = c.state.ano;
      return c.lista("veiculo").flatMap(v => {
        const t = c.somar(doVeiculo(c, "abastecimento", v.id).filter(a => c.anoDe(a.data) === ano), "valor") + c.somar(doVeiculo(c, "gasto", v.id).filter(g => c.anoDe(g.data) === ano), "valor");
        const km = kmNoAno(c, v.id, ano), kml = consumo(c, v.id);
        return [[v.apelido, ""], [`Gasto total em ${ano}`, t], [`Km rodados em ${ano}`, km], ["Custo por km", km ? t / km : 0], ["Consumo médio (km/l)", kml ? Math.round(kml * 10) / 10 : 0], []];
      });
    },
  });
})();
