import { useState } from 'react';
import { api, comoLista, ErroApi } from '../lib/api';
import { useDados } from '../lib/useDados';
import { numero, texto } from '../lib/types';
import type { Registro } from '../lib/types';
import { Cabecalho } from '../components/Layout';
import { Erro, Esqueleto, Vazio } from '../components/Base';
import { Aviso, Campo, Modal } from '../components/Form';
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

export default function Clientes() {
  const { dados, erro, carregando, recarregar } = useDados<Registro[]>(async () =>
    comoLista(await api.clientes()),
  );
  const [novoCliente, setNovoCliente] = useState(false);
  const [novoVeiculo, setNovoVeiculo] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const clientes = dados ?? [];

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

      {erro && <Erro mensagem={erro} aoTentar={recarregar} />}
      {carregando && !erro && <Esqueleto linhas={4} />}
      {!carregando && !erro && clientes.length === 0 && (
        <Vazio titulo="Nenhum cliente" descricao="Cadastre o primeiro cliente para começar." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clientes.map((c, i) => {
          const nome = texto(c, 'nomeCompleto', 'NomeCompleto', 'nome');
          const ativo = c.ativo ?? c.Ativo;
          return (
            <article key={String(numero(c, 'id', 'Id') ?? i)} className="card flex flex-col p-4">
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

              <button
                onClick={() => setNovoVeiculo(c)}
                className="btn-ghost mt-3 w-full py-1.5 text-xs"
              >
                + Cadastrar veículo
              </button>
            </article>
          );
        })}
      </div>

      <ModalNovoCliente
        aberto={novoCliente}
        aoFechar={() => setNovoCliente(false)}
        aoCriar={() => {
          setNovoCliente(false);
          setAviso({ tipo: 'ok', texto: 'Cliente cadastrado.' });
          void recarregar();
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

function ModalNovoCliente({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
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

        <Campo
          rotulo={tipo.toUpperCase()}
          dica={tipo === 'cpf' ? 'O dígito verificador é validado pela API.' : undefined}
        >
          <input
            className="field font-mono"
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            inputMode="numeric"
            required
          />
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
