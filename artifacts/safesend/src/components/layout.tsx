import { Link, useLocation } from "wouter";
import { ShieldCheck, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const isAdmin = location.startsWith("/admin");
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();
  const isAuthenticated = me !== undefined;

  const { mutate: logout } = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        navigate("/login");
      },
    },
  });

  return (
    <div className="min-h-[100dvh] flex flex-col">
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
                  <Link href={`/login?next=${encodeURIComponent(location)}`}>
                    <Button variant="default" size="sm" className="bg-teal-700 hover:bg-teal-800 text-white">
                      Sign In
                    </Button>
                  </Link>
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
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} SafeSend · sendsafe.co.nz · All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
