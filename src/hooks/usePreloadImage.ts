import { useEffect, useRef } from 'react';

/** 预加载下一幕背景，避免切场景时闪白 */
export function usePreloadImage(src: string | undefined) {
  const cache = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!src || cache.current.has(src)) return;
    cache.current.add(src);
    const img = new Image();
    img.src = src;
  }, [src]);
}
