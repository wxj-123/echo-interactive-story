import { useState } from 'react';
import type { FreeAction as FreeActionData } from '../engine/types';

interface Props {
  free: FreeActionData;
  busy: boolean;
  onSubmit: (action: string) => void;
}

/**
 * 自由行动输入。
 * 提供三条快捷建议，避免第一次玩的人「不知道该写什么」而卡住。
 */
export function FreeAction({ free, busy, onSubmit }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  };

  return (
    <div className="free">
      <div className="free__prompt">{free.prompt}</div>

      <div className="free__row">
        <input
          className="free__input"
          value={value}
          maxLength={60}
          placeholder={free.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
          }}
          disabled={busy}
          aria-label="输入你的行动"
        />
        <button className="free__go" type="button" onClick={submit} disabled={busy || !value.trim()}>
          {busy ? '裁定中' : '执行'}
        </button>
      </div>

      <div className="free__tips">
        {free.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="free__tip"
            onClick={() => setValue(s)}
            disabled={busy}
          >
            {s}
          </button>
        ))}
      </div>

      {busy && (
        <div className="free__busy">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          正在调取记忆碎片，判定你的行动…
        </div>
      )}
    </div>
  );
}
