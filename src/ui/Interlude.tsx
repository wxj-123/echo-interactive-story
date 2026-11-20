interface Props {
  narration: string;
  degraded: boolean;
  targetTitle: string;
  onContinue: () => void;
}

/**
 * 模型裁定结果的中间态。
 * 不直接跳场景，而是先把「系统怎么理解你的行动」摊开给玩家看，
 * 这样玩家能感知到输入真的被读懂了，而不是随机跳转。
 */
export function Interlude({ narration, degraded, targetTitle, onContinue }: Props) {
  return (
    <>
      <div className="interlude__mask" aria-hidden="true" />
      <div className="interlude" role="dialog" aria-live="polite">
        <div className={`interlude__tag ${degraded ? 'is-degraded' : ''}`}>
          {degraded ? '记忆回溯 · 本地推演' : '叙事裁定'}
        </div>
        <p className="interlude__text">{narration}</p>
        <div className="interlude__foot">
          <span className="interlude__target">→ {targetTitle}</span>
          <button type="button" className="interlude__go" onClick={onContinue}>
            继续
          </button>
        </div>
      </div>
    </>
  );
}
