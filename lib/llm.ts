import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

export function llmProvider(): "anthropic" | "gemini" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

/**
 * One text completion from whichever provider has a key (Anthropic first, then Gemini).
 * Returns null when no key is set; throws on a provider error so callers can fall back.
 */
export async function complete(system: string, user: string, maxTokens = 300): Promise<string | null> {
  const provider = llmProvider();
  if (provider === "anthropic") {
    const msg = await getAnthropic()!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  }
  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0, // same input, same answer: cards should not change between views
          responseMimeType: "application/json",
          // Short structured answers: no hidden "thinking" tokens eating the output budget.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j: any = await r.json();
    return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  }
  return null;
}
