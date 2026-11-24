// Camada de dados do Lar em Dia.
// Dois modos com a mesma interface:
//   - local: tudo salvo no navegador (localStorage) — bom para testes e demonstração
//   - firebase: login por e-mail/senha e dados da família sincronizados no Firestore
//
// Interface comum:
//   store.data = { contas, recorrentes, cartoes, categorias, membros, meta }
//   store.put(kind, obj) | store.putMany([[kind,obj],...]) | store.del(kind,id) | store.delMany([[kind,id],...])
//   store.setMeta(patch) | store.replaceAll(data)

export const KINDS = { conta: 'contas', recorrente: 'recorrentes', cartao: 'cartoes', categoria: 'categorias', membro: 'membros' };

export function dadosVazios() {
  return {
    contas: [], recorrentes: [], cartoes: [], categorias: [], membros: [],
    meta: { nome: 'Minha família', config: { diasAlerta: 3 }, orcamento: {}, aprendizado: {} }
  };
}

function aplicarPut(data, kind, obj) {
  const arr = data[KINDS[kind]];
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
}
function aplicarDel(data, kind, id) {
  const arr = data[KINDS[kind]];
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr.splice(i, 1);
}

/* ------------------------------------------------------------------ LOCAL */
const CHAVE = 'laremdia:v1';

export function criarStoreLocal(onChange) {
  let data;
  try { data = JSON.parse(localStorage.getItem(CHAVE)) || dadosVazios(); }
  catch { data = dadosVazios(); }
  const base = dadosVazios();
  for (const k of Object.keys(base)) if (!data[k]) data[k] = base[k];
  data.meta = { ...base.meta, ...data.meta, config: { ...base.meta.config, ...(data.meta.config || {}) } };

  const salvar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(data)); } catch (e) { console.warn('Falha ao salvar', e); }
    onChange();
  };
  return {
    modo: 'local',
    get data() { return data; },
    async put(kind, obj) { aplicarPut(data, kind, obj); salvar(); },
    async putMany(list) { list.forEach(([k, o]) => aplicarPut(data, k, o)); salvar(); },
    async del(kind, id) { aplicarDel(data, kind, id); salvar(); },
    async delMany(list) { list.forEach(([k, id]) => aplicarDel(data, k, id)); salvar(); },
    async setMeta(patch) { data.meta = { ...data.meta, ...patch }; salvar(); },
    async replaceAll(novo) { data = { ...dadosVazios(), ...novo }; salvar(); },
  };
}

/* --------------------------------------------------------------- FIREBASE */
const V = '10.12.2';
const URL_FB = `https://www.gstatic.com/firebasejs/${V}`;

// Estrutura no Firestore:
//   users/{uid}                     -> { householdId, email }
//   households/{hid}                -> { nome, owner, usuarios:[uid], inviteCode, meta:{...} }
//   households/{hid}/itens/{id}     -> { kind, ...campos }
//   invites/{codigo}                -> { hid }
export async function iniciarFirebase(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${URL_FB}/firebase-app.js`),
    import(`${URL_FB}/firebase-auth.js`),
    import(`${URL_FB}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch { db = F.getFirestore(app); }

  const gerarCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

  return {
    auth,
    onAuth: cb => A.onAuthStateChanged(auth, cb),
    entrar: (email, senha) => A.signInWithEmailAndPassword(auth, email, senha),
    cadastrar: (email, senha) => A.createUserWithEmailAndPassword(auth, email, senha),
    recuperar: email => A.sendPasswordResetEmail(auth, email),
    sair: () => A.signOut(auth),

    async familiaDoUsuario(uid) {
      const s = await F.getDoc(F.doc(db, 'users', uid));
      return s.exists() ? s.data().householdId || null : null;
    },

    async criarFamilia(user, nome) {
      const ref = F.doc(F.collection(db, 'households'));
      const code = gerarCodigo();
      const b = F.writeBatch(db);
      b.set(ref, { nome, owner: user.uid, usuarios: [user.uid], inviteCode: code, criadoEm: F.serverTimestamp(),
        meta: { ...dadosVazios().meta, nome } });
      b.set(F.doc(db, 'invites', code), { hid: ref.id });
      b.set(F.doc(db, 'users', user.uid), { householdId: ref.id, email: user.email });
      await b.commit();
      return ref.id;
    },

    async entrarComCodigo(user, codigo) {
      codigo = codigo.trim().toUpperCase();
      const inv = await F.getDoc(F.doc(db, 'invites', codigo));
      if (!inv.exists()) throw new Error('Código de convite não encontrado.');
      const hid = inv.data().hid;
      await F.updateDoc(F.doc(db, 'households', hid), { usuarios: F.arrayUnion(user.uid), joinCode: codigo });
      await F.setDoc(F.doc(db, 'users', user.uid), { householdId: hid, email: user.email });
      return hid;
    },

    // Abre a família e mantém tudo sincronizado em tempo real
    abrirFamilia(hid, onChange, onPronto) {
      const data = dadosVazios();
      let info = {};
      let carregouItens = false, carregouMeta = false;
      const talvezPronto = () => { if (carregouItens && carregouMeta && onPronto) { onPronto(); onPronto = null; } };
      const col = F.collection(db, 'households', hid, 'itens');

      const unsub1 = F.onSnapshot(col, snap => {
        for (const k of Object.values(KINDS)) data[k] = [];
        snap.forEach(d => { const o = d.data(); const arr = data[KINDS[o.kind]]; if (arr) { delete o.kind; arr.push({ ...o, id: d.id }); } });
        carregouItens = true; onChange(); talvezPronto();
      });
      const unsub2 = F.onSnapshot(F.doc(db, 'households', hid), snap => {
        const h = snap.data() || {};
        info = { inviteCode: h.inviteCode, owner: h.owner, usuarios: h.usuarios || [] };
        data.meta = { ...dadosVazios().meta, ...(h.meta || {}) };
        carregouMeta = true; onChange(); talvezPronto();
      });

      const limpar = o => JSON.parse(JSON.stringify(o)); // remove undefined
      const lote = async ops => {
        for (let i = 0; i < ops.length; i += 450) {
          const b = F.writeBatch(db);
          ops.slice(i, i + 450).forEach(fn => fn(b));
          await b.commit();
        }
      };
      return {
        modo: 'firebase',
        get data() { return data; },
        get info() { return info; },
        fechar() { unsub1(); unsub2(); },
        put: (kind, obj) => F.setDoc(F.doc(col, obj.id), limpar({ ...obj, kind })),
        putMany: list => lote(list.map(([kind, obj]) => b => b.set(F.doc(col, obj.id), limpar({ ...obj, kind })))),
        del: (kind, id) => F.deleteDoc(F.doc(col, id)),
        delMany: list => lote(list.map(([, id]) => b => b.delete(F.doc(col, id)))),
        setMeta: patch => F.updateDoc(F.doc(db, 'households', hid), { meta: limpar({ ...data.meta, ...patch }) }),
        async replaceAll(novo) {
          const ops = [];
          for (const [kind, key] of Object.entries(KINDS)) {
            data[key].forEach(o => ops.push(b => b.delete(F.doc(col, o.id))));
            (novo[key] || []).forEach(o => ops.push(b => b.set(F.doc(col, o.id), limpar({ ...o, kind }))));
          }
          await lote(ops);
          if (novo.meta) await F.updateDoc(F.doc(db, 'households', hid), { meta: limpar({ ...dadosVazios().meta, ...novo.meta }) });
        },
      };
    },
  };
}
