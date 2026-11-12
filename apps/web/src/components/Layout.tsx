import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '../copy.js';
import styles from './Layout.module.css';

/** Three rounded "code blocks": a small, friendly mark that isn't anyone's logo. */
function BlocksMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect x="2" y="14" width="11" height="11" rx="3" fill="#0F766E" />
      <rect x="15" y="14" width="11" height="11" rx="3" fill="#F2B544" />
      <rect x="8.5" y="2" width="11" height="11" rx="3" fill="#1F2A44" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <BlocksMark />
          {copy.productName}
        </Link>
      </header>
      <main className={styles.main} id="main">
        {children}
      </main>
      <footer className={styles.footer}>Demo app for a take-home assignment.</footer>
    </>
  );
}
