"use client";

import React from 'react';

export default function PaginationControls({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50]
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);

  if (totalItems <= 5 && totalPages === 1) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      padding: '0.85rem 0.5rem 0.25rem 0.5rem',
      fontSize: '0.85rem',
      color: 'var(--text-muted, #64748b)',
      borderTop: '1px solid var(--border, #e2e8f0)',
      marginTop: '0.75rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>Mostrando <strong>{start}-{end}</strong> de <strong>{totalItems}</strong> registros</span>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
            <span>| Filas:</span>
            <select
              value={pageSize}
              onChange={e => {
                onPageSizeChange(Number(e.target.value));
                if (onPageChange) onPageChange(1);
              }}
              style={{
                padding: '0.2rem 0.4rem',
                borderRadius: '4px',
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--bg-surface, #fff)',
                color: 'var(--text-main, #0f172a)',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="btn btn-secondary"
          style={{
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            opacity: currentPage <= 1 ? 0.5 : 1,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
          }}
        >
          ◀ Anterior
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .map((p, idx, arr) => {
            const prev = arr[idx - 1];
            return (
              <React.Fragment key={p}>
                {prev && p - prev > 1 && <span style={{ padding: '0 0.2rem' }}>...</span>}
                <button
                  type="button"
                  onClick={() => onPageChange(p)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.8rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border, #cbd5e1)',
                    backgroundColor: currentPage === p ? 'var(--primary, #2563eb)' : 'var(--bg-surface, #fff)',
                    color: currentPage === p ? '#fff' : 'var(--text-main, #0f172a)',
                    fontWeight: currentPage === p ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              </React.Fragment>
            );
          })}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="btn btn-secondary"
          style={{
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            opacity: currentPage >= totalPages ? 0.5 : 1,
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
          }}
        >
          Siguiente ▶
        </button>
      </div>
    </div>
  );
}
