import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.js';

export function NotFoundPage() {
  return (
    <Layout>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Book a free coding class</Link>
      </p>
    </Layout>
  );
}
