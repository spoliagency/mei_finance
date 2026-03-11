import { useState, useMemo, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, Cell, PieChart, Pie } from 'recharts';
import { supabase } from "./supabase";
import AuthPage from "./AuthPage";

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDate = (v) => v ? v.split("-").reverse().join("/") : "";
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIAS_VENDAS_DEFAULT = [
  { label: "Serviço prestado", icon: "💼" }, { label: "Produto vendido", icon: "📦" },
  { label: "Consultoria", icon: "🎯" }, { label: "Comissão", icon: "💰" },
  { label: "Marketing", icon: "📣" }, { label: "Outro serviço", icon: "📂" },
];
const CATEGORIAS_PJ_DEFAULT = [
  { label: "Ferramentas / SaaS", icon: "🛠" }, { label: "Marketing", icon: "📣" },
  { label: "Impostos / DAS", icon: "🧾" }, { label: "Educação", icon: "📚" },
  { label: "Equipamento", icon: "💻" }, { label: "Outro PJ", icon: "📂" },
];
const CATEGORIAS_PF_DEFAULT = [
  { label: "Alimentação", icon: "🍔" }, { label: "Moradia", icon: "🏠" },
  { label: "Transporte", icon: "🚗" }, { label: "Lazer", icon: "🎭" },
  { label: "Saúde", icon: "🏥" }, { label: "Educação", icon: "🎓" },
  { label: "Compras", icon: "🛍️" }, { label: "Streaming", icon: "📺" },
  { label: "Investimentos", icon: "📈" }, { label: "Outros", icon: "📦" },
];
const METODOS = ["PIX", "Cartão Crédito", "Cartão Débito", "Boleto", "Dinheiro", "Transferência"];
const RECORRENCIAS = ["Único", "Mensal", "Anual"];
const BANCOS_DEFAULT = [
  { nome: "Nubank", color: "#8a05be", icon: "🟣" },
  { nome: "Itaú", color: "#ff7000", icon: "🟧" },
  { nome: "Bradesco", color: "#cc092f", icon: "🟥" },
  { nome: "Santander", color: "#ec0000", icon: "🔴" },
  { nome: "Banco do Brasil", color: "#fcfc30", icon: "🟡" },
  { nome: "Caixa", color: "#005ca9", icon: "🔵" },
  { nome: "Inter", color: "#ff7a00", icon: "🟠" },
  { nome: "C6 Bank", color: "#212121", icon: "⚫" },
  { nome: "XP Investimentos", color: "#000000", icon: "🟡" },
  { nome: "BTG Pactual", color: "#001e62", icon: "🔵" }
];
const CAT_COLORS = {
  "Serviço prestado": "#6366f1", "Produto vendido": "#8b5cf6", "Consultoria": "#a855f7", "Comissão": "#d946ef",
  "Ferramentas / SaaS": "#06b6d4", "Marketing": "#f97316", "Impostos / DAS": "#ef4444", "Educação": "#10b981",
  "Equipamento": "#3b82f6", "Outro PJ": "#64748b",
  "Alimentação": "#f59e0b", "Moradia": "#6366f1", "Transporte": "#3b82f6", "Lazer": "#10b981",
  "Saúde": "#ec4899", "Compras": "#f97316", "Streaming": "#a855f7",
  "Investimentos": "#14b8a6", "Outros": "#94a3b8",
};
const STATUS_STYLE = {
  recebido: { bg: "#052e16", border: "#166534", color: "#4ade80", label: "Recebido" },
  pago: { bg: "#052e16", border: "#166534", color: "#4ade80", label: "Pago" },
  pendente: { bg: "#1c1400", border: "#713f12", color: "#facc15", label: "Pendente" },
  cancelado: { bg: "#1f0a0a", border: "#7f1d1d", color: "#f87171", label: "Cancelado" },
};

window.meiConfig = { isDirty: false, save: null };

const EMPTY_DESPESA = { descricao: "", categoria: "Ferramentas / SaaS", metodo: "PIX", valor: "", data: today(), recorrencia: "Único", status: "pago", obs: "" };
const EMPTY_GASTO = { descricao: "", categoria: "Alimentação", metodo: "PIX", valor: "", data: today(), recorrencia: "Único", status: "pago", obs: "" };
const EMPTY_VENDA = { descricao: "", cliente: "", categoria: "Serviço prestado", metodo: "PIX", faturamento: "", taxas: [{ label: "Taxa plataforma", value: "", type: "pct" }], data: today(), status: "recebido", nf: false, obs: "" };
const EMPTY_RESERVA = { valor: "", banco: "", data: today(), obs: "" };

function calcLiquido(faturamento, taxas) {
  // Se for numero (banco), usa direto. Se for string (input), desmascara.
  const fat = typeof faturamento === "number" ? faturamento : unmaskCurrency(maskCurrency(faturamento));
  let totalDeducao = 0;
  let totalPct = 0;

  (Array.isArray(taxas) ? taxas : []).forEach(t => {
    // Lógica para o valor da taxa (seja fixo ou base para pct)
    const rawVal = t.value ?? t.pct ?? 0;
    const val = typeof rawVal === "number" ? rawVal : unmaskCurrency(maskCurrency(rawVal));

    if (t.type === "fixed") {
      totalDeducao += val;
    } else {
      // Se for porcentagem, vira float puro (ex: 5 para 5%)
      const p = parseFloat(rawVal) || 0;
      totalPct += p;
      totalDeducao += fat * (p / 100);
    }
  });

  return { fat, totalPct, totalDeducao, liquido: fat - totalDeducao };
}

function inDateRange(dateStr, range) {
  if (!range.from && !range.to) return true;
  const d = new Date(dateStr + "T00:00:00");
  if (range.from && d < new Date(range.from + "T00:00:00")) return false;
  if (range.to && d > new Date(range.to + "T23:59:59")) return false;
  return true;
}

