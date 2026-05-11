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

export default function Privacy() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last Updated: May 2026</p>

        <div className="space-y-10">

          <Section num="1" title="Privacy Act 2020 Compliance">
            <p>
              SafeSend is committed to protecting your personal information in accordance with the{" "}
              <strong>New Zealand Privacy Act 2020</strong>. We collect only what we need to operate the escrow service and never sell your data to third parties.
            </p>
          </Section>

          <Section num="2" title="Information We Collect">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-800 mb-1">Account Data</p>
                <p>Your email address, used for Magic Link authentication. We do not store passwords.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-800 mb-1">Transaction Data</p>
                <p>Item descriptions, agreed prices, courier tracking numbers, and deal state history.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-800 mb-1">Payment Data</p>
                <p>
                  All sensitive financial and identity data (government IDs, card numbers) is collected and stored by{" "}
                  <a
                    href="https://stripe.com/en-nz/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 underline underline-offset-2 hover:text-teal-900"
                  >
                    Stripe
                  </a>
                  . SafeSend does not have access to your full financial details.
                </p>
              </div>
            </div>
          </Section>

          <Section num="3" title="Third-Party Data Sharing">
            <p>We share data only as necessary to fulfil the service:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>
                <a href="https://stripe.com/en-nz/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900">Stripe</a>{" "}
                — to process payments and verify identity (KYC / AML).
              </li>
              <li>
                <a href="https://www.trackingmore.com/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900">TrackingMore</a>{" "}
                — to verify delivery status via courier APIs.
              </li>
            </ul>
            <p>We do not sell, rent, or share your data with advertisers or marketing platforms.</p>
          </Section>

          <Section num="4" title="Your Rights">
            <p>
              Under the Privacy Act 2020, you have the right to <strong>access</strong> any information we hold about you and <strong>request corrections</strong>.
            </p>
            <p>
              Because we facilitate financial transactions, we retain deal records for <strong>7 years</strong> to comply with NZ tax and audit laws.
            </p>
            <p>
              For data requests, contact{" "}
              <a href="mailto:privacy@safesend.nz" className="text-teal-700 underline underline-offset-2 hover:text-teal-900">
                privacy@safesend.nz
              </a>
              .
            </p>
          </Section>

        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 text-sm text-slate-500 space-y-1">
          <p>
            Governed by the{" "}
            <a href="https://www.legislation.govt.nz/act/public/2020/0031/latest/whole.html" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline underline-offset-2 hover:text-teal-900"><em>New Zealand Privacy Act 2020</em></a>
            .
          </p>
          <p>
            General enquiries:{" "}
            <a href="mailto:hello@safesend.nz" className="text-teal-700 underline underline-offset-2">
              hello@safesend.nz
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}
