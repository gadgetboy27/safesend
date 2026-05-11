import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  useGetPublicTracking,
  getGetPublicTrackingQueryKey,
} from "@workspace/api-client-react";
import { DealStateBadge } from "@/components/deal-state-badge";
import { DealTimeline } from "@/components/deal-timeline";
import { Truck, Package, ShieldCheck, RefreshCw, AlertTriangle, Clock, Link2, Hash } from "lucide-react";
import { formatDistanceToNow, format, addHours, differenceInHours } from "date-fns";

const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function getStatusBanner(currentStatus: string | null): string {
  if (!currentStatus) return "Awaiting first courier scan";
  const s = currentStatus.toLowerCase();
  if (s === "delivered") return "Delivered";
  if (s === "outfordelivery" || s === "out_for_delivery" || s.includes("out for delivery")) return "Out for delivery";
  if (s === "intransit" || s === "in_transit" || s.includes("in transit")) return "In transit";
  if (s === "pickup" || s === "picked_up" || s.includes("pick")) return "Picked up";
  return currentStatus;
}

function AutoReleaseCountdown({ deliveredAt }: { deliveredAt: Date }) {
  const releaseAt = addHours(deliveredAt, 48);
  const [hoursLeft, setHoursLeft] = useState(differenceInHours(releaseAt, new Date()));

  useEffect(() => {
    const id = setInterval(() => setHoursLeft(differenceInHours(releaseAt, new Date())), 60_000);
    return () => clearInterval(id);
  }, [releaseAt]);

  if (hoursLeft <= 0) return <span className="text-teal-700 font-medium">Funds releasing now</span>;
  return (
    <span className="text-slate-700">
      Funds releasing automatically in <strong>{hoursLeft}h</strong>
    </span>
  );
}

export default function PublicTracking() {
  const [, params] = useRoute("/track/:dealId");
  const dealId = params?.dealId || "";

  const queryClient = useQueryClient();

  const { data: tracking, isLoading, refetch } = useGetPublicTracking(dealId, {
    query: {
      enabled: !!dealId,
      queryKey: getGetPublicTrackingQueryKey(dealId),
      refetchInterval: 5 * 60 * 1000,
      refetchIntervalInBackground: false,
    },
  });

  async function handleRefresh() {
    await refetch();
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="p-12 text-center text-slate-500">Loading tracking info...</div>
      </Layout>
    );
  }

  if (!tracking) {
    return (
      <Layout>
        <div className="p-12 text-center text-red-500">Deal not found or invalid link.</div>
      </Layout>
    );
  }

  const isFlagged = tracking.shipmentVerificationStatus === "flagged";
  const statusBanner = getStatusBanner(tracking.currentStatus ?? null);

  return (
    <Layout>
      <div className="container max-w-2xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-teal-700" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">SafeSend Tracking</h1>
          <p className="text-slate-600">Live courier updates for your secure transaction.</p>
        </div>

        {/* Deal summary card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900 truncate">{tracking.title}</h2>
              {tracking.referenceNumber && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Ref: {tracking.referenceNumber}
                </p>
              )}
            </div>
            <DealStateBadge state={tracking.state} />
          </div>
          <div className="p-6">
            <DealTimeline state={tracking.state} />
          </div>
          {tracking.itemUrl && (
            <div className="px-6 pb-5 flex items-start gap-2">
              <Link2 className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 mb-0.5">Original listing</p>
                <a
                  href={tracking.itemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-700 underline underline-offset-2 break-all hover:text-teal-900"
                >
                  {tracking.itemUrl}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Flagged warning */}
        {tracking.state === "shipped" && isFlagged && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800 mb-1">Shipment not yet scanned</p>
                <p className="text-sm text-amber-700 mb-3">
                  The courier has not scanned this parcel within 48 hours of it being marked as shipped.
                  If you believe the parcel was never collected, sign in to your account to cancel and receive a full refund.
                </p>
                <a
                  href={`${baseUrl}/login?next=/deals/${tracking.id}`}
                  className="inline-block bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Sign in to cancel
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Awaiting shipment */}
        {tracking.state === "funded" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 text-center text-slate-600">
            <Package className="h-6 w-6 mx-auto mb-2 text-slate-400" />
            Awaiting seller to mark as shipped
          </div>
        )}

        {/* Auto-release countdown */}
        {tracking.state === "delivered" && tracking.deliveredAt && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Clock className="h-5 w-5 text-teal-600 shrink-0" />
            <AutoReleaseCountdown deliveredAt={new Date(tracking.deliveredAt)} />
          </div>
        )}

        {/* Live tracking section */}
        {tracking.trackingNumber && (tracking.state === "shipped" || tracking.state === "delivered") && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Live courier updates</h2>
              </div>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                title="Refresh now"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {tracking.currentStatus && (
              <div className="mb-5 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                <p className="text-sm font-semibold text-blue-800">{statusBanner}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div>
                <p className="text-sm text-slate-500 mb-1">Courier</p>
                <p className="font-medium text-slate-900 uppercase">
                  {tracking.courierSlug?.replace(/-/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Tracking ID</p>
                <p className="font-medium font-mono text-slate-900">{tracking.trackingNumber}</p>
              </div>
            </div>

            {tracking.signatureRequired !== undefined && (
              <div className={`mb-6 flex items-start gap-2 rounded-lg px-4 py-3 text-sm border ${tracking.signatureRequired ? "bg-green-50 border-green-100 text-green-800" : "bg-amber-50 border-amber-100 text-amber-800"}`}>
                <span className="mt-0.5">{tracking.signatureRequired ? "✓" : "⚠"}</span>
                <span>
                  {tracking.signatureRequired
                    ? "Signature required at delivery"
                    : "Signature waived — the seller chose a no-signature service. Funds release on courier-confirmed delivery without a signature."}
                </span>
              </div>
            )}

            {tracking.events && tracking.events.length > 0 ? (
              <div className="relative pl-6 border-l-2 border-slate-100 space-y-6">
                {tracking.events.map((event, idx) => (
                  <div key={idx} className="relative">
                    <div
                      className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-4 border-white shadow-sm ${
                        idx === 0 ? "bg-blue-500" : "bg-slate-300"
                      }`}
                    />
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900">{event.message}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          event.status?.toLowerCase() === "delivered"
                            ? "bg-teal-100 text-teal-700"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      {" · "}
                      {format(new Date(event.timestamp), "MMM d, yyyy · h:mm a")}
                      {event.location && ` · ${event.location}`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-6 text-sm">
                Waiting for courier scans — updates appear here automatically.
              </p>
            )}
          </div>
        )}

        <div className="mt-8 text-center flex items-center justify-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Secured by SafeSend Escrow</span>
        </div>
      </div>
    </Layout>
  );
}
