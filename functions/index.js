/*
 * GARAGE · Marketplace — servidor (Firebase Cloud Functions, 2.ª generación)
 *
 * - Notificaciones push: mensajes, me gusta, comentarios, seguidores, ofertas del Mercado,
 *   cartas aprobadas o rechazadas y retos ganados.
 * - Monedas automáticas: cuando GARAGE aprueba una carta, se acreditan sus puntos como monedas
 *   (1 punto = 1 moneda), aunque nadie tenga la app abierta.
 *
 * Solo se sube con:  firebase deploy --only functions
 * (No toca las reglas de Firestore ni el Hosting.)
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'us-east1', maxInstances: 5 });

const db = admin.firestore();
const APP = 'https://emarcaccio0906-ux.github.io/GARAGE-Marketplace/';
const ICON = APP + 'icon-192.png';
const BASE = [10, 25, 60, 120, 250]; // igual que en la app

/* ---------- utilidades ---------- */
async function nameOf(uid) {
  const s = await db.doc('users/' + uid).get();
  return s.exists && s.data().name ? '@' + s.data().name : 'Alguien';
}
async function isBlocked(owner, by) {
  if (!owner || !by) return false;
  return (await db.doc('blocks/' + owner + '_' + by).get()).exists;
}
function carName(c) { return [c && c.make, c && c.model].filter(Boolean).join(' ') || 'tu carta'; }

async function push(uid, title, body, hash) {
  if (!uid) return;
  const snap = await db.collection('push_tokens').where('uid', '==', uid).get();
  if (snap.empty) return;
  const tokens = snap.docs.map((d) => d.id);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: String(title || 'GARAGE').slice(0, 60), body: String(body || '').slice(0, 180) },
    webpush: {
      notification: { icon: ICON, badge: ICON },
      fcmOptions: { link: APP + (hash || '') }
    }
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument')) dead.push(tokens[i]);
  });
  await Promise.all(dead.map((t) => db.doc('push_tokens/' + t).delete().catch(() => {})));
}

/* ---------- monedas automáticas ---------- */
function cardPoints(c) {
  if (!c || c.kind !== 'spotted' || !c.rev || c.rev.status !== 'ok') return 0;
  const r = Math.max(0, Math.min(4, c.rev.rarity | 0));
  const q = c.rev.q != null ? c.rev.q : c.q;
  const mult = typeof q === 'number' ? 0.5 + Math.max(0, Math.min(100, q)) / 100 : 1;
  return Math.round((BASE[r] || BASE[0]) * mult);
}
async function creditUser(uid) {
  const cars = await db.collection('users/' + uid + '/cars').get();
  let pts = 0;
  cars.forEach((d) => { pts += cardPoints(d.data()); });
  const ref = db.doc('mk_wallet/' + uid);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const w = s.exists ? s.data() : { coins: 0, earned: 0 };
    const diff = pts - (w.earned | 0);
    if (diff <= 0) return 0;
    tx.set(ref, { coins: (w.coins | 0) + diff, earned: (w.earned | 0) + diff, last: '', ts: Date.now() });
    return diff;
  });
}

/* ---------- disparadores ---------- */

// Carta revisada por GARAGE → monedas + aviso
exports.onCardReview = onDocumentWritten('users/{uid}/cars/{carId}', async (ev) => {
  const before = ev.data.before.exists ? ev.data.before.data() : null;
  const after = ev.data.after.exists ? ev.data.after.data() : null;
  const st = (c) => (c && c.rev && c.rev.status) || '';
  if (JSON.stringify(before && before.rev) === JSON.stringify(after && after.rev) && (before && before.kind) === (after && after.kind)) return;
  const uid = ev.params.uid;
  const added = await creditUser(uid);
  if (st(after) === 'ok' && st(before) !== 'ok') {
    await push(uid, 'Carta aprobada', 'Tu ' + carName(after) + ' fue aprobada' + (added > 0 ? ': +' + added + ' monedas.' : '.'), '#mercado');
  } else if (st(after) === 'rejected' && st(before) !== 'rejected') {
    await push(uid, 'Carta rechazada', 'Tu ' + carName(after) + ' fue rechazada. Ábrela para ver por qué.', '');
  }
  logger.info('Carta revisada', { uid, added });
});

// Mensaje directo
exports.onDm = onDocumentCreated('dm_threads/{tid}/msgs/{mid}', async (ev) => {
  const m = ev.data && ev.data.data();
  if (!m || !m.from) return;
  const ids = ev.params.tid.split('_');
  const to = ids[0] === m.from ? ids[1] : ids[0];
  if (await isBlocked(to, m.from)) return;
  await push(to, await nameOf(m.from), m.text, '#social');
});

// Me gusta
exports.onLike = onDocumentCreated('likes/{id}', async (ev) => {
  const l = ev.data && ev.data.data();
  if (!l || !l.owner || l.owner === l.from || (await isBlocked(l.owner, l.from))) return;
  const what = l.kind === 'card' ? 'tu carta' : l.kind === 'photo' ? 'tu foto' : 'tu colección';
  await push(l.owner, 'Me gusta', (await nameOf(l.from)) + ' le dio me gusta a ' + what + '.', '#social');
});

// Comentario
exports.onComment = onDocumentCreated('comments/{id}', async (ev) => {
  const c = ev.data && ev.data.data();
  if (!c || !c.owner || c.owner === c.from || (await isBlocked(c.owner, c.from))) return;
  await push(c.owner, 'Comentario', (await nameOf(c.from)) + ' comentó: ' + (c.text || ''), '#social');
});

// Nuevo seguidor
exports.onFollow = onDocumentCreated('follows/{id}', async (ev) => {
  const f = ev.data && ev.data.data();
  if (!f || !f.to || f.to === f.from || (await isBlocked(f.to, f.from))) return;
  await push(f.to, 'Nuevo seguidor', (await nameOf(f.from)) + ' empezó a seguirte.', '#social');
});

// Oferta o contraoferta nueva en el Mercado
exports.onOffer = onDocumentCreated('mk_offers/{id}', async (ev) => {
  const o = ev.data && ev.data.data();
  if (!o || !o.to || (await isBlocked(o.to, o.from))) return;
  const who = await nameOf(o.from);
  await push(o.to, 'Mercado', o.counterOf ? who + ' te mandó una contraoferta.' : who + ' te hizo una oferta.', '#mercado');
});

// Oferta aceptada o rechazada
exports.onOfferUpdate = onDocumentUpdated('mk_offers/{id}', async (ev) => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (!a || b.status === a.status || b.status !== 'open') return;
  const who = await nameOf(a.to);
  if (a.status === 'done') await push(a.from, 'Mercado', who + ' aceptó tu oferta. ¡Cambio hecho!', '#mercado');
  else if (a.status === 'declined') await push(a.from, 'Mercado', who + ' rechazó tu oferta.', '#mercado');
});

// Reto aprobado
exports.onClaim = onDocumentUpdated('mk_claim/{id}', async (ev) => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (!a || b.status === a.status) return;
  const ch = await db.doc('mk_ch/' + a.ch).get();
  const title = ch.exists ? ch.data().title : 'el reto';
  if (a.status === 'ok') await push(a.uid, 'Retos', '¡Ganaste «' + title + '»! +' + ((ch.exists && ch.data().reward) | 0) + ' monedas.', '#mercado');
  else if (a.status === 'rejected') await push(a.uid, 'Retos', 'Tu participación en «' + title + '» no fue aprobada.', '#mercado');
});
