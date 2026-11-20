import type { Line } from '../engine/types';

interface Props {
  line: Line;
  shown: string;
  done: boolean;
}

export function DialogueBox({ line, shown, done }: Props) {
  return (
    <div className="dialogue">
      {line.speaker && <div className="dialogue__speaker">{line.speaker}</div>}
      <p className={`dialogue__text is-${line.tone ?? 'narrator'}`}>
        {shown}
        {!done && <span className="caret" />}
      </p>
    </div>
  );
}
