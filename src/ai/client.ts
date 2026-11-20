import type { EndingKey, Vars } from '../engine/types';

const TIMEOUT_MS = 13000;

interface NarrateResponse {
  ok: boolean;
  nodeId: string;
  narration: string;
  degraded: boolean;
}

interface EpilogueResponse {
  ok: boolean;
  text: string;
  degraded: boolean;
}

/**
 * 统一的后端调用封装。
 * 任何异常（超时、断网、500、返回不合法）都收敛成 null，
 * 由调用方决定降级文案——前端不允许因为一次网络请求而卡死。
 */
async function post<T>(path: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 自由行动裁定；返回 null 表示整条链路不可用 */
export async function narrate(
  nodeId: string,
  action: string,
  vars: Vars,
): Promise<NarrateResponse | null> {
  const data = await post<NarrateResponse>('/api/narrate', { nodeId, action, vars });
  if (!data?.ok || typeof data.nodeId !== 'string' || !data.narration) return null;
  return data;
}

/** 结局摘要：服务端失败时用本地模板保底，保证结局页永远有内容 */
export async function requestEpilogue(
  endingKey: EndingKey,
  vars: Vars,
): Promise<{ text: string; degraded: boolean }> {
  const data = await post<EpilogueResponse>('/api/epilogue', { endingKey, vars }, 10000);
  if (data?.ok && data.text) return { text: data.text, degraded: data.degraded };
  return { text: localEpilogue(endingKey, vars), degraded: true };
}

function localEpilogue(endingKey: EndingKey, vars: Vars): string {
  const route =
    vars.route === 'hide'
      ? '把修复好的记忆收了起来，决定独自追查'
      : vars.route === 'tell'
        ? '把屏幕转向了委托人，选择一起面对'
        : '没有走到需要选择的那一步';

  const tail =
    endingKey === 'yongye'
      ? '你删掉了自己，把这一夜还给了空白。'
      : endingKey === 'huisheng'
        ? '你把真相寄了出去，然后一个人站在原地等回音。'
        : '你把不属于你的东西还了回去，月台上终于有人等到了答案。';

  return `档案编号 7F3A 结案摘要：你在修复一段记忆的过程中${route}；共调取记忆碎片 ${vars.integrity} 片。${tail}`;
}
