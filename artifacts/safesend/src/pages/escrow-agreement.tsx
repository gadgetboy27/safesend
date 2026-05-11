import { Link } from "wouter";
import { Layout } from "@/components/layout";

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 pb-2 border-b border-slate-200">
        <span className="text-teal-700 mr-2">{num}.</span>{title}
      </h2>
      <div className="text-slate-600 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

const TOC = [
  { id: "roles",    num: "1", label: "Roles and Duties" },
  { id: "hold",     num: "2", label: "The Mechanics of the \"Hold\"" },
  { id: "trigger",  num: "3", label: "Trigger Conditions for Release" },
  { id: "longstop", num: "4", label: "Longstop Dates" },
  { id: "disputes", num: "5", label: "Dispute Resolution & The NZ Tribunal" },
];

export default function EscrowAgreement() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">

        {/* Header */}
        <div className="mb-2">
          <div className="inline-block bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
            Legal Document — Escrow Agreement
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">SafeSend Escrow Agreement</h1>
          <p className="text-sm text-slate-500 mb-1">Version 1.0 — Effective May 2026</p>
          <p className="text-sm text-slate-500">
            Separate from and supplementary to the{" "}
            <Link href="/terms" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">
              SafeSend Terms of Service
            </Link>
            . In the event of conflict, this Escrow Agreement prevails for matters relating to the holding and release of escrowed funds.
          </p>
        </div>

        <div className="my-8 border-t-2 border-teal-600" />

        {/* Preamble */}
        <div className="mb-8 bg-slate-50 border border-slate-200 rounded-lg px-6 py-5 text-sm text-slate-600 leading-relaxed">
          <p>
            This Agreement is a <strong>binding three-party contract</strong> between the Buyer (Depositor), the Seller (Beneficiary), and SafeSend (Escrow Agent) under the{" "}
            <em>Contract and Commercial Law Act 2017</em>.
          </p>
          <p className="mt-3">
            By creating or accepting a deal on SafeSend and ticking the consent checkboxes, each party agrees to be bound by the terms of this Agreement. This Agreement is also governed by the <em>Trusts Act 2019</em> and the <em>Anti-Money Laundering and Countering Financing of Terrorism Act 2009</em>.
          </p>
        </div>

        <div className="flex gap-10 items-start">

          {/* Sticky TOC sidebar */}
          <aside className="hidden lg:block w-52 flex-shrink-0 sticky top-24 self-start">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Contents</p>
            <nav className="space-y-1">
              {TOC.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-sm text-slate-500 hover:text-teal-700 hover:translate-x-0.5 transition-all"
                >
                  {item.num}. {item.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Document body */}
          <div className="flex-1 min-w-0 space-y-12">

            <Section id="roles" num="1" title="Roles and Duties">
              <div className="grid gap-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800 mb-1">SafeSend — Escrow Agent</p>
                  <p className="text-sm">
                    Acts as a <strong>Neutral Trustee</strong> under the <em>Trusts Act 2019</em>. We owe both parties a "Duty of Impartiality" and "Duty of Good Faith."
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="font-semibold text-blue-900 mb-1">Buyer — Depositor</p>
                  <p className="text-sm text-blue-800">
                    Responsible for depositing cleared funds and confirming receipt or raising a dispute within the 48-hour inspection window.
                  </p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
                  <p className="font-semibold text-teal-900 mb-1">Seller — Beneficiary</p>
                  <p className="text-sm text-teal-800">
                    Responsible for shipping via a tracked courier and providing an accurate item description. Must hold a valid{" "}
                    <a href="https://stripe.com/en-nz/connect" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium hover:opacity-80">Stripe Connect</a>{" "}
                    account to receive funds.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="hold" num="2" title='The Mechanics of the "Hold"'>
              <p>
                SafeSend uses the{" "}
                <a href="https://stripe.com/en-nz" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe API</a>{" "}
                to authorize and capture funds. Funds are held in a segregated Stripe pool. SafeSend holds the "Digital Key" to these funds and will only issue a "Capture" (Pay Seller) or "Refund" (Pay Buyer) instruction when objective Trigger Conditions are met.
              </p>
              <p>
                SafeSend does not hold, touch, or commingle client funds with its own operating account at any time. This arrangement satisfies the segregation-of-funds requirement referenced under the{" "}
                <a href="https://www.legislation.govt.nz/act/public/2019/0038/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900"><em>Trusts Act 2019</em></a>
                .
              </p>
              <p>
                No interest is paid to either party on escrowed funds. Any float earned on funds in Stripe's infrastructure accrues to Stripe under{" "}
                <a href="https://stripe.com/en-nz/legal/ssa" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe's own terms</a>
                .
              </p>
            </Section>

            <Section id="trigger" num="3" title="Trigger Conditions for Release">
              <p>Funds are released to the Seller only when <strong>one</strong> of the following objective conditions is met:</p>
              <div className="space-y-3 mt-2">
                <div className="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-teal-700 font-bold flex-shrink-0">A.</span>
                  <div>
                    <p className="font-semibold text-slate-800">Manual Confirmation</p>
                    <p className="text-sm mt-0.5">The Buyer confirms receipt in the app. Release occurs immediately.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-teal-700 font-bold flex-shrink-0">B.</span>
                  <div>
                    <p className="font-semibold text-slate-800">Auto-Release</p>
                    <p className="text-sm mt-0.5">A verified New Zealand courier API confirms "Delivered," and <strong>48 hours</strong> pass without the Buyer raising a dispute. This is an objective, time-based trigger that cannot be overridden by either party.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-teal-700 font-bold flex-shrink-0">C.</span>
                  <div>
                    <p className="font-semibold text-slate-800">Dispute Resolution</p>
                    <p className="text-sm mt-0.5">A SafeSend administrator resolves a dispute in the Seller's favour.</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-500 pt-1">
                Funds are returned to the Buyer (via Stripe refund) when a Longstop Date is reached, a dispute is resolved in the Buyer's favour, or both parties agree in writing to cancel the deal.
              </p>
            </Section>

            <Section id="longstop" num="4" title="Longstop Dates (Automatic Deadlines)">
              <p>
                To protect both parties and ensure funds are never held indefinitely, the following deadlines apply automatically to every deal, enforced by scheduled server jobs.
              </p>
              <div className="rounded-lg border border-slate-200 overflow-hidden text-sm mt-2">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-700 border-b border-slate-200">Deadline</th>
                      <th className="text-left p-3 font-semibold text-slate-700 border-b border-slate-200">Period</th>
                      <th className="text-left p-3 font-semibold text-slate-700 border-b border-slate-200">If missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="p-3 font-medium text-slate-800">Ship-by</td>
                      <td className="p-3 text-slate-600">5 Business Days from payment</td>
                      <td className="p-3 text-slate-600">Automatic full refund to Buyer</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="p-3 font-medium text-slate-800">First courier scan</td>
                      <td className="p-3 text-slate-600">48 hours from marking shipped</td>
                      <td className="p-3 text-slate-600">Shipment flagged; Buyer may cancel</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="p-3 font-medium text-slate-800">Buyer action window</td>
                      <td className="p-3 text-slate-600">48 hours from Delivery scan</td>
                      <td className="p-3 text-slate-600">Funds auto-released to Seller</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-slate-800">Dispute resolution cap</td>
                      <td className="p-3 text-slate-600">14 calendar days from dispute</td>
                      <td className="p-3 text-slate-600">Automatic full refund to Buyer</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="disputes" num="5" title="Dispute Resolution & The NZ Tribunal">
              <p>
                If a dispute is raised, funds are frozen. SafeSend will review evidence (photos, tracking, chat logs) and issue a decision within <strong>14 days</strong>.
              </p>
              <p>
                SafeSend recognizes the{" "}
                <a
                  href="https://www.disputestribunal.govt.nz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
                >
                  New Zealand Disputes Tribunal
                </a>{" "}
                as the final authority. If we cannot reach a decision, or if you disagree with our resolution, SafeSend will hold the funds until a formal Order is issued by the Tribunal or a Court.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-1">SafeSend's dispute service level</p>
                <ul className="space-y-1 list-disc pl-4">
                  <li>Acknowledge within <strong>1 Business Day</strong></li>
                  <li>Resolution within <strong>5 Business Days</strong></li>
                  <li>14-day hard cap — Buyer automatically refunded if unresolved</li>
                </ul>
              </div>
              <p className="text-sm">
                Raising a dispute in bad faith (e.g. falsely claiming non-delivery when the courier confirms "Delivered") may result in immediate release of funds to the Seller and suspension of the Buyer's account.
              </p>
            </Section>

          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 text-sm text-slate-500 space-y-1">
          <p>
            Governed by the laws of New Zealand —{" "}
            <a href="https://www.legislation.govt.nz/act/public/2017/0005/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900"><em>Contract and Commercial Law Act 2017</em></a>
            ,{" "}
            <a href="https://www.legislation.govt.nz/act/public/2019/0038/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900"><em>Trusts Act 2019</em></a>
            ,{" "}
            <a href="https://www.legislation.govt.nz/act/public/2009/0035/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900"><em>Anti-Money Laundering and Countering Financing of Terrorism Act 2009</em></a>
            .
          </p>
          <p>
            Questions?{" "}
            <a href="mailto:hello@safesend.nz" className="text-teal-700 underline underline-offset-2">
              hello@safesend.nz
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}
