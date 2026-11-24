import { criarStoreLocal, iniciarFirebase, dadosVazios } from './store.js';
import { firebaseConfig } from './firebase-config.js';
import * as U from './util.js';
import * as R from './dominio.js';

const { esc, brl, fmtData, ymOf, addMonths, hojeISO, soma } = U;
const APP = 'Lar em Dia';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const S = { rota: 'painel', mes: ymOf(hojeISO()), f: { tipo: '', status: '', cat: '', membro: '', busca: '' }, diaSel: null, abertas: new Set() };
let store = null, fb = null, user = null;
const D = () => store.data;
const cat = id => D().categorias.find(c => c.id === id);
const cartaoDe = id => D().cartoes.find(c => c.id === id);
const membroDe = id => D().membros.find(m => m.id === id);
const cfg = () => D().meta.config || { diasAlerta: 3 };

/* ================================================================ INÍCIO */
async function iniciar() {
  registrarSW();
  window.addEventListener('hashchange', () => { lerRota(); render(); });
  document.addEventListener('click', aoClicar);
  document.addEventListener('change', aoMudar);
  document.addEventListener('input', aoDigitar);
  $('#rapido').addEventListener('submit', e => { e.preventDefault(); lancamentoRapido(); });
  lerRota();

  if (firebaseConfig.apiKey) {
    try { fb = await iniciarFirebase(firebaseConfig); }
    catch (e) { console.error(e); toast('Não foi possível carregar o Firebase. Verifique a internet.'); return; }
    fb.onAuth(async u => {
      user = u;
      if (store?.fechar) store.fechar();
      store = null;
      if (!u) return telaLogin();
      const hid = await fb.familiaDoUsuario(u.uid);
      if (!hid) return telaFamilia();
      abrir(hid);
    });
  } else {
    store = criarStoreLocal(render);
    mostrarApp();
    aposCarregar();
  }
}

function abrir(hid) {
  store = fb.abrirFamilia(hid, () => store && render(), aposCarregar);
  mostrarApp();
}

let carregado = false;
function aposCarregar() {
  carregado = true;
  if (!D().categorias.length) store.putMany(R.categoriasPadrao().map(c => ['categoria', c]));
  garantirRecorrencias();
  render();
  notificarDoDia();
}

function garantirRecorrencias() {
  const hoje = ymOf(hojeISO());
  const meses = new Set([addMonths(hoje, -1), hoje, addMonths(hoje, 1), addMonths(S.mes, -1), S.mes]);
  const novas = R.faltantes(D(), [...meses]);
  if (novas.length) store.putMany(novas.map(c => ['conta', c]));
}

function lerRota() {
  const r = location.hash.replace('#', '') || 'painel';
  S.rota = ['painel', 'contas', 'calendario', 'cartoes', 'planejamento', 'config'].includes(r) ? r : 'painel';
}

function mostrarApp() { $('#auth').hidden = true; $('#app').hidden = false; }

/* ================================================================ RENDER */
const TITULOS = { painel: 'Painel', contas: 'Contas do mês', calendario: 'Calendário', cartoes: 'Cartões de crédito', planejamento: 'Planejamento', config: 'Família e ajustes' };

function render() {
  if (!store) return;
  const al = R.alertas(D());
  const nAl = al.vencidas.length + al.hoje.length;
  document.title = (nAl ? `(${nAl}) ` : '') + APP;
  $$('[data-badge="alertas"]').forEach(b => { b.textContent = nAl || ''; b.hidden = !nAl; });
  $$('nav a[href^="#"]').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + S.rota));
  $('#titulo').textContent = TITULOS[S.rota];
  $('#familia-nome').textContent = D().meta.nome || 'Minha família';
  $('#mes-nav').hidden = !['painel', 'contas', 'calendario', 'planejamento'].includes(S.rota);
  $('#mes-label').textContent = U.nomeMes(S.mes);
  $('#modo-local').hidden = store.modo !== 'local';
  const banner = $('#banner');
  if (al.vencidas.length || al.hoje.length) {
    const partes = [];
    if (al.vencidas.length) partes.push(`<b>${al.vencidas.length}</b> vencida${al.vencidas.length > 1 ? 's' : ''} (${brl(soma(al.vencidas))})`);
    if (al.hoje.length) partes.push(`<b>${al.hoje.length}</b> vence${al.hoje.length > 1 ? 'm' : ''} hoje (${brl(soma(al.hoje))})`);
    banner.innerHTML = `<span>⚠️ ${partes.join(' · ')}</span><a href="#painel">ver alertas</a>`;
    banner.hidden = false;
  } else banner.hidden = true;

  const v = $('#view');
  v.innerHTML = ({ painel: vPainel, contas: vContas, calendario: vCalendario, cartoes: vCartoes, planejamento: vPlanejamento, config: vConfig }[S.rota])();
}

/* ---------------------------------------------------------------- PAINEL */
function vPainel() {
  const d = D();
  if (!d.contas.length && !d.recorrentes.length) return boasVindas();
  const r = R.resumoMes(d, S.mes);
  const saldo = r.receitas - r.despesas;
  const al = R.alertas(d);
  const pc = R.porCategoria(d, r.todas);
  const top = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxCat = top[0]?.[1] || 1;
  const prox = R.linhas(d, d.contas.filter(c => !c.pago && c.tipo === 'despesa' && c.vencimento > U.addDias(hojeISO(), cfg().diasAlerta)))
    .slice(0, 6);

  const listaAlerta = (arr, cls, rot) => arr.map(l => `
    <div class="alerta ${cls}">
      <div><b>${esc(nomeLinha(l))}</b><small>${rot(l)}</small></div>
      <div class="dir"><b>${brl(l.valor)}</b>${botaoPagar(l, 'Pagar')}</div>
    </div>`).join('');

  const orc = d.meta.orcamento || {};
  const estouros = Object.entries(orc).filter(([id, v]) => v > 0 && (pc[id] || 0) >= v * 0.8)
    .map(([id, v]) => ({ c: cat(id), v, g: pc[id] || 0 })).filter(x => x.c);

  return `
  <div class="kpis">
    ${kpi('Receitas previstas', brl(r.receitas), `${brl(r.recebido)} recebido`, 'pos')}
    ${kpi('Despesas previstas', brl(r.despesas), `${brl(r.pago)} já pago`, 'neg')}
    ${kpi('Saldo previsto', brl(saldo), saldo >= 0 ? 'sobra no mês' : 'falta no mês', saldo >= 0 ? 'pos' : 'neg')}
    ${kpi('Ainda a pagar', brl(r.aPagar), `${r.nAPagar} conta${r.nAPagar === 1 ? '' : 's'} em aberto`, '')}
  </div>
  <div class="grade2">
    <section class="card">
      <h3>🔔 Alertas de pagamento</h3>
      ${!al.vencidas.length && !al.hoje.length && !al.breve.length ? '<p class="vazio">Nenhuma conta vencida ou vencendo nos próximos ' + cfg().diasAlerta + ' dias. 🎉</p>' : ''}
      ${listaAlerta(al.vencidas, 'vencida', l => `venceu em ${fmtData(l.vencimento)} · há ${U.diffDias(l.vencimento, hojeISO())} dia(s)`)}
      ${listaAlerta(al.hoje, 'hoje', () => 'vence HOJE')}
      ${listaAlerta(al.breve, 'breve', l => `vence ${U.diaSemana(l.vencimento)}, ${fmtData(l.vencimento)} · em ${U.diffDias(hojeISO(), l.vencimento)} dia(s)`)}
      ${al.receber.length ? `<p class="dica">💰 ${al.receber.length} receita(s) prevista(s) ainda não marcada(s) como recebida(s): ${al.receber.map(c => esc(c.descricao)).join(', ')}.</p>` : ''}
    </section>
    <section class="card">
      <h3>📊 Para onde vai o dinheiro — ${U.nomeMes(S.mes)}</h3>
      ${top.length ? top.map(([id, v]) => { const c = cat(id) || { nome: 'Sem categoria', icone: '❔', cor: '#94a3b8' }; return `
        <div class="barra-linha"><span>${c.icone} ${esc(c.nome)}</span><div class="barra"><i style="width:${(v / maxCat * 100).toFixed(1)}%;background:${c.cor}"></i></div><b>${brl(v)}</b></div>`; }).join('') : '<p class="vazio">Sem despesas neste mês.</p>'}
    </section>
  </div>
  <div class="grade2">
    <section class="card">
      <h3>📈 Próximos 6 meses</h3>
      ${graficoFluxo()}
    </section>
    <section class="card">
      <h3>🗓️ Próximos vencimentos</h3>
      ${prox.length ? prox.map(l => `<div class="mini-linha"><span class="data">${fmtData(l.vencimento).slice(0, 5)}</span><span>${esc(nomeLinha(l))}</span><b>${brl(l.valor)}</b></div>`).join('') : '<p class="vazio">Nada programado.</p>'}
      ${estouros.length ? `<h3 style="margin-top:18px">🎯 Atenção ao planejamento</h3>${estouros.map(x => `<div class="mini-linha"><span>${x.c.icone}</span><span>${esc(x.c.nome)}</span><b class="${x.g > x.v ? 'neg' : 'aviso'}">${Math.round(x.g / x.v * 100)}% do limite</b></div>`).join('')}` : ''}
    </section>
  </div>`;
}

