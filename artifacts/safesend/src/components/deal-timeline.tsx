import { DealState } from "@workspace/api-client-react";
import { CheckCircle2, Circle, AlertTriangle, XCircle, RotateCcw, Clock } from "lucide-react";

const MAIN_STEPS = [
  { id: "created", label: "Created" },
  { id: "funded", label: "Funded" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "complete", label: "Complete" },
];

const TERMINAL_CONFIG: Record<string, { label: string; description: string; colorClass: string; Icon: React.ElementType }> = {
  pending_seller_acceptance: {
    label: "Awaiting Seller Acceptance",
    description: "The seller has been notified and must accept the deal terms before the buyer can pay.",
    colorClass: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: Clock,
  },
  pending_buyer_confirmation: {
    label: "Awaiting Buyer Confirmation",
    description: "A link has been sent to the buyer. They must sign in and confirm the deal terms before payment is unlocked.",
    colorClass: "border-amber-200 bg-amber-50 text-amber-800",
    Icon: Clock,
  },
  disputed: {
    label: "Disputed",
    description: "Funds are frozen while an admin reviews this case. You'll be contacted by email.",
    colorClass: "border-red-200 bg-red-50 text-red-800",
    Icon: AlertTriangle,
  },
  cancelled: {
    label: "Cancelled",
    description: "This deal was cancelled. No funds were charged.",
    colorClass: "border-slate-200 bg-slate-50 text-slate-600",
    Icon: XCircle,
  },
  refunded: {
    label: "Refunded",
    description: "This deal was resolved and the buyer has been refunded.",
    colorClass: "border-blue-200 bg-blue-50 text-blue-800",
    Icon: RotateCcw,
  },
};

export function DealTimeline({ state }: { state: DealState | string }) {
  const terminal = TERMINAL_CONFIG[state];

  if (terminal) {
    const { label, description, colorClass, Icon } = terminal;
    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between w-full relative opacity-40 pointer-events-none select-none">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -z-10 hidden md:block transform -translate-y-1/2" />
          {MAIN_STEPS.map((step) => (
            <div key={step.id} className="flex md:flex-col items-center mb-4 md:mb-0 gap-3 md:gap-2 bg-card">
              <Circle className="w-6 h-6 text-slate-300" />
              <span className="text-sm font-medium text-slate-400">{step.label}</span>
            </div>
          ))}
        </div>
        <div className={`flex items-start gap-3 rounded-lg px-4 py-3 border ${colorClass}`}>
          <Icon className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">{label}</p>
            <p className="text-sm mt-0.5 opacity-80">{description}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = MAIN_STEPS.findIndex((step) => step.id === state);

  return (
    <div className="flex flex-col md:flex-row justify-between w-full relative">
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -z-10 hidden md:block transform -translate-y-1/2" />
      {MAIN_STEPS.map((step, index) => {
        const isPast = currentIndex > index;
        const isCurrent = currentIndex === index;
        return (
          <div key={step.id} className="flex md:flex-col items-center mb-4 md:mb-0 gap-3 md:gap-2 bg-card">
            {isPast ? (
              <CheckCircle2 className="w-6 h-6 text-teal-600 fill-teal-100" />
            ) : isCurrent ? (
              <div className="w-6 h-6 rounded-full border-2 border-teal-600 flex items-center justify-center bg-white">
                <div className="w-2 h-2 rounded-full bg-teal-600" />
              </div>
            ) : (
              <Circle className="w-6 h-6 text-slate-300" />
            )}
            <span className={`text-sm font-medium ${isPast || isCurrent ? "text-slate-900" : "text-slate-400"}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
