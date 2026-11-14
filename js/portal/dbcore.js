// The database layer, written against Supabase but shaped like the Firestore calls the
// rest of the portal was written with (setDoc, updateDoc, batch, watch...). That is why the
// pages did not need rewriting. Records live in the "docs" table (see supabase/schema.sql):
// a collection name, an id, and a JSON block of fields.
//
// This file takes the Supabase client as a parameter so it can be tested without a browser.

const POLL_MS = 5000;   // how often exec pages check for changes made by other people

export function makeDb(client) {
  const watchers = new Set();                       // every live watcher, so a write can refresh them at once
  const refreshAll = () => watchers.forEach(w => w.refresh());

  /** Turns a Supabase error into one the pages already know how to show (err.code === 'permission-denied'). */
  function fail(error) {
    const msg = error?.message || String(error);
    const e = new Error(msg);
    e.code = /^permission-denied/.test(msg) || error?.code === '42501' ? 'permission-denied' : (error?.code || 'unknown');
    return e;
  }

  const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  /* ------------------------------------------------------------- references */
  const colRef = path => ({ kind: 'collection', path: path.join('/') });
  const docRef = path => {
    if (path.length < 2) throw new Error('A document needs a collection and an id.');
    return { kind: 'doc', collection: path.slice(0, -1).join('/'), id: path[path.length - 1] };
  };
  const col = (...path) => colRef(path);
  const ref = (...path) => docRef(path);

  /** Marker values, turned into real values by the database. */
  const stamp = () => ({ __op: 'now' });
  const where = (field, op, value) => {
    if (op !== '==') throw new Error(`Only "==" filters are supported (got "${op}").`);
    return { field, value: String(value) };
  };

  /* ------------------------------------------------------------------ reading */
  async function query(collection, filters = [], id = null) {
    const { data, error } = await client.rpc('query_docs', { p_collection: collection, p_where: filters, p_id: id });
    if (error) throw fail(error);
    return (data || []).map(r => ({ id: r.id, ...r.data }));
  }

  /** Read one record, or null if it doesn't exist (or you aren't allowed to see it). */
  async function read(...path) {
    const r = docRef(path);
    return (await query(r.collection, [], r.id))[0] || null;
  }
  /** Read many records, optionally filtered with where(). */
  const list = (c, ...constraints) => query(c.path, constraints);

  /** Keeps a list up to date. Checks every few seconds, and straight away after you save something. Returns a stop function. */
  function watch(c, constraints, onData, onError) {
    let stopped = false, busy = false, last = null, timer = null;
    const w = {
      async refresh() {
        if (stopped || busy) return;
        busy = true;
        try {
          const rows = await query(c.path, constraints);
          const sig = JSON.stringify(rows);
          if (!stopped && sig !== last) { last = sig; onData(rows); }
        } catch (e) { (onError || console.error)(e); }
        finally { busy = false; }
      }
    };
    const loop = async () => {
      if (stopped) return;
      if (!globalThis.document?.hidden) await w.refresh();
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => { if (!document.hidden) w.refresh(); };
    watchers.add(w);
    globalThis.document?.addEventListener?.('visibilitychange', onVisible);
    loop();
    return () => {
      stopped = true; clearTimeout(timer); watchers.delete(w);
      globalThis.document?.removeEventListener?.('visibilitychange', onVisible);
    };
  }

  /* ------------------------------------------------------------------ writing */
  async function apply(ops) {
    if (!ops.length) return;
    const { error } = await client.rpc('apply_ops', { ops });
    if (error) throw fail(error);
    refreshAll();
  }
  const op = (kind, r, data, extra = {}) => ({ op: kind, collection: r.collection, id: r.id, ...(data !== undefined ? { data } : {}), ...extra });

  /** Several changes that all happen together, or not at all. */
  function batch() {
    const ops = [];
    return {
      set(r, data, opts) { ops.push(op('set', r, data, { merge: !!opts?.merge })); return this; },
      update(r, data) { ops.push(op('update', r, data)); return this; },
      delete(r) { ops.push(op('delete', r)); return this; },
      commit: () => apply(ops)
    };
  }

  /** The Firestore-style functions the pages call as F.something(...). */
  const F = {
    collection: (_db, ...path) => colRef(path),
    doc: (_db, ...path) => docRef(path),
    setDoc: (r, data, opts) => apply([op('set', r, data, { merge: !!opts?.merge })]),
    updateDoc: (r, data) => apply([op('update', r, data)]),
    deleteDoc: r => apply([op('delete', r)]),
    async addDoc(c, data) { const id = newId(); await apply([{ op: 'create', collection: c.path, id, data }]); return { id }; },
    serverTimestamp: stamp,
    deleteField: () => ({ __op: 'delete' }),
    arrayUnion: (...values) => ({ __op: 'arrayUnion', values })
  };

  return { db: null, F, col, ref, stamp, where, read, list, watch, batch };
}
