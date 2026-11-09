/* Bairro Ideal — cartão compartilhável (imagem 1080×1350 desenhada no navegador, sem enviar nada a servidor).
   BICartao.compartilhar({ titulo, subtitulo, nota, itens: [[rótulo, valor], …], destaque, url }) → abre o compartilhamento do celular
   (com a imagem) ou baixa o PNG. Usado em /meu-endereco/, nas páginas de bairro e em /onde-abrir-negocio/. */
(function () {
  "use strict";
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];

  function quebra(ctx, txt, largura, max) {
    const linhas = []; let atual = "";
    for (const w of String(txt).split(/\s+/)) {
      const t = atual ? atual + " " + w : w;
      if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = w; } else atual = t;
    }
    if (atual) linhas.push(atual);
    if (linhas.length > max) { linhas.length = max; linhas[max - 1] = linhas[max - 1].replace(/\s*\S*$/, "") + "…"; }
    return linhas;
  }

  function desenhar(o) {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), fonte = "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0b6b56"); g.addColorStop(1, "#0a4a3c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.beginPath(); ctx.arc(W - 120, 160, 300, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 34px ${fonte}`; ctx.textBaseline = "alphabetic";
    ctx.fillText("Bairro Ideal", 80, 110);
    ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `500 28px ${fonte}`; ctx.fillText("dados oficiais, bairro a bairro", 80, 150);
    // cartão branco
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(60, 200, W - 120, 960, 36); ctx.fill();
    ctx.fillStyle = "#1b1f1d"; ctx.font = `800 62px ${fonte}`;
    let y = 290;
    for (const l of quebra(ctx, o.titulo, W - 340, 2)) { ctx.fillText(l, 110, y); y += 72; }
    ctx.fillStyle = "#4a524e"; ctx.font = `500 32px ${fonte}`;
    for (const l of quebra(ctx, o.subtitulo || "", W - 340, 2)) { ctx.fillText(l, 110, y); y += 42; }
    // nota
    if (o.nota != null) {
      ctx.fillStyle = cor(o.nota); ctx.beginPath(); ctx.arc(W - 190, 330, 100, 0, 7); ctx.fill();
      ctx.fillStyle = o.nota >= 3.5 && o.nota < 7 ? "#1b1f1d" : "#fff"; ctx.textAlign = "center";
      ctx.font = `800 84px ${fonte}`; ctx.fillText(o.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), W - 190, 352);
      ctx.font = `600 24px ${fonte}`; ctx.fillText("de 10", W - 190, 392); ctx.textAlign = "left";
    }
    y = Math.max(y, 470) + 30;
    for (const [rot, val] of (o.itens || []).slice(0, 7)) {
      ctx.fillStyle = "#f2f4f1"; ctx.beginPath(); ctx.roundRect(110, y, W - 220, 76, 18); ctx.fill();
      ctx.fillStyle = "#4a524e"; ctx.font = `600 28px ${fonte}`; ctx.fillText(rot, 140, y + 49);
      ctx.fillStyle = "#1b1f1d"; ctx.font = `800 30px ${fonte}`; ctx.textAlign = "right"; ctx.fillText(val, W - 140, y + 50); ctx.textAlign = "left";
      y += 90;
    }
    if (o.destaque) {
      ctx.fillStyle = "#0b6b56"; ctx.font = `700 30px ${fonte}`;
      y += 14;
      for (const l of quebra(ctx, o.destaque, W - 220, 2)) { ctx.fillText(l, 110, y + 40); y += 40; }
    }
    ctx.fillStyle = "#fff"; ctx.font = `800 40px ${fonte}`; ctx.fillText(o.url ? o.url.replace(/^https?:\/\//, "") : "bairroideal.com.br", 80, 1240);
    ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `500 26px ${fonte}`; ctx.fillText("Fontes: IBGE, INEP, DataSUS, Receita Federal e OpenStreetMap", 80, 1285);
    return cv;
  }

  async function blob(o) {
    try { await document.fonts?.load("800 40px Inter"); } catch (_) {}
    return new Promise((ok) => desenhar(o).toBlob(ok, "image/png"));
  }

  async function compartilhar(o) {
    const b = await blob(o), arq = new File([b], "bairro-ideal.png", { type: "image/png" });
    const texto = `${o.titulo}${o.nota != null ? ` — nota ${o.nota.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}` : ""}. Veja no Bairro Ideal: ${o.url || "https://bairroideal.com.br"}`;
    window.biEvento?.("cartao", o.origem || "");
    try {
      if (navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], text: texto }); return "compartilhado"; }
    } catch (e) { if (e && e.name === "AbortError") return "cancelado"; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "bairro-ideal.png";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "baixado";
  }

  window.BICartao = { compartilhar, blob };
})();
