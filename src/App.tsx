import { useCallback, useEffect, useMemo, useState } from 'react';
import storyJson from './content/story.json';
import type { EndingKey, GameState, Story } from './engine/types';
import {
  advance,
  awaitingDecision,
  chooseOption,
  parseSave,
  resolveFreeAction,
  SAVE_KEY,
  serializeSave,
  startGame,
} from './engine/reducer';
import { validateStory } from './engine/validate';
import { findEnding } from './content/endings';
import { useTypewriter } from './hooks/useTypewriter';
import { usePreloadImage } from './hooks/usePreloadImage';
import { Stage } from './ui/Stage';
import { Hud } from './ui/Hud';
import { DialogueBox } from './ui/DialogueBox';
import { ChoiceList } from './ui/ChoiceList';
import { FreeAction } from './ui/FreeAction';
import { Interlude } from './ui/Interlude';
import { TitleScreen } from './ui/TitleScreen';
import { EndingScreen } from './ui/EndingScreen';
import { Guide } from './ui/Guide';
import { narrate, requestEpilogue } from './ai/client';
import { RainAudio } from './audio/rain';
import { GUIDES, readSeenGuides, writeSeenGuides, type GuideKey } from './content/guides';

const story = storyJson as unknown as Story;

// 启动即校验一次剧情图，坏数据早暴露（正常构建不应触发）
const REPORT = validateStory(story);
if (REPORT.errors.length) {
  console.error('[story] 剧情校验失败', REPORT.errors);
}

const TOTAL_NODES = Object.keys(story.nodes).length;

interface Pending {
  narration: string;
  nodeId: string;
  degraded: boolean;
}

interface SaveInfo {
  state: GameState;
  savedAt: number;
}

function readSave(): SaveInfo | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState & { savedAt?: number };
    const state = parseSave(JSON.stringify(parsed), story);
    if (!state || state.finishedAt) return null;
    return { state, savedAt: parsed.savedAt ?? Date.now() };
  } catch {
    return null;
  }
}

