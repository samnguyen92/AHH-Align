'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

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

  // Generate visible page numbers (max 5 around current)
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav className="flex items-center justify-center gap-1 py-8" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        className="mr-2"
      >
        Previous
      </Button>

      {start > 1 && (
        <>
          <Button variant="ghost" size="sm" onClick={() => goToPage(1)}>1</Button>
          {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
        </>
      )}

      {pages.map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? 'default' : 'ghost'}
          size="sm"
          onClick={() => goToPage(page)}
          className={
            page === currentPage
              ? 'bg-[var(--ahh-deep-teal)] hover:bg-[var(--ahh-deep-teal)]/90 text-white font-bold shadow-sm'
              : ''
          }
        >
          {page}
        </Button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
          <Button variant="ghost" size="sm" onClick={() => goToPage(totalPages)}>
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(currentPage + 1)}
        className="ml-2"
      >
        Next
      </Button>
    </nav>
  );
}
