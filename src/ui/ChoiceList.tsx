import { useEffect, useState } from 'react';
import type { Choice } from '../engine/types';

interface Props {
  choices: Choice[];
  onPick: (id: string) => void;
}

export function ChoiceList({ choices, onPick }: Props) {
  // 防连点误触：玩家习惯连续点击推进对白，选项刚出现时先锁 450ms
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`choices ${ready ? '' : 'is-locked'}`} role="group" aria-label="选项">
      {choices.map((choice, index) => (
        <button
          key={choice.id}
          type="button"
          className="choice"
          disabled={!ready}
          onClick={() => onPick(choice.id)}
        >
          <span className="choice__index">{String(index + 1).padStart(2, '0')}</span>
          <span className="choice__body">
            <span className="choice__text">{choice.text}</span>
            {choice.hint && <span className="choice__hint">{choice.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
