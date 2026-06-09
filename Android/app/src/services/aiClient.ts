import type { PersistedSettings } from './storage';

export type AiRequest = {
  prompt: string;
  metadata: Record<string, unknown>;
};

export async function runAiRequest(request: AiRequest, settings: PersistedSettings): Promise<string | undefined> {
  if (!settings.aiEnabled || !settings.aiBaseUrl.trim() || !settings.aiModel.trim() || !settings.aiApiKey.trim()) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.aiTimeoutMs);
  let response: Response;
  try {
    response = await fetch(settings.aiBaseUrl.trim(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: 'system', content: '你是音乐推荐助手。不要要求本地文件路径或 content URI。' },
          { role: 'user', content: request.prompt },
        ],
        temperature: settings.aiTemperature,
        max_tokens: settings.aiMaxTokens,
        includeLyricSnippets: settings.aiIncludeLyricSnippets,
        metadata: request.metadata,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI 请求超时');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; content?: string };
  return payload.choices?.[0]?.message?.content || payload.content;
}
