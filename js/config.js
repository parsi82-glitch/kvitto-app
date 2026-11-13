// Anslutning till Supabase.
// Båda värdena är gjorda för att vara publika: skyddet ligger i inloggningen och
// databasens behörighetsregler (RLS), se supabase/migrations/001_init.sql.
// Lägg ALDRIG in "secret"- eller "service_role"-nyckeln här.

export const SUPABASE_URL = 'https://DITT-PROJEKT-ID.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gwwAizj5MuBAA4gIco1wSQ_WUx-m6U9';
