# AnuRAAGAM

Website for Anuraagam — Hyderabad's live Telugu singing & jamming session community.

## Pages
- `index.html` — Home (shows the next live event, pulled from the database)
- `events.html` — All upcoming sessions, pulled from the database
- `payment.html` — Ticket checkout, requires login, wired to Razorpay
- `login.html` — Email or mobile OTP login (no passwords)
- `profile.html` — Signed-in user's account + **My Orders** (Upcoming / Closed)
- `admin.html` — Admin-only panel to create/edit/publish/delete events and view bookings
- `about.html` — About the community
- `gallery.html` — Photo gallery
- `contact.html` — Contact form

## Structure
- `css/styles.css` — shared design system (colors, type, components)
- `js/script.js` — shared behaviour (nav toggle, contact form)
- `js/supabase-client.js` — your Supabase project connection (fill in your keys)
- `js/auth.js` — shared login-state helpers used on every page
- `assets/` — logo and images
- `api/` — serverless functions: Razorpay order creation & payment verification
- `supabase/schema.sql` — database tables + security policies, run once in Supabase

## Architecture at a glance
```
Browser (any page)
   │
   ├── Supabase (via js/supabase-client.js)
   │     • events table   → read on Home/Events, read+write on Admin
   │     • orders table   → read on Profile ("My Orders")
   │     • auth           → email/phone OTP login, no passwords
   │
   └── /api/* (Vercel serverless functions)
         • create-order   → looks up the event's real price, creates a
                             Razorpay order, saves a "pending" order row
         • verify-payment → checks Razorpay's signature, flips that
                             order row to "paid"
```
Your Razorpay **secret key** and Supabase **service role key** only ever live in the `api/` functions (server-side environment variables) — never in the browser.

## Running locally
Open `index.html` directly, or serve the folder:
```
python3 -m http.server 8000
```
Without Supabase configured, pages will show loading/empty states. Without the `api/` functions deployed, checkout falls back to a demo confirmation (clearly labeled) instead of breaking.

---

## Setup — do these in order

### 1. Create a Supabase project (database + login)
1. Sign up free at [supabase.com](https://supabase.com) → **New Project**.
2. Once it's created, go to **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**. This creates the `events`, `orders`, and `profiles` tables with the right security rules.
3. Go to **Project Settings → API**. You'll need three values:
   - **Project URL**
   - **anon public key** (safe for the browser)
   - **service_role key** (secret — server only, never expose this)
4. Open `js/supabase-client.js` and fill in the **Project URL** and **anon public key**.

### 2. Turn on OTP login
- **Email OTP** works immediately — no setup needed.
- **Mobile/SMS OTP** needs an SMS provider connected in Supabase: go to **Authentication → Providers → Phone**, enable it, and connect a provider (MSG91 is a good fit for India — Twilio also works but is pricier for Indian numbers; either way you'll need your own account with them, which has a small per-SMS cost, and in India requires DLT registration which can take a few days). Until this is set up, the "Mobile" tab on the login page won't send codes — email will still work fine.
- There's no separate "sign up" step: entering a number/email and verifying the OTP **creates the account automatically** if it doesn't exist yet, then asks for the person's name once. Returning users skip straight through to their destination.

### 3. Enable Google Sign-In
1. In Supabase: **Authentication → Providers → Google** → toggle it on. This page shows you a callback URL like `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth Client ID** (type: Web application) and paste that callback URL in as an **Authorized redirect URI**.
3. Copy the generated **Client ID** and **Client Secret** back into Supabase's Google provider settings and save.
4. No code changes needed — the "Continue with Google" button on `login.html` is already wired up. Google sign-ins usually skip the name-collection step too, since Google supplies the name automatically.

### 4. Make yourself an admin
1. Log in once on the live site using your own email (via `login.html`) — this creates your user + profile automatically.
2. In Supabase, go to **Authentication → Users**, copy your **User UID**.
3. Back in **SQL Editor**, run:
   ```sql
   update public.profiles set is_admin = true where id = 'paste-your-uuid-here';
   ```
4. Refresh the site — you'll now see an **Admin** link in the nav, leading to `admin.html`, where you can add your real events.

### 5. Set up Razorpay (real payments)
1. Sign up at [dashboard.razorpay.com/signup](https://dashboard.razorpay.com/signup) — you start in **Test Mode** automatically, no KYC needed to try the whole flow.
2. Go to **Settings → API Keys → Generate Test Key**, copy the **Key Id** and **Key Secret**.
3. When ready for real money: complete **KYC** (business details, PAN, bank account), then generate **Live** keys the same way.

### 6. Deploy to Vercel (not GitHub Pages)
GitHub Pages only serves static files — it can't run the `api/` functions this site needs. Vercel can, for free, straight from this repo:
1. [vercel.com](https://vercel.com) → sign in with GitHub → **New Project** → import `AnuRAAGAM`.
2. Leave build settings as default.
3. Add **Environment Variables** before deploying:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `SUPABASE_URL` (same Project URL as above)
   - `SUPABASE_SERVICE_ROLE_KEY` (the secret key — **not** the anon key)
4. **Deploy**. Your site is live at `your-project.vercel.app` with working login, admin panel, and payments.

### 7. Test a payment
In Test Mode, use Razorpay's test card `4111 1111 1111 1111` (any future expiry, any CVV) or test UPI id `success@razorpay`. Full list: [razorpay.com/docs/payments/payments/test-card-upi-details](https://razorpay.com/docs/payments/payments/test-card-upi-details/).

### 8. Go live
Swap the two Razorpay environment variables in Vercel to your **Live** keys once KYC is approved. No code changes needed.

## Notes
- Event prices are the single source of truth in the `events` table — the checkout API always re-reads the price server-side, so nothing can be tampered with from the browser.
- Deleting an event doesn't delete past orders — bookings store a snapshot of the event's name/date/venue at the time of purchase.
- A booking's **Upcoming/Closed** status on the Profile page is computed automatically by comparing the event's date to right now — nobody needs to set it manually.
- The **"Next session"** badge in the homepage hero is fully dynamic — it's hidden entirely when there's no published upcoming event, and shows the real date once one exists. It pulls from the same query as the "Coming up next" section below it.
- The three hero stats ("Sessions hosted", "Artists jammed", "Audience reached") are **plain hardcoded text** in `index.html`, not pulled from the database — update them by hand as those numbers grow. (Ask if you'd rather have one of these calculated automatically, e.g. from a count of published events.)
