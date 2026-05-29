import type { PersistedSettings } from './storage';

export type AiRequest = {
  prompt: string;
  metadata: Record<string, unknown>;
};

export async function runAiRequest(request: AiRequest, settings: PersistedSettings): Promise<string | undefined> {
  if (!settings.aiEnabled || !settings.aiBaseUrl.trim() || !settings.aiModel.trim() || !settings.aiApiKey.trim()) {
    return undefined;
  }

  const response = await fetch(settings.aiBaseUrl.trim(), {
    method: 'POST',
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
      metadata: request.metadata,
    }),
  });
  if (!response.ok) {
    throw new Error(`AI 请求失败：${response.status}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; content?: string };
  return payload.choices?.[0]?.message?.content || payload.content;
}
