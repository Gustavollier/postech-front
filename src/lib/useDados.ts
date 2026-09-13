import { useCallback, useEffect, useState } from 'react';
import { ErroApi } from './api';

/** Carrega dados com estados de carregando/erro e um recarregar explícito. */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const executar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await carregar());
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Falha inesperada ao carregar.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void executar();
  }, [executar]);

  return { dados, erro, carregando, recarregar: executar };
}
