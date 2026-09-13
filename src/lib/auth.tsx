import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, definirToken } from './api';
import type { Registro, Sessao } from './types';

const CHAVE = 'postech.sessao';

type Contexto = {
  sessao: Sessao | null;
  entrarComoCliente: (cpf: string) => Promise<void>;
  entrarComoFuncionario: (cpf: string, senha: string) => Promise<void>;
  sair: () => void;
};

const Ctx = createContext<Contexto | null>(null);

/** Lê o payload do JWT sem validar assinatura — quem valida é o APIM. */
function lerPayload(token: string): Registro {
  try {
    const meio = token.split('.')[1];
    const json = atob(meio.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return {};
  }
}

function extrairToken(r: Registro): string {
  const t = r.access_token ?? r.accessToken ?? r.token;
  if (typeof t !== 'string' || !t) throw new Error('A resposta não trouxe um token.');
  return t;
}

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    try {
      const s = JSON.parse(bruto) as Sessao;
      if (s.expiraEm < Date.now()) return null;
      return s;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    definirToken(sessao?.token ?? null);
    if (sessao) localStorage.setItem(CHAVE, JSON.stringify(sessao));
    else localStorage.removeItem(CHAVE);
  }, [sessao]);

  // O token vale 15 minutos; encerrar a sessão sozinho evita a tela de 401.
  useEffect(() => {
    if (!sessao) return;
    const resta = sessao.expiraEm - Date.now();
    if (resta <= 0) return setSessao(null);
    const t = setTimeout(() => setSessao(null), resta);
    return () => clearTimeout(t);
  }, [sessao]);

  const entrarComoCliente = useCallback(async (cpf: string) => {
    const r = await api.autenticarCliente(cpf.replace(/\D/g, ''));
    const token = extrairToken(r);
    const p = lerPayload(token);
    const segundos = typeof r.expires_in === 'number' ? r.expires_in : 900;
    setSessao({
      token,
      tipo: 'cliente',
      nome: String(r.nome ?? p.name ?? p.unique_name ?? 'Cliente'),
      detalhe: `Cliente #${r.cliente_id ?? p.sub ?? '—'}`,
      expiraEm: Date.now() + segundos * 1000,
    });
  }, []);

  const entrarComoFuncionario = useCallback(async (cpf: string, senha: string) => {
    const r = await api.autenticarFuncionario(cpf.replace(/\D/g, ''), senha);
    const token = extrairToken(r);
    const p = lerPayload(token);
    const segundos = typeof r.expiresIn === 'number' ? r.expiresIn : 900;
    setSessao({
      token,
      tipo: 'funcionario',
      nome: String(p.name ?? p.unique_name ?? 'Funcionário'),
      detalhe: String(r.cargo ?? p.role ?? 'Funcionário'),
      expiraEm: Date.now() + segundos * 1000,
    });
  }, []);

  const sair = useCallback(() => setSessao(null), []);

  const valor = useMemo(
    () => ({ sessao, entrarComoCliente, entrarComoFuncionario, sair }),
    [sessao, entrarComoCliente, entrarComoFuncionario, sair],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth precisa estar dentro de ProvedorAuth');
  return c;
}
