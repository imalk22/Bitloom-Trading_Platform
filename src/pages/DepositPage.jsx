import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Copy, CheckCircle2, CreditCard, Building2,
  Shield, Clock, AlertTriangle, Info, Smartphone,
  Lock, ChevronDown, ExternalLink, MessageCircle,
  Wallet, Globe,
} from "lucide-react";
import { openSupportChat } from "../components/chat/ChatWidget.jsx";

// Official Bitloom USDT on TRON (TRC20) deposit address.
const TRC20_ADDRESS = "TTbJrnrs4Rp3DQ8TzHRtgwNVX32PUCTgTU";
const BTC_QR = "/btc-trc20-deposit-qr.jpg";
const ETH_QR = "/eth-trc20-deposit-qr.jpg";
const USDT_QR = "/usdt-trc20-deposit-qr.jpg";
const TRC20_EXPLORER = `https://tronscan.org/#/address/${TRC20_ADDRESS}`;
const MIN_DEPOSIT = 500;
const CASHBACK_TIERS = [
  { amount: 500, percent: 5 },
  { amount: 5000, percent: 7 },
  { amount: 10000, percent: 10 },
  { amount: 20000, percent: 15 },
];

const LOGOS = {
  BTC: "/logo-btc.svg",
  ETH: "/logo-eth.svg",
  USDT: "/logo-usdt.svg",
  TRC20: "/logo-tron.svg",
};

// ── Crypto network/address data ──────────────────────────────────────────────
const NETWORKS = {
  BTC: [
    { id: "TRC20", label: "TRON (TRC20)", note: "Lowest fee · ~2 min", fee: "Low", address: "", qr: BTC_QR },
  ],
  ETH: [
    { id: "TRC20", label: "TRON (TRC20)", note: "Lowest fee · ~2 min", fee: "Low", address: "", qr: ETH_QR },
  ],
  USDT: [
    { id: "TRC20", label: "TRON (TRC20)", note: "Lowest fee · ~2 min", fee: "Low", address: TRC20_ADDRESS, qr: USDT_QR },
  ],
};

const FIAT_METHODS = [
  { id: "card",  name: "Credit / Debit Card",   sub: "Visa · Mastercard · Amex", fee: "2.5%", time: "Instant",   icon: CreditCard,  recommended: true,  accent: "amber",  glow: "rgba(14,165,233,0.15)"  },
  { id: "bank",  name: "Bank Transfer (SWIFT)", sub: "International wire",        fee: "0%",   time: "1–3 days",  icon: Building2,   recommended: false, accent: "blue",   glow: "rgba(59,130,246,0.15)"  },
  { id: "apple", name: "Apple Pay",             sub: "Powered by BPay",          fee: "3.5%", time: "Instant",   icon: Smartphone,  recommended: false, accent: "slate",  glow: "rgba(148,163,184,0.1)"  },
];

const CURRENCIES = [
  { sym: "BTC",  label: "Bitcoin",   logo: LOGOS.BTC },
  { sym: "ETH",  label: "Ethereum",  logo: LOGOS.ETH },
  { sym: "USDT", label: "Tether",    logo: LOGOS.USDT },
];

