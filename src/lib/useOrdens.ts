import { api, comoLista } from './api';
import { useDados } from './useDados';
import { useAuth } from './auth';
import type { Registro } from './types';

/**
 * Ordens visíveis para quem está logado.
 *
 * A rota geral pertence à equipe: um token de cliente recebe 403 nela, de
 * propósito. O cliente consulta a rota do próprio cadastro, onde a API ainda
 * confere se o id pedido é mesmo o dele.
 */
export function useOrdens() {
  const { sessao } = useAuth();
  const ehCliente = sessao?.tipo === 'cliente';
  const clienteId = sessao?.clienteId;

  // O filtro é do servidor: a listagem do OS aceita ?idCliente=. Filtrar no
  // navegador traria as ordens de todos os clientes até a máquina de um
  // cliente, o que é vazamento, não só desperdício.
  const consulta = useDados<Registro[]>(async () => {
    if (ehCliente && clienteId === undefined) return [];
    return comoLista(await api.ordens(ehCliente ? clienteId : undefined));
  }, [ehCliente, clienteId]);

  return { ...consulta, ehCliente };
}
