import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ErroApi } from '../lib/api';
import { Marca } from '../components/Layout';
import { IconeEscudo, IconeOrdem, IconePeca } from '../components/Icones';

const CPF_DEMO_CLIENTE = '98765432100';
const CPF_DEMO_FUNCIONARIO = '11111111111';
const SENHA_DEMO = 'Senha@123';

function formatarCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function Entrar() {
  const { entrarComoCliente, entrarComoFuncionario } = useAuth();
  const navegar = useNavigate();

  const [aba, setAba] = useState<'cliente' | 'funcionario'>('cliente');
  const [cpf, setCpf] = useState(formatarCpf(CPF_DEMO_CLIENTE));
  const [senha, setSenha] = useState(SENHA_DEMO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (aba === 'cliente') await entrarComoCliente(cpf);
      else await entrarComoFuncionario(cpf, senha);
      navegar('/');
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Falha inesperada na autenticação.');
    } finally {
      setEnviando(false);
    }
  }

  function trocarAba(nova: 'cliente' | 'funcionario') {
    setAba(nova);
    setErro(null);
    setCpf(formatarCpf(nova === 'cliente' ? CPF_DEMO_CLIENTE : CPF_DEMO_FUNCIONARIO));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Painel narrativo: explica por onde a requisição passa. */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line px-12 py-14 lg:flex">
        <Marca />

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
            A oficina inteira,
            <br />
            <span className="bg-gradient-to-r from-brand to-[#199e70] bg-clip-text text-transparent">
              em uma tela só.
            </span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
            Da entrada do veículo à entrega: acompanhe cada ordem, aprove orçamentos e
            mantenha o estoque sob controle, sem planilha paralela.
          </p>

          <ul className="mt-9 space-y-4">
            {[
              { Icone: IconeOrdem, t: 'Fluxo sem ruído', d: 'Cada ordem percorre um caminho claro, do diagnóstico à entrega.' },
              { Icone: IconePeca, t: 'Estoque sempre certo', d: 'Peça usada na ordem baixa do estoque na hora, sem conferência manual.' },
              { Icone: IconeEscudo, t: 'Cada um vê o que é seu', d: 'O cliente acompanha o próprio veículo; a equipe enxerga a oficina toda.' },
            ].map(({ Icone, t, d }) => (
              <li key={t} className="flex gap-3.5">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-raised">
                  <Icone className="h-[18px] w-[18px] text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-mute">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-ink-mute">© 2026 Motriz · Gestão de oficinas</p>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Marca />
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Entrar no painel</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Acesse com seu CPF. Clientes acompanham seus veículos; a equipe gerencia a oficina.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1">
            {(['cliente', 'funcionario'] as const).map((v) => (
              <button
                key={v}
                onClick={() => trocarAba(v)}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                  aba === v ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-ink-soft hover:text-ink',
                ].join(' ')}
              >
                {v === 'cliente' ? 'Sou cliente' : 'Sou da equipe'}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            {aba === 'cliente'
              ? 'Informe o CPF cadastrado na oficina para acompanhar seus veículos e orçamentos.'
              : 'Use seu CPF e a senha fornecida pela oficina.'}
          </p>

          <form onSubmit={enviar} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="cpf">CPF</label>
              <input
                id="cpf"
                className="field font-mono tracking-wide"
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="username"
                required
              />
            </div>

            {aba === 'funcionario' && (
              <div className="animate-rise">
                <label className="label" htmlFor="senha">Senha</label>
                <input
                  id="senha"
                  type="password"
                  className="field"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            )}

            {erro && (
              <div className="rounded-xl border border-[#e66767]/30 bg-[#e66767]/8 px-4 py-3 text-sm text-[#e66767]">
                {erro}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={enviando}>
              {enviando ? 'Autenticando…' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-line bg-panel/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Ambiente de demonstração</p>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-soft">
              cliente · 987.654.321-00
              <br />
              equipe · 111.111.111-11 · {SENHA_DEMO}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
