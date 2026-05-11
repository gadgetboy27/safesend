import { useState, useEffect, useRef } from "react";

const STRIPE_RATES = {
  domestic: { pct: 0.017, fixed: 0.30, label: "NZ Domestic card", flag: "🇳🇿", tag: "Most common" },
  intl:     { pct: 0.034, fixed: 0.30, label: "International card", flag: "🌍", tag: "" },
  amex:     { pct: 0.034, fixed: 0.30, label: "Amex card", flag: "💎", tag: "" },
};

const TEAL       = "#0f766e";
const TEAL_DARK  = "#0c4a45";
const TEAL_LITE  = "#f0fdf4";
const BLUE       = "#1d4ed8";
const BLUE_LITE  = "#eff6ff";
const RED        = "#ef4444";
const RED_LITE   = "#fef2f2";
const AMBER      = "#f59e0b";
const AMBER_LITE = "#fef9c3";
const SLATE      = "#64748b";
const MONO       = "DM Mono, monospace";
const SANS       = "DM Sans, Segoe UI, sans-serif";

function calcFees(amount, cardType) {
  const safeSendFee = Math.max(amount * 0.04, 5);
  const subtotal    = amount + safeSendFee;
  const rate        = STRIPE_RATES[cardType];
  const stripeFee   = subtotal * rate.pct + rate.fixed;
  const buyerPays   = subtotal + stripeFee;
  const net         = safeSendFee - stripeFee;
  const r = (n) => Math.round(n * 100) / 100;
  return {
    amount,
    safeSendFee: r(safeSendFee),
    stripeFee: r(stripeFee),
    buyerPays: r(buyerPays),
    net: r(net),
  };
}

function nzd(n) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

function AnimNum({ val }) {
  const [disp, setDisp] = useState(val);
  const prev = useRef(val);
  useEffect(() => {
    const s = prev.current;
    const e = val;
    const t0 = performance.now();
    function frame(now) {
      const p    = Math.min((now - t0) / 300, 1);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      setDisp(s + (e - s) * ease);
      if (p < 1) requestAnimationFrame(frame);
      else {
        setDisp(e);
        prev.current = e;
      }
    }
    requestAnimationFrame(frame);
  }, [val]);
  return <span style={{ fontFamily: MONO }}>{nzd(disp)}</span>;
}

