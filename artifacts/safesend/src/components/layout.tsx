import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetMe, useLogout, useRequestLoginLink, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AuthContext } from "@/lib/auth-context";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }): void;
          prompt(): void;
          cancel(): void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

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

  // Keep a stable ref to the google auth handler so the One Tap callback
  // never goes stale without needing to re-initialise the library.
  const googleHandlerRef = useRef<((credential: string) => void) | null>(null);

  const googleAuth = useMutation({
    mutationFn: async (credential: string) => {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Google sign-in failed");
      return data;
    },
    onSuccess: async () => {
      setSignInOpen(false);
      await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
    },
    onError: (err: unknown) => {
      toast({
        title: "Google sign-in failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  // Always keep the ref current so One Tap can call it even after re-renders.
  googleHandlerRef.current = (credential: string) => googleAuth.mutate(credential);

  // Initialise Google Identity Services once, and show One Tap when
  // the user is not authenticated (fires automatically if they have a
  // Google session — one-click sign-in, no form needed).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || isAuthenticated) return;

    const init = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => googleHandlerRef.current?.(response.credential),
        auto_select: true,
        cancel_on_tap_outside: true,
      });
      window.google?.accounts.id.prompt();
    };

    if (window.google?.accounts) {
      init();
    } else {
      // Script loads async — wait for it
      const script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener("load", init, { once: true });
        return () => script.removeEventListener("load", init);
      }
    }

    return () => { window.google?.accounts.id.cancel(); };
  }, [isAuthenticated]);

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

  function handleGoogleButton() {
    if (!GOOGLE_CLIENT_ID) return;
    window.google?.accounts.id.prompt();
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
                : "Choose how you'd like to sign in."}
            </DialogDescription>
          </DialogHeader>
          {!sent ? (
            <div className="space-y-4 mt-1">
              {GOOGLE_CLIENT_ID && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center gap-3 border-slate-300 hover:bg-slate-50 font-medium"
                    onClick={handleGoogleButton}
                    disabled={googleAuth.isPending}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {googleAuth.isPending ? "Signing in…" : "Continue with Google"}
                  </Button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400 font-medium">or use email</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                </>
              )}
              <form onSubmit={handleSignInSubmit} className="space-y-3">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={!GOOGLE_CLIENT_ID}
                />
                <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={requestLink.isPending}>
                  {requestLink.isPending ? "Sending…" : "Send sign-in link"}
                </Button>
              </form>
            </div>
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
