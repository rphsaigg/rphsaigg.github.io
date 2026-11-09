/* Bairro Ideal — "Nota do endereço": a pessoa escolhe um ponto (endereço, GPS ou toque no mapa) e vê o que há a pé em volta
   (mercado, escola pública, UBS, parque, lazer), mais as notas do bairro em que o ponto cai. Tudo roda no navegador:
   o ponto escolhido NUNCA é enviado a nós. Só o texto do endereço vai ao Nominatim (OpenStreetMap), para achar as coordenadas. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const CAP = Object.fromEntries(window.CAPITAIS.map((c) => [c.slug, c]));
  const CORES = ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850"];
  const cor = (v) => CORES[Math.min(CORES.length - 1, Math.max(0, Math.floor((v / 10) * CORES.length)))];
  const TEMAS = { educacao: "Educação", saude: "Saúde", saneamento: "Saneamento", rua: "Rua", lazer: "Lazer", comercio: "Comércio", seguranca: "Segurança" };
  const RAIO_KM = 1.2;   // ≈ 15 minutos a pé
  const V = window.DADOS_V || "";
  const f = $("#f-end");
  const cache = {};
  const buscar = (slug, sufixo) => (cache[slug + sufixo] ||= fetch(`/static/dados/${slug}${sufixo}?v=${V}`).then((r) => r.json()));
  let mapa, marcador, slugs = null, ponto = null;

  f.capital.innerHTML = `<option value="">Escolha…</option>` + window.CAPITAIS.map((c) => `<option value="${c.slug}">${esc(c.nome)}</option>`).join("");
  const q = new URLSearchParams(location.search);
  if (CAP[q.get("capital")]) f.capital.value = q.get("capital");

  // ---------- mapa ----------
  function circulo(lon, lat, km) {
    const k = Math.cos((lat * Math.PI) / 180), pts = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * 2 * Math.PI; pts.push([lon + (km / 111.2) * Math.cos(a) / k, lat + (km / 111.2) * Math.sin(a)]); }
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [pts] } };
  }
  function iniciarMapa() {
    if (mapa || !window.maplibregl) return;
    mapa = new maplibregl.Map({ container: "end-mapa", style: "https://tiles.openfreemap.org/styles/positron", center: [-52, -14], zoom: 3.2, attributionControl: { compact: true } });
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapa.on("load", () => {
      mapa.addSource("raio", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer({ id: "raio-fill", type: "fill", source: "raio", paint: { "fill-color": "#0b6b56", "fill-opacity": 0.1 } });
      mapa.addLayer({ id: "raio-line", type: "line", source: "raio", paint: { "line-color": "#0b6b56", "line-width": 2, "line-dasharray": [2, 2] } });
      mapa._pronto = true;
      if (f.capital.value) irParaCapital();
    });
    mapa.on("click", (e) => { if (f.capital.value) escolher(e.lngLat.lng, e.lngLat.lat, "toque"); else aviso("Escolha a capital antes de tocar no mapa."); });
  }
  function irParaCapital() {
    const c = CAP[f.capital.value];
    if (c && mapa) mapa.fitBounds([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], { padding: 20, duration: 600 });
  }
  function aviso(t) { const r = $("#end-res"); r.hidden = false; r.innerHTML = `<p class="aviso">${esc(t)}</p>`; }
  iniciarMapa();
  f.capital.onchange = () => { ponto = null; $("#end-res").hidden = true; $("#end-lista").hidden = true; if (mapa?._pronto) irParaCapital(); };

  // ---------- busca de endereço (Nominatim) ----------
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const slug = f.capital.value, c = CAP[slug], texto = f.q.value.trim();
    if (!c || texto.length < 3) return aviso("Escolha a capital e digite um endereço ou ponto de referência.");
    const [x0, y0, x1, y1] = c.bbox;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&bounded=1&viewbox=${x0},${y1},${x1},${y0}&q=${encodeURIComponent(texto + ", " + c.nome)}`;
    const lista = $("#end-lista");
    lista.hidden = false; lista.innerHTML = `<li class="nota">Procurando…</li>`;
    try {
      const r = await (await fetch(url)).json();
      if (!r.length) { lista.innerHTML = `<li class="nota">Não achamos esse endereço em ${esc(c.nome)}. Tente só a rua e o bairro, ou toque no mapa.</li>`; return; }
      lista.innerHTML = r.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.display_name.split(",").slice(0, 4).join(","))}</button></li>`).join("");
      lista.onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b) { const x = r[+b.dataset.i]; lista.hidden = true; escolher(+x.lon, +x.lat, "endereco"); } };
      if (r.length === 1) { lista.hidden = true; escolher(+r[0].lon, +r[0].lat, "endereco"); }
    } catch (_) { lista.innerHTML = `<li class="nota">O serviço de endereços não respondeu. Toque no mapa para escolher o ponto.</li>`; }
  };
  $("#b-gps").onclick = () => {
    if (!navigator.geolocation) return aviso("Seu navegador não informa a localização. Toque no mapa.");
    if (!f.capital.value) return aviso("Escolha a capital primeiro.");
    navigator.geolocation.getCurrentPosition((p) => escolher(p.coords.longitude, p.coords.latitude, "gps"), () => aviso("Não foi possível obter a localização. Toque no mapa."), { timeout: 8000 });
  };

  // ---------- cálculos ----------
  const rad = Math.PI / 180;
  function dist(lon1, lat1, lon2, lat2) {   // km, haversine
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }
  function dentro(lon, lat, geom) {
    const aneis = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    const noAnel = (a) => { let r = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) r = !r; } return r; };
    return aneis.some((p) => noAnel(p[0]) && !p.slice(1).some(noAnel));
  }
  const fmtDist = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${num(km, 1)} km`);
  const minutos = (km) => Math.max(1, Math.round((km * 1.25 / 4.8) * 60));   // trajeto ≈ 1,25 × linha reta, 4,8 km/h
  function nota(d) { return d <= 0.4 ? 1 : d >= 2 ? 0 : 1 - (d - 0.4) / 1.6; }   // 1 até 400 m, 0 a partir de 2 km

  async function escolher(lon, lat, origem) {
    const slug = f.capital.value, c = CAP[slug];
    if (lon < c.bbox[0] - 0.05 || lon > c.bbox[2] + 0.05 || lat < c.bbox[1] - 0.05 || lat > c.bbox[3] + 0.05) return aviso(`Esse ponto fica fora de ${c.nome}.`);
    ponto = [lon, lat];
    if (mapa) {
      if (!marcador) { marcador = new maplibregl.Marker({ color: "#0b6b56", draggable: true }).setLngLat(ponto).addTo(mapa); marcador.on("dragend", () => { const p = marcador.getLngLat(); escolher(p.lng, p.lat, "arrastar"); }); }
      else marcador.setLngLat(ponto);
      if (mapa._pronto) { mapa.getSource("raio").setData({ type: "FeatureCollection", features: [circulo(lon, lat, RAIO_KM)] }); { const dy = (RAIO_KM * 1.3) / 111.2, dx = dy / Math.cos((lat * Math.PI) / 180); mapa.fitBounds([[lon - dx, lat - dy], [lon + dx, lat + dy]], { duration: 500, maxZoom: 16 }); } }
    }
    const res = $("#end-res"); res.hidden = false; res.innerHTML = `<p class="nota">Calculando…</p>`;
    const [geo, pts, ent] = await Promise.all([buscar(slug, ".geojson"), buscar(slug, "-pontos.json"), buscar(slug, "-entorno.json").catch(() => ({ cats: [], p: [] }))]);
    if (!slugs) slugs = await fetch(`/static/dados/slugs.json?v=${V}`).then((r) => r.json()).catch(() => ({}));
    const reg = geo.features.find((x) => dentro(lon, lat, x.geometry))?.properties;

    // mais próximo de cada tipo + quantos no raio
    const proximo = (lista, filtro) => { let m = null, n = 0; for (const p of lista) { if (filtro && !filtro(p)) continue; const d = dist(lon, lat, p[0], p[1]); if (d <= RAIO_KM) n++; if (!m || d < m.d) m = { d, nome: typeof p[2] === "string" ? p[2] : "", p }; } return { m, n }; };
    const ci = (nome) => ent.cats.indexOf(nome);
    const entPts = ent.p;
    const porCat = (...nomes) => { const ids = nomes.map(ci); return proximo(entPts, (p) => ids.includes(p[2])); };
    const itens = [
      { k: "Mercado ou padaria", w: 2, ...porCat("mercado") },
      { k: "Escola pública", w: 1.5, ...proximo(pts.escolas, (e) => e[3] !== "privada") },
      { k: "Posto de saúde (UBS)", w: 1.5, ...proximo(pts.saude, (s) => s[3] === "ubs") },
      { k: "Parque ou praça", w: 1.5, ...porCat("parque", "praca_playground") },
      { k: "Bares e restaurantes", w: 1, ...porCat("gastronomia") },
      { k: "Esporte, cultura ou shopping", w: 1, ...porCat("esporte", "cultura", "shopping") },
    ];
    const comDado = itens.filter((i) => i.m);
    const soma = comDado.reduce((s, i) => s + i.w, 0);
    const aPe = soma ? (comDado.reduce((s, i) => s + i.w * nota(i.d ?? i.m.d), 0) / soma) * 10 : null;
    const hosp = proximo(pts.saude, (s) => s[3] === "hospital" || s[3] === "urgencia").m;
    const nPraia = entPts.filter((p) => p[2] === ci("praia")).length, praia = nPraia >= 5 ? porCat("praia").m : null;   // só onde a cidade tem praia mapeada
    const nome = reg ? reg.nome : "este ponto";
    const veredito = aPe == null ? "" : aPe >= 8 ? "Quase tudo do dia a dia fica a uma caminhada curta: dá para viver bem sem carro aqui." : aPe >= 6 ? "Boa parte da rotina é a pé, mas algumas coisas pedem ônibus, bicicleta ou carro." : aPe >= 4 ? "Aqui a rotina depende de transporte para várias coisas." : "Poucos serviços a pé: sem carro ou transporte, o dia a dia fica difícil.";
    const link = reg ? (slugs[slug]?.[reg.id] ? `/${slug}/${slugs[slug][reg.id]}/` : `/${slug}/?regiao=${encodeURIComponent(reg.nome)}`) : null;
    const temas = reg ? Object.entries(TEMAS).filter(([t]) => reg[t] != null) : [];
    const cobertura = entPts.length < 800 ? `<p class="aviso">O OpenStreetMap tem poucos pontos mapeados em ${esc(c.nome)}: mercados, parques e lazer podem estar subestimados.</p>` : "";
    window.biEvento?.("endereco", `${slug}:${origem}`);
    res.innerHTML = `
      <div class="vale-veredito ${aPe == null ? "" : aPe >= 7 ? "dentro" : aPe >= 5 ? "abaixo" : "acima"}">
        <span>${reg ? `Ponto em <b>${esc(reg.nome)}</b>, ${esc(c.nome)}` : `Ponto em ${esc(c.nome)}`}</span>
        <h2>${aPe != null ? `Nota a pé: ${num(aPe, 1)} de 10` : "Poucos dados mapeados neste ponto"}</h2>
        <p>${esc(veredito)}</p>
      </div>
      ${cobertura}
      <div class="vale-bairro"><h3>O que há perto (raio de ${num(RAIO_KM, 1)} km ≈ 15 min a pé)</h3>
        <ul class="end-itens">${itens.map((i) => `<li class="${i.m && i.m.d <= 0.8 ? "ok" : i.m && i.m.d <= RAIO_KM ? "meio" : "longe"}"><span>${i.k}</span>
          <b>${i.m ? `${fmtDist(i.m.d)} · ${minutos(i.m.d)} min a pé` : "nenhum mapeado"}</b>
          <small>${i.m?.nome ? esc(i.m.nome) + " · " : ""}${i.n} no raio</small></li>`).join("")}</ul>
        <p class="nota">${hosp ? `Unidade hospitalar ou de urgência mais próxima (CNES): <b>${esc(hosp.nome)}</b>, a ${num(hosp.d, 1)} km (≈ ${minutos(hosp.d)} min a pé, em linha reta × 1,25). ` : ""}${praia && praia.d <= 15 ? `Praia a ${num(praia.d, 1)} km. ` : ""}</p>
      </div>
      ${reg ? `<div class="vale-bairro"><h3>O bairro: ${esc(reg.nome)}</h3>
        <p>Nota geral <b style="border-left:4px solid ${cor(reg.geral ?? 0)};padding-left:.4rem">${reg.geral != null ? num(reg.geral, 1) : "—"}</b>${reg.rank ? ` · ${reg.rank}º de ${geo.features.length} em ${esc(c.nome)}` : ""}</p>
        <p class="vale-temas">${temas.map(([t, n]) => `<span>${n} <b>${num(reg[t], 1)}</b></span>`).join("")}</p>
        <p><a href="${link}">Tudo sobre morar em ${esc(reg.nome)}</a> · <a href="/esse-aluguel-vale/?capital=${slug}&regiao=${encodeURIComponent(reg.id)}">Esse aluguel vale?</a></p></div>` : ""}
      <div class="cta"><button class="btn" type="button" id="b-cartao">Compartilhar cartão</button></div>
      <p class="nota">Distâncias em linha reta, com o trajeto estimado em 1,25 × a distância e 4,8 km/h. Pontos do OpenStreetMap, das escolas do INEP e das unidades do CNES; a cobertura varia de cidade para cidade. A nota a pé é só sobre proximidade: não mede segurança, calçadas nem relevo. <a href="/metodologia/">Como calculamos</a></p>`;
    $("#b-cartao").onclick = () => BICartao.compartilhar({
      titulo: reg ? `${reg.nome}, ${c.nome}` : c.nome, subtitulo: "Nota do endereço: o que dá para fazer a pé em 15 minutos",
      nota: aPe != null ? Math.round(aPe * 10) / 10 : null, origem: "endereco",
      itens: itens.filter((i) => i.m).map((i) => [i.k, `${minutos(i.m.d)} min`]).slice(0, 6),
      destaque: reg ? `Bairro ${reg.nome}: nota geral ${reg.geral != null ? num(reg.geral, 1) : "—"}` : "", url: "https://bairroideal.com.br/meu-endereco/",
    });
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
