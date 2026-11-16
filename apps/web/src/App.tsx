// Author: Nazaryan Artem (@sl1dee36)
import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/useAuthStore';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:code" element={<RoomPage />} />
    </Routes>
  );
}
