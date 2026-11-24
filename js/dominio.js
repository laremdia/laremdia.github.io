// Regras de negócio: categorias, cartões/faturas, recorrências, alertas, projeções e "identificação" automática
import { uid, ymOf, diaOf, addMonths, dataNoMes, hojeISO, addDias, norm, capitalizar, parseValor, pad, soma } from './util.js';

export const FORMAS = {
  boleto: 'Boleto', pix: 'Pix', debito: 'Débito automático', cartao: 'Cartão de crédito',
  dinheiro: 'Dinheiro', transferencia: 'Transferência', deposito: 'Depósito em conta'
};

// [id, nome, ícone, tipo, cor, palavras-chave (sem acento)]
const CATS = [
  ['moradia', 'Moradia', '🏠', 'despesa', '#6366f1', ['aluguel', 'condominio', 'iptu', 'prestacao casa', 'financiamento casa', 'gas', 'botijao', 'geladeira', 'fogao', 'movel', 'moveis', 'sofa', 'colchao', 'eletrodomestico', 'reforma', 'material de construcao', 'diarista', 'tv', 'televisao']],
  ['energia', 'Energia elétrica', '💡', 'despesa', '#f59e0b', ['luz', 'energia', 'celesc', 'copel', 'cemig', 'enel', 'cpfl', 'rge']],
  ['agua', 'Água e saneamento', '🚿', 'despesa', '#0ea5e9', ['agua', 'samae', 'casan', 'sabesp', 'sanepar', 'corsan', 'esgoto']],
  ['internet', 'Internet e telefone', '📶', 'despesa', '#8b5cf6', ['internet', 'vivo', 'claro', 'tim', 'oi', 'celular', 'telefone', 'fibra', 'net']],
  ['mercado', 'Mercado e alimentação', '🛒', 'despesa', '#10b981', ['mercado', 'supermercado', 'padaria', 'acougue', 'feira', 'ifood', 'restaurante', 'lanche', 'hortifruti']],
  ['transporte', 'Transporte e veículo', '🚗', 'despesa', '#ef4444', ['gasolina', 'combustivel', 'posto', 'ipva', 'licenciamento', 'seguro carro', 'oficina', 'uber', 'pedagio', 'carro', 'moto', 'onibus']],
  ['saude', 'Saúde', '🩺', 'despesa', '#ec4899', ['farmacia', 'unimed', 'plano de saude', 'medico', 'dentista', 'exame', 'remedio', 'consulta']],
  ['educacao', 'Educação', '🎓', 'despesa', '#14b8a6', ['escola', 'escolinha', 'faculdade', 'curso', 'mensalidade', 'material escolar', 'livro', 'creche']],
  ['lazer', 'Lazer', '🎉', 'despesa', '#f97316', ['cinema', 'viagem', 'passeio', 'bar', 'show', 'festa', 'hotel']],
  ['assinaturas', 'Assinaturas', '📺', 'despesa', '#a855f7', ['netflix', 'spotify', 'amazon', 'prime', 'disney', 'youtube', 'globoplay', 'icloud', 'google one', 'max', 'deezer']],
  ['vestuario', 'Vestuário', '👕', 'despesa', '#d946ef', ['roupa', 'calcado', 'sapato', 'tenis', 'loja']],
  ['filhos', 'Filhos', '🧸', 'despesa', '#eab308', ['fralda', 'brinquedo', 'pediatra', 'baba', 'mesada']],
  ['pets', 'Pets', '🐾', 'despesa', '#84cc16', ['petshop', 'pet shop', 'veterinario', 'racao']],
  ['impostos', 'Impostos e taxas', '🧾', 'despesa', '#64748b', ['imposto', 'taxa', 'tarifa', 'anuidade', 'irpf', 'das', 'inss', 'oab']],
  ['dividas', 'Empréstimos e dívidas', '🏦', 'despesa', '#b91c1c', ['emprestimo', 'consignado', 'financiamento', 'acordo', 'parcela banco']],
  ['outros-d', 'Outras despesas', '📦', 'despesa', '#94a3b8', []],
  ['salario', 'Salário', '💼', 'receita', '#16a34a', ['salario', 'quinzena', 'adiantamento', '13', 'decimo terceiro', 'ferias', 'plr']],
  ['extra', 'Renda extra', '✨', 'receita', '#22c55e', ['freela', 'extra', 'venda', 'bico', 'comissao', 'honorarios', 'pro labore']],
  ['aluguel-r', 'Aluguel recebido', '🔑', 'receita', '#059669', ['aluguel recebido']],
  ['outros-r', 'Outras receitas', '💰', 'receita', '#4ade80', ['reembolso', 'recebi', 'restituicao', 'pensao']],
];
export const categoriasPadrao = () => CATS.map(([id, nome, icone, tipo, cor, palavras]) => ({ id, nome, icone, tipo, cor, palavras }));

