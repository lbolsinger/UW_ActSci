// Small wrappers so the pages stay readable. The real work is in dbcore.js.
import { supabase } from './supabase.js';
import { makeDb } from './dbcore.js';

export const { db, F, col, ref, stamp, where, read, list, watch, batch } = makeDb(supabase);