function Pill({ children, bg, col }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 9px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      background: bg,
      color: col,
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: SLATE,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

const STAGES = [
  {
    id: "created",
    icon: "📋",
    label: "Deal Created",
    actor: "Seller",
    actorCol: TEAL,
    desc: "Seller fills in item details and buyer email. System emails and SMSs the buyer a secure payment link.",
    deadline: "Buyer has 7 days to pay",
    urgent: false,
    missed: "Deal auto-cancels after 7 days. No money was ever involved.",
    money: "No money involved yet",
    moneyCol: SLATE,
    impl: "Hourly job: cancel where state='created' AND now > created_at + 7 days",
    built: false,
  },
  {
    id: "funded",
    icon: "💳",
    label: "Buyer Pays",
    actor: "Buyer",
    actorCol: BLUE,
    desc: "Payment captured by Stripe. Funds held in escrow — seller cannot access them.",
    deadline: "Seller has 5 days to ship",
    urgent: true,
    missed: "Automatic full refund to buyer after 5 days. No action needed from buyer.",
    money: "Held in escrow — fully protected",
    moneyCol: BLUE,
    impl: "Hourly job: refund where state='funded' AND now > funded_at + 5 business days",
    built: false,
  },
  {
    id: "shipped",
    icon: "📦",
    label: "Seller Ships",
    actor: "Seller",
    actorCol: TEAL,
    desc: "Seller enters tracking number. TrackingMore registers and monitors for courier scans.",
    deadline: "First courier scan within 48 hours",
    urgent: true,
    missed: "No scan within 48h = shipment flagged. Buyer can cancel and receive a full refund.",
    money: "Still held in escrow",
    moneyCol: BLUE,
    impl: "Job every 6h: flag where state='shipped' AND now > shipped_at + 48h with no scan",
    built: true,
  },
  {
    id: "delivered",
    icon: "✅",
    label: "Delivered",
    actor: "Courier",
    actorCol: "#7c3aed",
    desc: "Courier confirms delivery. Buyer gets SMS + email: confirm receipt or raise dispute within 48 hours.",
    deadline: "Buyer has 48 hours to act",
    urgent: true,
    missed: "No action within 48h = funds auto-release to seller. Dispute window closes.",
    money: "Auto-releases to seller in 48h if no action",
    moneyCol: AMBER,
    impl: "Hourly job: release where state='delivered' AND now > delivered_at + 48h",
    built: true,
  },
  {
    id: "complete",
    icon: "🎉",
    label: "Funds Released",
    actor: "SafeSend",
    actorCol: TEAL,
    desc: "Stripe Connect transfer fires immediately. Seller bank receives funds in 1-2 business days.",
    deadline: "Bank transfer: 1-2 business days",
    urgent: false,
    missed: "N/A — this is the successful end state.",
    money: "Transferred to seller",
    moneyCol: TEAL,
    impl: "stripe.transfers.create() with idempotency key prevents any double-payment",
    built: true,
  },
];

const TABLE_AMOUNTS = [50, 125, 250, 500, 850, 1200, 2500];

export default function SafeSendCalculator() {
  const [amount, setAmount]     = useState(500);
  const [cardType, setCardType] = useState("domestic");
  const [openStage, setOpenStage] = useState(null);
  const [tab, setTab]           = useState("calc");

  const fees = calcFees(amount, cardType);
  const rate = STRIPE_RATES[cardType];
  const stripePct = (rate.pct * 100).toFixed(1);

  const tabs = [
    { id: "calc",     label: "Fee Calculator" },
    { id: "timeline", label: "Deal Timelines" },
    { id: "dispute",  label: "Dispute Process" },
  ];

  const WORST_CASES = [
    { lbl: "Buyer never pays",                 cur: "Forever",          rec: "7 days -> auto-cancel",       done: false },
    { lbl: "Seller never ships after payment", cur: "Forever",          rec: "5 days -> auto-refund buyer",  done: false },
    { lbl: "No courier scan within 48h",       cur: "48h -> can cancel", rec: "Already correct",              done: true  },
    { lbl: "Buyer ignores delivery scan",      cur: "48h -> auto-release", rec: "Already implemented",        done: true  },
    { lbl: "Dispute runs unresolved",          cur: "Forever",          rec: "14 days -> auto-refund",       done: false },
  ];

  const DISPUTE_STEPS = [
    { day: "Day 0",  label: "Dispute raised",         col: RED,   desc: "Funds frozen. Both parties + admin notified by email and SMS." },
    { day: "Day 1",  label: "Admin review begins",    col: AMBER, desc: "Admin reviews courier data, messages, and evidence from both parties." },
    { day: "Day 5",  label: "Resolution target",      col: AMBER, desc: "Admin must issue a binding decision within 5 business days." },
    { day: "Day 14", label: "Hard cap: auto-refund",  col: RED,   desc: "If still unresolved, buyer receives a full automatic refund." },
  ];

  return (
    <div style={{ fontFamily: SANS, background: "#f0f4f8", minHeight: "100vh", color: "#1a2332" }}>

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, " + TEAL_DARK + " 0%, " + TEAL + " 55%, #14b8a6 100%)",
        padding: "44px 24px 60px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-block",
          background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 99,
          padding: "4px 16px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "white",
          marginBottom: 16,
        }}>
          Transparent pricing — no hidden fees
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "white", marginBottom: 10, lineHeight: 1.15 }}>
          Exactly what you pay.
          <br />
          Exactly what you get.
        </h1>
        <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 15, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          Every fee, every deadline, every protection — shown upfront.
          No surprises when real money is involved.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        background: "white",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        justifyContent: "center",
        gap: 0,
        overflowX: "auto",
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "15px 24px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderBottom: "3px solid " + (tab === t.id ? TEAL : "transparent"),
              color: tab === t.id ? TEAL : SLATE,
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 18px 60px" }}>

        {/* ── FEE CALCULATOR ── */}
        {tab === "calc" && (
          <div>
            {/* Amount input */}
            <div style={{ background: "white", borderRadius: 18, padding: "24px 26px", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
                <div>
                  <SectionLabel>Sale price (NZD)</SectionLabel>
                  <div style={{ fontSize: 48, fontWeight: 800, color: TEAL, fontFamily: MONO, lineHeight: 1 }}>
                    ${amount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <SectionLabel>Card type</SectionLabel>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {Object.entries(STRIPE_RATES).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setCardType(k)}
                        style={{
                          padding: "7px 13px",
                          borderRadius: 9,
                          border: "2px solid " + (cardType === k ? TEAL : "#e2e8f0"),
                          background: cardType === k ? TEAL_LITE : "white",
                          color: cardType === k ? TEAL : SLATE,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {v.flag} {v.label}
                        {v.tag && (
                          <span style={{ background: TEAL, color: "white", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
                            {v.tag}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <input
                type="range"
                min={20}
                max={2500}
                value={amount}
                step={5}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{ width: "100%", accentColor: TEAL, cursor: "pointer", marginBottom: 6 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
                <span>$20 minimum</span>
                <span>$2,500 maximum</span>
              </div>

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[100, 250, 500, 850, 1200, 2000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "1.5px solid " + (amount === v ? TEAL : "#e2e8f0"),
                      background: amount === v ? TEAL_LITE : "#f8fafc",
                      color: amount === v ? TEAL : SLATE,
                    }}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Buyer + Seller cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>

              {/* Buyer */}
              <div style={{ background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>
                <div style={{ background: BLUE_LITE, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>👤</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1e3a8a" }}>Buyer pays</div>
                    <div style={{ fontSize: 12, color: "#3b82f6" }}>Full breakdown of all charges</div>
                  </div>
                </div>
                <div style={{ padding: "0 0 0 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>Item price</span>
                    <span style={{ fontWeight: 700, color: "#1e293b", fontFamily: MONO }}><AnimNum val={fees.amount} /></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>SafeSend fee (4%, min $5)</span>
                    <span style={{ fontWeight: 700, color: TEAL, fontFamily: MONO }}><AnimNum val={fees.safeSendFee} /></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>Stripe processing ({stripePct}% + $0.30)</span>
                    <span style={{ fontWeight: 700, color: BLUE, fontFamily: MONO }}><AnimNum val={fees.stripeFee} /></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: BLUE }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Total charged</span>
                    <span style={{ fontSize: 21, fontWeight: 800, color: "white" }}><AnimNum val={fees.buyerPays} /></span>
                  </div>
                </div>
              </div>

              {/* Seller */}
              <div style={{ background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>
                <div style={{ background: TEAL_LITE, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🏪</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#14532d" }}>Seller receives</div>
                    <div style={{ fontSize: 12, color: "#22c55e" }}>1-2 business days after release</div>
                  </div>
                </div>
                <div style={{ padding: "24px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                    You receive exactly
                  </div>
                  <div style={{ fontSize: 44, fontWeight: 800, color: TEAL, lineHeight: 1, fontFamily: MONO }}>
                    <AnimNum val={fees.amount} />
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>The full agreed sale price — no deductions</div>
                </div>
                <div style={{ margin: "0 18px 18px", background: TEAL_LITE, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#166534", lineHeight: 1.65 }}>
                  Fees are paid by the buyer, not deducted from you.
                  <br />
                  Bank transfer arrives 1-2 business days after release.
                </div>
              </div>
            </div>

            {/* SafeSend net */}
            <div style={{ background: "white", borderRadius: 18, padding: "20px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", marginBottom: 18 }}>
              <SectionLabel>SafeSend net revenue on this deal</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140, padding: "10px 16px", borderRight: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>Platform fee collected</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: TEAL, fontFamily: MONO }}>+{nzd(fees.safeSendFee)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 140, padding: "10px 16px", borderRight: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>Stripe fee (SafeSend pays)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: RED, fontFamily: MONO }}>-{nzd(fees.stripeFee)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 140, padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>Net revenue</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: fees.net >= 0 ? TEAL : RED, fontFamily: MONO }}>
                    {fees.net >= 0 ? "" : "-"}{nzd(fees.net)}
                  </div>
                </div>
              </div>
              {fees.net < 2 && (
                <div style={{ marginTop: 12, background: RED_LITE, border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#991b1b" }}>
                  Margin is very tight here. The $5 minimum fee and $20 minimum deal protect against losses on domestic cards — but international cards on small deals can produce negative net revenue.
                </div>
              )}
            </div>

            {/* Comparison table */}
            <div style={{ background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 14 }}>
                All deal sizes — NZ domestic card (click a row to set calculator)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Sale price", "SafeSend fee", "Stripe fee", "Buyer pays", "Seller gets", "SafeSend net"].map((h) => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: SLATE, borderBottom: "2px solid #e2e8f0" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TABLE_AMOUNTS.map((a) => {
                      const f      = calcFees(a, "domestic");
                      const active = Math.abs(a - amount) < 30;
                      return (
                        <tr
                          key={a}
                          onClick={() => setAmount(a)}
                          style={{ background: active ? TEAL_LITE : "white", cursor: "pointer" }}
                        >
                          <td style={{ padding: "11px 16px", fontWeight: active ? 800 : 400, color: active ? TEAL : "#1e293b", fontFamily: MONO }}>${a.toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", color: TEAL,               fontFamily: MONO }}>${f.safeSendFee.toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", color: BLUE,               fontFamily: MONO }}>${f.stripeFee.toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", fontWeight: 600,           fontFamily: MONO }}>${f.buyerPays.toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", color: TEAL, fontWeight: 600, fontFamily: MONO }}>${f.sellerReceives.toFixed(2)}</td>
                          <td style={{ padding: "11px 16px", color: f.net >= 0 ? TEAL : RED, fontFamily: MONO }}>${f.net.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── DEAL TIMELINES ── */}
        {tab === "timeline" && (
          <div>
            <div style={{ background: AMBER_LITE, border: "1px solid #fde047", borderRadius: 10, padding: "13px 16px", marginBottom: 20, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
              <strong>All deadlines run in server code — not Stripe dashboard.</strong> Stripe's dashboard is monitoring only. All refunds and cancellations are triggered programmatically by scheduled server jobs using stripe.refunds.create().
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {STAGES.map((stage, i) => (
                <div
                  key={stage.id}
                  onClick={() => setOpenStage(openStage === stage.id ? null : stage.id)}
                  style={{
                    background: "white",
                    borderRadius: 16,
                    overflow: "hidden",
                    boxShadow: openStage === stage.id ? "0 6px 28px rgba(15,118,110,0.14)" : "0 2px 10px rgba(0,0,0,0.05)",
                    border: "2px solid " + (openStage === stage.id ? TEAL : "transparent"),
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ padding: "17px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: stage.actorCol + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0 }}>
                      {stage.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>Step {i + 1}: {stage.label}</span>
                        <Pill bg={stage.actorCol + "20"} col={stage.actorCol}>{stage.actor}</Pill>
                        {stage.built
                          ? <Pill bg="#dcfce7" col="#15803d">Built</Pill>
                          : <Pill bg={RED_LITE} col={RED}>Build this</Pill>
                        }
                      </div>
                      <div style={{ fontSize: 13, color: SLATE }}>{stage.desc}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 8,
                        background: stage.urgent ? AMBER_LITE : TEAL_LITE,
                        color: stage.urgent ? "#92400e" : "#14532d",
                        marginBottom: 6,
                      }}>
                        {stage.deadline}
                      </div>
                      <div style={{ fontSize: 12, color: stage.moneyCol, fontWeight: 600 }}>{stage.money}</div>
                    </div>
                  </div>

                  {openStage === stage.id && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: "18px 22px", background: "#fafbff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <SectionLabel>If deadline is missed</SectionLabel>
                          <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, background: AMBER_LITE, border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px" }}>
                            {stage.missed}
                          </div>
                        </div>
                        <div>
                          <SectionLabel>Implementation</SectionLabel>
                          <div style={{ fontSize: 12, background: "#1e293b", borderRadius: 8, padding: "10px 14px", fontFamily: MONO, color: "#86efac", lineHeight: 1.8 }}>
                            {stage.impl}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Worst case table */}
            <div style={{ background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 14 }}>
                Maximum time money can be held — current vs required
              </div>
              {WORST_CASES.map((row, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", borderBottom: i < WORST_CASES.length - 1 ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{row.lbl}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: row.done ? SLATE : RED, fontWeight: 600, background: row.done ? "#f1f5f9" : RED_LITE, padding: "3px 10px", borderRadius: 6 }}>
                    {row.cur}
                  </span>
                  <span style={{ fontSize: 11, color: SLATE }}>to</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: row.done ? TEAL : AMBER, fontWeight: 600, background: row.done ? TEAL_LITE : AMBER_LITE, padding: "3px 10px", borderRadius: 6 }}>
                    {row.rec}
                  </span>
                  {row.done
                    ? <Pill bg="#dcfce7" col="#15803d">Done</Pill>
                    : <Pill bg={RED_LITE} col={RED}>Build this</Pill>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DISPUTE PROCESS ── */}
        {tab === "dispute" && (
          <div>
            <div style={{ background: RED_LITE, border: "1px solid #fecaca", borderRadius: 10, padding: "13px 16px", marginBottom: 20, fontSize: 13, color: "#991b1b", lineHeight: 1.6 }}>
              <strong>Disputes are currently indefinite — fix before launch.</strong> Once raised, funds freeze with no maximum hold time, no SLA, and no escalation in the current code. NZ consumer protection law requires disputes to be resolved within a reasonable timeframe.
            </div>

            {/* SLA timeline */}
            <div style={{ background: "white", borderRadius: 18, padding: "28px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 28 }}>Dispute SLA — to implement</div>
              <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                <div style={{ position: "absolute", top: 21, left: "10%", right: "10%", height: 3, background: "linear-gradient(90deg, " + RED + ", " + AMBER + ", " + AMBER + ", " + RED + ")", opacity: 0.3, borderRadius: 99 }} />
                {DISPUTE_STEPS.map((s, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: s.col,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: 800,
                      fontSize: 11,
                      marginBottom: 10,
                      position: "relative",
                      zIndex: 1,
                      fontFamily: MONO,
                    }}>
                      {s.day}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, maxWidth: 120 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: SLATE, maxWidth: 130, lineHeight: 1.4 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcomes + review */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              <div style={{ background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>What admin reviews</div>
                {[
                  "Courier tracking data (independent, cannot be faked)",
                  "Deal message thread (timestamped, stored by SafeSend)",
                  "Photos and evidence uploaded by either party",
                  "Original deal description written by seller",
                  "Full state transition audit log",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8, color: "#475569", alignItems: "flex-start" }}>
                    <span style={{ color: TEAL, flexShrink: 0 }}>+</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Admin can issue</div>
                {[
                  { icon: "Refund buyer",       desc: "Full Stripe refund. Deal moves to refunded state." },
                  { icon: "Release to seller",  desc: "Stripe Connect transfer fires. Deal moves to complete." },
                  { icon: "Split decision",     desc: "Partial refund + partial transfer. Admin handles manually." },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.icon}</div>
                    <div style={{ fontSize: 12, color: SLATE }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Terms language */}
            <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Replace Terms of Service Section 6 with this text</div>
              <div style={{ background: "#1e293b", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#e2e8f0", lineHeight: 1.85, fontFamily: MONO }}>
                <div style={{ color: "#64748b", marginBottom: 10, fontSize: 12 }}>Section 6: Disputes</div>
                <div>
                  Either party may raise a dispute while a deal is in funded, shipped, or delivered state. Raising a dispute freezes all funds immediately.
                </div>
                <div style={{ marginTop: 10 }}>
                  SafeSend will acknowledge the dispute within 1 business day and issue a binding resolution within{" "}
                  <span style={{ color: "#86efac" }}>5 business days</span>.
                </div>
                <div style={{ marginTop: 10 }}>
                  If SafeSend cannot reach a decision within{" "}
                  <span style={{ color: "#f87171" }}>14 calendar days</span>
                  , the buyer automatically receives a full refund. SafeSend decisions are final. Evidence must be submitted within 48 hours.
                </div>
              </div>
              <div style={{ marginTop: 12, background: AMBER_LITE, border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#78350f" }}>
                The full Terms must be reviewed by a NZ solicitor before SafeSend accepts real payments.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
