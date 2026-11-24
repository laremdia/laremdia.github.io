// Utilitários de data, dinheiro e texto (datas sempre como 'AAAA-MM-DD', valores em centavos)
export const pad = n => String(n).padStart(2, '0');
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hojeISO = () => toISO(new Date());
export const ymOf = iso => iso.slice(0, 7);
export const diaOf = iso => Number(iso.slice(8, 10));
export const addMonths = (ym, n) => {
  let [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
};
export const addDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diasNoMes = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const dataNoMes = (ym, dia) => `${ym}-${pad(Math.min(Math.max(1, dia), diasNoMes(ym)))}`;
export const diffDias = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = ym => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} de ${y}`; };
export const mesCurto = ym => { const [y, m] = ym.split('-').map(Number); return `${MESES_C[m - 1]}/${String(y).slice(2)}`; };
export const fmtData = iso => iso ? iso.split('-').reverse().join('/') : '';
export const diaSemana = iso => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][parseISO(iso).getDay()];

export const brl = cent => ((cent || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlCurto = cent => {
  const v = (cent || 0) / 100;
  if (Math.abs(v) >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
export const centParaInput = cent => cent ? (cent / 100).toFixed(2).replace('.', ',') : '';
export function parseValor(str) {
  if (str == null) return 0;
  let s = String(str).replace(/r\$|\s/gi, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const soma = (arr, f = x => x.valor) => arr.reduce((t, x) => t + (f(x) || 0), 0);
export const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export function baixar(nome, conteudo, tipo = 'application/json') {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
