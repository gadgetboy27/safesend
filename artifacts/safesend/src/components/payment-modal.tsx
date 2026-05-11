import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { ShieldCheck, Phone, User } from "lucide-react";

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

// ── Step 1 & 2: Phone verification gate ───────────────────────────────────────

function PhoneVerificationGate({ onVerified }: { onVerified: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"collect" | "otp">("collect");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { toast({ title: "Name required", description: "Please enter your full name.", variant: "destructive" }); return; }
    if (phone.trim().length < 7) { toast({ title: "Phone required", description: "Please enter a valid mobile number.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      setStep("otp");
      toast({ title: "Code sent", description: `A 6-digit code was sent to ${phone}.` });
    } catch (err) {
      toast({ title: "Couldn't send code", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) { toast({ title: "Code required", description: "Enter the code from your SMS.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-phone/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim(), name: name.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      toast({ title: "Phone verified", description: "Identity confirmed. Proceeding to payment." });
      onVerified();
    } catch (err) {
      toast({ title: "Verification failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* NZ law notice */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 leading-relaxed">
        <p className="font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Identity verification required
        </p>
        <p>
          Under New Zealand's Anti-Money Laundering and Countering Financing of Terrorism Act 2009 (AML/CFT Act),
          SafeSend is required to verify the identity of buyers before processing escrow payments.
          We collect your name and a verified mobile number. This is a one-time step — you won't be asked again.
        </p>
      </div>

      {step === "collect" ? (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1.5">
              <User className="h-4 w-4 text-slate-400" />
              Your full name
            </label>
            <Input
              placeholder="e.g. Jane Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Phone className="h-4 w-4 text-slate-400" />
              Mobile number
            </label>
            <Input
              type="tel"
              placeholder="+64 21 000 0000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
            <p className="text-xs text-slate-400 mt-1">NZ or international format. We'll send a 6-digit code.</p>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
            {loading ? "Sending code…" : "Send verification code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmOtp} className="space-y-4">
          <p className="text-sm text-slate-600">
            Enter the 6-digit code sent to <span className="font-semibold">{phone}</span>.
          </p>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-xl tracking-widest font-mono"
            autoFocus
          />
          <Button type="submit" disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
            {loading ? "Verifying…" : "Confirm & continue to payment"}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("collect"); setCode(""); }}
            className="w-full text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Wrong number? Go back
          </button>
        </form>
      )}
    </div>
  );
}

// ── Payment form (Stripe) ──────────────────────────────────────────────────────

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
      confirmParams: { return_url: `${window.location.origin}${baseUrl}/deals/${dealId}?payment=success` },
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

      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 space-y-1.5 leading-relaxed">
        <p className="font-semibold text-teal-800">How your funds are protected:</p>
        <ul className="space-y-1 pl-1 text-teal-800">
          <li><span className="font-semibold">Release trigger:</span> Funds release when the courier records a "Delivered" scan or you confirm receipt — not before.</li>
          <li><span className="font-semibold">Auto-release:</span> If you take no action within <span className="font-semibold">48 hours</span> of a delivery scan, funds automatically release to the seller.</li>
          <li><span className="font-semibold">If disputed:</span> Funds are frozen and held for up to <span className="font-semibold">14 calendar days</span> while SafeSend reviews. If unresolved, you receive a full refund.</li>
        </ul>
        <p className="text-teal-700 pt-0.5">
          Full details in the{" "}
          <a href="/escrow-agreement" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Escrow Agreement</a>.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="buyerConsent"
          checked={buyerConsentAccepted}
          onCheckedChange={(v) => setBuyerConsentAccepted(v === true)}
          className="mt-0.5 flex-shrink-0"
        />
        <label htmlFor="buyerConsent" className="text-sm text-slate-600 leading-relaxed cursor-pointer select-none">
          I understand that my payment will be held in escrow and released to the seller only after delivery is confirmed. I agree to the{" "}
          <a href="/escrow-agreement" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2">Escrow Agreement</a>{" "}
          and the 48-hour auto-release and 14-day dispute hold periods.
        </label>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
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

// ── Modal shell ───────────────────────────────────────────────────────────────

export function PaymentModal({ isOpen, onClose, clientSecret, totalNzd, dealId, onSuccess }: PaymentModalProps) {
  const { data: me, refetch: refetchMe } = useGetMe();
  const [phoneJustVerified, setPhoneJustVerified] = useState(false);

  const phoneVerified = !!(me?.phoneVerifiedAt) || phoneJustVerified;

  if (!stripePromise) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Setup Required</DialogTitle>
            <DialogDescription>
              The Stripe publishable key is not configured. Add{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to your environment variables.
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
          <DialogTitle>{phoneVerified ? "Secure Payment" : "Verify Your Identity"}</DialogTitle>
          <DialogDescription>
            {phoneVerified
              ? <>Your payment of <strong>${totalNzd.toFixed(2)} NZD</strong> will be held in escrow until you confirm receipt.</>
              : "One-time identity check required before payment — takes about 30 seconds."}
          </DialogDescription>
        </DialogHeader>

        {!phoneVerified ? (
          <PhoneVerificationGate
            onVerified={async () => {
              await refetchMe();
              setPhoneJustVerified(true);
            }}
          />
        ) : (
          clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#0f766e" } } }}
            >
              <PaymentForm onClose={onClose} totalNzd={totalNzd} dealId={dealId} onSuccess={onSuccess} />
            </Elements>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
