// =====================================================================
// Carreta animada da tela de carga.
// A carreta chega vazia por uma estrada (pinheiros, cerca e morros passando ao fundo) e,
// conforme os Tbs de cada produtor são informados, os tambores caem na carroceria.
// Em cada tambor, a parte de baixo tem a cor do produtor e a de cima, preta, é o arrendamento.
//
// Tudo é desenhado mudando atributos do SVG (sem transform de CSS), que funciona igual em
// todos os navegadores. Sem animação quando a pessoa desligou em Ajustes ou o aparelho
// pede "reduzir movimento": a carreta aparece parada e os tambores já cheios.
// =====================================================================

const NS = 'http://www.w3.org/2000/svg';
const W = 1010, LONGE = -1250, ESCALA = 0.86, VELOCIDADE = 260;
const PRETO = '#000000', ACO = '#CBD5E1';

const semMovimento = () =>
  document.documentElement.classList.contains('sem-animacao') || matchMedia('(prefers-reduced-motion: reduce)').matches;

const suave = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function quica(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

// ---------- cenário
function pinheiro(x, h) {
  const t = h * 0.18;
  let s = `<rect x="${x - 3}" y="${250 - t}" width="6" height="${t}" fill="#6B4F36"/><rect x="${x - 2}" y="${250 - t * 0.6}" width="4" height="5" rx="1" fill="#E8A824"/>`;
  for (let k = 0; k < 4; k++) {
    const b = 250 - t - (k * (h - t)) / 4.2, lw = (1 - k * 0.2) * h * 0.2;
    s += `<path d="M${x - lw} ${b} L${x} ${b - (h - t) / 2.6} L${x + lw} ${b} Z" fill="${k % 2 ? '#3E7D57' : '#2F6B4A'}"/>`;
  }
  return s;
}
function cenario() {
  const morro = (dx) => `<path transform="translate(${dx} 0)" d="M0 250 V215 Q120 160 250 200 T505 190 T760 196 T1010 215 V250 Z" fill="#BFDCC8"/>`;
  const nuvem = (x, y, rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.28}" fill="#fff" opacity=".85"/>`;
  let arvores = '', cerca = '', faixas = '', nuvens = '';
  for (const dx of [0, W]) {
    for (let k = 0; k < 12; k++) arvores += pinheiro(dx + k * 86 + ((k * 37) % 30), 170 + ((k * 53) % 90));
    for (let k = 0; k < W; k += 55) cerca += `<rect x="${dx + k}" y="236" width="3" height="20" fill="#8A6A48"/>`;
    cerca += `<line x1="${dx}" x2="${dx + W}" y1="242" y2="242" stroke="#8A6A48" stroke-width="1.2"/><line x1="${dx}" x2="${dx + W}" y1="250" y2="250" stroke="#8A6A48" stroke-width="1.2"/>`;
    for (let k = 0; k < W; k += 90) faixas += `<rect x="${dx + k}" y="283" width="44" height="4" rx="2" fill="#F5F5F4"/>`;
    nuvens += nuvem(dx + 160, -12, 46) + nuvem(dx + 192, -20, 30) + nuvem(dx + 620, 2, 55) + nuvem(dx + 880, -18, 38);
  }
  return `<g data-camada="nuvens">${nuvens}</g><g data-camada="morros">${morro(0)}${morro(W)}</g><g data-camada="arvores">${arvores}</g>
    <rect x="0" y="250" width="${W}" height="12" fill="#C9B98F"/><g data-camada="cerca">${cerca}</g>
    <rect x="0" y="261" width="${W}" height="40" fill="#4B5563"/><rect x="0" y="261" width="${W}" height="2" fill="#9CA3AF"/>
    <g data-camada="faixas">${faixas}</g>`;
}
const CAMADAS = { nuvens: 0.06, morros: 0.2, arvores: 0.55, cerca: 1, faixas: 1 };

// ---------- carreta
function roda(cx, cy) {
  let parafusos = '';
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 * Math.PI) / 180;
    parafusos += `<circle cx="${(cx + 7.5 * Math.cos(a)).toFixed(2)}" cy="${(cy + 7.5 * Math.sin(a)).toFixed(2)}" r="1.7" fill="#64748B"/>`;
  }
  return `<path d="M${cx - 27} ${cy - 6} A27 27 0 0 1 ${cx + 27} ${cy - 6}" fill="none" stroke="#1E293B" stroke-width="5" stroke-linecap="round"/>
  <g data-roda data-cx="${cx}" data-cy="${cy}"><circle cx="${cx}" cy="${cy}" r="19" fill="#1F2937"/><circle cx="${cx}" cy="${cy}" r="15.5" fill="none" stroke="#374151" stroke-width="2" stroke-dasharray="3 3"/><circle cx="${cx}" cy="${cy}" r="11" fill="#E2E8F0"/><circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="#94A3B8" stroke-width="1.2"/>${parafusos}<circle cx="${cx}" cy="${cy}" r="3.5" fill="#475569"/></g>`;
}
const CABINE = `<g transform="translate(344 42)"><rect x="548" y="194" width="42" height="13" rx="5" fill="#A8B1BD"/><rect x="552" y="197" width="34" height="2" rx="1" fill="#fff" opacity=".6"/>
  <path d="M536 195 V96 Q536 82 550 82 H598 Q611 82 618 93 L641 131 Q645 137 653 139 Q662 141 662 151 V195 Z" fill="#1F6F54"/>
  <rect x="546" y="78" width="50" height="5" rx="2.5" fill="#164E3B"/><rect x="530" y="70" width="5" height="40" rx="2" fill="#9CA3AF"/>
  <path d="M549 94 H597 Q604 94 608 101 L629 134 H549 Z" fill="#CFE8F3" stroke="#164E3B" stroke-width="2" stroke-linejoin="round"/>
  <path d="M560 130 L580 98" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M574 130 L588 108" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <rect x="536" y="160" width="126" height="7" fill="#2E8B68"/><rect x="536" y="167" width="126" height="2" fill="#E8C35A"/>
  <path d="M547 140 V190" stroke="#164E3B" stroke-width="1.5"/><rect x="552" y="146" width="13" height="3.5" rx="1.75" fill="#0E3B2E"/>
  <path d="M630 120 L640 112" stroke="#164E3B" stroke-width="2"/><rect x="638" y="102" width="6" height="15" rx="2" fill="#164E3B"/>
  <rect x="653" y="148" width="9" height="9" rx="2.5" fill="#FDE68A" stroke="#D9A21B" stroke-width="1"/>
  <path d="M656 163 H662 M656 168 H662 M656 173 H662 M656 178 H662" stroke="#0E3B2E" stroke-width="1.5"/>
  <rect x="646" y="184" width="20" height="10" rx="3" fill="#A8B1BD"/></g>`;

