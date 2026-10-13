import { useEffect, useState } from 'react';

// 统一断点检测（全站只用这一处，禁散写 innerWidth）
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// 移动断点：<768px（对应 Tailwind md 以下）
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
