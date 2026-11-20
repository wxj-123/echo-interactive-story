import { useEffect } from 'react';

interface Props {
  text: string;
  onClose: () => void;
  /** 自动消失时间，默认 7 秒；玩家点「知道了」也可以立即关闭 */
  duration?: number;
}

export function Guide({ text, onClose, duration = 7000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="guide" role="status" aria-live="polite">
      <span className="guide__mark" aria-hidden="true" />
      <p className="guide__text">{text}</p>
      <button type="button" className="guide__ok" onClick={onClose}>
        知道了
      </button>
    </div>
  );
}
