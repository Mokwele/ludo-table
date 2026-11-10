# Ludo Table

Two-dice Ludo for 2 to 4 players. People can play live online by sharing an invite link (on Facebook, TikTok, WhatsApp or anywhere else), or play offline on one phone against the computer.

## How online play works

1. A player types their name and taps **Create online game**.
2. They get a 5-letter code and an invite link like `https://your-site/#K7Q2M`.
3. Friends tap the link (or type the code) to join. Up to 4 players fit at one table.
4. The host taps **Start game**.

Other details:

- If a player closes the app or loses signal, the computer plays for them until they come back. Opening the link again puts them back in their seat.
- If a player doesn't move within 30 seconds, the computer moves for them, so a game never gets stuck.
- Players can send quick emoji reactions during the game.
- The host can start a rematch from the win screen.

## Rules (two-dice version)

- Roll two dice. Use each die on a different piece, or both on the same piece.
- A 6 on either die brings a piece out.
- Rolling doubles, capturing a piece or getting a piece home earns another roll.
- Three doubles in a row loses the turn.
- Stars and start squares are safe. You need the exact number to get a piece home.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000.

## Put it online (free, using Render)

1. Create a free account at [github.com](https://github.com) and upload this folder as a new repository.
2. Create a free account at [render.com](https://render.com) and sign in with GitHub.
3. In Render choose **New → Blueprint**, pick your repository and confirm. Render reads `render.yaml` and sets everything up.
4. After a few minutes you get an address like `https://ludo-table.onrender.com`. Share that address.

Things to know about Render's free plan:

- The server goes to sleep after about 15 minutes with no players. The first visit after that takes up to a minute to load.
- Games are kept in memory, so a restart or redeploy ends any games in progress.
- A paid plan (about $7 a month) keeps it awake.

Any host that runs Node.js and supports WebSockets will work, for example Railway or Fly.io.

## Files

- `server.js`: the web server and the online game rooms.
- `public/rules.js`: the game rules. The server and the offline mode both use this file, so the rules always match.
- `public/client.js`: draws the board, animates moves and talks to the server.
- `public/index.html`, `public/style.css`: the screens and styling.
- `public/og.png`: the preview image Facebook and WhatsApp show when a link is shared.

## Later: inside Facebook and TikTok

Facebook (Instant Games) and TikTok (Mini Games) can run HTML5 games inside their apps, with their own "invite a friend" buttons. Both need a developer account and a review of the game before it goes live, and each has its own SDK that has to be added to the game.
