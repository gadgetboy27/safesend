import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { DealStateBadge } from "@/components/deal-state-badge";
import { DealTimeline } from "@/components/deal-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useGetDeal,
  getGetDealQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useGetSellerStatus,
  getGetSellerStatusQueryKey,
  useConfirmPayment,
  useMarkShipped,
  useReleaseFunds,
  useRaiseDispute,
  useCancelDeal,
  useAcceptDeal,
  useConfirmAsBuyer,
  useGetTracking,
  getGetTrackingQueryKey,
  useGetDealMessages,
  getGetDealMessagesQueryKey,
  useSendDealMessage,
  DealState,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, Truck, AlertTriangle, XCircle, CreditCard, ExternalLink, CheckCircle2, LogIn, ShieldAlert, Send, MessageSquare, Link2, Hash } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { PaymentModal } from "@/components/payment-modal";
import { useAuthContext } from "@/lib/auth-context";

const COURIER_OPTIONS = [
  { value: "nz-post", label: "NZ Post" },
  { value: "aramex", label: "Aramex" },
  { value: "dhl", label: "DHL" },
  { value: "dhl-express", label: "DHL Express" },
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "fastway", label: "Fastway" },
  { value: "toll", label: "Toll" },
  { value: "pack-send", label: "Pack & Send" },
  { value: "go-courier", label: "Go Courier" },
];

function StateGuidance({ state, isBuyer }: { state: string; isBuyer: boolean }) {
  const messages: Partial<Record<string, string>> = {
    created: isBuyer
      ? "Ready to pay — your payment will be held in escrow until you confirm the item arrives."
      : "Waiting for the buyer to pay. Once funded, you'll need to ship and enter a tracking number.",
    funded: isBuyer
      ? "Payment received and held securely in escrow. Waiting for the seller to ship."
      : "Payment received. Ship the item and enter your tracking number to proceed.",
    shipped: isBuyer
      ? "Your item is on its way. Release funds once it arrives, or raise a dispute if something's wrong."
      : "Item shipped — waiting for the buyer to confirm receipt.",
    delivered: isBuyer
      ? "Delivery confirmed. Release funds when satisfied, or raise a dispute if there's a problem. Funds auto-release in 48 hours."
      : "Delivery confirmed by courier — waiting for the buyer to release funds.",
    complete: "This deal is complete. Funds have been transferred to the seller.",
    disputed: "A dispute has been raised. Funds are frozen while an admin reviews the case. For urgent queries email disputes@safesend.nz.",
    cancelled: "This deal has been cancelled.",
    refunded: "This deal was resolved and the buyer has been refunded.",
  };
  const msg = messages[state];
  if (!msg) return null;
  return (
    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3 border border-slate-100 mt-4">
      {msg}
    </p>
  );
}

