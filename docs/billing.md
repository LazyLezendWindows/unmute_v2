# Trials and Razorpay membership

Every account gets seven days (168 hours) beginning with its first successful sign-in. Logging out, changing its linked phone number, and signing in again do not reset the trial. Existing accounts without a trial record start their trial on the first session restoration/sign-in after deployment.

Plans are one-time purchases, without automatic renewal: 1 day ₹2, 1 week ₹10, 1 month ₹30, 2 months ₹50, 3 months ₹70, 6 months ₹120, 1 year ₹200. Amounts are stored and sent to Razorpay in paise. Months and years use UTC calendar arithmetic, clamping to the last valid day of the destination month. Renewals add to the later of now, the trial end, and existing paid expiry.

## Setup

1. Run `npm run migrate --prefix backend` before deploying the server (normal startup also migrates).
2. Set backend-only `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and an independent `RAZORPAY_WEBHOOK_SECRET`. Begin with Razorpay test keys. Without API keys checkout is disabled.
3. Enable automatic capture in the Razorpay dashboard. Only captured payments with the correct order, amount and INR currency grant access.
4. Configure the HTTPS webhook `https://YOUR_HOST/api/v1/subscriptions/webhook`, with the same webhook secret and `payment.captured` / `order.paid` events. Signature verification uses the raw body. Repeated callbacks/webhooks grant access only once. The order must belong to the signed-in user for browser confirmation.
5. Complete a test checkout, verify expiry and renewal, and test closing the browser after payment. Webhooks grant access without the browser. “Already paid? Check payment status” reconciles the ten most recent unfulfilled orders directly with Razorpay.
6. Replace test API keys with live keys and configure the live webhook before collecting real money. No real transaction or live Razorpay account setup is performed by automated tests.

References: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

## Access and device limits

The server enforces access for feature APIs, socket handshakes and incoming socket events; an expiry timer closes idle sockets and ongoing calls. Billing, authentication, and safety endpoints stay available. Public profile-image URLs remain public as before.

A random HttpOnly device cookie is claimed atomically in `trial_devices`. A different account on that installation receives an “account already used on this device” message. New email, Google and phone signups check the claim before creating an account. Claims survive logout and account deletion. Account-level trial records prevent resets on a new device. The cookie is not a hardware identifier and does not inspect SIMs, IMEI, contacts, or phone hardware. Shared-device users must use the original account; support policy should account for this.

Clearing cookies/app data, reinstalling, another browser, cookie blocking, or a modified client can evade installation recognition. Perfect multi-account prevention is not possible with a browser cookie. Native device attestation and an account-recovery process are separate follow-up work; this implementation does not claim hardware-level identification. Use the existing Secure/SameSite cookie deployment configuration for Capacitor; test checkout and cookie persistence on target mobile WebViews before release.

Payments are one-time access grants. Automatic refund/dispute revocation and an administrative recovery UI are not implemented.
