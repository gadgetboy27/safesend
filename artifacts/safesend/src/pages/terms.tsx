import { Layout } from "@/components/layout";

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-slate-900">
        <span className="text-teal-700 mr-2">{num}.</span>{title}
      </h2>
      <div className="text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">

        <div className="mb-8 rounded-lg border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-800">
          <strong>Two documents govern your use of SafeSend.</strong> This page covers platform rules, fees, and eligibility. The separate{" "}
          <a href="/escrow-agreement" className="font-semibold underline underline-offset-2 hover:text-teal-900">Escrow Agreement</a>{" "}
          is a binding three-party contract that governs exactly how your money is held and released.
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last Updated: May 2026</p>

        <div className="space-y-10">

          <Section num="1" title="The SafeSend Protocol">
            <p>
              SafeSend is an escrow intermediary service. By using this platform, you engage SafeSend to act as a neutral stakeholder. We facilitate secure transactions using a "Manual Capture" method via{" "}
              <a href="https://stripe.com/en-nz" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe</a>
              . SafeSend does not take title to any goods and is not a party to the underlying sale contract.
            </p>
          </Section>

          <Section num="2" title="Payment Processing & Stripe Terms">
            <p>
              Payment processing services for SafeSend are provided by Stripe Payments New Zealand Limited and are subject to the{" "}
              <a
                href="https://stripe.com/en-nz/legal/connect-account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
              >
                Stripe Connected Account Agreement
              </a>
              , which includes the{" "}
              <a
                href="https://stripe.com/en-nz/legal/ssa"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
              >
                Stripe Services Agreement
              </a>
              . By using SafeSend, you agree to be bound by these Stripe terms. SafeSend triggers the "Capture" of funds based on delivery data, but the physical holding of funds is managed by Stripe.
            </p>
          </Section>

          <Section num="3" title="Fees &amp; Charges">
            <p>
              SafeSend charges a <strong>4% platform fee (minimum $5.00 NZD)</strong> on every deal. This fee is paid by the Buyer and included in the total charged at payment time.
            </p>
            <p>
              <strong>Identity Verification Fee:</strong> For deals with a value of <strong>$500.00 NZD or more</strong>, an additional <strong>$2.50 NZD identity verification fee</strong> is charged to the Buyer. This fee covers the cost of Stripe Identity document verification, which is required to reduce fraud risk on higher-value transactions. The fee is non-refundable once verification has been initiated, regardless of whether the deal proceeds.
            </p>
            <p>
              The fee breakdown (platform fee + any identity verification fee + item amount = total) is shown clearly before you confirm payment. By paying, you acknowledge and accept these charges.
            </p>
            <p>
              <a href="https://stripe.com/en-nz/pricing" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe's payment processing fees</a>{" "}
              are included within the platform fee and are not charged separately to users. Per Stripe's policy, card processing fees are non-refundable once a transaction is initiated.
            </p>
          </Section>

          <Section num="4" title="Eligibility &amp; Identity Verification">
            <p>
              You must be <strong>18 or older</strong> and a <strong>resident of New Zealand</strong> to use SafeSend.
            </p>
            <p>
              For deals valued at <strong>$500.00 NZD or above</strong>, both the Buyer and Seller may be required to complete identity verification (KYC) via{" "}
              <a href="https://stripe.com/en-nz/identity" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe Identity</a>
              . This involves submitting a government-issued photo ID (such as a New Zealand passport or driver's licence) and a selfie for liveness checking. SafeSend does not store your raw government ID images — these are processed and stored exclusively by Stripe in accordance with{" "}
              <a href="https://stripe.com/en-nz/privacy" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe's privacy policy</a>.
            </p>
            <p>
              Failure to complete identity verification on a qualifying deal will result in the deal being cancelled and any held funds refunded to the Buyer.
            </p>
          </Section>

          <Section num="5" title="Limitation of Liability">
            <p>
              SafeSend is a private service operating under the <em>Trusts Act 2019</em>. We act as a neutral trustee. Our liability is limited to the amount held in escrow for the relevant deal. We are not liable for courier delays, item quality, or indirect losses.
            </p>
          </Section>

        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 text-sm text-slate-500 space-y-1">
          <p>
            These Terms are governed by the laws of New Zealand under the{" "}
            <a href="https://www.legislation.govt.nz/act/public/2017/0005/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">
              <em>Contract and Commercial Law Act 2017</em>
            </a>
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
