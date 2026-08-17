'use client';

import type { ReactNode } from 'react';
import styles from '@/app/page.module.css';

export function Chapter({
  number,
  title,
  lead,
  children,
}: {
  number: 1 | 2 | 3;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const headingId = `chapter-${number}-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className={styles.chapter} aria-labelledby={headingId}>
      <header className={styles.chapterHead}>
        <h2 id={headingId} className={styles.chapterTitle}>
          {number} · {title}
        </h2>
        <p className={`muted ${styles.chapterLead}`}>{lead}</p>
      </header>
      {children}
    </section>
  );
}
