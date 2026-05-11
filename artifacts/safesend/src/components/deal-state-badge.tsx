import { DealState } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export function DealStateBadge({ state }: { state: DealState | string }) {
  let colorClass = "";
  
  switch (state) {
    case DealState.created:
      colorClass = "bg-slate-200 text-slate-800 hover:bg-slate-300";
      break;
    case DealState.funded:
      colorClass = "bg-teal-100 text-teal-800 hover:bg-teal-200";
      break;
    case DealState.shipped:
      colorClass = "bg-blue-100 text-blue-800 hover:bg-blue-200";
      break;
    case DealState.delivered:
      colorClass = "bg-indigo-100 text-indigo-800 hover:bg-indigo-200";
      break;
    case DealState.complete:
      colorClass = "bg-emerald-100 text-emerald-800 hover:bg-emerald-200";
      break;
    case DealState.disputed:
      colorClass = "bg-red-100 text-red-800 hover:bg-red-200";
      break;
    case DealState.pending_seller_acceptance:
    case DealState.pending_buyer_confirmation:
      colorClass = "bg-amber-100 text-amber-800 hover:bg-amber-200";
      break;
    case DealState.cancelled:
    case DealState.refunded:
      colorClass = "bg-gray-100 text-gray-800 hover:bg-gray-200";
      break;
    default:
      colorClass = "bg-slate-100 text-slate-800 hover:bg-slate-200";
  }

  return (
    <Badge className={`border-none ${colorClass}`}>
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </Badge>
  );
}
