'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SortOrder = 'asc' | 'desc';

/**
 * List state (page, search, sort and filters) kept in the URL, so filtered views are
 * shareable and survive refresh/back navigation.
 */
export function useListParams<F extends string>(
  filterKeys: readonly F[],
  defaults: { pageSize?: number; sortBy?: string; sortOrder?: SortOrder } = {},
) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const state = useMemo(() => {
    const filters = Object.fromEntries(filterKeys.map((k) => [k, sp.get(k) ?? undefined])) as Record<
      F,
      string | undefined
    >;
    return {
      page: Number(sp.get('page') ?? 1) || 1,
      pageSize: Number(sp.get('pageSize') ?? defaults.pageSize ?? 20),
      search: sp.get('search') ?? '',
      sortBy: sp.get('sortBy') ?? defaults.sortBy,
      sortOrder: (sp.get('sortOrder') as SortOrder | null) ?? defaults.sortOrder ?? 'desc',
      filters,
    };
  }, [sp, filterKeys, defaults.pageSize, defaults.sortBy, defaults.sortOrder]);

  const update = useCallback(
    (patch: Record<string, string | number | undefined | null>, resetPage = true) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      search: state.search || undefined,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      ...state.filters,
    }),
    [state],
  );

  return {
    ...state,
    query,
    setPage: (page: number) => update({ page }, false),
    setPageSize: (pageSize: number) => update({ pageSize }),
    setSearch: (search: string) => update({ search }),
    setSort: (sortBy: string, sortOrder: SortOrder) => update({ sortBy, sortOrder }, false),
    setFilter: (key: F, value: string | undefined) => update({ [key]: value }),
    reset: () => router.replace(pathname, { scroll: false }),
  };
}
