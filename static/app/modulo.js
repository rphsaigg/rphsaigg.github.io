// Motor genérico dos módulos da área do assinante (MEI, Carro, Finanças…).
// Cada módulo chama SaiggModulo({...}) com: tipos de registro (campos, colunas, ações), abas e o painel.
// Visual e componentes reaproveitam aluguel.css (classes aluguel-*). Dados: API /dados/<slug> do Worker saigg-app.
(function () {
  const S = window.Saigg;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const REF = window.SAIGG_REF || {};

  window.SaiggModulo = function (cfg) {
    const hoje = S.hojeISO();
    const state = { aba: "painel", ano: +hoje.slice(0, 4), mes: hoje.slice(0, 7), dados: null, editor: null, filtros: {} };
    let root;

    // ------------------------------------------------------------ utilidades
    const esc = v => S.esc(v ?? "");
    const num = v => {
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (v === undefined || v === null || v === "") return 0;
      const s = String(v).trim().replace(/^R\$\s*/, "");
      if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, "")) || 0;   // "75.000" = 75 mil
      return Number(s) || 0;
    };
    const pad2 = n => String(n).padStart(2, "0");
    const lista = tipo => (state.dados && state.dados.registros[tipo]) || [];
    const registro = (tipo, id) => lista(tipo).find(r => r.id === id);
    const podeEditar = () => state.dados && !state.dados.somente_leitura;
    const somar = (arr, f) => arr.reduce((s, x) => s + num(typeof f === "function" ? f(x) : x[f]), 0);
    const anoDe = v => +String(v || "").slice(0, 4);
    const somarMeses = (iso, n) => { const d = new Date(iso + "T12:00"); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
    const diasEntre = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
    const campoDe = (tipo, nome) => cfg.tipos[tipo].campos.find(c => c.n === nome);
    const nomeRef = (tipo, id) => { const r = registro(tipo, id); return r ? (cfg.tipos[tipo].nome ? cfg.tipos[tipo].nome(r) : r.nome || r.apelido || "—") : ""; };
    const pctBar = (v, max) => { const n = num(v); return n > 0 && max > 0 ? Math.max(2, Math.min(100, Math.round((n / max) * 100))) : 0; };

    function formatar(c, v) {
      if (v === undefined || v === null || v === "") return "—";
      switch (c.t) {
        case "moeda": return `<span class="num">${S.brl(v)}</span>`;
        case "numero": return `<span class="num">${num(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${c.sufixo || ""}</span>`;
        case "pct": return `<span class="num">${num(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} %</span>`;
        case "data": return S.dataBR(v);
        case "mes": return S.mesBR(v);
        case "bool": return v ? "Sim" : "Não";
        case "ref": return esc(nomeRef(c.ref, v)) || "—";
        default: return esc(v);
      }
    }

    // ------------------------------------------------------------ componentes
    const kpi = (titulo, valor, detalhe = "", classe = "") =>
      `<div class="aluguel-kpi ${classe}"><small>${titulo}</small><b>${valor}</b>${detalhe ? `<small>${detalhe}</small>` : ""}</div>`;
    const badge = (txt, cls = "neutro") => `<span class="aluguel-badge ${cls}">${esc(txt)}</span>`;
    const bloco = (titulo, sub, html) =>
      `<div class="aluguel-bloco"><div class="aluguel-bloco-cab"><div><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ""}</div></div>${html}</div>`;
    function tabela(headers, rows, numCols = [], vazio = "Nenhum registro encontrado") {
      if (!rows.length) return `<p class="aluguel-mutado">${vazio}.</p>`;
      return `<div class="aluguel-tabela-wrap"><table class="aluguel-tabela"><thead><tr>${headers.map((h, i) => `<th class="${numCols.includes(i) ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((c, i) => `<td class="${numCols.includes(i) ? "num" : ""}" data-label="${headers[i]}">${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    /** Barras horizontais: itens [{rotulo, valor, max?, detalhe?, classe?}] */
    function barras(itens) {
      const max = Math.max(1, ...itens.map(i => num(i.max ?? i.valor)));
      return `<div class="aluguel-grafico">${itens.map(i => `<div class="aluguel-barra-linha"><span>${esc(i.rotulo)}</span><div class="aluguel-barras"><span class="aluguel-barra ${i.classe || "recebido"}"><i style="width:${pctBar(i.valor, i.max ?? max)}%"></i></span></div><strong>${i.detalhe ?? S.brl(i.valor)}</strong></div>`).join("")}</div>`;
    }
    function selectAno(id, valor) {
      const a0 = +hoje.slice(0, 4), anos = [];
      for (let a = a0 + 1; a >= a0 - 5; a--) anos.push(a);
      return `<select id="${id}" class="aluguel-filtro">${anos.map(a => `<option value="${a}" ${+valor === a ? "selected" : ""}>${a}</option>`).join("")}</select>`;
    }
    function selectMes(id, valor) {
      const out = [];
      let d = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7), 1);
      for (let i = 0; i < 25; i++) { d.setMonth(d.getMonth() - 1); const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; out.push(k); }
      return `<select id="${id}" class="aluguel-filtro">${out.map(k => `<option value="${k}" ${valor === k ? "selected" : ""}>${S.mesBR(k)}</option>`).join("")}</select>`;
    }

    const ctx = { state, lista, registro, num, somar, esc, kpi, badge, bloco, tabela, barras, selectAno, selectMes, formatar,
                  anoDe, somarMeses, diasEntre, nomeRef, pad2, MESES, REF, hoje, brl: S.brl, dataBR: S.dataBR, mesBR: S.mesBR, podeEditar };

    // ------------------------------------------------------------ dados
    async function carregar() {
      const d = await S.api(`/dados/${cfg.slug}`);
      for (const t of Object.keys(cfg.tipos)) d.registros[t] = d.registros[t] || [];
      state.dados = d;
    }

    function paraAPI(tipo, bruto) {
      const out = {};
      for (const c of cfg.tipos[tipo].campos) {
        let v = bruto[c.n];
        if (c.t === "bool") { out[c.n] = v === true || v === "true" || v === "on"; continue; }
        if (v === undefined || v === null || v === "") continue;
        if (["moeda", "numero", "pct"].includes(c.t)) v = num(v);
        out[c.n] = v;
      }
      return out;
    }

    async function salvar(tipo, id, dados) {
      if (!podeEditar()) return somenteLeitura();
      await S.api(`/dados/${cfg.slug}/${tipo}${id ? `/${id}` : ""}`, { metodo: id ? "PUT" : "POST", corpo: paraAPI(tipo, dados) });
    }
    ctx.salvar = salvar;
    ctx.recarregar = async () => { await carregar(); render(); };

    function somenteLeitura() { S.aviso("Assinatura vencida ou inativa: você pode ver e exportar, mas precisa renovar para registrar.", "erro", 6000); }
    function erro(e) { if (e && e.status === 402) somenteLeitura(); else S.aviso(e && e.message ? e.message : "Não foi possível concluir a ação.", "erro", 6000); }

    // ------------------------------------------------------------ render
    function render() {
      if (!state.dados) return;
      const p = cfg.primeiro;
      const vazio = p && !lista(p.tipo).length && !state.editor;
      root.innerHTML = `
        <div class="aluguel-hero">
          <div class="aluguel-topo">
            <div><span class="aluguel-selo">Área do assinante · ${esc(cfg.nome)}</span><h1>${cfg.titulo}</h1><p>${cfg.subtitulo}</p></div>
            <div class="aluguel-acoes"><a class="aluguel-btn sec" href="/app/">Minha assinatura</a>
              ${podeEditar() && cfg.botaoTopo ? `<button class="aluguel-btn primario" data-new="${cfg.botaoTopo.tipo}">${cfg.botaoTopo.texto}</button>` : ""}</div>
          </div>
          ${renderStatus()}
        </div>
        <nav class="aluguel-abas" aria-label="Seções do módulo">${cfg.abas.map(([id, nome]) => `<button class="aluguel-aba ${state.aba === id ? "ativa" : ""}" data-tab="${id}">${nome}</button>`).join("")}</nav>
        <div class="aluguel-corpo">
          ${vazio ? `<div class="aluguel-vazio"><h2>${p.titulo}</h2><p>${p.texto}</p>${podeEditar() ? `<button class="aluguel-btn primario" data-new="${p.tipo}">${p.botao}</button>` : `<a class="aluguel-btn primario" href="/app/">Renovar para começar</a>`}</div>` : ""}
          ${renderEditor()}
          ${renderAba()}
        </div>`;
    }

    function renderStatus() {
      const d = state.dados;
      if (d.somente_leitura) return `<div class="aluguel-status vencida"><div><b>${d.expira_em ? "Assinatura vencida" : "Módulo não assinado"}</b><small>${d.expira_em ? "Você pode ver e baixar seus dados; para registrar, renove." : "Assine o módulo para começar a registrar."}</small></div><a class="aluguel-btn sec" href="/app/">${d.expira_em ? "Renovar" : "Assinar"}</a></div>`;
      if (d.acesso_total) return `<div class="aluguel-status"><div><b>Acesso total</b><small>Liberado pela chave de acesso. Você pode cadastrar, editar e exportar.</small></div></div>`;
      const dias = d.expira_em ? S.diasAte(d.expira_em) : null;
      return `<div class="aluguel-status${dias !== null && dias <= 7 ? " atencao" : ""}"><div><b>Assinatura ativa${d.expira_em ? ` até ${S.dataBR(d.expira_em)}` : ""}</b><small>${dias !== null && dias <= 7 ? `Faltam ${dias} dia(s). Renove para continuar registrando.` : "Você pode cadastrar, editar e exportar seus dados."}</small></div>${dias !== null && dias <= 7 ? `<a class="aluguel-btn sec" href="/app/">Renovar</a>` : ""}</div>`;
    }

    function renderAba() {
      if (state.aba === "painel") return cfg.painel(ctx);
      if (state.aba === "exportar") return renderExportar();
      return renderLista(state.aba);
    }

    function filtrar(tipo) {
      const T = cfg.tipos[tipo], f = state.filtros[tipo] || {};
      let rs = lista(tipo).slice();
      if (T.dataCampo && f.ano) rs = rs.filter(r => anoDe(r[T.dataCampo]) === +f.ano);
      const refC = T.campos.find(c => c.t === "ref");
      if (refC && f.ref) rs = rs.filter(r => r[refC.n] === f.ref);
      if (T.ordem) rs.sort(T.ordem);
      else if (T.dataCampo) rs.sort((a, b) => String(b[T.dataCampo] || "").localeCompare(String(a[T.dataCampo] || "")));
      return rs;
    }

    function renderLista(tipo) {
      const T = cfg.tipos[tipo];
      if (!state.filtros[tipo]) state.filtros[tipo] = { ano: T.dataCampo ? state.ano : "", ref: "" };
      const f = state.filtros[tipo];
      const refC = T.campos.find(c => c.t === "ref");
      const rs = filtrar(tipo);
      const cols = T.colunas.map(n => typeof n === "string" ? campoDe(tipo, n) : n);
      const numCols = cols.map((c, i) => (["moeda", "numero", "pct"].includes(c.t) || c.num) ? i : -1).filter(i => i >= 0);
      const linhas = rs.map(r => [...cols.map(c => c.v ? c.v(r, ctx) : formatar(c, r[c.n])), acoes(tipo, r)]);
      return `<section>
        <div class="aluguel-toolbar">
          <div><h2>${T.plural}</h2>${T.ajuda ? `<p>${T.ajuda}</p>` : ""}</div>
          <div class="aluguel-acoes">
            ${refC ? `<select class="aluguel-filtro" data-filtro-ref="${tipo}"><option value="">Todos</option>${lista(refC.ref).map(x => `<option value="${x.id}" ${f.ref === x.id ? "selected" : ""}>${esc(nomeRef(refC.ref, x.id))}</option>`).join("")}</select>` : ""}
            ${T.dataCampo ? `<select class="aluguel-filtro" data-filtro-ano="${tipo}"><option value="">Todos os anos</option>${selectAno("x", f.ano).replace(/^<select[^>]*>|<\/select>$/g, "")}</select>` : ""}
            ${podeEditar() && T.gerar ? `<button class="aluguel-btn sec" data-gerar="${tipo}">${T.gerar.rotulo}</button>` : ""}
            ${podeEditar() ? `<button class="aluguel-btn primario" data-new="${tipo}">Novo ${T.titulo}</button>` : ""}
          </div>
        </div>
        ${T.resumo ? T.resumo(rs, ctx) : ""}
        ${tabela([...cols.map(c => c.r), ""], linhas, numCols, `Nenhum ${T.titulo} ${f.ano ? "em " + f.ano : "cadastrado"}`)}
      </section>`;
    }

    function acoes(tipo, r) {
      if (!podeEditar()) return "";
      const T = cfg.tipos[tipo];
      const extra = (T.acoes || []).filter(a => !a.mostrar || a.mostrar(r, ctx)).map((a, i) => `<button class="aluguel-btn ok pequeno" data-acao="${i}" data-tipo="${tipo}" data-id="${r.id}">${a.rotulo}</button>`).join("");
      return `<div class="aluguel-acoes">${extra}<button class="aluguel-btn sec pequeno" data-edit="${r.id}" data-tipo="${tipo}">Editar</button><button class="aluguel-btn perigo pequeno" data-delete="${r.id}" data-tipo="${tipo}">Excluir</button></div>`;
    }

    // ------------------------------------------------------------ editor
    function renderEditor() {
      if (!state.editor) return "";
      const { tipo, id } = state.editor, T = cfg.tipos[tipo];
      const r = { ...(id ? registro(tipo, id) : novoPadrao(tipo)), ...(state.editor.dados || {}) };
      return `<section class="aluguel-editor"><h3>${id ? "Editar" : "Novo"} ${T.titulo}</h3>
        <form data-modulo-form data-tipo="${tipo}" data-id="${id || ""}">
          <div class="aluguel-form-grid">${T.campos.map(c => campo(c, r[c.n])).join("")}</div>
          <div class="aluguel-form-acoes"><button type="button" class="aluguel-btn sec" data-fechar>Cancelar</button><button type="submit" class="aluguel-btn primario">Salvar</button></div>
        </form></section>`;
    }

    function novoPadrao(tipo) {
      const out = {};
      for (const c of cfg.tipos[tipo].campos) {
        if (c.padrao !== undefined) out[c.n] = typeof c.padrao === "function" ? c.padrao(ctx) : c.padrao;
        else if (c.t === "data" && c.obrig) out[c.n] = hoje;
        else if (c.t === "mes" && c.obrig) out[c.n] = hoje.slice(0, 7);
        else if (c.t === "ref") { const f = state.filtros[tipo]; out[c.n] = (f && f.ref) || (lista(c.ref).length === 1 ? lista(c.ref)[0].id : ""); }
      }
      return out;
    }

    function campo(c, v) {
      const cls = c.span ? `span-${c.span}` : "", req = c.obrig ? "required" : "", lab = `<label>${c.r}${c.obrig ? " *" : ""}</label>`;
      const dica = c.dica ? `<small>${c.dica}</small>` : "";
      if (c.t === "bool") return `<label class="aluguel-check ${cls}"><input type="checkbox" name="${c.n}" ${v ? "checked" : ""}> ${c.r}</label>`;
      if (c.t === "textarea") return `<div class="aluguel-campo ${cls || "span-3"}">${lab}<textarea name="${c.n}">${esc(v)}</textarea></div>`;
      if (c.t === "enum") return `<div class="aluguel-campo ${cls}">${lab}<select name="${c.n}" ${req}><option value="">Selecione</option>${c.o.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${dica}</div>`;
      if (c.t === "ref") return `<div class="aluguel-campo ${cls}">${lab}<select name="${c.n}" ${req}><option value="">${c.obrig ? "Selecione" : "Nenhum"}</option>${lista(c.ref).map(x => `<option value="${x.id}" ${v === x.id ? "selected" : ""}>${esc(nomeRef(c.ref, x.id))}</option>`).join("")}</select>${dica}</div>`;
      const tipoInput = { data: "date", mes: "month" }[c.t] || "text";
      const modo = ["moeda", "numero", "pct"].includes(c.t) ? `inputmode="decimal"` : "";
      const val = ["moeda", "numero", "pct"].includes(c.t) && v !== undefined && v !== "" ? String(v).replace(".", ",") : (v ?? "");
      return `<div class="aluguel-campo ${cls}">${lab}<input name="${c.n}" type="${tipoInput}" value="${esc(val)}" placeholder="${esc(c.ph || (c.t === "moeda" ? "0,00" : ""))}" ${req} ${modo}>${dica}</div>`;
    }

    // ------------------------------------------------------------ exportar
    function renderExportar() {
      return `<section>
        <div class="aluguel-toolbar"><div><h2>Exportar</h2><p>Baixe seus dados quando quiser. A exportação continua liberada mesmo com a assinatura vencida.</p></div></div>
        <div class="aluguel-exporta"><div class="aluguel-exporta-card"><h3>Excel completo (.xlsx)</h3>
          <p>Uma aba de resumo e uma aba para cada tipo de registro (${Object.values(cfg.tipos).map(t => t.plural.toLowerCase()).join(", ")}), com valores em reais e datas formatadas.</p>
          <button class="aluguel-btn primario" data-exportar>Baixar tudo em Excel</button></div></div>
      </section>`;
    }

    async function exportar(botao) {
      if (!window.ExcelJS) { S.aviso("O gerador de Excel ainda está carregando. Tente de novo em alguns segundos.", "erro"); return; }
      const txt = botao.textContent; botao.disabled = true; botao.textContent = "Gerando…";
      try {
        const wb = new ExcelJS.Workbook(); wb.creator = "Saigg Digital"; wb.created = new Date();
        const cab = row => { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B6B56" } }; };
        const res = wb.addWorksheet("Resumo");
        res.addRow([`${cfg.nome} — exportado em ${S.dataBR(hoje)}`]); res.getRow(1).font = { bold: true, size: 14 };
        res.addRow([]);
        (cfg.resumoExcel ? cfg.resumoExcel(ctx) : []).forEach(l => {
          const row = res.addRow(l);
          // valores em reais, exceto linhas marcadas como contagem/ano/percentual pelo rótulo
          if (typeof l[1] === "number" && !/^(ano|consumo|km|lançamentos|quantidade|meta)/i.test(l[0])) row.getCell(2).numFmt = '"R$" #,##0.00';
        });
        res.getColumn(1).width = 38; res.getColumn(2).width = 18;
        for (const [tipo, T] of Object.entries(cfg.tipos)) {
          const ws = wb.addWorksheet(T.plural.slice(0, 30));
          ws.addRow(T.campos.map(c => c.r)); cab(ws.getRow(1)); ws.views = [{ state: "frozen", ySplit: 1 }];
          lista(tipo).forEach(r => ws.addRow(T.campos.map(c => {
            const v = r[c.n];
            if (v === undefined || v === null || v === "") return null;
            if (c.t === "data") return new Date(v + "T12:00");
            if (["moeda", "numero", "pct"].includes(c.t)) return num(v);
            if (c.t === "bool") return v ? "Sim" : "Não";
            if (c.t === "ref") return nomeRef(c.ref, v);
            return v;
          })));
          T.campos.forEach((c, i) => {
            const col = ws.getColumn(i + 1); col.width = c.t === "textarea" ? 36 : 16;
            if (c.t === "moeda") col.numFmt = '"R$" #,##0.00';
            if (c.t === "data") col.numFmt = "dd/mm/yyyy";
          });
        }
        const buf = await wb.xlsx.writeBuffer();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        a.download = `Saigg-${cfg.nome.split(" ")[0]}-${hoje}.xlsx`; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        S.aviso("Excel gerado.");
      } finally { botao.disabled = false; botao.textContent = txt; }
    }

    // ------------------------------------------------------------ eventos
    function ligar() {
      root.addEventListener("click", async ev => {
        const el = ev.target.closest("[data-tab],[data-new],[data-edit],[data-delete],[data-fechar],[data-acao],[data-gerar],[data-exportar],[data-ir]");
        if (!el) return;
        ev.preventDefault();
        try {
          if (el.dataset.tab) { state.aba = el.dataset.tab; state.editor = null; render(); window.scrollTo({ top: root.offsetTop - 80, behavior: "smooth" }); return; }
          if (el.dataset.ir) { state.aba = el.dataset.ir; state.editor = null; render(); return; }
          if (el.dataset.new) {
            if (!podeEditar()) return somenteLeitura();
            if (cfg.tipos[el.dataset.new] && state.aba !== el.dataset.new && state.aba !== "painel") state.aba = el.dataset.new;
            state.editor = { tipo: el.dataset.new, id: null }; render(); root.querySelector(".aluguel-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
          }
          if (el.dataset.edit) { state.editor = { tipo: el.dataset.tipo, id: el.dataset.edit }; render(); root.querySelector(".aluguel-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
          if (el.dataset.fechar !== undefined) { state.editor = null; render(); return; }
          if (el.dataset.delete) {
            const T = cfg.tipos[el.dataset.tipo];
            if (!confirm(T.aviso_excluir || `Excluir este ${T.titulo}?`)) return;
            const r = await S.api(`/dados/${cfg.slug}/${el.dataset.tipo}/${el.dataset.delete}`, { metodo: "DELETE" });
            await carregar(); state.editor = null; render();
            S.aviso(r.dependentes_excluidos ? `Excluído, junto com ${r.dependentes_excluidos} registro(s) vinculado(s).` : "Registro excluído.");
            return;
          }
          if (el.dataset.acao) {
            const T = cfg.tipos[el.dataset.tipo], a = T.acoes[+el.dataset.acao], r = registro(el.dataset.tipo, el.dataset.id);
            await salvar(el.dataset.tipo, r.id, { ...r, ...a.aplicar(r, ctx) });
            await carregar(); render(); S.aviso(a.feito || "Atualizado."); return;
          }
          if (el.dataset.gerar) {
            const T = cfg.tipos[el.dataset.gerar];
            const novos = T.gerar.registros(ctx, state.filtros[el.dataset.gerar] || {});
            if (!novos.length) { S.aviso(T.gerar.nada || "Nada a gerar."); return; }
            el.disabled = true;
            for (const n of novos) await salvar(el.dataset.gerar, null, n);
            await carregar(); render(); S.aviso(`${novos.length} registro(s) criado(s).`); return;
          }
          if (el.dataset.exportar !== undefined) { await exportar(el); return; }
        } catch (e) { erro(e); await carregar().then(render).catch(() => {}); }
      });
      root.addEventListener("change", ev => {
        const el = ev.target;
        if (el.id === "painel-ano") { state.ano = +el.value; render(); }
        if (el.id === "painel-mes") { state.mes = el.value; render(); }
        if (el.dataset.filtroAno) { state.filtros[el.dataset.filtroAno].ano = el.value; render(); }
        if (el.dataset.filtroRef) { state.filtros[el.dataset.filtroRef].ref = el.value; render(); }
        if (el.dataset.painelRef !== undefined) { state.painelRef = el.value; render(); }
      });
      root.addEventListener("submit", async ev => {
        if (!ev.target.matches("[data-modulo-form]")) return;
        ev.preventDefault();
        const f = ev.target, tipo = f.dataset.tipo, id = f.dataset.id || null;
        const b = f.querySelector("[type=submit]"); b.disabled = true;
        try {
          await salvar(tipo, id, { ...(id ? registro(tipo, id) : {}), ...lerForm(f, tipo) });
          S.aviso(`${cfg.tipos[tipo].titulo[0].toUpperCase() + cfg.tipos[tipo].titulo.slice(1)} salvo.`);
          await carregar(); state.editor = null; render();
        } catch (e) { erro(e); b.disabled = false; }
      });
    }

    function lerForm(form, tipo) {
      const o = {};
      for (const c of cfg.tipos[tipo].campos) {
        const el = form.querySelector(`[name="${c.n}"]`);   // não usar form.elements[nome]: "item" colide com o método item()
        if (!el) continue;
        o[c.n] = c.t === "bool" ? el.checked : el.value;
      }
      return o;
    }

    document.addEventListener("DOMContentLoaded", async () => {
      root = document.getElementById("modulo-app");
      ligar();
      try { await S.exigirLogin(); await carregar(); render(); }
      catch (e) { root.innerHTML = `<div class="aluguel-erro">Não foi possível carregar seus dados: ${esc(e.message || e)}</div>`; }
    });
  };
})();
