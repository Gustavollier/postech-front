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

/**
 * Sessao lida no carregamento do modulo, antes de qualquer render.
 *
 * O token precisa estar no cliente HTTP antes da primeira requisicao, e um
 * useEffect do provedor nao serve: no React, efeitos de filhos rodam ANTES dos
 * efeitos do pai. O efeito que carrega os dados do painel disparava primeiro, e
 * a primeira chamada saia sem o header Authorization — 401, que so sumia no
 * recarregar seguinte. Resolver aqui, no topo do modulo, elimina a corrida.
 */
function sessaoArmazenada(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Sessao;
    return s.expiraEm > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const sessaoInicial = sessaoArmazenada();
definirToken(sessaoInicial?.token ?? null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(sessaoInicial);

  // Declarado antes dos efeitos que o usam: trocar de sessao aplica o token no
  // mesmo instante, sem depender da ordem em que os efeitos rodam.
  const aplicarSessao = useCallback((nova: Sessao | null) => {
    definirToken(nova?.token ?? null);
    setSessao(nova);
  }, []);

  useEffect(() => {
    if (sessao) localStorage.setItem(CHAVE, JSON.stringify(sessao));
    else localStorage.removeItem(CHAVE);
  }, [sessao]);

  // O token vale 15 minutos; encerrar a sessão sozinho evita a tela de 401.
  useEffect(() => {
    if (!sessao) return;
    const resta = sessao.expiraEm - Date.now();
    if (resta <= 0) return aplicarSessao(null);
    const t = setTimeout(() => aplicarSessao(null), resta);
    return () => clearTimeout(t);
  }, [sessao, aplicarSessao]);

  const entrarComoCliente = useCallback(async (cpf: string) => {
    const r = await api.autenticarCliente(cpf.replace(/\D/g, ''));
    const token = extrairToken(r);
    const p = lerPayload(token);
    const segundos = typeof r.expires_in === 'number' ? r.expires_in : 900;
    const clienteId = Number(r.cliente_id ?? p.ClienteId ?? p.nameid ?? p.sub);
    aplicarSessao({
      token,
      tipo: 'cliente',
      nome: String(r.nome ?? p.name ?? p.unique_name ?? 'Cliente'),
      detalhe: 'Meus veículos',
      expiraEm: Date.now() + segundos * 1000,
      clienteId: Number.isFinite(clienteId) ? clienteId : undefined,
    });
  }, [aplicarSessao]);

  const entrarComoFuncionario = useCallback(async (cpf: string, senha: string) => {
    const r = await api.autenticarFuncionario(cpf.replace(/\D/g, ''), senha);
    const token = extrairToken(r);
    const p = lerPayload(token);
    const segundos = typeof r.expiresIn === 'number' ? r.expiresIn : 900;
    aplicarSessao({
      token,
      tipo: 'funcionario',
      nome: String(p.name ?? p.unique_name ?? 'Funcionário'),
      detalhe: String(r.cargo ?? p.role ?? 'Equipe'),
      expiraEm: Date.now() + segundos * 1000,
    });
  }, [aplicarSessao]);

  const sair = useCallback(() => aplicarSessao(null), [aplicarSessao]);

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
