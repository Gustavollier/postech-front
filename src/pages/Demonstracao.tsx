import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  comoLista,
  ErroApi,
  fixarCorrelacao,
  type ItemDoDiagnostico,
} from '../lib/api';
import type { Registro } from '../lib/types';
import { Aviso, Campo } from '../components/Form';

/**
 * A saga da ordem de serviço, de ponta a ponta, numa tela.
 *
 * Existe para o vídeo e para o ensaio dele. O fluxo da Fase 4 atravessa quatro
 * serviços e uma fila, e demonstrar isso clicando por cinco telas diferentes
 * esconde justamente o que interessa: que cada passo sai de um serviço
 * distinto e que a saga avança por evento, não por chamada.
 *
 * Três decisões que valem explicar:
 *
 * - **Um correlationId para o fluxo inteiro.** Cada etapa é uma chamada HTTP
 *   diferente, e com id por chamada o Datadog mostraria sete rastros soltos.
 *   Fixando um, o fluxo inteiro vira um rastro — que é o que o requisito de
 *   rastreamento distribuído pede para mostrar.
 * - **O passo da saga vem de polling, não da resposta da ação.** O avanço é
 *   assíncrono: a resposta do POST só confirma que o evento saiu. Quem diz onde
 *   a saga está é `GET /os/api/v1/ordens-servico/{id}/saga`, e é por isso que o
 *   painel da direita pisca sozinho depois de cada clique.
 * - **O caminho triste tem botão próprio.** Rejeitar o orçamento é o que
 *   dispara a compensação, e sem um botão explícito a parte mais interessante
 *   da arquitetura ficaria invisível na demonstração.
 */

type Etapa = {
  chave: string;
  titulo: string;
  servico: 'identidade' | 'os' | 'execucao' | 'billing';
  descricao: string;
};

const ETAPAS: Etapa[] = [
  {
    chave: 'cliente',
    titulo: 'Cadastrar cliente e veículo',
    servico: 'identidade',
    descricao: 'POST /identidade/api/v1/clientes e /veiculos',
  },
  {
    chave: 'ordem',
    titulo: 'Abrir a ordem de serviço',
    servico: 'os',
    descricao: 'POST /os/api/v1/ordens-servico — nasce a saga',
  },
  {
    chave: 'diagnostico',
    titulo: 'Registrar o diagnóstico',
    servico: 'execucao',
    descricao: 'POST /execucao/.../diagnostico — publica DiagnosticoConcluido',
  },
  {
    chave: 'orcamento',
    titulo: 'Consultar o orçamento gerado',
    servico: 'billing',
    descricao: 'GET /billing/api/v1/orcamentos/os/{id} — montado por evento',
  },
  {
    chave: 'aprovar',
    titulo: 'Aprovar e cobrar',
    servico: 'billing',
    descricao: 'POST .../aprovar — cria o Pix no Mercado Pago',
  },
  {
    chave: 'finalizar',
    titulo: 'Finalizar a execução',
    servico: 'execucao',
    descricao: 'POST /execucao/.../finalizar — fecha a saga',
  },
];

const CORES_DE_SERVICO: Record<Etapa['servico'], string> = {
  identidade: 'bg-purple-500/15 text-purple-300',
  os: 'bg-brand/15 text-brand',
  execucao: 'bg-amber-500/15 text-amber-300',
  billing: 'bg-emerald-500/15 text-emerald-300',
};

/** Passos em que a saga está viva e esperando algo. */
const EM_ANDAMENTO = new Set([
  'AguardandoDiagnostico',
  'AguardandoOrcamento',
  'AguardandoAprovacao',
  'AguardandoPagamento',
  'AguardandoExecucao',
  'Compensando',
]);

const ITENS_PADRAO: ItemDoDiagnostico[] = [
  { descricao: 'Troca de óleo', tipo: 'MaoDeObra', quantidade: 1, valorUnitario: 120.5 },
  { descricao: 'Filtro de óleo', tipo: 'MaoDeObra', quantidade: 2, valorUnitario: 38.9 },
];