function readUnlocked(): EndingKey[] {
  try {
    const raw = localStorage.getItem('echo.endings');
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as EndingKey[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [save] = useState<SaveInfo | null>(readSave);
  const [screen, setScreen] = useState<'title' | 'play'>('title');
  const [state, setState] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [epilogue, setEpilogue] = useState<string | null>(null);
  const [epilogueLoading, setEpilogueLoading] = useState(false);
  const [epilogueDegraded, setEpilogueDegraded] = useState(false);
  const [unlocked, setUnlocked] = useState<EndingKey[]>(readUnlocked);
  const [rain] = useState(() => new RainAudio());
  const [soundOn, setSoundOn] = useState(true);
  const [seenGuides, setSeenGuides] = useState<GuideKey[]>(readSeenGuides);
  const [guide, setGuide] = useState<{ key: GuideKey; text: string } | null>(null);

  const node = state ? story.nodes[state.nodeId] : null;
  const line = node && state ? node.lines[state.lineIndex] : undefined;
  const typewriter = useTypewriter(line?.text ?? '');

  // 预加载下一场景，减少切场白闪
  const nextBgSrc = useMemo(() => {
    if (!node) return undefined;
    const aim = node.next ?? node.choices?.[0]?.next ?? node.freeAction?.fallback;
    const bg = aim ? story.nodes[aim]?.bg : undefined;
    return bg ? `/assets/bg/${bg}.jpg` : undefined;
  }, [node]);
  usePreloadImage(nextBgSrc);

  // 场景色调联动雨声质感
  useEffect(() => {
    rain.setTone(node?.bgTone ?? 'dark');
  }, [rain, node?.bgTone]);

  // 卸载时释放音频上下文
  useEffect(() => () => rain.dispose(), [rain]);

  // 每次状态变化自动存档
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, serializeSave(state));
    } catch {
      /* 隐私模式下写入失败，不影响继续游玩 */
    }
  }, [state]);

  // 到达结局：解锁 + 请求个性化摘要
  const finishedAt = state?.finishedAt;
  const endingKey = state?.endingKey;
  const vars = state?.vars;

  useEffect(() => {
    if (!finishedAt || !endingKey || !vars) return;

    setUnlocked((prev) => {
      if (prev.includes(endingKey)) return prev;
      const next = [...prev, endingKey];
      try {
        localStorage.setItem('echo.endings', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

    let cancelled = false;
    setEpilogueLoading(true);
    setEpilogue(null);
    setEpilogueDegraded(false);

    requestEpilogue(endingKey, vars)
      .then((res) => {
        if (cancelled) return;
        setEpilogue(res.text);
        setEpilogueDegraded(res.degraded);
      })
      .finally(() => {
        if (!cancelled) setEpilogueLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [finishedAt, endingKey, vars]);

  const dismissGuide = useCallback(() => {
    if (!guide) return;
    const key = guide.key;
    setGuide(null);
    setSeenGuides((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      writeSeenGuides(next);
      return next;
    });
  }, [guide]);

  /**
   * 新手指引：只在玩家第一次遇到某类操作时弹一次。
   * 优先级 自由行动 > 选项 > 基础点击，保证最需要解释的先出现。
   */
  useEffect(() => {
    if (screen !== 'play' || !state || !node || pending || guide) return;

    const decision = awaitingDecision(state, story);
    const isFree = decision && Boolean(node.freeAction);
    const isChoice = decision && Boolean(node.choices?.length);

    if (isFree && !seenGuides.includes('free')) {
      setGuide({ key: 'free', text: GUIDES.free });
    } else if (isChoice && !seenGuides.includes('choice')) {
      setGuide({ key: 'choice', text: GUIDES.choice });
    } else if (!seenGuides.includes('click')) {
      setGuide({ key: 'click', text: GUIDES.click });
    }
  }, [screen, state, node, pending, guide, seenGuides]);

  const handleStageClick = useCallback(() => {
    // 引导还在时，第一下点击先关引导，避免玩家在没读提示的情况下误推进
    if (guide) {
      dismissGuide();
      return;
    }
    if (!state || pending || busy) return;
    if (!typewriter.done) {
      typewriter.skip();
      return;
    }
    if (awaitingDecision(state, story)) return;
    setState(advance(state, story));
  }, [state, pending, busy, typewriter, guide, dismissGuide]);

  const handleChoose = useCallback(
    (id: string) => {
      if (!state) return;
      setState(chooseOption(state, story, id));
    },
    [state],
  );

  const handleFreeAction = useCallback(
    async (action: string) => {
      if (!state || !node?.freeAction) return;
      const free = node.freeAction;
      setBusy(true);

      const result = await narrate(state.nodeId, action, state.vars);

      setPending(
        result
          ? { narration: result.narration, nodeId: result.nodeId, degraded: result.degraded }
          : {
              narration: '接驳信号断了。你凭直觉走了最稳的那条路。',
              nodeId: free.fallback,
              degraded: true,
            },
      );
      setBusy(false);
    },
    [state, node],
  );

  const confirmPending = useCallback(() => {
    if (!state || !pending) return;
    const next = resolveFreeAction(state, story, pending.nodeId);
    setPending(null);
    setState(next);
  }, [state, pending]);

  const resetEpilogue = () => {
    setEpilogue(null);
    setEpilogueLoading(false);
    setEpilogueDegraded(false);
  };

  const startNew = useCallback(() => {
    resetEpilogue();
    setPending(null);
    setBusy(false);
    setGuide(null);
    setState(startGame(story));
    setScreen('play');
    if (soundOn) void rain.start();
  }, [rain, soundOn]);

  const continueSave = useCallback(() => {
    if (!save) return;
    resetEpilogue();
    setGuide(null);
    setState(save.state);
    setScreen('play');
    if (soundOn) void rain.start();
  }, [save, rain, soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      if (on) void rain.mute();
      else void rain.unmute();
      return !on;
    });
  }, [rain]);

  const backToTitle = useCallback(() => {
    setScreen('title');
    setState(null);
    setPending(null);
    setGuide(null);
  }, []);

  /* ------------------------------- 渲染 ------------------------------- */

  if (screen === 'title') {
    return (
      <TitleScreen
        hasSave={Boolean(save)}
        unlocked={unlocked}
        onStart={startNew}
        onContinue={continueSave}
      />
    );
  }

  if (!state || !node) {
    return (
      <div className="fatal">
        <p>存档读取失败，无法恢复进度。</p>
        <button type="button" className="btn btn--primary" onClick={startNew}>
          从头开始
        </button>
      </div>
    );
  }

  const awaitDecision = awaitingDecision(state, story);
  const showChoices = awaitDecision && Boolean(node.choices?.length);
  const showFree = awaitDecision && Boolean(node.freeAction);
  const ending = findEnding(state.endingKey);

  if (state.finishedAt && ending) {
    return (
      <EndingScreen
        ending={ending}
        minutes={Math.max(1, Math.round((state.finishedAt - state.startedAt) / 60000))}
        nodes={state.history.length}
        integrity={state.vars.integrity}
        freeActions={state.vars.freeActions}
        epilogue={epilogue}
        loading={epilogueLoading}
        degraded={epilogueDegraded}
        unlocked={unlocked}
        onRestart={startNew}
        onTitle={backToTitle}
      />
    );
  }

  return (
    <div className={`app ${showChoices || showFree ? 'app--branch' : ''}`}>
      <Stage key={node.bg} bg={node.bg} tone={node.bgTone} />
      <Hud
        chapter={node.chapter}
        title={node.title}
        progress={state.history.length / TOTAL_NODES}
        integrity={state.vars.integrity}
      />

      <div className="app__hit" onClick={handleStageClick} role="presentation">
        {line && <DialogueBox line={line} shown={typewriter.shown} done={typewriter.done} />}

        {typewriter.done && !awaitDecision && !node.ending && (
          <div className="cont" aria-hidden="true">
            继续 <span>▾</span>
          </div>
        )}

        {showChoices && <ChoiceList choices={node.choices!} onPick={handleChoose} />}
        {showFree && <FreeAction free={node.freeAction!} busy={busy} onSubmit={handleFreeAction} />}
      </div>

      {pending && (
        <Interlude
          narration={pending.narration}
          degraded={pending.degraded}
          targetTitle={story.nodes[pending.nodeId]?.title ?? '未知场景'}
          onContinue={confirmPending}
        />
      )}

      {guide && <Guide text={guide.text} onClose={dismissGuide} />}

      <footer className="app__foot">
        <span>
          {REPORT.stats.nodes} 个场景 · 碎片 {state.vars.integrity}/8
        </span>
        <div className="app__foot-actions">
          <button type="button" className="app__quit" onClick={toggleSound}>
            {soundOn ? '雨声 开' : '雨声 关'}
          </button>
          <button type="button" className="app__quit" onClick={backToTitle}>
            退出
          </button>
        </div>
      </footer>
    </div>
  );
}
