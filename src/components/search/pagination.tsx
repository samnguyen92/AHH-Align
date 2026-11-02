'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export function SearchPagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/search?${params.toString()}`);
  }

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav className="lg-pagination" aria-label="Pagination">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        className="lg-page-btn"
      >
        ← Prev
      </button>

      {start > 1 && (
        <>
          <button type="button" onClick={() => goToPage(1)} className="lg-page-btn">
            1
          </button>
          {start > 2 && <span className="px-1 text-sm text-[#5A7A70]">…</span>}
        </>
      )}

      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => goToPage(page)}
          className={`lg-page-btn ${page === currentPage ? 'is-active' : ''}`}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-sm text-[#5A7A70]">…</span>}
          <button type="button" onClick={() => goToPage(totalPages)} className="lg-page-btn">
            {totalPages}
          </button>
        </>
      )}

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(currentPage + 1)}
        className="lg-page-btn"
      >
        Next →
      </button>
    </nav>
  );
}
