import { Link, useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");

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