const QUICK_AMOUNTS = [500, 5000, 10000, 20000];

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <motion.button
      onClick={handle}
      whileTap={{ scale: 0.92 }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer
        bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DepositPage() {
  const navigate = useNavigate();
  const [depositType, setDepositType]   = useState("crypto");   // "crypto" | "fiat"
  const [currency, setCurrency]         = useState("USDT");
  const [network, setNetwork]           = useState(NETWORKS.USDT[0]);
  const [showNetDrop, setShowNetDrop]   = useState(false);
  const [fiatMethod, setFiatMethod]     = useState(null);
  const [amount, setAmount]             = useState("");
  const [agreedRisk, setAgreedRisk]     = useState(false);

  const handleCurrencyChange = (sym) => {
    setCurrency(sym);
    setNetwork(NETWORKS[sym][0]);
    setShowNetDrop(false);
  };

  const feeAmt = fiatMethod
    ? (Number(amount) * parseFloat(fiatMethod.fee) / 100).toFixed(2)
    : "0.00";
  const receiveAmt = fiatMethod
    ? (Number(amount) - parseFloat(feeAmt)).toFixed(2)
    : amount;

  // Crypto: the amount is entered first — the address is only revealed after it,
  // so support can match the incoming transfer to the account.
  const amountNum = Number(amount);
  const amountMeetsMin = amountNum >= MIN_DEPOSIT;
  const cryptoAmountOk = amountMeetsMin;

  const canContinue = depositType === "crypto"
    ? cryptoAmountOk
    : (fiatMethod && amountMeetsMin && agreedRisk);

  const openDepositChat = () => {
    if (!canContinue) return;
    const methodLabel = depositType === "crypto"
      ? `${currency} ${network?.id || ""}`
      : (fiatMethod?.name || "Fiat");
    openSupportChat(
      `Hi, I want to deposit ${amount} ${depositType === "crypto" ? currency : "USD"} via ${methodLabel}. Please help me credit my account after I send the funds.`
    );
  };

  const handleContinue = () => {
    if (!canContinue) return;
    openDepositChat();
  };

  const TABS = ["Deposit", "Withdraw"];

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white"
      style={{ backgroundImage: "radial-gradient(circle at 1px 1px,rgba(14,165,233,0.05) 1px,transparent 0)", backgroundSize: "40px 40px" }}>

      {/* ── Fixed ambient orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute -top-40 -left-32 h-[500px] w-[500px] rounded-full bg-sky-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-sky-600/[0.03] blur-3xl" />
      </div>

      {/* ── Top bar ── */}
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
        className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-800/70 bg-[#0b0f17]/95 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button onClick={() => navigate("/")}
            className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="hidden h-5 w-px bg-slate-800 sm:block" />
          <div className="flex min-w-0 cursor-pointer items-center gap-2" onClick={() => navigate("/")}>
            <img src="/bitloom-logo.png" alt="Bitloom" className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-sky-400/30" />
            <span className="truncate text-lg font-extrabold tracking-tight text-white">Bitloom</span>
            <span className="ml-2 hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-400/80 sm:inline">Trading</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-emerald-400 sm:text-xs">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="sm:hidden">SSL</span>
          <span className="hidden sm:inline">Secured · 256-bit SSL</span>
        </div>
      </motion.header>

      {/* ── Nav tabs ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="relative z-10 border-b border-slate-800/50 bg-[#0b0f17]/80 px-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const active = tab === "Deposit";
            return (
              <button key={tab}
                onClick={() => {
                  if (tab === "Withdraw") navigate("/withdraw");
                }}
                className={`relative shrink-0 cursor-pointer px-3 py-3.5 text-sm font-semibold transition sm:px-5 sm:py-4 ${active ? "text-sky-400" : "text-slate-500 hover:text-slate-300"}`}>
                {tab}
                {active && (
                  <motion.div layoutId="tabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-sky-400" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Main ── */}
      <div className="relative z-10 mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h1 className="mb-1 text-xl font-black text-white sm:text-2xl">Deposit Funds</h1>
          <p className="text-slate-500 text-sm mb-8">
            Enter the amount you want to send, use the USDT TRC20 address below, then chat with support — your balance is only credited after an agent confirms.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-100">
          Special offer: deposit from TRON and get up to 15% cash back.
        </motion.div>

        {/* Always-visible official TRC20 deposit address */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-400">
              <img src={LOGOS.USDT} alt="" className="h-5 w-5" />
              <img src={LOGOS.TRC20} alt="" className="h-5 w-5" />
              USDT · TRON (TRC20) Deposit Address
            </div>
            <a href={TRC20_EXPLORER} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300">
              View on Tronscan <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <img
              src={USDT_QR}
              alt="USDT TRC20 deposit QR code"
              className="h-40 w-40 shrink-0 rounded-xl border border-slate-800 bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-200 sm:text-sm">
                  {TRC20_ADDRESS}
                </code>
                <CopyBtn text={TRC20_ADDRESS} />
              </div>
              <p className="text-[11px] text-slate-500">
                Minimum deposit is ${MIN_DEPOSIT}. Send only USDT on the TRC20 network to this address. After sending, open live chat with your email and amount.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

          {/* ── LEFT PANEL ── */}
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="space-y-5">

            {/* Deposit type toggle */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-1 flex gap-1">
              {[{ id: "crypto", label: "Crypto", icon: <Wallet className="h-4 w-4" /> },
                { id: "fiat",   label: "Fiat / Card", icon: <CreditCard className="h-4 w-4" /> }
              ].map((t) => (
                <button key={t.id} onClick={() => { setDepositType(t.id); setFiatMethod(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
                    depositType === t.id
                      ? "bg-sky-500 text-black shadow-lg shadow-sky-500/25"
                      : "text-slate-400 hover:text-slate-300"
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {depositType === "crypto" ? (
                <motion.div key="crypto" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  className="space-y-5">

                  {/* Currency tabs */}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide mb-2 block">Select Currency</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CURRENCIES.map((c) => (
                        <motion.button key={c.sym} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => handleCurrencyChange(c.sym)}
                          className={`py-3 rounded-2xl border text-sm font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                            currency === c.sym
                              ? "border-sky-500/60 bg-sky-500/10 text-sky-400 shadow-lg shadow-sky-500/10"
                              : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                          }`}>
                          <img src={c.logo} alt="" className="h-7 w-7" />
                          <span className="text-xs">{c.sym}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Network selector */}
                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide mb-2 block">Network</label>
                    <div className="relative">
                      <button onClick={() => setShowNetDrop((p) => !p)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition cursor-pointer">
                        <div className="flex items-center gap-2">
                          {LOGOS[network.id] && <img src={LOGOS[network.id]} alt="" className="h-5 w-5" />}
                          <span className="text-white font-semibold text-sm">{network.label}</span>
                          <span className="text-slate-500 text-xs">· {network.note}</span>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showNetDrop ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence>
                        {showNetDrop && (
                          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            className="absolute top-full left-0 right-0 mt-1 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden z-20 shadow-2xl">
                            {NETWORKS[currency].map((net) => (
                              <button key={net.id} onClick={() => { setNetwork(net); setShowNetDrop(false); }}
                                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition cursor-pointer text-left ${network.id === net.id ? "bg-sky-500/5" : ""}`}>
                                <div className="flex items-center gap-2">
                                  {LOGOS[net.id] && <img src={LOGOS[net.id]} alt="" className="h-5 w-5" />}
                                  <div>
                                    <div className="text-white text-sm font-semibold">{net.label}</div>
                                    <div className="text-slate-500 text-xs">{net.note}</div>
                                  </div>
                                </div>
                                <div className="text-xs text-sky-400 font-bold">Fee: {net.fee}</div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Warning */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="flex items-start gap-3 p-4 rounded-2xl bg-sky-500/8 border border-sky-500/25">
                    <AlertTriangle className="h-4 w-4 text-sky-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-sky-200/80 leading-relaxed">
                      Only send <strong>{currency}</strong> on the <strong>{network.label}</strong> network. Sending the wrong asset or using the wrong network may result in permanent loss of funds.
                    </p>
                  </motion.div>

                  {/* Min deposit info */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: "Min Deposit", value: `$${MIN_DEPOSIT}` },
                      { label: "Deposit Fee",  value: network.fee },
                      { label: "Arrival Time", value: network.note.split("·").pop().trim() },
                    ].map((s) => (
                      <div key={s.label} className="rounded-2xl bg-slate-900/60 border border-slate-800 p-3">
                        <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">{s.label}</div>
                        <div className="text-sm font-bold text-white">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <div>
                      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Before you send</div>
                      <div className="space-y-3">
                        {[
                          `Send only ${currency} on ${network.label}`,
                          `Minimum $${MIN_DEPOSIT}. Smaller transfers stay uncredited`,
                          "Chat with support after sending so an agent can match the payment",
                        ].map((line, i) => (
                          <div key={line} className="flex items-start gap-3 text-sm text-slate-300">
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/15 text-[10px] font-black text-sky-400">{i + 1}</div>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-sm font-semibold text-sky-100">
                      Special offer: deposit from TRON and get up to 15% cash back.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Cash back</div>
                    <div className="space-y-2">
                      {CASHBACK_TIERS.map(({ amount, percent }) => (
                        <div key={amount} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm">
                          <span className="text-slate-400">Send {amount.toLocaleString()} USDT</span>
                          <span className="font-bold tabular-nums text-emerald-400">{percent}% · +{(amount * percent / 100).toLocaleString()} back</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      Support adds the cash back after they confirm the TRON transfer.
                    </p>
                  </div>
                </motion.div>

              ) : (
                <motion.div key="fiat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  className="space-y-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Select Payment Method</div>

                  {FIAT_METHODS.map((m, idx) => {
                    const Icon = m.icon;
                    const sel = fiatMethod?.id === m.id;
                    return (
                      <motion.button key={m.id} onClick={() => setFiatMethod(m)}
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.06 }}
                        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                        style={sel ? { boxShadow: `0 0 24px ${m.glow}` } : {}}
                        className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border transition cursor-pointer ${
                          sel
                            ? `bg-gradient-to-r ${m.accent === "amber" ? "from-sky-500/15 to-cyan-500/10 border-sky-500/50" : m.accent === "blue" ? "from-blue-500/15 to-cyan-500/10 border-blue-500/50" : "from-slate-500/15 to-slate-600/10 border-slate-500/50"}`
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                        }`}>
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          sel
                            ? m.accent === "amber" ? "bg-sky-500/20 text-sky-400" : m.accent === "blue" ? "bg-blue-500/20 text-blue-400" : "bg-slate-600/40 text-slate-300"
                            : "bg-slate-800 text-slate-400"
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-sm">{m.name}</span>
                            {m.recommended && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-sky-500 text-black uppercase tracking-wide">Recommended</span>
                            )}
                          </div>
                          <div className="text-slate-500 text-xs mt-0.5">{m.sub}</div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-lg">
                              <Clock className="h-2.5 w-2.5" /> {m.time}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                              m.fee === "0%" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"
                            }`}>
                              {m.fee === "0%" ? "No Fee" : `${m.fee} fee`}
                            </span>
                          </div>
                        </div>
                        {sel && <div className="h-5 w-5 rounded-full bg-sky-500 flex items-center justify-center flex-shrink-0">
                          <div className="h-2 w-2 rounded-full bg-black" />
                        </div>}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── RIGHT PANEL ── */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
            className="space-y-4">

            <AnimatePresence mode="wait">
              {depositType === "crypto" ? (
                <motion.div key="crypto-right" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-3xl bg-slate-950 border border-slate-800 overflow-hidden">
                  <div className="p-5 border-b border-slate-800">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 1 · Amount</div>
                    <div className="text-white font-bold">How much {currency} are you sending?</div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="relative">
                      <input type="number" min={MIN_DEPOSIT} value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={`${MIN_DEPOSIT}.00`}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-4 pr-20 py-4 text-white text-xl font-black outline-none focus:border-sky-500/50 transition tabular-nums"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">{currency}</span>
                    </div>
                    <p className={`text-xs ${amount && !amountMeetsMin ? "text-rose-400" : "text-slate-500"}`}>
                      Minimum deposit is ${MIN_DEPOSIT}.
                    </p>

                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                      {QUICK_AMOUNTS.map((v) => (
                        <motion.button key={v} whileTap={{ scale: 0.93 }}
                          onClick={() => setAmount(String(v))}
                          className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            Number(amount) === v
                              ? "bg-sky-500/20 border-sky-500/50 text-sky-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}>{v >= 1000 ? `${v / 1000}k` : v}</motion.button>
                      ))}
                    </div>
                  </div>

                  {!cryptoAmountOk ? (
                    <div className="border-t border-slate-800 px-5 py-10 text-center">
                      <Lock className="mx-auto mb-3 h-5 w-5 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-400">Enter at least ${MIN_DEPOSIT}</p>
                      <p className="mx-auto mt-1 max-w-xs text-xs text-slate-600">
                        The deposit address unlocks once the amount meets the minimum.
                      </p>
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-slate-800">
                      <div className="px-5 pt-5">
                        <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Step 2 · Deposit Address</div>
                        <div className="text-white font-bold">{currency} · {network.label}</div>
                      </div>

                      {/* QR Code — user-supplied TRON deposit image */}
                      <div className="flex flex-col items-center py-6 px-5 gap-5">
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
                          <img src={network.qr} alt={`${currency} TRON (TRC20) deposit QR code`} className="h-[180px] w-[180px] rounded-2xl bg-white object-contain p-3 shadow-xl shadow-black/40" />
                        </motion.div>

                        {/* Address display */}
                        <div className="w-full space-y-2">
                          <div className="text-xs text-slate-500 text-center">
                            {network.address ? "Scan QR or copy address below" : "Scan the QR for this asset"}
                          </div>
                          {network.address && (
                            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-3">
                              <code className="flex-1 text-xs text-slate-300 break-all leading-relaxed font-mono">{network.address}</code>
                              <div className="flex-shrink-0">
                                <CopyBtn text={network.address} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Steps */}
                        <div className="w-full space-y-2">
                          {[
                            "Open your external wallet or exchange",
                            network.address
                              ? `Send ${Number(amount)} ${currency} to the address above`
                              : `Send ${Number(amount)} ${currency} using the QR above`,
                            "Chat with support — an agent credits your balance after confirming",
                          ].map((step, i) => (
                            <div key={i} className="flex items-start gap-3 text-xs text-slate-400">
                              <div className="h-5 w-5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-400 font-black text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>

                        {/* Live chat — no auto request / pending page */}
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          onClick={openDepositChat}
                          className="w-full py-3.5 rounded-2xl bg-sky-500 text-black font-black text-sm hover:bg-sky-400 transition shadow-lg shadow-sky-500/25 cursor-pointer flex items-center justify-center gap-2">
                          <MessageCircle className="h-4 w-4" /> Chat with Support Agent
                        </motion.button>
                        <p className="text-center text-[11px] text-slate-500">
                          Tell the agent your login email and the amount you sent. Balance is credited only after confirmation.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>

              ) : (
                <motion.div key="fiat-right" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-3xl bg-slate-950 border border-slate-800 overflow-hidden">
                  <div className="p-5 border-b border-slate-800">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Amount</div>
                    <div className="text-white font-bold">{fiatMethod ? fiatMethod.name : "Select a method"}</div>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Amount input */}
                    <div>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                        <input type="number" min={MIN_DEPOSIT} value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder={`${MIN_DEPOSIT}.00`}
                          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-8 pr-16 py-4 text-white text-xl font-black outline-none focus:border-sky-500/50 transition tabular-nums"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">USD</span>
                      </div>
                      <p className={`mt-2 text-xs ${amount && !amountMeetsMin ? "text-rose-400" : "text-slate-500"}`}>
                        Minimum deposit is ${MIN_DEPOSIT}.
                      </p>
                    </div>

                    {/* Quick amounts */}
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                      {QUICK_AMOUNTS.map((v) => (
                        <motion.button key={v} whileTap={{ scale: 0.93 }}
                          onClick={() => setAmount(String(v))}
                          className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            Number(amount) === v
                              ? "bg-sky-500/20 border-sky-500/50 text-sky-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}>${v >= 1000 ? `${v / 1000}k` : v}</motion.button>
                      ))}
                    </div>

                    {/* Fee breakdown */}
                    {fiatMethod && Number(amount) > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-2.5">
                        {[
                          { label: "You deposit",  value: `$${Number(amount).toFixed(2)}`,                       color: "text-white"        },
                          { label: `Fee (${fiatMethod.fee})`, value: `- $${feeAmt}`,                             color: "text-rose-400"     },
                          { label: "You receive",  value: `$${receiveAmt}`,                                      color: "text-emerald-400"  },
                          { label: "Rate",         value: "1 USD = 1 USDT",                                      color: "text-slate-400"    },
                        ].map((r) => (
                          <div key={r.label} className="flex justify-between text-sm">
                            <span className="text-slate-500">{r.label}</span>
                            <span className={`font-bold tabular-nums ${r.color}`}>{r.value}</span>
                          </div>
                        ))}
                        <div className="border-t border-slate-800 pt-2.5 flex justify-between text-sm">
                          <span className="text-slate-300 font-semibold">Total in USDT</span>
                          <span className="text-white font-black">{receiveAmt} USDT</span>
                        </div>
                      </motion.div>
                    )}

                    {/* Risk agreement */}
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <div
                        onClick={() => setAgreedRisk((p) => !p)}
                        className={`mt-0.5 h-4 w-4 rounded flex items-center justify-center flex-shrink-0 border transition cursor-pointer ${
                          agreedRisk ? "bg-sky-500 border-sky-500" : "border-slate-700 bg-slate-900"
                        }`}>
                        {agreedRisk && <div className="h-2 w-2 rounded-sm bg-black" />}
                      </div>
                      <span className="text-xs text-slate-500 leading-relaxed">
                        I confirm this deposit and agree to Bitloom's{" "}
                        <span className="text-sky-400">Terms of Service</span> and{" "}
                        <span className="text-sky-400">Privacy Policy</span>.
                      </span>
                    </label>

                    {/* Continue */}
                    <motion.button
                      whileHover={canContinue ? { scale: 1.02 } : {}}
                      whileTap={canContinue ? { scale: 0.98 } : {}}
                      onClick={handleContinue}
                      disabled={!canContinue}
                      className={`w-full py-4 rounded-2xl font-black text-sm transition cursor-pointer ${
                        canContinue
                          ? "bg-sky-500 text-black hover:bg-sky-400 shadow-lg shadow-sky-500/25"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      }`}>
                      {!fiatMethod ? "Select a payment method" : !Number(amount) ? "Enter an amount" : !agreedRisk ? "Agree to terms" : "Chat with Support Agent →"}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Trust badges */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="grid grid-cols-3 gap-2">
              {[
                { icon: Shield, label: "Bank-grade", sub: "256-bit SSL", color: "text-emerald-400" },
                { icon: Lock,   label: "Encrypted",  sub: "End-to-end",  color: "text-blue-400"    },
                { icon: Globe,  label: "Global",      sub: "100+ banks",  color: "text-sky-400"   },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.label} className="rounded-2xl bg-slate-950 border border-slate-800 p-3 text-center">
                    <Icon className={`h-4 w-4 ${t.color} mx-auto mb-1.5`} />
                    <div className="text-white text-xs font-bold">{t.label}</div>
                    <div className="text-slate-600 text-[10px]">{t.sub}</div>
                  </div>
                );
              })}
            </motion.div>

            {/* Info notice */}
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>Send funds to the address shown, then chat with support. Balance is never auto-credited — an agent confirms every deposit.</span>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