/* ---------------------------------------------------------- CARTÕES */
// Data de vencimento da fatura em que cai uma compra (offset = parcelas seguintes)
export function vencFatura(cartao, dataCompra, offset = 0) {
  let ym = ymOf(dataCompra);
  if (diaOf(dataCompra) >= Number(cartao.fechamento)) ym = addMonths(ym, 1);
  ym = addMonths(ym, offset);
  const ymVenc = Number(cartao.vencimento) > Number(cartao.fechamento) ? ym : addMonths(ym, 1);
  return dataNoMes(ymVenc, Number(cartao.vencimento));
}

/* ----------------------------------------------------- RECORRÊNCIAS */
export function ocorrencia(D, r, comp) {
  const data = dataNoMes(comp, r.dia);
  const cartao = r.cartaoId && D.cartoes.find(c => c.id === r.cartaoId);
  return {
    id: `${r.id}_${comp}`, recId: r.id, comp, tipo: r.tipo, descricao: r.descricao, valor: r.valor,
    categoriaId: r.categoriaId, forma: r.forma, cartaoId: cartao ? r.cartaoId : null, membroId: r.membroId || null,
    codigo: r.codigo || '', obs: r.obs || '', data, vencimento: cartao ? vencFatura(cartao, data) : data, pago: false
  };
}
export function recorrenteAtiva(r, comp) {
  return comp >= r.inicio && (!r.fim || comp <= r.fim) && !(r.pulos || []).includes(comp);
}
// Lista as ocorrências que ainda não existem para os meses informados
export function faltantes(D, meses) {
  const limite = addMonths(ymOf(hojeISO()), 13);
  const novas = [];
  const existe = new Set(D.contas.filter(c => c.recId).map(c => c.recId + '|' + c.comp));
  for (const r of D.recorrentes) for (const comp of meses) {
    if (comp > limite || !recorrenteAtiva(r, comp) || existe.has(r.id + '|' + comp)) continue;
    novas.push(ocorrencia(D, r, comp));
  }
  return novas;
}

/* ---------------------------------------------- AGRUPAMENTO / FATURAS */
// Junta as compras de cartão em "faturas" (uma linha por cartão + vencimento)
export function linhas(D, lista) {
  const out = [], fat = {};
  for (const c of lista) {
    if (c.cartaoId && c.tipo === 'despesa' && D.cartoes.some(k => k.id === c.cartaoId)) {
      const key = c.cartaoId + '|' + c.vencimento;
      (fat[key] ||= { fatura: true, key, cartaoId: c.cartaoId, vencimento: c.vencimento, tipo: 'despesa', itens: [] }).itens.push(c);
    } else out.push(c);
  }
  for (const f of Object.values(fat)) {
    f.valor = soma(f.itens);
    f.pago = f.itens.every(i => i.pago);
    f.itens.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    out.push(f);
  }
  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || (a.tipo === 'receita' ? -1 : 1));
}

