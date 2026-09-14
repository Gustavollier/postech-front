import { useMemo } from 'react';
import { api, comoLista } from './api';
import { useDados } from './useDados';
import { useAuth } from './auth';
import { indexar, numero, texto } from './types';
import type { Registro } from './types';

/**
 * Nomes por id.
 *
 * As ordens chegam da API com `idCliente`, `idVeiculo` e `idFuncionario` — sem
 * nome nenhum. Mostrar "Cliente 3 · Veículo 2" é o que a tela recebe, mas não é
 * o que alguém da oficina reconhece. Carregamos as listagens uma vez e cruzamos
 * em memória, em vez de uma requisição por linha.
 *
 * O perfil de cliente recebe 403 nas listagens da operação, de propósito — é a
 * regra de posse que a API aplica. Para ele não há o que cruzar: o próprio nome
 * já vem na sessão e os veículos são buscados um a um, onde a API confere posse.
 */
export function useCatalogos() {
  const { sessao } = useAuth();
  const ehEquipe = sessao?.tipo === 'funcionario';

  const clientes = useDados<Registro[]>(
    async () => (ehEquipe ? comoLista(await api.clientes()) : []),
    [ehEquipe],
  );
  const funcionarios = useDados<Registro[]>(
    async () => (ehEquipe ? comoLista(await api.funcionarios()) : []),
    [ehEquipe],
  );
  const pecas = useDados<Registro[]>(
    async () => (ehEquipe ? comoLista(await api.pecas()) : []),
    [ehEquipe],
  );

  const listaClientes = clientes.dados;
  const listaFuncionarios = funcionarios.dados;
  const listaPecas = pecas.dados;

  return useMemo(() => {
    const porCliente = indexar(listaClientes ?? []);
    const porFuncionario = indexar(listaFuncionarios ?? []);
    const porPeca = indexar(listaPecas ?? []);

    return {
      nomeCliente: (id: number | null) => {
        if (id === null) return '—';
        // O cliente conhece a si mesmo pela sessão, sem precisar da listagem.
        if (!ehEquipe) return sessao?.nome ?? 'Você';
        const c = porCliente.get(id);
        return c ? texto(c, 'nomeCompleto', 'NomeCompleto', 'nome') : `Cliente ${id}`;
      },

      nomeFuncionario: (id: number | null) => {
        if (id === null) return '—';
        const f = porFuncionario.get(id);
        return f ? texto(f, 'nome', 'Nome') : `Funcionário ${id}`;
      },

      nomePeca: (id: number | null) => {
        if (id === null) return '—';
        const p = porPeca.get(id);
        if (!p) return `Peça ${id}`;
        const nome = texto(p, 'nome', 'Nome');
        const marca = texto(p, 'marca', 'Marca');
        return marca === '—' ? nome : `${nome} · ${marca}`;
      },
    };
  }, [listaClientes, listaFuncionarios, listaPecas, ehEquipe, sessao?.nome]);
}

/**
 * Veículos por id.
 *
 * Não existe rota de listagem geral de veículos, então buscamos só os ids que
 * aparecem na tela, uma vez cada. Falha em um id não derruba os outros: pode ser
 * um veículo removido, ou a própria regra de posse recusando o acesso.
 */
export function useVeiculos(ids: (number | null)[]) {
  const chave = [...new Set(ids.filter((i): i is number => i !== null))].sort((a, b) => a - b).join(',');

  const { dados } = useDados<Map<number, Registro>>(async () => {
    const mapa = new Map<number, Registro>();
    if (!chave) return mapa;
    await Promise.all(
      chave.split(',').map(async (bruto) => {
        const id = Number(bruto);
        try {
          mapa.set(id, await api.veiculo(id));
        } catch {
          /* sem acesso ou inexistente: cai no rótulo genérico */
        }
      }),
    );
    return mapa;
  }, [chave]);

  return dados;
}

/** Descrição legível de um veículo, tolerante a campos ausentes. */
export function descreverVeiculo(v: Registro | undefined, idFallback: number | null): string {
  if (!v) return idFallback === null ? '—' : `Veículo ${idFallback}`;
  const marca = texto(v, 'marca', 'Marca');
  const modelo = texto(v, 'modelo', 'Modelo');
  const placa = texto(v, 'placa', 'Placa');
  const nome = [marca, modelo].filter((x) => x !== '—').join(' ');
  if (!nome) return placa === '—' ? `Veículo ${idFallback ?? '—'}` : placa;
  return placa === '—' ? nome : `${nome} · ${placa}`;
}

/**
 * Rótulos prontos de uma lista de ordens: quem é o cliente, qual é o carro e
 * quem é o responsável. Painel, listagem e detalhe mostram a mesma coisa — se
 * cada tela montasse o texto por conta própria, elas divergiriam.
 */
export function useRotulosOrdem(ordens: Registro[]) {
  const { sessao } = useAuth();
  const ehCliente = sessao?.tipo === 'cliente';
  const catalogos = useCatalogos();
  const veiculos = useVeiculos(ordens.map((o) => numero(o, 'idVeiculo', 'veiculoId')));

  return useMemo(
    () => ({
      titulo(o: Registro) {
        const idVeiculo = numero(o, 'idVeiculo', 'veiculoId');
        const carro = descreverVeiculo(veiculos?.get(idVeiculo ?? -1), idVeiculo);
        if (ehCliente) return carro;
        return `${catalogos.nomeCliente(numero(o, 'idCliente', 'clienteId'))} · ${carro}`;
      },
      responsavel(o: Registro) {
        return catalogos.nomeFuncionario(numero(o, 'idFuncionario', 'funcionarioId'));
      },
    }),
    [veiculos, catalogos, ehCliente],
  );
}
