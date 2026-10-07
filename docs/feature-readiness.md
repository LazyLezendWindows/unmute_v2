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

At startup the server prints one line per outside service (email, SMS, Google, payments, push, call relay) saying whether it is live or which keys it still needs.


Run backend migrations (including 018_notification_preferences.sql) before enabling the new notification settings. Configure the SMTP/email provider for real account emails, existing push/VAPID settings for notifications, Razorpay keys/webhooks for paid upgrades, and TURN settings for networks requiring a media relay. See backend/.env.example. Console delivery is a development preview, not a real email/SMS delivery.