export function statusDe(item, hoje = hojeISO(), dias = 3) {
  if (item.pago) return 'pago';
  if (item.vencimento < hoje) return 'vencida';
  if (item.vencimento === hoje) return 'hoje';
  if (item.vencimento <= addDias(hoje, dias)) return 'breve';
  return 'aberta';
}

export function alertas(D) {
  const hoje = hojeISO(), dias = Number(D.meta.config?.diasAlerta ?? 3);
  const lim = addDias(hoje, dias);
  const pend = D.contas.filter(c => !c.pago && c.tipo === 'despesa' && c.vencimento <= lim);
  const ls = linhas(D, pend);
  return {
    vencidas: ls.filter(l => l.vencimento < hoje),
    hoje: ls.filter(l => l.vencimento === hoje),
    breve: ls.filter(l => l.vencimento > hoje),
    receber: D.contas.filter(c => !c.pago && c.tipo === 'receita' && c.vencimento <= hoje),
  };
}

/* --------------------------------------------------------- PROJEÇÃO */
// Totais previstos de um mês (pelo vencimento), incluindo recorrências ainda não geradas
export function resumoMes(D, ym) {
  const reais = D.contas.filter(c => ymOf(c.vencimento) === ym);
  const comps = [addMonths(ym, -1), ym];
  const virtuais = faltantes(D, comps).filter(c => ymOf(c.vencimento) === ym);
  const todas = reais.concat(virtuais);
  const rec = todas.filter(c => c.tipo === 'receita'), desp = todas.filter(c => c.tipo === 'despesa');
  return {
    todas, receitas: soma(rec), despesas: soma(desp),
    recebido: soma(rec.filter(c => c.pago)), pago: soma(desp.filter(c => c.pago)),
    aPagar: soma(desp.filter(c => !c.pago)), nAPagar: linhas(D, desp.filter(c => !c.pago)).length,
  };
}
export function porCategoria(D, lista) {
  const m = {};
  for (const c of lista) if (c.tipo === 'despesa') m[c.categoriaId || 'outros-d'] = (m[c.categoriaId || 'outros-d'] || 0) + c.valor;
  return m;
}

/* -------------------------------------------- IDENTIFICAÇÃO AUTOMÁTICA */
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'em', 'no', 'na', 'conta', 'pagamento', 'pagar', 'parcela', 'fatura', 'mes']);
const temPalavra = (texto, k) => (' ' + texto + ' ').includes(' ' + k + ' ');

export function sugerirCategoria(D, descricao, tipo) {
  const n = norm(descricao.replace(/\(\d+\/\d+\)/g, ''));
  if (!n) return null;
  const valida = id => { const c = D.categorias.find(x => x.id === id); return c && (!tipo || c.tipo === tipo) ? id : null; };
  const ap = D.meta.aprendizado || {};
  if (ap[n] && valida(ap[n])) return ap[n];
  for (const p of n.split(' ')) if (!PARADAS.has(p) && ap[p] && valida(ap[p])) return ap[p];
  let melhor = null, tam = 0;
  for (const c of D.categorias) {
    if (tipo && c.tipo !== tipo) continue;
    for (const k of c.palavras || []) { const kn = norm(k); if (kn && temPalavra(n, kn) && kn.length > tam) { melhor = c.id; tam = kn.length; } }
  }
  return melhor;
}

export function aprender(D, descricao, categoriaId) {
  if (!categoriaId) return null;
  const n = norm(descricao.replace(/\(\d+\/\d+\)/g, ''));
  if (!n) return null;
  const ap = { ...(D.meta.aprendizado || {}) };
  ap[n] = categoriaId;
  const p = n.split(' ').find(w => w.length >= 3 && !PARADAS.has(w) && !/^\d+$/.test(w));
  if (p) ap[p] = categoriaId;
  const chaves = Object.keys(ap);
  if (chaves.length > 800) chaves.slice(0, chaves.length - 800).forEach(k => delete ap[k]);
  return ap;
}

