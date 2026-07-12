# Velora — Online Store

A single-page e-commerce storefront built with plain HTML, CSS, and JavaScript, connected to Supabase for the backend (database, auth, and orders).


## Features
- Product catalog with categories (Skincare, Makeup, Hair Care, Personal Care, Health, Toys)
- Search and category filtering
- Shopping cart with live totals
- Phone number OTP login (Supabase Auth)
- Checkout with UPI and Cash on Delivery
- Order history for logged-in users
- Row Level Security (RLS) enabled — users can only view their own orders

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript (single file, no framework)
- **Backend:** [Supabase](https://supabase.com/) (PostgreSQL database, Auth, REST API)
- **Animations:** GSAP-style entry effects, custom CSS transitions

## How It Works
1. Products are fetched from a Supabase `products` table.
2. Users log in via phone OTP through Supabase Auth.
3. Orders are inserted into a Supabase `orders` table, protected by Row Level Security so each user can only read their own order history.

## Setup
1. Clone or download `velora_store.html`.
2. Open it directly in a browser — no build step required.
3. To use your own backend, replace the `SUPABASE_URL` and `SUPABASE_KEY` values at the top of the script with your own Supabase project's publishable/anon key.

## Author
Ruchi Arora
