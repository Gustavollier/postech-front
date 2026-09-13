import { Navigate, Route, Routes } from 'react-router-dom';
import { ProvedorAuth, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Entrar from './pages/Entrar';
import Painel from './pages/Painel';
import Ordens from './pages/Ordens';
import Clientes from './pages/Clientes';
import Pecas from './pages/Pecas';
import type { ReactNode } from 'react';

function Protegido({ children }: { children: ReactNode }) {
  const { sessao } = useAuth();
  return sessao ? <>{children}</> : <Navigate to="/entrar" replace />;
}

export default function App() {
  return (
    <ProvedorAuth>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route
          element={
            <Protegido>
              <Layout />
            </Protegido>
          }
        >
          <Route path="/" element={<Painel />} />
          <Route path="/ordens" element={<Ordens />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/pecas" element={<Pecas />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProvedorAuth>
  );
}