function texto(v: unknown): string {
  return v === null || v === undefined ? '—' : String(v);
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function Demonstracao() {
  const [correlacao, setCorrelacao] = useState('');
  const [sufixo, setSufixo] = useState(() => String(Date.now()).slice(-6));
  const [rodando, setRodando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [registro, setRegistro] = useState<string[]>([]);

  const [idCliente, setIdCliente] = useState<number | null>(null);
  const [idVeiculo, setIdVeiculo] = useState<number | null>(null);
  const [idOrdem, setIdOrdem] = useState<number | null>(null);
  const [orcamento, setOrcamento] = useState<Registro | null>(null);
  const [saga, setSaga] = useState<Registro | null>(null);

  // A sessão guarda o token, não o id do funcionário — e `AbrirOrdemRequest`
  // exige o id. Buscar o primeiro da equipe é suficiente para a demonstração,
  // e o campo fica editável para a gravação escolher outro responsável.
  const [idFuncionario, setIdFuncionario] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const lista = comoLista(await api.funcionarios());
        const primeiro = numero(lista[0]?.id);
        if (ativo && primeiro !== null) setIdFuncionario(primeiro);
      } catch {
        // Sem equipe cadastrada ainda: o campo fica vazio e a tela diz o que
        // falta quando a ordem for aberta.
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const anotar = useCallback((linha: string) => {
    const hora = new Date().toLocaleTimeString('pt-BR');
    setRegistro((r) => [`${hora}  ${linha}`, ...r].slice(0, 40));
  }, []);

  /**
   * Polling do estado da saga.
   *
   * Para quando a saga chega a um passo final — sem isso a tela ficaria
   * consultando para sempre uma ordem que já fechou, o que suja o rastro no
   * Datadog justamente depois da parte que o vídeo quer mostrar.
   */
  const passo = typeof saga?.passo === 'string' ? saga.passo : null;
  const idOrdemRef = useRef<number | null>(null);
  idOrdemRef.current = idOrdem;

  useEffect(() => {
    if (idOrdem === null) return;
    if (passo !== null && !EM_ANDAMENTO.has(passo)) return;

    let ativo = true;

    const consultar = async () => {
      try {
        const atual = await api.saga(idOrdem);
        if (ativo) setSaga(atual);
      } catch {
        // Silencioso de propósito: a saga pode não existir no instante seguinte
        // à abertura da ordem, e um erro vermelho a cada segundo não ajuda em
        // nada no meio de uma demonstração.
      }
    };

    void consultar();
    const timer = window.setInterval(consultar, 2000);

    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [idOrdem, passo]);

  async function executar(chave: string, acao: () => Promise<void>) {
    setRodando(chave);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      const msg = e instanceof ErroApi ? `HTTP ${e.status} — ${e.message}` : String(e);
      setErro(msg);
      anotar(`✗ ${chave}: ${msg}`);
    } finally {
      setRodando(null);
    }
  }

  function iniciar() {
    const id = crypto.randomUUID();
    const novoSufixo = String(Date.now()).slice(-6);
    fixarCorrelacao(id);
    setCorrelacao(id);
    setSufixo(novoSufixo);
    setIdCliente(null);
    setIdVeiculo(null);
    setIdOrdem(null);
    setOrcamento(null);
    setSaga(null);
    setErro(null);
    setRegistro([]);
    anotar(`Rastro novo: ${id}`);
  }

  // Dígitos verificadores não importam aqui: o Identidade valida formato e
  // unicidade, e um CPF derivado do instante evita colidir com a execução
  // anterior da demonstração.
  const cpfDemo = `000${sufixo}00`.slice(0, 11).padEnd(11, '0');
  const placaDemo = `DEM${sufixo.slice(0, 4)}`;
  const emailDemo = `demo${sufixo}@oficina.test`;

  const criarClienteEVeiculo = () =>
    executar('cliente', async () => {
      const cliente = await api.criarCliente({
        cpf: cpfDemo,
        nomeCompleto: `Cliente Demonstração ${sufixo}`,
        telefone: '11999990000',
        email: emailDemo,
      });
      const idC = numero(cliente.id);
      if (idC === null) throw new Error('O Identidade não devolveu o id do cliente.');
      setIdCliente(idC);
      anotar(`✓ cliente ${idC} criado no Identidade`);

      const veiculo = await api.criarVeiculo({
        clienteId: idC,
        marca: 'Fiat',
        modelo: 'Uno',
        placa: placaDemo,
        cor: 'Prata',
        anoModelo: 2019,
        anoFabricacao: 2018,
        kmEntrada: 84000,
      });
      const idV = numero(veiculo.id);
      if (idV === null) throw new Error('O Identidade não devolveu o id do veículo.');
      setIdVeiculo(idV);
      anotar(`✓ veículo ${idV} (${placaDemo}) criado`);
    });

  const abrirOrdem = () =>
    executar('ordem', async () => {
      if (idCliente === null || idVeiculo === null) throw new Error('Cadastre o cliente primeiro.');
      if (idFuncionario === null)
        throw new Error(
          'Informe o id do funcionário responsável — nenhum veio da lista da equipe.',
        );

      const ordem = await api.abrirOrdem({
        idCliente,
        idVeiculo,
        idFuncionario,
        nomeCliente: `Cliente Demonstração ${sufixo}`,
        descricaoVeiculo: `Fiat Uno ${placaDemo}`,
        emailCliente: emailDemo,
      });
      const id = numero(ordem.id) ?? numero(ordem.idOrdem);
      if (id === null) throw new Error('O OS Service não devolveu o id da ordem.');
      setIdOrdem(id);
      anotar(`✓ ordem ${id} aberta — a saga nasce em AguardandoDiagnostico`);
    });

  const registrarDiagnostico = () =>
    executar('diagnostico', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      await api.registrarDiagnostico(idOrdem, ITENS_PADRAO);
      anotar('✓ diagnóstico registrado — DiagnosticoConcluido na fila');
    });

  const consultarOrcamento = () =>
    executar('orcamento', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      const o = await api.orcamento(idOrdem);
      setOrcamento(o);
      anotar(`✓ orçamento ${texto(o.id)} — valor ${texto(o.valor)}`);
    });

  const aprovar = () =>
    executar('aprovar', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      const o = await api.aprovarOrcamento(idOrdem);
      setOrcamento(o);
      anotar(`✓ aprovado — pagamento ${texto(o.statusDoPagamento)}`);
    });

  const rejeitar = () =>
    executar('rejeitar', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      await api.rejeitarOrcamento(idOrdem, 'Cliente não autorizou o serviço');
      anotar('✓ rejeitado — a saga entra em compensação');
    });

  const finalizar = () =>
    executar('finalizar', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      await api.finalizarExecucao(idOrdem);
      anotar('✓ execução finalizada — ExecucaoFinalizada na fila');
    });

  const acoes: Record<string, () => Promise<void>> = {
    cliente: criarClienteEVeiculo,
    ordem: abrirOrdem,
    diagnostico: registrarDiagnostico,
    orcamento: consultarOrcamento,
    aprovar,
    finalizar,
  };

  const prontoPara = (chave: string) => {
    if (chave === 'cliente') return correlacao !== '';
    if (chave === 'ordem') return idCliente !== null && idVeiculo !== null;
    return idOrdem !== null;
  };

  const urlDePagamento =
    typeof orcamento?.urlDePagamento === 'string' ? orcamento.urlDePagamento : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Demonstração da saga</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            O fluxo completo de uma ordem atravessando os quatro microsserviços, com um único
            rastro de correlação. Cada botão é uma chamada ao APIM; o painel da direita lê o
            estado da saga no orquestrador.
          </p>
        </div>
        <button
          type="button"
          onClick={iniciar}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep"
        >
          {correlacao ? 'Novo rastro' : 'Iniciar demonstração'}
        </button>
      </header>

      {correlacao && (
        <div className="rounded-lg border border-line bg-raised px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-ink-mute">Correlation ID do fluxo</p>
          <code className="mt-1 block break-all font-mono text-sm text-brand">{correlacao}</code>
          <p className="mt-2 text-xs text-ink-mute">
            Procure por este id no Datadog: ele atravessa os quatro serviços e a fila.
          </p>
        </div>
      )}

      {erro && <Aviso tipo="erro" texto={erro} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Etapas */}
        <ol className="space-y-3">
          {ETAPAS.map((etapa, i) => (
            <li
              key={etapa.chave}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs text-ink-soft">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{etapa.titulo}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CORES_DE_SERVICO[etapa.servico]}`}
                  >
                    {etapa.servico}
                  </span>
                </div>
                <code className="mt-0.5 block truncate font-mono text-[11px] text-ink-mute">
                  {etapa.descricao}
                </code>
              </div>
              <button
                type="button"
                disabled={!prontoPara(etapa.chave) || rodando !== null}
                onClick={() => void acoes[etapa.chave]()}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
              >
                {rodando === etapa.chave ? 'Chamando…' : 'Executar'}
              </button>
            </li>
          ))}

          <li className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-ink">
                Caminho triste: rejeitar o orçamento
              </span>
              <p className="mt-0.5 text-[11px] text-ink-mute">
                Dispara a compensação: cancela o orçamento e a ordem, sem estornar um pagamento
                que não aconteceu.
              </p>
            </div>
            <button
              type="button"
              disabled={idOrdem === null || rodando !== null}
              onClick={() => void rejeitar()}
              className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {rodando === 'rejeitar' ? 'Chamando…' : 'Rejeitar'}
            </button>
          </li>
        </ol>

        {/* Estado da saga */}
        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold text-ink">Estado da saga</h2>
            {saga === null ? (
              <p className="mt-2 text-sm text-ink-mute">
                {idOrdem === null ? 'Abra uma ordem para começar.' : 'Consultando o orquestrador…'}
              </p>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <Linha rotulo="Ordem" valor={texto(idOrdem)} />
                <Linha rotulo="Passo" valor={texto(saga.passo)} destaque />
                <Linha rotulo="Status" valor={texto(saga.statusDaOrdem ?? saga.status)} />
                <Linha rotulo="Orçamento" valor={texto(saga.idOrcamento)} />
                <Linha rotulo="Pagamento" valor={texto(saga.idPagamento)} />
                {saga.motivoDaCompensacao ? (
                  <Linha rotulo="Compensação" valor={texto(saga.motivoDaCompensacao)} />
                ) : null}
              </dl>
            )}
            {passo !== null && EM_ANDAMENTO.has(passo) && (
              <p className="mt-3 text-[11px] text-ink-mute">Atualizando a cada 2 s.</p>
            )}
          </section>

          {orcamento && (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="text-sm font-semibold text-ink">Orçamento</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Linha rotulo="Valor" valor={texto(orcamento.valor)} />
                <Linha rotulo="Situação" valor={texto(orcamento.status)} />
                <Linha rotulo="Pagamento" valor={texto(orcamento.statusDoPagamento)} />
              </dl>
              {urlDePagamento && (
                <a
                  href={urlDePagamento}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-sm text-emerald-300 hover:bg-emerald-500/25"
                >
                  Abrir o Pix no Mercado Pago
                </a>
              )}
            </section>
          )}

          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold text-ink">Registro</h2>
            {registro.length === 0 ? (
              <p className="mt-2 text-sm text-ink-mute">Nada ainda.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {registro.map((l, i) => (
                  <li key={i} className="font-mono text-[11px] leading-relaxed text-ink-soft">
                    {l}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* Dois campos de apoio à gravação: trocar o responsável, e retomar uma
          ordem já criada sem refazer o cadastro todo num segundo take. */}
      <div className="grid max-w-lg gap-4 sm:grid-cols-2">
        <Campo rotulo="Funcionário responsável" dica="Id do Identidade Service">
          <input
            className="field"
            inputMode="numeric"
            value={idFuncionario === null ? '' : String(idFuncionario)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setIdFuncionario(Number.isFinite(n) && n > 0 ? n : null);
            }}
          />
        </Campo>
        <Campo rotulo="Acompanhar ordem existente" dica="Id da ordem no OS Service">
          <input
            className="field"
            inputMode="numeric"
            value={idOrdem === null ? '' : String(idOrdem)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setIdOrdem(Number.isFinite(n) && n > 0 ? n : null);
              setSaga(null);
            }}
          />
        </Campo>
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-mute">{rotulo}</dt>
      <dd
        className={
          destaque ? 'text-right font-medium text-brand' : 'text-right text-ink-soft'
        }
      >
        {valor}
      </dd>
    </div>
  );
}