export default function DealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = params?.id ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { openSignIn } = useAuthContext();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState("");
  const [isShipModalOpen, setIsShipModalOpen] = useState(false);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: me, isLoading: meLoading, isError: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const email = me?.email ?? "";

  const { data: deal, isLoading: dealLoading } = useGetDeal(dealId, {
    query: { enabled: !!dealId && !!me?.email, queryKey: getGetDealQueryKey(dealId) },
  });

  const { data: tracking } = useGetTracking(dealId, {
    query: {
      enabled: !!dealId && !!deal?.trackingNumber && !!me?.email,
      queryKey: getGetTrackingQueryKey(dealId),
    },
  });

  const isBuyer = !!email && deal?.buyerEmail.toLowerCase() === email.toLowerCase();
  const isSeller = !!email && deal?.sellerEmail.toLowerCase() === email.toLowerCase();

  const { data: sellerStatus } = useGetSellerStatus(
    { email },
    {
      query: {
        enabled: isSeller && deal?.state === DealState.funded && !!email,
        queryKey: getGetSellerStatusQueryKey({ email }),
      },
    },
  );

  const confirmPayment = useConfirmPayment();
  const markShipped = useMarkShipped();
  const releaseFunds = useReleaseFunds();
  const raiseDispute = useRaiseDispute();
  const cancelDeal = useCancelDeal();
  const acceptDeal = useAcceptDeal();
  const confirmAsBuyer = useConfirmAsBuyer();
  const sendMessage = useSendDealMessage();

  const pendingConfirmation =
    deal?.state === DealState.pending_seller_acceptance ||
    deal?.state === DealState.pending_buyer_confirmation;

  const { data: messages = [], refetch: refetchMessages } = useGetDealMessages(dealId, {
    query: {
      enabled: !!dealId && !!me?.email && !!deal && !pendingConfirmation,
      queryKey: getGetDealMessagesQueryKey(dealId),
      refetchInterval: 10000,
    },
  });

  // Scroll chat to bottom when messages update or chat opens
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, isChatOpen]);

  const onSendMessage = () => {
    const content = messageInput.trim();
    if (!content || !email) return;
    sendMessage.mutate(
      { dealId, data: { senderEmail: email, content } },
      {
        onSuccess: () => {
          setMessageInput("");
          void refetchMessages();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to send message";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const invalidateDeal = () =>
    queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) });

  // Handle ?payment=success return from Stripe 3-D Secure redirect
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("payment") === "success") {
      setPaymentJustCompleted(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Poll until webhook transitions deal to funded
  useEffect(() => {
    if (!paymentJustCompleted || deal?.state === DealState.funded) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) });
    }, 2000);
    return () => clearInterval(id);
  }, [paymentJustCompleted, deal?.state, dealId, queryClient]);

  useEffect(() => {
    if (deal?.state === DealState.funded) setPaymentJustCompleted(false);
  }, [deal?.state]);

  const onConfirmPayment = () => {
    if (!isBuyer) return;
    confirmPayment.mutate(
      { dealId, data: { buyerEmail: email } },
      {
        onSuccess: (data) => {
          if (data.clientSecret) {
            setPaymentClientSecret(data.clientSecret);
            setIsPaymentModalOpen(true);
          } else {
            toast({ title: "Error", description: "No payment client secret returned.", variant: "destructive" });
          }
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Payment initiation failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onAcceptDeal = () => {
    if (!isSeller) return;
    acceptDeal.mutate(
      { dealId },
      {
        onSuccess: () => {
          toast({ title: "Deal Accepted", description: "The buyer has been notified and can now pay." });
          invalidateDeal();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Accept failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onConfirmAsBuyer = () => {
    if (!isBuyer) return;
    confirmAsBuyer.mutate(
      { dealId },
      {
        onSuccess: () => {
          toast({ title: "Deal Confirmed", description: "You've confirmed this deal. You can now pay into escrow." });
          invalidateDeal();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Confirmation failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onReleaseFunds = () => {
    if (!isBuyer) return;
    releaseFunds.mutate(
      { dealId, data: { buyerEmail: email } },
      {
        onSuccess: () => {
          toast({ title: "Funds Released", description: "The seller has been paid. Thank you for using SafeSend." });
          invalidateDeal();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Release failed";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  // ── Loading states ──────────────────────────────────────────────────────────

  if (meLoading || (!deal && !meError && dealLoading)) {
    return <Layout><div className="p-12 text-center text-slate-500">Loading…</div></Layout>;
  }

  if (meError) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20 text-center">
          <LogIn className="w-12 h-12 text-teal-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign in to view this deal</h1>
          <p className="text-slate-600 mb-6">You need to be signed in to access deal details.</p>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={openSignIn}
          >
            Sign in
          </Button>
        </div>
      </Layout>
    );
  }

  if (!deal) {
    return (
      <Layout>
        <div className="p-12 text-center text-red-600">Deal not found.</div>
      </Layout>
    );
  }

  // Pending buyer confirmation — buyer must authenticate and confirm before they can pay
  if (deal && deal.state === DealState.pending_buyer_confirmation) {
    return (
      <Layout>
        <div className="container max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7 text-teal-700" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{deal.title}</h1>
            <p className="text-slate-500 text-sm mb-6">
              Listed by <strong>{deal.sellerEmail}</strong> · ${deal.amountNzd.toFixed(2)} NZD + ${deal.feeNzd.toFixed(2)} fee = <strong>${deal.totalNzd.toFixed(2)} NZD total</strong>
            </p>

            <div className="text-left space-y-3 mb-6">
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Item Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{deal.description}</p>
              </div>
              {deal.itemUrl && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 flex gap-2 items-center">
                  <Link2 className="h-4 w-4 text-teal-600 shrink-0" />
                  <a href={deal.itemUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-700 underline break-all">{deal.itemUrl}</a>
                </div>
              )}
              {deal.referenceNumber && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 flex gap-2 items-center">
                  <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                  <p className="text-sm font-mono text-slate-700">Ref: {deal.referenceNumber}</p>
                </div>
              )}
            </div>

            {isBuyer ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 text-left mb-6">
                  <p className="font-semibold mb-1">Review before confirming</p>
                  <p>By confirming, you agree these item details are correct and you are the buyer on this deal. Funds will only be released to the seller after you confirm delivery.</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    className="text-slate-600"
                    onClick={() => setIsCancelModalOpen(true)}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Decline
                  </Button>
                  <Button
                    className="bg-teal-700 hover:bg-teal-800 text-white"
                    onClick={onConfirmAsBuyer}
                    disabled={confirmAsBuyer.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {confirmAsBuyer.isPending ? "Confirming…" : "I confirm — proceed to payment"}
                  </Button>
                </div>
              </>
            ) : isSeller ? (
              <p className="text-slate-600 text-sm bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                Waiting for the buyer (<strong>{deal.buyerEmail}</strong>) to sign in and confirm they agree to the deal terms.
                You'll receive an email as soon as they do.
              </p>
            ) : (
              <p className="text-slate-500 text-sm">This deal is pending buyer confirmation.</p>
            )}
          </div>
        </div>
        <CancelModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          dealId={deal.id}
          email={email}
          onSuccess={() => navigate("/deals")}
        />
      </Layout>
    );
  }

  // Pending seller acceptance — show a dedicated acceptance screen to the seller
  if (deal && deal.state === DealState.pending_seller_acceptance) {
    return (
      <Layout>
        <div className="container max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{deal.title}</h1>
            <p className="text-slate-500 text-sm mb-6">
              Deal from <strong>{deal.buyerEmail}</strong> · ${deal.amountNzd.toFixed(2)} NZD
            </p>
            <p className="text-slate-700 text-sm mb-6 bg-slate-50 rounded-lg px-4 py-3 text-left border border-slate-100">
              {deal.description}
            </p>
            {isSeller ? (
              <>
                <p className="text-slate-600 text-sm mb-6">
                  By accepting, you confirm the item description and price are correct.
                  The buyer will be notified and prompted to pay into escrow.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    className="text-slate-600"
                    onClick={() => setIsCancelModalOpen(true)}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Decline
                  </Button>
                  <Button
                    className="bg-teal-700 hover:bg-teal-800 text-white"
                    onClick={onAcceptDeal}
                    disabled={acceptDeal.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {acceptDeal.isPending ? "Accepting…" : "Accept Deal"}
                  </Button>
                </div>
              </>
            ) : isBuyer ? (
              <p className="text-slate-600 text-sm bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                Waiting for the seller (<strong>{deal.sellerEmail}</strong>) to accept the deal terms.
                You'll receive an email as soon as they do.
              </p>
            ) : (
              <p className="text-slate-500 text-sm">This deal is pending seller acceptance.</p>
            )}
          </div>
        </div>
        <CancelModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          dealId={deal.id}
          email={email}
          onSuccess={() => navigate("/deals")}
        />
      </Layout>
    );
  }

  if (!!email && !isBuyer && !isSeller) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20 text-center">
          <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Not your deal</h1>
          <p className="text-slate-600 mb-6">
            Your account ({email}) is not listed as a buyer or seller on this deal.
          </p>
          <Button variant="outline" onClick={() => navigate("/deals")}>Go to My Deals</Button>
        </div>
      </Layout>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto px-4 py-12">

        {/* Payment processing banner */}
        {paymentJustCompleted && deal.state === DealState.created && (
          <div className="mb-6 flex items-center gap-3 rounded-lg px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Payment received — confirming with your bank. This usually takes a few seconds…</span>
          </div>
        )}

        {/* Payment success banner */}
        {deal.state === DealState.funded && !paymentJustCompleted && (
          <div className="mb-6 flex items-center gap-3 rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Payment confirmed and held securely in escrow.</span>
          </div>
        )}

        {/* Seller: Stripe Connect onboarding banner */}
        {isSeller && deal.state === DealState.funded && sellerStatus && !sellerStatus.onboardingComplete && (
          <div className="mb-6 flex items-start gap-3 rounded-lg px-4 py-4 bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Set up your payout account</p>
              <p className="text-sm text-amber-700 mt-1">
                Payment is held in escrow but you haven't connected a bank account yet. You need to complete payout setup before funds can be released to you.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={() => navigate("/seller/onboard")}
            >
              Set up payouts
            </Button>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{deal.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {deal.invoiceNumber && (
                <span
                  className="font-mono text-sm font-bold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full tracking-wide cursor-pointer select-all"
                  title="Contract number — quote this in any dispute"
                  onClick={() => {
                    navigator.clipboard.writeText(deal.invoiceNumber!);
                    toast({ title: "Copied", description: `Contract number ${deal.invoiceNumber} copied.` });
                  }}
                >
                  {deal.invoiceNumber}
                </span>
              )}
              <p className="text-slate-400 text-xs font-mono">ID: {deal.id.slice(0, 8)}…</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(isBuyer || isSeller) && (
              <span className="text-sm font-medium px-3 py-1 bg-slate-100 rounded-full text-slate-600">
                You are the {isBuyer ? "Buyer" : "Seller"}
              </span>
            )}
            <DealStateBadge state={deal.state} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 overflow-x-auto">
          <DealTimeline state={deal.state} />
          <StateGuidance state={deal.state} isBuyer={isBuyer} />
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold mb-4 border-b pb-2">Item Details</h2>
              <p className="whitespace-pre-wrap text-slate-700 mb-4">{deal.description}</p>
              {deal.itemUrl && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <Link2 className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500 mb-0.5">Listing URL</p>
                    <a
                      href={deal.itemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-teal-700 underline underline-offset-2 break-all hover:text-teal-900"
                    >
                      {deal.itemUrl}
                    </a>
                  </div>
                </div>
              )}
              {deal.referenceNumber && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <Hash className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-0.5">Reference / PO</p>
                    <p className="text-sm font-mono text-slate-800">{deal.referenceNumber}</p>
                  </div>
                </div>
              )}
            </div>

            {deal.trackingNumber && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 mb-4 border-b pb-2">
                  <Truck className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl font-semibold">Shipping Details</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-500">Courier</p>
                    <p className="font-medium">{deal.courierSlug}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Tracking Number</p>
                    <p className="font-medium font-mono">{deal.trackingNumber}</p>
                  </div>
                </div>
                {deal.signatureRequired !== undefined && (
                  <div
                    className={`mb-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm border ${
                      deal.signatureRequired
                        ? "bg-green-50 border-green-100 text-green-800"
                        : "bg-amber-50 border-amber-100 text-amber-800"
                    }`}
                  >
                    <span className="mt-0.5">{deal.signatureRequired ? "✓" : "⚠"}</span>
                    <span>
                      {deal.signatureRequired
                        ? "Signature required at delivery"
                        : "Signature waived — funds release on courier-confirmed delivery without a signature."}
                    </span>
                  </div>
                )}

                {tracking?.events && tracking.events.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm text-slate-900">Tracking History</h3>
                    <div className="relative pl-4 border-l-2 border-slate-100 space-y-4">
                      {tracking.events.map((event, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-blue-500 border-2 border-white" />
                          <p className="text-sm font-medium text-slate-900">{event.message}</p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(event.timestamp), "MMM d, h:mm a")}
                            {event.location && ` • ${event.location}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h2 className="font-semibold mb-4 text-slate-900">Summary</h2>
              <div className="space-y-3 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Item Price</span>
                  <span className="font-medium">${deal.amountNzd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">SafeSend Fee</span>
                  <span className="font-medium">${deal.feeNzd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="font-bold text-slate-900">${deal.totalNzd.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                {isBuyer && deal.state === DealState.created && (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={onConfirmPayment}
                    disabled={confirmPayment.isPending}
                  >
                    <CreditCard className="w-4 h-4 mr-2" /> Pay ${deal.totalNzd.toFixed(2)}
                  </Button>
                )}

                {isSeller && deal.state === DealState.funded && (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setIsShipModalOpen(true)}
                  >
                    <Package className="w-4 h-4 mr-2" /> Mark as Shipped
                  </Button>
                )}

                {isBuyer && (deal.state === DealState.shipped || deal.state === DealState.delivered) && (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={onReleaseFunds}
                    disabled={releaseFunds.isPending}
                  >
                    <Package className="w-4 h-4 mr-2" /> Item Received — Release Funds
                  </Button>
                )}

                {(deal.state === DealState.funded ||
                  deal.state === DealState.shipped ||
                  deal.state === DealState.delivered) && (
                  <Button
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setIsDisputeModalOpen(true)}
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" /> Raise Dispute
                  </Button>
                )}

                {(deal.state === DealState.created || deal.state === DealState.pending_seller_acceptance) && (
                  <Button
                    variant="ghost"
                    className="w-full text-slate-500"
                    onClick={() => setIsCancelModalOpen(true)}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Cancel Deal
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <p className="text-sm text-slate-600 mb-3">Share tracking with the buyer or others.</p>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/track/${deal.id}`);
                  toast({ title: "Copied", description: "Public tracking link copied." });
                }}
              >
                <ExternalLink className="w-3 h-3 mr-2" /> Copy Public Link
              </Button>
            </div>

            {/* Chat toggle button — only once deal is active (past pending states) */}
            {(isBuyer || isSeller) && !pendingConfirmation && (
              <Button
                className={`w-full flex items-center justify-center gap-2 transition-colors ${
                  isChatOpen
                    ? "bg-teal-700 hover:bg-teal-800 text-white"
                    : "bg-white border border-teal-300 text-teal-700 hover:bg-teal-50"
                }`}
                variant={isChatOpen ? "default" : "outline"}
                onClick={() => setIsChatOpen((o) => !o)}
              >
                <MessageSquare className="w-4 h-4" />
                {isChatOpen ? "Hide Chat" : "Open Chat"}
                {messages.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isChatOpen ? "bg-white/20" : "bg-teal-100 text-teal-700"
                  }`}>
                    {messages.length}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* ── Deal Messaging Thread ── */}
        {isChatOpen && (isBuyer || isSeller) && !pendingConfirmation && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <MessageSquare className="h-5 w-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-900">Deal Messages</h2>
              <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                Kept on-platform for dispute evidence
              </span>
            </div>

            {/* Privacy note */}
            <div className="mx-4 mt-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 flex items-start gap-2">
              <span className="mt-0.5">🔒</span>
              <span>Messages are private between buyer and seller only. They may be reviewed by SafeSend admins in the event of a dispute.</span>
            </div>

            {/* Messages */}
            <div className="px-4 py-4 space-y-3 min-h-[160px] max-h-96 overflow-y-auto scroll-smooth">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">No messages yet — start the conversation.</p>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderEmail.toLowerCase() === email.toLowerCase();
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                        {isMe ? "You" : (isBuyer ? "Seller" : "Buyer")}
                      </span>
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? "bg-teal-700 text-white rounded-tr-sm"
                            : "bg-slate-100 text-slate-900 rounded-tl-sm"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4 flex gap-2">
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-full border-slate-200 focus:border-teal-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSendMessage();
                  }
                }}
                disabled={sendMessage.isPending}
              />
              <Button
                size="icon"
                className="rounded-full bg-teal-700 hover:bg-teal-800 shrink-0"
                onClick={onSendMessage}
                disabled={sendMessage.isPending || !messageInput.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        clientSecret={paymentClientSecret}
        totalNzd={deal.totalNzd}
        dealId={deal.id}
        onSuccess={() => {
          setPaymentJustCompleted(true);
          invalidateDeal();
        }}
      />
      <ShipModal
        isOpen={isShipModalOpen}
        onClose={() => setIsShipModalOpen(false)}
        dealId={deal.id}
        sellerEmail={email}
        onSuccess={invalidateDeal}
      />
      <DisputeModal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        dealId={deal.id}
        email={email}
        onSuccess={invalidateDeal}
      />
      <CancelModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        dealId={deal.id}
        email={email}
        onSuccess={invalidateDeal}
      />
    </Layout>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────

const shipSchema = z.object({
  trackingNumber: z.string().min(3, "Tracking number required"),
  courierSlug: z.string().min(2, "Courier required"),
});

function ShipModal({ isOpen, onClose, dealId, sellerEmail, onSuccess }: {
  isOpen: boolean; onClose: () => void; dealId: string; sellerEmail: string; onSuccess: () => void;
}) {
  const markShipped = useMarkShipped();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof shipSchema>>({
    resolver: zodResolver(shipSchema),
    defaultValues: { trackingNumber: "", courierSlug: "" },
  });

  const onSubmit = (data: z.infer<typeof shipSchema>) => {
    markShipped.mutate(
      { dealId, data: { ...data, sellerEmail } },
      {
        onSuccess: () => {
          toast({ title: "Marked as Shipped", description: "Tracking details saved. The buyer can now monitor delivery." });
          onSuccess();
          onClose();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to mark as shipped";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Shipped</DialogTitle>
          <DialogDescription>
            Enter tracking details. The buyer will be able to follow delivery progress.
          </DialogDescription>
        </DialogHeader>

        {/* Seller proof disclosure — NZ P2P courier escrow requirement */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-amber-800">What you need to do to receive payment:</p>
          <ul className="space-y-1 pl-1">
            <li><span className="font-semibold">1.</span> Ship with a <span className="font-semibold">tracked courier</span> (NZ Post, Aramex, etc.)</li>
            <li><span className="font-semibold">2.</span> Enter the correct tracking number below — this is your proof of shipment</li>
            <li><span className="font-semibold">3.</span> The courier must record a <span className="font-semibold">first scan within 48 hours</span> of you marking shipped, or the shipment will be flagged and the buyer may cancel</li>
            <li><span className="font-semibold">4.</span> Funds release automatically 48 hours after the courier records a "Delivered" scan, or when the buyer confirms receipt</li>
          </ul>
          <p className="text-amber-700 pt-0.5">
            See the <a href="/escrow-agreement" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Escrow Agreement</a> for full details.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="courierSlug" render={({ field }) => (
              <FormItem>
                <FormLabel>Courier</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select courier…" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COURIER_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="trackingNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Tracking Number</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={markShipped.isPending} className="bg-blue-600 text-white">
                Save Tracking
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const disputeSchema = z.object({
  category: z.enum(["not_received", "not_as_described", "other"], {
    required_error: "Please select a dispute category",
  }),
  reason: z.string().min(20, "Please describe the issue in at least 20 characters"),
});

const DISPUTE_CATEGORIES = [
  { value: "not_received", label: "Item not received" },
  { value: "not_as_described", label: "Item not as described" },
  { value: "other", label: "Other" },
];

function DisputeModal({ isOpen, onClose, dealId, email, onSuccess }: {
  isOpen: boolean; onClose: () => void; dealId: string; email: string; onSuccess: () => void;
}) {
  const raiseDispute = useRaiseDispute();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof disputeSchema>>({
    resolver: zodResolver(disputeSchema),
    defaultValues: { category: undefined, reason: "" },
  });

  const onSubmit = (data: z.infer<typeof disputeSchema>) => {
    const fullReason = `[${DISPUTE_CATEGORIES.find((c) => c.value === data.category)?.label ?? data.category}] ${data.reason}`;
    raiseDispute.mutate(
      { dealId, data: { raisedByEmail: email, reason: fullReason } },
      {
        onSuccess: () => {
          toast({ title: "Dispute Raised", description: "Funds are frozen. An admin will review your case and be in touch." });
          onSuccess();
          onClose();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to raise dispute";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-red-600">Raise a Dispute</DialogTitle>
          <DialogDescription>
            Funds will be frozen immediately while an admin reviews your case. Please provide as much detail as possible.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 mb-2">
          <strong>What happens next:</strong> Both parties will be contacted by email. The admin will review evidence and make a resolution decision, typically within 2–3 business days.{" "}
          For urgent matters email <a href="mailto:disputes@safesend.nz" className="font-semibold underline underline-offset-2">disputes@safesend.nz</a>.
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>What went wrong?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select a category…" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DISPUTE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Describe the issue</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Describe what happened in detail — include dates, what was agreed, and what actually occurred…"
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={raiseDispute.isPending} variant="destructive">
                Raise Dispute
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const cancelSchema = z.object({
  reason: z.string().optional(),
});

function CancelModal({ isOpen, onClose, dealId, email, onSuccess }: {
  isOpen: boolean; onClose: () => void; dealId: string; email: string; onSuccess: () => void;
}) {
  const cancelDeal = useCancelDeal();
  const { toast } = useToast();
  const form = useForm<z.infer<typeof cancelSchema>>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: "" },
  });

  const onSubmit = (data: z.infer<typeof cancelSchema>) => {
    cancelDeal.mutate(
      { dealId, data: { requestedByEmail: email, reason: data.reason } },
      {
        onSuccess: () => {
          toast({ title: "Deal Cancelled", description: "The deal has been cancelled and no funds were charged." });
          onSuccess();
          onClose();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to cancel";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Deal</DialogTitle>
          <DialogDescription>
            This will cancel the deal. No payment will be charged. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason (optional)</FormLabel>
                <FormControl><Input {...field} placeholder="Why are you cancelling?" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Keep Deal</Button>
              <Button type="submit" disabled={cancelDeal.isPending} variant="destructive">
                Cancel Deal
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
