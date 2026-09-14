import { useState } from 'react';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { ehGerente, useAuth } from '../lib/auth';
import { numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Confirmacao, Modal } from '../components/Form';
import { IconeAtualizar } from '../components/Icones';

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function documento(cpf: string, cnpj: string) {
  if (cpf !== '—') return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (cnpj !== '—') return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return '—';
}

type Busca = { carregando: boolean; erro: string | null; cliente: Registro | null; nota: string | null };

export default function Clientes() {
  const { sessao } = useAuth();
  const gerente = ehGerente(sessao);

  const { dados, erro, carregando, recarregar } = useDados<Registro[]>(async () => comoLista(await api.clientes()));

  const [modoBusca, setModoBusca] = useState<'documento' | 'placa'>('documento');
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<Busca | null>(null);

  const [novoCliente, setNovoCliente] = useState(false);
  const [novoVeiculo, setNovoVeiculo] = useState<Registro | null>(null);
  const [ficha, setFicha] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<Registro | null>(null);
  const [exclusao, setExclusao] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const clientes = dados ?? [];

  /**
   * Busca no servidor, não filtro da lista carregada.
   *
   * Por placa o caminho é indireto de propósito, e é o da oficina: o carro
   * chega, você tem a placa e quer saber de quem é. A rota de veículo devolve o
   * ClienteId, e com ele buscamos o dono.
   */
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = termo.trim();
    if (!q) return setBusca(null);

    setBusca({ carregando: true, erro: null, cliente: null, nota: null });
    try {
      if (modoBusca === 'documento') {
        const cliente = await api.clientePorDocumento(q);
        setBusca({ carregando: false, erro: null, cliente, nota: null });
      } else {
        const veiculo = await api.veiculoPorPlaca(q);
        const idDono = numero(veiculo, 'clienteId', 'ClienteId');
        if (idDono === null) throw new ErroApi(404, 'Veículo sem dono identificado.', null);
        const cliente = await api.cliente(idDono);
        setBusca({
          carregando: false,
          erro: null,
          cliente,
          nota: `Dono de ${texto(veiculo, 'marca', 'Marca')} ${texto(veiculo, 'modelo', 'Modelo')} · ${texto(veiculo, 'placa', 'Placa')}`,
        });
      }
    } catch (e2) {
      setBusca({
        carregando: false,
        erro:
          e2 instanceof ErroApi && e2.status === 404
            ? modoBusca === 'documento'
              ? 'Nenhum cliente com esse documento.'
              : 'Nenhum veículo com essa placa.'
            : 'Falha na busca.',
        cliente: null,
        nota: null,
      });
    }
  }

  function limparBusca() {
    setTermo('');
    setBusca(null);
  }

  const visiveis = busca?.cliente ? [busca.cliente] : clientes;

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        descricao="Quem a oficina atende — pessoas físicas e frotas."
        acao={
          <div className="flex gap-2">
            <button onClick={recarregar} className="btn-ghost px-3 py-2 text-xs" disabled={carregando}>
              <IconeAtualizar className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button onClick={() => setNovoCliente(true)} className="btn-primary px-4 py-2 text-xs">
              + Novo cliente
            </button>
          </div>
        }
      />

      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo} texto={aviso.texto} />
        </div>
      )}

      <form onSubmit={buscar} className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-panel p-1">
          {(['documento', 'placa'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModoBusca(m)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                modoBusca === m ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink',
              ].join(' ')}
            >
              {m === 'documento' ? 'CPF / CNPJ' : 'Placa'}
            </button>
          ))}
        </div>
        <input
          id="busca-cliente"
          className={`field h-10 flex-1 py-2 sm:max-w-xs ${modoBusca === 'placa' ? 'font-mono uppercase' : ''}`}
          placeholder={modoBusca === 'documento' ? 'Buscar por CPF ou CNPJ…' : 'Buscar pela placa…'}
          value={termo}
          onChange={(e) => setTermo(modoBusca === 'placa' ? e.target.value.toUpperCase() : e.target.value)}
          inputMode={modoBusca === 'documento' ? 'numeric' : 'text'}
        />
        <button type="submit" className="btn-ghost px-4 py-2 text-xs" disabled={busca?.carregando}>
          {busca?.carregando ? 'Buscando…' : 'Buscar'}
        </button>
        {busca && (
          <button type="button" onClick={limparBusca} className="btn-ghost px-3 py-2 text-xs">
            Limpar
          </button>
        )}
      </form>

      {busca?.erro && <Aviso tipo="erro" texto={busca.erro} />}
      {busca?.nota && <p className="mb-3 text-xs text-ink-soft">{busca.nota}</p>}

      {erro && !busca && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && !busca && <Esqueleto linhas={4} />}
      {!carregando && !erro && !busca && clientes.length === 0 && (
        <Vazio titulo="Nenhum cliente" descricao="Cadastre o primeiro cliente para começar." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((c, i) => {
          const nome = texto(c, 'nomeCompleto', 'NomeCompleto', 'nome');
          const id = numero(c, 'id', 'Id');
          const ativo = c.ativo ?? c.Ativo;
          return (
            <article key={String(id ?? i)} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-sm font-bold text-brand">
                  {iniciais(nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nome}</p>
                  <p className="truncate font-mono text-xs text-ink-mute">
                    {documento(texto(c, 'cpf', 'CPF'), texto(c, 'cnpj', 'CNPJ'))}
                  </p>
                </div>
                {ativo === false && (
                  <span className="rounded-full bg-[#e66767]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#e66767]">
                    inativo
                  </span>
                )}
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-mute">Telefone</dt>
                  <dd className="truncate font-medium">{texto(c, 'telefone', 'Telefone')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-mute">E-mail</dt>
                  <dd className="truncate font-medium">{texto(c, 'email', 'Email')}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => id !== null && setFicha(id)}
                  className="btn-ghost flex-1 py-1.5 text-xs"
                  disabled={id === null}
                >
                  Ficha e veículos
                </button>
                <button onClick={() => setNovoVeiculo(c)} className="btn-ghost px-3 py-1.5 text-xs">
                  + Veículo
                </button>
              </div>

              {gerente && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEdicao(c)} className="btn-ghost flex-1 py-1.5 text-xs">
                    Editar
                  </button>
                  <button
                    onClick={() => setExclusao(c)}
                    className="btn-ghost px-3 py-1.5 text-xs text-[#e66767] hover:border-[#e66767]/60"
                  >
                    Excluir
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <ModalFicha id={ficha} gerente={gerente} aoFechar={() => setFicha(null)} />

      <ModalCliente
        aberto={novoCliente}
        aoFechar={() => setNovoCliente(false)}
        aoCriar={() => {
          setNovoCliente(false);
          setAviso({ tipo: 'ok', texto: 'Cliente cadastrado.' });
          void recarregar();
        }}
      />

      <ModalEditarCliente
        cliente={edicao}
        aoFechar={() => setEdicao(null)}
        aoSalvar={() => {
          setEdicao(null);
          setAviso({ tipo: 'ok', texto: 'Cadastro atualizado.' });
          void recarregar();
          limparBusca();
        }}
      />

      <ModalExcluirCliente
        cliente={exclusao}
        aoFechar={() => setExclusao(null)}
        aoExcluir={() => {
          setExclusao(null);
          setAviso({ tipo: 'ok', texto: 'Cliente removido.' });
          void recarregar();
          limparBusca();
        }}
      />

      <ModalNovoVeiculo
        cliente={novoVeiculo}
        aoFechar={() => setNovoVeiculo(null)}
        aoCriar={() => {
          setNovoVeiculo(null);
          setAviso({ tipo: 'ok', texto: 'Veículo cadastrado.' });
        }}
      />
    </>
  );
}

/** Ficha pela rota por id, com a frota do cliente ao lado. */
function ModalFicha({ id, gerente, aoFechar }: { id: number | null; gerente: boolean; aoFechar: () => void }) {
  const cliente = useDados<Registro | null>(async () => (id === null ? null : await api.cliente(id)), [id]);
  const veiculos = useDados<Registro[]>(
    async () => (id === null ? [] : comoLista(await api.veiculosDoCliente(id))),
    [id],
  );
  const [edicao, setEdicao] = useState<Registro | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const c = cliente.dados;

  return (
    <>
      <Modal
        titulo="Ficha do cliente"
        descricao="Cadastro e frota, cada um pela sua rota."
        aberto={id !== null}
        aoFechar={aoFechar}
      >
        {cliente.carregando && <Esqueleto linhas={2} />}
        {cliente.erro && <Aviso tipo="erro" texto={cliente.erro} />}

        {c && (
          <div className="space-y-5">
            {ok && <Aviso tipo="ok" texto={ok} />}

            <dl className="space-y-2.5 text-sm">
              {[
                ['Nome', texto(c, 'nomeCompleto', 'NomeCompleto', 'nome')],
                ['Documento', documento(texto(c, 'cpf', 'CPF'), texto(c, 'cnpj', 'CNPJ'))],
                ['Telefone', texto(c, 'telefone', 'Telefone')],
                ['E-mail', texto(c, 'email', 'Email')],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
                  <dt className="text-ink-mute">{rotulo}</dt>
                  <dd className="truncate font-medium">{valor}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-mute">Frota</h3>
              {veiculos.carregando && <Esqueleto linhas={1} />}
              {!veiculos.carregando && (veiculos.dados ?? []).length === 0 && (
                <p className="text-sm text-ink-soft">Nenhum veículo cadastrado para este cliente.</p>
              )}
              <div className="space-y-2">
                {(veiculos.dados ?? []).map((v, i) => (
                  <div
                    key={numero(v, 'id', 'Id') ?? i}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/40 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {texto(v, 'marca', 'Marca')} {texto(v, 'modelo', 'Modelo')}
                      </p>
                      <p className="truncate font-mono text-xs text-ink-mute">
                        {texto(v, 'placa', 'Placa')} · {texto(v, 'anoModelo', 'AnoModelo')} · {texto(v, 'cor', 'Cor')}
                      </p>
                    </div>
                    {gerente && (
                      <button onClick={() => setEdicao(v)} className="btn-ghost px-3 py-1 text-[11px]">
                        Editar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ModalEditarVeiculo
        veiculo={edicao}
        aoFechar={() => setEdicao(null)}
        aoSalvar={() => {
          setEdicao(null);
          setOk('Veículo atualizado.');
          void veiculos.recarregar();
        }}
      />
    </>
  );
}

function ModalEditarVeiculo({
  veiculo,
  aoFechar,
  aoSalvar,
}: {
  veiculo: Registro | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [campos, setCampos] = useState({ marca: '', modelo: '', placa: '', cor: '', ano: '2024', km: '0' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState<number | null>(null);

  const id = veiculo ? numero(veiculo, 'id', 'Id') : null;
  if (veiculo && id !== carregado) {
    setCarregado(id);
    setCampos({
      marca: texto(veiculo, 'marca', 'Marca').replace('—', ''),
      modelo: texto(veiculo, 'modelo', 'Modelo').replace('—', ''),
      placa: texto(veiculo, 'placa', 'Placa').replace('—', ''),
      cor: texto(veiculo, 'cor', 'Cor').replace('—', ''),
      ano: String(numero(veiculo, 'anoModelo', 'AnoModelo') ?? 2024),
      km: String(numero(veiculo, 'kmEntrada', 'KmEntrada') ?? 0),
    });
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const clienteId = veiculo ? numero(veiculo, 'clienteId', 'ClienteId') : null;
    if (id === null || clienteId === null) return setErro('Veículo sem id ou sem dono identificado.');

    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarVeiculo(id, {
        clienteId,
        marca: campos.marca,
        modelo: campos.modelo,
        placa: campos.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        cor: campos.cor || null,
        anoModelo: Number(campos.ano),
        anoFabricacao: Number(campos.ano),
        kmEntrada: Number(campos.km),
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar o veículo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Editar veículo" descricao="O dono do veículo não muda aqui." aberto={veiculo !== null} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Marca">
            <input className="field" value={campos.marca} onChange={(e) => setCampos({ ...campos, marca: e.target.value })} required />
          </Campo>
          <Campo rotulo="Modelo">
            <input className="field" value={campos.modelo} onChange={(e) => setCampos({ ...campos, modelo: e.target.value })} required />
          </Campo>
        </div>

        <Campo rotulo="Placa">
          <input
            className="field font-mono uppercase"
            value={campos.placa}
            onChange={(e) => setCampos({ ...campos, placa: e.target.value.toUpperCase() })}
            maxLength={7}
            required
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Cor">
            <input className="field" value={campos.cor} onChange={(e) => setCampos({ ...campos, cor: e.target.value })} />
          </Campo>
          <Campo rotulo="Ano">
            <input className="field" type="number" value={campos.ano} onChange={(e) => setCampos({ ...campos, ano: e.target.value })} required />
          </Campo>
          <Campo rotulo="Km">
            <input className="field" type="number" min="0" value={campos.km} onChange={(e) => setCampos({ ...campos, km: e.target.value })} />
          </Campo>
        </div>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalEditarCliente({
  cliente,
  aoFechar,
  aoSalvar,
}: {
  cliente: Registro | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [campos, setCampos] = useState({ nome: '', telefone: '', email: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState<number | null>(null);

  const id = cliente ? numero(cliente, 'id', 'Id') : null;
  if (cliente && id !== carregado) {
    setCarregado(id);
    setCampos({
      nome: texto(cliente, 'nomeCompleto', 'NomeCompleto', 'nome').replace('—', ''),
      telefone: texto(cliente, 'telefone', 'Telefone').replace('—', ''),
      email: texto(cliente, 'email', 'Email').replace('—', ''),
    });
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (id === null || !cliente) return;

    // O documento vai junto porque o PUT substitui o cadastro inteiro; mandar
    // sem ele apagaria o CPF ou o CNPJ de quem já tinha.
    const cpf = texto(cliente, 'cpf', 'CPF');
    const cnpj = texto(cliente, 'cnpj', 'CNPJ');

    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarCliente(id, {
        nomeCompleto: campos.nome,
        cpf: cpf === '—' ? null : cpf,
        cnpj: cnpj === '—' ? null : cnpj,
        telefone: campos.telefone || null,
        email: campos.email || null,
      });
      aoSalvar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Editar cliente"
      descricao="O documento não muda: é ele que identifica o cliente no login."
      aberto={cliente !== null}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome completo">
          <input className="field" value={campos.nome} onChange={(e) => setCampos({ ...campos, nome: e.target.value })} required />
        </Campo>
        <Campo rotulo="Telefone">
          <input className="field" value={campos.telefone} onChange={(e) => setCampos({ ...campos, telefone: e.target.value })} />
        </Campo>
        <Campo rotulo="E-mail">
          <input className="field" type="email" value={campos.email} onChange={(e) => setCampos({ ...campos, email: e.target.value })} />
        </Campo>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalExcluirCliente({
  cliente,
  aoFechar,
  aoExcluir,
}: {
  cliente: Registro | null;
  aoFechar: () => void;
  aoExcluir: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const id = numero(cliente ?? {}, 'id', 'Id');
    if (id === null) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.excluirCliente(id);
      aoExcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível excluir o cliente.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Confirmacao
      titulo="Excluir cliente"
      descricao={
        cliente
          ? `${texto(cliente, 'nomeCompleto', 'NomeCompleto', 'nome')} perde o acesso e sai da listagem. As ordens já registradas continuam no histórico.`
          : ''
      }
      aberto={cliente !== null}
      ocupado={ocupado}
      erro={erro}
      aoFechar={aoFechar}
      aoConfirmar={confirmar}
    />
  );
}

function ModalCliente({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: () => void }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'cpf' | 'cnpj'>('cpf');
  const [doc, setDoc] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const digitos = doc.replace(/\D/g, '');
      await api.criarCliente({
        nomeCompleto: nome,
        cpf: tipo === 'cpf' ? digitos : null,
        cnpj: tipo === 'cnpj' ? digitos : null,
        telefone: telefone || null,
        email: email || null,
      });
      setNome('');
      setDoc('');
      setTelefone('');
      setEmail('');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Novo cliente" descricao="Pessoa física com CPF ou frota com CNPJ." aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome completo">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>

        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1">
          {(['cpf', 'cnpj'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                tipo === t ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink',
              ].join(' ')}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <Campo rotulo={tipo.toUpperCase()} dica={tipo === 'cpf' ? 'O dígito verificador é validado pela API.' : undefined}>
          <input className="field font-mono" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" required />
        </Campo>

        <Campo rotulo="Telefone">
          <input className="field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Campo>

        <Campo rotulo="E-mail">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalNovoVeiculo({
  cliente,
  aoFechar,
  aoCriar,
}: {
  cliente: Registro | null;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [placa, setPlaca] = useState('');
  const [cor, setCor] = useState('');
  const [ano, setAno] = useState('2024');
  const [km, setKm] = useState('0');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const clienteId = numero(cliente ?? {}, 'id', 'Id');
    if (clienteId === null) return;

    setErro(null);
    setSalvando(true);
    try {
      await api.criarVeiculo({
        clienteId,
        marca,
        modelo,
        placa: placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        cor: cor || null,
        anoModelo: Number(ano),
        anoFabricacao: Number(ano),
        kmEntrada: Number(km),
      });
      setMarca('');
      setModelo('');
      setPlaca('');
      setCor('');
      aoCriar();
    } catch (e2) {
      setErro(e2 instanceof ErroApi ? e2.message : 'Não foi possível cadastrar o veículo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Novo veículo"
      descricao={cliente ? `Para ${texto(cliente, 'nomeCompleto', 'NomeCompleto', 'nome')}` : ''}
      aberto={cliente !== null}
      aoFechar={aoFechar}
    >
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Marca">
            <input className="field" value={marca} onChange={(e) => setMarca(e.target.value)} required />
          </Campo>
          <Campo rotulo="Modelo">
            <input className="field" value={modelo} onChange={(e) => setModelo(e.target.value)} required />
          </Campo>
        </div>

        <Campo rotulo="Placa" dica="Formato antigo (ABC1234) ou Mercosul (ABC1D23).">
          <input
            className="field font-mono uppercase"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            maxLength={7}
            required
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Cor">
            <input className="field" value={cor} onChange={(e) => setCor(e.target.value)} />
          </Campo>
          <Campo rotulo="Ano">
            <input className="field" type="number" value={ano} onChange={(e) => setAno(e.target.value)} required />
          </Campo>
          <Campo rotulo="Km">
            <input className="field" type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
          </Campo>
        </div>

        {erro && <Aviso tipo="erro" texto={erro} />}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={aoFechar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
