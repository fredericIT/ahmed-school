'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { SectionBackdrop } from '@/components/layout/section-backdrop';
import { SidebarContent } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AuthProvider, RoleGuard } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setCollapsed(localStorage.getItem('sidebar-collapsed') === '1'), []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  };

  return (
    <AuthProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('Skip to content')}
      </a>
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 transition-[width] duration-300 lg:block',
            collapsed ? 'w-[76px]' : 'w-64',
          )}
        >
          <SidebarContent collapsed={collapsed} onToggle={toggle} />
        </aside>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent aria-describedby={undefined}>
            <DialogTitle className="sr-only">{t('Navigation')}</DialogTitle>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main id="main" className="relative isolate flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Suspense>
              <SectionBackdrop />
            </Suspense>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="mx-auto max-w-[1400px]"
            >
              <RoleGuard>{children}</RoleGuard>
            </motion.div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
