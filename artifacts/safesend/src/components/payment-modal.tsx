import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string;
  totalNzd: number;
  dealId: string;
  onSuccess: () => void;
}

function PaymentForm({
  onClose,
  totalNzd,
  dealId,
  onSuccess,
}: {
  onClose: () => void;
  totalNzd: number;
  dealId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [buyerConsentAccepted, setBuyerConsentAccepted] = useState(false);

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !buyerConsentAccepted) return;

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${baseUrl}/deals/${dealId}?payment=success`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({ title: "Payment failed", description: error.message, variant: "destructive" });
      setIsProcessing(false);
    } else {
      toast({ title: "Payment successful!", description: "Your funds are held in escrow. The seller has been notified." });
      onSuccess();
      onClose();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />

      {/* Buyer escrow disclosure — NZ P2P courier escrow requirement */}
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 space-y-1.5 leading-relaxed">
        <p className="font-semibold text-teal-800">How your funds are protected:</p>
        <ul className="space-y-1 pl-1 text-teal-800">
          <li><span className="font-semibold">Release trigger:</span> Funds release when the courier records a "Delivered" scan or you confirm receipt — not before.</li>
          <li><span className="font-semibold">Auto-release:</span> If you take no action within <span className="font-semibold">48 hours</span> of a delivery scan, funds automatically release to the seller.</li>
          <li><span className="font-semibold">If disputed:</span> Funds are frozen and held for up to <span className="font-semibold">14 calendar days</span> while SafeSend reviews. If unresolved, you receive a full refund.</li>
        </ul>
        <p className="text-teal-700 pt-0.5">
          Full details in the{" "}
          <a href="/escrow-agreement" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
            Escrow Agreement
          </a>.
        </p>
      </div>

      {/* Buyer consent checkbox */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="buyerConsent"
          checked={buyerConsentAccepted}
          onCheckedChange={(v) => setBuyerConsentAccepted(v === true)}
          className="mt-0.5 flex-shrink-0"
        />
        <label htmlFor="buyerConsent" className="text-sm text-slate-600 leading-relaxed cursor-pointer select-none">
          I understand that my payment will be held in escrow and released to the seller only after delivery is confirmed. I agree to the{" "}
          <a href="/escrow-agreement" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2">
            Escrow Agreement
          </a>{" "}
          and the 48-hour auto-release and 14-day dispute hold periods.
        </label>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || isProcessing || !buyerConsentAccepted}
          className="bg-amber-500 hover:bg-amber-600 text-white min-w-32 disabled:opacity-50"
        >
          {isProcessing ? "Processing…" : `Pay $${totalNzd.toFixed(2)} NZD`}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({ isOpen, onClose, clientSecret, totalNzd, dealId, onSuccess }: PaymentModalProps) {
  if (!stripePromise) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Setup Required</DialogTitle>
            <DialogDescription>
              The Stripe publishable key is not configured. Add{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to your
              environment variables (your test key starts with <code className="text-xs bg-slate-100 px-1 rounded">pk_test_</code>).
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Secure Payment</DialogTitle>
          <DialogDescription>
            Your payment of <strong>${totalNzd.toFixed(2)} NZD</strong> will be held in escrow until you confirm receipt.
          </DialogDescription>
        </DialogHeader>
        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: { colorPrimary: "#0f766e" },
              },
            }}
          >
            <PaymentForm onClose={onClose} totalNzd={totalNzd} dealId={dealId} onSuccess={onSuccess} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
