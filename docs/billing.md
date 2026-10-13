# Trials and Razorpay membership

Every account gets one day (24 hours) beginning with its first successful sign-in. Logging out, changing its linked phone number, and signing in again do not reset the trial. Existing accounts without a trial record start their trial on the first session restoration/sign-in after deployment.

Plans are one-time purchases, without automatic renewal: 1 hour ₹10, 1 day ₹25, 1 week ₹70, 1 month ₹150, 2 months ₹250, 3 months ₹350, 6 months ₹600, 1 year ₹1,000. Amounts are stored and sent in paise. Months and years use UTC calendar arithmetic, clamping to the last valid day of the destination month. Renewals add to the later of now, the trial end, and existing paid expiry.

## Setup

1. Run `npm run migrate --prefix backend` before deploying the server (normal startup also migrates).
2. Set backend-only `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and an independent `RAZORPAY_WEBHOOK_SECRET`. Begin with Razorpay test keys. Without API keys checkout is disabled.
3. Enable automatic capture in the Razorpay dashboard. Only captured payments with the correct order, amount and INR currency grant access.
4. Configure the HTTPS webhook `https://YOUR_HOST/api/v1/subscriptions/webhook`, with the same webhook secret and `payment.captured` / `order.paid` events. Signature verification uses the raw body. Repeated callbacks/webhooks grant access only once. The order must belong to the signed-in user for browser confirmation.
5. Complete a test checkout, verify expiry and renewal, and test closing the browser after payment. Webhooks grant access without the browser. “Already paid? Check payment status” reconciles the ten most recent unfulfilled orders directly with Razorpay.
6. Replace test API keys with live keys and configure the live webhook before collecting real money. No real transaction or live Razorpay account setup is performed by automated tests.

References: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

## Access

The server enforces access for feature APIs, socket handshakes and incoming socket events; an expiry timer closes idle sockets and ongoing calls. Billing, authentication, and safety endpoints stay available. Public profile-image URLs remain public as before.

Every account gets its own seven-day trial, on any device; several accounts may use the same phone or browser. Signing out and in again, or signing in on another device, never restarts an account's trial. (The earlier one-trial-per-device rule was removed; the unused `trial_devices` table from migration 015 can be dropped later.)

Payments are one-time access grants. Automatic refund/dispute revocation and an administrative recovery UI are not implemented.
