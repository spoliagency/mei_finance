import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, Cell, PieChart, Pie } from 'recharts';

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = (v) => v ? v.split("-").reverse().join("/") : "";
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const exportCSV = (records, filename) => {
  if (!records.length) return;
  const headers = Object.keys(records[0]).filter(k => k !== 'id');
  const rows = [headers.join(";")];
  records.forEach(r => {
    rows.push(headers.map(h => {
      let v = r[h];
      if (Array.isArray(v)) v = v.map(i => `${i.label}: ${i.pct}%`).join(" | ");
      return `"${String(v || "").replace(/"/g, '""')}"`;
    }).join(";"));
  });
  const blob = new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filename}_${today()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIAS_PJ_DEFAULT = [
  { label: "Serviço prestado", icon: "💼" }, { label: "Produto vendido", icon: "📦" },
  { label: "Consultoria", icon: "🎯" }, { label: "Comissão", icon: "💰" },
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
const CAT_COLORS = {
  "Serviço prestado": "#6366f1", "Produto vendido": "#8b5cf6", "Consultoria": "#a855f7", "Comissão": "#d946ef",
  "Ferramentas / SaaS": "#06b6d4", "Marketing": "#f97316", "Impostos / DAS": "#ef4444", "Educação": "#10b981",
  "Equipamento": "#3b82f6", "Outro PJ": "#64748b",
  "Alimentação": "#f59e0b", "Moradia": "#6366f1", "Transporte": "#3b82f6", "Lazer": "#10b981",
  "Saúde": "#ec4899", "Educação": "#06b6d4", "Compras": "#f97316", "Streaming": "#a855f7",
  "Investimentos": "#14b8a6", "Outros": "#94a3b8",
};
const STATUS_STYLE = {
  recebido: { bg: "#052e16", border: "#166534", color: "#4ade80", label: "Recebido" },
  pago: { bg: "#052e16", border: "#166534", color: "#4ade80", label: "Pago" },
  pendente: { bg: "#1c1400", border: "#713f12", color: "#facc15", label: "Pendente" },
  cancelado: { bg: "#1f0a0a", border: "#7f1d1d", color: "#f87171", label: "Cancelado" },
};

const EMPTY_DESPESA = { descricao: "", categoria: "Ferramentas / SaaS", metodo: "PIX", valor: "", data: today(), recorrencia: "Único", status: "pago", obs: "" };
const EMPTY_GASTO = { descricao: "", categoria: "Alimentação", metodo: "PIX", valor: "", data: today(), recorrencia: "Único", status: "pago", obs: "" };
const EMPTY_VENDA = { descricao: "", cliente: "", metodo: "PIX", faturamento: "", taxas: [{ label: "Taxa plataforma", pct: "" }], data: today(), status: "recebido", obs: "" };

function calcLiquido(faturamento, taxas) {
  const fat = parseFloat(faturamento) || 0;
  const totalPct = taxas.reduce((s, t) => s + (parseFloat(t.pct) || 0), 0);
  const totalDeducao = fat * (totalPct / 100);
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
const IconSettings = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
const IconBell = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
const IconClose = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  ;
const IconBusiness = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M3 21h18" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /><path d="M14 8h1" /><path d="M14 12h1" /><path d="M14 16h1" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /></svg>;
const IconUser = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IconChart = ({ size = 16 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>;
const IconTrendingUp = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
const IconPie = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>;
const IconClock = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconTarget = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;

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
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: var(--modal-bg); border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25); border: 1px solid var(--border); }
  
  .divider { height: 1px; background: var(--divider); }
  
  .filter-btn { padding: 7px 13px; border-radius: 8px; border: 1.5px solid var(--filter-btn-border); cursor: pointer; font-size: 12px; font-weight: 600; font-family: 'Syne', sans-serif; transition: all 0.15s; background: transparent; color: var(--text-muted); }
  
  ::-webkit-scrollbar { width: 4px; } 
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`;

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
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
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
const EMOJI_OPTIONS = ["💼", "📦", "🎯", "💰", "🛠", "📣", "🧾", "📚", "💻", "📂", "🏷", "🔧", "📊", "🖨", "🚀", "💡", "🎨", "🗂", "📱", "🌐", "🔑", "🏗", "✂️", "📐", "🧩"];
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 8 }}>
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
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 16, background: form.icon === e ? "#fff" : "transparent", borderColor: form.icon === e ? "#1a1a1a" : "#e0ddd8", transition: "all 0.1s" }}>
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
  return (
    <div className="card" style={{ overflow: "hidden" }}>
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
    if (editingIdx === null) setCats(p => [...p, newCat]);
    else setCats(p => p.map((c, i) => i === editingIdx ? newCat : c));
    setShowForm(false);
  };
  const deleteCat = (i) => setCats(p => p.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{cats.length} categorias</div>
        <button onClick={openAdd} style={{ background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14 }}>+</span> Nova
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: showForm ? 14 : 0 }}>
        {cats.map((c, i) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "var(--sidebar-bg)", border: "1px solid var(--divider)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${CAT_COLORS[c.label] || "#888"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{c.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
              {CAT_COLORS[c.label] && <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 1 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: CAT_COLORS[c.label], display: "inline-block" }} /><span style={{ fontSize: 10, color: "#bbb" }}>cor definida</span></div>}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <button className="btn-icon" onClick={() => openEdit(i)} style={{ color: "#6366f1" }}><IconEdit /></button>
              <button className="btn-icon" onClick={() => deleteCat(i)}><IconTrash /></button>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <div style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 11, marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{editingIdx === null ? "Nova categoria" : "Editar categoria"}</div>
          <input className="input" placeholder="Nome da categoria" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={{ background: "var(--bg)", color: "var(--text)" }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Ícone</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{EMOJI_OPTIONS.map(e => <button key={e} onClick={() => setForm(f => ({ ...f, icon: e }))} style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid", cursor: "pointer", fontSize: 15, background: form.icon === e ? "#fff" : "transparent", borderColor: form.icon === e ? "#1a1a1a" : "#e0ddd8" }}>{e}</button>)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Cor</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{COLOR_OPTIONS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 24, height: 24, borderRadius: 6, border: form.color === c ? "2.5px solid #1a1a1a" : "2px solid transparent", cursor: "pointer", background: c }} />)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: "var(--sidebar-bg)", border: "1px solid var(--divider)" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${form.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{form.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: form.color }}>{form.label || "Prévia"}</div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", color: "var(--text-muted)" }}>Cancelar</button>
            <button onClick={saveForm} style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "var(--bg)" }}>Salvar</button>
          </div>
        </div>
      )}
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
              <input autoFocus type="number" value={orcInput} onChange={e => setOrcInput(e.target.value)}
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

function ConfigPage({ categoriasPJ, setCategoriasPJ, categoriasPF, setCategoriasPF, orcamentos, setOrcamento, perfil, setPerfil, isPJ }) {
  const [draftPerfil, setDraftPerfil] = useState(perfil);
  const [section, setSection] = useState("perfil");
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDraftPerfil(p => ({ ...p, foto: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const savePerfil = () => {
    setPerfil(draftPerfil);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const SIDEBAR_ITEMS = [
    { key: "perfil", icon: <IconUser size={16} />, label: "Perfil" },
    { key: "cat-pj", icon: <IconBusiness size={16} />, label: "Categorias PJ" },
    { key: "cat-pf", icon: <IconUser size={16} />, label: "Categorias PF" },
    { key: "orc-pj", icon: <IconChart size={16} />, label: "Orçamentos PJ" },
    { key: "orc-pf", icon: <IconChart size={16} />, label: "Orçamentos PF" },
    { key: "prefs", icon: <IconSettings size={16} />, label: "Preferências" },
  ];

  return (
    <div style={{ display: "flex", gap: 0, minHeight: 600, background: "var(--card)", borderRadius: 18, border: "1px solid var(--border)", overflow: "hidden" }}
      onClick={e => e.stopPropagation()}>

      {/* ── Sidebar ── */}
      <div style={{ width: 220, background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)", padding: "24px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid var(--divider)", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.3px" }}>Configurações</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>freela.fin · MEI</div>
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
        {/* Mini profile at bottom */}
        <div style={{ padding: "16px 16px 0", borderTop: "1px solid var(--divider)", marginTop: 8 }}>
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
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: "32px 36px", overflowY: "auto" }}>

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

        {/* ── Preferências ── */}
        {section === "prefs" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.4px", marginBottom: 4 }}>Preferências</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Configurações do seu controle financeiro</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "diaFechamento", label: "Dia de fechamento do mês", sub: "Padrão: 20 (vencimento do DAS)", placeholder: "20", type: "number" },
                { key: "prolabore", label: "Meta de pró-labore mensal", sub: "Valor que deseja se pagar todo mês", placeholder: "R$ 0", type: "number" },
                { key: "metaReceita", label: "Meta de receita mensal (PJ)", sub: "Usado para calcular % de atingimento", placeholder: "R$ 0", type: "number" },
                { key: "reservaEmerg", label: "Meta de reserva de emergência", sub: "Quantos meses de despesa quer guardar", placeholder: "6", type: "number" },
                { key: "reservaAtual", label: "Reserva de Emergência Atual", sub: "Quanto você já tem guardado hoje", placeholder: "R$ 0", type: "number" },
              ].map(f => (
                <div key={f.key} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{f.sub}</div>
                  </div>
                  <input className="input" type={f.type} placeholder={f.placeholder} style={{ maxWidth: 140, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}
                    value={draftPerfil[f.key] || ""} onChange={e => setDraftPerfil(p => ({ ...p, [f.key]: e.target.value }))} />
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
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Valor personalizado do DAS</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Deixe em branco para usar o valor padrão do tipo de MEI</div>
                </div>
                <input className="input" type="number" placeholder="R$ 0,00" style={{ maxWidth: 140, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}
                  value={draftPerfil.valorDAS || ""} onChange={e => setDraftPerfil(p => ({ ...p, valorDAS: e.target.value }))} />
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
function CategoryBudgetView({ catBreakdown, orcamentos, setOrcamento, catIcon, isPJ, totals }) {
  const [editingBudget, setEditingBudget] = useState(null); // cat label
  const [budgetInput, setBudgetInput] = useState("");

  const startEdit = (cat, current) => {
    setEditingBudget(cat);
    setBudgetInput(current != null ? String(current) : "");
  };
  const commitEdit = (cat) => {
    setOrcamento(cat, budgetInput);
    setEditingBudget(null);
  };

  const withBudget = catBreakdown.filter(([cat]) => orcamentos[cat] != null);
  const withinBudget = withBudget.filter(([cat, val]) => val <= orcamentos[cat]).length;
  const total = isPJ ? totals.totalDesp : totals.totalGastos;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Score bar — only show if any budget defined */}
      {withBudget.length > 0 && (
        <div className="card" style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Controle de orçamento</div>
            <div style={{ fontSize: 13, color: "#555" }}>
              <span style={{ fontWeight: 800, color: withinBudget === withBudget.length ? "#16a34a" : "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{withinBudget}/{withBudget.length}</span>
              {" "}categorias dentro do orçamento
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {withBudget.map(([cat, val]) => {
              const orc = orcamentos[cat];
              const pct = orc ? val / orc : 0;
              const color = pct > 1 ? "#ef4444" : pct > 0.75 ? "#f59e0b" : "#4ade80";
              return (
                <div key={cat} title={`${cat}: ${Math.round(pct * 100)}%`}
                  style={{ width: 8, height: 32, borderRadius: 4, background: "#f0ede8", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${Math.min(pct, 1) * 100}%`, background: color, borderRadius: 4, transition: "height 0.4s ease" }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category rows */}
      <div className="card" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px" }}>
            {isPJ ? "Despesas por categoria" : "Gastos por categoria"}
          </div>
          <div style={{ fontSize: 11, color: "#bbb" }}>Clique no orçamento para editar</div>
        </div>

        {catBreakdown.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#ccc", fontSize: 13 }}>Nenhum registro no período</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {catBreakdown.map(([cat, val]) => {
            const orc = orcamentos[cat];
            const hasOrc = orc != null && orc > 0;
            const pct = hasOrc ? val / orc : 0;
            const barColor = hasOrc
              ? (pct > 1 ? "#ef4444" : pct > 0.75 ? "#f59e0b" : CAT_COLORS[cat] || "#888")
              : CAT_COLORS[cat] || "#888";
            const barWidth = hasOrc ? Math.min(pct, 1) * 100 : (total ? (val / total) * 100 : 0);
            const overBudget = hasOrc && val > orc;
            const isEditing = editingBudget === cat;

            return (
              <div key={cat}>
                {/* Row header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  {/* Left: icon + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{catIcon(cat)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{cat}</span>
                    {overBudget && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 5, padding: "1px 7px" }}>
                        +{fmt(val - orc)} acima
                      </span>
                    )}
                  </div>

                  {/* Right: spent + budget */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: barColor }}>
                      {fmt(val)}
                    </span>
                    <span style={{ fontSize: 12, color: "#ccc" }}>de</span>

                    {/* Budget field — inline edit */}
                    {isEditing ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          autoFocus
                          type="number"
                          value={budgetInput}
                          onChange={e => setBudgetInput(e.target.value)}
                          onBlur={() => commitEdit(cat)}
                          onKeyDown={e => { if (e.key === "Enter") commitEdit(cat); if (e.key === "Escape") setEditingBudget(null); }}
                          style={{ width: 100, background: "#fff", border: "1.5px solid #1a1a1a", borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", outline: "none", color: "#1a1a1a" }}
                          placeholder="R$ 0"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(cat, orc)}
                        style={{ background: hasOrc ? "#f5f2ed" : "transparent", border: hasOrc ? "1px solid #e0ddd8" : "1.5px dashed #d0cdc8", borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: hasOrc ? "#555" : "#bbb", transition: "all 0.15s" }}
                        title="Definir orçamento"
                      >
                        {hasOrc ? fmt(orc) : "Definir orçamento"}
                      </button>
                    )}

                    {hasOrc && !isEditing && (
                      <span style={{ fontSize: 11, color: pct > 1 ? "#ef4444" : pct > 0.75 ? "#f59e0b" : "#aaa", fontWeight: 600, minWidth: 38, textAlign: "right" }}>
                        {Math.round(pct * 100)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Dual bar */}
                <div style={{ height: 7, background: "#f0ede8", borderRadius: 99, overflow: "hidden", position: "relative" }}>
                  {/* Budget marker line */}
                  {hasOrc && (
                    <div style={{ position: "absolute", right: 0, top: 0, width: 2, height: "100%", background: "#ccc", zIndex: 2 }} />
                  )}
                  {/* Spent bar */}
                  <div style={{ height: "100%", width: `${barWidth}%`, background: barColor, borderRadius: 99, transition: "width 0.4s ease", position: "relative", zIndex: 1 }} />
                </div>

                {/* Sub-info */}
                {hasOrc && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#bbb" }}>
                      {total ? `${((val / total) * 100).toFixed(1)}% do total gasto` : ""}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: overBudget ? "#ef4444" : "#16a34a" }}>
                      {overBudget ? `Estourou ${fmt(val - orc)}` : `Sobram ${fmt(orc - val)}`}
                    </span>
                  </div>
                )}
                {!hasOrc && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#bbb" }}>
                      {total ? `${((val / total) * 100).toFixed(1)}% do total` : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ vendas, despesas, gastos, perfil, totals, dateRange, isPJ, catIcon }) {

  const chartData = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mLabel = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (isPJ) {
        const vMonth = vendas.filter(v => v.status === "recebido" && v.data.startsWith(mKey))
          .reduce((s, v) => s + calcLiquido(v.faturamento, v.taxas).liquido, 0);
        const dMonth = despesas.filter(d => d.status === "pago" && d.data.startsWith(mKey))
          .reduce((s, d) => s + d.valor, 0);
        months.push({ name: mLabel.charAt(0).toUpperCase() + mLabel.slice(1), receita: vMonth, despesa: dMonth });
      } else {
        const gMonth = gastos.filter(g => g.status === "pago" && g.data.startsWith(mKey))
          .reduce((s, g) => s + g.valor, 0);
        months.push({ name: mLabel.charAt(0).toUpperCase() + mLabel.slice(1), gasto: gMonth });
      }
    }
    return months;
  }, [vendas, despesas, gastos, isPJ]);

  const pjStats = useMemo(() => {
    if (!isPJ) return {};
    const vLiq = totals.totalLiq;
    const vBruto = vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange))
      .reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
    const ticketMedio = vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).length > 0
      ? vLiq / vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).length
      : 0;
    const margemLucro = vBruto > 0 ? (totals.resultado / vBruto) * 100 : 0;

    const salesByDay = {};
    vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).forEach(v => {
      const day = new Date(v.data).getDay();
      salesByDay[day] = (salesByDay[day] || 0) + calcLiquido(v.faturamento, v.taxas).liquido;
    });
    const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    let bestDayIdx = 0, maxSales = 0;
    Object.entries(salesByDay).forEach(([d, s]) => { if (s > maxSales) { maxSales = s; bestDayIdx = d; } });
    const melhorDia = maxSales > 0 ? weekDays[bestDayIdx] : "—";

    const currentYear = new Date().getFullYear();
    const anualVendas = vendas.filter(v => v.status === "recebido" && v.data.startsWith(String(currentYear)))
      .reduce((s, v) => s + (parseFloat(v.faturamento) || 0), 0);
    const pctLimiteMEI = (anualVendas / 81000) * 100;

    const catDataMap = {};
    vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).forEach(v => {
      const cat = v.categoria || "Outro PJ";
      catDataMap[cat] = (catDataMap[cat] || 0) + calcLiquido(v.faturamento, v.taxas).liquido;
    });
    return { ticketMedio, margemLucro, melhorDia, anualVendas, pctLimiteMEI, catChartData: Object.entries(catDataMap).map(([name, value]) => ({ name, value })) };
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

    // Reserva
    const avgSpend = totalGasto || 1;
    const reservaMeses = (parseFloat(perfil.reservaAtual) || 0) / avgSpend;
    const metaReservaMeses = parseFloat(perfil.reservaEmerg) || 6;

    // Pró-labore vs Gastos
    const pl = parseFloat(perfil.prolabore) || 0;
    const taxaEconomia = pl > 0 ? ((pl - totalGasto) / pl) * 100 : 0;

    // Ralos
    const catMap = {};
    currentGastos.forEach(g => catMap[g.categoria] = (catMap[g.categoria] || 0) + g.valor);
    const raloSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return { totalGasto, rule503020, reservaMeses, metaReservaMeses, taxaEconomia, raloSorted };
  }, [gastos, perfil, dateRange, isPJ]);

  const meta = parseFloat(perfil.metaReceita) || 10000;
  const pctMeta = meta > 0 ? (totals.totalLiq / meta) * 100 : 0;

  if (isPJ) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bem-vindo de volta,</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>{perfil.empresa || "Sua Empresa"} ✨</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#6366f1" }}><IconTrendingUp size={16} /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Ticket Médio</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(pjStats.ticketMedio)}</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#16a34a" }}><IconTarget size={16} /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Margem Real</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "#16a34a" }}>{fmtPct(pjStats.margemLucro)}</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#f59e0b" }}><IconClock size={16} /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Melhor Dia</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{pjStats.melhorDia}</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#ef4444" }}><IconTrendingUp size={16} /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Ponto Equilíbrio</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(totals.totalDesp)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Limite MEI — Anual</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(pjStats.anualVendas)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: pjStats.pctLimiteMEI > 80 ? "#ef4444" : "var(--text-muted)" }}>{Math.round(pjStats.pctLimiteMEI)}%</div>
              </div>
              <div style={{ height: 6, background: "var(--divider)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pjStats.pctLimiteMEI, 100)}%`, background: pjStats.pctLimiteMEI > 85 ? "#ef4444" : "#f59e0b", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 8, fontWeight: 600 }}>Teto anual: R$ 81.000,00</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ color: "#16a34a" }}>🏢</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>Saúde do Negócio</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "14px 16px", background: "var(--bg)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, marginBottom: 4 }}>ESTIMATIVA DE SOBRA (PJ)</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: totals.resultado >= 0 ? "#16a34a" : "#ef4444", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(totals.resultado)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 4 }}>DEDUÇÕES TOTAIS</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444" }}>{fmt(totals.totalDeducao)}</div>
                </div>
                <div style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 4 }}>VENDAS NO MÊS</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{vendas.filter(v => v.status === "recebido" && inDateRange(v.data, dateRange)).length}</div>
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
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bem-vindo de volta,</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>{perfil.apelido || perfil.nome || "Visitante"} ✨</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#16a34a" }}>🛡️</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Meses Seguros</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: pfStats.reservaMeses >= pfStats.metaReservaMeses ? "#16a34a" : "#f59e0b" }}>
              {pfStats.reservaMeses.toFixed(1)} meses
            </div>
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
              <div style={{ color: "#ef4444" }}>💸</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Total Gastos</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)" }}>{fmt(pfStats.totalGasto)}</div>
          </div>
          <div className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#f59e0b" }}>🍴</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>Maior Gasto</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{pfStats.raloSorted[0] ? pfStats.raloSorted[0][0] : "—"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 14 }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

            {/* Emergency Fund Card */}
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Reserva de Emergência</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>MESES GARANTIDOS</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono',monospace" }}>{pfStats.reservaMeses.toFixed(1)} / {pfStats.metaReservaMeses}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{fmt(parseFloat(perfil.reservaAtual) || 0)}</div>
              </div>
              <div style={{ height: 8, background: "var(--divider)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${Math.min((pfStats.reservaMeses / pfStats.metaReservaMeses) * 100, 100)}%`, background: "#16a34a", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>Cálculo baseado na média de gastos mensal.</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "24px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", marginBottom: 16 }}>Top categorias (Ralos de dinheiro)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [context, setContext] = useState("pj"); // "pj" | "pf"
  const [page, setPage] = useState("main");     // "main" | "config"
  const [view, setView] = useState("dashboard"); // "dashboard" | "lista" | "categorias"
  const [modal, setModal] = useState(null);     // { type, mode, record? }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Data
  const [vendas, setVendas] = useState([
    { id: 1, descricao: "Proteção Veicular Premium", categoria: "Serviço prestado", cliente: "João Silva", metodo: "PIX", faturamento: 850, taxas: [{ label: "Taxa plataforma", pct: 5 }, { label: "Repasse", pct: 10 }], data: "2024-01-15", status: "recebido", obs: "" },
    { id: 2, descricao: "Plano Básico", categoria: "Serviço prestado", cliente: "Maria Santos", metodo: "Cartão Crédito", faturamento: 520, taxas: [{ label: "Taxa plataforma", pct: 5 }, { label: "Taxa cartão", pct: 2.5 }], data: "2024-01-18", status: "recebido", obs: "Parcelado 3x" },
    { id: 3, descricao: "Consultoria onboarding", categoria: "Consultoria", cliente: "Pedro Rocha", metodo: "PIX", faturamento: 300, taxas: [{ label: "Taxa plataforma", pct: 5 }], data: "2024-01-20", status: "pendente", obs: "" },
  ]);
  const [despesas, setDespesas] = useState([
    { id: 1, descricao: "Notion + Linear", categoria: "Ferramentas / SaaS", metodo: "Cartão Crédito", valor: 87, data: "2024-01-08", recorrencia: "Mensal", status: "pago", obs: "Ferramentas de trabalho" },
    { id: 2, descricao: "DAS MEI Janeiro", categoria: "Impostos / DAS", metodo: "PIX", valor: 75.90, data: "2024-01-20", recorrencia: "Mensal", status: "pendente", obs: "Vence dia 20" },
    { id: 3, descricao: "Curso de vendas", categoria: "Educação", metodo: "PIX", valor: 297, data: "2024-01-14", recorrencia: "Único", status: "pago", obs: "" },
  ]);
  const [gastos, setGastos] = useState([
    { id: 1, descricao: "Aluguel", categoria: "Moradia", metodo: "Transferência", valor: 1800, data: "2024-01-05", recorrencia: "Mensal", status: "pago", obs: "" },
    { id: 2, descricao: "Supermercado", categoria: "Alimentação", metodo: "Cartão Débito", valor: 320, data: "2024-01-10", recorrencia: "Único", status: "pago", obs: "" },
    { id: 3, descricao: "Combustível", categoria: "Transporte", metodo: "Dinheiro", valor: 180, data: "2024-01-12", recorrencia: "Único", status: "pago", obs: "" },
  ]);

  // Categories (both editable)
  const [categoriasPJ, setCategoriasPJ] = useState(CATEGORIAS_PJ_DEFAULT);
  const [categoriasPF, setCategoriasPF] = useState(CATEGORIAS_PF_DEFAULT);
  // Budgets: { [categoria]: number }
  const [orcamentos, setOrcamentos] = useState({
    "Moradia": 1800, "Alimentação": 500, "Transporte": 300,
  });
  const setOrcamento = (cat, val) => setOrcamentos(o => ({ ...o, [cat]: val === "" ? undefined : parseFloat(val) || 0 }));

  // Perfil
  const [perfil, setPerfil] = useState({ nome: "", apelido: "", tipo: "Serviços", profissao: "", cnpj: "", cpf: "", email: "", tel: "", empresa: "", foto: null, diaFechamento: "20", prolabore: "", metaReceita: "", reservaEmerg: "6", reservaAtual: "", darkMode: false });

  // Forms
  const [formVenda, setFormVenda] = useState(EMPTY_VENDA);
  const [formDespesa, setFormDespesa] = useState(EMPTY_DESPESA);
  const [formGasto, setFormGasto] = useState(EMPTY_GASTO);

  // Filters
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = useMemo(() => {
    const list = [];
    const dasValue = parseFloat(perfil.valorDAS) || (perfil.tipo === "Serviços" ? 75.60 : 71.60);
    const hasPaidDAS = despesas.some(d => d.categoria === "Impostos / DAS" && d.status === "pago" && d.data.startsWith(thisMonth()));
    const isAfterDay1 = new Date().getDate() >= 1;

    if (isAfterDay1 && !hasPaidDAS) {
      list.push({
        id: "das",
        title: "DAS MEI pendente",
        desc: `Vence dia 20. Valor: ${fmt(dasValue)}`,
        icon: "🧾",
        type: "warning"
      });
    }
    return list;
  }, [despesas, perfil]);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const closeModal = () => setModal(null);
  const isPJ = context === "pj";

  // ── Modal openers ──
  const openAddVenda = () => { setFormVenda(EMPTY_VENDA); setModal({ type: "venda", mode: "add" }); };
  const openEditVenda = (r) => { setFormVenda({ ...r, faturamento: String(r.faturamento), taxas: r.taxas.map(t => ({ ...t, pct: String(t.pct) })) }); setModal({ type: "venda", mode: "edit", record: r }); };
  const openViewVenda = (r) => setModal({ type: "venda", mode: "view", record: r });

  const openAddDespesa = () => { setFormDespesa(EMPTY_DESPESA); setModal({ type: "despesa", mode: "add" }); };
  const openEditDespesa = (r) => { setFormDespesa({ ...r, valor: String(r.valor) }); setModal({ type: "despesa", mode: "edit", record: r }); };
  const openViewDespesa = (r) => setModal({ type: "despesa", mode: "view", record: r });

  const openAddGasto = () => { setFormGasto(EMPTY_GASTO); setModal({ type: "gasto", mode: "add" }); };
  const openEditGasto = (r) => { setFormGasto({ ...r, valor: String(r.valor) }); setModal({ type: "gasto", mode: "edit", record: r }); };
  const openViewGasto = (r) => setModal({ type: "gasto", mode: "view", record: r });

  // ── Saves ──
  const saveVenda = () => {
    if (!formVenda.descricao || !formVenda.faturamento) return;
    const v = { ...formVenda, faturamento: parseFloat(formVenda.faturamento), taxas: formVenda.taxas.map(t => ({ ...t, pct: parseFloat(t.pct) || 0 })), id: modal.mode === "edit" ? modal.record.id : Date.now() };
    modal.mode === "add" ? setVendas(a => [...a, v]) : setVendas(a => a.map(x => x.id === v.id ? v : x));
    closeModal();
  };
  const saveDespesa = () => {
    if (!formDespesa.descricao || !formDespesa.valor) return;
    const v = { ...formDespesa, valor: parseFloat(formDespesa.valor), id: modal.mode === "edit" ? modal.record.id : Date.now() };
    modal.mode === "add" ? setDespesas(a => [...a, v]) : setDespesas(a => a.map(x => x.id === v.id ? v : x));
    closeModal();
  };
  const saveGasto = () => {
    if (!formGasto.descricao || !formGasto.valor) return;
    const v = { ...formGasto, valor: parseFloat(formGasto.valor), id: modal.mode === "edit" ? modal.record.id : Date.now() };
    modal.mode === "add" ? setGastos(a => [...a, v]) : setGastos(a => a.map(x => x.id === v.id ? v : x));
    closeModal();
  };

  // ── Deletes ──
  const doDelete = (id) => {
    if (deleteConfirm.type === "venda") setVendas(a => a.filter(x => x.id !== id));
    if (deleteConfirm.type === "despesa") setDespesas(a => a.filter(x => x.id !== id));
    if (deleteConfirm.type === "gasto") setGastos(a => a.filter(x => x.id !== id));
    setDeleteConfirm(null); closeModal();
  };

  // ── Filter helpers ──
  const applyFilters = (records) => records.filter(r => {
    const matchSearch = !search || r.descricao?.toLowerCase().includes(search.toLowerCase()) || r.cliente?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || r.status === filterStatus;
    const matchDate = inDateRange(r.data, dateRange);
    return matchSearch && matchStatus && matchDate;
  });

  const filteredVendas = applyFilters(vendas);
  const filteredDespesas = applyFilters(despesas);
  const filteredGastos = applyFilters(gastos);

  // ── Totals ──
  const totals = useMemo(() => {
    const vendasRec = vendas.filter(v => inDateRange(v.data, dateRange) && v.status === "recebido");
    const totalBruto = vendasRec.reduce((s, v) => s + v.faturamento, 0);
    const totalLiq = vendasRec.reduce((s, v) => s + calcLiquido(v.faturamento, v.taxas).liquido, 0);
    const totalDesp = despesas.filter(d => inDateRange(d.data, dateRange) && d.status === "pago").reduce((s, d) => s + d.valor, 0);
    const totalGastos = gastos.filter(g => inDateRange(g.data, dateRange) && g.status === "pago").reduce((s, g) => s + g.valor, 0);

    const totalDeducao = totalBruto - totalLiq;

    return {
      totalBruto, totalLiq, totalDesp, totalGastos, totalDeducao,
      resultado: totalLiq - totalDesp,
      pendentesPJ: vendas.filter(v => v.status === "pendente").reduce((s, v) => s + v.faturamento, 0) + despesas.filter(d => d.status === "pendente").reduce((s, d) => s + d.valor, 0),
      pendentesGasto: gastos.filter(g => g.status === "pendente").reduce((s, g) => s + g.valor, 0)
    };
  }, [vendas, despesas, gastos, dateRange]);

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
  const addTaxa = () => setFormVenda(f => ({ ...f, taxas: [...f.taxas, { label: "", pct: "" }] }));
  const removeTaxa = (i) => setFormVenda(f => ({ ...f, taxas: f.taxas.filter((_, idx) => idx !== i) }));
  const updateTaxa = (i, field, val) => setFormVenda(f => ({ ...f, taxas: f.taxas.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }));
  const previewVenda = useMemo(() => calcLiquido(formVenda.faturamento, formVenda.taxas), [formVenda.faturamento, formVenda.taxas]);

  // ── Summary cards config ──
  const summaryCards = isPJ ? [
    { label: "Receita Líquida", value: fmt(totals.totalLiq), sub: "já descontando taxas", accent: "#16a34a" },
    { label: "Despesas PJ", value: fmt(totals.totalDesp), sub: "contas da empresa", accent: "#ef4444" },
    { label: "Resultado (Lucro)", value: fmt(totals.resultado), sub: "líquido final", accent: totals.resultado >= 0 ? "#16a34a" : "#ef4444" },
    { label: "Pendentes", value: fmt(totals.pendentesPJ), sub: "a receber/pagar", accent: "#f59e0b" },
  ] : [
    { label: "Total Gasto", value: fmt(totals.totalGastos), sub: "contas pessoais", accent: "#6366f1" },
    { label: "Orçamento total", value: fmt(Object.values(orcamentos).reduce((a, b) => a + b, 0)), sub: "limite mensal", accent: "#aaa" },
    { label: "Disponível", value: fmt(Math.max(0, Object.values(orcamentos).reduce((a, b) => a + b, 0) - totals.totalGastos)), sub: "até o fim do mês", accent: "#4ade80" },
    { label: "Pendentes", value: fmt(totals.pendentesGasto), sub: "a pagar", accent: "#f59e0b" },
  ];

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
    { label: "Status", w: "1fr", render: r => { const s = STATUS_STYLE[r.status]; return <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>; } },
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

  const gastosCols = despesasCols; // same shape

  return (
    <div className={perfil.darkMode ? "dark" : ""} style={{ fontFamily: "'Syne',sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}
      onClick={() => { if (page === "config") setPage("main"); }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div style={{ background: "#1a1a1a", padding: "0 32px" }} onClick={e => e.stopPropagation()}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f5f2ed", letterSpacing: "-0.5px" }}>freela.fin</div>
              <div style={{ fontSize: 11, color: "#666", fontWeight: 600, fontFamily: "'Syne',sans-serif", marginTop: 1 }}>
                Olá, <span style={{ color: "#aaa" }}>{context === "pj" ? (perfil.empresa || "Sua Empresa") : (perfil.apelido || perfil.nome || "Visitante")}</span>
              </div>
            </div>
            {/* Context switcher - uses fixed colors for dark background header */}
            <div style={{ display: "flex", background: "#2a2a2a", borderRadius: 10, padding: 3, marginLeft: 8 }}>
              {[{ key: "pj", label: "Empresa", icon: <IconBusiness size={15} /> }, { key: "pf", label: "Pessoal", icon: <IconUser size={15} /> }].map((item) => (
                <button key={item.key} onClick={() => { setContext(item.key); setSearch(""); setFilterStatus("todos"); setPage("main"); }}
                  style={{
                    width: 108, height: 34, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: context === item.key ? "#f5f2ed" : "transparent", color: context === item.key ? "#1a1a1a" : "#666"
                  }}>{item.icon} {item.label}</button>
              ))}
            </div>
          </div>

          {/* Header actions — fixed layout, never shifts */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {/* Slot 1: "Cadastrar venda" — always reserves space, hidden on PF or config */}
            <button
              className="btn btn-green"
              onClick={openAddVenda}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: 148, height: 38, fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", borderRadius: 10, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                background: (page === "main" && isPJ) ? "#16a34a" : "transparent",
                color: (page === "main" && isPJ) ? "#fff" : "transparent",
                pointerEvents: (page === "main" && isPJ) ? "auto" : "none"
              }}>
              <span style={{ fontSize: 15 }}>+</span> Cadastrar venda
            </button>
            {/* Slot 2: "Nova despesa" / "Novo gasto" — always same width */}
            <button
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: 136, height: 38, fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", borderRadius: 10, border: "none", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                background: page === "main" ? "var(--bg)" : "transparent",
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
                  background: showNotifications ? "var(--bg)" : "#2a2a2a", color: showNotifications ? "var(--text)" : "#888"
                }}>
                <IconBell size={20} />
                {notifications.length > 0 && (
                  <div style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, width: 16, height: 16, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--sidebar-bg)" }}>
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
            <button onClick={() => { setPage(p => p === "config" ? "main" : "config"); setShowNotifications(false); }}
              title="Configurações"
              style={{
                width: 38, height: 38, borderRadius: 10, border: page === "config" ? "2px solid var(--bg)" : "2px solid #2a2a2a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0,
                background: "#2a2a2a", overflow: "hidden"
              }}>
              {perfil.foto ? (
                <img src={perfil.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <svg width="20" height="20" fill="none" stroke={page === "config" ? "var(--bg)" : "#888"} strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px" }}>

        {/* ── Config page ── */}
        {page === "config" && (
          <ConfigPage
            categoriasPJ={categoriasPJ} setCategoriasPJ={setCategoriasPJ}
            categoriasPF={categoriasPF} setCategoriasPF={setCategoriasPF}
            orcamentos={orcamentos} setOrcamento={setOrcamento}
            perfil={perfil} setPerfil={setPerfil}
            isPJ={isPJ}
          />
        )}

        {/* ── Main page ── */}
        {page === "main" && <>

          {/* ── Summary cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
            {summaryCards.map((c, i) => (
              <div key={i} className="card" style={{ padding: "18px 20px", borderTop: `3px solid ${c.accent}` }}>
                <div style={{ fontSize: 10, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", color: c.accent, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3, minHeight: 26 }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* ── View toggle ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", background: "var(--divider)", borderRadius: 10, padding: 3 }}>
              {[["dashboard", "Dashboard"], ["lista", "Lista"], ["categorias", "Por categoria"]].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)}
                  style={{
                    padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Syne',sans-serif", transition: "all 0.15s",
                    background: view === k ? "var(--card)" : "transparent", color: view === k ? "var(--text)" : "var(--text-dim)", boxShadow: view === k ? "0 1px 4px rgba(0,0,0,0.12)" : "none"
                  }}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-outline" style={{ padding: "6px 12px", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => exportCSV(isPJ ? [...filteredVendas, ...filteredDespesas] : filteredGastos, `relatorio_${context}`)}>
                📥 Exportar CSV
              </button>
              <div style={{ fontSize: 12, color: "#aaa" }}>
                {isPJ ? `${filteredVendas.length} venda${filteredVendas.length !== 1 ? "s" : ""} · ${filteredDespesas.length} despesa${filteredDespesas.length !== 1 ? "s" : ""}` : `${filteredGastos.length} gasto${filteredGastos.length !== 1 ? "s" : ""}`}
              </div>
            </div>
          </div>

          {/* ── Date filter ── */}
          <div style={{ marginBottom: 16 }}>
            <DateFilterBar range={dateRange} setRange={setDateRange} />
          </div>

          {/* ── Search + status filter ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar descrição ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              {["todos", "recebido", "pago", "pendente", "cancelado"].filter(s => isPJ ? s !== "pago" : s !== "recebido").map(s => (
                <button key={s} className="filter-btn" onClick={() => setFilterStatus(s)}
                  style={{
                    borderColor: filterStatus === s ? "var(--text)" : "var(--filter-btn-border)",
                    background: filterStatus === s ? "var(--text)" : "transparent",
                    color: filterStatus === s ? "var(--bg)" : "var(--text-muted)"
                  }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Dashboard view ── */}
          {view === "dashboard" && <Dashboard vendas={vendas} despesas={despesas} gastos={gastos} perfil={perfil} totals={totals} dateRange={dateRange} isPJ={isPJ} catIcon={catIcon} />}

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
              <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Gastos pessoais</div>
              <RecordTable records={filteredGastos} columns={gastosCols}
                onView={openViewGasto} onEdit={openEditGasto} onDelete={id => setDeleteConfirm({ id, type: "gasto" })}
                emptyMsg="Nenhum gasto no período" />
            </div>
          )}

        </>}
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* ── Venda Add/Edit ── */}
      {modal && modal.type === "venda" && (modal.mode === "add" || modal.mode === "edit") && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
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
                <div>{lbl("Faturamento bruto *")}<input className="input" type="number" placeholder="R$ 0,00" value={formVenda.faturamento} onChange={e => setFormVenda(f => ({ ...f, faturamento: e.target.value }))} /></div>
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
                    <div style={{ position: "relative" }}>
                      <input className="input" type="number" placeholder="0" value={t.pct} onChange={e => updateTaxa(i, "pct", e.target.value)} style={{ paddingRight: 28 }} />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#aaa" }}>%</span>
                    </div>
                    <button className="btn-icon" onClick={() => removeTaxa(i)} style={{ color: "#e05" }}><IconClose /></button>
                  </div>
                ))}
              </div>
              {formVenda.faturamento && (
                <div style={{ background: "#f5f2ed", borderRadius: 12, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[["Bruto", fmt(previewVenda.fat), "#1a1a1a"], [`Dedução (${fmtPct(previewVenda.totalPct)})`, `−${fmt(previewVenda.totalDeducao)}`, "#c0392b"], ["Líquido", fmt(previewVenda.liquido), "#16a34a"]].map(([label, val, color]) => (
                    <div key={label}><div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, opacity: 0.7 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color }}>{val}</div></div>
                  ))}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>{lbl("Status")}<select className="input" value={formVenda.status} onChange={e => setFormVenda(f => ({ ...f, status: e.target.value }))}><option value="recebido">Recebido</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select></div>
                <div>{lbl("Categoria")}<select className="input" value={formVenda.categoria || ""} onChange={e => setFormVenda(f => ({ ...f, categoria: e.target.value }))}>
                  {categoriasPJ.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Nova despesa" : "Editar despesa"}</div>
              <button className="btn-icon" onClick={closeModal}><IconClose /></button>
            </div>
            <div className="divider" />
            <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>{lbl("Descrição *")}<input className="input" placeholder="Ex: DAS MEI, Ferramenta, Equipamento..." value={formDespesa.descricao} onChange={e => setFormDespesa(f => ({ ...f, descricao: e.target.value }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>{lbl("Valor *")}<input className="input" type="number" placeholder="R$ 0,00" value={formDespesa.valor} onChange={e => setFormDespesa(f => ({ ...f, valor: e.target.value }))} /></div>
                <div>{lbl("Data")}<input className="input" type="date" value={formDespesa.data} onChange={e => setFormDespesa(f => ({ ...f, data: e.target.value }))} /></div>
              </div>
              <div>{lbl("Categoria")}<CatGridEditable cats={categoriasPJ} value={formDespesa.categoria} onChange={v => setFormDespesa(f => ({ ...f, categoria: v }))} onCatsChange={setCategoriasPJ} /></div>
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div style={{ padding: "24px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{modal.mode === "add" ? "Novo gasto" : "Editar gasto"}</div>
              <button className="btn-icon" onClick={closeModal}><IconClose /></button>
            </div>
            <div className="divider" />
            <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>{lbl("Descrição *")}<input className="input" placeholder="Ex: Aluguel, Supermercado, Combustível..." value={formGasto.descricao} onChange={e => setFormGasto(f => ({ ...f, descricao: e.target.value }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>{lbl("Valor *")}<input className="input" type="number" placeholder="R$ 0,00" value={formGasto.valor} onChange={e => setFormGasto(f => ({ ...f, valor: e.target.value }))} /></div>
                <div>{lbl("Data")}<input className="input" type="date" value={formGasto.data} onChange={e => setFormGasto(f => ({ ...f, data: e.target.value }))} /></div>
              </div>
              <div>{lbl("Categoria")}<CatGridEditable cats={categoriasPF} value={formGasto.categoria} onChange={v => setFormGasto(f => ({ ...f, categoria: v }))} onCatsChange={setCategoriasPF} /></div>
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
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
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
                <div style={{ background: "#f5f2ed", borderRadius: 14, padding: "16px 20px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {[["Faturamento", fmt(r.faturamento), "#1a1a1a"], [`Deduções (${fmtPct(c.totalPct)})`, `−${fmt(c.totalDeducao)}`, "#c0392b"], ["Líquido", fmt(c.liquido), "#16a34a"]].map(([label, val, color]) => (
                    <div key={label}><div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color }}>{val}</div></div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Breakdown</div>
                  {r.taxas.map((t, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < r.taxas.length - 1 ? "1px solid #f0ede8" : "none" }}>
                      <span style={{ fontSize: 13, color: "#444" }}>{t.label}</span>
                      <span style={{ fontSize: 12, color: "#c0392b", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>−{fmt(r.faturamento * (t.pct / 100))} <span style={{ color: "#bbb" }}>({fmtPct(t.pct)})</span></span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>Método: <strong style={{ color: "#444" }}>{r.metodo}</strong>{r.obs && <> · {r.obs}</>}</div>
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
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
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
                <div style={{ background: "#f5f2ed", borderRadius: 14, padding: "20px", marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Valor</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#c0392b", fontFamily: "'JetBrains Mono',monospace" }}>−{fmt(r.valor)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Método", r.metodo], ["Recorrência", r.recorrencia], ["Status", <span className="tag" style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>], ["Observação", r.obs || "—"]].map(([label, val], i) => (
                    <div key={i} style={{ background: "#faf9f7", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
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
    </div>
  );
}
