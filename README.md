# VLR — Velora Store

A single-page e-commerce storefront built as one self-contained HTML file (HTML + CSS + JS all inline). Products, orders, and phone/OTP authentication are powered by [Supabase](https://supabase.com) directly from the browser — **no separate backend server is needed.**

## ✨ Features

- Product catalog with categories, search, and a product detail modal
- Cart (persisted in `localStorage`) and checkout flow
- Phone number + OTP login (via Supabase Auth)
- Order placement and an "My Orders" history drawer
- UPI / Cash on Delivery payment options
- Fully responsive, animated glassmorphism UI (no build tools, no frameworks)

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (no React/Vue, no bundler) |
| Backend / Database | [Supabase](https://supabase.com) (Postgres + REST API + Auth), called directly from client-side `fetch()` |
| Hosting | Any static host — GitHub Pages, Netlify, Vercel, etc. |

Because Supabase already provides the database, REST API, and auth as a hosted service, this project **does not need a custom Node/Express/Django backend**. The HTML file talks straight to Supabase's REST endpoints.

## 🚀 Running Locally

No install or build step required.

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

Just open `velora_store.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/velora_store.html`.

## 🌐 Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (usually `main`) and root folder.
4. Save — your site will be live at `https://<your-username>.github.io/<repo-name>/velora_store.html`.

   (Optional: rename `velora_store.html` to `index.html` so it loads at the root URL automatically.)

## 🗄️ Supabase Setup

This project expects two things in your Supabase project:

1. **A `products` table** — with at least `id`, `name`, `category`, `sub`, `price`, and image/description fields (adjust query in `fetchProducts()` if your schema differs).
2. **An `orders` table** — storing `user_id`, `items`, `total`, `status`, `customer_name`, `phone`, `address`, `payment_method`, `created_at`.
3. **Phone (OTP/SMS) Auth enabled** in Supabase Auth settings.
4. **Row Level Security (RLS) policies** configured so that:
   - Anyone can `SELECT` from `products`.
   - Authenticated (or anonymous, depending on your design) users can `INSERT` into `orders`.
   - Users can only `SELECT` their own orders (`user_id = auth.uid()`).

The Supabase URL and public **anon/publishable key** are already embedded in the file (this is expected — the anon key is meant to be public; access is controlled entirely via RLS policies, not by hiding the key).

> ⚠️ Never put a Supabase **service_role** key in frontend code — only the `anon`/`publishable` key belongs here.

## 📁 Project Structure

```
.
├── velora_store.html   # Entire app: markup, styles, and logic
└── README.md
```

## 📝 Notes

- Cart state is stored in the browser's `localStorage` under the key `ogs_cart`.
- UPI payment ID is hardcoded in the file (`UPI_ID` constant) — update it to your own.
- This is a client-only app; all business logic and access rules should be enforced via Supabase RLS, not the JavaScript in this file.