function setQuickRange(preset, setRange) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (preset === "mes") {
    setRange({ from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: today() });
  } else if (preset === "anterior") {
    const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
    const last = new Date(y, m, 0).getDate();
    setRange({ from: `${py}-${String(pm + 1).padStart(2, "0")}-01`, to: `${py}-${String(pm + 1).padStart(2, "0")}-${last}` });
  } else if (preset === "ano") {
    setRange({ from: `${y}-01-01`, to: today() });
  } else {
    setRange({ from: "", to: "" });
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconEye = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const IconEdit = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IconTrash = () => <svg width="15" height="15" fill="none" stroke="#e05" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const IconSettings = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
const IconBell = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
const IconClose = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IconBusiness = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M3 21h18" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /><path d="M14 8h1" /><path d="M14 12h1" /><path d="M14 16h1" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /></svg>;
const IconUser = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IconChart = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>;
const IconTrendingUp = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
const IconPie = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>;
const IconClock = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconTarget = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
const IconDashboard = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>;
const IconList = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
const IconReport = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
const IconExport = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IconLogout = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
const IconBank = ({ size = 20 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M7 10v11M11 10v11M15 10v11M19 10v11" /></svg>;
const IconSafe = ({ size = 20 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9v6M9 12h6" /></svg>;
const IconSun = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>;
const IconMoon = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --bg: #f5f2ed;
    --card: #ffffff;
    --text: #1a1a1a;
    --text-muted: #666;
    --text-dim: #aaa;
    --border: #e8e5e0;
    --input-bg: #ffffff;
    --sidebar-bg: #faf9f7;
    --sidebar-active: #1a1a1a;
    --sidebar-active-text: #f5f2ed;
    --row-hover: #faf9f7;
    --modal-bg: #ffffff;
    --divider: #e8e5e0;
    --filter-btn-border: #d0cdc8;
    --tag-bg: #faf9f7;
  }

  .dark {
    --bg: #111111;
    --card: #1a1a1a;
    --text: #f5f2ed;
    --text-muted: #aaa;
    --text-dim: #666;
    --border: #2a2a2a;
    --input-bg: #222222;
    --sidebar-bg: #141414;
    --sidebar-active: #f5f2ed;
    --sidebar-active-text: #1a1a1a;
    --row-hover: #222222;
    --modal-bg: #1a1a1a;
    --divider: #2a2a2a;
    --filter-btn-border: #333333;
    --tag-bg: #222222;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); transition: background 0.2s, color 0.2s; }
  
  .input { background: var(--input-bg); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px; color: var(--text); font-family: 'Syne', sans-serif; font-size: 13px; outline: none; width: 100%; transition: border 0.15s; }
  .input:focus { border-color: var(--text); }
  select.input option { background: var(--input-bg); color: var(--text); }
  
  .btn { border: none; border-radius: 10px; padding: 10px 18px; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn-dark { background: var(--text); color: var(--bg); }
  .btn-dark:hover { opacity: 0.8; }
  
  .btn-outline { background: transparent; border: 1.5px solid var(--filter-btn-border); color: var(--text-muted); }
  .btn-outline:hover { border-color: var(--text); color: var(--text); }
  
  .btn-danger { background: #fff0f0; color: #c0392b; border: 1.5px solid #fcc; }
  .dark .btn-danger { background: #2d1a1a; border-color: #552222; }
  
  .btn-green { background: #052e16; color: #4ade80; border: 1px solid #166534; }
  
  .btn-icon { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 8px; transition: background 0.15s; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
  .btn-icon:hover { background: var(--row-hover); color: var(--text); }
  
  .card { background: var(--card); border-radius: 16px; border: 1px solid var(--border); transition: background 0.2s, border 0.2s; }
  
  .tag { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; border: 1px solid; white-space: nowrap; min-width: 56px; }
  
  .row-hover:hover { background: var(--row-hover); }
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: var(--modal-bg); border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25); border: 1px solid var(--border); }
  
  .divider { height: 1px; background: var(--divider); }
  
  .filter-btn { padding: 7px 13px; border-radius: 8px; border: 1.5px solid var(--filter-btn-border); cursor: pointer; font-size: 12px; font-weight: 600; font-family: 'Syne', sans-serif; transition: all 0.15s; background: transparent; color: var(--text-muted); }
  

  /* Esconde setas de inputs de número */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  ::-webkit-scrollbar { width: 4px; } 
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* ── Mobile Optimization ── */
  html, body { overflow-x: hidden; }
  @media (max-width: 768px) {
    .hide-mobile { display: none !important; }
    .show-mobile { display: flex !important; }
    .mobile-px { padding-left: 12px !important; padding-right: 12px !important; }
    .mobile-stack { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
    .mobile-header { height: auto !important; padding: 12px 16px !important; flex-direction: column !important; align-items: start !important; gap: 12px !important; }
    .mobile-header > div { width: 100%; justify-content: space-between !important; }
    
    .mobile-nav { 
      position: fixed; bottom: 0; left: 0; right: 0; height: 64px; 
      background: var(--card); border-top: 1px solid var(--border); 
      display: flex !important; justify-content: space-around; align-items: center; 
      z-index: 100; box-shadow: 0 -4px 20px rgba(0,0,0,0.05);
    }
    .modal { border-radius: 16px 16px 0 0; max-height: 92vh; height: auto; }
    .modal-overlay { padding: 0; align-items: flex-end; }
    .main-container { padding: 16px 12px 80px !important; }

    /* Summary Cards: 2 columns forced */
    .mobile-summary-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }

    /* Hiding secondary info on mobile to simplify */
    .hide-mobile-soft { display: none !important; }

    /* Search & filters: full width, scrollable */
    .mobile-search-row { flex-direction: column !important; gap: 10px !important; display: flex !important; }
    .mobile-search-row input { max-width: 100% !important; width: 100% !important; }
    .mobile-filter-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap !important; padding-bottom: 4px; }
    .mobile-filter-scroll::-webkit-scrollbar { display: none; }
    .mobile-filter-scroll .filter-btn { flex-shrink: 0; }

    /* Date filter: stack on mobile */
    .mobile-date-row { flex-wrap: wrap !important; }
    .mobile-date-row input[type="date"] { width: 100% !important; flex: 1; min-width: 0; }

    /* CatGrid: 3 columns */
    .mobile-cat-grid { grid-template-columns: repeat(3, 1fr) !important; }

    /* Welcome title smaller */
    .mobile-welcome-title { font-size: 20px !important; }

    /* Record table card view */
    .mobile-record-card {
      display: flex !important;
      flex-direction: column;
      padding: 14px 16px !important;
      gap: 8px;
      border-bottom: 1px solid var(--divider);
    }
    .mobile-record-card:last-child { border-bottom: none; }
    .mobile-record-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .mobile-record-field-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .mobile-record-field-value {
      text-align: right;
      min-width: 0;
    }
    .mobile-record-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      padding-top: 6px;
      border-top: 1px solid var(--divider);
    }

    /* Config page: stack vertically */
    .mobile-config-wrapper {
      flex-direction: column !important;
      min-height: auto !important;
    }
    .mobile-config-sidebar {
      width: 100% !important;
      border-right: none !important;
      border-bottom: 1px solid var(--border);
      padding: 16px 0 0 !important;
    }
    .mobile-config-sidebar nav {
      display: flex !important;
      flex-direction: row !important;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      gap: 4px !important;
      padding: 0 12px 12px !important;
    }
    .mobile-config-sidebar nav button {
      flex-shrink: 0 !important;
      white-space: nowrap !important;
      padding: 8px 14px !important;
      font-size: 12px !important;
    }
    .mobile-config-content {
      padding: 20px 16px !important;
    }
    .mobile-config-footer { display: none !important; }

    /* Top-bar mobile PJ/PF switcher */
    .mobile-context-switch {
      display: flex !important;
      background: #2a2a2a;
      border-radius: 8px;
      padding: 3px;
      gap: 2px;
    }
    .mobile-context-switch button {
      padding: 6px 14px;
      border-radius: 6px;
      border: none;
      font-size: 11px;
      font-weight: 700;
      font-family: 'Syne', sans-serif;
      cursor: pointer;
      transition: all 0.15s;
    }

    /* Dashboard stat cards scroll */
    .mobile-stat-scroll {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      flex-wrap: nowrap !important;
    }
    .mobile-stat-scroll::-webkit-scrollbar { display: none; }
    .mobile-stat-scroll > div { flex-shrink: 0 !important; }
    .mobile-chart-grid { display: grid !important; grid-template-columns: 1fr !important; }
  }
  
  .toast { position: fixed; bottom: 32px; right: 32px; background: #1a1a1a; color: #f5f2ed; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 13px; z-index: 9999; animation: slideUp 0.3s ease-out, fadeOut 0.3s ease-in 2s forwards; box-shadow: 0 10px 40px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @media (min-width: 769px) {
    .mobile-nav { display: none !important; }
  }

  /* ── Sidebar & Layout ── */
  .app-layout {
    display: flex;
    min-height: calc(100vh - 64px);
  }
  .top-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 64px;
    background: #1a1a1a;
    z-index: 100;
    display: flex;
    align-items: center;
    padding: 0 24px;
    border-bottom: 1px solid #2a2a2a;
  }
  .sidebar {
    width: 240px;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 64px;
    left: 0;
    bottom: 0;
    z-index: 40;
    transition: background 0.2s, border 0.2s;
  }
  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    font-family: 'Syne', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    color: var(--text-muted);
    border: none;
    background: none;
    width: 100%;
    text-align: left;
  }
  .sidebar-nav-item:hover {
    background: var(--row-hover);
    color: var(--text);
  }
  .sidebar-nav-item.active {
    background: var(--sidebar-active);
    color: var(--sidebar-active-text);
  }
  .sidebar-section-label {
    font-size: 10px;
    font-weight: 800;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 16px 16px 6px;
  }
  .app-content {
    flex: 1;
    margin-left: 240px;
    padding-top: 64px;
  }
  @media (max-width: 768px) {
    .sidebar { display: none !important; }
    .app-content { margin-left: 0 !important; }
    .top-bar { padding: 0 16px; }
  }
`;


// ─── Currency Helpers ────────────────────────────────────────────────────────
// Converte float (275.5) para string de digitos (27550) para os inputs com mascara
const toDigits = (val) => {
  if (val === null || val === undefined || val === "") return "";
  return String(Math.round(Number(val) * 100));
};

const maskCurrency = (val) => {
  if (val === null || val === undefined || val === "") return "";
  let v = String(val);

  // Se for numero ou string de float (ex: 275 ou "275.0"), normaliza para centavos
  if (typeof val === "number" || (v.includes(".") && !v.includes(","))) {
    v = (Number(v) * 100).toFixed(0);
  }

  v = v.replace(/\D/g, "");
  v = (Number(v) / 100).toFixed(2);
  return v.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
};

const unmaskCurrency = (val) => {
  if (!val) return 0;
  return Number(String(val).replace(/\./g, "").replace(",", "."));
};

// ─── Label helper ─────────────────────────────────────────────────────────────
const lbl = (text) => (
  <label style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>{text}</label>
);

// ─── Date Filter Bar ──────────────────────────────────────────────────────────
function DateFilterBar({ range, setRange }) {
  const [active, setActive] = useState("mes");
  const presets = [["mes", "Este mês"], ["anterior", "Mês anterior"], ["ano", "Este ano"], ["custom", "Personalizado"]];
  const pick = (p) => { setActive(p); if (p !== "custom") setQuickRange(p, setRange); };
  return (
    <div className="mobile-date-row mobile-filter-scroll" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {presets.map(([k, l]) => (
        <button key={k} className="filter-btn" onClick={() => pick(k)}
          style={{
            borderColor: active === k ? "var(--text)" : "var(--filter-btn-border)",
            background: active === k ? "var(--text)" : "transparent",
            color: active === k ? "var(--bg)" : "var(--text-muted)"
          }}>
          {l}
        </button>
      ))}
      {active === "custom" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" className="input" style={{ width: 145 }} value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
          <span style={{ color: "#aaa", fontSize: 12 }}>até</span>
          <input type="date" className="input" style={{ width: 145 }} value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        </div>
      )}
    </div>
  );
}

// ─── Category Grid (read-only, for PF) ───────────────────────────────────────
function CatGrid({ cats, value, onChange }) {
  return (
    <div className="mobile-cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
      {cats.map(c => (
        <button key={c.label} onClick={() => onChange(c.label)}
          style={{
            padding: "8px 4px", borderRadius: 10, border: "1.5px solid", cursor: "pointer", fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 600, transition: "all 0.15s", textAlign: "center",
            background: value === c.label ? "var(--bg)" : "transparent",
            borderColor: value === c.label ? (CAT_COLORS[c.label] || "var(--text-muted)") : "var(--border)",
            color: value === c.label ? "var(--text)" : "var(--text-dim)"
          }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>{c.icon}</div>
          <div style={{ lineHeight: 1.2, fontSize: 10 }}>{c.label}</div>
        </button>
      ))}
    </div>
  );
}

// ─── Category Grid Editable (for PJ despesas) ────────────────────────────────
const EMOJI_OPTIONS = [
  "💼", "📦", "🎯", "💰", "🛠", "📣", "🧾", "📚", "💻", "📂", "🏷", "🔧", "📊", "🖨", "🚀", "💡", "🎨", "🗂", "📱", "🌐", "🔑", "🏗", "✂️", "📐", "🧩",
  "🍱", "🍕", "🥤", "🛒", "🛍️", "⛽", "🎟️", "🎭", "🏥", "💊", "🏋️", "✈️", "🏠", "⚡", "💧", "📞", "📡", "🧹", "🧺", "🐈", "🐶", "👶", "🎁", "💖",
  "📈", "📉", "🏦", "💳", "💱", "💎", "🛡️", "⚖️", "📅", "📝", "✅", "⚠️", "🆘", "🔒", "🔓"
];
const COLOR_OPTIONS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#06b6d4", "#f97316", "#ef4444", "#10b981", "#3b82f6", "#64748b", "#f59e0b", "#ec4899", "#14b8a6", "#84cc16", "#f43f5e"];

function CatGridEditable({ cats, value, onChange, onCatsChange }) {
  const [editMode, setEditMode] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null); // null = adding new
  const [form, setForm] = useState({ label: "", icon: "💼", color: "#6366f1" });
  const [showForm, setShowForm] = useState(false);

  const openAdd = () => { setForm({ label: "", icon: "💼", color: "#6366f1" }); setEditingIdx(null); setShowForm(true); };
  const openEdit = (idx) => { setForm({ label: cats[idx].label, icon: cats[idx].icon, color: CAT_COLORS[cats[idx].label] || "#6366f1" }); setEditingIdx(idx); setShowForm(true); };
  const saveForm = () => {
    if (!form.label.trim()) return;
    const newCat = { label: form.label.trim(), icon: form.icon };
    const newColors = { ...CAT_COLORS, [form.label.trim()]: form.color };
    Object.assign(CAT_COLORS, newColors);
    if (editingIdx === null) {
      onCatsChange([...cats, newCat]);
      onChange(newCat.label);
    } else {
      const updated = cats.map((c, i) => i === editingIdx ? newCat : c);
      onCatsChange(updated);
      if (value === cats[editingIdx].label) onChange(newCat.label);
    }
    setShowForm(false);
  };
  const deleteCat = (idx) => {
    const updated = cats.filter((_, i) => i !== idx);
    onCatsChange(updated);
    if (value === cats[idx].label && updated.length > 0) onChange(updated[0].label);
  };

  return (
    <div>
      <div className="mobile-cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 8 }}>
        {cats.map((c, i) => (
          <div key={c.label} style={{ position: "relative" }}>
            <button onClick={() => !editMode && onChange(c.label)}
              style={{
                width: "100%", padding: "8px 4px", borderRadius: 10, border: "1.5px solid", cursor: "pointer", fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 600, transition: "all 0.15s", textAlign: "center",
                background: !editMode && value === c.label ? "#f5f2ed" : "transparent",
                borderColor: !editMode && value === c.label ? (CAT_COLORS[c.label] || "#888") : editMode ? "#d0cdc8" : "#e0ddd8",
                color: !editMode && value === c.label ? (CAT_COLORS[c.label] || "#888") : "#aaa",
                opacity: editMode ? 0.7 : 1
              }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{c.icon}</div>
              <div style={{ lineHeight: 1.2, fontSize: 10 }}>{c.label}</div>
            </button>
            {editMode && (
              <div style={{ position: "absolute", top: -6, right: -6, display: "flex", gap: 2 }}>
                <button onClick={() => openEdit(i)} style={{ width: 18, height: 18, borderRadius: 4, background: "#6366f1", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="9" height="9" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button onClick={() => deleteCat(i)} style={{ width: 18, height: 18, borderRadius: 4, background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="9" height="9" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )}
          </div>
        ))}
        {/* Add new tile */}
        <button onClick={openAdd}
          style={{ padding: "8px 4px", borderRadius: 10, border: "1.5px dashed #d0cdc8", cursor: "pointer", background: "transparent", textAlign: "center", transition: "all 0.15s", color: "#bbb" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#1a1a1a"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#d0cdc8"}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>+</div>
          <div style={{ lineHeight: 1.2, fontSize: 10, fontFamily: "'Syne',sans-serif", fontWeight: 600 }}>Nova</div>
        </button>
      </div>

      {/* Edit mode toggle */}
      <button onClick={() => setEditMode(m => !m)}
        style={{ fontSize: 11, fontWeight: 700, color: editMode ? "#6366f1" : "#aaa", background: editMode ? "#ede9fe" : "transparent", border: editMode ? "1px solid #c4b5fd" : "1px solid transparent", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "'Syne',sans-serif", transition: "all 0.15s" }}>
        {editMode ? "✓ Concluir edição" : "✎ Editar categorias"}
      </button>

      {/* Add/Edit form inline */}
      {showForm && (
        <div style={{ marginTop: 12, background: "var(--sidebar-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{editingIdx === null ? "Nova categoria" : "Editar categoria"}</div>
          <input className="input" placeholder="Nome da categoria" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Ícone</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 16,
                    background: form.icon === e ? "var(--text)" : "rgba(255,255,255,0.05)",
                    borderColor: form.icon === e ? "var(--text)" : "var(--divider)",
                    transition: "all 0.1s"
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Cor</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: 24, height: 24, borderRadius: 6, border: form.color === c ? "2.5px solid #1a1a1a" : "2px solid transparent", cursor: "pointer", background: c, transition: "all 0.1s" }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
            <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CRUD Table ───────────────────────────────────────────────────────────────
function RecordTable({ records, columns, onView, onEdit, onDelete, emptyMsg }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        {records.length === 0 && <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-dim)", fontSize: 13 }}>{emptyMsg}</div>}
        {records.map((r, idx) => (
          <div key={r.id} className="mobile-record-card row-hover">
            {columns.map(c => (
              <div key={c.label} className="mobile-record-field">
                <div className="mobile-record-field-label">{c.label}</div>
                <div className="mobile-record-field-value" style={{ minWidth: 0 }}>{c.render(r)}</div>
              </div>
            ))}
            <div className="mobile-record-actions">
              <button className="btn-icon" onClick={() => onView(r)}><IconEye /></button>
              <button className="btn-icon" onClick={() => onEdit(r)}><IconEdit /></button>
              <button className="btn-icon" onClick={() => onDelete(r.id)}><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", margin: "0 -4px" }}>
      <div className="card" style={{ overflow: "hidden", minWidth: 600 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: columns.map(c => c.w).join(" ") + " 88px", padding: "10px 20px", background: "var(--sidebar-bg)", borderBottom: "1px solid var(--divider)", alignItems: "center" }}>
          {[...columns.map(c => c.label), ""].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h}</div>
          ))}
        </div>
        {records.length === 0 && <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-dim)", fontSize: 13 }}>{emptyMsg}</div>}
        {records.map((r, idx) => (
          <div key={r.id} className="row-hover" style={{ display: "grid", gridTemplateColumns: columns.map(c => c.w).join(" ") + " 88px", padding: "0 20px", minHeight: 56, borderBottom: idx < records.length - 1 ? "1px solid var(--divider)" : "none", alignItems: "center", transition: "background 0.1s" }}>
            {columns.map(c => <div key={c.label} style={{ minWidth: 0 }}>{c.render(r)}</div>)}
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexShrink: 0 }}>
              <button className="btn-icon" onClick={() => onView(r)}><IconEye /></button>
              <button className="btn-icon" onClick={() => onEdit(r)}><IconEdit /></button>
              <button className="btn-icon" onClick={() => onDelete(r.id)}><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Config Page ──────────────────────────────────────────────────────────────
function CatManager({ cats, setCats }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", icon: "💼", color: "#6366f1" });

  const openAdd = () => { setForm({ label: "", icon: "💼", color: "#6366f1" }); setEditingIdx(null); setShowForm(true); };
  const openEdit = (i) => { const c = cats[i]; setForm({ label: c.label, icon: c.icon, color: CAT_COLORS[c.label] || "#6366f1" }); setEditingIdx(i); setShowForm(true); };
  const saveForm = () => {
    if (!form.label.trim()) return;
    const newCat = { label: form.label.trim(), icon: form.icon };
    CAT_COLORS[form.label.trim()] = form.color;

    let next;
    if (editingIdx === null) {
      next = [...cats, newCat];
    } else {
      next = cats.map((c, i) => i === editingIdx ? newCat : c);
    }
    setCats(next);
    setShowForm(false);
  };
  const deleteCat = (i) => {
    const next = cats.filter((_, idx) => idx !== i);
    setCats(next);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{cats.length} categorias</div>
        <button onClick={openAdd} style={{ background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14 }}>+</span> Nova
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Formulário de ADICIONAR (sempre no topo se ativo e for nova) */}
        {showForm && editingIdx === null && (
          <div style={{ background: "var(--sidebar-bg)", border: "1px solid var(--text)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 11, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Nova categoria</div>
            <input className="input" placeholder="Nome da categoria" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Ícone</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))}
                    style={{
                      width: 30, height: 30, borderRadius: 7, border: "1.5px solid", cursor: "pointer", fontSize: 15,
                      background: form.icon === e ? "var(--text)" : "rgba(255,255,255,0.05)",
                      borderColor: form.icon === e ? "var(--text)" : "var(--divider)",
                      color: form.icon === e ? "var(--bg)" : "inherit"
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Cor</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{COLOR_OPTIONS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 24, height: 24, borderRadius: 6, border: form.color === c ? "2.5px solid #1a1a1a" : "2px solid transparent", cursor: "pointer", background: c }} />)}</div>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
              <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Criar</button>
            </div>
          </div>
        )}

        {cats.map((c, i) => (
          <div key={c.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "var(--sidebar-bg)", border: editingIdx === i ? "1.5px solid var(--text)" : "1px solid var(--divider)" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${CAT_COLORS[c.label] || "#888"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                <button className="btn-icon" onClick={() => openEdit(i)} style={{ color: editingIdx === i ? "var(--text)" : "#6366f1" }}><IconEdit size={14} /></button>
                <button className="btn-icon" onClick={() => deleteCat(i)}><IconTrash size={14} /></button>
              </div>
            </div>

            {/* Formulário de EDIÇÃO (aparece logo abaixo do item selecionado) */}
            {showForm && editingIdx === i && (
              <div style={{ background: "var(--sidebar-bg)", border: "1.5px solid var(--text)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 11, marginTop: -2, marginBottom: 8, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <input className="input" placeholder="Nome da categoria" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Ícone</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {EMOJI_OPTIONS.map(e => (
                      <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))}
                        style={{
                          width: 30, height: 30, borderRadius: 7, border: "1.5px solid", cursor: "pointer", fontSize: 15,
                          background: form.icon === e ? "var(--text)" : "rgba(255,255,255,0.05)",
                          borderColor: form.icon === e ? "var(--text)" : "var(--divider)",
                          color: form.icon === e ? "var(--bg)" : "inherit"
                        }}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{COLOR_OPTIONS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 24, height: 24, borderRadius: 6, border: form.color === c ? "2.5px solid #1a1a1a" : "2px solid transparent", cursor: "pointer", background: c }} />)}</div>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={() => { setShowForm(false); setEditingIdx(null); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
                  <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Salvar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetManager({ cats, orcamentos, setOrcamento }) {
  const [editingOrc, setEditingOrc] = useState(null);
  const [orcInput, setOrcInput] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {cats.map(c => {
        const orc = orcamentos[c.label]; const hasOrc = orc != null && orc > 0; const isEditing = editingOrc === c.label;
        return (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "var(--sidebar-bg)", border: "1px solid var(--divider)" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icon}</span>
            <div style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>{c.label}</div>
            {isEditing ? (
              <input autoFocus type="text" value={maskCurrency(orcInput)} onChange={e => setOrcInput(e.target.value.replace(/\D/g, ""))}
                onBlur={() => { setOrcamento(c.label, orcInput); setEditingOrc(null); }}
                onKeyDown={e => { if (e.key === "Enter") { setOrcamento(c.label, orcInput); setEditingOrc(null); } if (e.key === "Escape") setEditingOrc(null); }}
                style={{ width: 90, background: "var(--input-bg)", border: "1.5px solid var(--text)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", outline: "none", color: "var(--text)" }} placeholder="R$ 0" />
            ) : (
              <button onClick={() => { setEditingOrc(c.label); setOrcInput(hasOrc ? String(orc) : ""); }}
                style={{ background: hasOrc ? "var(--bg)" : "transparent", border: hasOrc ? "1px solid var(--border)" : "1.5px dashed var(--divider)", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: hasOrc ? "var(--text)" : "var(--text-dim)", transition: "all 0.15s", flexShrink: 0 }}>
                {hasOrc ? fmt(orc) : "Definir"}
              </button>
            )}
            {hasOrc && !isEditing && (
              <button onClick={() => setOrcamento(c.label, "")} className="btn-icon" style={{ color: "#ccc", flexShrink: 0 }} title="Remover">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BankManager({ bancos, setBancos, session, showToast }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: "", icon: "🏦", color: "#6366f1" });

  const openAdd = () => { setForm({ nome: "", icon: "🏦", color: "#6366f1" }); setEditingIdx(null); setShowForm(true); };
  const openEdit = (i) => { const b = bancos[i]; setForm({ nome: b.nome, icon: b.icon, color: b.color || "#6366f1" }); setEditingIdx(i); setShowForm(true); };

  const saveForm = async () => {
    if (!form.nome.trim()) return;
    const newBank = { nome: form.nome.trim(), icon: form.icon, color: form.color, user_id: session.user.id };

    if (editingIdx === null) {
      const { data, error } = await supabase.from('bancos').insert([newBank]).select();
      if (error) { showToast("Erro: " + error.message); return; }
      setBancos(p => [...p, data[0]]);
      showToast("Banco adicionado!");
    } else {
      const bankId = bancos[editingIdx].id;
      if (!bankId) {
        // Fallback para itens default que não tem ID no banco ainda
        setBancos(p => p.map((b, i) => i === editingIdx ? { ...newBank, id: null } : b));
      } else {
        const { error } = await supabase.from('bancos').update(newBank).eq('id', bankId);
        if (error) { showToast("Erro: " + error.message); return; }
        setBancos(p => p.map((b, i) => i === editingIdx ? { ...newBank, id: bankId } : b));
      }
      showToast("Banco atualizado!");
    }
    setShowForm(false);
  };

  const deleteBank = async (i) => {
    const b = bancos[i];
    if (b.id) {
      const { error } = await supabase.from('bancos').delete().eq('id', b.id);
      if (error) { showToast("Erro: " + error.message); return; }
    }
    setBancos(p => p.filter((_, idx) => idx !== i));
    showToast("Banco removido.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{bancos.length} bancos cadastrados</div>
        <button onClick={openAdd} style={{ background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14 }}>+</span> Novo Banco
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {showForm && editingIdx === null && (
          <div style={{ background: "var(--sidebar-bg)", border: "1px solid var(--text)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Novo Banco / Corretora</div>
            <input className="input" placeholder="Nome do banco" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 6 }}>Ícone/Emoji</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{["🏦", "💰", "🟣", "🟧", "🔴", "🟡", "🔵", "⚫", "⚪", "🟢"].map(e => <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))} style={{ width: 32, height: 32, borderRadius: 8, border: form.icon === e ? "2px solid var(--text)" : "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 16 }}>{e}</button>)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
              <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 10, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Adicionar</button>
            </div>
          </div>
        )}

        {bancos.map((b, i) => (
          <div key={b.id || i}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "var(--sidebar-bg)", border: editingIdx === i ? "1.5px solid var(--text)" : "1px solid var(--divider)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{b.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.nome}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn-icon" onClick={() => openEdit(i)}><IconEdit size={14} /></button>
                <button className="btn-icon" onClick={() => deleteBank(i)} style={{ color: "#ef4444" }}><IconTrash size={14} /></button>
              </div>
            </div>
            {showForm && editingIdx === i && (
              <div style={{ background: "var(--sidebar-bg)", border: "1.5px solid var(--text)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 12, marginTop: -2, marginBottom: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <input className="input" placeholder="Nome do banco" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", marginBottom: 4 }}>Ícone/Emoji</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{["🏦", "💰", "🟣", "🟧", "🔴", "🟡", "🔵", "⚫", "⚪", "🟢"].map(e => <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))} style={{ width: 32, height: 32, borderRadius: 8, border: form.icon === e ? "2px solid var(--text)" : "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 16 }}>{e}</button>)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
                  <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 10, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Salvar Alteração</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigPage({ categoriasVendas, setCategoriasVendas, categoriasPJ, setCategoriasPJ, categoriasPF, setCategoriasPF, orcamentos, setOrcamento, perfil, setPerfil, isPJ, session, showToast, bancos, setBancos }) {
  const [draftPerfil, setDraftPerfil] = useState(perfil);
  const [section, setSection] = useState("perfil");
  const [savedFeedback, setSavedFeedback] = useState(false);

  const isDirty = useMemo(() => {
    return Object.keys(draftPerfil).some(k => String(draftPerfil[k]) !== String(perfil[k]));
  }, [draftPerfil, perfil]);

  useEffect(() => {
    setDraftPerfil(perfil);
  }, [perfil]);

  useEffect(() => {
    window.meiConfig.isDirty = isDirty;
    window.meiConfig.save = savePerfil;
    return () => { window.meiConfig.isDirty = false; };
  }, [isDirty, draftPerfil, perfil]);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDraftPerfil(p => ({ ...p, foto: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const savePerfil = async () => {
    const toSave = {
      user_id: session.user.id,
      nome: draftPerfil.nome,
      apelido: draftPerfil.apelido,
      is_mei: draftPerfil.isMei !== undefined ? draftPerfil.isMei : true,
      limite_anual: unmaskCurrency(maskCurrency(draftPerfil.limiteAnual)),
      tipo_mei: draftPerfil.tipoMei,
      profissao: draftPerfil.profissao,
      cnpj: draftPerfil.cnpj,
      cpf: draftPerfil.cpf,
      email: draftPerfil.email,
      tel: draftPerfil.tel,
      empresa: draftPerfil.empresa,
      foto: draftPerfil.foto,
      reserva_emerg: draftPerfil.reservaEmerg,
      reserva_atual: unmaskCurrency(maskCurrency(draftPerfil.reservaAtual)),
      meta_receita: unmaskCurrency(maskCurrency(draftPerfil.metaReceita)),
      prolabore: unmaskCurrency(maskCurrency(draftPerfil.prolabore)),
      dark_mode: draftPerfil.darkMode,
      media_gasto_manual: unmaskCurrency(maskCurrency(draftPerfil.mediaGastoManual)),
      valor_das: unmaskCurrency(maskCurrency(draftPerfil.valorDAS)),
      dia_fechamento: draftPerfil.diaFechamento
    };
    const { error } = await supabase.from('perfil').upsert(toSave, { onConflict: 'user_id' });
    if (error) {
      console.error("Erro:", error.message);
      showToast("Erro ao salvar: " + error.message);
    } else {
      setPerfil(draftPerfil); localStorage.setItem('mei_finance_dark_mode', draftPerfil.darkMode);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
      showToast("Alterações salvas com sucesso!");
    }
  };

  const SIDEBAR_ITEMS = [
    { key: "perfil", icon: <IconUser size={16} />, label: "Perfil" },
    { key: "cat-vendas", icon: <IconBusiness size={16} />, label: "Categorias de Vendas" },
    { key: "cat-pj", icon: <IconBusiness size={16} />, label: "Categorias PJ" },
    { key: "cat-pf", icon: <IconUser size={16} />, label: "Categorias PF" },
    { key: "orc-pj", icon: <IconChart size={16} />, label: "Orçamentos PJ" },
    { key: "orc-pf", icon: <IconChart size={16} />, label: "Orçamentos PF" },
    { key: "bancos", icon: <IconBank size={16} />, label: "Meus Bancos" },
    { key: "prefs", icon: <IconSettings size={16} />, label: "Preferências" },
  ];

  return (
    <div className="mobile-config-wrapper" style={{ display: "flex", gap: 0, minHeight: 600, background: "var(--card)", borderRadius: 18, border: "1px solid var(--border)", overflow: "hidden" }}
      onClick={e => e.stopPropagation()}>

      {/* ── Sidebar ── */}
      <div className="mobile-config-sidebar" style={{ width: 220, background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)", padding: "24px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid var(--divider)", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.3px" }}>Configurações</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Finanças Mei · MEI</div>
        </div>
        <nav style={{ flex: 1, padding: "0 10px" }}>
          {SIDEBAR_ITEMS.map(item => (
            <button key={item.key} onClick={() => setSection(item.key)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 9, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: section === item.key ? 700 : 600, fontFamily: "'Syne',sans-serif", transition: "all 0.15s", textAlign: "left",
                background: section === item.key ? "var(--sidebar-active)" : "transparent",
                color: section === item.key ? "var(--sidebar-active-text)" : "var(--text-muted)",
              }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mobile-config-footer" style={{ padding: "16px 16px 0", borderTop: "1px solid var(--divider)", marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 99, background: "var(--bg)", border: "1.5px solid var(--border)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
              {draftPerfil.foto ? <img src={draftPerfil.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>Bem-vindo</div>
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>
                {isPJ ? (draftPerfil.empresa || "Sua Empresa") : (draftPerfil.apelido || draftPerfil.nome || "Visitante")}
              </div>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#ef4444", fontFamily: "'Syne',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            Sair da conta
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mobile-config-content" style={{ flex: 1, padding: "32px 36px", overflowY: "auto" }}>

        {/* ── Perfil ── */}
        {section === "perfil" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Perfil</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Suas informações pessoais e do negócio</div>
            </div>

            {/* Photo */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28, padding: "20px", background: "var(--input-bg)", borderRadius: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 80, height: 80, borderRadius: 24, background: "var(--bg)", border: "2.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, overflow: "hidden", position: "relative" }}>
                  {draftPerfil.foto ? <img src={draftPerfil.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
                </div>
                {draftPerfil.foto && (
                  <button onClick={() => setDraftPerfil(p => ({ ...p, foto: null }))}
                    style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: 99, background: "#ef4444", border: "2px solid var(--card)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="9" height="9" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Foto de perfil</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ background: "var(--text)", color: "var(--bg)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    📷 {draftPerfil.foto ? "Alterar foto" : "Adicionar foto"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
                  </label>
                  {draftPerfil.foto && (
                    <button onClick={() => setDraftPerfil(p => ({ ...p, foto: null }))} style={{ background: "transparent", border: "1.5px solid var(--border)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", cursor: "pointer", color: "var(--text-muted)" }}>
                      Remover
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>JPG, PNG ou GIF · máx. 5MB</div>
              </div>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Nome completo</label>
                  <input className="input" placeholder="Seu nome" value={draftPerfil.nome || ""} onChange={e => setDraftPerfil(p => ({ ...p, nome: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Como prefere ser chamado</label>
                  <input className="input" placeholder="Apelido ou nome curto" value={draftPerfil.apelido || ""} onChange={e => setDraftPerfil(p => ({ ...p, apelido: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Tipo de MEI / Atividade</label>
                  <select className="input" value={draftPerfil.tipo || ""} onChange={e => setDraftPerfil(p => ({ ...p, tipo: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    <option>Serviços</option>
                    <option>Comércio</option>
                    <option>Indústria</option>
                    <option>Serviços + Comércio</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Profissão / Ocupação</label>
                  <input className="input" placeholder="Ex: Consultor de vendas" value={draftPerfil.profissao || ""} onChange={e => setDraftPerfil(p => ({ ...p, profissao: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>CNPJ</label>
                  <input className="input" placeholder="00.000.000/0001-00" value={draftPerfil.cnpj || ""} onChange={e => setDraftPerfil(p => ({ ...p, cnpj: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>CPF</label>
                  <input className="input" placeholder="000.000.000-00" value={draftPerfil.cpf || ""} onChange={e => setDraftPerfil(p => ({ ...p, cpf: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>E-mail</label>
                  <input className="input" type="email" placeholder="seu@email.com" value={draftPerfil.email || ""} onChange={e => setDraftPerfil(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Telefone / WhatsApp</label>
                  <input className="input" placeholder="(11) 99999-9999" value={draftPerfil.tel || ""} onChange={e => setDraftPerfil(p => ({ ...p, tel: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 }}>Nome fantasia / Empresa</label>
                <input className="input" placeholder="Ex: João Silva Consultoria" value={draftPerfil.empresa || ""} onChange={e => setDraftPerfil(p => ({ ...p, empresa: e.target.value }))} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4, gap: 10, alignItems: "center" }}>
                {savedFeedback && <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ Dados salvos com sucesso!</div>}
                <button className="btn btn-dark" onClick={savePerfil} style={{ padding: "8px 24px" }}>Salvar alterações</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Categorias ── */}
        {section === "cat-vendas" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Categorias — Vendas & Serviços</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Categorias usadas ao cadastrar uma venda (serviços ou produtos)</div>
            </div>
            <CatManager cats={categoriasVendas} setCats={setCategoriasVendas} />
          </div>
        )}
        {section === "cat-pj" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Categorias — Empresa (PJ)</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Categorias usadas ao lançar despesas do CNPJ</div>
            </div>
            <CatManager cats={categoriasPJ} setCats={setCategoriasPJ} />
          </div>
        )}
        {section === "cat-pf" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Categorias — Pessoal (PF)</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Categorias usadas ao lançar gastos pessoais</div>
            </div>
            <CatManager cats={categoriasPF} setCats={setCategoriasPF} />
          </div>
        )}

        {/* ── Orçamentos ── */}
        {section === "orc-pj" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Orçamentos — Empresa (PJ)</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Limites mensais por categoria de despesa. Clique no valor para editar.</div>
            </div>
            <BudgetManager cats={categoriasPJ} orcamentos={orcamentos} setOrcamento={setOrcamento} />
          </div>
        )}
        {section === "orc-pf" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Orçamentos — Pessoal (PF)</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Limites mensais por categoria de gasto pessoal. Clique no valor para editar.</div>
            </div>
            <BudgetManager cats={categoriasPF} orcamentos={orcamentos} setOrcamento={setOrcamento} />
          </div>
        )}
        {section === "bancos" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Meus Bancos</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Gerencie os bancos e corretoras onde você deixa seu dinheiro</div>
            </div>
            <BankManager bancos={bancos} setBancos={setBancos} session={session} showToast={showToast} />
          </div>
        )}


        {/* ── Preferências ── */}
        {section === "prefs" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Preferências</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Configurações do seu controle financeiro</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "diaFechamento", label: "Dia de fechamento do mês", sub: "Padrão: 20 (vencimento do DAS)", placeholder: "20", type: "text" },
                { key: "prolabore", label: "Meta de pró-labore mensal", sub: "Valor que deseja se pagar todo mês", placeholder: "R$ 0", isMoney: true },
                { key: "metaReceita", label: "Meta de receita mensal (PJ)", sub: "Usado para calcular % de atingimento", placeholder: "R$ 0", isMoney: true },
                { key: "mediaGastoManual", label: "Média de gastos mensal (PF)", sub: "Valor estimado inicial · usado na reserva até ter dados reais", placeholder: "R$ 0", isMoney: true },
                { key: "reservaEmerg", label: "Meta de reserva de emergência", sub: "Quantos meses de despesa quer guardar", placeholder: "6", type: "text" },
                { key: "reservaAtual", label: "Reserva de Emergência Atual", sub: "Quanto você já tem guardado hoje", placeholder: "R$ 0", isMoney: true },
              ].map(f => (
                <div key={f.key} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{f.sub}</div>
                  </div>
                  <input className="input" type="text" placeholder={f.placeholder} style={{ maxWidth: 140, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}
                    value={f.isMoney ? maskCurrency(draftPerfil[f.key]) : (draftPerfil[f.key] || "")}
                    onChange={e => {
                      const val = f.isMoney ? e.target.value.replace(/\D/g, "") : e.target.value;
                      setDraftPerfil(p => ({ ...p, [f.key]: val }));
                    }} />
                </div>
              ))}

              <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Tipo de MEI</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Afeta o valor do DAS calculado automaticamente</div>
                </div>
                <select className="input" style={{ maxWidth: 180 }} value={draftPerfil.tipo || ""} onChange={e => setDraftPerfil(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  <option>Serviços</option>
                  <option>Comércio</option>
                  <option>Indústria</option>
                  <option>Serviços + Comércio</option>
                </select>
              </div>

              <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Você atua como MEI?</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Desmarque caso seja outro tipo de empresa (Simples, ME, etc).</div>
                </div>
                <div
                  onClick={() => setDraftPerfil(p => ({ ...p, isMei: p.isMei === undefined ? false : !p.isMei }))}
                  style={{
                    width: 44, height: 24, borderRadius: 20, background: (draftPerfil.isMei === undefined || draftPerfil.isMei) ? "#16a34a" : "#ccc", padding: 3, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center",
                    justifyContent: (draftPerfil.isMei === undefined || draftPerfil.isMei) ? "flex-end" : "flex-start"
                  }}>
                  <div style={{ width: 18, height: 18, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>

              {draftPerfil.isMei === false && (
                <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Limite de Faturamento Anual (PJ)</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Qual o teto da sua categoria? Ex: Microempresa é R$ 360.000,00</div>
                  </div>
                  <input className="input" type="text" placeholder="R$ 360.000,00" style={{ maxWidth: 140, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}
                    value={maskCurrency(draftPerfil.limiteAnual)} onChange={e => setDraftPerfil(p => ({ ...p, limiteAnual: e.target.value.replace(/\D/g, "") }))} />
                </div>
              )}

              <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Valor personalizado do DAS</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Deixe em branco para usar o valor padrão do tipo de MEI</div>
                </div>
                <input className="input" type="text" placeholder="R$ 0,00" style={{ maxWidth: 140, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}
                  value={maskCurrency(draftPerfil.valorDAS)} onChange={e => setDraftPerfil(p => ({ ...p, valorDAS: e.target.value.replace(/\D/g, "") }))} />
              </div>

              <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Modo Escuro (Dark Mode)</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Mudar visual para tons escuros</div>
                </div>
                <div
                  onClick={() => setDraftPerfil(p => ({ ...p, darkMode: !p.darkMode }))}
                  style={{
                    width: 44, height: 24, borderRadius: 20, background: draftPerfil.darkMode ? "#16a34a" : "#ccc", padding: 3, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center",
                    justifyContent: draftPerfil.darkMode ? "flex-end" : "flex-start"
                  }}>
                  <div style={{ width: 18, height: 18, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4, gap: 10, alignItems: "center" }}>
                {savedFeedback && <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ Preferências salvas!</div>}
                <button className="btn btn-dark" onClick={savePerfil} style={{ padding: "8px 24px" }}>Salvar alterações</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Category Budget View ─────────────────────────────────────────────────────
function CategoryBudgetView({ catBreakdown, orcamentos, catIcon, isPJ, totals }) {
  const total = isPJ ? totals.totalDesp : totals.totalGastos;
  const withBudget = catBreakdown.filter(([cat]) => orcamentos[cat] != null && orcamentos[cat] > 0);
  const withinBudget = withBudget.filter(([cat, val]) => val <= orcamentos[cat]).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Dashboard Stats Overlay ── */}
      {withBudget.length > 0 && (
        <div className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, borderLeft: "4px solid #6366f1" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Eficiência do Orçamento</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>
              <span style={{ color: withinBudget === withBudget.length ? "#16a34a" : "#f59e0b" }}>{withinBudget} de {withBudget.length}</span> categorias no limite
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, background: "var(--divider)", padding: "6px", borderRadius: 10 }}>
            {withBudget.map(([cat, val]) => {
              const orc = orcamentos[cat];
              const pct = orc ? val / orc : 0;
              const color = pct > 1 ? "#ef4444" : pct > 0.85 ? "#f59e0b" : "#10b981";
              return (
                <div key={cat} title={`${cat}: ${Math.round(pct * 100)}%`}
                  style={{ width: 5, height: 26, borderRadius: 2, background: "rgba(0,0,0,0.05)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${Math.min(pct, 1) * 100}%`, background: color, borderRadius: 2, transition: "height 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Category Breakdown Card ── */}
      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{isPJ ? "Despesas por Categoria" : "Gastos por Categoria"}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", background: "var(--divider)", padding: "2px 10px", borderRadius: 99 }}>{catBreakdown.length}</div>
        </div>

        {catBreakdown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Nenhuma movimentação no período</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {catBreakdown.map(([cat, val]) => {
              const orc = orcamentos[cat];
              const hasOrc = orc != null && orc > 0;
              const pct = hasOrc ? val / orc : 0;
              const overBudget = hasOrc && val > orc;

              // Color Logic
              const baseColor = CAT_COLORS[cat] || "#888";
              const barColor = hasOrc ? (overBudget ? "#ef4444" : pct > 0.85 ? "#f59e0b" : baseColor) : baseColor;
              const barWidth = hasOrc ? Math.min(pct, 1) * 100 : (total ? (val / total) * 100 : 0);

              return (
                <div key={cat} style={{ width: "100%" }}>
                  {/* Row Top Info */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 8, background: "var(--divider)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{catIcon(cat)}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{cat}</div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: overBudget ? "#ef4444" : "var(--text)" }}>{fmt(val)}</span>
                        {hasOrc && (
                          <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>/ {fmt(orc)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Container */}
                  <div style={{ height: 6, background: "var(--divider)", borderRadius: 3, position: "relative", marginBottom: 4 }}>
                    {/* The Bar */}
                    <div style={{
                      height: "100%",
                      width: `${barWidth}%`,
                      background: barColor,
                      borderRadius: 3,
                      transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      boxShadow: overBudget ? "0 0 10px rgba(239,68,68,0.3)" : "none"
                    }} />

                    {/* Budget Target Marker (the visual limit) */}
                    {hasOrc && (
                      <div style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 1.5,
                        background: overBudget ? "#ef4444" : "var(--text-muted)",
                        opacity: 0.5,
                        zIndex: 2
                      }} />
                    )}
                  </div>

                  {/* Footer Label */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 600 }}>
                    <div style={{ color: "var(--text-dim)" }}>
                      {total ? `${((val / total) * 100).toFixed(1)}% do total` : ""}
                    </div>
                    {hasOrc && (
                      <div style={{ color: overBudget ? "#ef4444" : "#10b981" }}>
                        {overBudget ? `+${fmt(val - orc)}` : `${fmt(orc - val)} de limite`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ vendas, despesas, gastos, perfil, totals, dateRange, isPJ, catIcon, reservas }) {

  const chartData = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mLabel = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (isPJ) {
        const vMonth = (vendas || []).filter(v => v.status === "recebido" && v.data?.startsWith(mKey))
          .reduce((s, v) => s + calcLiquido(v.faturamento, v.taxas).liquido, 0);
        const dMonth = (despesas || []).filter(d => d.status === "pago" && d.data?.startsWith(mKey))
          .reduce((s, d) => s + d.valor, 0);
        months.push({ name: mLabel.charAt(0).toUpperCase() + mLabel.slice(1), receita: vMonth, despesa: dMonth });
      } else {
        const gMonth = (gastos || []).filter(g => g.status === "pago" && g.data?.startsWith(mKey))
          .reduce((s, g) => s + g.valor, 0);
        months.push({ name: mLabel.charAt(0).toUpperCase() + mLabel.slice(1), gasto: gMonth });
      }
    }
    return months;
  }, [vendas, despesas, gastos, isPJ]);

  const pjStats = useMemo(() => {
    if (!isPJ) return {};
    const vLiq = totals?.totalLiq || 0;
    const vBruto = (vendas || []).filter(v => v.status === "recebido" && inDateRange(v.data, dateRange))
      .reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
    const vFiltered = (vendas || []).filter(v => v.status === "recebido" && inDateRange(v.data, dateRange));
    const ticketMedio = vFiltered.length > 0 ? vLiq / vFiltered.length : 0;
    const margemLucro = vBruto > 0 ? ((totals?.resultado || 0) / vBruto) * 100 : 0;

    const salesByDay = {};
    vFiltered.forEach(v => {
      const day = v.data ? new Date(v.data).getDay() : 0;
      salesByDay[day] = (salesByDay[day] || 0) + calcLiquido(v.faturamento, v.taxas).liquido;
    });
    const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    let bestDayIdx = 0, maxSales = 0;
    Object.entries(salesByDay).forEach(([d, s]) => { if (s > maxSales) { maxSales = s; bestDayIdx = d; } });
    const melhorDia = maxSales > 0 ? weekDays[bestDayIdx] : "—";

    const currentYear = new Date().getFullYear();
    const vendasAno = (vendas || []).filter(v => v.status === "recebido" && v.data?.startsWith(String(currentYear)));
    const anualComNF = vendasAno.filter(v => v.nf === true).reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
    const anualTotal = vendasAno.reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
    const pctLimiteMEI = (anualComNF / 81000) * 100;

    const catDataMap = {};
    (vendas || []).filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).forEach(v => {
      const cat = v.categoria || "Outro PJ";
      catDataMap[cat] = (catDataMap[cat] || 0) + calcLiquido(v.faturamento, v.taxas).liquido;
    });
    return { ticketMedio, margemLucro, melhorDia, anualComNF, anualTotal, pctLimiteMEI, catChartData: Object.entries(catDataMap).map(([name, value]) => ({ name, value })) };
  }, [vendas, totals, dateRange, isPJ]);

  const pfStats = useMemo(() => {
    if (isPJ) return {};
    const currentGastos = gastos.filter(g => g.status === "pago" && inDateRange(g.data, dateRange));
    const totalGasto = currentGastos.reduce((s, g) => s + g.valor, 0);

    // 50/30/20 Rule
    const needsArr = ["Alimentação", "Moradia", "Transporte", "Saúde", "Educação"];
    const wantsArr = ["Lazer", "Compras", "Streaming", "Outros"];
    const savingsArr = ["Investimentos"];

    const nVal = currentGastos.filter(g => needsArr.includes(g.categoria)).reduce((s, g) => s + g.valor, 0);
    const wVal = currentGastos.filter(g => wantsArr.includes(g.categoria)).reduce((s, g) => s + g.valor, 0);
    const sVal = currentGastos.filter(g => savingsArr.includes(g.categoria)).reduce((s, g) => s + g.valor, 0);

    const rule503020 = [
      { name: "Essenciais", value: nVal, color: "#6366f1", target: 50 },
      { name: "Estilo Vida", value: wVal, color: "#f59e0b", target: 30 },
      { name: "Investimento", value: sVal, color: "#10b981", target: 20 },
    ];

    // ── Reserva de Emergência Inteligente ──
    const monthsWithSpending = new Set();
    gastos.filter(g => g.status === "pago").forEach(g => {
      if (g.data) monthsWithSpending.add(g.data.substring(0, 7));
    });
    const numMonths = monthsWithSpending.size;
    const totalAllGastos = gastos.filter(g => g.status === "pago").reduce((s, g) => s + g.valor, 0);
    const mediaAutoGastos = numMonths >= 3 ? totalAllGastos / numMonths : 0;

    // Prioridade: manual das Preferências > automático (só após 3+ meses)
    const mediaManual = unmaskCurrency(maskCurrency(perfil.mediaGastoManual)) || 0;
    const useAuto = numMonths >= 3 && mediaAutoGastos > 0;
    const mediaFinal = useAuto ? mediaAutoGastos : (mediaManual > 0 ? mediaManual : 0);
    const hasMediaData = mediaFinal > 0;
    const mediaSource = useAuto ? "auto" : (mediaManual > 0 ? "manual" : "none");

    const manualReserva = unmaskCurrency(maskCurrency(perfil.reservaAtual)) || 0;
    const totalReservado = (reservas || []).reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    const reservaAtualVal = manualReserva + totalReservado;
    const metaReservaMeses = parseFloat(perfil.reservaEmerg) || 6;
    const reservaMeses = mediaFinal > 0 ? reservaAtualVal / mediaFinal : 0;

    // Metas de 3, 6, 12 meses
    const metas = [3, 6, 12].map(m => ({
      meses: m,
      necessario: mediaFinal * m,
      falta: Math.max(0, (mediaFinal * m) - reservaAtualVal),
      atingido: mediaFinal > 0 && reservaAtualVal >= (mediaFinal * m)
    }));

    // Pró-labore vs Gastos
    const pl = unmaskCurrency(maskCurrency(perfil.prolabore)) || 0;
    const taxaEconomia = pl > 0 ? ((pl - totalGasto) / pl) * 100 : 0;

    // Ralos (Categories)
    const catMap = {};
    currentGastos.forEach(g => catMap[g.categoria] = (catMap[g.categoria] || 0) + g.valor);
    const raloSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Metodos
    const metodoMap = {};
    currentGastos.forEach(g => {
      const m = g.metodo || "Outro";
      metodoMap[m] = (metodoMap[m] || 0) + g.valor;
    });
    const metodosSorted = Object.entries(metodoMap).sort((a, b) => b[1] - a[1]);

    return { totalGasto, rule503020, reservaMeses, metaReservaMeses, taxaEconomia, raloSorted, metodosSorted, reservaAtualVal, mediaFinal, metas, numMonths: numMonths || 0, hasMediaData, mediaSource };
  }, [gastos, perfil, dateRange, isPJ, reservas]);

  const meta = unmaskCurrency(maskCurrency(perfil.metaReceita)) || 10000;
  const pctMeta = meta > 0 ? (totals.totalLiq / meta) * 100 : 0;

  if (isPJ) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="mobile-summary-grid hide-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>🎯</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Ticket Médio</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(pjStats.ticketMedio)}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Valor médio por venda</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>💰</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Lucro Real</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "#16a34a" }}>{fmtPct(pjStats.margemLucro)}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>% que sobra após taxas e despesas</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>📅</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Melhor Dia</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", textTransform: "capitalize" }}>{pjStats.melhorDia}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Com mais faturamento</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>⚖️</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Custo Fixo</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(totals.totalDesp)}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Despesas da empresa</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>📉</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Custos Totais</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "#ef4444" }}>{fmt(totals.totalDesp + totals.totalDeducao)}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Fixos: {fmt(totals.totalDesp)} · Taxas: {fmt(totals.totalDeducao)}</div>
          </div>
        </div>

        <div className="mobile-chart-grid" style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Performance Mensal</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Receita Líquida vs Despesas (PJ)</div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a" }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Receita</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: "#ef4444" }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Despesa</span>
                </div>
              </div>
            </div>
            <div style={{ height: 260, width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-dim)", fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--text-dim)", fontFamily: "'JetBrains Mono',monospace" }} />
                  <Tooltip cursor={{ fill: "var(--bg)" }} contentStyle={{ background: "var(--text)", border: "none", borderRadius: 10, color: "var(--bg)", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif" }} formatter={(val) => fmt(val)} />
                  <Bar dataKey="receita" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="despesa" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="hide-mobile" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Meta de Receita</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{Math.round(pctMeta)}%</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, paddingBottom: 4 }}>atingido</div>
              </div>
              <div style={{ height: 10, background: "var(--divider)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${Math.min(pctMeta, 100)}%`, background: pctMeta >= 100 ? "#16a34a" : "#6366f1", borderRadius: 99, transition: "width 1s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
                <span>{fmt(totals.totalLiq)}</span>
                <span>META: {fmt(meta)}</span>
              </div>
            </div>
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Faturamento MEI — Anual</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--divider)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>📄 Com NF (Limite MEI)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: pjStats.pctLimiteMEI > 80 ? "#ef4444" : "var(--text)" }}>{fmt(pjStats.anualComNF)}</div>
                </div>
                <div style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--divider)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>💰 Faturamento Total</div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(pjStats.anualTotal)}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}>Limite MEI</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: pjStats.pctLimiteMEI > 80 ? "#ef4444" : "var(--text-muted)" }}>{Math.round(pjStats.pctLimiteMEI)}%</div>
              </div>
              <div style={{ height: 6, background: "var(--divider)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pjStats.pctLimiteMEI, 100)}%`, background: pjStats.pctLimiteMEI > 85 ? "#ef4444" : pjStats.pctLimiteMEI > 50 ? "#f59e0b" : "#16a34a", borderRadius: 99, transition: "width 0.4s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-dim)", marginTop: 6, fontWeight: 600 }}>
                <span>{fmt(pjStats.anualComNF)} faturado com NF</span>
                <span>Teto: R$ 81.000,00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hide-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ color: "#a855f7" }}><IconPie size={18} /></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>Conversão por Categoria</div>
            </div>
            <div style={{ height: 200, width: "100%", display: "flex", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pjStats.catChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pjStats.catChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={CAT_COLORS[entry.name] || "#ccc"} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--text)", border: "none", borderRadius: 10, color: "var(--bg)", fontSize: 12, fontWeight: 600 }} formatter={(val) => fmt(val)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 20 }}>
                {pjStats.catChartData.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[c.name] || "#ccc" }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{c.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginLeft: "auto" }}>{totals.totalLiq > 0 ? Math.round((c.value / totals.totalLiq) * 100) : 0}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 18 }}>📊</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>Saúde do Negócio</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>Resumo financeiro do período selecionado</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Lucro principal */}
              <div style={{ padding: "16px 18px", background: totals.resultado >= 0 ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)", borderRadius: 12, border: `1.5px solid ${totals.resultado >= 0 ? "rgba(22,163,74,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase" }}>{totals.resultado >= 0 ? "💚 Lucro do Período" : "🔴 Prejuízo do Período"}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}>{totals.resultado >= 0 ? "Receita > Despesas ✓" : "Despesas > Receita ✗"}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: totals.resultado >= 0 ? "#16a34a" : "#ef4444", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(totals.resultado)}</div>
                <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 6, fontWeight: 600 }}>Receita líquida menos todas as despesas da empresa</div>
              </div>

              {/* 3 mini-cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ padding: "12px", border: "1px solid var(--divider)", borderRadius: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>💵</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Faturamento Bruto</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{fmt(totals.totalBruto)}</div>
                  <div style={{ fontSize: 8, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Antes das taxas</div>
                </div>
                <div style={{ padding: "12px", border: "1px solid var(--divider)", borderRadius: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>📉</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Custos Operacionais</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{fmt(totals.totalDesp + totals.totalDeducao)}</div>
                  <div style={{ fontSize: 8, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>Despesas + Deduções</div>
                </div>
                <div style={{ padding: "12px", border: "1px solid var(--divider)", borderRadius: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>💳</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Impacto das Taxas</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace" }}>{totals.totalBruto > 0 ? ((totals.totalDeducao / totals.totalBruto) * 100).toFixed(1) + "%" : "0.0%"}</div>
                  <div style={{ fontSize: 8, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>% comido pelas taxas</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    // PERSONAL DASHBOARD
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="grid-3 hide-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#16a34a" }}>🛡️</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Meses Seguros</div>
            </div>
            {pfStats.hasMediaData ? (
              <div style={{ fontSize: 20, fontWeight: 800, color: pfStats.reservaMeses >= pfStats.metaReservaMeses ? "#16a34a" : "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>
                {pfStats.reservaMeses.toFixed(1)} meses
              </div>
            ) : (
              <div className="hide-mobile-soft" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)" }}>Configure a média mensal</div>
            )}
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#6366f1" }}>💰</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Taxa Economia</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: pfStats.taxaEconomia > 15 ? "#16a34a" : "var(--text)" }}>
              {fmtPct(pfStats.taxaEconomia)}
            </div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#f59e0b" }}>🍴</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Top Categoria</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{pfStats.raloSorted[0] ? pfStats.raloSorted[0][0] : "—"}</div>
            <div className="hide-mobile-soft" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, fontWeight: 600 }}>{pfStats.raloSorted[0] ? fmt(pfStats.raloSorted[0][1]) : ""}</div>
          </div>
        </div>

        <div className="grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 14 }}>
          {/* Donut 50/30/20 */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ color: "#a855f7" }}><IconPie size={18} /></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>Regra 50 / 30 / 20</div>
            </div>
            <div style={{ height: 260, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pfStats.rule503020} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value">
                    {pfStats.rule503020.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--text)", border: "none", borderRadius: 10, color: "var(--bg)", fontSize: 12, fontWeight: 600 }} formatter={(val) => fmt(val)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 20 }}>
                {pfStats.rule503020.map((r, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                        <span>{r.name} ({r.target}%)</span>
                      </div>
                      <span style={{ fontWeight: 800 }}>{fmtPct(pfStats.totalGasto > 0 ? (r.value / pfStats.totalGasto) * 100 : 0)}</span>
                    </div>
                    <div style={{ height: 4, background: "var(--divider)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min((pfStats.totalGasto > 0 ? (r.value / pfStats.totalGasto) * 100 : 0), 100)}%`, background: r.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hide-mobile" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Spending Evolution */}
            <div className="card" style={{ padding: "24px", flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 20 }}>Evolução Mensal Pessoal</div>
              <div style={{ height: 180, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-dim)", fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--text-dim)", fontFamily: "'JetBrains Mono',monospace" }} />
                    <Tooltip contentStyle={{ background: "var(--text)", border: "none", borderRadius: 10, color: "var(--bg)", fontSize: 12, fontWeight: 600 }} formatter={(val) => fmt(val)} />
                    <Line type="monotone" dataKey="gasto" stroke="#6366f1" strokeWidth={3} dot={{ fill: "#6366f1", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Spending by Method */}
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>Gastos por Método</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pfStats.metodosSorted.map(([metodo, val], i) => {
                  const pct = pfStats.totalGasto > 0 ? (val / pfStats.totalGasto) * 100 : 0;
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{metodo}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(val)} <span style={{ color: "var(--text-dim)", fontSize: 10, marginLeft: 4 }}>({pct.toFixed(1)}%)</span></div>
                      </div>
                      <div style={{ height: 6, background: "var(--divider)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: "#6366f1", borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
                {pfStats.metodosSorted.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "10px" }}>Sem registros no período</div>}
              </div>
            </div>
            {/* Emergency Fund Card — Redesenhado */}
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Reserva de Emergência</div>
              {pfStats.hasMediaData ? (<>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>MESES PROTEGIDOS</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: pfStats.reservaMeses >= pfStats.metaReservaMeses ? "#16a34a" : "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{pfStats.reservaMeses.toFixed(1)} / {pfStats.metaReservaMeses}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>GUARDADO</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#16a34a", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(pfStats.reservaAtualVal)}</div>
                  </div>
                </div>
                <div style={{ height: 8, background: "var(--divider)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", width: `${Math.min((pfStats.reservaMeses / pfStats.metaReservaMeses) * 100, 100)}%`, background: pfStats.reservaMeses >= pfStats.metaReservaMeses ? "#16a34a" : "#f59e0b", borderRadius: 99, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 12 }}>
                  Média mensal: {fmt(pfStats.mediaFinal)} · {pfStats.mediaSource === "auto" ? `Calculada de ${pfStats.numMonths} meses de dados` : "Definida nas Preferências"}
                  {pfStats.mediaSource === "manual" && pfStats.numMonths > 0 && pfStats.numMonths < 3 ? ` · ${pfStats.numMonths}/3 meses p/ média automática` : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {pfStats.metas.map(m => (
                    <div key={m.meses} style={{ padding: "10px", background: "var(--bg)", borderRadius: 10, textAlign: "center", border: m.atingido ? "1.5px solid #16a34a" : "1px solid var(--divider)" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: m.atingido ? "#16a34a" : "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 }}>{m.meses} meses</div>
                      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)", marginBottom: 2 }}>{fmt(m.necessario)}</div>
                      {m.atingido
                        ? <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a" }}>✓ Atingido</div>
                        : <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444" }}>Falta {fmt(m.falta)}</div>
                      }
                    </div>
                  ))}
                </div>
              </>) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🛡️</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Configure sua média de gastos</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
                    Registre gastos pessoais ou defina sua<br />média mensal em <strong>⚙ Preferências</strong>
                  </div>
                  {pfStats.reservaAtualVal > 0 && (
                    <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#16a34a" }}>Guardado: {fmt(pfStats.reservaAtualVal)}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", marginBottom: 16 }}>Top categorias (Ralos de dinheiro)</div>
          <div className="grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {pfStats.raloSorted.map(([cat, val], i) => (
              <div key={i} style={{ padding: "16px", background: "var(--bg)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>{cat}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(val)}</div>
                </div>
                <div style={{ fontSize: 22 }}>{catIcon(cat)}</div>
              </div>
            ))}
            {pfStats.raloSorted.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12, gridColumn: "span 3", textAlign: "center", padding: "20px" }}>Sem gastos registrados no período.</div>}
          </div>
        </div>
      </div>
    );
  }
}

// ─── Reports View ──────────────────────────────────────────────────────────────
function ReportsView({ vendas, despesas, gastos, dateRange, isPJ, perfil }) {
  if (!isPJ) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--card)", borderRadius: 16, border: "1px dashed var(--border)" }}>
        <IconReport size={48} color="var(--text-dim)" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8, letterSpacing: "-0.5px" }}>Relatórios Avançados</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 360, margin: "0 auto" }}>
          Explore o perfil "Empresa (PJ)" para ter acesso ao DRE completo, projeções de impostos e análises de rentabilidade do seu negócio.
        </div>
      </div>
    );
  }

  // 1. DRE Data (filtrado por dateRange)
  const vRecebido = vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange));
  const dPago = despesas.filter(d => d.status === "pago" && inDateRange(d.data, dateRange));

  // Consideramos gastos PF como Retiradas/Pró-labore para o DRE.
  const gPago = gastos.filter(g => g.status === "pago" && inDateRange(g.data, dateRange));

  let dreBruto = 0;
  let dreDeducoes = 0;
  vRecebido.forEach(v => {
    dreBruto += (parseFloat(v.faturamento) || 0);
    dreDeducoes += calcLiquido(v.faturamento, v.taxas).totalDeducao;
  });

  const dreRecLiq = dreBruto - dreDeducoes;
  const dreDesp = dPago.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
  const dreLucroOp = dreRecLiq - dreDesp;
  const dreRetiradas = gPago.reduce((s, g) => s + (parseFloat(g.valor) || 0), 0);
  const dreLucroLiq = dreLucroOp - dreRetiradas;

  // 2. DAS/Teto Projection
  const isMei = perfil.isMei !== undefined ? perfil.isMei : true;
  const limitFiscal = isMei ? 81000 : (parseFloat(perfil.limiteAnual) || 360000);

  // Faturamento do ano atual independente do filtro
  const totalFaturadoAno = vendas.filter(v => v.status === "recebido" && v.data.startsWith(new Date().getFullYear().toString())).reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
  const restanteLimite = limitFiscal - totalFaturadoAno;
  const currMonth = new Date().getMonth() + 1;
  const remMonthsAno = 12 - currMonth + 1; // +1 includes current 
  const medParaNaoEstourar = restanteLimite > 0 ? (restanteLimite / remMonthsAno) : 0;
  const pctTeto = (totalFaturadoAno / limitFiscal) * 100;

  // 3. Chart Data (Ultimos 6 meses independente de filtro para sempre ver evolução)
  const dt = new Date();
  const hist = [];
  for (let i = 5; i >= 0; i--) {
    const temp = new Date(dt.getFullYear(), dt.getMonth() - i, 1);
    const yyyy = temp.getFullYear();
    const mm = String(temp.getMonth() + 1).padStart(2, "0");
    const mStr = `${yyyy}-${mm}`;

    let fM = 0;
    (vendas || []).filter(v => v.data?.startsWith(mStr) && v.status === "recebido").forEach(v => {
      fM += calcLiquido(v.faturamento, v.taxas).liquido;
    });
    let dM = (despesas || []).filter(d => d.data?.startsWith(mStr) && d.status === "pago").reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);

    hist.push({
      name: `${mm}/${String(yyyy).slice(-2)}`,
      Receita: fM,
      Despesas: dM,
      Lucro: fM - dM
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Chart Section */}
      <div className="card" style={{ padding: "24px 28px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Evolução Operacional</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 24 }}>Comparativo: Receita Líquida vs Despesas PJ (últimos 6 meses)</div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={hist} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => 'R$ ' + v.toLocaleString('pt-BR')} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', background: 'var(--card)', color: 'var(--text)' }} formatter={(v) => fmt(v)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey="Receita" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Lucro" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
        {/* DRE Simplificado */}
        <div className="card" style={{ padding: "24px 28px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>DRE Simplificado</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 20 }}>Resultado apurado no período selecionado</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "'JetBrains Mono',monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>1. Receita Bruta</span><strong style={{ color: "var(--text)" }}>{fmt(dreBruto)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>2. Deduções (Serviços/Taxas)</span><strong style={{ color: "#ef4444" }}>−{fmt(dreDeducoes)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, padding: "8px 0", borderTop: "1px dashed var(--divider)", borderBottom: "1px dashed var(--divider)" }}>
              <span>(=) 3. Receita Líquida</span><strong style={{ color: "#10b981" }}>{fmt(dreRecLiq)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>4. Custos e Despesas PJ</span><strong style={{ color: "#ef4444" }}>−{fmt(dreDesp)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, padding: "8px 0", borderTop: "1px dashed var(--divider)", borderBottom: "1px dashed var(--divider)", background: "var(--row-hover)" }}>
              <span>(=) 5. Lucro Operacional</span><strong style={{ color: "var(--text)" }}>{fmt(dreLucroOp)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
              <span>6. Retiradas Pessoais (PF)</span><strong style={{ color: "#ef4444" }}>−{fmt(dreRetiradas)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, paddingTop: 12, borderTop: "1px solid var(--text)" }}>
              <span>(=) Resultado Final</span>
              <strong style={{ color: dreLucroLiq >= 0 ? "#10b981" : "#ef4444" }}>{fmt(dreLucroLiq)}</strong>
            </div>
          </div>
        </div>

        {/* DAS & Limites Fiscais */}
        <div className="card" style={{ padding: "24px 28px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>{isMei ? "Painel Fiscal MEI" : "Teto de Faturamento PJ"}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 20 }}>Acompanhe seu limite anual de {new Date().getFullYear()}</div>

          <div style={{ background: "transparent", borderRadius: 12, padding: "16px", marginBottom: 20, flex: 1, border: "1px solid var(--divider)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Uso do Teto ({fmt(limitFiscal)})</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{fmtPct(pctTeto)}</span>
            </div>
            <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ width: `${Math.min(pctTeto, 100)}%`, height: "100%", background: pctTeto > 90 ? "#ef4444" : pctTeto > 75 ? "#f59e0b" : "#6366f1", borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>Já faturado ({new Date().getFullYear()})</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{fmt(totalFaturadoAno)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>Disponível</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{fmt(Math.max(0, restanteLimite))}</div>
              </div>
            </div>
          </div>

          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.3)", borderRadius: 12, padding: "16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Recomendação</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4 }}>
              Para não exceder o limite até o final do ano ({remMonthsAno} meses restantes), seu faturamento não deve ultrapassar a média de <strong style={{ color: "var(--text)", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(medParaNaoEstourar)}/mês</strong>.
            </div>
            {pctTeto > 80 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444", fontWeight: 700, padding: "6px 10px", background: "#fef2f2", borderRadius: 6, display: "inline-block" }}>⚠ Alerta: Próximo ao limite fiscal!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
      }
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [reservas, setReservas] = useState([]);
  const [bancos, setBancos] = useState(BANCOS_DEFAULT);
  const [formReserva, setFormReserva] = useState(EMPTY_RESERVA);

  const openAddReserva = () => { setFormReserva(EMPTY_RESERVA); setModal({ type: "reserva", mode: "add" }); };
  const openEditReserva = (r) => { setFormReserva({ ...r, valor: toDigits(r.valor) }); setModal({ type: "reserva", mode: "edit", record: r }); };

  const [context, setContext] = useState("pj"); // "pj" | "pf"
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const [page, setPage] = useState("main");     // "main" | "config"
  const [view, setView] = useState("dashboard"); // "dashboard" | "lista" | "categorias"
  const [modal, setModal] = useState(null);     // {type, mode, record ? }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const safeNavigate = async (newPage, newView) => {
    // Removed native window.confirm alert for better UX
    setPage(newPage);
    if (newView) setView(newView);
  };

  const handleGoHome = () => {
    setSearch("");
    setFilterStatus("todos");
    safeNavigate("main", "dashboard");
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const fetchData = async () => {
    const { data: p, error: pErr } = await supabase.from('perfil').select('*').single();
    if (p) {
      setPerfil(prev => {
        const newPerfil = {
          ...prev,
          ...p,
          darkMode: p.dark_mode ?? prev.darkMode,
          reservaEmerg: p.reserva_emerg ?? prev.reservaEmerg,
          reservaAtual: toDigits(p.reserva_atual ?? prev.reservaAtual),
          metaReceita: toDigits(p.meta_receita ?? prev.metaReceita),
          prolabore: toDigits(p.prolabore ?? prev.prolabore),
          isMei: p.is_mei !== undefined ? p.is_mei : true,
          limiteAnual: toDigits(p.limite_anual ?? (p.is_mei === false ? 360000 : 81000)),
          mediaGastoManual: toDigits(p.media_gasto_manual ?? prev.mediaGastoManual),
          valorDAS: toDigits(p.valor_das ?? prev.valorDAS),
          diaFechamento: p.dia_fechamento ?? prev.diaFechamento
        };
        localStorage.setItem('mei_finance_dark_mode', newPerfil.darkMode);
        return newPerfil;
      });
    } else if (pErr && pErr.code === 'PGRST116') {
      // Create initial profile for new user
      await supabase.from('perfil').insert([{ user_id: session.user.id, nome: session.user.user_metadata.full_name || "" }]);
    }

    // Vendas
    const { data: v, error: vErr } = await supabase.from('vendas').select('*').eq('user_id', session.user.id).order('data', { ascending: false });
    if (v) setVendas(v); else if (vErr) console.error("Erro Vendas:", vErr.message);

    // Despesas
    const { data: d, error: dErr } = await supabase.from('despesas').select('*').eq('user_id', session.user.id).order('data', { ascending: false });
    if (d) setDespesas(d); else if (dErr) console.error("Erro Despesas:", dErr.message);

    // Gastos
    const { data: g, error: gErr } = await supabase.from('gastos').select('*').eq('user_id', session.user.id).order('data', { ascending: false });
    if (g) setGastos(g); else if (gErr) console.error("Erro Gastos:", gErr.message);

    // Orçamentos - Merge with defaults instead of overwriting
    const { data: o, error: oErr } = await supabase.from('orcamentos').select('*').eq('user_id', session.user.id);
    if (o && o.length > 0) {
      setOrcamentos(prev => {
        const next = { ...prev };
        o.forEach(x => { next[x.categoria] = x.valor; });
        return next;
      });
    } else if (oErr) console.error("Erro Orçamentos:", oErr.message);

    // Categorias
    const { data: cat, error: cErr } = await supabase.from('categorias_config').select('*').eq('user_id', session.user.id);
    if (cat && cat.length > 0) {
      const dbVendas = cat.filter(c => c.tipo === 'venda');
      if (dbVendas.length > 0) setCategoriasVendas(dbVendas);

      const dbPJ = cat.filter(c => c.tipo === 'pj');
      if (dbPJ.length > 0) setCategoriasPJ(dbPJ);

      const dbPF = cat.filter(c => c.tipo === 'pf');
      if (dbPF.length > 0) setCategoriasPF(dbPF);

      cat.forEach(c => { if (c.color) CAT_COLORS[c.label] = c.color; });
    } else if (cErr) console.error("Erro Categorias:", cErr.message);

    // Bancos
    const { data: bn, error: bErr } = await supabase.from('bancos').select('*').eq('user_id', session.user.id).order('nome');
    if (bn && bn.length > 0) setBancos(bn); else if (bErr) console.error("Erro Bancos:", bErr.message);

    // Reservas
    const { data: res, error: rErr } = await supabase.from('reservas').select('*').eq('user_id', session.user.id).order('data', { ascending: false });
    if (res) setReservas(res); else if (rErr) console.error("Erro Reservas:", rErr.message);
  };

  const exportToCSV = () => {
    const activeData = isPJ ? [...filteredVendas, ...filteredDespesas] : filteredGastos;
    if (activeData.length === 0) return showToast("Nada para exportar no período filtrado.");

    let header = "";
    let rows = "";

    if (isPJ) {
      // Exporta vendas + despesas PJ
      const vendasCSV = filteredVendas.map(r => {
        const liq = calcLiquido(r.faturamento, r.taxas).liquido;
        return `${r.data};"${r.descricao}";"${r.categoria || ""}";"${r.cliente || ""}";${r.metodo};${r.faturamento};;${liq};${r.status};"${r.obs || ""}"`;
      });
      const despCSV = filteredDespesas.map(r => {
        return `${r.data};"${r.descricao}";"${r.categoria}";"";${r.metodo};${r.valor};;${r.valor};${r.status};"${r.obs || ""}"`;
      });
      header = "Data;Descrição;Categoria;Cliente;Método;Valor Bruto;Taxas;Líquido;Status;Obs\n";
      rows = [...vendasCSV, ...despCSV].join("\n");
    } else {
      header = "Data;Descrição;Categoria;Valor;Status;Recorrência;Obs\n";
      rows = activeData.map(r => `${r.data};"${r.descricao}";${r.categoria};${r.valor};${r.status};${r.recorrencia};"${r.obs || ""}"`).join("\n");
    }

    const blob = new Blob(["\ufeff" + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Export_${isPJ ? "PJ" : "PF"}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [gastos, setGastos] = useState([]);

  // Categories (both editable)
  const [categoriasVendas, setCategoriasVendas] = useState(CATEGORIAS_VENDAS_DEFAULT);
  const [categoriasPJ, setCategoriasPJ] = useState(CATEGORIAS_PJ_DEFAULT);
  const [categoriasPF, setCategoriasPF] = useState(CATEGORIAS_PF_DEFAULT);

  const updateCategoriasVendas = async (newCats) => {
    setCategoriasVendas(newCats);
    if (!session) return;
    const { error: dErr } = await supabase.from('categorias_config').delete().eq('user_id', session.user.id).eq('tipo', 'venda');
    if (dErr) { showToast("Erro ao sincronizar categorias: " + dErr.message); return; }
    const { error: iErr } = await supabase.from('categorias_config').insert(newCats.map(c => ({ label: c.label, icon: c.icon, color: CAT_COLORS[c.label] || "#6366f1", tipo: 'venda', user_id: session.user.id })));
    if (iErr) showToast("Erro ao salvar categorias: " + iErr.message);
  };

  const updateCategoriasPJ = async (newCats) => {
    setCategoriasPJ(newCats);
    if (!session) return;
    const { error: dErr } = await supabase.from('categorias_config').delete().eq('user_id', session.user.id).eq('tipo', 'pj');
    if (dErr) { showToast("Erro ao sincronizar categorias PJ: " + dErr.message); return; }
    const { error: iErr } = await supabase.from('categorias_config').insert(newCats.map(c => ({ label: c.label, icon: c.icon, color: CAT_COLORS[c.label] || "#6366f1", tipo: 'pj', user_id: session.user.id })));
    if (iErr) showToast("Erro ao salvar categorias PJ: " + iErr.message);
  };

  const updateCategoriasPF = async (newCats) => {
    setCategoriasPF(newCats);
    if (!session) return;
    const { error: dErr } = await supabase.from('categorias_config').delete().eq('user_id', session.user.id).eq('tipo', 'pf');
    if (dErr) { showToast("Erro ao sincronizar categorias PF: " + dErr.message); return; }
    const { error: iErr } = await supabase.from('categorias_config').insert(newCats.map(c => ({ label: c.label, icon: c.icon, color: CAT_COLORS[c.label] || "#6366f1", tipo: 'pf', user_id: session.user.id })));
    if (iErr) showToast("Erro ao salvar categorias PF: " + iErr.message);
  };
  // Budgets: {[categoria]: number }
  const [orcamentos, setOrcamentos] = useState({
    "Moradia": 1800, "Alimentação": 500, "Transporte": 300,
  });
  const setOrcamento = async (cat, val) => {
    const v = unmaskCurrency(maskCurrency(val));
    setOrcamentos(o => ({ ...o, [cat]: v }));
    // Sync with Supabase (delete + insert works around missing composite unique constraint)
    if (session) {
      await supabase.from('orcamentos').delete()
        .eq('user_id', session.user.id)
        .eq('categoria', cat);
        
      const { error } = await supabase.from('orcamentos').insert({ 
        categoria: cat, 
        valor: v, 
        user_id: session.user.id 
      });
      
      if (error) {
        console.error("Erro Orçamento:", error.message);
        showToast("Erro ao salvar orçamento: " + error.message);
      }
    }
  };

  // Perfil
  const [perfil, setPerfil] = useState(() => {
    const saved = localStorage.getItem('mei_finance_dark_mode');
    return {
      nome: "", apelido: "", tipo: "Serviços", profissao: "", cnpj: "", cpf: "", email: "", tel: "", empresa: "", foto: null,
      diaFechamento: "20", prolabore: "", metaReceita: "", reservaEmerg: "6", reservaAtual: "", mediaGastoManual: "", valorDAS: "",
      darkMode: saved === 'true'
    };
  });

  // Forms
  const [formVenda, setFormVenda] = useState(EMPTY_VENDA);
  const [formDespesa, setFormDespesa] = useState(EMPTY_DESPESA);
  const [formGasto, setFormGasto] = useState(EMPTY_GASTO);

  // Filters
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = useMemo(() => {
    const list = [];
    // DAS notification removed per user request
    return list;
  }, [despesas, perfil]);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterMetodo, setFilterMetodo] = useState("todos");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const closeModal = () => setModal(null);
  const isPJ = context === "pj";

  // ── Modal openers ──
  const openAddVenda = () => { setFormVenda(EMPTY_VENDA); setModal({ type: "venda", mode: "add" }); };
  const openEditVenda = (r) => { setFormVenda({ ...r, faturamento: toDigits(r.faturamento), taxas: r.taxas.map(t => ({ ...t, value: t.type === "fixed" ? toDigits(t.value) : String(t.value || t.pct || ""), type: t.type || "pct" })) }); setModal({ type: "venda", mode: "edit", record: r }); };
  const openViewVenda = (r) => setModal({ type: "venda", mode: "view", record: r });

  const openAddDespesa = () => { setFormDespesa(EMPTY_DESPESA); setModal({ type: "despesa", mode: "add" }); };
  const openEditDespesa = (r) => { setFormDespesa({ ...r, valor: toDigits(r.valor) }); setModal({ type: "despesa", mode: "edit", record: r }); };
  const openViewDespesa = (r) => setModal({ type: "despesa", mode: "view", record: r });

  const openAddGasto = () => { setFormGasto(EMPTY_GASTO); setModal({ type: "gasto", mode: "add" }); };
  const openEditGasto = (r) => { setFormGasto({ ...r, valor: toDigits(r.valor) }); setModal({ type: "gasto", mode: "edit", record: r }); };
  const openViewGasto = (r) => setModal({ type: "gasto", mode: "view", record: r });

  // ── Saves ──
  const saveVenda = async () => {
    if (!formVenda.descricao || !formVenda.faturamento) return;
    const v = {
      descricao: formVenda.descricao,
      cliente: formVenda.cliente,
      categoria: formVenda.categoria,
      metodo: formVenda.metodo,
      faturamento: unmaskCurrency(maskCurrency(formVenda.faturamento)),
      taxas: formVenda.taxas.map(t => ({ ...t, value: t.type === "fixed" ? unmaskCurrency(maskCurrency(t.value)) : (parseFloat(t.value) || 0) })),
      data: formVenda.data,
      status: formVenda.status,
      nf: formVenda.nf || false,
      obs: formVenda.obs,
      user_id: session.user.id
    };

    if (modal.mode === "add") {
      const { data, error } = await supabase.from('vendas').insert([v]).select();
      if (error) { showToast("Erro: " + error.message); return; }
      setVendas(a => [data[0], ...a]);
      showToast("Venda salva com sucesso!");
    } else {
      const { error } = await supabase.from('vendas').update(v).eq('id', modal.record.id);
      if (error) { showToast("Erro: " + error.message); return; }
      setVendas(a => a.map(x => x.id === modal.record.id ? { ...v, id: modal.record.id } : x));
      showToast("Venda atualizada!");
    }
    closeModal();
  };

  const saveDespesa = async () => {
    if (!formDespesa.descricao || !formDespesa.valor) return;
    const v = {
      descricao: formDespesa.descricao,
      categoria: formDespesa.categoria,
      metodo: formDespesa.metodo,
      valor: unmaskCurrency(maskCurrency(formDespesa.valor)),
      data: formDespesa.data,
      recorrencia: formDespesa.recorrencia,
      status: formDespesa.status,
      obs: formDespesa.obs,
      user_id: session.user.id
    };

    if (modal.mode === "add") {
      const { data, error } = await supabase.from('despesas').insert([v]).select();
      if (error) { showToast("Erro: " + error.message); return; }
      setDespesas(a => [data[0], ...a]);
      showToast("Despesa salva!");
    } else {
      const { error } = await supabase.from('despesas').update(v).eq('id', modal.record.id);
      if (error) { showToast("Erro: " + error.message); return; }
      setDespesas(a => a.map(x => x.id === modal.record.id ? { ...v, id: modal.record.id } : x));
      showToast("Despesa atualizada!");
    }
    closeModal();
  };

  const saveGasto = async () => {
    if (!formGasto.descricao || !formGasto.valor) return;
    const v = {
      descricao: formGasto.descricao,
      categoria: formGasto.categoria,
      metodo: formGasto.metodo,
      valor: unmaskCurrency(maskCurrency(formGasto.valor)),
      data: formGasto.data,
      recorrencia: formGasto.recorrencia,
      status: formGasto.status,
      obs: formGasto.obs,
      user_id: session.user.id
    };

    if (modal.mode === "add") {
      const { data, error } = await supabase.from('gastos').insert([v]).select();
      if (error) { showToast("Erro: " + error.message); return; }
      setGastos(a => [data[0], ...a]);
      showToast("Gasto salvo!");
    } else {
      const { error } = await supabase.from('gastos').update(v).eq('id', modal.record.id);
      if (error) { showToast("Erro: " + error.message); return; }
      setGastos(a => a.map(x => x.id === modal.record.id ? { ...v, id: modal.record.id } : x));
      showToast("Gasto atualizado!");
    }
    closeModal();
  };

  const saveReserva = async () => {
    if (!formReserva.valor || !formReserva.banco) return;
    const v = {
      valor: unmaskCurrency(maskCurrency(formReserva.valor)),
      banco: formReserva.banco,
      data: formReserva.data,
      obs: formReserva.obs,
      user_id: session.user.id
    };

    if (modal.mode === "add") {
      const { data, error } = await supabase.from('reservas').insert([v]).select();
      if (error) { showToast("Erro: " + error.message); return; }
      setReservas(a => [data[0], ...a]);
      showToast("Dinheiro reservado!");
    } else {
      const { error } = await supabase.from('reservas').update(v).eq('id', modal.record.id);
      if (error) { showToast("Erro: " + error.message); return; }
      setReservas(a => a.map(x => x.id === modal.record.id ? { ...v, id: modal.record.id } : x));
      showToast("Reserva atualizada.");
    }
    closeModal();
  };

  const doDelete = async (id) => {
    const tableMap = { venda: "vendas", despesa: "despesas", gasto: "gastos", reserva: "reservas" };
    const table = tableMap[deleteConfirm.type] || "gastos";
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) {
      if (deleteConfirm.type === "venda") setVendas(a => a.filter(x => x.id !== id));
      else if (deleteConfirm.type === "despesa") setDespesas(a => a.filter(x => x.id !== id));
      else if (deleteConfirm.type === "reserva") setReservas(a => a.filter(x => x.id !== id));
      else setGastos(a => a.filter(x => x.id !== id));
    } else {
      showToast("Erro ao excluir: " + error.message);
    }
    setDeleteConfirm(null); closeModal();
  };

  // ── Filter helpers ──
  const applyFilters = (records, isGasto = false) => records.filter(r => {
    const matchSearch = !search || r.descricao?.toLowerCase().includes(search.toLowerCase()) || r.cliente?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || r.status === filterStatus;
    const matchMetodo = !isGasto || filterMetodo === "todos" || r.metodo === filterMetodo;
    const matchDate = inDateRange(r.data, dateRange);
    return matchSearch && matchStatus && matchMetodo && matchDate;
  });

  const filteredVendas = applyFilters(vendas);
  const filteredDespesas = applyFilters(despesas);
  const filteredGastos = applyFilters(gastos, true);

  // ── Totals ──
  const totals = useMemo(() => {
    const vendasRec = vendas.filter(v => inDateRange(v.data, dateRange) && v.status === "recebido");
    const totalBruto = vendasRec.reduce((s, v) => s + v.faturamento, 0);
    const totalLiq = vendasRec.reduce((s, v) => s + calcLiquido(v.faturamento, v.taxas).liquido, 0);
    const totalDesp = despesas.filter(d => inDateRange(d.data, dateRange) && d.status === "pago").reduce((s, d) => s + d.valor, 0);
    const totalGastos = gastos.filter(g => inDateRange(g.data, dateRange) && g.status === "pago").reduce((s, g) => s + g.valor, 0);
    const totalReservado = reservas.filter(r => inDateRange(r.data, dateRange)).reduce((s, r) => s + r.valor, 0);

    const totalDeducao = totalBruto - totalLiq;

    return {
      totalBruto, totalLiq, totalDesp, totalGastos, totalDeducao, totalReservado,
      resultado: totalLiq - totalDesp,
      pendentesPJ: vendas.filter(v => v.status === "pendente").reduce((s, v) => s + v.faturamento, 0) + despesas.filter(d => d.status === "pendente").reduce((s, d) => s + d.valor, 0),
      pendentesGasto: gastos.filter(g => g.status === "pendente").reduce((s, g) => s + g.valor, 0)
    };
  }, [vendas, despesas, gastos, reservas, dateRange]);

  // ── Category breakdown ──
  const catBreakdown = useMemo(() => {
    const src = isPJ ? despesas.filter(d => d.status === "pago" && inDateRange(d.data, dateRange)) : gastos.filter(g => g.status === "pago" && inDateRange(g.data, dateRange));
    const map = {};
    src.forEach(r => { map[r.categoria] = (map[r.categoria] || 0) + r.valor; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [isPJ, despesas, gastos, dateRange]);

  const maxCat = catBreakdown[0]?.[1] || 1;
  const catIcon = (cat) => [...categoriasPJ, ...categoriasPF].find(c => c.label === cat)?.icon || "📦";

  // ── Venda taxa helpers ──
  const addTaxa = () => setFormVenda(f => ({ ...f, taxas: [...f.taxas, { label: "", value: "", type: "pct" }] }));
  const removeTaxa = (i) => setFormVenda(f => ({ ...f, taxas: f.taxas.filter((_, idx) => idx !== i) }));
  const updateTaxa = (i, field, val) => setFormVenda(f => ({ ...f, taxas: f.taxas.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const previewVenda = useMemo(() => calcLiquido(formVenda.faturamento, formVenda.taxas), [formVenda.faturamento, formVenda.taxas]);

  // ── Summary cards config ──
  const summaryCards = isPJ ? [
    { label: "Faturamento Bruto", value: fmt(totals.totalBruto), sub: "total recebido antes das taxas", accent: "#6366f1" },
    { label: "Receita Líquida", value: fmt(totals.totalLiq), sub: "já descontando taxas", accent: "#16a34a" },
    { label: "Despesas PJ", value: fmt(totals.totalDesp), sub: "contas da empresa", accent: "#ef4444" },
    { label: "Pendentes", value: fmt(totals.pendentesPJ), sub: "a receber/pagar", accent: "#f59e0b" },
  ] : (() => {
    const pfOrcTotal = categoriasPF.reduce((acc, c) => acc + (orcamentos[c.label] || 0), 0);
    return [
      { label: "Total Gasto", value: fmt(totals.totalGastos), sub: "contas pessoais", accent: "#6366f1" },
      { label: "Orçamento total", value: fmt(pfOrcTotal), sub: "limite mensal", accent: "#aaa", className: "hide-mobile" },
      { label: "Disponível", value: fmt(Math.max(0, pfOrcTotal - totals.totalGastos)), sub: "até o fim do mês", accent: "#4ade80" },
      { label: "Total Reservado", value: fmt(totals.totalReservado), sub: "guardado no período", accent: "#10b981" },
      { label: "Pendentes", value: fmt(totals.pendentesGasto), sub: "a pagar", accent: "#f59e0b" },
    ];
  })();

  // ── Column configs ──
  const vendasCols = [
    {
      label: "Descrição / Cliente", w: "3fr", render: r => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{r.descricao}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.cliente} · {fmtDate(r.data)}</div>
        </div>
      )
    },
    { label: "Método", w: "1.4fr", render: r => <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.metodo}</span> },
    { label: "Bruto", w: "1.2fr", render: r => <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{fmt(r.faturamento)}</span> },
    {
      label: "Líquido", w: "1.2fr", render: r => {
        const c = calcLiquido(r.faturamento, r.taxas);
        return <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{fmt(c.liquido)}</div>;
      }
    },
    { label: "Status", w: "1.2fr", render: r => { const s = STATUS_STYLE[r.status]; return <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>{r.nf && <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(99,102,241,0.15)", color: "#6366f1", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(99,102,241,0.3)" }}>NF</span>}</div>; } },
  ];

  const despesasCols = [
    {
      label: "Descrição", w: "2.5fr", render: r => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{r.descricao}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4 }}>
            <span>{fmtDate(r.data)}</span>
            {r.recorrencia !== "Único" && <span style={{ background: "var(--tag-bg)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>{r.recorrencia}</span>}
          </div>
        </div>
      )
    },
    {
      label: "Categoria", w: "2fr", render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>{catIcon(r.categoria)}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.categoria}</span>
        </div>
      )
    },
    { label: "Valor", w: "1.2fr", render: r => <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "#c0392b", whiteSpace: "nowrap" }}>−{fmt(r.valor)}</span> },
    { label: "Status", w: "1fr", render: r => { const s = STATUS_STYLE[r.status]; return <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>; } },
  ];

  const gastosCols = [
    {
      label: "Descrição", w: "2.5fr", render: r => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{r.descricao}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4 }}>
            <span>{fmtDate(r.data)}</span>
            {r.recorrencia !== "Único" && <span style={{ background: "var(--tag-bg)", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>{r.recorrencia}</span>}
          </div>
        </div>
      )
    },
    {
      label: "Categoria", w: "2fr", render: r => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>{catIcon(r.categoria)}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.categoria}</span>
        </div>
      )
    },
    { label: "Método", w: "1.4fr", render: r => <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.metodo}</span> },
    { label: "Valor", w: "1.2fr", render: r => <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "#c0392b", whiteSpace: "nowrap" }}>−{fmt(r.valor)}</span> },
    { label: "Status", w: "1fr", render: r => { const s = STATUS_STYLE[r.status]; return <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>; } },
  ];

  // ── Auth Gate: mostra AuthPage se não logado ou em modo de reset de senha ──
  if (!session || showPasswordReset) {
    return (
      <AuthPage
        initialView={showPasswordReset ? "reset" : "login"}
        onPasswordResetComplete={() => {
          setShowPasswordReset(false);
          supabase.auth.signOut();
        }}
      />
    );
  }

  /* ── SUBSCRIPTION GATE (preparação para futuro Stripe) ──
   * Quando implementar planos pagos, descomente este bloco:
   *
   * const subscriptionTier = perfil.subscription_tier || 'free';
   * const isTrialExpired = ...; // lógica de trial
   *
   * if (subscriptionTier === 'free' && isTrialExpired) {
   *   return <PaywallPage session={session} perfil={perfil} />;
   * }
   *
   * Tabela sugerida no Supabase:
   * CREATE TABLE subscriptions (
   *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   *   user_id UUID REFERENCES auth.users NOT NULL,
   *   stripe_customer_id TEXT,
   *   stripe_subscription_id TEXT,
   *   tier TEXT DEFAULT 'free', -- 'free' | 'pro' | 'business'
   *   status TEXT DEFAULT 'active', -- 'active' | 'canceled' | 'past_due'
   *   current_period_end TIMESTAMPTZ,
   *   created_at TIMESTAMPTZ DEFAULT now()
   * );
   */

  return (
    <div className={perfil.darkMode ? "dark" : ""} style={{ fontFamily: "'Syne',sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      {/* ── Top Bar ── */}
      <header className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1 }}>
          <div style={{ cursor: "pointer" }} onClick={handleGoHome}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f5f2ed", letterSpacing: "-0.5px" }}>Finanças Mei</div>
            <div className="hide-mobile" style={{ fontSize: 9, color: "#666", fontWeight: 700, marginTop: -2, letterSpacing: "0.2px" }}>Controle financeiro MEI</div>
          </div>
        </div>

          {/* Mobile PJ/PF switcher — visible only on mobile */}
          <div className="mobile-context-switch" style={{ display: "none" }}>
            {[{ key: "pj", label: "Empresa" }, { key: "pf", label: "Pessoal" }].map((item) => (
              <button key={item.key} onClick={() => { setContext(item.key); setSearch(""); setFilterStatus("todos"); setFilterMetodo("todos"); safeNavigate("main", "dashboard"); }}
                style={{
                  background: context === item.key ? "#f5f2ed" : "transparent",
                  color: context === item.key ? "#1a1a1a" : "#666"
                }}>{item.label}</button>
            ))}
          </div>

        {/* Header actions — fixed layout, never shifts */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {/* Slot 1: Primary action (Green) — Cadastrar venda (PJ) or Reservar (PF) */}
          <button
            className="btn btn-green hide-mobile"
            onClick={isPJ ? openAddVenda : openAddReserva}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: 140, height: 38, fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", borderRadius: 10, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
              background: page === "main" ? "#16a34a" : "transparent",
              color: page === "main" ? "#fff" : "transparent",
              pointerEvents: page === "main" ? "auto" : "none"
            }}>
            {isPJ ? (
              <><span style={{ fontSize: 15 }}>+</span> Cadastrar venda</>
            ) : (
              <><span style={{ fontSize: 15 }}>+</span> Reservar</>
            )}
          </button>

          {/* Slot 2: Secondary action (Neutral) — Nova despesa (PJ) or Novo gasto (PF) */}
          <button
            className="hide-mobile"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: 140, height: 38, fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", borderRadius: 10, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
              background: page === "main" ? "var(--sidebar-bg)" : "transparent",
              color: page === "main" ? "var(--text)" : "transparent",
              pointerEvents: page === "main" ? "auto" : "none"
            }}
            onClick={isPJ ? openAddDespesa : openAddGasto}>
            <span style={{ fontSize: 15 }}>+</span> {isPJ ? "Nova despesa" : "Novo gasto"}
          </button>

          {/* Slot 3: Notifications bell */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowNotifications(!showNotifications)}
              title="Lembretes"
              style={{
                width: 38, height: 38, borderRadius: 10, border: "2px solid #2a2a2a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0,
                background: showNotifications ? "#f5f2ed" : "#2a2a2a", color: showNotifications ? "#1a1a1a" : "#888"
              }}>
              <IconBell size={20} />
              {notifications.length > 0 && (
                <div style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, width: 16, height: 16, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1a1a1a" }}>
                  {notifications.length}
                </div>
              )}
            </button>
            {showNotifications && (
              <div style={{ position: "absolute", top: 46, right: 0, width: 280, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.2)", zIndex: 100, padding: "12px 0" }}>
                <div style={{ padding: "0 16px 10px", borderBottom: "1px solid var(--divider)", fontSize: 12, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Lembretes</div>
                {notifications.length > 0 ? (
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    {notifications.map(n => (
                      <div key={n.id} style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "start", borderBottom: "1px solid var(--divider)", cursor: "pointer" }} className="row-hover">
                        <div style={{ fontSize: 20 }}>{n.icon}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{n.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{n.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "30px 20px", textAlign: "center", color: "#888", fontSize: 12, fontWeight: 600 }}>Tudo em dia! ✨</div>
                )}
              </div>
            )}
          </div>

          {/* Slot 4: profile button — opens config */}
          <button onClick={() => { safeNavigate(page === "config" ? "main" : "config", "dashboard"); setShowNotifications(false); }}
            title="Configurações"
            style={{
              width: 38, height: 38, borderRadius: 10, border: page === "config" ? "2px solid #f5f2ed" : "2px solid #2a2a2a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0,
              background: "#2a2a2a", overflow: "hidden"
            }}>
            {perfil.foto ? (
              <img src={perfil.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <svg width="20" height="20" fill="none" stroke={page === "config" ? "#f5f2ed" : "#888"} strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="app-layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar hide-mobile">
          {/* PJ / PF Switcher inside Sidebar */}
          <div style={{ padding: "16px 12px 10px" }}>
            <div style={{ display: "flex", background: "var(--divider)", borderRadius: 12, padding: 4 }}>
              {[{ key: "pj", label: "Empresa", icon: <IconBusiness size={15} /> }, { key: "pf", label: "Pessoal", icon: <IconUser size={15} /> }].map((item) => (
                <button key={item.key} onClick={() => { setContext(item.key); setSearch(""); setFilterStatus("todos"); setFilterMetodo("todos"); safeNavigate("main", "dashboard"); }}
                  style={{
                    flex: 1, height: 38, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: context === item.key ? "var(--sidebar-active)" : "transparent", color: context === item.key ? "var(--sidebar-active-text)" : "var(--text-dim)"
                  }}>{item.icon} {item.label}</button>
              ))}
            </div>
          </div>

          <div className="divider" />

          <nav style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
            <div className="sidebar-section-label">Navegação</div>
            {[
              { key: "dashboard", icon: <IconDashboard size={18} />, label: "Dashboard" },
              { key: "lista", icon: <IconList size={18} />, label: isPJ ? "Vendas & Despesas" : "Gastos" },
              { key: "categorias", icon: <IconPie size={18} />, label: "Categorias de Gastos" },
              { key: "relatorios", icon: <IconReport size={18} />, label: "Relatórios" },
            ].map(item => (
              <button key={item.key}
                className={`sidebar-nav-item ${page === "main" && view === item.key ? "active" : ""}`}
                onClick={() => safeNavigate("main", item.key)}>
                {item.icon} {item.label}
              </button>
            ))}

            <div style={{ marginTop: 12 }}>
              <div className="sidebar-section-label">Ações</div>
              <button className="sidebar-nav-item" onClick={exportToCSV}>
                <IconExport size={18} /> Exportar CSV
              </button>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Settings */}
            <div className="sidebar-section-label">Sistema</div>
            <button className={`sidebar-nav-item ${page === "config" ? "active" : ""}`}
              onClick={() => safeNavigate("config")}>
              <IconSettings size={18} /> Configurações
            </button>
            <button className="sidebar-nav-item"
              onClick={async () => {
                const newVal = !perfil.darkMode;
                setPerfil(p => ({ ...p, darkMode: newVal }));
                localStorage.setItem('mei_finance_dark_mode', newVal);
                if (session) {
                  const { error } = await supabase.from('perfil').update({ dark_mode: newVal }).eq('user_id', session.user.id);
                  if (error) console.error("Erro ao salvar tema:", error.message);
                }
              }}>
              {perfil.darkMode ? <IconSun size={18} /> : <IconMoon size={18} />}
              {perfil.darkMode ? "Modo Claro" : "Modo Escuro"}
            </button>
          </nav>

          <div className="divider" />

          {/* Profile footer */}
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            {perfil.foto ? (
              <img src={perfil.foto} style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--divider)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconUser size={16} /></div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{perfil.apelido || perfil.nome || "Visitante"}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>MEI</div>
            </div>
            <button className="btn-icon" onClick={() => supabase.auth.signOut()} title="Sair" style={{ flexShrink: 0 }}>
              <IconLogout size={16} />
            </button>
          </div>
        </aside>

        {/* ── App Content ── */}
        <div className="app-content">


          <div className="main-container mobile-px" style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px" }}>

            {/* ── Config page ── */}
            {page === "config" && (
              <ConfigPage
                categoriasVendas={categoriasVendas} setCategoriasVendas={updateCategoriasVendas}
                categoriasPJ={categoriasPJ} setCategoriasPJ={updateCategoriasPJ}
                categoriasPF={categoriasPF} setCategoriasPF={updateCategoriasPF}
                orcamentos={orcamentos} setOrcamento={setOrcamento}
                perfil={perfil} setPerfil={setPerfil}
                isPJ={isPJ} session={session} showToast={showToast}
                bancos={bancos} setBancos={setBancos}
              />
            )}

            {/* ── Main page ── */}
            {page === "main" && <>

              {/* ── Greeting ── */}
              <div style={{ marginBottom: 10 }}>
                {isPJ ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bem-vindo(a),</div>
                    <div className="mobile-welcome-title" style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>{perfil.empresa || "Sua Empresa"} ✨</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {(() => { const h = new Date().getHours(); return h >= 5 && h < 12 ? "Bom dia," : h >= 12 && h < 18 ? "Boa tarde," : "Boa noite,"; })()}
                    </div>
                    <div className="mobile-welcome-title" style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>{perfil.apelido || perfil.nome || "Visitante"} ✨</div>
                  </>
                )}
              </div>

              {/* ── Summary cards ── */}
              <div className={`mobile-summary-grid ${isPJ ? "grid-4" : ""}`} style={{ display: "grid", gridTemplateColumns: isPJ ? "repeat(4, 1fr)" : "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
                {summaryCards.map((c, i) => (
                  <div key={i} className={`card ${c.className || ""}`} style={{ padding: "18px 20px", borderTop: `3px solid ${c.accent}` }}>
                    <div style={{ fontSize: 10, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", color: c.accent, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3, minHeight: 26 }}>{c.value}</div>
                    <div className="hide-mobile-soft" style={{ fontSize: 11, color: "#aaa", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── List actions & stats ── */}
              <div className="hide-mobile" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {isPJ ? `${filteredVendas.length} venda${filteredVendas.length !== 1 ? "s" : ""} · ${filteredDespesas.length} despesa${filteredDespesas.length !== 1 ? "s" : ""}` : `${filteredGastos.length} gasto${filteredGastos.length !== 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>

              {/* ── Date filter ── */}
              <div style={{ marginBottom: 16 }}>
                <DateFilterBar range={dateRange} setRange={setDateRange} />
              </div>

              {/* ── Search + status filter ── */}
              <div className={view === "dashboard" ? "hide-mobile mobile-search-row" : "mobile-search-row"} style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <input className="input" style={{ maxWidth: 240 }} placeholder={isPJ ? "Buscar descrição ou cliente..." : "Buscar descrição..."} value={search} onChange={e => setSearch(e.target.value)} />
                <div className="mobile-filter-scroll" style={{ display: "flex", gap: 6 }}>
                  {(isPJ ? ["todos", "recebido", "pendente", "cancelado"] : ["todos", ...METODOS]).map(s => {
                    const isFilterActive = isPJ ? filterStatus === s : filterMetodo === s;
                    return (
                      <button key={s} className="filter-btn" onClick={() => isPJ ? setFilterStatus(s) : setFilterMetodo(s)}
                        style={{
                          borderColor: isFilterActive ? "var(--text)" : "var(--filter-btn-border)",
                          background: isFilterActive ? "var(--text)" : "transparent",
                          color: isFilterActive ? "var(--bg)" : "var(--text-muted)"
                        }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Dashboard view ── */}
              {view === "dashboard" && <Dashboard vendas={vendas} despesas={despesas} gastos={gastos} perfil={perfil} totals={totals} dateRange={dateRange} isPJ={isPJ} catIcon={catIcon} reservas={reservas} />}

              {/* ── Category view ── */}
              {view === "categorias" && (
                <CategoryBudgetView
                  catBreakdown={catBreakdown}
                  orcamentos={orcamentos}
                  setOrcamento={setOrcamento}
                  catIcon={catIcon}
                  isPJ={isPJ}
                  totals={totals}
                />
              )}

              {/* ── List view ── */}
              {view === "lista" && isPJ && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Vendas */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Vendas / Receitas</div>
                    <RecordTable records={filteredVendas} columns={vendasCols}
                      onView={openViewVenda} onEdit={openEditVenda} onDelete={id => setDeleteConfirm({ id, type: "venda" })}
                      emptyMsg="Nenhuma venda no período" />
                  </div>
                  {/* Despesas */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Despesas da empresa</div>
                    <RecordTable records={filteredDespesas} columns={despesasCols}
                      onView={openViewDespesa} onEdit={openEditDespesa} onDelete={id => setDeleteConfirm({ id, type: "despesa" })}
                      emptyMsg="Nenhuma despesa no período" />
                  </div>
                </div>
              )}

              {view === "lista" && !isPJ && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Gastos pessoais</div>
                  <RecordTable records={filteredGastos} columns={gastosCols}
                    onView={openViewGasto} onEdit={openEditGasto} onDelete={id => setDeleteConfirm({ id, type: "gasto" })}
                    emptyMsg="Nenhum gasto no período" />
                </div>
              )}

              {/* ── Relatórios view ── */}
              {view === "relatorios" && (
                <ReportsView
                  vendas={vendas}
                  despesas={despesas}
                  gastos={gastos}
                  dateRange={dateRange}
                  isPJ={isPJ}
                  perfil={perfil}
                />
              )}

            </>}
          </div>

          {/* ═══════════════════ MODALS ═══════════════════ */}

          {/* ── Reserva Add/Edit ── */}
          {modal && modal.type === "reserva" && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 400 }}>
                <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Nova Reserva" : "Editar Reserva"}</div>
                  <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                </div>
                <div className="divider" />
                <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>{lbl("Valor *")}<input className="input" type="text" placeholder="R$ 0,00" value={maskCurrency(formReserva.valor)} onChange={e => setFormReserva(f => ({ ...f, valor: e.target.value.replace(/\D/g, "") }))} /></div>
                  <div>
                    {lbl("Banco / Corretora *")}
                    <select className="input" value={formReserva.banco} onChange={e => setFormReserva(f => ({ ...f, banco: e.target.value }))}>
                      <option value="">Selecionar banco...</option>
                      {bancos.map(b => (
                        <option key={b.nome} value={b.nome}>{b.icon} {b.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>{lbl("Data")}<input className="input" type="date" value={formReserva.data} onChange={e => setFormReserva(f => ({ ...f, data: e.target.value }))} /></div>
                  <div>{lbl("Observação")}<input className="input" placeholder="Ex: Reserva de emergência" value={formReserva.obs} onChange={e => setFormReserva(f => ({ ...f, obs: e.target.value }))} /></div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={closeModal}>Cancelar</button>
                    <button className="btn btn-dark" style={{ flex: 1 }} onClick={saveReserva}>Registrar Reserva</button>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ── Venda Add/Edit ── */}
          {modal && modal.type === "venda" && (modal.mode === "add" || modal.mode === "edit") && (
            <div className="modal-overlay" >
              <div className="modal">
                <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Nova venda" : "Editar venda"}</div>
                  <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                </div>
                <div className="divider" />
                <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>{lbl("Cliente")}<input className="input" placeholder="Nome do cliente" value={formVenda.cliente} onChange={e => setFormVenda(f => ({ ...f, cliente: e.target.value }))} /></div>
                    <div>{lbl("Data")}<input className="input" type="date" value={formVenda.data} onChange={e => setFormVenda(f => ({ ...f, data: e.target.value }))} /></div>
                  </div>
                  <div>{lbl("Descrição *")}<input className="input" placeholder="Ex: Proteção Veicular Premium" value={formVenda.descricao} onChange={e => setFormVenda(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>{lbl("Faturamento bruto *")}<input className="input" type="text" placeholder="R$ 0,00" value={maskCurrency(formVenda.faturamento)} onChange={e => setFormVenda(f => ({ ...f, faturamento: e.target.value.replace(/\D/g, "") }))} /></div>
                    <div>{lbl("Método")}<select className="input" value={formVenda.metodo} onChange={e => setFormVenda(f => ({ ...f, metodo: e.target.value }))}>{METODOS.map(m => <option key={m}>{m}</option>)}</select></div>
                  </div>
                  {/* Taxas */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      {lbl("Taxas / Repasses")}
                      <button onClick={addTaxa} style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", background: "#f0ede8", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>+ Adicionar</button>
                    </div>
                    {formVenda.taxas.map((t, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 32px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <input className="input" placeholder="Ex: Taxa plataforma" value={t.label} onChange={e => updateTaxa(i, "label", e.target.value)} />
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <input className="input" type="text"
                            placeholder={t.type === "pct" ? "0" : "R$ 0,00"}
                            value={t.type === "pct" ? t.value : maskCurrency(t.value)}
                            onChange={e => updateTaxa(i, "value", t.type === "pct" ? e.target.value : e.target.value.replace(/\D/g, ""))}
                            style={{ paddingRight: t.type === "pct" ? 34 : 44 }} />
                          <button onClick={() => updateTaxa(i, "type", t.type === "pct" ? "fixed" : "pct")}
                            style={{ position: "absolute", right: 4, top: 4, bottom: 4, padding: "0 8px", background: "var(--divider)", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 3 }}>
                            {t.type === "pct" ? "%" : "R$"}
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                        </div>
                        <button className="btn-icon" onClick={() => removeTaxa(i)} style={{ color: "#e05" }}><IconClose /></button>
                      </div>
                    ))}
                  </div>
                  {formVenda.faturamento && (
                    <div style={{ background: "#f5f2ed", borderRadius: 12, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      {[["Bruto", fmt(previewVenda.fat), "#1a1a1a"], ["Deduções", `−${fmt(previewVenda.totalDeducao)}`, "#c0392b"], ["Líquido", fmt(previewVenda.liquido), "#16a34a"]].map(([label, val, color]) => (
                        <div key={label}><div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, opacity: 0.7 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color }}>{val}</div></div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>{lbl("Status")}<select className="input" value={formVenda.status} onChange={e => setFormVenda(f => ({ ...f, status: e.target.value }))}><option value="recebido">Recebido</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select></div>
                    <div>{lbl("Gerou NF?")}
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <button className={formVenda.nf ? "btn btn-green" : "btn btn-outline"} style={{ flex: 1, padding: "8px 0", fontSize: 12 }} onClick={() => setFormVenda(f => ({ ...f, nf: true }))}>Sim</button>
                        <button className={!formVenda.nf ? "btn btn-dark" : "btn btn-outline"} style={{ flex: 1, padding: "8px 0", fontSize: 12 }} onClick={() => setFormVenda(f => ({ ...f, nf: false }))}>Não</button>
                      </div>
                    </div>
                    <div>{lbl("Categoria")}<select className="input" value={formVenda.categoria || ""} onChange={e => setFormVenda(f => ({ ...f, categoria: e.target.value }))}>
                      {categoriasVendas.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </select></div>
                  </div>
                  <div>{lbl("Observação")}<input className="input" placeholder="Opcional" value={formVenda.obs} onChange={e => setFormVenda(f => ({ ...f, obs: e.target.value }))} /></div>
                </div>
                <div className="divider" />
                <div style={{ padding: "16px 28px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={closeModal}>Cancelar</button>
                  <button className="btn btn-dark" onClick={saveVenda}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Despesa Add/Edit ── */}
          {modal && modal.type === "despesa" && (modal.mode === "add" || modal.mode === "edit") && (
            <div className="modal-overlay" >
              <div className="modal">
                <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Nova despesa" : "Editar despesa"}</div>
                  <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                </div>
                <div className="divider" />
                <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>{lbl("Descrição *")}<input className="input" placeholder="Ex: DAS MEI, Ferramenta, Equipamento..." value={formDespesa.descricao} onChange={e => setFormDespesa(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>{lbl("Valor *")}<input className="input" type="text" placeholder="R$ 0,00" value={maskCurrency(formDespesa.valor)} onChange={e => setFormDespesa(f => ({ ...f, valor: e.target.value.replace(/\D/g, "") }))} /></div>
                    <div>{lbl("Data")}<input className="input" type="date" value={formDespesa.data} onChange={e => setFormDespesa(f => ({ ...f, data: e.target.value }))} /></div>
                  </div>
                  <div>{lbl("Categoria")}<CatGridEditable cats={categoriasPJ} value={formDespesa.categoria} onChange={v => setFormDespesa(f => ({ ...f, categoria: v }))} onCatsChange={updateCategoriasPJ} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>{lbl("Método")}<select className="input" value={formDespesa.metodo} onChange={e => setFormDespesa(f => ({ ...f, metodo: e.target.value }))}>{METODOS.map(m => <option key={m}>{m}</option>)}</select></div>
                    <div>{lbl("Recorrência")}<select className="input" value={formDespesa.recorrencia} onChange={e => setFormDespesa(f => ({ ...f, recorrencia: e.target.value }))}>{RECORRENCIAS.map(r => <option key={r}>{r}</option>)}</select></div>
                    <div>{lbl("Status")}<select className="input" value={formDespesa.status} onChange={e => setFormDespesa(f => ({ ...f, status: e.target.value }))}><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select></div>
                  </div>
                  <div>{lbl("Observação")}<input className="input" placeholder="Opcional" value={formDespesa.obs} onChange={e => setFormDespesa(f => ({ ...f, obs: e.target.value }))} /></div>
                </div>
                <div className="divider" />
                <div style={{ padding: "16px 28px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={closeModal}>Cancelar</button>
                  <button className="btn btn-dark" onClick={saveDespesa}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Gasto Add/Edit ── */}
          {modal && modal.type === "gasto" && (modal.mode === "add" || modal.mode === "edit") && (
            <div className="modal-overlay" >
              <div className="modal">
                <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Novo gasto" : "Editar gasto"}</div>
                  <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                </div>
                <div className="divider" />
                <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>{lbl("Descrição *")}<input className="input" placeholder="Ex: Aluguel, Supermercado, Combustível..." value={formGasto.descricao} onChange={e => setFormGasto(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>{lbl("Valor *")}<input className="input" type="text" placeholder="R$ 0,00" value={maskCurrency(formGasto.valor)} onChange={e => setFormGasto(f => ({ ...f, valor: e.target.value.replace(/\D/g, "") }))} /></div>
                    <div>{lbl("Data")}<input className="input" type="date" value={formGasto.data} onChange={e => setFormGasto(f => ({ ...f, data: e.target.value }))} /></div>
                  </div>
                  <div>{lbl("Categoria")}<CatGridEditable cats={categoriasPF} value={formGasto.categoria} onChange={v => setFormGasto(f => ({ ...f, categoria: v }))} onCatsChange={updateCategoriasPF} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>{lbl("Método")}<select className="input" value={formGasto.metodo} onChange={e => setFormGasto(f => ({ ...f, metodo: e.target.value }))}>{METODOS.map(m => <option key={m}>{m}</option>)}</select></div>
                    <div>{lbl("Recorrência")}<select className="input" value={formGasto.recorrencia} onChange={e => setFormGasto(f => ({ ...f, recorrencia: e.target.value }))}>{RECORRENCIAS.map(r => <option key={r}>{r}</option>)}</select></div>
                    <div>{lbl("Status")}<select className="input" value={formGasto.status} onChange={e => setFormGasto(f => ({ ...f, status: e.target.value }))}><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select></div>
                  </div>
                  <div>{lbl("Observação")}<input className="input" placeholder="Opcional" value={formGasto.obs} onChange={e => setFormGasto(f => ({ ...f, obs: e.target.value }))} /></div>
                </div>
                <div className="divider" />
                <div style={{ padding: "16px 28px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={closeModal}>Cancelar</button>
                  <button className="btn btn-dark" onClick={saveGasto}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── View modals ── */}
          {modal?.mode === "view" && modal.type === "venda" && (() => {
            const r = modal.record; const c = calcLiquido(r.faturamento, r.taxas); const s = STATUS_STYLE[r.status];
            return (
              <div className="modal-overlay" >
                <div className="modal">
                  <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Detalhe da venda</div>
                    <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                  </div>
                  <div className="divider" />
                  <div style={{ padding: "24px 28px" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{r.descricao}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>{r.cliente}</span>
                      <span style={{ color: "#ccc" }}>·</span>
                      <span style={{ fontSize: 12, color: "#888" }}>{fmtDate(r.data)}</span>
                      <span style={{ color: "#ccc" }}>·</span>
                      <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>
                    </div>
                    <div style={{ background: "var(--divider)", borderRadius: 14, padding: "16px 20px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      {[["Faturamento", fmt(r.faturamento), "var(--text)"], [`Deduções (${fmtPct(c.totalPct)})`, `−${fmt(c.totalDeducao)}`, "#ef4444"], ["Líquido", fmt(c.liquido), "#16a34a"]].map(([label, val, color]) => (
                        <div key={label}><div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color }}>{val}</div></div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Breakdown</div>
                      {r.taxas.map((t, i) => {
                        const taxVal = t.type === "fixed" ? (typeof t.value === "number" ? t.value : unmaskCurrency(maskCurrency(t.value))) : r.faturamento * ((parseFloat(t.value ?? t.pct ?? 0)) / 100);
                        const taxPct = t.type === "fixed" ? (r.faturamento > 0 ? (taxVal / r.faturamento * 100) : 0) : (parseFloat(t.value ?? t.pct ?? 0));
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < r.taxas.length - 1 ? "1px solid var(--divider)" : "none" }}>
                            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t.label || "Taxa"}</span>
                            <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>−{fmt(taxVal)} <span style={{ color: "var(--text-dim)" }}>({fmtPct(taxPct)})</span></span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>Método: <strong style={{ color: "var(--text)" }}>{r.metodo}</strong></span>
                      {r.nf && <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(99,102,241,0.15)", color: "#6366f1", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(99,102,241,0.3)" }}>📄 NF Emitida</span>}
                      {r.obs && <span>· {r.obs}</span>}
                    </div>
                  </div>
                  <div className="divider" />
                  <div style={{ padding: "16px 28px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-outline" onClick={closeModal}>Fechar</button>
                    <button className="btn btn-dark" onClick={() => { closeModal(); setTimeout(() => openEditVenda(r), 50); }}>Editar</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {modal?.mode === "view" && (modal.type === "despesa" || modal.type === "gasto") && (() => {
            const r = modal.record; const s = STATUS_STYLE[r.status];
            return (
              <div className="modal-overlay" >
                <div className="modal">
                  <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Detalhe da {modal.type === "despesa" ? "despesa" : "gasto"}</div>
                    <button className="btn-icon" onClick={closeModal}><IconClose /></button>
                  </div>
                  <div className="divider" />
                  <div style={{ padding: "24px 28px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: "#f5f2ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{catIcon(r.categoria)}</div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800 }}>{r.descricao}</div>
                        <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{r.categoria} · {fmtDate(r.data)}</div>
                      </div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "20px", marginBottom: 20, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Valor</div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "#c0392b", fontFamily: "'JetBrains Mono',monospace" }}>−{fmt(r.valor)}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[["Método", r.metodo], ["Recorrência", r.recorrencia], ["Status", <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>], ["Observação", r.obs || "—"]].map(([label, val], i) => (
                        <div key={i} style={{ background: "var(--sidebar-bg)", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="divider" />
                  <div style={{ padding: "16px 28px", display: "flex", gap: 8, justifyContent: "space-between" }}>
                    <button className="btn btn-danger" onClick={() => setDeleteConfirm({ id: r.id, type: modal.type })}>Excluir</button>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-outline" onClick={closeModal}>Fechar</button>
                      <button className="btn btn-dark" onClick={() => { closeModal(); setTimeout(() => modal.type === "despesa" ? openEditDespesa(r) : openEditGasto(r), 50); }}>Editar</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Mobile Add Menu Modal ── */}
          {modal?.type === "mobile-add-menu" && (
            <div className="modal-overlay" onClick={closeModal} style={{ alignItems: "flex-end", paddingBottom: 80 }}>
              <div className="modal" style={{ padding: "24px", width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 12, borderRadius: "24px 24px 16px 16px" }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>Adicionar Novo</div>
                {isPJ ? (
                  <>
                    <button className="btn btn-green" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: 16, borderRadius: 16 }} onClick={() => { closeModal(); setTimeout(openAddVenda, 50); }}>
                      <span>Nova Venda / Receita</span>
                    </button>
                    <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: 16, borderRadius: 16, border: "2px solid var(--border)", color: "var(--text)", background: "var(--card)" }} onClick={() => { closeModal(); setTimeout(openAddDespesa, 50); }}>
                      <span>Nova Despesa (PJ)</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-green" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: 16, borderRadius: 16 }} onClick={() => { closeModal(); setTimeout(openAddReserva, 50); }}>
                      <span>Nova Reserva</span>
                    </button>
                    <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: 16, borderRadius: 16, border: "2px solid var(--border)", color: "var(--text)", background: "var(--card)" }} onClick={() => { closeModal(); setTimeout(openAddGasto, 50); }}>
                      <span>Novo Gasto Pessoal</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Delete confirm ── */}
          {deleteConfirm && (
            <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
              <div className="modal" style={{ maxWidth: 360, padding: "28px" }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Excluir registro?</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Essa ação não pode ser desfeita.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => doDelete(deleteConfirm.id)}>Excluir</button>
                </div>
              </div>
            </div>
          )}
          {/* ── Mobile bottom nav ── */}
          <div className="mobile-nav">
            <button onClick={() => { setPage("main"); setView("dashboard"); }} style={{ background: "none", border: "none", color: (page === "main" && view === "dashboard") ? "var(--text)" : "var(--text-dim)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <IconDashboard size={20} /> <span style={{ fontSize: 10, fontWeight: 700 }}>Resumo</span>
            </button>
            <button onClick={() => { setPage("main"); setView("lista"); }} style={{ background: "none", border: "none", color: (page === "main" && view === "lista") ? "var(--text)" : "var(--text-dim)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <IconList size={20} /> <span style={{ fontSize: 10, fontWeight: 700 }}>Lista</span>
            </button>
            {/* Floating Add Button in Nav */}
            <button className="btn-fab" onClick={() => setModal({ type: "mobile-add-menu" })}
              style={{ width: 44, height: 44, borderRadius: 22, background: "var(--text)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -15, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", border: "none", cursor: "pointer" }}>
              <span style={{ fontSize: 24, fontWeight: 800 }}>+</span>
            </button>
            <button onClick={() => { setPage("main"); setView("categorias"); }} style={{ background: "none", border: "none", color: (page === "main" && view === "categorias") ? "var(--text)" : "var(--text-dim)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <IconPie size={20} /> <span style={{ fontSize: 10, fontWeight: 700 }}>Filtro</span>
            </button>
            <button onClick={() => setPage("config")} style={{ background: "none", border: "none", color: page === "config" ? "var(--text)" : "var(--text-dim)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              {perfil.foto ? <img src={perfil.foto} style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover" }} /> : <IconUser size={20} />}
              <span style={{ fontSize: 10, fontWeight: 700 }}>Ajustes</span>
            </button>
          </div>
        </div>{/* close app-content */}
      </div>{/* close app-layout */}
      {toast && <div className="toast">{toast}</div>}
    </div >
  );
}
