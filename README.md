# Centris Comments Extension (POC)

A Chrome Extension (Manifest V3) that injects a comments widget on Centris listing pages and stores comments in Supabase.

## Project Structure

- `extension/manifest.json` — MV3 config, content script registration, and options page.
- `extension/contentScript.js` — listing detection, widget injection, comment fetching/posting.
- `extension/styles.css` — widget styling.
- `extension/options.html` + `extension/options.js` — UI to store Supabase URL + anon key in `chrome.storage.local`.
- `supabase/schema.sql` — table, constraints, indexes, RLS, and policies.

## 1) Supabase Setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run all SQL from `supabase/schema.sql`.
4. In Supabase Project Settings → API, copy:
   - Project URL
   - `anon` public key

### What the SQL creates

- `public.comments` table with:
  - `id` UUID PK
  - `listing_key` text
  - `username` nullable text
  - `body` text
  - `created_at` timestamptz
  - `is_deleted` boolean
- Constraints:
  - `listing_key`: 1..64 chars
  - `body`: 1..1000 chars
  - `username`: <=32 chars or null
- Index:
  - `(listing_key, created_at desc)`
- RLS enabled with policies:
  - public can `SELECT` where `is_deleted=false`
  - public can `INSERT` with shape constraints

## 2) Load the Extension (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder from this repo.

## 3) Configure Supabase Credentials

1. In `chrome://extensions`, find **Centris Comments (POC)**.
2. Click **Details** → **Extension options**.
3. Enter:
   - Supabase URL (`https://<project-ref>.supabase.co`)
   - Supabase anon key
4. Click **Save**.

## 4) Test on Centris Listing Pages

1. Open any Centris listing URL ending in a numeric ID (for example):
   - `https://www.centris.ca/en/condos-apartments~for-rent~montreal-villeray-saint-michel-parc-extension/14860570`
2. Scroll toward the bottom/main area and find the **Comments** widget.
3. Add optional username + comment and click **Post**.
4. Reload the page and verify the comment remains.

## Listing Key Format

The extension parses the URL pathname, takes the last path segment, and if it is numeric creates:

- `listing_key = "centris:<ID>"`

Example: `.../14860570` → `centris:14860570`

## Anti-abuse (POC)

- Client-side best-effort cooldown: one post per listing every 10 seconds per browser install.
- Input validation before POST:
  - username max 32 chars
  - comment body 1..1000 chars
- DB constraints + RLS enforce limits server-side.

## Known Limitations

- No user accounts/authentication.
- Any user with anon key can post (within constraints).
- No robust spam prevention or moderation tools in this POC.
- UI injection selector may break if Centris changes DOM structure.
- No real-time updates; data refreshes on load and after posting.
