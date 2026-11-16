import { api, comoLista } from './api';
import { useDados } from './useDados';
import { useAuth } from './auth';
import { numero } from './types';
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
    const ordens = comoLista(await api.ordens(ehCliente ? clienteId : undefined));
    // Mais nova primeiro, sempre: o serviço não garante ordem na listagem, e
    // "Ordens recentes" do painel mostrava a que tivesse vindo na frente.
    ordens.sort((a, b) => (numero(b, 'id') ?? 0) - (numero(a, 'id') ?? 0));
    return marcarCanceladas(ordens);
  }, [ehCliente, clienteId]);

  return { ...consulta, ehCliente };
}

/** Status em que a ordem ainda pode ter sido cancelada pela saga. */
const ENCERRADOS = new Set(['Finalizada', 'Entregue']);

/** Teto de consultas de saga por carga: o APIM limita a 120 chamadas/min por IP. */
const MAXIMO_DE_SAGAS = 30;

/**
 * Marca como "Cancelada" a ordem cuja saga foi compensada.
 *
 * O OS Service não tem esse status: quando o cliente rejeita o orçamento (ou o
 * pagamento falha de vez), a saga vai para `Cancelada` e a ordem fica com o
 * último status do fluxo. Na lista, isso mostrava uma ordem encerrada como
 * "Aguardando aprovação" e a contava entre as abertas.
 *
 * A listagem não traz o passo da saga, então ele é consultado por ordem — só
 * para as que ainda não terminaram e com teto, para não gastar a cota do
 * gateway. Falha na consulta não derruba a lista: a ordem só fica com o status
 * que veio.
 */
async function marcarCanceladas(ordens: Registro[]): Promise<Registro[]> {
  const candidatas = ordens
    .filter((o) => !ENCERRADOS.has(String(o.status ?? '')))
    .slice(0, MAXIMO_DE_SAGAS);

  const canceladas = new Map<number, string>();
  await Promise.all(
    candidatas.map(async (o) => {
      const id = numero(o, 'id');
      if (id === null) return;
      try {
        const saga = await api.saga(id);
        if (saga.passo === 'Cancelada') canceladas.set(id, String(saga.motivoDaCompensacao ?? ''));
      } catch {
        /* sem saga ainda, ou consulta falhou: mantém o status da listagem */
      }
    }),
  );

  if (canceladas.size === 0) return ordens;
  return ordens.map((o) => {
    const id = numero(o, 'id');
    return id !== null && canceladas.has(id)
      ? { ...o, status: 'Cancelada', motivoDoCancelamento: canceladas.get(id) }
      : o;
  });
}
