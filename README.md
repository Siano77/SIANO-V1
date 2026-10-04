# SIANO v1

A fast, modular WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys). No number scanning a QR code by hand on the host — it connects using a `SESSION_ID` you generate once from the **SIANO pair site** (see `../pair`).

    <img  src="https://kommodo.ai/i/WjQZ7zYD768EhUaaHSJ8">

## What's inside

```
index.js            entry point
src/                 core: connection, session handling, command loader, message handler…
commands/            one file per category — add new commands here
data/db.json         small local database (settings, sudo list) — created automatically
session/             WhatsApp credentials — created automatically, never commit this
```

## Run it locally

```bash
npm install
cp .env.example .env
# edit .env: paste your SESSION_ID (from the pair site) or set PAIR_NUMBER to pair from this console
npm start
```

## Deploy it (Bot-Hosting, Specify, Katabump, Render, or similar)

1. Upload this `bot/` folder (or push it to a GitHub repo and connect that).
2. Set the **start command** to `npm install && npm start` (most panels do this automatically once they see `package.json`).
3. Open the panel's **Environment / Variables** tab and add the variables from `.env.example` — at minimum `SESSION_ID`, `OWNER_NUMBER`, and `OWNER_LID` from the pair site.
4. Start (or restart) the bot. It logs `connected as …` once it's linked, and sends a message to your own WhatsApp confirming it's online.
5. If a host requires an open port to stay running, `PORT` is already handled — the bot serves a tiny status JSON at `/`.

If you'd rather pair straight from the host's console: leave `SESSION_ID` empty, set `PAIR_NUMBER` to your number (digits, with country code), start the bot, and copy the pairing code from the logs. Remove `PAIR_NUMBER` afterwards.

## Adding a command

Drop a new file in `commands/`, or add to an existing one — default-export an object (or array of objects):

```js
export default {
  name: 'hello',
  aliases: ['hi'],
  desc: 'Say hello',
  category: 'fun',
  async run({ m }) {
    await m.reply('Hello there!')
  },
}
```

`ctx` passed to `run()` also has: `sock`, `args`, `text`, `prefix`, `isOwner`, `isSudo`, `isAdmin`, `isBotAdmin`, `meta` (group info, in groups), `config`, `settings` (get/set live settings), `registry`.

Flags you can set on a command: `owner` (owner/sudo only), `root` (owner only, not sudo), `group` (groups only), `admin` (group admins only), `botAdmin` (bot must be a group admin).

## Notes

- `SESSION_ID` gives full control of the linked WhatsApp number. Treat it like a password — never share it or commit it.
- If WhatsApp unlinks the device (logged out remotely, or you unlink it from the phone), generate a fresh `SESSION_ID` from the pair site and update it on the host.
- Everything under `commands/` is plain, readable code — nothing here phones home or pulls code from the internet at runtime.
