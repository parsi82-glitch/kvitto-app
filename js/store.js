// Lagring av kvitton och foton i Supabase (fas 2).
// Samma funktioner som i fas 1 så att gränssnittet påverkas så lite som möjligt.
// Supabase-biblioteket laddas från vendor/ (window.supabase) i index.html.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const BUCKET = 'receipt-photos';
const COLUMNS = 'id,date,store,amount,category,classification,comment,photo_path,created_at,updated_at';
const SIGNED_URL_SECONDS = 60 * 60;

export const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------- Inloggning

export async function getUser() {
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthChange(callback) {
  client.auth.onAuthStateChange((event) => callback(event));
}

export async function signIn(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await client.auth.signOut();
}

/** Är den inloggade användaren med i hushållets medlemslista? */
export async function isMember() {
  const { data, error } = await client.rpc('is_member');
  if (error) throw error;
  return data === true;
}

// ---------------------------------------------------------------- Kvitton

const fromRow = (r) => ({
  id: r.id,
  date: r.date,
  store: r.store,
  amount: Number(r.amount),
  category: r.category,
  classification: r.classification,
  comment: r.comment ?? '',
  photoPath: r.photo_path ?? null,
  hasPhoto: Boolean(r.photo_path),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Alla kvitton, nyaste datum först. */
export async function listReceipts() {
  const rows = check(
    await client
      .from('receipts')
      .select(COLUMNS)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  );
  return rows.map(fromRow);
}

export async function getReceipt(id) {
  const row = check(await client.from('receipts').select(COLUMNS).eq('id', id).maybeSingle());
  return row ? fromRow(row) : null;
}

/**
 * Sparar ett kvitto. `photo` är en Blob (nytt foto), `null` (ta bort foto)
 * eller `undefined` (behåll befintligt foto).
 */
export async function saveReceipt(receipt, photo) {
  const id = receipt.id || newId();
  const oldPath = receipt.photoPath ?? null;
  let photoPath = oldPath;
  let uploadedPath = null;

  if (photo) {
    const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    uploadedPath = `${id}/${Date.now()}.${ext}`;
    check(
      await client.storage.from(BUCKET).upload(uploadedPath, photo, {
        contentType: photo.type || 'image/jpeg',
        upsert: false,
      }),
    );
    photoPath = uploadedPath;
  } else if (photo === null) {
    photoPath = null;
  }

  const row = {
    id,
    date: receipt.date,
    store: receipt.store,
    amount: receipt.amount,
    category: receipt.category,
    classification: receipt.classification,
    comment: receipt.comment ?? '',
    photo_path: photoPath,
  };

  let saved;
  try {
    saved = check(await client.from('receipts').upsert(row).select(COLUMNS).single());
  } catch (err) {
    // Kvittot gick inte att spara: städa bort fotot som just laddades upp.
    if (uploadedPath) await client.storage.from(BUCKET).remove([uploadedPath]);
    throw err;
  }

  // Det gamla fotot ersattes eller togs bort: radera filen (gör inget om det misslyckas).
  if (oldPath && oldPath !== photoPath) await client.storage.from(BUCKET).remove([oldPath]);

  return fromRow(saved);
}

export async function deleteReceipt(id) {
  const existing = await getReceipt(id);
  check(await client.from('receipts').delete().eq('id', id));
  if (existing?.photoPath) await client.storage.from(BUCKET).remove([existing.photoPath]);
}

// ---------------------------------------------------------------- Foton

/** Tillfälliga länkar (giltiga en timme) till flera foton. Returnerar { sökväg: url }. */
export async function getPhotoUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const data = check(await client.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS));
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export async function getPhotoUrl(path) {
  if (!path) return null;
  return (await getPhotoUrls([path]))[path] ?? null;
}
