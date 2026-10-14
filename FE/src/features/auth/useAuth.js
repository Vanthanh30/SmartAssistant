import { useQuery } from '@tanstack/react-query';
import { getSession } from './api.js';
export const sessionKey = ['auth', 'session'];
export function useAuth() {
  return useQuery({ queryKey: sessionKey, queryFn: getSession, retry: false,
    staleTime: 30000, refetchOnWindowFocus: true });
}
