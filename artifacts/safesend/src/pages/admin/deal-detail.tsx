import { useState } from "react";
import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { useGetDeal, getGetDealQueryKey, useResolveDispute } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { DealStateBadge } from "@/components/deal-state-badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminDealDetail() {
  const [, params] = useRoute("/admin/deals/:id");
  const dealId = params?.id || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  const { data: deal, isLoading } = useGetDeal(dealId, {
    query: { enabled: isAuthenticated && !!dealId, queryKey: getGetDealQueryKey(dealId) }
  });

  const resolveDispute = useResolveDispute();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminKey === "admin123") setIsAuthenticated(true);
    else alert("Invalid admin key");
  };

  const handleResolve = (resolution: "refund_buyer" | "release_to_seller") => {
    if (!confirm(`Are you sure you want to ${resolution.replace("_", " ")}? This is final.`)) return;
    
    resolveDispute.mutate({ dealId, data: { resolution, adminNote } }, {
      onSuccess: () => {
        toast({ title: "Dispute Resolved", description: `Resolution: ${resolution.replace("_", " ")}` });
        queryClient.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
            <h1 className="text-2xl font-bold mb-6">Admin Access</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input type="password" placeholder="Enter admin key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required />
              <Button type="submit" className="w-full bg-slate-900 text-white">Login</Button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  if (isLoading || !deal) return <Layout><div className="p-12 text-center">Loading deal...</div></Layout>;

  return (
    <Layout>
      <div className="container max-w-3xl mx-auto px-4 py-12">
        <Link href="/admin">
          <Button variant="ghost" className="mb-6 -ml-4 text-slate-500"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Button>
        </Link>
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{deal.title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {deal.invoiceNumber && (
                <span className="font-mono text-sm font-bold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                  {deal.invoiceNumber}
                </span>
              )}
              <p className="text-slate-400 font-mono text-xs">{deal.id}</p>
            </div>
          </div>
          <DealStateBadge state={deal.state} />
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4 border-b pb-2">Financials</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span>${deal.amountNzd.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Fee</span><span>${deal.feeNzd.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold pt-2 border-t"><span className="text-slate-900">Total</span><span>${deal.totalNzd.toFixed(2)}</span></div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4 border-b pb-2">Parties</h3>
            <div className="space-y-4 text-sm">
              <div><p className="text-slate-500">Buyer</p><p className="font-medium">{deal.buyerEmail}</p></div>
              <div><p className="text-slate-500">Seller</p><p className="font-medium">{deal.sellerEmail}</p></div>
            </div>
          </div>
        </div>

        {deal.state === "disputed" && (
          <div className="bg-red-50 p-6 rounded-xl border border-red-200">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-red-900">Dispute Resolution</h2>
            </div>
            <p className="text-red-800 mb-6 bg-red-100 p-4 rounded-lg"><strong>Reason provided:</strong> {deal.disputeReason}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Admin Internal Note</label>
                <Input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Reason for resolution decision..." className="bg-white" />
              </div>
              <div className="flex gap-4 pt-4">
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
      </div>
    </Layout>
  );
}
