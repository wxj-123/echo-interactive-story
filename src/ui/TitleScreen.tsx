import { ENDINGS } from '../content/endings';
import type { EndingKey } from '../engine/types';

interface Props {
  hasSave: boolean;
  unlocked: EndingKey[];
  onStart: () => void;
  onContinue: () => void;
}

export function TitleScreen({ hasSave, unlocked, onStart, onContinue }: Props) {
  return (
    <div className="title">
      <div className="title__inner">
        <div className="title__eyebrow">AIGC 互动影游</div>
        <h1 className="title__main">
          回声<em>ECHO</em>
        </h1>
        <p className="title__lead">
          你是记忆修复师。
          <br />
          而这间屋子里，有一片记忆不是你的。
        </p>

        <div className="title__actions">
          {hasSave && (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              继续上次的接驳
            </button>
          )}
          <button type="button" className={`btn ${hasSave ? '' : 'btn--primary'}`} onClick={onStart}>
            {hasSave ? '重新开始' : '开始接驳'}
          </button>
        </div>

        <div className="title__endings">
          <span className="title__endings-label">结局收集</span>
          {ENDINGS.map((e) => (
            <span
              key={e.key}
              className={`title__ending ${unlocked.includes(e.key) ? 'is-unlocked' : ''}`}
              title={unlocked.includes(e.key) ? e.subtitle : '未解锁'}
            >
              {unlocked.includes(e.key) ? e.title : '？？'}
            </span>
          ))}
        </div>

        <p className="title__note">
          全程约 30 分钟 · 3 个结局 · 支持中途退出自动存档
        </p>
      </div>
    </div>
  );
}