/** Faixa horizontal [y1, y2] recortada no formato arredondado do tambor */
function faixa(s, y1, y2) {
  if (y2 - y1 < 0.2) return '';
  const { x, y, w, h, r: R } = s;
  const recuo = (yy) => {
    if (yy < y + R) { const d = y + R - yy; return R - Math.sqrt(Math.max(0, R * R - d * d)); }
    if (yy > y + h - R) { const d = yy - (y + h - R); return R - Math.sqrt(Math.max(0, R * R - d * d)); }
    return 0;
  };
  const ys = [y1];
  for (let k = Math.ceil(y1); k < y2; k++) if (k < y + R || k > y + h - R) ys.push(k);
  ys.push(y2);
  const esq = ys.map((v) => `${(x + recuo(v)).toFixed(2)} ${v.toFixed(2)}`);
  const dir = ys.slice().reverse().map((v) => `${(x + w - recuo(v)).toFixed(2)} ${v.toFixed(2)}`);
  return `M${esq.join(' L')} L${dir.join(' L')} Z`;
}

/**
 * Cria a carreta dentro de `el`.
 * Retorna { carregar(fila), capacidade(n), chegar(), alternarMovimento(), destruir() }.
 * `fila` = lista de tambores na ordem: [{ cor, arrendamento (0–100), nome }].
 */