// Lê uma frase como "luz 185,90 dia 10" ou "geladeira 3.290 10x nubank 12/11"
export function interpretar(D, texto, ymBase) {
  let t = ' ' + texto.trim() + ' ';
  const r = {};
  let m;
  if ((m = t.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : ymBase.slice(0, 4);
    r.data = `${y}-${pad(m[2])}-${pad(m[1])}`; t = t.replace(m[0], ' ');
  }
  if ((m = t.match(/\s(?:dia|vence|vencimento|venc)\s+(\d{1,2})(?=\s)/i))) { r.data = dataNoMes(ymBase, Number(m[1])); t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(?:em\s+)?(\d{1,2})\s?x(?=\s)/i))) { r.parcelas = Number(m[1]); t = t.replace(m[0], ' '); }
  if (/\s(fixa|fixo|mensal|todo mes|todo mês|todos os meses)(?=\s)/i.test(t)) { r.repeticao = 'fixa'; t = t.replace(/\s(fixa|fixo|mensal|todo m[eê]s|todos os meses)(?=\s)/gi, ' '); }
  if (/\s(pago|paga|pagou|recebido|recebi)(?=\s)/i.test(t)) { r.pago = true; t = t.replace(/\s(pago|paga|pagou|recebido)(?=\s)/gi, ' '); }
  for (const k of [['pix', 'pix'], ['boleto', 'boleto'], ['debito', 'debito'], ['débito', 'debito'], ['dinheiro', 'dinheiro']]) {
    const re = new RegExp('\\s' + k[0] + '(?=\\s)', 'i'); if (re.test(t)) { r.forma = k[1]; t = t.replace(re, ' '); }
  }
  const nt = norm(t);
  const cartao = D.cartoes.find(c => temPalavra(nt, norm(c.nome)) || temPalavra(nt, norm(c.nome).split(' ')[0]));
  if (cartao) {
    r.forma = 'cartao'; r.cartaoId = cartao.id;
    const pn = norm(cartao.nome).split(' ')[0];
    t = t.replace(new RegExp('\\s(no\\s+|cart[aã]o\\s+)*' + pn + '\\S*', 'i'), ' ');
  } else if (/\scart[aã]o(?=\s)/i.test(t)) { r.forma = 'cartao'; t = t.replace(/\scart[aã]o(?=\s)/i, ' '); }
  const vals = [...t.matchAll(/\s(r\$\s?)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?=\s)/gi)];
  if (vals.length) { const v = vals[vals.length - 1]; r.valor = parseValor(v[2]); t = t.replace(v[0], ' '); }
  if (r.parcelas > 1 && !r.repeticao) r.repeticao = 'parcelada';
  r.descricao = capitalizar(t.replace(/\s+/g, ' ').replace(/^\s*(no|na|de)\s+/i, '').trim());
  const ehReceita = /^(salario|salário|recebi|receita|pro labore|pró-labore|honorarios|honorários)/i.test(r.descricao);
  r.tipo = ehReceita ? 'receita' : null;
  const catRec = sugerirCategoria(D, r.descricao, 'receita');
  const catDesp = sugerirCategoria(D, r.descricao, 'despesa');
  if (!r.tipo) r.tipo = catRec && !catDesp ? 'receita' : 'despesa';
  r.categoriaId = r.tipo === 'receita' ? catRec : catDesp;
  return r;
}

