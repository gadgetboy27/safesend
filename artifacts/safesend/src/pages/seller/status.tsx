import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { useGetSellerStatus, getGetSellerStatusQueryKey } from "@workspace/api-client-react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function SellerStatus() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || "";
  
  const { data: status, isLoading, isError } = useGetSellerStatus(
    { email },
    { query: { enabled: !!email, queryKey: getGetSellerStatusQueryKey({ email }) } }
  );

  if (!email) {
    return (
      <Layout>
        <div className="container max-w-md mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">No email provided</h1>
          <p className="text-slate-600 mb-6">Please return to the onboard page.</p>
          <Link href="/seller/onboard"><Button>Go to Setup</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-md mx-auto px-4 py-20">
        {isLoading ? (
          <div className="text-center text-slate-500">Checking your status...</div>
        ) : isError || !status ? (
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
                <Link href={`/seller/onboard?email=${encodeURIComponent(email)}`}>
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
