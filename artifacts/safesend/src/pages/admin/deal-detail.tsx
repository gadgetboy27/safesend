import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useGetDeal, getGetDealQueryKey, useResolveDispute } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DealStateBadge } from "@/components/deal-state-badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, Clock, CheckCircle2, XCircle, ExternalLink, Copy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

function CopyField({ label, value }: { label: string; value: string | null | undefined }) {
  const { toast } = useToast();
  if (!value) return null;
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 shrink-0 mr-3">{label}</span>
      <span className="font-mono text-xs text-slate-800 truncate max-w-[240px]" title={value}>{value}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast({ description: `${label} copied` }); }}
        className="ml-2 text-slate-400 hover:text-slate-700 shrink-0"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function AdminDealDetail() {
  const [, params] = useRoute("/admin/deals/:id");
  const dealId = params?.id ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminNote, setAdminNote] = useState("");
  const [transitions, setTransitions] = useState<any[]>([]);
  const [loadingTransitions, setLoadingTransitions] = useState(false);

  const { data: deal, isLoading, isError } = useGetDeal(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealQueryKey(dealId) },
  });

  const resolveDispute = useResolveDispute();

  async function loadTransitions() {
    setLoadingTransitions(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/transitions`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTransitions(data.transitions ?? []);
    } catch (e: any) {
      toast({ title: "Could not load audit trail", description: e.message, variant: "destructive" });
    } finally {
      setLoadingTransitions(false);
    }
  }

  const handleResolve = (resolution: "refund_buyer" | "release_to_seller") => {
    if (!confirm(`Confirm: ${resolution === "refund_buyer" ? "refund the buyer" : "release funds to seller"}? This cannot be undone.`)) return;
    resolveDispute.mutate(
      { dealId, data: { resolution, adminNote: adminNote || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Dispute resolved", description: resolution.replace(/_/g, " ") });
          queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) });
        },
        onError: (err: any) => toast({ title: "Resolution failed", description: err.message, variant: "destructive" }),
      },
    );
  };

  if (isLoading) return <Layout><div className="p-12 text-center text-slate-500">Loading deal…</div></Layout>;

  if (isError || !deal) {
    return (
      <Layout>
        <div className="container max-w-md mx-auto px-4 py-20 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Deal not found</h1>
          <p className="text-slate-500 mb-6">
            This deal ID doesn't exist, or your session doesn't have admin access.
          </p>
          <Link href="/admin"><Button variant="outline">Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  const ts = (v: string | null | undefined) =>
    v ? format(new Date(v), "d MMM yyyy, HH:mm:ss") : null;

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" className="-ml-4 text-slate-500">
              <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {deal.invoiceNumber && (
                <span className="font-mono text-sm font-bold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                  {deal.invoiceNumber}
                </span>
              )}
              <span className="font-mono text-xs text-slate-400">{deal.id}</span>
            </div>
          </div>
          <DealStateBadge state={deal.state} />
        </div>

        {/* Error banner — shows any Stripe transfer errors so nothing is hidden */}
        {deal.stripeTransferError && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex gap-3">
            <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-semibold text-sm">Stripe transfer error recorded</p>
              <p className="text-red-700 text-sm mt-1">{deal.stripeTransferError}</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Parties */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Parties</h3>
            <Row label="Buyer" value={deal.buyerEmail} />
            <Row label="Seller" value={deal.sellerEmail} />
            <Row label="Created by" value={deal.creatorRole} />
          </div>

          {/* Financials */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Financials (NZD)</h3>
            <Row label="Item price" value={`$${Number(deal.amountNzd).toFixed(2)}`} />
            <Row label="Platform fee" value={`$${Number(deal.feeNzd).toFixed(2)}`} />
            {Number(deal.kycFeeNzd) > 0 && <Row label="ID verification fee" value={`$${Number(deal.kycFeeNzd).toFixed(2)}`} />}
            <Row label="Total charged to buyer" value={<span className="font-bold">${Number(deal.totalNzd).toFixed(2)}</span>} />
          </div>

          {/* Timestamps */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Timeline</h3>
            <Row label="Created" value={ts(deal.createdAt)} />
            <Row label="Funded" value={ts(deal.fundedAt)} />
            <Row label="Shipped" value={ts(deal.shippedAt)} />
            <Row label="Delivered" value={ts(deal.deliveredAt)} />
            <Row label="Completed" value={ts(deal.completedAt)} />
          </div>

          {/* Stripe & tracking IDs */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">References</h3>
            <CopyField label="Stripe PI" value={deal.stripePaymentIntentId} />
            <CopyField label="Stripe Transfer" value={deal.stripeTransferId} />
            <CopyField label="Stripe Refund" value={deal.stripeRefundId} />
            <CopyField label="Tracking #" value={deal.trackingNumber} />
            <Row label="Courier" value={deal.courierSlug} />
            <Row label="Signature required" value={deal.signatureRequired ? "Yes" : "No"} />
            {deal.itemUrl && (
              <div className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Listing URL</span>
                <a href={deal.itemUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline flex items-center gap-1">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-2 text-sm uppercase tracking-wide">Item Description</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{deal.description}</p>
        </div>

        {/* Audit trail */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">State Transition Audit Trail</h3>
            <Button size="sm" variant="outline" onClick={loadTransitions} disabled={loadingTransitions}>
              {loadingTransitions ? "Loading…" : transitions.length ? "Refresh" : "Load audit trail"}
            </Button>
          </div>
          {transitions.length > 0 ? (
            <ol className="space-y-3">
              {transitions.map((t) => (
                <li key={t.id} className="flex gap-3 text-sm">
                  <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-400">{ts(t.createdAt)}</span>
                      <span className="text-slate-500">
                        {t.fromState ? <><span className="font-medium text-slate-700">{t.fromState}</span> → </> : "Created → "}
                        <span className="font-medium text-teal-700">{t.toState}</span>
                      </span>
                      <span className="text-xs text-slate-400">by {t.triggeredBy}</span>
                    </div>
                    {t.note && <p className="text-slate-500 text-xs mt-0.5 italic">{t.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-400">Click "Load audit trail" to fetch the full state history for this deal.</p>
          )}
        </div>

        {/* Dispute resolution */}
        {deal.state === "disputed" && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-red-900">Resolve Dispute</h2>
            </div>
            <div className="bg-red-100 rounded-lg p-4 mb-5 text-sm text-red-800">
              <strong>Buyer's reason:</strong> {deal.disputeReason}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Internal admin note <span className="text-slate-400 font-normal">(logged in audit trail)</span>
                </label>
                <Input
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Reason for your decision…"
                  className="bg-white"
                />
              </div>
              <div className="flex gap-4">
                <Button
                  onClick={() => handleResolve("refund_buyer")}
                  disabled={resolveDispute.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  Refund Buyer
                </Button>
                <Button
                  onClick={() => handleResolve("release_to_seller")}
                  disabled={resolveDispute.isPending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Release to Seller
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Non-disputed deal with Stripe error — show partial resolution options */}
        {deal.state !== "disputed" && deal.stripeTransferError && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-amber-900">Stripe transfer failed — manual action needed</h3>
            </div>
            <p className="text-sm text-amber-800 mb-4">
              The deal is in <strong>{deal.state}</strong> state but the Stripe transfer errored. Check Stripe dashboard
              for <code className="bg-amber-100 px-1 rounded">{deal.stripePaymentIntentId}</code> and resolve manually,
              then contact <a href="mailto:disputes@safesend.nz" className="underline">disputes@safesend.nz</a>.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
