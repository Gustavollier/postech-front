/** Status da ordem de serviço, no mesmo enum que a API usa. */
export const STATUS = [
  { id: 0, nome: 'Recebida', cor: '#3987e5' },
  { id: 1, nome: 'Em diagnóstico', cor: '#d95926' },
  { id: 2, nome: 'Aguardando aprovação', cor: '#199e70' },
  { id: 3, nome: 'Em execução', cor: '#c98500' },
  { id: 4, nome: 'Finalizada', cor: '#d55181' },
  { id: 5, nome: 'Entregue', cor: '#008300' },
] as const;

export type StatusId = (typeof STATUS)[number]['id'];

export function statusPorId(id: number) {
  return STATUS.find((s) => s.id === id) ?? { id, nome: `Status ${id}`, cor: '#6b7482' };
}

/** As listagens não declaram schema no OpenAPI, então lemos de forma tolerante. */
export type Registro = Record<string, unknown>;

export function texto(r: Registro, ...chaves: string[]): string {
  for (const c of chaves) {
    const v = r[c] ?? r[c[0].toLowerCase() + c.slice(1)] ?? r[c[0].toUpperCase() + c.slice(1)];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '—';
}

export function numero(r: Registro, ...chaves: string[]): number | null {
  for (const c of chaves) {
    const v = r[c] ?? r[c[0].toLowerCase() + c.slice(1)] ?? r[c[0].toUpperCase() + c.slice(1)];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

export const moeda = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type Sessao = {
  token: string;
  tipo: 'cliente' | 'funcionario';
  nome: string;
  detalhe: string;
  expiraEm: number;
};

/** Datas chegam em ISO; mostrar o ISO cru na tela é ruído para quem lê. */
export function dataCurta(valor: string): string {
  if (!valor || valor === '—') return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
