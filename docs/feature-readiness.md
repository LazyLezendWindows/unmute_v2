# Unfinished-section checklist

- Password reset: existing email/SMS code flow; unavailable-service errors do not claim delivery.
- Terms/privacy: registration opens draft-summary modals; these remain labelled as summaries, not final legal documents.
- Email verification: real start/confirm API, development-code disclosure and unavailable-service feedback.
- Photo/ID: disabled entry points with Coming soon badges, as requested. Existing pending/verified review status is retained; underlying upload/review code is preserved for later enablement.
- Super Like: server-backed action with animated star feedback; reduced-motion preference respected.
- Rewind: reverses the server's last pass. Concurrent clicks are blocked and failed requests can be retried. Merely decrementing the card index would leave the pass recorded on the server.
- Message before match: draft/explanation dialog and Like Instead action; no message is sent before matching.
- Photos: select, preview, confirm, upload and send. Failures retain a visible explanation.
- Voice messages: existing recording/upload implementation remains available on supported browsers; unsupported browsers show an inline unavailable state.
- Notifications: device push toggle plus account-level incoming-call/new-message preferences persisted server-side and respected by push delivery. In-app activity remains available. Turning push off persists across app startup.
- Upgrade: existing buttons navigate to /upgrade and use the existing Razorpay flow.

Calling fixes cover cancelled permission requests, delayed ICE configuration, connection failure/timeout, socket disconnection, streamless remote tracks, duplicate audio and blocked-autoplay recovery. Six frontend regression tests cover the call lifecycle. Actual connections between phones on different networks still need device testing and configured TURN credentials.

## Deployment

Run backend migrations (including 018_notification_preferences.sql) before enabling the new notification settings. Configure the SMTP/email provider for real account emails, existing push/VAPID settings for notifications, Razorpay keys/webhooks for paid upgrades, and TURN settings for networks requiring a media relay. See backend/.env.example. Console delivery is a development preview, not a real email/SMS delivery.
