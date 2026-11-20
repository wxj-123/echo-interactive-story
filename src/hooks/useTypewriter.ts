import { useCallback, useEffect, useState } from 'react';

/**
 * 逐字显示。
 * 用「可见字数」而不是拼字符串，好处是 skip 只是把计数拉满，不会残留定时器。
 */
export function useTypewriter(text: string, speed = 24) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    if (count >= text.length) return;
    const timer = setTimeout(() => setCount((c) => Math.min(c + 1, text.length)), speed);
    return () => clearTimeout(timer);
  }, [count, text, speed]);

  const skip = useCallback(() => setCount(text.length), [text]);

  return { shown: text.slice(0, count), done: count >= text.length, skip };
}
