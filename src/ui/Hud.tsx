interface Props {
  chapter: string;
  title: string;
  progress: number;
  integrity: number;
}

export function Hud({ chapter, title, progress, integrity }: Props) {
  return (
    <header className="hud">
      <div className="hud__left">
        <div className="hud__chapter">{chapter}</div>
        <div className="hud__title">{title}</div>
      </div>
      <div className="hud__right">
        <div className="hud__meter" title={`记忆碎片 ${integrity} / 8`}>
          <span className="hud__label">碎片</span>
          <span className="hud__pips" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <i key={i} className={i < integrity ? 'is-on' : ''} />
            ))}
          </span>
        </div>
        <div className="hud__bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
        </div>
      </div>
    </header>
  );
}