export function criarCarreta(el, { capacidade = 190, aoMudarMovimento } = {}) {
  el.innerHTML = '<svg viewBox="0 -40 1010 340" class="block w-full" role="img" aria-label="Carreta com os tambores da carga"></svg>';
  const svg = el.firstElementChild;
  let slots = [], cap = 0, fila = [];
  let estado = 'fora', vx = LONGE, dist = 0, vel = 0, velAlvo = VELOCIDADE, ultimo = null, chegouEm = 0, loop = null, visivel = false;

  function montar(n) {
    cap = n;
    const andares = n <= 24 ? 2 : n <= 60 ? 3 : n <= 120 ? 4 : n <= 220 ? 5 : 6;
    const colunas = Math.ceil(n / andares);
    const x0 = 28, x1 = 852, piso = 218, vao = andares >= 4 ? 3 : 5;
    const larg = (x1 - x0) / colunas, bw = Math.min(34, larg - 3), bh = Math.min(52, Math.floor(178 / andares) - vao);
    const r = Math.min(4, bw * 0.2), fs = Math.max(7, Math.min(10, bw * 0.42));
    const topo = piso - andares * (bh + vao) - 8;

    let s = cenario();
    s += `<g data-veiculo><ellipse cx="505" cy="271" rx="495" ry="5" fill="#000" opacity=".18"/>
      <g data-poeira><circle cx="2" cy="256" r="7" fill="#CDBF9F"/><circle cx="-16" cy="248" r="9" fill="#D8CDB2"/><circle cx="-34" cy="258" r="6" fill="#CDBF9F"/></g>
      <rect x="14" y="228" width="986" height="9" rx="2" fill="#262B33"/>
      <rect x="14" y="${piso}" width="858" height="11" rx="2" fill="#7A5537"/><rect x="14" y="${piso}" width="858" height="3" fill="#9A6E48"/>`;
    for (let k = 46; k < 872; k += 32) s += `<line x1="${k}" x2="${k}" y1="${piso + 3}" y2="${piso + 11}" stroke="#5B3F28" stroke-width="1" opacity=".6"/>`;
    s += `<rect x="14" y="${topo}" width="8" height="${piso - topo}" rx="2" fill="#5B3F28"/><line x1="22" x2="858" y1="${topo + 1.5}" y2="${topo + 1.5}" stroke="#5B3F28" stroke-width="3" stroke-linecap="round"/>`;
    for (let k = 1; k < 4; k++) s += `<rect x="${14 + k * 211}" y="${topo}" width="4" height="${piso - topo}" fill="#5B3F28" opacity=".55"/>`;
    s += `<rect x="856" y="${topo - 4}" width="14" height="${piso - topo + 4}" rx="2" fill="#475569"/>`;
    for (let yy = topo + 10; yy < piso; yy += 14) s += `<line x1="856" x2="870" y1="${yy}" y2="${yy}" stroke="#334155" stroke-width="2"/>`;
    s += `<g data-vagas></g><g data-tambores></g>${CABINE}
      <g data-fumaca><circle cx="876" cy="98" r="5" fill="#9CA3AF"/><circle cx="868" cy="86" r="7" fill="#B6BDC6"/><circle cx="856" cy="74" r="9" fill="#CBD1D8"/></g>`;
    s += [110, 160, 210, 790, 840, 950].map((cx) => roda(cx, 250)).join('') + '</g>';
    svg.innerHTML = s;

    const vagas = svg.querySelector('[data-vagas]'), grupo = svg.querySelector('[data-tambores]');
    const hw = Math.max(2, bw * 0.12), aro = bh < 35 ? 2.5 : 3.5;
    let htmlVagas = '';
    slots = [];
    for (let i = 0; i < n; i++) {
      const andar = Math.floor(i / colunas), col = i % colunas;
      const x = x0 + col * larg + (larg - bw) / 2, y = piso - (andar + 1) * (bh + vao) + vao - 1;
      htmlVagas += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="#fff" fill-opacity=".45" stroke="#A3B1A8" stroke-dasharray="3 3"/>`;
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = `<title>Vazio</title><rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="${ACO}"/>
        <path data-prod d=""/><path data-preto d="" fill="${PRETO}"/>
        <rect x="${x + bw * 0.12}" y="${y + 4}" width="${hw}" height="${bh - 8}" rx="${hw / 2}" fill="#fff" opacity=".3"/>
        <rect x="${x + bw - bw * 0.12 - hw}" y="${y + 4}" width="${hw}" height="${bh - 8}" rx="${hw / 2}" fill="#000" opacity=".15"/>
        <line x1="${x}" x2="${x + bw}" y1="${y + bh * 0.34}" y2="${y + bh * 0.34}" stroke="#0F172A" stroke-width="${bw < 20 ? 1.2 : 2}" opacity=".22"/>
        <line x1="${x}" x2="${x + bw}" y1="${y + bh * 0.66}" y2="${y + bh * 0.66}" stroke="#0F172A" stroke-width="${bw < 20 ? 1.2 : 2}" opacity=".22"/>
        <rect x="${x - 0.8}" y="${y}" width="${bw + 1.6}" height="${aro}" rx="1.2" fill="#475569"/>
        <rect x="${x - 0.8}" y="${y + bh - aro}" width="${bw + 1.6}" height="${aro}" rx="1.2" fill="#475569"/>
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="none" stroke="#334155" stroke-width="1"/>
        <text x="${x + bw / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="600" fill="#fff" opacity="0" style="pointer-events:none;font-family:inherit"></text>`;
      grupo.appendChild(g);
      const s2 = { x, y, w: bw, h: bh, r, fs, g, prod: g.querySelector('[data-prod]'), preto: g.querySelector('[data-preto]'), pct: g.querySelector('text'), titulo: g.querySelector('title'), d: 0, n: 0, a: 0, cor: ACO, alvo: { n: 0, a: 0, cor: ACO }, anim: null };
      slots.push(s2);
      desenharTambor(s2);
    }
    vagas.innerHTML = htmlVagas;
    desenharCena(performance.now());
  }

  function desenharTambor(s) {
    const { y, h } = s, base = y + h;
    s.g.setAttribute('transform', `translate(0 ${(-90 * (1 - s.d)).toFixed(2)})`);
    s.g.setAttribute('opacity', s.d <= 0.001 ? 0 : Math.min(1, s.d * 5).toFixed(2));
    const pProd = Math.min(s.n, 1 - s.a) * h, pPreto = Math.max(0, s.n - (1 - s.a)) * h;
    s.prod.setAttribute('fill', s.cor);
    s.prod.setAttribute('d', faixa(s, base - pProd, base));
    s.preto.setAttribute('d', faixa(s, base - pProd - pPreto, base - pProd));
    s.pct.setAttribute('y', (base - pProd - pPreto / 2).toFixed(2));
    s.pct.textContent = `${Math.round(s.alvo.a * 100)}%`;
    s.pct.setAttribute('opacity', pPreto >= s.fs + 2 && s.alvo.n === 1 && s.w >= 15 ? 1 : 0);
  }

  function animarTambores(agora) {
    for (const s of slots) {
      const m = s.anim;
      if (!m) continue;
      const passou = agora - m.t0;
      if (passou < 0) continue;
      let fim = true;
      for (const p of m.passos) {
        if (passou < p.inicio) { fim = false; continue; }
        const t = p.dur ? Math.min(1, (passou - p.inicio) / p.dur) : 1;
        if (t < 1) fim = false;
        s[p.k] = p.de + (p.para - p.de) * (p.ease || suave)(t);
      }
      if (fim) { s.anim = null; if (s.alvo.n === 0) { s.n = 0; s.d = 0; } }
      desenharTambor(s);
    }
  }

  function desenharCena(t) {
    for (const [nome, f] of Object.entries(CAMADAS)) {
      svg.querySelector(`[data-camada="${nome}"]`)?.setAttribute('transform', `translate(${(-((dist * f) % W)).toFixed(1)} 0)`);
    }
    const ritmo = Math.min(1, vel / VELOCIDADE);
    const vy = ritmo * Math.sin(t / 85) * 0.9;
    const v = svg.querySelector('[data-veiculo]');
    if (!v) return;
    v.setAttribute('transform', `translate(${(vx + (W * (1 - ESCALA)) / 2).toFixed(1)} ${(vy + 269 * (1 - ESCALA)).toFixed(2)}) scale(${ESCALA})`);
    const ang = ((dist + (vx - LONGE) / ESCALA) / 19) * (180 / Math.PI);
    v.querySelectorAll('[data-roda]').forEach((r) => r.setAttribute('transform', `rotate(${(ang % 360).toFixed(1)} ${r.dataset.cx} ${r.dataset.cy})`));
    svg.querySelector('[data-poeira]')?.setAttribute('opacity', (ritmo * 0.45 * (0.8 + 0.2 * Math.sin(t / 70))).toFixed(2));
    const fumaca = svg.querySelector('[data-fumaca]');
    if (fumaca) {
      const k = (t / 600) % 1;
      fumaca.setAttribute('opacity', (ritmo * 0.55 * (1 - k)).toFixed(2));
      fumaca.setAttribute('transform', `translate(${(-k * 30).toFixed(1)} ${(-k * 12).toFixed(1)})`);
    }
  }

  function quadro(t) {
    loop = null;
    if (!svg.isConnected) { parar(); return; } // a tela mudou: para tudo
    const dt = ultimo ? Math.min(0.05, (t - ultimo) / 1000) : 0;
    ultimo = t;
    vel += (velAlvo - vel) * Math.min(1, dt * 2.2);
    dist += vel * dt;
    if (estado === 'chegando') {
      const p = Math.min(1, (t - chegouEm) / 2400);
      vx = LONGE * (1 - p) ** 3;
      if (p >= 1) { vx = 0; estado = 'pronto'; aplicarFila(); }
    }
    animarTambores(t);
    desenharCena(t);
    if (visivel && document.visibilityState === 'visible') loop = requestAnimationFrame(quadro);
  }
  const rodar = () => { if (!loop && svg.isConnected) { ultimo = null; loop = requestAnimationFrame(quadro); } };

  function chegar() {
    slots.forEach((s) => { s.anim = null; s.d = 0; s.n = 0; s.alvo = { n: 0, a: 0, cor: ACO }; desenharTambor(s); });
    if (semMovimento()) {
      vx = 0; vel = 0; velAlvo = 0; estado = 'pronto';
      desenharCena(performance.now());
      aplicarFila();
      return;
    }
    estado = 'chegando'; chegouEm = performance.now(); vx = LONGE;
    rodar();
  }

  /** Compara a fila nova com o que está na carroceria e anima só o que mudou */
  function aplicarFila() {
    if (estado !== 'pronto') return;
    const parado = semMovimento();
    const agora = performance.now();
    const novos = slots.filter((s, i) => fila[i] && s.alvo.n === 0).length;
    const passo = Math.min(110, 1200 / Math.max(1, novos));
    let ordem = 0, sai = 0;
    slots.forEach((s, i) => {
      const p = fila[i], al = s.alvo;
      const novo = p ? { n: 1, a: p.arrendamento / 100, cor: p.cor } : { n: 0, a: al.a, cor: al.cor };
      s.titulo.textContent = p ? `${p.nome}: ${100 - p.arrendamento}% do produtor, ${p.arrendamento}% de arrendamento` : 'Vazio';
      if (novo.n === al.n && novo.a === al.a && novo.cor === al.cor) return;
      if (al.n === 0 && novo.n === 1) {
        Object.assign(s, { alvo: novo, cor: novo.cor, a: novo.a, d: 0, n: 0 });
        if (parado) { s.d = 1; s.n = 1; s.anim = null; }
        else s.anim = { t0: agora + ordem++ * passo, passos: [{ k: 'd', de: 0, para: 1, inicio: 0, dur: 460, ease: quica }, { k: 'n', de: 0, para: 1, inicio: 420, dur: 600 }] };
      } else if (novo.n === 0) {
        s.alvo = novo;
        if (parado) { s.d = 0; s.n = 0; s.anim = null; }
        else s.anim = { t0: agora + sai++ * Math.min(40, 600 / Math.max(1, slots.length)), passos: [{ k: 'd', de: s.d, para: 0, inicio: 0, dur: 320 }] };
      } else {
        s.alvo = novo; s.cor = novo.cor;
        if (s.anim) s.a = novo.a;
        else if (novo.a !== al.a && !parado) s.anim = { t0: agora, passos: [{ k: 'a', de: s.a, para: novo.a, inicio: 0, dur: 520 }] };
        else s.a = novo.a;
      }
      desenharTambor(s);
    });
    rodar();
  }

  // só anima enquanto a carreta aparece na tela (economiza bateria)
  const observador = new IntersectionObserver((es) => {
    visivel = es.some((e) => e.isIntersecting);
    if (!visivel) return;
    if (estado === 'fora') chegar();
    else rodar();
  }, { threshold: 0.2 });
  observador.observe(svg);
  const aoVoltar = () => { if (document.visibilityState === 'visible' && svg.isConnected) rodar(); };
  document.addEventListener('visibilitychange', aoVoltar);

  function parar() {
    observador.disconnect();
    document.removeEventListener('visibilitychange', aoVoltar);
    if (loop) cancelAnimationFrame(loop);
    loop = null;
  }

  montar(capacidade);

  return {
    carregar(novaFila) { fila = novaFila; aplicarFila(); },
    capacidade(n) {
      if (n === cap) return;
      montar(n);
      if (estado === 'pronto') aplicarFila();
    },
    chegar,
    /** Para ou volta a andar. Retorna true se ficou andando. */
    alternarMovimento() {
      velAlvo = velAlvo ? 0 : VELOCIDADE;
      rodar();
      aoMudarMovimento?.(Boolean(velAlvo));
      return Boolean(velAlvo);
    },
    get andando() { return Boolean(velAlvo) && !semMovimento(); },
    destruir: parar,
  };
}
