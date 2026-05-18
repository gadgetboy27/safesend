import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useVerifyLoginLink, getGetMeQueryKey, listDeals, DealState } from "@workspace/api-client-react";

const DEAL_URL_RE = /^\/deals\/[^/]+$/;

const URGENT_STATES = new Set<string>([
  DealState.pending_buyer_confirmation,
  DealState.pending_seller_acceptance,
  DealState.created,
  DealState.delivered,
]);

export default function AuthVerify() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const verify = useVerifyLoginLink({
    mutation: {
      onSuccess: async () => {
        setStatus("success");

        // Await the me refetch so the cache is fresh before we navigate.
        // Using invalidateQueries alone leaves the old 401 error in cache,
        // which causes a sign-in prompt flash on the destination page.
        await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });

        const rawNext = new URLSearchParams(window.location.search).get("next") ?? "/deals";
        const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/deals";

        // Already heading to a specific deal — go straight there.
        if (DEAL_URL_RE.test(next)) {
          setTimeout(() => setLocation(next), 500);
          return;
        }

        // For any other redirect target (home page, /deals list, /deals/new, etc.)
        // find the most urgent pending deal and take the user directly to it.
        try {
          const deals = await listDeals();
          const urgent = deals.find(d => URGENT_STATES.has(d.state));
          setTimeout(() => setLocation(urgent ? `/deals/${urgent.id}` : "/deals"), 500);
        } catch {
          setTimeout(() => setLocation("/deals"), 500);
        }
      },
      onError: (err: unknown) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      },
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");

    if (!t) {
      setStatus("error");
      setErrorMsg("No token provided in link.");
      return;
    }

    setToken(t);
    verify.mutate({ data: { token: t } });
  }, []);

  return (
    <Layout>
      <div className="container max-w-md mx-auto px-4 py-20 text-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          {status === "verifying" && (
            <>
              <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-600">Verifying your link…</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Signed in!</h2>
              <p className="text-slate-600">Redirecting you now…</p>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Link invalid</h2>
              <p className="text-slate-500 mb-6">{errorMsg}</p>
              {token && (
                <button
                  onClick={() => {
                    setStatus("verifying");
                    setErrorMsg("");
                    verify.mutate({ data: { token } });
                  }}
                  className="block w-full mb-3 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  Try again
                </button>
              )}
              <a href="/login" className="text-teal-700 underline text-sm">Request a new link</a>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
