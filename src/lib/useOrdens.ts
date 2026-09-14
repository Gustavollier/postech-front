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

  const consulta = useDados<Registro[]>(async () => {
    if (ehCliente) {
      if (clienteId === undefined) return [];
      return comoLista(await api.ordensDoCliente(clienteId));
    }
    return comoLista(await api.ordensServico());
  }, [ehCliente, clienteId]);

  return { ...consulta, ehCliente };
}