/* ------------------------------------------------------ DADOS DE EXEMPLO */
export function exemplo(ymAtual) {
  const membros = [{ id: 'm1', nome: 'Ana', cor: '#0d9488' }, { id: 'm2', nome: 'Pedro', cor: '#6366f1' }];
  const cartoes = [{ id: 'k1', nome: 'Nubank', fechamento: 3, vencimento: 10, limite: 800000, cor: '#8b5cf6' }];
  const ini = addMonths(ymAtual, -1);
  const R = (id, tipo, descricao, valor, categoriaId, dia, forma, membroId, cartaoId) =>
    ({ id, tipo, descricao, valor, categoriaId, dia, forma, membroId, cartaoId: cartaoId || null, inicio: ini, fim: null, pulos: [] });
  const recorrentes = [
    R('r1', 'receita', 'Salário Ana', 520000, 'salario', 5, 'deposito', 'm1'),
    R('r2', 'receita', 'Salário Pedro', 380000, 'salario', 20, 'deposito', 'm2'),
    R('r3', 'despesa', 'Aluguel', 160000, 'moradia', 5, 'pix', 'm1'),
    R('r4', 'despesa', 'Energia (Celesc)', 21000, 'energia', 12, 'boleto', 'm2'),
    R('r5', 'despesa', 'Água (Samae)', 9500, 'agua', 15, 'boleto', 'm2'),
    R('r6', 'despesa', 'Internet fibra', 11990, 'internet', 18, 'debito', 'm1'),
    R('r7', 'despesa', 'Escolinha', 65000, 'educacao', 8, 'boleto', 'm1'),
    R('r8', 'despesa', 'Netflix', 5590, 'assinaturas', 1, 'cartao', 'm2', 'k1'),
  ];
  const D = { contas: [], recorrentes, cartoes, categorias: categoriasPadrao(), membros, meta: {} };
  const contas = faltantes(D, [ini, ymAtual, addMonths(ymAtual, 1)]);
  const corte = addDias(hojeISO(), -2); // deixa só os últimos dias em aberto, para mostrar os alertas
  contas.forEach(c => { if (c.vencimento < corte) { c.pago = true; c.pagoEm = c.vencimento; } });
  const k = cartoes[0];
  const compra = (id, descricao, valor, categoriaId, data, membroId, n, total, grupoId) => ({
    id, tipo: 'despesa', descricao, valor, categoriaId, data, vencimento: vencFatura(k, data, n ? n - 1 : 0),
    forma: 'cartao', cartaoId: 'k1', membroId, pago: false, ...(n ? { parcela: { n, total }, grupoId } : {})
  });
  const d = dia => dataNoMes(ymAtual, dia);
  contas.push(compra('c1', 'Supermercado', 48730, 'mercado', d(2), 'm1'));
  contas.push(compra('c2', 'Farmácia', 8950, 'saude', d(4), 'm2'));
  contas.push(compra('c3', 'Posto de gasolina', 25000, 'transporte', d(6), 'm2'));
  for (let i = 1; i <= 10; i++) contas.push(compra('g' + i, 'Geladeira', 32900, 'moradia', dataNoMes(ini, 20), 'm1', i, 10, 'grp1'));
  contas.filter(c => c.vencimento < corte && c.cartaoId).forEach(c => { c.pago = true; });
  // duas contas avulsas perto de hoje, para a demonstração mostrar os alertas
  const h = hojeISO();
  contas.push({ id: 'a1', tipo: 'despesa', descricao: 'Gás de cozinha', valor: 13500, categoriaId: 'moradia', data: addDias(h, -1), vencimento: addDias(h, -1), forma: 'boleto', membroId: 'm2', pago: false });
  contas.push({ id: 'a2', tipo: 'despesa', descricao: 'Plano de saúde', valor: 48000, categoriaId: 'saude', data: addDias(h, 2), vencimento: addDias(h, 2), forma: 'boleto', membroId: 'm1', pago: false, codigo: '23793.38128 60000.000003 00000.000400 1 00000000048000' });
  const orcamento = { mercado: 120000, transporte: 50000, lazer: 40000, saude: 30000, assinaturas: 10000 };
  return { ...D, contas, meta: { nome: 'Família Exemplo', config: { diasAlerta: 3 }, orcamento, aprendizado: {} } };
}
