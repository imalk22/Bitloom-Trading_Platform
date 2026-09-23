import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, CheckCircle2, Shield,
  CreditCard, Building2, Smartphone, ChevronRight,
  Lock, MessageCircle,
} from "lucide-react";
import { openSupportChat } from "../components/chat/ChatWidget.jsx";

const METHOD_ICONS = {
  "Credit / Debit Card":   CreditCard,
  "Bank Transfer (SWIFT)": Building2,
  "Apple Pay":             Smartphone,
};

export default function CheckoutPage() {
  const { state }  = useLocation();
  const navigate   = useNavigate();
  const amount     = state?.amount   ?? "0";
  const method     = state?.method   ?? "Credit / Debit Card";
  const fee        = state?.fee      ?? "0.00";
  const receive    = state?.receive  ?? amount;
  const currency   = state?.currency ?? "USDT";

  const MethodIcon = METHOD_ICONS[method] ?? CreditCard;

  const openChat = () => {
    openSupportChat(
      `Hi, I want to deposit $${Number(amount).toFixed(2)} USD via ${method} (receive ~${receive} ${currency}). Please help me complete this.`
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col items-center justify-center p-4"
      style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(14,165,233,0.05) 1px,transparent 0)", backgroundSize: "40px 40px" }}>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-sky-500/[0.04] blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10">

        <button onClick={() => navigate("/deposit")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition text-sm mb-6 cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back to Deposit
        </button>

        <div className="rounded-3xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl shadow-black/50">

          <div className="border-b border-sky-500/20 bg-gradient-to-r from-sky-500/15 to-cyan-500/10 px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-1 flex items-center gap-3">
              <img src="/bitloom-logo.png" alt="Bitloom" className="h-10 w-10 rounded-2xl object-cover ring-1 ring-sky-400/30" />
              <div>
                <div className="font-black text-white">Deposit Summary</div>
                <div className="text-xs text-sky-400/70">Chat with support to complete — nothing is auto-credited</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="text-center py-4">
              <div className="text-3xl font-black tabular-nums text-white sm:text-4xl">${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
              <div className="text-slate-500 text-sm mt-1">USD via {method}</div>
            </motion.div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 divide-y divide-slate-800">
              {[
                { label: "Payment Method", value: method, icon: <MethodIcon className="h-3.5 w-3.5 text-slate-400" /> },
                { label: "Amount",         value: `$${Number(amount).toFixed(2)} USD`,         icon: null },
                { label: "Processing Fee", value: `- $${fee}`,                                  icon: null, color: "text-rose-400" },
                { label: "You Receive",    value: `${receive} ${currency}`,                     icon: null, color: "text-emerald-400 font-black" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    {r.icon}
                    {r.label}
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${r.color ?? "text-white"}`}>{r.value}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-sky-500/8 border border-sky-500/20">
              <MessageCircle className="h-4 w-4 text-sky-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-sky-200/80 leading-relaxed">
                Open live chat and tell the agent your login email and amount. Your balance is credited only after support confirms payment.
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-1"><Shield className="h-3 w-3" /> Secured</div>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1"><Lock className="h-3 w-3" /> Encrypted</div>
              <div className="h-3 w-px bg-slate-800" />
              <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</div>
            </div>

            <div className="space-y-3">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={openChat}
                className="w-full py-4 rounded-2xl bg-sky-500 text-black font-black text-sm hover:bg-sky-400 transition shadow-lg shadow-sky-500/25 cursor-pointer flex items-center justify-center gap-2">
                Chat with Support Agent <ChevronRight className="h-4 w-4" />
              </motion.button>
              <button onClick={() => navigate("/")}
                className="w-full py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 font-semibold text-sm hover:border-slate-700 hover:text-slate-300 transition cursor-pointer">
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
