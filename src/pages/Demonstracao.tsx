import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  comoLista,
  ErroApi,
  fixarCorrelacao,
  type ItemDoDiagnostico,
} from '../lib/api';
import { moeda, rotulo } from '../lib/types';
import type { Registro } from '../lib/types';
import { useAuth } from '../lib/auth';
import { Cabecalho } from '../components/Layout';
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

/** Completa nove dígitos com os dois verificadores do CPF. */
function cpfValido(base: string): string {
  const d = base.replace(/\D/g, '').padEnd(9, '0').slice(0, 9).split('').map(Number);
  const verificador = (digitos: number[]) => {
    const soma = digitos.reduce((s, n, i) => s + n * (digitos.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = verificador(d);
  const d2 = verificador([...d, d1]);
  return [...d, d1, d2].join('');
}

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
  const { sessao } = useAuth();
  const [idFuncionario, setIdFuncionario] = useState<number | null>(sessao?.funcionarioId ?? null);

  useEffect(() => {
    // Quem está logado é o responsável natural; a lista só entra como reserva.
    if (sessao?.funcionarioId !== undefined) return;
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
  }, [sessao?.funcionarioId]);

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

  // O cartão do orçamento mostra a situação do pagamento, que muda por evento
  // (o webhook do Mercado Pago). Relê quando a saga anda, senão ele ficaria em
  // "Aguardando confirmação" com a ordem já em execução.
  useEffect(() => {
    if (idOrdem === null || orcamento === null || passo === null) return;
    let ativo = true;
    void api.orcamento(idOrdem).then((o) => ativo && setOrcamento(o)).catch(() => undefined);
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo]);

  async function executar(chave: string, acao: () => Promise<void>) {
    setRodando(chave);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      const msg = e instanceof ErroApi ? `HTTP ${e.status} — ${e.message}` : e instanceof Error ? e.message : String(e);
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

  // CPF derivado do instante, para não colidir com a execução anterior — e com
  // dígitos verificadores de verdade: o Identidade valida os dois, e um CPF só
  // "com cara de CPF" volta 400 logo no primeiro passo da demonstração.
  const cpfDemo = cpfValido(`100${sufixo}`);
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
      anotar(`✓ orçamento ${texto(o.id)} — valor ${moeda(numero(o.valor))}`);
    });

  const aprovar = () =>
    executar('aprovar', async () => {
      if (idOrdem === null) throw new Error('Abra a ordem primeiro.');
      const o = await api.aprovarOrcamento(idOrdem);
      setOrcamento(o);
      anotar(`✓ aprovado — pagamento ${rotulo(o.statusDoPagamento)}`);
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

  /**
   * Cada botão habilita só no passo em que a saga aceita a ação.
   *
   * Antes bastava existir uma ordem: dava para aprovar um orçamento que o
   * Billing ainda não tinha montado, ou finalizar antes do pagamento — e a
   * demonstração parava num 404 ou 409 na frente da câmera. O passo vem do
   * polling, então o próximo botão acende sozinho quando o evento chega.
   */
  const ORDEM_DOS_PASSOS = [
    'AguardandoDiagnostico',
    'AguardandoOrcamento',
    'AguardandoAprovacao',
    'AguardandoPagamento',
    'AguardandoExecucao',
    'Concluida',
  ];
  const posicao = passo === null ? -1 : ORDEM_DOS_PASSOS.indexOf(passo);
  const encerrada = passo === 'Cancelada' || passo === 'Compensando';

  const prontoPara = (chave: string) => {
    if (chave === 'cliente') return correlacao !== '' && idCliente === null;
    if (chave === 'ordem') return idCliente !== null && idVeiculo !== null && idOrdem === null;
    if (idOrdem === null || encerrada) return false;
    if (chave === 'diagnostico') return passo === 'AguardandoDiagnostico';
    if (chave === 'orcamento') return posicao >= 2;
    if (chave === 'aprovar') return passo === 'AguardandoAprovacao';
    if (chave === 'finalizar') return passo === 'AguardandoExecucao';
    return false;
  };

  const feita = (chave: string) => {
    if (chave === 'cliente') return idCliente !== null && idVeiculo !== null;
    if (chave === 'ordem') return idOrdem !== null;
    if (chave === 'diagnostico') return posicao >= 1;
    if (chave === 'orcamento') return orcamento !== null;
    if (chave === 'aprovar') return posicao >= 3;
    if (chave === 'finalizar') return passo === 'Concluida';
    return false;
  };

  /** O que a tela está esperando quando nenhum botão do fluxo está aceso. */
  const esperando =
    passo === 'AguardandoOrcamento'
      ? 'O Billing está montando o orçamento a partir do evento do diagnóstico…'
      : passo === 'AguardandoPagamento'
        ? 'Cobrança Pix criada. Aguardando o webhook do Mercado Pago confirmar o pagamento…'
        : passo === 'Compensando'
          ? 'A saga está compensando os passos anteriores…'
          : null;

  const urlDePagamento =
    typeof orcamento?.urlDePagamento === 'string' ? orcamento.urlDePagamento : null;

  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Demonstração da saga"
        descricao="Uma ordem atravessando os quatro microsserviços com um único rastro de correlação. Cada botão é uma chamada ao APIM e acende no passo em que a saga aceita a ação."
        acao={
          <button type="button" onClick={iniciar} className="btn-primary px-4 py-2 text-xs">
            {correlacao ? 'Novo rastro' : 'Iniciar demonstração'}
          </button>
        }
      />

      {!correlacao && (
        <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-soft">
          Clique em <span className="font-semibold text-ink">Iniciar demonstração</span> para gerar o
          Correlation ID do fluxo. Depois siga os passos na ordem.
        </p>
      )}

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
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  feita(etapa.chave) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-raised text-ink-soft'
                }`}
              >
                {feita(etapa.chave) ? '✓' : i + 1}
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
                className={`rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                  prontoPara(etapa.chave) && !feita(etapa.chave)
                    ? 'border-brand bg-brand text-white hover:bg-brand-deep'
                    : 'border-line text-ink hover:bg-raised'
                }`}
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
                Disponível enquanto a saga aguarda a aprovação. Dispara a compensação: cancela o
                orçamento e a ordem, sem estornar um pagamento que não aconteceu.
              </p>
            </div>
            <button
              type="button"
              disabled={passo !== 'AguardandoAprovacao' || rodando !== null}
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
                <Linha rotulo="Passo" valor={rotulo(saga.passo)} destaque />
                <Linha rotulo="Status" valor={rotulo(saga.statusDaOrdem ?? saga.status)} />
                <Linha rotulo="Orçamento" valor={texto(saga.idOrcamento)} />
                <Linha rotulo="Pagamento" valor={texto(saga.idPagamento)} />
                {saga.motivoDaCompensacao ? (
                  <Linha rotulo="Compensação" valor={texto(saga.motivoDaCompensacao)} />
                ) : null}
              </dl>
            )}
            {esperando && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-200">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300" />
                {esperando}
              </p>
            )}
            {passo !== null && EM_ANDAMENTO.has(passo) && (
              <p className="mt-3 text-[11px] text-ink-mute">Atualizando a cada 2 s.</p>
            )}
          </section>

          {orcamento && (
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="text-sm font-semibold text-ink">Orçamento</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Linha rotulo="Valor" valor={moeda(numero(orcamento.valor))} />
                <Linha rotulo="Situação" valor={rotulo(orcamento.status)} />
                <Linha rotulo="Pagamento" valor={rotulo(orcamento.statusDoPagamento)} />
              </dl>
              {urlDePagamento && passo === 'AguardandoPagamento' && (
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
