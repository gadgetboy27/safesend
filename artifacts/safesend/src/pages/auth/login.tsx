import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRequestLoginLink } from "@workspace/api-client-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") ?? "/deals";

  const requestLink = useRequestLoginLink({
    mutation: {
      onSuccess: (data) => {
        setSent(true);
        if (data.devLink) setDevLink(data.devLink);
      },
      onError: (err: unknown) => {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Something went wrong",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestLink.mutate({ data: { email, returnPath: next } });
  };

  return (
    <Layout>
      <div className="container max-w-md mx-auto px-4 py-20">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          {sent ? (
            <>
              <h2 className="text-2xl font-bold mb-2 text-slate-900">Check your email</h2>
              <p className="text-slate-600 mb-6">
                We sent a sign-in link to <strong>{email}</strong>. It expires in 30 minutes.
              </p>

              {devLink && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Dev mode — no email service configured
                  </p>
                  <p className="text-xs text-amber-600 mb-3">
                    Click the link below to sign in (this only appears in development):
                  </p>
                  <a
                    href={devLink}
                    className="block text-xs text-teal-700 underline break-all hover:text-teal-900"
                  >
                    {devLink}
                  </a>
                </div>
              )}

              <p className="text-sm text-slate-400">
                Didn't receive it?{" "}
                <button
                  className="text-teal-700 underline"
                  onClick={() => { setSent(false); setDevLink(null); }}
                >
                  Try again
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-2 text-slate-900">Sign in to SafeSend</h2>
              <p className="text-slate-600 mb-6">
                Enter your email and we'll send you a one-click sign-in link. No password needed.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <Button
                  type="submit"
                  className="w-full bg-teal-700 hover:bg-teal-800"
                  disabled={requestLink.isPending}
                >
                  {requestLink.isPending ? "Sending…" : "Send sign-in link"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
