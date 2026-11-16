import { useMemo } from 'react';
import { api, comoLista } from './api';
import { useDados } from './useDados';
import { useAuth } from './auth';
import { indexar, numero, texto } from './types';
import type { Registro } from './types';

/**
 * Rótulos prontos de uma lista de ordens: quem é o cliente, qual é o carro e
 * quem é o responsável. Painel e listagem mostram a mesma coisa — se cada tela
 * montasse o texto por conta própria, elas divergiriam.
 *
 * Na Fase 4 a ordem já carrega `nomeCliente` e `descricaoVeiculo`: o OS Service
 * guarda os dois na abertura, justamente para não depender do Identidade a cada
 * leitura (ADR-0006). Então o título sai da própria ordem, sem cruzar com a
 * listagem de clientes nem buscar veículo por veículo. Só o responsável ainda
 * vem como id, e para ele carregamos a equipe uma vez.
 */
export function useRotulosOrdem(_ordens: Registro[]) {
  const { sessao } = useAuth();
  const ehCliente = sessao?.tipo === 'cliente';

  // O perfil de cliente não lista a equipe — e nem precisa: a tela dele não
  // mostra o responsável.
  const funcionarios = useDados<Registro[]>(
    async () => (ehCliente ? [] : comoLista(await api.funcionarios())),
    [ehCliente],
  );
  const lista = funcionarios.dados;

  return useMemo(() => {
    const porFuncionario = indexar(lista ?? []);
    return {
      titulo(o: Registro) {
        const carro = texto(o, 'descricaoVeiculo');
        const veiculo = carro === '—' ? `Veículo ${numero(o, 'idVeiculo') ?? '—'}` : carro;
        if (ehCliente) return veiculo;
        const nome = texto(o, 'nomeCliente');
        const cliente = nome === '—' ? `Cliente ${numero(o, 'idCliente') ?? '—'}` : nome;
        return `${cliente} · ${veiculo}`;
      },
      responsavel(o: Registro) {
        const id = numero(o, 'idFuncionario', 'funcionarioId');
        if (id === null) return '—';
        const f = porFuncionario.get(id);
        return f ? texto(f, 'nome', 'Nome') : `Funcionário ${id}`;
      },
    };
  }, [lista, ehCliente]);
}
