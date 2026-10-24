# Maicro

**Live site: [mymaicro.com](https://mymaicro.com)**

Maicro is a macro and micronutrient tracker built around real recipes. Paste in a recipe (or a link to one) and get an ingredient-by-ingredient nutrition breakdown backed by USDA data, then use an AI-powered **Optimize** button to swap ingredients toward your goals, such as more protein or less fat.

The whole app works without an account. You're only asked to sign up when you try to save something.

## What it does

- **Recipe analysis** – paste a recipe or URL and get calories, macros, and 23 micronutrients per serving, matched ingredient by ingredient against USDA FoodData Central (about 1.87 million foods: Foundation, SR Legacy, and Branded).
- **Optimize** – pick a direction (more or less protein, carbs, or fat). Claude proposes one ingredient swap. The server re-checks the swap against USDA data and never trusts the model's own nutrition math. You see a before-and-after preview and nothing changes until you confirm.
- **Manual edit** – override any ingredient's calories, macros, or micros in a pop-up with Cancel and Confirm.
- **Macro targets and meal splits** – set daily goals and divide them across meals.
- **Weekly plan and history** – plan meals by day and look back at past weeks.
- **My Recipes** – save recipes, organize them into groups, and reuse them.
- **Accounts** – email or username login, a "remember me" option, and password and username recovery.
- **Admin dashboard** – usage stats (users, recipes, optimizations) behind an admin-only gate with authenticator-app two-factor authentication.

## How the ingredient matching works

Turning "2 tbsp olive oil" into accurate nutrition takes more than a text search:

1. The ingredient line is parsed into a quantity, a unit, and a food name.
2. The name is searched with SQLite full-text search across the USDA sources, with generic foods preferred over branded products.
3. Candidates are ranked by how closely the food's description matches the ingredient name (for example, "chuck steak" prefers a plain chuck steak over a bacon-wrapped product).
4. The amount is converted to grams. Mass units are converted exactly, and everything else uses the USDA's own portion data (cups, pieces, and so on).

The full USDA database (about 1.1 GB) is hosted on Cloudflare D1 and queried over HTTP, because it is too big to bundle into a serverless function.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **Auth and user data:** Supabase (Postgres, Row Level Security, email login, TOTP two-factor authentication)
- **Food data:** USDA FoodData Central, stored in Cloudflare D1 (hosted SQLite with FTS5)
- **AI:** Anthropic Claude (Sonnet) through the Anthropic API, using tool use
- **Hosting:** Vercel

## Running it locally

```bash
npm install
cp env.example .env.local   # then fill in your own keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need your own Supabase project, Cloudflare D1 database, and Anthropic API key. See `env.example` for the variables, and `supabase/schema.sql` for the database setup. No keys are stored in this repository.

## Notes

This is a solo project, built to learn full-stack development and to solve a real problem: knowing what's actually in the food you cook.
