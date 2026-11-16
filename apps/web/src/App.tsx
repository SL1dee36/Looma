// Author: Nazaryan Artem (@sl1dee36)
import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/useAuthStore';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { RoomsPage } from './pages/RoomsPage';
import { InfoPage } from './pages/InfoPage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/rooms" element={<RoomsPage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/about" element={<InfoPage />} />
      <Route path="/faq" element={<InfoPage />} />
      <Route path="/rules" element={<InfoPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
