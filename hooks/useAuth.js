'use client';

// Kept as a thin re-export so existing imports (`@/hooks/useAuth`) keep working
// while the real implementation lives in the AuthContext provider.
export { useAuth, AuthProvider } from '@/contexts/AuthContext';
