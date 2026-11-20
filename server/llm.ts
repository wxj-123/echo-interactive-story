/**
 * 模型调用层：OpenAI 兼容协议。
 * 所有函数在失败时抛错，由上层决定降级策略——这里不做兜底，职责单一。
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export function readConfig(): LlmConfig {
  const apiKey = (process.env.LLM_API_KEY ?? '').trim();
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = (process.env.LLM_MODEL ?? 'gpt-4o-mini').trim();
  return { baseUrl, apiKey, model, enabled: apiKey.length > 0 };
}

export interface ChatOptions {
  system: string;
  user: string;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * 调一次对话补全，返回原始文本。
 * 使用 AbortSignal 做超时——网络挂住时不能让玩家盯着骨架屏干等。
 */
export async function chat(cfg: LlmConfig, opts: ChatOptions): Promise<string> {
  if (!cfg.enabled) throw new Error('LLM_DISABLED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9000);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
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
 * 模型偶尔会裹一层 ```json 代码块或加解释文字，这里做容错解析。
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
