export interface PaymentResult { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface Checkout { open(): void; on(event: string, handler: (event: { error?: { description?: string } }) => void): void }
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => Checkout } }
let loading: Promise<void> | null = null;
export async function loadCheckout() {
  if (window.Razorpay) return;
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => { if (window.Razorpay) resolve(); else reject(new Error('Checkout could not load. Please try again.')); };
    script.onerror = () => { script.remove(); reject(new Error('Checkout could not load. Check your connection and try again.')); };
    document.head.appendChild(script);
  }).catch(err => { loading = null; throw err; });
  return loading;
}
