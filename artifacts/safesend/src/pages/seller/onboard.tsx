import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useOnboardSeller, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Banknote, LogIn, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function SellerOnboard() {
  const [, navigate] = useLocation();
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false, queryKey: ["getMe"] } });
  const onboard = useOnboardSeller();
  const { toast } = useToast();

  if (meLoading) {
    return (
      <Layout>
        <div className="container max-w-lg mx-auto px-4 py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </Layout>
    );
  }

  if (!me?.email) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20 text-center">
          <LogIn className="w-12 h-12 text-teal-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign in first</h1>
          <p className="text-slate-600 mb-6">
            You need to be signed in to set up your seller account.
          </p>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={() => navigate("/login?next=/seller/onboard")}
          >
            Sign in
          </Button>
        </div>
      </Layout>
    );
  }

  const handleSetup = () => {
    const returnUrl = `${window.location.origin}/seller/status`;
    const refreshUrl = `${window.location.origin}/seller/onboard`;
    onboard.mutate(
      { data: { email: me.email, returnUrl, refreshUrl } },
      {
        onSuccess: (res) => {
          window.location.href = res.url;
        },
        onError: (err: any) => {
          toast({ title: "Setup Failed", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Layout>
      <div className="container max-w-lg mx-auto px-4 py-20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Banknote className="h-8 w-8 text-teal-700" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Seller Setup</h1>
          <p className="text-slate-600">
            We partner with Stripe to securely route funds directly to your New Zealand bank account.
          </p>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            Setting up as <span className="font-medium text-slate-900">{me.email}</span>
          </div>

          <Button
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={handleSetup}
            disabled={onboard.isPending}
          >
            {onboard.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing setup…</>
            ) : (
              "Continue to Stripe"
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2 border-t">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified identity helps build trust with buyers.</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
