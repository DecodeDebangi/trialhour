import { Route, Routes } from 'react-router-dom';
import { BookPage } from './pages/BookPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<BookPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
