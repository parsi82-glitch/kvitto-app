# Sätta upp Supabase för kvitto-appen

Görs en gång. Ta stegen i ordning.

## 1. Skapa databasen

1. Öppna projektet på supabase.com → **SQL Editor** (vänstermenyn) → **New query**.
2. Klistra in hela innehållet i [`migrations/001_init.sql`](migrations/001_init.sql).
3. Klicka **Run**. Det ska stå *Success. No rows returned*.

## 2. Stäng av nya registreringar

**Authentication → Sign In / Providers** → under *User Signups*: stäng av
**Allow new users to sign up** → **Save changes**.

## 3. Skapa era två konton

**Authentication → Users → Add user → Create new user**

- E-post och ett starkt lösenord (spara i lösenordshanterare).
- Kryssa i **Auto Confirm User**.

Upprepa för den andra personen.

## 4. Lägg till kontona i medlemslistan

SQL Editor → New query → klistra in och byt ut e-postadresserna → **Run**:

```sql
insert into public.household_members (user_id, display_name)
select id, email from auth.users
where email in ('din@epost.se', 'sambons@epost.se')
on conflict (user_id) do nothing;

-- Kontroll: ska visa två rader
select m.display_name, m.created_at from public.household_members m;
```

## Säkerhet i korthet

- Appen innehåller bara den **publika** nyckeln (`sb_publishable_…`). Den ger ingen åtkomst på egen hand.
- All data är låst med Row Level Security: bara inloggade konton som finns i
  `household_members` kan läsa eller ändra kvitton och foton.
- Fotona ligger i en **privat** lagringsplats och visas via länkar som slutar gälla efter en timme.
- Dela **aldrig** `secret`- eller `service_role`-nyckeln.
