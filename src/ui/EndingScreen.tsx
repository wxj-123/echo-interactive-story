import { ENDINGS, type EndingMeta } from '../content/endings';
import type { EndingKey } from '../engine/types';

interface Props {
  ending: EndingMeta;
  minutes: number;
  nodes: number;
  integrity: number;
  freeActions: number;
  epilogue: string | null;
  loading: boolean;
  degraded: boolean;
  unlocked: EndingKey[];
  onRestart: () => void;
  onTitle: () => void;
}

export function EndingScreen(props: Props) {
  const { ending, minutes, nodes, integrity, freeActions, epilogue, loading, degraded } = props;

  return (
    <div className="ending">
      <div className="ending__inner">
        <div className="ending__eyebrow">结局</div>
        <h1 className="ending__title">{ending.title}</h1>
        <p className="ending__subtitle">{ending.subtitle}</p>

        <div className="ending__rule" />

        <div className="ending__epilogue">
          <div className="ending__label">
            结案摘要
            {loading && <span className="ending__loading">生成中…</span>}
            {degraded && !loading && <span className="ending__loading">本地模板</span>}
          </div>
          <p className={`ending__text ${loading ? 'is-loading' : ''}`}>
            {epilogue ?? '正在调取你的行动轨迹…'}
          </p>
        </div>

        <div className="ending__stats">
          <div>
            <b>{minutes}</b>
            <span>分钟</span>
          </div>
          <div>
            <b>{nodes}</b>
            <span>个场景</span>
          </div>
          <div>
            <b>{integrity}/8</b>
            <span>记忆碎片</span>
          </div>
          <div>
            <b>{freeActions}</b>
            <span>次自由行动</span>
          </div>
        </div>

        <div className="ending__unlocked">
          <span className="ending__label">结局收集 {props.unlocked.length} / {ENDINGS.length}</span>
          <div className="ending__chips">
            {ENDINGS.map((e) => (
              <span
                key={e.key}
                className={`ending__chip ${props.unlocked.includes(e.key) ? 'is-unlocked' : ''}`}
              >
                {e.title}
              </span>
            ))}
          </div>
        </div>

        <div className="ending__actions">
          <button type="button" className="btn btn--primary" onClick={props.onRestart}>
            再来一次
          </button>
          <button type="button" className="btn" onClick={props.onTitle}>
            回到标题
          </button>
        </div>

        <p className="ending__hint">
          {ending.key === 'yongye' && '如果你在终章选了另一边，故事会有不同的走向。'}
          {ending.key === 'huisheng' && '「归还」需要你在第一章就把屏幕转向她。'}
          {ending.key === 'guihuan' && '还有两个结局，取决于你在月台上按下了哪个按钮。'}
        </p>
      </div>
    </div>
  );
}
