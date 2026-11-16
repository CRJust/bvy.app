import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];
const CLAUDE_HAIKU_MODEL = "claude-3-5-haiku-20241022";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type RequestPayload = {
  action?: "parse_recipe" | "compose_cart" | "chat" | "credits_status" | "list_models";
  recipeText?: string;
  servings?: number;
  prompt?: string;
  systemPrompt?: string;
  userPrompt?: string;
  userContext?: string;
  maxTokens?: number;
  modelOverride?: string;
  debug?: boolean;
};

function sanitizeSecret(val: string | undefined): string {
  return (val ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

function resolveAiKeys(): { geminiKey: string | null; anthropicKey: string | null } {
  const env = Deno.env.toObject();

  let geminiKey: string | null = null;
  let anthropicKey: string | null = null;

  const geminiCandidates = [
    "GEMINI_API_KEY",
    "GOOGLE_GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_AI_API_KEY",
  ];
  for (const name of geminiCandidates) {
    const val = sanitizeSecret(env[name]);
    if (val && (val.startsWith("AIza") || val.length > 20)) {
      geminiKey = val;
      break;
    }
  }

  const anthropicCandidates = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "HAIKU_API_KEY",
    "ANTHROPIC_KEY",
  ];
  for (const name of anthropicCandidates) {
    const val = sanitizeSecret(env[name]);
    if (val && (val.startsWith("sk-ant-") || val.length > 20)) {
      anthropicKey = val;
      break;
    }
  }

  // Scan generic keys
  for (const [_k, v] of Object.entries(env)) {
    const clean = sanitizeSecret(v);
    if (!geminiKey && (clean.startsWith("AIza") || clean.startsWith("AQ."))) {
      geminiKey = clean;
    }
    if (!anthropicKey && clean.startsWith("sk-ant-")) {
      anthropicKey = clean;
    }
  }

  return { geminiKey, anthropicKey };
}

async function callGoogleGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
  preferredModel?: string
): Promise<{ text?: string; model?: string; debugError?: string } | null> {
  const errors: string[] = [];
  const modelList = preferredModel
    ? [preferredModel, ...GEMINI_MODELS.filter((m) => m !== preferredModel)]
    : GEMINI_MODELS;

  for (const model of modelList) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8500);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) {
          return { text, model };
        }
      } else {
        const errTxt = await resp.text().catch(() => "");
        errors.push(`${model}: HTTP ${resp.status} - ${errTxt.slice(0, 200)}`);
      }
    } catch (err: unknown) {
      errors.push(`${model}: ${String(err)}`);
    }
  }
  return { debugError: errors.join(" | ") };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as RequestPayload;
    const action = payload.action ?? "chat";

    if (action === "list_models") {
      const { geminiKey } = resolveAiKeys();
      if (!geminiKey) {
        return new Response(JSON.stringify({ ok: false, error: "no_key" }), { headers: corsHeaders });
      }
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      const listData = await listResp.json();
      return new Response(JSON.stringify(listData), { headers: corsHeaders });
    }

    if (action === "credits_status") {
      const { geminiKey, anthropicKey } = resolveAiKeys();
      const activeProvider = geminiKey
        ? GEMINI_MODELS[0]
        : anthropicKey
        ? CLAUDE_HAIKU_MODEL
        : "beavy-local-intelligent-engine";

      return new Response(
        JSON.stringify({
          ok: true,
          status: "active",
          model: activeProvider,
          isFreeTier: Boolean(geminiKey),
          serverProxy: true,
        }),
        { headers: corsHeaders }
      );
    }

    const { geminiKey, anthropicKey } = resolveAiKeys();

    let systemPrompt = payload.systemPrompt || "Ești Asistentul culinar Beavy.";
    let userPrompt =
      payload.userPrompt || payload.prompt || payload.recipeText || "";

    if (action === "parse_recipe" && payload.recipeText) {
      systemPrompt = `Ești expertul culinar și nutriționistul aplicației Beavy (România). Rolul tău este să analizezi textul rețetei și să extragi o listă curată de ingrediente gata de cumpărat din supermarketurile din România (Kaufland, Lidl, Penny, Carrefour, Auchan, Mega Image, Sezamo, Freshful).

Reguli stricte de gramaje:
- Porționează realist: pentru somon/pește folosește 200g-250g per porție (caserolă standard 250g, NICIODATĂ 1kg pentru o singură masă).
- Răspunde EXCLUSIV cu un obiect JSON valid, fără explicații adiționale sau text introductiv.
2. Structură JSON cerută:
{
  "recipeTitle": "Titlul rețetei",
  "servings": ${payload.servings || 4},
  "prepTimeMinutes": 30,
  "ingredients": [
    {
      "name": "Nume ingredient curat (ex: Ouă proaspete, Piept de pui dezosat, Făină albă 000)",
      "quantity": 4,
      "unit": "buc",
      "packageSizeHint": "10 buc",
      "brandHint": null,
      "isPantryStaple": false,
      "stapleReason": null,
      "categoryHint": "Lactate, Brânzeturi & Ouă",
      "substitutions": ["Alternativă 1", "Alternativă 2"]
    }
  ],
  "missingSuggestions": ["Ingredient secret sau mirodenie recomandată"],
  "dietaryBadges": ["Bogată în proteine"],
  "chefTip": "Un sfat scurt util de preparare"
}`;
      userPrompt = `Rețetă:
${payload.recipeText}

Porții dorite: ${payload.servings || 4}
${payload.userContext ? `Context utilizator: ${payload.userContext}` : ""}`;
    }

    // 1. Prioritate: Google Gemini (gratuit, sustenabil, ultra-rapid)
    if (geminiKey) {
      const geminiResult = await callGoogleGemini(
        geminiKey,
        systemPrompt,
        userPrompt,
        payload.maxTokens ?? 2048,
        payload.modelOverride
      );

      if (geminiResult && geminiResult.text) {
        return new Response(
          JSON.stringify({
            ok: true,
            provider: geminiResult.model,
            rawText: geminiResult.text,
          }),
          { headers: corsHeaders }
        );
      } else if (payload.debug) {
        return new Response(
          JSON.stringify({
            ok: false,
            geminiDebug: geminiResult,
          }),
          { headers: corsHeaders }
        );
      }
    }

    // 2. Opțional: Anthropic Claude (dacă există cheie setată)
    if (anthropicKey) {
      const anthropicRes = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_HAIKU_MODEL,
          max_tokens: payload.maxTokens ?? 1600,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (anthropicRes.ok) {
        const data = await anthropicRes.json();
        const text =
          data.content?.find((c: { type: string; text?: string }) => c.type === "text")
            ?.text || "";

        return new Response(
          JSON.stringify({
            ok: true,
            provider: CLAUDE_HAIKU_MODEL,
            rawText: text,
          }),
          { headers: corsHeaders }
        );
      }
    }

    // 3. Fallback inteligent integrat
    return new Response(
      JSON.stringify({
        ok: true,
        provider: "beavy-local-intelligent-engine",
        message: "Asistentul Beavy utilizează motorul determinist integrat.",
      }),
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
