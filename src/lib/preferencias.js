// Preferências de aparência (ficam salvas só neste aparelho)
const CHAVE = 'caixa-preferencias';
const padrao = { tema: 'auto', textoGrande: false, tourVisto: false };

export function lerPreferencias() {
  try {
    return { ...padrao, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    return { ...padrao };
  }
}

export function salvarPreferencias(mudancas) {
  const p = { ...lerPreferencias(), ...mudancas };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    /* navegador sem armazenamento: apenas não salva */
  }
  aplicarPreferencias();
  return p;
}

const escuroDoSistema = matchMedia('(prefers-color-scheme: dark)');

export function aplicarPreferencias() {
  const p = lerPreferencias();
  const escuro = p.tema === 'escuro' || (p.tema === 'auto' && escuroDoSistema.matches);
  document.documentElement.classList.toggle('dark', escuro);
  document.documentElement.classList.toggle('texto-grande', p.textoGrande);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0c0a09' : '#1f6f54');
}

escuroDoSistema.addEventListener('change', aplicarPreferencias);
