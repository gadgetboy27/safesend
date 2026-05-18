import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetMe, useLogout, useRequestLoginLink, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AuthContext } from "@/lib/auth-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const isAdmin = location.startsWith("/admin");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [signInOpen, setSignInOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const isAuthenticated = me !== undefined;

  const { mutate: logout } = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        navigate("/");
      },
    },
  });

  const requestLink = useRequestLoginLink({
    mutation: {
      onSuccess: () => setSent(true),
      onError: (err: unknown) => {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Something went wrong",
          variant: "destructive",
        });
      },
    },
  });

  function openSignIn() {
    setEmail("");
    setSent(false);
    setSignInOpen(true);
  }

  function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestLink.mutate({ data: { email, returnPath: location } });
  }

  return (
    <AuthContext.Provider value={{ openSignIn }}>
    <div className="min-h-[100dvh] flex flex-col">
      <Dialog open={signInOpen} onOpenChange={(open) => { setSignInOpen(open); if (!open) setSent(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{sent ? "Check your email" : "Sign in to SafeSend"}</DialogTitle>
            <DialogDescription>
              {sent
                ? `We sent a sign-in link to ${email}. Click it to continue — it expires in 30 minutes.`
                : "Enter your email and we'll send you a one-click sign-in link. No password needed."}
            </DialogDescription>
          </DialogHeader>
          {!sent ? (
            <form onSubmit={handleSignInSubmit} className="space-y-3 mt-1">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={requestLink.isPending}>
                {requestLink.isPending ? "Sending…" : "Send sign-in link"}
              </Button>
            </form>
          ) : (
            <div className="mt-1 text-center">
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">
                Didn't receive it?{" "}
                <button className="text-teal-700 underline" onClick={() => setSent(false)}>Try again</button>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <header className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-teal-700" />
            <span className="text-xl font-semibold tracking-tight text-slate-900">SafeSend</span>
          </Link>

          <nav className="flex items-center gap-4">
            {!isAdmin ? (
              <>
                <Link href="/how-it-works">
                  <Button variant="ghost" className="hidden sm:inline-flex text-slate-600">How It Works</Button>
                </Link>
                {isAuthenticated && (
                  <>
                    <Link href="/deals/new">
                      <Button variant="ghost" className="hidden sm:inline-flex text-slate-600">Create Deal</Button>
                    </Link>
                    <Link href="/deals">
                      <Button variant="ghost" className="hidden sm:inline-flex text-slate-600">My Deals</Button>
                    </Link>
                    <Link href="/seller/onboard">
                      <Button variant="outline" className="hidden md:inline-flex text-slate-700">Seller Setup</Button>
                    </Link>
                  </>
                )}
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden lg:flex items-center gap-1.5 text-sm text-slate-500">
                      <User className="h-3.5 w-3.5" />
                      {me?.email}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600 gap-1.5"
                      onClick={() => logout()}
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="hidden sm:inline">Sign Out</span>
                    </Button>
                  </div>
                ) : (
                  <Button variant="default" size="sm" className="bg-teal-700 hover:bg-teal-800 text-white" onClick={openSignIn}>
                    Sign In
                  </Button>
                )}
              </>
            ) : (
              <Link href="/admin">
                <Button variant="ghost" className="text-slate-600">Admin Dashboard</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>
      
      <main className="flex-1 bg-slate-50">
        {children}
      </main>
      
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-600" />
            <span className="font-semibold text-slate-200">SafeSend</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/terms" className="hover:text-slate-200 transition-colors">Terms of Service</Link>
            <Link href="/escrow-agreement" className="hover:text-slate-200 transition-colors">Escrow Agreement</Link>
            <Link href="/privacy" className="hover:text-slate-200 transition-colors">Privacy</Link>
            <a href="mailto:disputes@safesend.nz" className="hover:text-slate-200 transition-colors">Contact / Disputes</a>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} SafeSend · safesend.nz · All rights reserved.</p>
        </div>
      </footer>
    </div>
    </AuthContext.Provider>
  );
}
