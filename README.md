# Liar's UNO Online

Play Liar's UNO with 2 to 6 people from anywhere: face-down bluffs, "Call bluff!" button, Wild Liar's Challenge, 7 swap / 0 pass, UNO catching, chat, a running scoreboard (first to 500), a pop-up rule book, and a silly "are you 7+?" question at the door, and optional profile pictures (PNG, JPG or SVG). Tap your own picture during a game to change it.

## Put it online with Replit (about 10 minutes, free)

1. Go to **replit.com** and sign in (Google login works).
2. Click **+ Create App**, choose the **Node.js** template, name it `liars-uno`, and create it.
3. Delete the starter `index.js` file Replit made.
4. Unzip `liars-uno.zip` on your computer, then drag **everything inside the folder** (`server.js`, `package.json`, `README.md`, and the `public` folder) into Replit's file list on the left.
5. Open the **Shell** tab and type: `npm install` then press Enter.
6. Click the big **Run** button. A preview opens. Click the "open in new tab" icon to get your link (it ends in `.replit.dev`).
7. Send that link to your girlfriend. You both type the same room code (default is `UNO`), and the first person in is the host who hits **Deal the cards**.

> Heads up: a free Replit "Run" link sleeps when you close Replit. To keep it up while she's away, use Replit's **Deploy** button (Autoscale or Reserved VM). Set the run command to `npm start`.

## Playing on your own computer (to test)

Install Node.js 18+, then in this folder run:

```
npm install
npm start
```

Open http://localhost:3000 in two browser windows to play against yourself.

## Settings you can change

At the top of `server.js`:

- `CHALLENGE_SECONDS` — time to call a bluff (default 10)
- `TARGET_SCORE` — points to win a match (default 500)
- `OFFLINE_AUTOPLAY_SECONDS` — if someone drops off on their turn, they auto draw and pass after this

## Good to know

- Reloading the page or losing Wi-Fi is fine: open the link again in the same browser with the same name and room and you get your seat and cards back.
- Use different room codes to run separate tables.
- Liar's cards show a small white ring in the corner, just like the real deck.
