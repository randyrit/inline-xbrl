# Inline — AI XBRL Filing Platform (demo)

A web-based SaaS demo for accountants: AI-assisted XBRL tagging, a collaborative 10-Q/10-K
report builder with **live multiplayer cursors**, data ingestion (Google Cloud / bank linking /
CSV upload), and a simulated SEC EDGAR export flow.

Built with **React 19 + Untitled UI React + React Aria + Tailwind CSS v4** (Vite).

## Try the multiplayer

1. Open the deployed app (or `npm run dev`) and go to **Report Builder**.
2. Click **Copy link** in the builder header and send it to someone — or open it in a
   second browser/incognito window.
3. Everyone who joins appears with a randomly generated **anonymous name**
   (`Color Expression Animal`, e.g. *Orange Happy Bamboo*) and a matching cursor color.
   Watch each other's cursors, co-selected cells (names stack horizontally with a `+#`
   overflow chip), and live cell edits.
4. Use the **sign-in icon** on the profile card (bottom of the left nav) to enter the demo
   account — signed-in users show their real display name (Randy Ritts) instead of an
   anonymous one.

Want a private room? Append `?room=your-room-name` to the URL — only people in the
same room see each other.

> **Note:** presence runs over a public MQTT broker (`broker.emqx.io`) so the demo needs
> no backend or API keys. Messages are unauthenticated and public — demo data only.
> Simulated teammates (Maya, Dev, Sofia) keep the page alive when you're alone and
> disappear as soon as a real person joins.

## Demo walkthrough (solo)

1. **Data Sources** → Connect Google Cloud → files stream in from the bucket.
2. **Import** `trial_balance_q2_2026.csv` → values land on the right balance-sheet lines
   and the statement ties out.
3. **Link bank account** → pull live balances into Cash.
4. **Report Builder** → Run AI auto-tag → review/accept `us-gaap:` concept suggestions.
5. **Filings & Export** → Run validation → Transmit to SEC EDGAR → download the
   generated XBRL instance document.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build (tsc + vite)
```

Deploys to GitHub Pages automatically on push to `main` (see `.github/workflows/deploy.yml`).

## Credits

UI components from [Untitled UI React](https://www.untitledui.com/react). All company data
(Meridian Robotics, Inc.) is fictional; the EDGAR flow is a simulation.
