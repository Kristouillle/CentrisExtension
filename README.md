# Centris Comments

Centris Comments is a Chrome extension that adds a public comments widget to Centris listing pages. It lets users read existing comments for a listing, post a new comment, and reply to existing comments.

## What It Does

- Runs only on `centris.ca` and `www.centris.ca` listing pages.
- Detects the numeric listing ID from the current page URL.
- Builds a per-listing key in the format `centris:<listing-id>`.
- Injects a comments UI into the page after the main Centris content.
- Loads comments and replies from a Supabase REST API.
- Lets users submit:
  - an optional username
  - a comment body
  - replies to existing comments
- Supports sorting comments by newest or oldest.

## How It Works

The extension is a Manifest V3 content-script extension.

- [`extension/manifest.json`](./extension/manifest.json) registers the extension on Centris domains only.
- [`extension/contentScript.js`](./extension/contentScript.js) handles page detection, widget rendering, API calls, validation, and reply flows.
- [`extension/styles.css`](./extension/styles.css) styles the injected widget.

On each supported page load, the content script:

1. Reads the current URL.
2. Extracts the last path segment if it is numeric.
3. Converts it into a listing key such as `centris:14860570`.
4. Fetches comments and replies for that listing from Supabase.
5. Renders the widget directly into the page.

When a user submits a comment or reply, the extension sends the listing key, optional username, and message body to the external database through HTTPS requests to Supabase.

## Permissions And Access

The extension currently requests host access only for:

- `*://www.centris.ca/*`
- `*://centris.ca/*`

This access is used only to:

- detect the current Centris listing
- inject the widget into the page
- associate comments with the listing being viewed

The extension does not use the Chrome `storage` permission.

## Data Behavior

The extension sends the following user-provided or page-derived values to Supabase:

- listing key derived from the current Centris listing URL
- optional username provided in the form
- comment or reply text provided in the form

The extension does not:

- require user accounts
- verify usernames against real identities
- collect payment, health, or authentication data
- run remote JavaScript or remote Wasm code
- track clicks, scrolling, or typing outside the comment form

## Constraints And Safeguards

- Username is optional.
- Username is limited to 32 characters.
- Comment and reply bodies are limited to 1000 characters.
- A best-effort in-memory cooldown prevents repeated posting within 10 seconds for the current tab session.

## What It Does Not Do

- It does not authenticate users.
- It does not guarantee that usernames are real.
- It does not provide moderation tooling.
- It does not provide real-time updates.
- It does not work on non-Centris websites.
- It does not persist local extension settings in Chrome storage.

## Known Limitations

- The widget injection depends on the current Centris page structure and may break if the site markup changes.
- Because there is no account system, identity and abuse controls are limited.
- Comments are tied to listing IDs parsed from the URL, so unsupported or changed URL formats will not load the widget.
