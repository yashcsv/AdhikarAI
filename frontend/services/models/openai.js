import { ModelAdapter } from './base_model';

export class OpenAIAdapter extends ModelAdapter {
  async streamResponse(messages, config, onToken, onError, onComplete, requestOptions = {}) {
    if (!config.apiKey) {
      onError(new Error("OpenAI API key missing."));
      return;
    }

    const payload = {
      model: config.modelName || 'gpt-4o',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    };

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `OpenAI Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') {
               onComplete({ meta: { provider: "openai", model: payload.model }});
               return;
            }
            try {
              const event = JSON.parse(dataStr);
              if (event.choices?.[0]?.delta?.content) {
                onToken(event.choices[0].delta.content);
              }
            } catch (e) {
               console.warn("Parse error on chunk");
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }
}
