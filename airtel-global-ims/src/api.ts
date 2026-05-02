type ApiErrorPayload = {
  message?: string;
};

function extractTextMessage(text: string) {
  const normalized = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export async function parseApiResponse<T>(response: Response): Promise<T | null> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    if (response.ok) {
      throw new Error("The server returned an invalid response.");
    }

    return { message: extractTextMessage(rawText) || "The server returned an invalid response." } as T;
  }
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = await parseApiResponse<T>(response);
  return { response, data };
}

export function getApiMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as ApiErrorPayload).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}
