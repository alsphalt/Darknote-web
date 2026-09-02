'use client';

import { AuthProvider } from '@/contexts/AuthContext';

export function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
