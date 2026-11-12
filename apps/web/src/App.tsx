import { Route, Routes } from 'react-router-dom';
import { BookPage } from './pages/BookPage.js';
import { ConfirmationPage } from './pages/ConfirmationPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<BookPage />} />
      <Route path="/bookings/:id" element={<ConfirmationPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
