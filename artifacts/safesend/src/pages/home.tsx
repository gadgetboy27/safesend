import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, CreditCard, PackageCheck, ShieldCheck, Star, Zap, Globe, Lock, BadgeCheck } from "lucide-react";
import { Layout } from "@/components/layout";

const SCENARIOS = [
  {
    platform: "Facebook Marketplace",
    icon: "📘",
    buyer: "You've found a vintage Les Paul for $800. The seller is 150km away.",
    problem: "They won't post without payment. You won't pay before you see it shipped.",
    solution: "SafeSend escrow — seller gets paid when you confirm delivery.",
    photo: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=600&q=75",
    photoAlt: "Electric guitar",
  },
  {
    platform: "Instagram DMs",
    icon: "📸",
    buyer: "A NZ sneaker reseller has a grail pair. Payment by bank transfer only.",
    problem: "Bank transfers are irreversible. One wrong move and the money is gone.",
    solution: "SafeSend holds funds until the courier delivers to your door.",
    photo: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=75",
    photoAlt: "Sneakers",
  },
  {
    platform: "Community groups",
    icon: "🏘️",
    buyer: "Buying a dining table from someone across the city via a local Facebook group.",
    problem: "You've never met. They want payment upfront. You'd rather not.",
    solution: "Both parties agree to escrow. Everyone sleeps easy.",
    photo: "https://images.unsplash.com/photo-1555041469-149851ea61f6?auto=format&fit=crop&w=600&q=75",
    photoAlt: "Furniture",
  },
];