const kpi = (t, v, s, cls) => `<div class="kpi ${cls}"><small>${t}</small><strong>${v}</strong><span>${s}</span></div>`;

function boasVindas() {
  return `<section class="card boas-vindas">
    <h2>Bem-vindo ao ${APP} 👋</h2>
    <p>Organize as contas da casa, receba alertas antes de vencer e planeje o mês em família.</p>
    <ol>
      <li><b>Cadastre as contas fixas</b> (aluguel, luz, água, escola…) marcando "Repetir todo mês" — elas aparecem sozinhas nos próximos meses.</li>
      <li><b>Cadastre seus cartões</b> com dia de fechamento e vencimento — as compras caem na fatura certa.</li>
      <li><b>Lance o dia a dia</b> na barra de cima: escreva <code>luz 185,90 dia 10</code> ou <code>geladeira 3.290 10x nubank</code> e o sistema identifica o resto.</li>
    </ol>
    <div class="acoes">
      <button class="btn prim" data-act="nova">+ Primeira conta</button>
      <button class="btn" data-act="novo-cartao">💳 Cadastrar cartão</button>
      <button class="btn ghost" data-act="exemplo">Ver com dados de exemplo</button>
    </div>
  </section>`;
}

function graficoFluxo() {
  const meses = Array.from({ length: 6 }, (_, i) => addMonths(ymOf(hojeISO()), i));
  const dados = meses.map(m => ({ m, ...R.resumoMes(D(), m) }));
  const max = Math.max(1, ...dados.map(x => Math.max(x.receitas, x.despesas)));
  const W = 520, H = 190, bw = 26, gap = W / 6;
  const barras = dados.map((x, i) => {
    const cx = i * gap + gap / 2;
    const hr = x.receitas / max * (H - 40), hd = x.despesas / max * (H - 40);
    const saldo = x.receitas - x.despesas;
    return `<g><rect x="${cx - bw - 2}" y="${H - 22 - hr}" width="${bw}" height="${hr}" rx="4" class="b-rec"><title>Receitas ${brl(x.receitas)}</title></rect>
      <rect x="${cx + 2}" y="${H - 22 - hd}" width="${bw}" height="${hd}" rx="4" class="b-desp"><title>Despesas ${brl(x.despesas)}</title></rect>
      <text x="${cx}" y="${H - 6}" text-anchor="middle" class="eixo">${U.mesCurto(x.m)}</text>
      <text x="${cx}" y="${Math.max(12, H - 28 - Math.max(hr, hd))}" text-anchor="middle" class="rot ${saldo >= 0 ? 'pos' : 'neg'}">${U.brlCurto(saldo)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="fluxo" role="img" aria-label="Receitas e despesas previstas">${barras}</svg>
    <div class="legenda"><span><i class="b-rec"></i>Receitas</span><span><i class="b-desp"></i>Despesas</span><span>valor acima = saldo previsto</span></div>`;
}

/* ---------------------------------------------------------------- CONTAS */
function filtrar(lista) {
  const f = S.f, b = U.norm(f.busca);
  return lista.filter(c =>
    (!f.tipo || c.tipo === f.tipo) &&
    (!f.cat || c.categoriaId === f.cat) &&
    (!f.membro || c.membroId === f.membro) &&
    (!b || U.norm(c.descricao).includes(b)) &&
    (!f.status || (f.status === 'pago' ? c.pago : !c.pago)));
}

function vContas() {
  const d = D();
  const doMes = d.contas.filter(c => ymOf(c.vencimento) === S.mes);
  const ls = R.linhas(d, filtrar(doMes));
  const rec = doMes.filter(c => c.tipo === 'receita'), desp = doMes.filter(c => c.tipo === 'despesa');
  const opt = (arr, sel) => arr.map(([v, t]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `
  <div class="filtros card">
    <input type="search" placeholder="Buscar…" data-filtro="busca" value="${esc(S.f.busca)}">
    <select data-filtro="tipo">${opt([['', 'Receitas e despesas'], ['despesa', 'Só despesas'], ['receita', 'Só receitas']], S.f.tipo)}</select>
    <select data-filtro="status">${opt([['', 'Todas'], ['aberto', 'Em aberto'], ['pago', 'Pagas / recebidas']], S.f.status)}</select>
    <select data-filtro="cat">${opt([['', 'Todas as categorias'], ...d.categorias.map(c => [c.id, c.icone + ' ' + c.nome])], S.f.cat)}</select>
    ${d.membros.length ? `<select data-filtro="membro">${opt([['', 'Todos da família'], ...d.membros.map(m => [m.id, m.nome])], S.f.membro)}</select>` : ''}
  </div>
  <div class="totais">
    <span>Receitas <b class="pos">${brl(soma(rec))}</b></span>
    <span>Despesas <b class="neg">${brl(soma(desp))}</b></span>
    <span>Saldo <b class="${soma(rec) - soma(desp) >= 0 ? 'pos' : 'neg'}">${brl(soma(rec) - soma(desp))}</b></span>
    <span>Falta pagar <b>${brl(soma(desp.filter(c => !c.pago)))}</b></span>
  </div>
  <section class="card lista">
    ${ls.length ? ls.map(linhaHTML).join('') : `<p class="vazio">Nenhum lançamento ${S.f.busca || S.f.tipo || S.f.cat || S.f.status ? 'com esses filtros' : 'neste mês'}. <button class="link" data-act="nova">Adicionar</button></p>`}
  </section>
  <p class="dica">Dica: clique no círculo para marcar como pago. Contas fixas (🔁) se repetem sozinhas; parceladas mostram a parcela (3/10).</p>`;
}

function nomeLinha(l) {
  if (l.fatura) return `Fatura ${cartaoDe(l.cartaoId)?.nome || 'cartão'}`;
  return l.descricao + (l.parcela ? ` (${l.parcela.n}/${l.parcela.total})` : '');
}
const ROT_STATUS = { pago: 'pago', vencida: 'vencida', hoje: 'vence hoje', breve: 'vence em breve', aberta: '' };

function botaoPagar(l, txt) {
  const attr = l.fatura ? `data-act="pagar-fatura" data-key="${l.key}"` : `data-act="pagar" data-id="${l.id}"`;
  return txt ? `<button class="btn mini" ${attr}>${txt}</button>` :
    `<button class="chk ${l.pago ? 'on' : ''}" ${attr} title="${l.pago ? 'Desmarcar' : (l.tipo === 'receita' ? 'Marcar como recebido' : 'Marcar como pago')}">${l.pago ? '✓' : ''}</button>`;
}

function linhaHTML(l) {
  const st = R.statusDe(l, hojeISO(), cfg().diasAlerta);
  const dt = `<div class="dt"><b>${l.vencimento.slice(8)}</b><small>${U.diaSemana(l.vencimento)}</small></div>`;
  if (l.fatura) {
    const k = cartaoDe(l.cartaoId);
    const aberta = S.abertas.has(l.key);
    return `<div class="linha fatura st-${st}">
      ${botaoPagar(l)}${dt}
      <div class="desc" data-act="abrir-fatura" data-key="${l.key}"><strong>💳 ${esc(nomeLinha(l))} ${aberta ? '▾' : '▸'}</strong>
        <div class="meta"><span class="chip" style="--c:${k?.cor || '#64748b'}">${l.itens.length} compra${l.itens.length > 1 ? 's' : ''}</span>${ROT_STATUS[st] ? `<span class="tag ${st}">${ROT_STATUS[st]}</span>` : ''}</div></div>
      <div class="val despesa">− ${brl(l.valor)}</div><div class="acts"></div>
    </div>${aberta ? `<div class="sub">${l.itens.map(i => linhaItem(i, true)).join('')}</div>` : ''}`;
  }
  return linhaItem(l, false, st, dt);
}

function linhaItem(c, sub, st = R.statusDe(c, hojeISO(), cfg().diasAlerta), dt) {
  const k = cat(c.categoriaId), m = membroDe(c.membroId);
  return `<div class="linha ${sub ? 'item' : ''} st-${st} ${c.pago ? 'pago' : ''}">
    ${sub ? `<div class="dt"><small>${fmtData(c.data || c.vencimento).slice(0, 5)}</small></div>` : botaoPagar(c) + dt}
    <div class="desc"><strong>${esc(nomeLinha(c))}</strong>
      <div class="meta">
        ${k ? `<span class="chip" style="--c:${k.cor}">${k.icone} ${esc(k.nome)}</span>` : '<span class="chip">❔ sem categoria</span>'}
        ${m ? `<span class="pessoa" style="--c:${m.cor}">${esc(m.nome)}</span>` : ''}
        ${c.forma && !sub ? `<span class="forma">${R.FORMAS[c.forma] || ''}</span>` : ''}
        ${c.recId ? '<span title="Conta fixa mensal">🔁</span>' : ''}
        ${!sub && ROT_STATUS[st] ? `<span class="tag ${st}">${ROT_STATUS[st]}</span>` : ''}
      </div></div>
    <div class="val ${c.tipo}">${c.tipo === 'receita' ? '+' : '−'} ${brl(c.valor)}</div>
    <div class="acts">
      ${c.codigo ? `<button class="ic" data-act="copiar" data-id="${c.id}" title="Copiar código de barras / Pix">⧉</button>` : ''}
      <button class="ic" data-act="editar" data-id="${c.id}" title="Editar">✎</button>
      <button class="ic" data-act="excluir" data-id="${c.id}" title="Excluir">🗑</button>
    </div></div>`;
}

/* ------------------------------------------------------------ CALENDÁRIO */
function vCalendario() {
  const d = D();
  const doMes = d.contas.filter(c => ymOf(c.vencimento) === S.mes);
  const porDia = {};
  R.linhas(d, doMes).forEach(l => (porDia[l.vencimento] ||= []).push(l));
  const primeiro = U.parseISO(S.mes + '-01').getDay();
  const n = U.diasNoMes(S.mes), hoje = hojeISO();
  let cel = '';
  for (let i = 0; i < primeiro; i++) cel += '<div class="dia vazio"></div>';
  for (let i = 1; i <= n; i++) {
    const iso = `${S.mes}-${U.pad(i)}`, ls = porDia[iso] || [];
    const desp = soma(ls.filter(l => l.tipo === 'despesa')), rec = soma(ls.filter(l => l.tipo === 'receita'));
    const pend = ls.some(l => !l.pago && l.tipo === 'despesa');
    const cls = [iso === hoje ? 'hoje' : '', S.diaSel === iso ? 'sel' : '', pend && iso < hoje ? 'atrasado' : ''].join(' ');
    cel += `<button class="dia ${cls}" data-act="dia" data-dia="${iso}"><span class="n">${i}</span>
      ${rec ? `<span class="v pos">+${U.brlCurto(rec)}</span>` : ''}${desp ? `<span class="v ${pend ? 'neg' : 'ok'}">−${U.brlCurto(desp)}</span>` : ''}
      <span class="pontos">${ls.slice(0, 4).map(l => `<i style="background:${l.fatura ? (cartaoDe(l.cartaoId)?.cor || '#64748b') : (cat(l.categoriaId)?.cor || '#94a3b8')}"></i>`).join('')}</span></button>`;
  }
  const sel = S.diaSel && ymOf(S.diaSel) === S.mes ? (porDia[S.diaSel] || []) : null;
  return `<section class="card">
    <div class="cal-cab">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="cal">${cel}</div>
  </section>
  ${sel ? `<section class="card lista"><h3>${U.diaSemana(S.diaSel)}, ${fmtData(S.diaSel)}</h3>${sel.length ? sel.map(linhaHTML).join('') : '<p class="vazio">Nada neste dia.</p>'}
    <button class="btn" data-act="nova" data-dia="${S.diaSel}">+ Lançar neste dia</button></section>` : '<p class="dica">Clique em um dia para ver e lançar contas.</p>'}`;
}

/* --------------------------------------------------------------- CARTÕES */
function vCartoes() {
  const d = D(), hoje = hojeISO();
  if (!d.cartoes.length) return `<section class="card boas-vindas"><h2>💳 Cartões de crédito</h2>
    <p>Cadastre o cartão com o dia de <b>fechamento</b> e de <b>vencimento</b>. Cada compra lançada no cartão vai automaticamente para a fatura correta — inclusive as parceladas.</p>
    <button class="btn prim" data-act="novo-cartao">+ Cadastrar cartão</button></section>`;
  return `<div class="cartoes">${d.cartoes.map(k => {
    const itens = d.contas.filter(c => c.cartaoId === k.id && c.tipo === 'despesa');
    const abertos = itens.filter(c => !c.pago);
    const usado = soma(abertos);
    const faturas = R.linhas(d, abertos).filter(l => l.fatura).slice(0, 4);
    const pctLim = k.limite ? Math.min(100, usado / k.limite * 100) : 0;
    return `<section class="card cartao" style="--c:${k.cor}">
      <div class="cartao-topo"><div><h3>${esc(k.nome)}</h3><small>fecha dia ${k.fechamento} · vence dia ${k.vencimento}</small></div>
        <div><button class="ic" data-act="editar-cartao" data-id="${k.id}" title="Editar">✎</button><button class="ic" data-act="excluir-cartao" data-id="${k.id}" title="Excluir">🗑</button></div></div>
      ${k.limite ? `<div class="limite"><div class="barra"><i style="width:${pctLim}%;background:var(--c)"></i></div><small>${brl(usado)} comprometido de ${brl(k.limite)} · disponível ${brl(k.limite - usado)}</small></div>` : `<small>Em aberto: ${brl(usado)}</small>`}
      <h4>Próximas faturas</h4>
      ${faturas.length ? faturas.map(f => `<div class="mini-linha"><span class="data">${fmtData(f.vencimento).slice(0, 5)}</span><span>${f.itens.length} lançamento(s) ${f.vencimento < hoje ? '<span class="tag vencida">vencida</span>' : ''}</span><b>${brl(f.valor)}</b>${botaoPagar(f, 'Pagar')}</div>`).join('') : '<p class="vazio">Nenhuma fatura em aberto.</p>'}
      <button class="btn mini" data-act="nova" data-cartao="${k.id}">+ Compra neste cartão</button>
    </section>`;
  }).join('')}</div>
  <button class="btn" data-act="novo-cartao">+ Outro cartão</button>`;
}

/* ---------------------------------------------------------- PLANEJAMENTO */
function vPlanejamento() {
  const d = D(), orc = d.meta.orcamento || {};
  const r = R.resumoMes(d, S.mes);
  const pc = R.porCategoria(d, r.todas);
  const cats = d.categorias.filter(c => c.tipo === 'despesa');
  const totOrc = soma(cats, c => orc[c.id] || 0);
  const gastoComLimite = soma(cats.filter(c => orc[c.id]), c => pc[c.id] || 0);
  // plano = maior valor entre o limite e o já previsto, em cada categoria
  const plano = soma(cats, c => Math.max(orc[c.id] || 0, pc[c.id] || 0)) + soma(Object.entries(pc).filter(([id]) => !cats.some(c => c.id === id)), ([, v]) => v);
  const proj = Array.from({ length: 12 }, (_, i) => addMonths(ymOf(hojeISO()), i)).map(m => ({ m, ...R.resumoMes(d, m) }));
  let acum = 0;
  return `
  <div class="kpis">
    ${kpi('Receitas previstas', brl(r.receitas), U.nomeMes(S.mes), 'pos')}
    ${kpi('Gasto planejado no mês', brl(plano), totOrc ? `limites somam ${brl(totOrc)} · ${Math.round(gastoComLimite / totOrc * 100)}% usado` : 'contas previstas + limites', '')}
    ${kpi('Sobra planejada', brl(r.receitas - plano), 'receitas − gasto planejado', r.receitas - plano >= 0 ? 'pos' : 'neg')}
  </div>
  <section class="card">
    <h3>🎯 Limite de gastos por categoria (mensal)</h3>
    <p class="dica">Defina quanto a família pretende gastar por mês em cada categoria. O painel avisa quando passar de 80%.</p>
    <div class="orc">
      ${cats.map(c => { const g = pc[c.id] || 0, v = orc[c.id] || 0, p = v ? g / v * 100 : 0; return `
      <div class="orc-linha"><span>${c.icone} ${esc(c.nome)}</span>
        <input inputmode="decimal" placeholder="sem limite" data-orc="${c.id}" value="${U.centParaInput(v)}">
        <div class="barra"><i style="width:${Math.min(100, p)}%;background:${p > 100 ? 'var(--neg)' : p >= 80 ? 'var(--aviso)' : c.cor}"></i></div>
        <small>${brl(g)}${v ? ` · ${Math.round(p)}%` : ''}</small></div>`; }).join('')}
    </div>
  </section>
  <section class="card">
    <h3>📅 Projeção dos próximos 12 meses</h3>
    <p class="dica">Considera contas fixas, parcelas e faturas já lançadas. Compras do dia a dia ainda não lançadas não entram.</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th><th>Acumulado</th></tr></thead><tbody>
    ${proj.map(x => { const s = x.receitas - x.despesas; acum += s; return `<tr><td>${U.nomeMes(x.m)}</td><td class="pos">${brl(x.receitas)}</td><td class="neg">${brl(x.despesas)}</td><td class="${s >= 0 ? 'pos' : 'neg'}">${brl(s)}</td><td class="${acum >= 0 ? 'pos' : 'neg'}">${brl(acum)}</td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;
}

/* ---------------------------------------------------------------- CONFIG */
function vConfig() {
  const d = D();
  const notif = 'Notification' in window ? Notification.permission : 'indisponivel';
  return `
  <section class="card">
    <h3>👨‍👩‍👧 Família</h3>
    <label class="campo">Nome da família <input data-meta="nome" value="${esc(d.meta.nome || '')}"></label>
    <h4>Pessoas (responsáveis pelas contas)</h4>
    <div class="pessoas">${d.membros.map(m => `<span class="pessoa grande" style="--c:${m.cor}">${esc(m.nome)} <button class="ic" data-act="editar-membro" data-id="${m.id}">✎</button><button class="ic" data-act="excluir-membro" data-id="${m.id}">✕</button></span>`).join('') || '<span class="vazio">Nenhuma pessoa cadastrada.</span>'}
    <button class="btn mini" data-act="novo-membro">+ Pessoa</button></div>
    ${store.modo === 'firebase' ? `<h4>Acesso compartilhado</h4>
      <p>Para outra pessoa acessar esta mesma família: ela cria a conta no site e informa o código de convite <b class="codigo">${esc(store.info.inviteCode || '…')}</b> <button class="ic" data-act="copiar-texto" data-texto="${esc(store.info.inviteCode || '')}">⧉</button></p>
      <p class="dica">Conectado como ${esc(user?.email || '')} · ${store.info.usuarios?.length || 1} acesso(s) nesta família. <button class="link" data-act="sair">Sair</button></p>` : ''}
  </section>
  <section class="card">
    <h3>🔔 Alertas</h3>
    <label class="campo">Avisar com quantos dias de antecedência
      <select data-cfg="diasAlerta">${[1, 2, 3, 5, 7, 10].map(n => `<option ${Number(cfg().diasAlerta) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p>Notificações no navegador/celular: <b>${{ granted: 'ativadas ✓', denied: 'bloqueadas no navegador', default: 'desativadas', indisponivel: 'não suportadas neste navegador' }[notif]}</b>
      ${notif === 'default' ? '<button class="btn mini" data-act="ativar-notif">Ativar</button>' : ''}</p>
    <p>Exporte os vencimentos para a <b>agenda do celular</b> (Google Agenda, Apple, Outlook) com lembretes automáticos:
      <button class="btn mini" data-act="ics">📅 Baixar agenda (.ics)</button></p>
    <p class="dica">Os avisos aparecem ao abrir o sistema (banner, contador na aba e notificação diária). Para avisos por e-mail/WhatsApp mesmo com o site fechado, veja o roteiro no README (requer servidor).</p>
  </section>
  <section class="card">
    <h3>🏷️ Categorias</h3>
    <div class="cats">${d.categorias.map(c => `<span class="chip grande" style="--c:${c.cor}">${c.icone} ${esc(c.nome)} <small>${c.tipo}</small> <button class="ic" data-act="editar-cat" data-id="${c.id}">✎</button></span>`).join('')}</div>
    <button class="btn mini" data-act="nova-cat">+ Categoria</button>
    <p class="dica">O sistema aprende: quando você corrige a categoria de um lançamento, as próximas contas com o mesmo nome já vêm identificadas. (${Object.keys(d.meta.aprendizado || {}).length} termos aprendidos)</p>
  </section>
  <section class="card">
    <h3>💾 Dados</h3>
    <div class="acoes">
      <button class="btn" data-act="backup">Baixar backup (.json)</button>
      <label class="btn">Restaurar backup<input type="file" accept=".json" data-act-change="restaurar" hidden></label>
      <button class="btn" data-act="csv">Exportar mês em planilha (.csv)</button>
      <button class="btn ghost" data-act="exemplo">Carregar dados de exemplo</button>
      <button class="btn perigo" data-act="apagar-tudo">Apagar tudo</button>
    </div>
    ${store.modo === 'local' ? '<p class="dica">⚠️ Modo local: os dados estão salvos só neste navegador. Faça backups ou ative o Firebase (README) para sincronizar entre celulares.</p>' : ''}
  </section>
  <p class="rodape">${APP} · versão 0.1 (beta)</p>`;
}

/* ============================================================== EVENTOS */
async function aoClicar(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, d = D && store ? D() : null;
  switch (a) {
    case 'mes-ant': S.mes = addMonths(S.mes, -1); garantirRecorrencias(); return render();
    case 'mes-prox': S.mes = addMonths(S.mes, 1); garantirRecorrencias(); return render();
    case 'mes-hoje': S.mes = ymOf(hojeISO()); return render();
    case 'nova': return formConta(null, { data: b.dataset.dia, cartaoId: b.dataset.cartao, forma: b.dataset.cartao ? 'cartao' : undefined });
    case 'editar': return formConta(d.contas.find(c => c.id === id));
    case 'excluir': return excluirConta(d.contas.find(c => c.id === id));
    case 'pagar': { const c = d.contas.find(x => x.id === id); return store.put('conta', { ...c, pago: !c.pago, pagoEm: !c.pago ? hojeISO() : null }).then(() => !c.pago && toast(c.tipo === 'receita' ? 'Recebimento registrado ✓' : 'Pagamento registrado ✓')); }
    case 'pagar-fatura': {
      const [kid, venc] = b.dataset.key.split('|');
      const itens = d.contas.filter(c => c.cartaoId === kid && c.vencimento === venc && c.tipo === 'despesa');
      const todos = itens.every(c => c.pago);
      await store.putMany(itens.map(c => ['conta', { ...c, pago: !todos, pagoEm: !todos ? hojeISO() : null }]));
      return toast(todos ? 'Fatura reaberta' : 'Fatura paga ✓');
    }
    case 'abrir-fatura': S.abertas.has(b.dataset.key) ? S.abertas.delete(b.dataset.key) : S.abertas.add(b.dataset.key); return render();
    case 'copiar': return copiar(d.contas.find(c => c.id === id).codigo);
    case 'copiar-texto': return copiar(b.dataset.texto);
    case 'dia': S.diaSel = b.dataset.dia; return render();
    case 'novo-cartao': return formCartao();
    case 'editar-cartao': return formCartao(cartaoDe(id));
    case 'excluir-cartao': return excluirCartao(cartaoDe(id));
    case 'novo-membro': return formMembro();
    case 'editar-membro': return formMembro(membroDe(id));
    case 'excluir-membro': if (await confirmar('Remover esta pessoa? Os lançamentos dela ficam sem responsável.')) store.del('membro', id); return;
    case 'nova-cat': return formCategoria();
    case 'editar-cat': return formCategoria(cat(id));
    case 'exemplo': return carregarExemplo();
    case 'backup': return U.baixar(`lar-em-dia-backup-${hojeISO()}.json`, JSON.stringify(d, null, 1));
    case 'csv': return exportarCSV();
    case 'ics': return exportarICS();
    case 'ativar-notif': return Notification.requestPermission().then(() => { render(); notificarDoDia(true); });
    case 'apagar-tudo':
      if (await confirmar('Apagar TODOS os dados desta família? Faça um backup antes. Esta ação não pode ser desfeita.', 'Apagar tudo')) {
        await store.replaceAll({ ...dadosVazios(), categorias: R.categoriasPadrao() }); toast('Dados apagados');
      } return;
    case 'sair': return fb.sair();
    case 'fechar-modal': return fecharModal();
  }
}

function aoMudar(e) {
  const t = e.target;
  if (t.dataset.filtro && t.dataset.filtro !== 'busca') { S.f[t.dataset.filtro] = t.value; render(); }
  if (t.dataset.orc) { const orc = { ...(D().meta.orcamento || {}) }; const v = U.parseValor(t.value); if (v) orc[t.dataset.orc] = v; else delete orc[t.dataset.orc]; store.setMeta({ orcamento: orc }); }
  if (t.dataset.meta) store.setMeta({ [t.dataset.meta]: t.value });
  if (t.dataset.cfg) store.setMeta({ config: { ...cfg(), [t.dataset.cfg]: Number(t.value) } });
  if (t.dataset.actChange === 'restaurar') restaurar(t.files[0]);
}
let tBusca;
function aoDigitar(e) {
  if (e.target.dataset.filtro === 'busca') {
    S.f.busca = e.target.value; clearTimeout(tBusca);
    tBusca = setTimeout(() => { const pos = e.target.selectionStart; render(); const i = $('[data-filtro="busca"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 250);
  }
}

/* ============================================================ LANÇAMENTO */
function lancamentoRapido() {
  const inp = $('#rapido input'), txt = inp.value.trim();
  if (!txt) return formConta();
  const r = R.interpretar(D(), txt, S.mes);
  inp.value = '';
  formConta(null, r);
}

function formConta(c, pre = {}) {
  const d = D(), novo = !c;
  const v = c || { tipo: pre.tipo || 'despesa', descricao: pre.descricao || '', valor: pre.valor || 0, categoriaId: pre.categoriaId || '',
    forma: pre.forma || (pre.tipo === 'receita' ? 'deposito' : 'boleto'), cartaoId: pre.cartaoId || d.cartoes[0]?.id || '',
    membroId: '', data: pre.data || (S.mes === ymOf(hojeISO()) ? hojeISO() : S.mes + '-10'), pago: !!pre.pago, obs: '', codigo: '' };
  const rep = pre.repeticao || 'unica';
  const dataCampo = c ? (c.data || c.vencimento) : v.data;
  const opts = (arr, sel) => arr.map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const catsDo = tipo => d.categorias.filter(x => x.tipo === tipo).map(x => [x.id, x.icone + ' ' + x.nome]);
  abrirModal(`
  <form id="f-conta" class="form">
    <h2>${novo ? 'Novo lançamento' : 'Editar lançamento'}</h2>
    <div class="seg">${['despesa', 'receita'].map(t => `<label><input type="radio" name="tipo" value="${t}" ${v.tipo === t ? 'checked' : ''}><span>${t === 'despesa' ? '− Despesa / conta' : '+ Receita'}</span></label>`).join('')}</div>
    <label class="campo">Descrição <input name="descricao" required value="${esc(v.descricao)}" placeholder="Ex.: Conta de luz" autocomplete="off"></label>
    <div class="linha2">
      <label class="campo">Valor (R$) <input name="valor" required inputmode="decimal" value="${U.centParaInput(v.valor)}" placeholder="0,00"></label>
      <label class="campo">Categoria <select name="categoriaId"><option value="">— identificar —</option>${opts(catsDo(v.tipo), v.categoriaId)}</select><small id="sug"></small></label>
    </div>
    <div class="linha2">
      <label class="campo">Forma <select name="forma">${opts(Object.entries(R.FORMAS), v.forma)}</select></label>
      <label class="campo" data-so="cartao">Cartão <select name="cartaoId">${d.cartoes.length ? opts(d.cartoes.map(k => [k.id, k.nome]), v.cartaoId) : '<option value="">cadastre um cartão</option>'}</select></label>
    </div>
    <div class="linha2">
      <label class="campo"><span data-rot-data>Vencimento</span> <input type="date" name="data" required value="${dataCampo}"></label>
      <label class="campo">Responsável <select name="membroId"><option value="">—</option>${opts(d.membros.map(m => [m.id, m.nome]), v.membroId)}</select></label>
    </div>
    <small id="info-fatura" class="dica"></small>
    ${novo ? `
    <div class="campo">Repetição
      <div class="seg">${[['unica', 'Só uma vez'], ['fixa', '🔁 Todo mês'], ['parcelada', 'Parcelada']].map(([k, t]) => `<label><input type="radio" name="rep" value="${k}" ${rep === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
    </div>
    <div class="linha2" data-so="parcelada">
      <label class="campo">Nº de parcelas <input name="parcelas" type="number" min="2" max="120" value="${pre.parcelas || 2}"></label>
      <label class="campo">O valor informado é <select name="modoValor"><option value="total">o total da compra</option><option value="parcela">o de cada parcela</option></select></label>
    </div>` : (c.recId || c.grupoId ? `
    <label class="campo">Aplicar alteração em <select name="aplicar"><option value="este">só este lançamento</option><option value="futuros">este e os próximos ${c.recId ? 'meses' : 'parcelas'}</option></select></label>` : '')}
    <details ${v.codigo || v.obs ? 'open' : ''}><summary>Código de barras, Pix e observações</summary>
      <label class="campo">Código de barras / Pix copia e cola <input name="codigo" value="${esc(v.codigo || '')}"></label>
      <label class="campo">Observação <textarea name="obs" rows="2">${esc(v.obs || '')}</textarea></label>
    </details>
    <label class="check"><input type="checkbox" name="pago" ${v.pago ? 'checked' : ''}> <span data-rot-pago>Já está pago</span></label>
    <div class="acoes fim"><button type="button" class="btn ghost" data-act="fechar-modal">Cancelar</button><button class="btn prim">Salvar</button></div>
  </form>`);

  const f = $('#f-conta');
  const atualizar = () => {
    const tipo = f.tipo.value, forma = f.forma.value, repv = f.rep?.value;
    const catSel = f.categoriaId.value;
    f.categoriaId.innerHTML = `<option value="">— identificar —</option>${opts(catsDo(tipo), catSel)}`;
    $$('[data-so="cartao"]', f).forEach(el => el.hidden = forma !== 'cartao');
    $$('[data-so="parcelada"]', f).forEach(el => el.hidden = repv !== 'parcelada');
    $('[data-rot-data]', f).textContent = forma === 'cartao' ? 'Data da compra' : tipo === 'receita' ? 'Data prevista' : 'Vencimento';
    $('[data-rot-pago]', f).textContent = tipo === 'receita' ? 'Já recebido' : 'Já está pago';
    const k = cartaoDe(f.cartaoId.value);
    $('#info-fatura').textContent = forma === 'cartao' && k && f.data.value ? `Entra na fatura com vencimento em ${fmtData(R.vencFatura(k, f.data.value))}.` : '';
    sugerir();
  };
  const sugerir = () => {
    const s = R.sugerirCategoria(d, f.descricao.value, f.tipo.value);
    const el = $('#sug');
    if (s && !f.categoriaId.value) { const k = cat(s); el.innerHTML = `identificado: <b>${k.icone} ${esc(k.nome)}</b>`; el.dataset.sug = s; }
    else { el.textContent = ''; delete el.dataset.sug; }
  };
  f.addEventListener('change', atualizar);
  f.descricao.addEventListener('input', sugerir);
  atualizar();
  f.addEventListener('submit', async ev => { ev.preventDefault(); await salvarConta(f, c); });
  if (novo && !v.descricao) setTimeout(() => f.descricao.focus(), 50);
}

async function salvarConta(f, orig) {
  const d = D();
  const fd = Object.fromEntries(new FormData(f));
  const valor = U.parseValor(fd.valor);
  if (!valor) return toast('Informe um valor válido');
  const categoriaId = fd.categoriaId || $('#sug')?.dataset.sug || (fd.tipo === 'receita' ? 'outros-r' : 'outros-d');
  const cartao = fd.forma === 'cartao' ? cartaoDe(fd.cartaoId) : null;
  if (fd.forma === 'cartao' && !cartao) return toast('Cadastre um cartão primeiro (aba Cartões)');
  const base = { tipo: fd.tipo, descricao: fd.descricao.trim(), valor, categoriaId, forma: fd.forma, cartaoId: cartao ? cartao.id : null,
    membroId: fd.membroId || null, codigo: fd.codigo?.trim() || '', obs: fd.obs?.trim() || '' };
  const data = fd.data, pago = !!fd.pago;
  const venc = (dt, off = 0) => cartao ? R.vencFatura(cartao, dt, off) : dt;
  const ops = [];

  if (orig) {
    const off = orig.grupoId && cartao ? orig.parcela.n - 1 : 0;
    ops.push(['conta', { ...orig, ...base, data, vencimento: venc(data, off), pago, pagoEm: pago ? (orig.pagoEm || hojeISO()) : null }]);
    if (fd.aplicar === 'futuros' && orig.recId) {
      const r = d.recorrentes.find(x => x.id === orig.recId);
      if (r) {
        const nr = { ...r, ...base, dia: U.diaOf(data) };
        ops.push(['recorrente', nr]);
        d.contas.filter(c => c.recId === r.id && c.comp > orig.comp && !c.pago).forEach(c => {
          const oc = R.ocorrencia({ ...d, cartoes: d.cartoes }, nr, c.comp);
          ops.push(['conta', { ...c, ...base, data: oc.data, vencimento: oc.vencimento }]);
        });
      }
    }
    if (fd.aplicar === 'futuros' && orig.grupoId) {
      d.contas.filter(c => c.grupoId === orig.grupoId && c.parcela.n > orig.parcela.n && !c.pago)
        .forEach(c => ops.push(['conta', { ...c, ...base, vencimento: cartao ? R.vencFatura(cartao, c.data, c.parcela.n - 1) : c.vencimento }]));
    }
  } else if (fd.rep === 'fixa') {
    const r = { id: U.uid(), ...base, dia: U.diaOf(data), inicio: ymOf(data), fim: null, pulos: [] };
    ops.push(['recorrente', r]);
    const prim = R.ocorrencia({ ...d }, r, ymOf(data));
    ops.push(['conta', { ...prim, data, vencimento: venc(data), pago, pagoEm: pago ? hojeISO() : null }]);
    const tmp = { ...d, recorrentes: [r], contas: [prim] };
    const hoje = ymOf(hojeISO());
    R.faltantes(tmp, [addMonths(ymOf(data), 1), hoje, addMonths(hoje, 1), S.mes].filter(m => m > ymOf(data))).forEach(o => ops.push(['conta', o]));
  } else if (fd.rep === 'parcelada') {
    const n = Math.max(2, Math.min(120, Number(fd.parcelas) || 2));
    const total = fd.modoValor === 'parcela' ? valor * n : valor;
    const unit = Math.floor(total / n), resto = total - unit * n;
    const grupoId = U.uid();
    for (let k = 0; k < n; k++) {
      const dt = cartao ? data : U.dataNoMes(addMonths(ymOf(data), k), U.diaOf(data));
      ops.push(['conta', { id: U.uid() + k, ...base, valor: unit + (k === 0 ? resto : 0), data: dt, vencimento: cartao ? R.vencFatura(cartao, data, k) : dt,
        grupoId, parcela: { n: k + 1, total: n }, pago: k === 0 && pago, pagoEm: k === 0 && pago ? hojeISO() : null }]);
    }
  } else {
    ops.push(['conta', { id: U.uid(), ...base, data, vencimento: venc(data), pago, pagoEm: pago ? hojeISO() : null }]);
  }
  await store.putMany(ops);
  const ap = R.aprender(d, base.descricao, categoriaId);
  if (ap) store.setMeta({ aprendizado: ap });
  fecharModal();
  const vencPrim = ops.find(o => o[0] === 'conta')?.[1].vencimento;
  if (vencPrim && ymOf(vencPrim) !== S.mes && !orig) toast(`Salvo ✓ — vence em ${fmtData(vencPrim)} (${U.nomeMes(ymOf(vencPrim))})`);
  else toast('Salvo ✓');
}

async function excluirConta(c) {
  const d = D();
  if (c.recId) {
    const op = await escolher('Excluir conta fixa', `"${c.descricao}" se repete todo mês.`, [['este', 'Só este mês'], ['futuros', 'Este e os próximos (encerrar)'], ['', 'Cancelar']]);
    if (!op) return;
    const r = d.recorrentes.find(x => x.id === c.recId);
    if (op === 'este') {
      if (r) await store.put('recorrente', { ...r, pulos: [...(r.pulos || []), c.comp] });
      await store.del('conta', c.id);
    } else {
      if (r) await store.put('recorrente', { ...r, fim: addMonths(c.comp, -1) });
      await store.delMany(d.contas.filter(x => x.recId === c.recId && x.comp >= c.comp && !x.pago).map(x => ['conta', x.id]));
    }
  } else if (c.grupoId) {
    const op = await escolher('Excluir parcela', `"${c.descricao}" — parcela ${c.parcela.n} de ${c.parcela.total}.`, [['este', 'Só esta parcela'], ['futuros', 'Esta e as seguintes'], ['todas', 'Todas as parcelas'], ['', 'Cancelar']]);
    if (!op) return;
    const alvo = op === 'este' ? [c] : d.contas.filter(x => x.grupoId === c.grupoId && (op === 'todas' || x.parcela.n >= c.parcela.n));
    await store.delMany(alvo.map(x => ['conta', x.id]));
  } else {
    if (!await confirmar(`Excluir "${c.descricao}" (${brl(c.valor)})?`, 'Excluir')) return;
    await store.del('conta', c.id);
  }
  toast('Excluído');
}

/* ======================================================= OUTROS FORMULÁRIOS */
const CORES = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#0ea5e9', '#10b981', '#64748b', '#f97316'];
const seletorCor = sel => `<div class="cores">${CORES.map(c => `<label><input type="radio" name="cor" value="${c}" ${c === sel ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div>`;

function formCartao(k) {
  abrirModal(`<form id="f" class="form"><h2>${k ? 'Editar cartão' : 'Novo cartão de crédito'}</h2>
    <label class="campo">Nome <input name="nome" required value="${esc(k?.nome || '')}" placeholder="Ex.: Nubank, Inter, Sicredi"></label>
    <div class="linha2"><label class="campo">Dia do fechamento <input name="fechamento" type="number" min="1" max="31" required value="${k?.fechamento || ''}"></label>
    <label class="campo">Dia do vencimento <input name="vencimento" type="number" min="1" max="31" required value="${k?.vencimento || ''}"></label></div>
    <label class="campo">Limite (opcional) <input name="limite" inputmode="decimal" value="${U.centParaInput(k?.limite)}"></label>
    <div class="campo">Cor ${seletorCor(k?.cor || CORES[5])}</div>
    <p class="dica">Compras feitas no dia do fechamento ou depois entram na fatura seguinte.</p>
    <div class="acoes fim"><button type="button" class="btn ghost" data-act="fechar-modal">Cancelar</button><button class="btn prim">Salvar</button></div></form>`);
  $('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const novo = { id: k?.id || U.uid(), nome: fd.nome.trim(), fechamento: Number(fd.fechamento), vencimento: Number(fd.vencimento), limite: U.parseValor(fd.limite), cor: fd.cor };
    const ops = [['cartao', novo]];
    if (k && (k.fechamento !== novo.fechamento || k.vencimento !== novo.vencimento)) {
      D().contas.filter(c => c.cartaoId === k.id && !c.pago).forEach(c => ops.push(['conta', { ...c, vencimento: R.vencFatura(novo, c.data, c.parcela && c.grupoId ? c.parcela.n - 1 : 0) }]));
    }
    await store.putMany(ops); fecharModal(); toast('Cartão salvo ✓');
  });
}

async function excluirCartao(k) {
  const n = D().contas.filter(c => c.cartaoId === k.id).length;
  if (!await confirmar(`Excluir o cartão ${k.nome}?${n ? ` Os ${n} lançamento(s) dele continuam, como despesas avulsas.` : ''}`, 'Excluir')) return;
  await store.putMany(D().contas.filter(c => c.cartaoId === k.id).map(c => ['conta', { ...c, cartaoId: null, forma: 'boleto' }]));
  await store.del('cartao', k.id);
}

function formMembro(m) {
  abrirModal(`<form id="f" class="form"><h2>${m ? 'Editar pessoa' : 'Nova pessoa da família'}</h2>
    <label class="campo">Nome <input name="nome" required value="${esc(m?.nome || '')}"></label>
    <div class="campo">Cor ${seletorCor(m?.cor || CORES[D().membros.length % CORES.length])}</div>
    <div class="acoes fim"><button type="button" class="btn ghost" data-act="fechar-modal">Cancelar</button><button class="btn prim">Salvar</button></div></form>`);
  $('#f').addEventListener('submit', async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    await store.put('membro', { id: m?.id || U.uid(), nome: fd.nome.trim(), cor: fd.cor }); fecharModal();
  });
}

function formCategoria(c) {
  abrirModal(`<form id="f" class="form"><h2>${c ? 'Editar categoria' : 'Nova categoria'}</h2>
    <div class="linha2"><label class="campo">Ícone (emoji) <input name="icone" maxlength="4" value="${esc(c?.icone || '🏷️')}"></label>
    <label class="campo">Tipo <select name="tipo"><option value="despesa" ${c?.tipo !== 'receita' ? 'selected' : ''}>Despesa</option><option value="receita" ${c?.tipo === 'receita' ? 'selected' : ''}>Receita</option></select></label></div>
    <label class="campo">Nome <input name="nome" required value="${esc(c?.nome || '')}"></label>
    <label class="campo">Palavras que identificam (separe por vírgula) <input name="palavras" value="${esc((c?.palavras || []).join(', '))}" placeholder="ex.: academia, smartfit"></label>
    <div class="campo">Cor ${seletorCor(c?.cor || CORES[0])}</div>
    <div class="acoes fim">${c ? '<button type="button" class="btn perigo" id="del-cat">Excluir</button>' : ''}<button type="button" class="btn ghost" data-act="fechar-modal">Cancelar</button><button class="btn prim">Salvar</button></div></form>`);
  $('#f').addEventListener('submit', async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    await store.put('categoria', { id: c?.id || U.uid(), nome: fd.nome.trim(), icone: fd.icone || '🏷️', tipo: fd.tipo, cor: fd.cor,
      palavras: fd.palavras.split(',').map(s => U.norm(s)).filter(Boolean) });
    fecharModal();
  });
  $('#del-cat')?.addEventListener('click', async () => {
    if (D().contas.some(x => x.categoriaId === c.id)) return toast('Há lançamentos nesta categoria; mude-os antes de excluir.');
    await store.del('categoria', c.id); fecharModal();
  });
}

/* ================================================== EXPORTAÇÕES E ALERTAS */
async function carregarExemplo() {
  if ((D().contas.length || D().recorrentes.length) && !await confirmar('Substituir os dados atuais pelos dados de exemplo?', 'Substituir')) return;
  await store.replaceAll(R.exemplo(ymOf(hojeISO())));
  S.mes = ymOf(hojeISO()); location.hash = '#painel'; toast('Dados de exemplo carregados');
}

async function restaurar(arq) {
  if (!arq) return;
  try {
    const dados = JSON.parse(await arq.text());
    if (!Array.isArray(dados.contas)) throw new Error();
    if (!await confirmar(`Restaurar backup com ${dados.contas.length} lançamentos? Os dados atuais serão substituídos.`, 'Restaurar')) return;
    await store.replaceAll(dados); toast('Backup restaurado ✓');
  } catch { toast('Arquivo de backup inválido'); }
}

function exportarCSV() {
  const linhasCsv = [['Vencimento', 'Tipo', 'Descrição', 'Parcela', 'Categoria', 'Forma', 'Cartão', 'Responsável', 'Valor', 'Situação']];
  D().contas.filter(c => ymOf(c.vencimento) === S.mes).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).forEach(c => linhasCsv.push([
    fmtData(c.vencimento), c.tipo, c.descricao, c.parcela ? `${c.parcela.n}/${c.parcela.total}` : '', cat(c.categoriaId)?.nome || '',
    R.FORMAS[c.forma] || '', cartaoDe(c.cartaoId)?.nome || '', membroDe(c.membroId)?.nome || '',
    ((c.tipo === 'receita' ? 1 : -1) * c.valor / 100).toFixed(2).replace('.', ','), c.pago ? 'pago' : 'em aberto']));
  const csv = '﻿' + linhasCsv.map(l => l.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  U.baixar(`contas-${S.mes}.csv`, csv, 'text/csv;charset=utf-8');
}

function exportarICS() {
  const d = D(), hoje = hojeISO(), dias = cfg().diasAlerta;
  const ls = R.linhas(d, d.contas.filter(c => !c.pago && c.tipo === 'despesa' && c.vencimento >= hoje && c.vencimento <= U.addDias(hoje, 400)));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const escI = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ev = ls.map(l => {
    const dt = l.vencimento.replace(/-/g, ''), fim = U.addDias(l.vencimento, 1).replace(/-/g, '');
    const uidEv = (l.fatura ? 'fat-' + l.key.replace('|', '-') : l.id) + '@laremdia';
    return ['BEGIN:VEVENT', `UID:${uidEv}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dt}`, `DTEND;VALUE=DATE:${fim}`,
      `SUMMARY:${escI(`💸 Pagar: ${nomeLinha(l)} — ${brl(l.valor)}`)}`, `DESCRIPTION:${escI(`${APP} · ${l.fatura ? l.itens.length + ' compra(s)' : (cat(l.categoriaId)?.nome || '')}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI('Vence em ' + dias + ' dia(s): ' + nomeLinha(l))}`, `TRIGGER:-P${dias}D`, 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI('Vence hoje: ' + nomeLinha(l))}`, 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP}//PT-BR`, 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${APP} — vencimentos`, ...ev, 'END:VCALENDAR'].join('\r\n');
  U.baixar('vencimentos-lar-em-dia.ics', ics, 'text/calendar');
  toast(`${ls.length} vencimento(s) exportado(s)`);
}

async function notificarDoDia(forcar) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  let ultimo; try { ultimo = localStorage.getItem('laremdia:notif'); } catch { }
  if (!forcar && ultimo === hojeISO()) return;
  const al = R.alertas(D());
  const n = al.vencidas.length + al.hoje.length + al.breve.length;
  if (!n && !forcar) return;
  const corpo = n ? [al.vencidas.length && `${al.vencidas.length} vencida(s)`, al.hoje.length && `${al.hoje.length} vence(m) hoje`, al.breve.length && `${al.breve.length} nos próximos dias`].filter(Boolean).join(' · ')
    : 'Notificações ativadas. Você será avisado das contas a vencer.';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(APP, { body: corpo, icon: 'icons/icon.svg', tag: 'contas-do-dia' });
    else new Notification(APP, { body: corpo, icon: 'icons/icon.svg' });
    localStorage.setItem('laremdia:notif', hojeISO());
  } catch (e) { console.warn(e); }
}

/* ================================================================ LOGIN */
function telaLogin(modo = 'entrar', msg = '') {
  $('#app').hidden = true; const a = $('#auth'); a.hidden = false;
  a.innerHTML = `<form class="auth-card" id="f-auth">
    <div class="logo grande"><img src="icons/icon.svg" alt=""> ${APP}</div>
    <p>Contas da casa em dia, com alertas e planejamento para a família.</p>
    <h2>${modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Recuperar senha'}</h2>
    <label class="campo">E-mail <input name="email" type="email" required autocomplete="email"></label>
    ${modo !== 'recuperar' ? `<label class="campo">Senha <input name="senha" type="password" required minlength="6" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}"></label>` : ''}
    ${msg ? `<p class="erro">${esc(msg)}</p>` : ''}
    <button class="btn prim largo">${modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Enviar link'}</button>
    <div class="auth-links">
      ${modo !== 'entrar' ? '<button type="button" class="link" data-modo="entrar">Já tenho conta</button>' : '<button type="button" class="link" data-modo="cadastrar">Criar conta grátis</button><button type="button" class="link" data-modo="recuperar">Esqueci a senha</button>'}
    </div></form>`;
  $$('[data-modo]', a).forEach(b => b.onclick = () => telaLogin(b.dataset.modo));
  $('#f-auth').onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try {
      if (modo === 'entrar') await fb.entrar(fd.email, fd.senha);
      else if (modo === 'cadastrar') await fb.cadastrar(fd.email, fd.senha);
      else { await fb.recuperar(fd.email); telaLogin('entrar', 'Enviamos um link para redefinir a senha.'); }
    } catch (err) { telaLogin(modo, traduzErro(err)); }
  };
}

function telaFamilia(msg = '') {
  $('#app').hidden = true; const a = $('#auth'); a.hidden = false;
  a.innerHTML = `<div class="auth-card">
    <div class="logo grande"><img src="icons/icon.svg" alt=""> ${APP}</div>
    <h2>Quase lá!</h2>
    <form id="f-nova"><label class="campo">Criar a minha família <input name="nome" required placeholder="Ex.: Família Silva"></label><button class="btn prim largo">Criar família</button></form>
    <p class="ou">ou</p>
    <form id="f-cod"><label class="campo">Entrar numa família com código de convite <input name="codigo" required placeholder="ABCD2345" style="text-transform:uppercase"></label><button class="btn largo">Entrar com código</button></form>
    ${msg ? `<p class="erro">${esc(msg)}</p>` : ''}
    <button class="link" id="sair">Sair (${esc(user.email)})</button></div>`;
  $('#f-nova').onsubmit = async e => { e.preventDefault(); try { abrir(await fb.criarFamilia(user, e.target.nome.value.trim())); } catch (err) { telaFamilia(traduzErro(err)); } };
  $('#f-cod').onsubmit = async e => { e.preventDefault(); try { abrir(await fb.entrarComCodigo(user, e.target.codigo.value)); } catch (err) { telaFamilia(err.message?.includes('não encontrado') ? err.message : traduzErro(err)); } };
  $('#sair').onclick = () => fb.sair();
}

function traduzErro(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail não cadastrado.',
    'auth/email-already-in-use': 'Este e-mail já tem conta. Use "Já tenho conta".', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'E-mail inválido.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.', 'permission-denied': 'Sem permissão (verifique o código ou as regras do Firestore).'
  })[c] || e?.message || 'Erro inesperado.';
}

/* ============================================================ INTERFACE */
function abrirModal(html) { const m = $('#modal'); m.innerHTML = html; if (!m.open) m.showModal(); }
function fecharModal() { const m = $('#modal'); if (m.open) m.close(); m.innerHTML = ''; }
function escolher(titulo, texto, botoes) {
  return new Promise(res => {
    abrirModal(`<div class="form"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p><div class="acoes fim col">${botoes.map(([v, t], i) => `<button class="btn ${i === 0 ? 'prim' : v === '' ? 'ghost' : ''}" data-v="${v}">${esc(t)}</button>`).join('')}</div></div>`);
    $$('#modal [data-v]').forEach(b => b.onclick = () => { fecharModal(); res(b.dataset.v); });
    $('#modal').addEventListener('close', () => res(''), { once: true });
  });
}
const confirmar = (texto, ok = 'Confirmar') => escolher('Confirmar', texto, [['sim', ok], ['', 'Cancelar']]).then(v => v === 'sim');
let tToast;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('vis'); clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove('vis'), 2600); }
async function copiar(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado ✓'); } catch { prompt('Copie o código:', txt); } }

function registrarSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}

iniciar();
