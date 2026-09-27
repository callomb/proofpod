import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export interface DataPlateExtraction {
  model: string | null;
  serial: string | null;
  raw: string;
}

const EMPTY: DataPlateExtraction = { model: null, serial: null, raw: "" };

/**
 * Suggests a model/serial number from a data-plate photo. Never authoritative
 * on its own — the caller must still have the engineer confirm or correct the
 * result before it's saved as the unit's model/serial number.
 */
type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp";

export async function extractDataPlate(
  imageBase64: string,
  mediaType: SupportedMediaType,
): Promise<DataPlateExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return EMPTY;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text:
                "This is a photo of an air conditioning unit's data plate / nameplate. " +
                "Read the MODEL NUMBER and SERIAL NUMBER printed on it. Reply with strict JSON " +
                'only, no other text: {"model": string or null, "serial": string or null}. ' +
                "If a value isn't clearly legible, use null for it rather than guessing.",
            },
          ],
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...EMPTY, raw: text };
    const parsed = JSON.parse(jsonMatch[0]) as { model?: string | null; serial?: string | null };
    return {
      model: parsed.model ? String(parsed.model).trim() : null,
      serial: parsed.serial ? String(parsed.serial).trim() : null,
      raw: text,
    };
  } catch (err) {
    return { ...EMPTY, raw: err instanceof Error ? err.message : "extraction failed" };
  }
}