const ITEM_PHOTOS = [
  { src: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=300&q=70", alt: "Camera" },
  { src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=300&q=70", alt: "Bicycle" },
  { src: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=300&q=70", alt: "Laptop" },
  { src: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=300&q=70", alt: "Watch" },
  { src: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=300&q=70", alt: "Gaming" },
  { src: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=300&q=70", alt: "Camera polaroid" },
];

export default function Home() {
  return (
    <Layout>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-slate-900 text-white">
        <div
          className="absolute inset-0 opacity-30"
          style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 30% -10%, #0d9488, transparent)" }}
        />
        <div className="relative container mx-auto px-4 max-w-6xl py-20 md:py-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* Left — copy */}
            <div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                Buy from anyone.
                <br />
                <span className="text-teal-400">Trust the process.</span>
              </h1>

              <p className="text-lg md:text-xl text-slate-300 mb-4 leading-relaxed max-w-lg">
                Safe, secure and sent. Funds held securely until both parties are satisfied — then released automatically.
              </p>
              <p className="text-sm text-slate-500 mb-10 max-w-md">
                No trust required between parties. That's SafeSend™.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/deals/new">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto text-base bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold h-13 px-8 shadow-lg shadow-teal-900/30"
                  >
                    Start a Deal
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/seller/onboard">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto text-base h-13 px-8 border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
                  >
                    Set Up as a Seller
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right — deal card mockup with photo */}
            <div className="hidden md:block">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-slate-700/50">
                <img
                  src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80"
                  alt="Secure marketplace transaction"
                  className="w-full h-80 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

                {/* Floating deal card */}
                <div className="absolute bottom-5 left-5 right-5">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                        <ShieldCheck className="h-4 w-4 text-teal-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold leading-none">Deal protected</p>
                        <p className="text-slate-400 text-xs mt-0.5">Safe, secure and sent</p>
                      </div>
                      <span className="ml-auto text-xs bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-1 rounded-full font-medium">
                        Secured ✓
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { v: "4%", l: "Fee" },
                        { v: "$2,500", l: "Max deal" },
                        { v: "48h", l: "Auto-release" },
                      ].map((s) => (
                        <div key={s.l} className="bg-white/5 rounded-lg py-2">
                          <p className="text-teal-400 font-bold text-sm">{s.v}</p>
                          <p className="text-slate-400 text-xs">{s.l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Trust bar ── */}
      <section className="bg-white border-b border-slate-100 shadow-sm">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
            {[
              { value: "4%", label: "Flat buyer fee, $5 min", sub: "No hidden charges" },
              { value: "$2,500", label: "Per-deal cap (NZD)", sub: "Larger deals → Escrow.com" },
              { value: "48h", label: "Auto-release window", sub: "After courier confirms delivery" },
              { value: "100%", label: "Stripe-secured", sub: "Card details never touch us" },
            ].map((s) => (
              <div key={s.label} className="py-8 px-6 text-center">
                <p className="text-3xl font-extrabold text-teal-700 mb-1">{s.value}</p>
                <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 bg-slate-50 border-b border-slate-200">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 text-center mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-4">
            Three steps between strangers and a safe deal
          </h2>
          <p className="text-slate-500 text-center max-w-xl mx-auto mb-16 text-lg">
            No app to install. Buyers verify by email link — no passwords, no registration forms.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: <Shield className="h-7 w-7 text-teal-700" />,
                bg: "bg-teal-50",
                title: "Agree on the deal",
                body: "Either party creates a deal with item details, price, and both email addresses. A unique link is shared.",
              },
              {
                step: "02",
                icon: <CreditCard className="h-7 w-7 text-amber-600" />,
                bg: "bg-amber-50",
                title: "Buyer pays into escrow",
                body: "Funds are held securely by Stripe — the world's most trusted payment infrastructure. The seller can't touch them yet.",
              },
              {
                step: "03",
                icon: <PackageCheck className="h-7 w-7 text-blue-600" />,
                bg: "bg-blue-50",
                title: "Deliver, confirm, done",
                body: "Seller ships with tracking. Buyer confirms delivery. Funds release instantly. If something goes wrong, we mediate.",
              },
            ].map((s) => (
              <div key={s.step} className="relative bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow">
                <span className="absolute top-6 right-6 text-4xl font-black text-slate-100 select-none">
                  {s.step}
                </span>
                <div className={`w-14 h-14 rounded-2xl ${s.bg} flex items-center justify-center mb-6 shadow-sm`}>
                  {s.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Real scenarios with photos ── */}
      <section className="py-24 bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 text-center mb-3">
            Real scenarios
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-4">
            Where SafeSend saves the deal
          </h2>
          <p className="text-slate-500 text-center max-w-xl mx-auto mb-16 text-lg">
            Wherever you shop, whoever you're buying from.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {SCENARIOS.map((s) => (
              <div key={s.platform} className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Photo header */}
                <div className="relative h-44 bg-slate-200 overflow-hidden">
                  <img
                    src={s.photo}
                    alt={s.photoAlt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-2">
                    <span className="text-xl">{s.icon}</span>
                    <span className="font-semibold text-white text-sm">{s.platform}</span>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-700 leading-relaxed">{s.buyer}</p>
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <span className="text-red-500 text-sm mt-0.5 shrink-0">✕</span>
                    <p className="text-sm text-red-700">{s.problem}</p>
                  </div>
                  <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5">
                    <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-teal-800 font-medium">{s.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Item photo grid ── */}
      <section className="py-20 bg-slate-900 border-b border-slate-800">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400 text-center mb-3">
            What people trade on SafeSend
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-center text-white mb-12">
            If it ships, it's safe with us
          </h2>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {ITEM_PHOTOS.map((p) => (
              <div key={p.alt} className="aspect-square rounded-xl overflow-hidden bg-slate-800 group">
                <img
                  src={p.src}
                  alt={p.alt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                  loading="lazy"
                />
              </div>
            ))}
          </div>

          <p className="text-center text-slate-500 text-sm mt-8">
            Guitars, bikes, cameras, electronics, watches, furniture, sneakers, gym gear, tools, consoles — and anything else that ships.
          </p>
        </div>
      </section>

      {/* ── Why SafeSend ── */}
      <section className="py-24 bg-slate-50 border-b border-slate-200">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 text-center mb-3">
            Why us
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-16">
            Built for NZ. Trusted by strangers.
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Lock className="h-6 w-6 text-teal-700" />,
                bg: "bg-teal-50",
                title: "Trustless by design",
                body: "Neither party needs to trust the other. The escrow contract does the trusting for you.",
              },
              {
                icon: <Zap className="h-6 w-6 text-amber-600" />,
                bg: "bg-amber-50",
                title: "Instant release",
                body: "Confirm delivery and funds clear to the seller in minutes — no waiting, no delays.",
              },
              {
                icon: <Star className="h-6 w-6 text-blue-600" />,
                bg: "bg-blue-50",
                title: "Full dispute cover",
                body: "Item not as described? Our team reviews evidence from both sides and makes a binding call.",
              },
              {
                icon: <Globe className="h-6 w-6 text-violet-600" />,
                bg: "bg-violet-50",
                title: "NZ-native",
                body: "NZD only, NZ courier integrations, NZ business hours support. Built here, for here.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust badges ── */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              {
                icon: <ShieldCheck className="h-8 w-8 text-teal-600 mx-auto mb-3" />,
                title: "Stripe-secured payments",
                body: "Card details are handled by Stripe — the same infrastructure used by Amazon, Shopify, and thousands of NZ businesses. We never see your full card number.",
              },
              {
                icon: <BadgeCheck className="h-8 w-8 text-blue-600 mx-auto mb-3" />,
                title: "Phone-verified buyers",
                body: "Every buyer verifies their mobile number via one-time code before paying — proving a real, traceable identity. Required under NZ's AML/CFT Act.",
              },
              {
                icon: <Lock className="h-8 w-8 text-violet-600 mx-auto mb-3" />,
                title: "Funds never touch us",
                body: "Escrow is held by Stripe Connect on Stripe's balance sheet — not ours. SafeSend is a facilitator, not a bank.",
              },
            ].map((t) => (
              <div key={t.title} className="px-4">
                {t.icon}
                <h3 className="font-bold text-slate-900 mb-2 text-base">{t.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden bg-slate-900 text-white py-28 px-4">
        <div
          className="absolute inset-0 opacity-25"
          style={{ backgroundImage: "radial-gradient(ellipse 60% 80% at 100% 100%, #0d9488, transparent)" }}
        />
        <div className="relative container mx-auto max-w-3xl text-center">
          <p className="text-teal-400 font-semibold text-sm uppercase tracking-widest mb-4">
            Ready to buy or sell safely?
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 leading-tight">
            If it can be Delivered,
            <br />
            <span className="text-teal-400">You Can Use SafeSend.</span>
          </h2>
          <p className="text-slate-400 text-lg mb-6 max-w-xl mx-auto">
            Start a deal in under two minutes. Verify by email link — no passwords, no registration forms.
          </p>
          <p className="text-slate-600 text-xs mb-10 max-w-lg mx-auto leading-relaxed">
            SafeSend operates under New Zealand's AML/CFT Act 2009. A verified mobile number is required from buyers before payment.
            Deals under $1,000 NZD use phone OTP only. Deals of $1,000 NZD or more may require additional identity verification.
            All transactions are capped at $2,500 NZD.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/deals/new">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold px-10 h-13 text-base shadow-xl shadow-teal-900/30"
              >
                Start a Deal
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/seller/onboard">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto px-10 h-13 text-base border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
              >
                Set Up as a Seller
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
