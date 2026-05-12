import { Layout } from "@/components/layout";
import { useGetSellerStatus, getGetSellerStatusQueryKey, useGetMe } from "@workspace/api-client-react";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function SellerStatus() {
  // Prefer session email; fall back to ?email= param (for Stripe return_url redirect)
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false, queryKey: ["getMe"] } });
  const urlEmail = new URLSearchParams(window.location.search).get("email") || "";
  const email = me?.email || urlEmail;

  const { data: status, isLoading: statusLoading, isError } = useGetSellerStatus(
    { email },
    { query: { enabled: !!email, queryKey: getGetSellerStatusQueryKey({ email }) } }
  );

  const isLoading = meLoading || (!!email && statusLoading);

  if (isLoading) {
    return (
      <Layout>
        <div className="container max-w-md mx-auto px-4 py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </Layout>
    );
  }

  if (!email) {
    return (
      <Layout>
        <div className="container max-w-md mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-slate-600 mb-6">Please sign in to view your seller status.</p>
          <Link href="/login?next=/seller/status"><Button>Sign in</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-md mx-auto px-4 py-20">
        {isError || !status ? (
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Error loading status</h1>
            <p className="text-slate-600 mb-6">Could not fetch your seller account status.</p>
            <Link href="/seller/onboard"><Button variant="outline">Try again</Button></Link>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
            {status.chargesEnabled && status.payoutsEnabled ? (
              <>
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">You're All Set!</h1>
                <p className="text-slate-600 mb-8">
                  Your seller account is verified. You can now receive payments directly to your bank account.
                </p>
                <Link href="/deals/new">
                  <Button className="w-full bg-teal-700 hover:bg-teal-800 text-white">Create a Deal</Button>
                </Link>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8 text-amber-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Setup Incomplete</h1>
                <p className="text-slate-600 mb-8">
                  Your Stripe profile requires more information before you can receive payouts.
                </p>
                <Link href="/seller/onboard">
                  <Button className="w-full bg-slate-900 text-white hover:bg-slate-800">Continue Setup</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
