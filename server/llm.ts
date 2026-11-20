/**
 * 模型调用层。
 *
 * 支持的接法（按优先级）：
 *   1. 任何 OpenAI 兼容端点：设 LLM_API_KEY（可选 LLM_BASE_URL / LLM_MODEL）
 *   2. 本地 Ollama：装好后自动探测 127.0.0.1:11434，无需 Key
 *   3. 都没有：返回 enabled=false，上层走预写文案库
 *
 * 这一层不做兜底，失败就抛错，由 api.ts 决定降级。
 */

export type ProviderKind = 'openai' | 'ollama' | 'none';

export interface LlmConfig {
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  /** 配置来源，给 /api/health 展示用 */
  source: 'env' | 'ollama-local' | 'disabled';
}

interface OllamaState {
  available: boolean;
  models: string[];
  checkedAt: number;
}

const ollamaState: OllamaState = { available: false, models: [], checkedAt: 0 };

const OLLAMA_HOST = 'http://127.0.0.1:11434';

/** 探测本地 Ollama（启动时调一次，失败也不影响服务） */
export async function probeOllama(): Promise<OllamaState> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n));
    Object.assign(ollamaState, { available: models.length > 0, models, checkedAt: Date.now() });
  } catch {
    Object.assign(ollamaState, { available: false, models: [], checkedAt: Date.now() });
  }
  return ollamaState;
}

export function getOllamaState(): OllamaState {
  return ollamaState;
}

export function readConfig(): LlmConfig {
  const envKey = (process.env.LLM_API_KEY ?? '').trim();
  const envBase = (process.env.LLM_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const envModel = (process.env.LLM_MODEL ?? '').trim();
  const provider = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase();

  // 1) 显式配了 Key：走任意 OpenAI 兼容端点
  if (envKey) {
    return {
      kind: 'openai',
      baseUrl: envBase || 'https://api.openai.com/v1',
      apiKey: envKey,
      model: envModel || 'gpt-4o-mini',
      enabled: true,
      source: 'env',
    };
  }

  // 2) 本地 Ollama：显式指定，或地址里带 11434，或探测到了
  const wantOllama =
    provider === 'ollama' || envBase.includes('11434') || ollamaState.available;

  if (wantOllama) {
    return {
      kind: 'ollama',
      baseUrl: envBase || `${OLLAMA_HOST}/v1`,
      apiKey: '',
      model: envModel || ollamaState.models[0] || 'qwen2.5:7b',
      enabled: true,
      source: 'ollama-local',
    };
  }

  // 3) 都没有
  return { kind: 'none', baseUrl: '', apiKey: '', model: '', enabled: false, source: 'disabled' };
}

export interface ChatOptions {
  system: string;
  user: string;
  timeoutMs?: number;
  temperature?: number;
}

export async function chat(cfg: LlmConfig, opts: ChatOptions): Promise<string> {
  if (!cfg.enabled) throw new Error('LLM_DISABLED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Ollama 不需要鉴权头，带上反而可能被某些代理拒绝
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        temperature: opts.temperature ?? 0.7,
        max_tokens: 320,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM_HTTP_${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM_EMPTY_RESPONSE');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从模型输出里抠出 JSON。
 * 模型偶尔会裹 ```json 代码块或加解释文字，这里做容错解析。
 */
export function extractJson<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
