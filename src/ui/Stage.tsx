import { useState } from 'react';

interface Props {
  bg: string;
  tone?: 'warm' | 'cold' | 'dark';
}

/**
 * 全屏舞台。
 * 背景图缺失时（未生成素材 / 加载失败）自动退回色调渐变，
 * 保证任何时候都不会出现白屏或碎图。
 */
export function Stage({ bg, tone = 'dark' }: Props) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`stage tone-${tone}`} aria-hidden="true">
      {!failed && (
        <img
          className="stage__img"
          src={`/assets/bg/${bg}.jpg`}
          alt=""
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <div className="stage__vignette" />
    </div>
  );
}
