import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

// ─── Auth Page ────────────────────────────────────────────────────────────────
export default function AuthPage({ initialView = "login", onPasswordResetComplete }) {
  const [view, setView] = useState(initialView);
  const [loading, setLoading] = useState(false);
  const [authToast, setAuthToast] = useState(null);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [nome, setNome] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // "terms" | "privacy" | null

  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);

  const toast = (msg, err = false) => { setAuthToast({ msg, err }); setTimeout(() => setAuthToast(null), 4000); };
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const resetForm = () => { setEmail(""); setPwd(""); setPwd2(""); setNome(""); setShowPwd(false); };
  const go = (v) => { resetForm(); setView(v); };

  // ── Login ──
  const doLogin = async (e) => {
    e.preventDefault();
    if (!email || !pwd) return toast("Preencha todos os campos", true);
    if (!validEmail(email)) return toast("E-mail inválido", true);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setLoading(false);
    if (error) {
      if (error.message.includes("Invalid login")) toast("E-mail ou senha incorretos", true);
      else if (error.message.includes("Email not confirmed")) toast("Confirme seu e-mail primeiro. Verifique a caixa de entrada.", true);
      else toast(error.message, true);
    }
  };

  // ── Register ──
  const doRegister = async (e) => {
    e.preventDefault();
    if (!nome || !email || !pwd || !pwd2) return toast("Preencha todos os campos", true);
    if (!validEmail(email)) return toast("E-mail inválido", true);
    if (pwd.length < 6) return toast("Mínimo 6 caracteres na senha", true);
    if (pwd !== pwd2) return toast("As senhas não coincidem", true);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password: pwd,
      options: { data: { full_name: nome }, emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("already registered")) toast("Este e-mail já está cadastrado", true);
      else toast(error.message, true);
    } else if (data.user?.identities?.length === 0) {
      toast("Este e-mail já está cadastrado", true);
    } else {
      setView("confirm");
    }
  };

  // ── Forgot Password ──
  const doForgot = async (e) => {
    e.preventDefault();
    if (!email) return toast("Digite seu e-mail", true);
    if (!validEmail(email)) return toast("E-mail inválido", true);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setLoading(false);
    if (error) toast(error.message, true);
    else setView("forgot-sent");
  };

  // ── Reset Password ──
  const doReset = async (e) => {
    e.preventDefault();
    if (!pwd || !pwd2) return toast("Preencha todos os campos", true);
    if (pwd.length < 6) return toast("Mínimo 6 caracteres", true);
    if (pwd !== pwd2) return toast("As senhas não coincidem", true);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) toast(error.message, true);
    else {
      toast("Senha redefinida com sucesso!");
      setTimeout(() => { if (onPasswordResetComplete) onPasswordResetComplete(); }, 2000);
    }
  };

  // ── Google OAuth ──
  const doGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) toast(error.message, true);
  };

  // ── Password Strength ──
  const pwdStr = useMemo(() => {
    if (!pwd || (view !== "register" && view !== "reset")) return null;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return [[0, "", "#e8e5e0"], [25, "Fraca", "#ef4444"], [50, "Regular", "#f59e0b"], [75, "Boa", "#10b981"], [100, "Forte", "#16a34a"]][Math.min(s, 4)];
  }, [pwd, view]);

  // ── Icons ──
  const EyeOn = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
  const EyeOff = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
  const GoogleIcon = () => <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>;
  const Spinner = () => <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />;

  // ── Shared Styles ──
  const inp = { width: "100%", padding: "14px 16px", border: "1.5px solid #e0ddd8", borderRadius: 12, fontFamily: "'Syne',sans-serif", fontSize: 14, background: "#fff", color: "#1a1a1a", outline: "none", transition: "border 0.2s, box-shadow 0.2s", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 };
  const btnP = { width: "100%", height: 50, border: "none", borderRadius: 12, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, fontStyle: "italic", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#4BE277", color: "#0a0a0a", opacity: loading ? 0.6 : 1, letterSpacing: "-0.3px" };
  const btnG = { width: "100%", height: 50, border: "1.5px solid #e0ddd8", borderRadius: 12, fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", color: "#1a1a1a" };
  const lnk = { color: "#4BE277", fontWeight: 700, cursor: "pointer", background: "none", border: "none", fontFamily: "'Syne',sans-serif", fontSize: 13, padding: 0 };
  const divider = <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "24px 0", color: "#ccc", fontSize: 12, fontWeight: 600 }}><div style={{ flex: 1, height: 1, background: "#e8e5e0" }} /><span>ou</span><div style={{ flex: 1, height: 1, background: "#e8e5e0" }} /></div>;

  const pwdInput = (placeholder = "••••••••", autoC = "current-password") => (
    <div style={{ position: "relative" }}>
      <input className="af" type={showPwd ? "text" : "password"} placeholder={placeholder} value={pwd} onChange={e => setPwd(e.target.value)} style={{ ...inp, paddingRight: 44 }} autoComplete={autoC} />
      <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 4, display: "flex" }}>
        {showPwd ? <EyeOff /> : <EyeOn />}
      </button>
    </div>
  );

  const pwdBar = pwdStr && pwd ? (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 3, background: "#e8e5e0", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pwdStr[0]}%`, background: pwdStr[2], borderRadius: 2, transition: "all 0.3s" }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: pwdStr[2], marginTop: 4 }}>{pwdStr[1]}</div>
    </div>
  ) : null;

  const FeatureIcons = {
    pj: () => <svg width="20" height="20" fill="none" stroke="#4BE277" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    das: () => <svg width="20" height="20" fill="none" stroke="#4BE277" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    prolabore: () => <svg width="20" height="20" fill="none" stroke="#4BE277" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    relatorio: () => <svg width="20" height="20" fill="none" stroke="#4BE277" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    seguro: () => <svg width="20" height="20" fill="none" stroke="#4BE277" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  };
  const FEATURES = [
    [FeatureIcons.pj, "Separação PJ / PF", "Controle inteligente empresa vs pessoal"],
    [FeatureIcons.das, "DAS Automático", "Acompanhe e nunca esqueça o imposto"],
    [FeatureIcons.prolabore, "Pró-labore e Metas", "Saiba quanto se pagar e onde investir"],
    [FeatureIcons.relatorio, "Relatórios e DRE", "Visão completa da saúde do negócio"],
    [FeatureIcons.seguro, "Dados Seguros", "Criptografia e backup na nuvem"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", padding: "12px", fontFamily: "'Syne',sans-serif", boxSizing: "border-box" }}>
    <div style={{ display: "flex", minHeight: "calc(100vh - 24px)", border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: 16, overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes authPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes greenGlow { 0%, 100% { opacity: 0.12; transform: scale(1); } 50% { opacity: 0.22; transform: scale(1.05); } }
        .auth-fade { animation: fadeSlideIn 0.35s ease-out; }
        .af:focus { border-color: #4BE277 !important; box-shadow: 0 0 0 3px rgba(75,226,119,0.15) !important; }
        .af::placeholder { color: #bbb !important; }
        .abh:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(75,226,119,0.35) !important; }
        .agh:hover { background: #f5f5f5 !important; border-color: #ccc !important; }
        .alh:hover { color: #2ea855 !important; }
        .glass-card { background: #ffffff; border-radius: 20px; padding: 36px; }
        @media (max-width: 768px) { .auth-brand-panel { display: none !important; } .auth-form-side { padding: 24px 16px !important; background: #fff !important; } .glass-card { padding: 28px 20px !important; } }
        .auth-toast-anim { animation: fadeSlideIn 0.3s ease-out; }
      `}</style>

      {/* ── Brand Panel (Desktop) ── */}
      <div className="auth-brand-panel" style={{
        flex: 1, background: "linear-gradient(145deg, #050505 0%, #0a0a0a 50%, #0d1a0d 100%)",
        display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 56px",
        position: "relative", overflow: "hidden", minWidth: 0
      }}>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "70%", height: "80%", background: "radial-gradient(circle, rgba(75,226,119,0.15) 0%, transparent 65%)", pointerEvents: "none", animation: "greenGlow 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-25%", left: "-10%", width: "55%", height: "70%", background: "radial-gradient(circle, rgba(75,226,119,0.08) 0%, transparent 55%)", pointerEvents: "none", animation: "greenGlow 12s ease-in-out infinite 3s" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(75,226,119,0.6)", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 12 }}>Gestão Financeira MEI</div>
          <div style={{ fontSize: 44, fontWeight: 800, fontStyle: "italic", color: "#f5f2ed", letterSpacing: "-2px", lineHeight: 1.05, marginBottom: 12 }}>Finanças<br /><span style={{ color: "#4BE277" }}>Mei</span></div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontWeight: 500, lineHeight: 1.6, marginBottom: 48, maxWidth: 360 }}>
            O único app com separação PJ/PF + DAS + controle real simples. Feito para os 17M+ de MEIs no Brasil.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {FEATURES.map(([Icon, title, desc]) => (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(75,226,119,0.08)", border: "1px solid rgba(75,226,119,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon /></div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f5f2ed" }}>{title}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form Panel ── */}
      <div className="auth-form-side" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 48px", background: "#ffffff", position: "relative", overflow: "hidden" }}>
        <div className="auth-fade glass-card" key={view} style={{ width: "100%", maxWidth: 400 }}>

          {/* ════════ LOGIN ════════ */}
          {view === "login" && <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.8px", marginBottom: 6 }}>Bem-vindo de volta</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500 }}>Entre na sua conta para continuar</div>
            </div>
            <form onSubmit={doLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label style={lbl}>E-mail</label><input className="af" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoComplete="email" /></div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={lbl}>Senha</label>
                  <button type="button" onClick={() => go("forgot")} className="alh" style={{ ...lnk, fontSize: 11 }}>Esqueci minha senha</button>
                </div>
                {pwdInput()}
              </div>
              <button type="submit" className="abh" disabled={loading} style={btnP}>{loading ? <Spinner /> : "Entrar"}</button>
            </form>
            {divider}
            <button onClick={doGoogle} className="agh" style={btnG}><GoogleIcon /> Entrar com Google</button>
            <div style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: "#888", fontWeight: 500 }}>
              Não tem conta?{" "}<button onClick={() => go("register")} className="alh" style={lnk}>Criar conta grátis</button>
            </div>
          </>}

          {/* ════════ REGISTER ════════ */}
          {view === "register" && <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.8px", marginBottom: 6 }}>Criar conta</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500 }}>Comece a organizar suas finanças agora</div>
            </div>
            <form onSubmit={doRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Nome completo</label><input className="af" type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(e.target.value)} style={inp} autoComplete="name" /></div>
              <div><label style={lbl}>E-mail</label><input className="af" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoComplete="email" /></div>
              <div>
                <label style={lbl}>Senha</label>
                {pwdInput("Mínimo 6 caracteres", "new-password")}
                {pwdBar}
              </div>
              <div>
                <label style={lbl}>Confirmar senha</label>
                <input className="af" type="password" placeholder="Repita a senha" value={pwd2} onChange={e => setPwd2(e.target.value)} style={inp} autoComplete="new-password" />
                {pwd2 && pwd && pwd !== pwd2 && <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginTop: 4 }}>As senhas não coincidem</div>}
              </div>
              <button type="submit" className="abh" disabled={loading} style={btnP}>{loading ? <Spinner /> : "Criar minha conta"}</button>
            </form>
            {divider}
            <button onClick={doGoogle} className="agh" style={btnG}><GoogleIcon /> Cadastrar com Google</button>
            <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#888", fontWeight: 500 }}>
              Já tem conta?{" "}<button onClick={() => go("login")} className="alh" style={lnk}>Fazer login</button>
            </div>
          </>}

          {/* ════════ FORGOT PASSWORD ════════ */}
          {view === "forgot" && <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.8px", marginBottom: 6 }}>Recuperar senha</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500, lineHeight: 1.5 }}>
                Digite o e-mail cadastrado e enviaremos um link para redefinir sua senha.
              </div>
            </div>
            <form onSubmit={doForgot} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label style={lbl}>E-mail</label><input className="af" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} style={inp} autoComplete="email" /></div>
              <button type="submit" className="abh" disabled={loading} style={btnP}>{loading ? <Spinner /> : "Enviar link de recuperação"}</button>
            </form>
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={() => go("login")} className="alh" style={lnk}>← Voltar ao login</button>
            </div>
          </>}

          {/* ════════ FORGOT SENT ════════ */}
          {view === "forgot-sent" && <>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 20 }}>📧</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.5px", marginBottom: 10 }}>Verifique seu e-mail</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500, lineHeight: 1.6, marginBottom: 8 }}>
                Enviamos um link de recuperação para <strong style={{ color: "#1a1a1a" }}>{email}</strong>.
              </div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5, marginBottom: 32 }}>
                Clique no link do e-mail para redefinir sua senha. Verifique também a pasta de spam.
              </div>
              <button onClick={() => go("login")} className="abh" style={{ ...btnP, background: "transparent", color: "#1a1a1a", border: "1.5px solid #e0ddd8", fontStyle: "normal" }}>Voltar ao login</button>
              <div style={{ marginTop: 16 }}>
                <button onClick={() => go("forgot")} className="alh" style={{ ...lnk, fontSize: 12 }}>Reenviar e-mail</button>
              </div>
            </div>
          </>}

          {/* ════════ RESET PASSWORD ════════ */}
          {view === "reset" && <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.8px", marginBottom: 6 }}>Nova senha</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500, lineHeight: 1.5 }}>
                Crie uma nova senha segura para sua conta.
              </div>
            </div>
            <form onSubmit={doReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={lbl}>Nova senha</label>
                {pwdInput("Mínimo 6 caracteres", "new-password")}
                {pwdBar}
              </div>
              <div>
                <label style={lbl}>Confirmar nova senha</label>
                <input className="af" type="password" placeholder="Repita a nova senha" value={pwd2} onChange={e => setPwd2(e.target.value)} style={inp} autoComplete="new-password" />
                {pwd2 && pwd && pwd !== pwd2 && <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginTop: 4 }}>As senhas não coincidem</div>}
              </div>
              <button type="submit" className="abh" disabled={loading} style={btnP}>{loading ? <Spinner /> : "Redefinir senha"}</button>
            </form>
          </>}

          {/* ════════ EMAIL CONFIRMATION ════════ */}
          {view === "confirm" && <>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 20 }}>✉️</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontStyle: "italic", color: "#1a1a1a", letterSpacing: "-0.5px", marginBottom: 10 }}>Confirme seu e-mail</div>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 500, lineHeight: 1.6, marginBottom: 8 }}>
                Enviamos um link de confirmação para <strong style={{ color: "#1a1a1a" }}>{email}</strong>.
              </div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.5, marginBottom: 16 }}>
                Clique no link do e-mail para ativar sua conta. Verifique também a caixa de spam.
              </div>
              <div style={{ background: "rgba(75,226,119,0.08)", border: "1px solid rgba(75,226,119,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#4BE277", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <span>✓</span> Conta criada com sucesso!
                </div>
              </div>
              <button onClick={() => go("login")} className="abh" style={btnP}>Ir para o login</button>
            </div>
          </>}

          {/* ── Terms ── */}
          {(view === "register" || view === "login") && (
            <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>
              Ao continuar, você concorda com os{" "}
              <button onClick={() => setLegalModal("terms")} className="alh" style={{ color: "#888", fontWeight: 600, cursor: "pointer", background: "none", border: "none", fontFamily: "'Syne',sans-serif", fontSize: 11, padding: 0, textDecoration: "underline" }}>Termos de Uso</button> e{" "}
              <button onClick={() => setLegalModal("privacy")} className="alh" style={{ color: "#888", fontWeight: 600, cursor: "pointer", background: "none", border: "none", fontFamily: "'Syne',sans-serif", fontSize: 11, padding: 0, textDecoration: "underline" }}>Política de Privacidade</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {authToast && (
        <div className="auth-toast-anim" style={{
          position: "fixed", bottom: 32, right: 32, padding: "14px 24px", borderRadius: 12,
          fontWeight: 700, fontSize: 13, fontFamily: "'Syne',sans-serif", zIndex: 9999,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)", maxWidth: 360,
          background: authToast.err ? "#1f0a0a" : "#052e16",
          color: authToast.err ? "#f87171" : "#4ade80",
          border: `1px solid ${authToast.err ? "#552222" : "#166534"}`
        }}>
          {authToast.err ? "✕ " : "✓ "}{authToast.msg}
        </div>
      )}

      {/* ── Legal Modal ── */}
      {legalModal && (
        <div onClick={() => setLegalModal(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} className="auth-fade" style={{
            background: "rgba(12,12,12,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "85vh",
            display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)"
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontStyle: "italic", color: "#f5f2ed", letterSpacing: "-0.5px" }}>
                {legalModal === "terms" ? "Termos de Uso" : "Política de Privacidade"}
              </div>
              <button onClick={() => setLegalModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "rgba(255,255,255,0.35)", padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            {/* Content */}
            <div style={{ padding: "24px 28px", overflowY: "auto", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, fontFamily: "'Syne',sans-serif" }}>
              {legalModal === "terms" ? (
                <div>
                  <p style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 0 }}>1. Aceitação dos Termos</h3>
                  <p>Ao acessar e utilizar o <strong>Mei Finanças</strong> ("Plataforma"), disponível em meifinancas.app, você declara que leu, compreendeu e concorda com estes Termos de Uso. Caso não concorde, não utilize a Plataforma.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>2. Descrição do Serviço</h3>
                  <p>O Mei Finanças é uma plataforma de gestão financeira voltada para Microempreendedores Individuais (MEI), oferecendo funcionalidades como:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li>Separação de contas PJ (Pessoa Jurídica) e PF (Pessoa Física)</li>
                    <li>Registro de vendas, despesas e gastos pessoais</li>
                    <li>Controle de categorias e orçamentos</li>
                    <li>Acompanhamento do DAS (Documento de Arrecadação do Simples Nacional)</li>
                    <li>Relatórios financeiros e dashboards</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>3. Cadastro e Conta</h3>
                  <p>Para utilizar a Plataforma, você deve criar uma conta fornecendo informações verdadeiras e atualizadas. Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>4. Uso Adequado</h3>
                  <p>Você se compromete a utilizar a Plataforma apenas para fins legais e de acordo com estes Termos. É proibido:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li>Utilizar a Plataforma para qualquer atividade ilícita</li>
                    <li>Tentar acessar áreas restritas ou dados de outros usuários</li>
                    <li>Introduzir vírus, malware ou código malicioso</li>
                    <li>Realizar engenharia reversa ou descompilar o software</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>5. Planos e Pagamentos</h3>
                  <p>A Plataforma pode oferecer planos gratuitos e pagos. Os valores, funcionalidades e condições de cada plano serão informados na página de preços. Pagamentos recorrentes podem ser cancelados a qualquer momento, com efeito ao final do período vigente.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>6. Propriedade Intelectual</h3>
                  <p>Todo o conteúdo da Plataforma, incluindo marca, design, código-fonte, textos e funcionalidades, é de propriedade exclusiva do Mei Finanças e protegido pelas leis de propriedade intelectual brasileiras.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>7. Limitação de Responsabilidade</h3>
                  <p>O Mei Finanças não substitui consultoria contábil ou fiscal profissional. Os dados e cálculos fornecidos são meramente informativos. Recomendamos a consulta a um contador para decisões financeiras relevantes. Não nos responsabilizamos por perdas decorrentes do uso inadequado das informações.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>8. Disponibilidade</h3>
                  <p>Nos esforçamos para manter a Plataforma disponível 24/7, mas não garantimos disponibilidade ininterrupta. Manutenções programadas e imprevistos podem causar períodos de indisponibilidade.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>9. Modificações</h3>
                  <p>Reservamo-nos o direito de modificar estes Termos a qualquer momento. Alterações significativas serão comunicadas por e-mail ou notificação na Plataforma.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>10. Contato</h3>
                  <p>Em caso de dúvidas, entre em contato pelo e-mail <strong>contato@meifinancas.app</strong>.</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 0 }}>1. Introdução</h3>
                  <p>A sua privacidade é importante para nós. Esta Política de Privacidade descreve como o <strong>Mei Finanças</strong> coleta, utiliza, armazena e protege as informações pessoais dos usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>2. Dados Coletados</h3>
                  <p>Coletamos os seguintes dados pessoais:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li><strong>Dados de cadastro:</strong> nome completo, e-mail, CNPJ (opcional), CPF (opcional)</li>
                    <li><strong>Dados financeiros:</strong> vendas, despesas, gastos pessoais, categorias e orçamentos inseridos voluntariamente pelo usuário</li>
                    <li><strong>Dados de uso:</strong> informações sobre como você interage com a Plataforma (páginas visitadas, funcionalidades utilizadas)</li>
                    <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador, sistema operacional</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>3. Finalidade do Uso dos Dados</h3>
                  <p>Utilizamos seus dados para:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li>Fornecer e aprimorar os serviços da Plataforma</li>
                    <li>Personalizar sua experiência de uso</li>
                    <li>Enviar comunicações relevantes (confirmação de conta, alertas, novidades)</li>
                    <li>Garantir a segurança da sua conta</li>
                    <li>Cumprir obrigações legais e regulatórias</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>4. Compartilhamento de Dados</h3>
                  <p><strong>Não vendemos</strong> seus dados pessoais. Podemos compartilhar informações apenas com:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li><strong>Provedores de serviço:</strong> empresas que nos auxiliam na operação (hospedagem, e-mail, analytics), sob contratos de confidencialidade</li>
                    <li><strong>Obrigações legais:</strong> quando exigido por lei ou ordem judicial</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>5. Armazenamento e Segurança</h3>
                  <p>Seus dados são armazenados em servidores seguros com criptografia. Utilizamos medidas técnicas e organizacionais para proteger suas informações contra acesso não autorizado, perda ou destruição, incluindo:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
                    <li>Autenticação segura com hash de senhas</li>
                    <li>Backups periódicos</li>
                    <li>Controle de acesso restrito</li>
                  </ul>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>6. Seus Direitos (LGPD)</h3>
                  <p>Conforme a LGPD, você tem direito a:</p>
                  <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                    <li>Confirmar a existência de tratamento de seus dados</li>
                    <li>Acessar seus dados pessoais</li>
                    <li>Corrigir dados incompletos ou desatualizados</li>
                    <li>Solicitar a eliminação de dados desnecessários</li>
                    <li>Revogar o consentimento a qualquer momento</li>
                    <li>Solicitar a portabilidade dos dados</li>
                  </ul>
                  <p>Para exercer seus direitos, entre em contato pelo e-mail <strong>contato@meifinancas.app</strong>.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>7. Cookies</h3>
                  <p>Utilizamos cookies essenciais para o funcionamento da Plataforma (autenticação e sessão). Não utilizamos cookies de rastreamento para fins publicitários.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>8. Retenção de Dados</h3>
                  <p>Seus dados são mantidos enquanto sua conta estiver ativa. Ao solicitar o encerramento da conta, seus dados serão excluídos em até 30 dias, exceto quando a retenção for necessária para cumprimento de obrigações legais.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>9. Alterações nesta Política</h3>
                  <p>Esta Política pode ser atualizada periodicamente. Alterações significativas serão comunicadas por e-mail ou notificação na Plataforma.</p>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f2ed", marginBottom: 8, marginTop: 20 }}>10. Contato</h3>
                  <p>Para dúvidas sobre privacidade e proteção de dados, entre em contato: <strong>contato@meifinancas.app</strong>.</p>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: "16px 28px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setLegalModal(null)} className="abh" style={{ ...btnP, width: "auto", padding: "0 32px", height: 42, fontSize: 13 }}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
