import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

type UserPayload = {
  id: number | string;
  nome: string;
  email: string;
  role: string;
  setor?: string | null;
  can_publish_mural?: number | boolean;
  can_moderate_mural?: number | boolean;
};

type MeResponse = { ok?: boolean; user: UserPayload | null } | { error: string };

const getApiBase = () =>
  (import.meta.env.VITE_API_URL as string) || "";

const GoogleIcon = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
    <path
      d="M21.35 11.1H12v2.9h5.4c-.23 1.5-1.64 4.4-5.4 4.4-3.25 0-5.9-2.7-5.9-6s2.65-6 5.9-6c1.85 0 3.1.8 3.8 1.5l2.6-2.5C17.1 2.8 14.8 1.9 12 1.9 6.95 1.9 2.9 6 2.9 11s4.05 9.1 9.1 9.1c5.25 0 8.7-3.7 8.7-8.9 0-.6-.05-1-.15-1.6Z"
      fill="currentColor"
    />
  </svg>
);

const GoogleOAuth: React.FC = () => {
  const navigate = useNavigate();
  const { search } = useLocation();

  const api = useMemo(getApiBase, []);
  const url = new URLSearchParams(search);
  const ok = url.get("ok") === "1";
  const errorParam = url.get("e");

  const [status, setStatus] = useState<"idle" | "finalizing" | "error">(
    ok ? "finalizing" : "idle"
  );
  const [message, setMessage] = useState<string | null>(
    errorParam ? "Falha no login com o Google." : null
  );

  const startGoogleLogin = useCallback(() => {
    window.location.href = `${api}/auth/google?prompt=select_account`;
  }, [api]);

  const loadSession = useCallback(async () => {
    try {
      setStatus("finalizing");
      const resp = await fetch(`${api}/api/me`, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as MeResponse;
      const user = (data as any).user ?? ((data as any).ok ? (data as any).user : null);
      if (!user) throw new Error("Sessão não criada");
      localStorage.setItem("user", JSON.stringify(user));
      navigate("/", { replace: true });
    } catch (e: any) {
      setMessage(e?.message || "Erro ao finalizar sessão.");
      setStatus("error");
    }
  }, [api, navigate]);

  useEffect(() => {
    if (ok) loadSession();
  }, [ok, loadSession]);

  const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mx-auto mt-12 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow">
      {children}
    </div>
  );

  if (status === "finalizing") {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          <p className="text-sm text-gray-700">Conectando com sua conta do Google…</p>
        </div>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <h1 className="mb-2 text-lg font-semibold">Não foi possível entrar</h1>
        <p className="mb-4 text-sm text-red-600">{message}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={startGoogleLogin}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <GoogleIcon />
            Tentar novamente com Google
          </button>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Voltar ao login
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-2 text-lg font-semibold">Entrar com o Google</h1>
      <p className="mb-4 text-sm text-gray-600">
        Clique abaixo para iniciar o login com sua conta corporativa.
      </p>
      <button
        onClick={startGoogleLogin}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        <GoogleIcon />
        Entrar com Google
      </button>
      <div className="mt-4 text-xs text-gray-500">
        Dica: garanta que o backend está rodando em{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5">VITE_API_URL</code> e
        que o OAuth está configurado no servidor.
      </div>
    </Card>
  );
};

export default GoogleOAuth;
