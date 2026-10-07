# Unfinished-section checklist

## App review fixes

- Conversation switching ignores stale history and send responses; photo/voice uploads stay attached to the conversation where they started. Delayed microphone and camera permissions are cleaned up after leaving or hanging up.
- Chat previews and unread badges update outside the chat page; messages received in an open conversation are marked read through an authorized socket event.
- Sign-out and session expiry clear chat, discovery, notification, membership and Premium state. Pending responses cannot restore the previous account's data.
- Profile galleries reach every photo, profile links recover their data after reload, and match safety actions keep their dialog open. Failed photo changes retain the previous saved state and successful files in a mixed upload batch are saved.
- Saved filters restore when opening the filters page directly. Temporary membership-check errors no longer redirect members to checkout.
- Signup rejects impossible calendar dates. Concurrent moderation decisions are serialized, and revoked verification badges no longer show as approved.
- Browser coverage follows the current signup, setup, filtering, matching and chat flow, with page smoke checks at mobile and desktop widths. Backend test runs use separate disposable databases.

## Feature status

- Referrals: every member has a code (like a username, e.g. asha4821) on Refer & earn (/referral), with copy, share, WhatsApp and an invite link (/welcome?ref=CODE) that fills the code in at sign-up. When the new account verifies a mobile number, both get 14 days of free access (stacked after any trial or plan; a referrer earns from up to 10 friends). Codes can be added at sign-up or in the first 7 days. Highlighted on Discover, Profile, Settings and Upgrade.
- After the free trial or plan ends, only Upgrade, Refer & earn, Settings (account, appearance), Privacy & Safety, Terms and Privacy open; the server answers 402 to everything else except deleting or pausing the account, email status/change and referrals.
- Email alerts: a new match or message emails members who aren't in the app (never the message text), at most once per chat every 6 hours; switch in Profile → Notifications. Needs SMTP in production.
- GIFs in chat (Giphy, GIPHY_API_KEY); automatic photo checks on upload (Sightengine), plus admin photo removal. Both are off until their keys are set.
- Phone app builds (Capacitor) don't sell plans, to follow store billing rules; plans bought on the website work in the app.

- Unmatch: ends the match for both people (DELETE /api/v1/matches/:id). The chat, its messages and media are removed, the likes cleared, and each is passed for the other so neither reappears in Discover. The other person's open chat closes live.
- Account settings (/settings/account): change or set a password (other devices are signed out), change email (code to the new address) or mobile number (SMS code), and pause the profile (hidden from Discover; matches and chats continue).
- Profile prompts (up to 3, from a fixed list) and background details: religion, mother tongue, languages, diet, relationship status, family plans. Shown on profiles; religion, language, diet and status are free Discover filters.
- Chat: typing indicator, reply to a message, one reaction per person (❤️ 😂 😮 😢 👍 🔥), and unsend for everyone (a photo or voice file is deleted too). Empty chats suggest conversation starters from the other person's prompts and shared interests.
- Moderation: an admin Reports tab (open / resolved / all), and Ban, which disables the account and blocks its email and phone number (stored as hashes) from new sign-ups, Google sign-up, phone sign-up and email or phone changes. Lift ban re-enables the account.

- Password reset: existing email/SMS code flow; unavailable-service errors do not claim delivery.
- Terms/privacy: full Terms of Service and Privacy Policy (frontend/src/content/legal.ts), public at /terms and /privacy, shown in the sign-up dialogs and linked from Settings. Before launch: legal review, and set VITE_LEGAL_ENTITY, VITE_LEGAL_ADDRESS and VITE_SUPPORT_EMAIL in frontend/.env.
- Account deletion: Settings → Delete account (password, or typing DELETE for phone/Google-only accounts). DELETE /api/v1/users/me removes the user and, through ON DELETE CASCADE, every related row; their uploaded and verification files are deleted too. Payment orders and reports the member made are kept with the user unlinked (migration 022), for tax records and moderation.
- Email verification: real start/confirm API, development-code disclosure and unavailable-service feedback.
- Photo/ID: selfie capture and ID upload submit to the admin review queue. Pending, rejected and verified states are shown; reviewed files are deleted, and concurrent decisions cannot overwrite one another.
- Super Like: server-backed action with animated star feedback; reduced-motion preference respected.
- Rewind: reverses the server's last pass. Concurrent clicks are blocked and failed requests can be retried. Merely decrementing the card index would leave the pass recorded on the server.
- Message before match: draft/explanation dialog and Like Instead action; no message is sent before matching.
- Photos: select, preview, confirm, upload and send. Failures retain a visible explanation.
- Voice messages: existing recording/upload implementation remains available on supported browsers; unsupported browsers show an inline unavailable state.
- Notifications: device push toggle plus account-level incoming-call/new-message preferences persisted server-side and respected by push delivery. In-app activity remains available. Turning push off persists across app startup.
- Upgrade: existing buttons navigate to /upgrade and use the existing Razorpay flow.

Calling fixes cover cancelled permission requests, delayed ICE configuration, connection failure/timeout, socket disconnection, streamless remote tracks, duplicate audio, blocked-autoplay recovery, delayed mute/camera settings and camera switching after hangup. Eight frontend regression tests cover the call lifecycle. Actual connections between phones on different networks still need device testing and configured TURN credentials.

## Deployment

No demo or sample members are created anywhere; production starts with an empty member list. Reference data (states, districts, cities, sample PIN codes and colleges) is seeded on start; load the full official lists with `npm --prefix backend run import:data:prod -- places|pincodes|institutions <file.csv>` (see README).

Uploaded photos are written to UPLOAD_DIR (default backend/data/uploads). On hosts without a persistent disk (e.g. Render's free plan) they are lost on every redeploy: attach a persistent disk/volume and point UPLOAD_DIR and PRIVATE_UPLOAD_DIR at it. Local data (backend/data), build output and node_modules are not in git and never go into the Docker image.

At startup the server prints one line per outside service (email, SMS, Google, payments, push, call relay) saying whether it is live or which keys it still needs.


Run backend migrations (including 018_notification_preferences.sql) before enabling the new notification settings. Configure the SMTP/email provider for real account emails, existing push/VAPID settings for notifications, Razorpay keys/webhooks for paid upgrades, and TURN settings for networks requiring a media relay. See backend/.env.example. Console delivery is a development preview, not a real email/SMS delivery.
