'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AcademicYear,
  BookCategory,
  InventoryCategory,
  SchoolClass,
  SchoolSettings,
  Supplier,
  Term,
} from '@/types';

/** Shared reference data, cached across pages. */
export const useClasses = () =>
  useQuery({
    queryKey: ['classes'],
    queryFn: () => api.get<SchoolClass[]>('/classes'),
    staleTime: 60_000,
  });
export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SchoolSettings>('/settings'),
    staleTime: 5 * 60_000,
  });
export const useTerms = () =>
  useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get<Term[]>('/academic/terms'),
    staleTime: 5 * 60_000,
  });
export const useYears = () =>
  useQuery({
    queryKey: ['years'],
    queryFn: () => api.get<AcademicYear[]>('/academic/years'),
    staleTime: 5 * 60_000,
  });
export const useCurrent = () =>
  useQuery({
    queryKey: ['academic-current'],
    queryFn: () => api.get<{ year: AcademicYear | null; term: Term | null }>('/academic/current'),
    staleTime: 5 * 60_000,
  });
export const useInventoryCategories = () =>
  useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => api.get<InventoryCategory[]>('/inventory/categories'),
    staleTime: 60_000,
  });
export const useSuppliers = () =>
  useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () =>
      (
        await api.list<Supplier>('/inventory/suppliers', {
          pageSize: 500,
          sortBy: 'name',
          sortOrder: 'asc',
        })
      ).data,
    staleTime: 60_000,
  });
export const useBookCategories = () =>
  useQuery({
    queryKey: ['book-categories'],
    queryFn: () => api.get<BookCategory[]>('/library/categories'),
    staleTime: 60_000,
  });

export function useCurrency(): string {
  return useSettings().data?.currency ?? 'RWF';
}
