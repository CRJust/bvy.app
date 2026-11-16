import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_BASE64_CHARS = 5_500_000;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

type NormalizedScanItem = {
  rawLine: string;
  name: string;
  quantity: number;
  unit: string | null;
  brandHint: string | null;
  packageSizeHint: string | null;
  confidence: number;
};

type ScanResultPayload = {
  ok: boolean;
  provider?:
    | "gemini-2.5-flash-lite"
    | "groq-llama4-scout"
    | "openrouter-free-vision"
    | "ocr-space"
    | "text-parser";
  unreadable?: boolean;
  unreadableReason?: string | null;
  rawText?: string;
  items?: NormalizedScanItem[];
  code?: string;
  error?: string;
};

const UNIT_ALIAS_MAP: Record<string, string> = {
  buc: "buc",
  bucata: "buc",
  bucati: "buc",
  pachet: "pachet",
  pachete: "pachet",
  cutie: "cutie",
  cutii: "cutie",
  sticla: "sticlă",
  sticle: "sticlă",
  borcan: "borcan",
  borcane: "borcan",
  conserva: "conservă",
  conserve: "conservă",
  legatura: "legătură",
  legaturi: "legătură",
  cofraj: "cofraj",
  cofraje: "cofraj",
  carton: "carton",
  cartoane: "carton",
  plasa: "plasă",
  plase: "plasă",
  rola: "rolă",
  role: "rolă",
  sul: "sul",
  suluri: "sul",
  kg: "kg",
  g: "g",
  gr: "g",
  l: "l",
  litru: "l",
  litri: "l",
  ml: "ml",
  cl: "cl",
};

function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function capitalizeFirst(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function isNoiseLine(raw: string): boolean {
  const norm = stripDiacritics(raw).replace(/[^a-z0-9\s.,:/-]/g, "").trim();
  if (norm.length < 2) return true;
  if (/^\d+([.,:/-]\d+)*$/.test(norm)) return true;
  if (/^\d+([.,]\d+)?\s*(lei|ron|eur)$/i.test(norm)) return true;
  const ignoredHeaders = new Set([
    "lista",
    "lista de cumparaturi",
    "lista cumparaturi",
    "cumparaturi",
    "shopping list",
    "total",
    "subtotal",
    "bon fiscal",
    "data",
  ]);
  return ignoredHeaders.has(norm);
}

function extractPackageSizeHint(text: string): {
  packageSizeHint: string | null;
  cleanedText: string;
} {
  const pkgMatch = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*(kg|gr|g|litri|litru|l|ml|cl)\b/i
  );
  if (!pkgMatch) {
    return { packageSizeHint: null, cleanedText: text };
  }
  const num = pkgMatch[1].replace(",", ".");
  const rawUnit = stripDiacritics(pkgMatch[2]);
  const unit = rawUnit === "litri" || rawUnit === "litru"
    ? "l"
    : rawUnit === "gr"
    ? "g"
    : rawUnit;
  const packageSizeHint = `${num} ${unit}`;
  const cleanedText = text
    .replace(pkgMatch[0], " ")
    .replace(/\s+/g, " ")
    .trim();
  return { packageSizeHint, cleanedText };
}

function parseSingleLine(rawLine: string): NormalizedScanItem | null {
  let line = rawLine
    .trim()
    .replace(/^[-•*▪◦✓✔☐☑\[\]\s]+/, "")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*k\.?(?=\s|$)/gi, "$1 kg")
    .replace(/\s+/g, " ")
    .trim();

  if (!line || isNoiseLine(line)) return null;

  let quantity = 1;
  let unit: string | null = null;
  let working = line;

  // 1. "2x lapte", "2 x 500g paste"
  const leadingMult = working.match(/^(\d{1,2})\s*[x×*]\s*(.+)$/i);
  if (leadingMult) {
    quantity = Math.min(Math.max(parseInt(leadingMult[1], 10) || 1, 1), 99);
    unit = "buc";
    working = leadingMult[2].trim();
  } else {
    // 2. "lapte x2", "lapte x 3"
    const trailingMult = working.match(/^(.+?)\s*[x×*]\s*(\d{1,2})$/i);
    if (trailingMult) {
      quantity = Math.min(Math.max(parseInt(trailingMult[2], 10) || 1, 1), 99);
      unit = "buc";
      working = trailingMult[1].trim();
    } else {
      // 3. "2 pachete unt", "3 buc. rosii", "2 sticle apa 2l"
      const containerMatch = working.match(
        /^(\d{1,2})\s+(buc|bucati|bucăți|pachet|pachete|cutie|cutii|sticla|sticlă|sticle|borcan|borcane|conserva|conservă|conserve|legatura|legătură|legaturi|legături|cofraj|cofraje|carton|cartoane|plasa|plasă|plase|rola|rolă|role|sul|suluri)\.?\s+(?:de\s+)?(.+)$/i
      );
      if (containerMatch) {
        quantity = Math.min(
          Math.max(parseInt(containerMatch[1], 10) || 1, 1),
          99
        );
        const uKey = stripDiacritics(containerMatch[2]);
        unit = UNIT_ALIAS_MAP[uKey] ?? "buc";
        working = containerMatch[3].trim();
      } else {
        // 4. "3 oua", "2 paini" (doar dacă numărul nu e urmat de unitate de gramaj/volum)
        const plainCount = working.match(
          /^(\d{1,2})\s+(?!(?:kg|gr|g|l|litri|litru|ml|cl|%)\b)(.+)$/i
        );
        if (plainCount) {
          quantity = Math.min(
            Math.max(parseInt(plainCount[1], 10) || 1, 1),
            99
          );
          unit = "buc";
          working = plainCount[2].trim();
        }
      }
    }
  }

  // Extragem gramajul/volumul doar dacă apare literal (fără a inventa nimic)
  const { packageSizeHint } = extractPackageSizeHint(working);

  // Eliminăm prețurile de la final dacă provin dintr-o captură/listă cu prețuri
  working = working
    .replace(/\s[-–—]\s*\d+(?:[.,]\d+)?\s*(?:lei|ron)\b.*$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:lei|ron)\s*$/i, "")
    .trim();

  if (!working || isNoiseLine(working)) return null;

  return {
    rawLine: rawLine.trim(),
    name: capitalizeFirst(working),
    quantity,
    unit,
    brandHint: null,
    packageSizeHint,
    confidence: 0.72,
  };
}

function parseRawTextToItems(rawText: string): NormalizedScanItem[] {
  const chunks = rawText
    .split(/\r?\n|;+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: NormalizedScanItem[] = [];
  for (const chunk of chunks) {
    const parsed = parseSingleLine(chunk);
    if (parsed) items.push(parsed);
  }
  return items;
}

function sanitizeGeminiItems(rawItems: unknown): NormalizedScanItem[] {
  if (!Array.isArray(rawItems)) return [];
  const out: NormalizedScanItem[] = [];

  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const rawLine =
      typeof obj.rawLine === "string" && obj.rawLine.trim()
        ? obj.rawLine.trim()
        : name;
    if (!name || isNoiseLine(name)) continue;

    const rawQty = Number(obj.quantity);
    const quantity =
      Number.isFinite(rawQty) && rawQty >= 1
        ? Math.min(Math.round(rawQty), 99)
        : 1;

    const unit =
      typeof obj.unit === "string" && obj.unit.trim()
        ? obj.unit.trim().slice(0, 20)
        : null;
    const brandHint =
      typeof obj.brandHint === "string" && obj.brandHint.trim()
        ? obj.brandHint.trim().slice(0, 60)
        : null;
    const packageSizeHint =
      typeof obj.packageSizeHint === "string" && obj.packageSizeHint.trim()
        ? obj.packageSizeHint.trim().slice(0, 40)
        : null;

    const rawConf = Number(obj.confidence);
    const confidence = Number.isFinite(rawConf)
      ? Math.max(0, Math.min(1, Math.round(rawConf * 100) / 100))
      : 0.75;

    out.push({
      rawLine,
      name: capitalizeFirst(name),
      quantity,
      unit,
      brandHint,
      packageSizeHint,
      confidence,
    });
  }

  return out;
}

const VISION_PROMPT = [
  "Analizează fotografia și extrage exclusiv produsele de cumpărături vizibile (scrise de mână, imprimate sau captură de ecran).",
  "Reguli stricte:",
  "1. NU inventa branduri, gramaje, coduri EAN sau produse care nu apar clar în imagine.",
  "2. Dacă un produs este tăiat cu o linie, ignoră-l. Ignoră titlurile (ex: 'Lista de cumpărături'), datele calendaristice, numele de magazine și prețurile/totalurile.",
  "3. Păstrează cantitatea ca număr întreg >= 1 (ex: '2 x lapte 1l' -> quantity: 2, packageSizeHint: '1 l'; 'apa 2l' -> quantity: 1, packageSizeHint: '2 l'; '500g unt' -> quantity: 1, packageSizeHint: '500 g').",
  "4. Setează brandHint și packageSizeHint DOAR dacă apar explicit în textul fotografiat; altfel folosește null.",
  "5. Dacă imaginea este neclară, întunecată, ilizibilă sau nu conține produse recognoscibile, setează unreadable=true, explică scurt în română în unreadableReason și întoarce items=[].",
  'Răspunde strict cu JSON valid de forma: {"unreadable":boolean,"unreadableReason":string|null,"items":[{"rawLine":string,"name":string,"quantity":number,"unit":string|null,"brandHint":string|null,"packageSizeHint":string|null,"confidence":number}]}',
].join("\n");

function parseVisionJsonResponse(
  textResponse: string,
  provider: NonNullable<ScanResultPayload["provider"]>
): ScanResultPayload {
  if (!textResponse) {
    return {
      ok: true,
      provider,
      unreadable: true,
      unreadableReason:
        "Nu am putut extrage text lizibil din această fotografie.",
      items: [],
    };
  }

  let parsedJson: Record<string, unknown> | null = null;
  try {
    parsedJson = JSON.parse(textResponse);
  } catch {
    try {
      const stripped = textResponse
        .replace(/^```json\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      parsedJson = JSON.parse(stripped);
    } catch {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedJson = JSON.parse(jsonMatch[0]);
        } catch {
          parsedJson = null;
        }
      }
    }
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    return {
      ok: true,
      provider,
      unreadable: true,
      unreadableReason:
        "Nu am putut interpreta structura listei din fotografie. Încearcă o poză mai clară.",
      items: [],
    };
  }

  const items = sanitizeGeminiItems(parsedJson.items);
  const unreadable = parsedJson.unreadable === true || items.length === 0;
  const unreadableReason =
    typeof parsedJson.unreadableReason === "string" &&
    parsedJson.unreadableReason.trim()
      ? parsedJson.unreadableReason.trim()
      : unreadable
      ? "Nu am identificat produse alimentare lizibile în fotografie."
      : null;

  return {
    ok: true,
    provider,
    unreadable,
    unreadableReason,
    items,
  };
}

async function extractWithGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string
): Promise<ScanResultPayload> {
  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: VISION_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });

  const endpoints = [
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
  ];
  if (apiKey.startsWith("AQ.")) {
    endpoints.push(
      "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent"
    );
  }

  let resp: Response | null = null;
  let lastStatus = 0;
  let lastErrText = "";

  for (let i = 0; i < endpoints.length; i++) {
    const candidateResp = await fetch(endpoints[i], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: requestBody,
    });

    if (candidateResp.ok) {
      resp = candidateResp;
      break;
    }

    lastStatus = candidateResp.status;
    lastErrText = await candidateResp.text().catch(() => "");

    const canTryFallback =
      i + 1 < endpoints.length &&
      (lastStatus === 400 ||
        lastStatus === 401 ||
        lastStatus === 403 ||
        lastStatus === 404);
    if (!canTryFallback) {
      break;
    }
  }

  if (!resp) {
    return {
      ok: false,
      code: lastStatus === 429 ? "RATE_LIMITED" : "OCR_PROVIDER_ERROR",
      error:
        lastStatus === 429
          ? "Limita temporară OCR a fost atinsă. Încearcă din nou în câteva secunde."
          : `Serviciul Vision a întors o eroare (${lastStatus}). ${lastErrText.slice(0, 160)}`,
    };
  }

  const data = await resp.json();
  const textResponse =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  return parseVisionJsonResponse(textResponse, "gemini-2.5-flash-lite");
}

async function extractWithOpenAiCompatibleVision(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: "groq-llama4-scout" | "openrouter-free-vision";
  imageBase64: string;
  mimeType: string;
}): Promise<ScanResultPayload> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22_000);
  let resp: Response;
  try {
    resp = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${params.mimeType};base64,${params.imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        code: "OCR_TIMEOUT",
        error: "Serviciul Vision nu a răspuns la timp. Încearcă din nou.",
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(
      `[scan-shopping-list] provider=${params.provider} status=${resp.status} err=${errText.slice(0, 200)}`
    );
    const providerLabel =
      params.provider === "groq-llama4-scout"
        ? "Groq (GROQ_API_KEY)"
        : "OpenRouter (OPENROUTER_API_KEY)";
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        code: "OCR_AUTH_ERROR",
        error: `Cheia ${providerLabel} din Supabase Secrets este invalidă sau inactivă (${resp.status}).`,
      };
    }
    if (resp.status === 429) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        error:
          "Limita temporară Vision a fost atinsă. Încearcă din nou în câteva secunde.",
      };
    }
    return {
      ok: false,
      code: "OCR_PROVIDER_ERROR",
      error: `Serviciul Vision (${providerLabel}) a întors o eroare (${resp.status}). ${errText.slice(0, 140)}`,
    };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const textResponse =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((p: { text?: string }) => p?.text ?? "")
            .join("")
        : "";

  return parseVisionJsonResponse(textResponse, params.provider);
}

async function extractWithOcrSpace(
  apiKey: string,
  imageBase64: string,
  mimeType: string
): Promise<ScanResultPayload> {
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("base64Image", `data:${mimeType};base64,${imageBase64}`);
  form.append("OCREngine", "2");
  form.append("language", "auto");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("isTable", "false");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22_000);
  let resp: Response;
  try {
    resp = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: apiKey,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        code: "OCR_TIMEOUT",
        error: "Serviciul OCR.space nu a răspuns la timp. Încearcă din nou.",
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    console.error(`[scan-shopping-list] provider=ocr-space status=${resp.status}`);
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        code: "OCR_AUTH_ERROR",
        error:
          "Cheia OCR_SPACE_API_KEY din Supabase Secrets este invalidă sau inactivă.",
      };
    }
    if (resp.status === 429) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        error:
          "Limita temporară OCR.space a fost atinsă. Încearcă din nou în câteva secunde.",
      };
    }
    return {
      ok: false,
      code: "OCR_PROVIDER_ERROR",
      error: `Serviciul OCR.space a întors o eroare (${resp.status}).`,
    };
  }

  const payload = await resp.json();
  const exitCode = Number(payload?.OCRExitCode ?? 0);
  if (payload?.IsErroredOnProcessing || exitCode >= 3) {
    const rawMsg = Array.isArray(payload?.ErrorMessage)
      ? String(payload.ErrorMessage[0])
      : typeof payload?.ErrorMessage === "string"
        ? payload.ErrorMessage
        : "";
    return {
      ok: false,
      code: "OCR_PROVIDER_ERROR",
      error: rawMsg || "Eroare la procesarea imaginii OCR.",
    };
  }

  const parsedText = String(
    payload?.ParsedResults?.[0]?.ParsedText ?? ""
  ).trim();

  if (!parsedText) {
    return {
      ok: true,
      provider: "ocr-space",
      unreadable: true,
      unreadableReason:
        "Nu am detectat text lizibil în fotografie. Încearcă o poză mai clară.",
      rawText: "",
      items: [],
    };
  }

  const items = parseRawTextToItems(parsedText);
  return {
    ok: true,
    provider: "ocr-space",
    unreadable: items.length === 0,
    unreadableReason:
      items.length === 0
        ? "Textul detectat nu conține produse recunoscibile pe listă."
        : null,
    rawText: parsedText,
    items,
  };
}

function resolveProviderSecrets(): {
  geminiKey: string | null;
  groqKey: string | null;
  openRouterKey: string | null;
  ocrSpaceKey: string | null;
  customSecretNames: string[];
} {
  const env = Deno.env.toObject();
  const entries = Object.entries(env);

  const normalizeEnvName = (name: string): string =>
    name
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();

  const sanitizeSecret = (raw: string | undefined): string =>
    (raw ?? "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

  const findEnv = (candidates: string[]): string | null => {
    for (const target of candidates) {
      const exact = sanitizeSecret(env[target]);
      if (exact) return exact;
      const normTarget = normalizeEnvName(target);
      const hit = entries.find(
        ([k, v]) => normalizeEnvName(k) === normTarget && sanitizeSecret(v)
      );
      if (hit) return sanitizeSecret(hit[1]);
    }
    return null;
  };

  let geminiKey = findEnv([
    "GEMINI_API_KEY",
    "GOOGLE_GEMINI_API_KEY",
    "GOOGLE_API_KEY",
  ]);
  let groqKey = findEnv(["GROQ_API_KEY", "GROQ_KEY", "GROQ"]);
  let openRouterKey = findEnv(["OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPENROUTER"]);
  let ocrSpaceKey = findEnv([
    "OCR_SPACE_API_KEY",
    "OCR_SPACE_KEY",
    "OCR_API_KEY",
    "OCRSPACE_API_KEY",
    "OCR_SPACE",
    "OCR_KEY",
    "OCR",
  ]);

  if (ocrSpaceKey) {
    if (!geminiKey && ocrSpaceKey.startsWith("AIza")) {
      geminiKey = ocrSpaceKey;
      ocrSpaceKey = null;
    } else if (!groqKey && ocrSpaceKey.startsWith("gsk_")) {
      groqKey = ocrSpaceKey;
      ocrSpaceKey = null;
    } else if (!openRouterKey && ocrSpaceKey.startsWith("sk-or-")) {
      openRouterKey = ocrSpaceKey;
      ocrSpaceKey = null;
    }
  }

  const customSecretNames = entries
    .map(([k]) => k)
    .filter(
      (k) =>
        !k.startsWith("SUPABASE_") &&
        !k.startsWith("DENO_") &&
        !k.startsWith("SB_") &&
        !["PATH", "HOME", "USER", "HOSTNAME", "PORT"].includes(k)
    );

  return { geminiKey, groqKey, openRouterKey, ocrSpaceKey, customSecretNames };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Folosește metoda POST." }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      imageBase64?: unknown;
      mimeType?: unknown;
      rawText?: unknown;
    };

    if (typeof body.rawText === "string" && body.rawText.trim().length > 0) {
      const items = parseRawTextToItems(body.rawText);
      const result: ScanResultPayload = {
        ok: true,
        provider: "text-parser",
        unreadable: items.length === 0,
        unreadableReason:
          items.length === 0
            ? "Nu am detectat produse valide în textul introdus."
            : null,
        rawText: body.rawText,
        items,
      };
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    const imageBase64 =
      typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!imageBase64) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "INVALID_PAYLOAD",
          error: "Lipsește fotografia pentru analiză.",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (imageBase64.length > MAX_BASE64_CHARS) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "IMAGE_TOO_LARGE",
          error: "Imaginea este prea mare (maxim ~4 MB după comprimare).",
        }),
        { status: 413, headers: corsHeaders }
      );
    }

    const rawMime =
      typeof body.mimeType === "string"
        ? body.mimeType.toLowerCase().trim()
        : "image/jpeg";
    const mimeType = ALLOWED_MIME_TYPES.has(rawMime) ? rawMime : "image/jpeg";

    const {
      geminiKey,
      groqKey,
      openRouterKey,
      ocrSpaceKey,
      customSecretNames,
    } = resolveProviderSecrets();
    if (geminiKey) {
      const result = await extractWithGemini(geminiKey, imageBase64, mimeType);
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    if (groqKey) {
      const result = await extractWithOpenAiCompatibleVision({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: groqKey,
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        provider: "groq-llama4-scout",
        imageBase64,
        mimeType,
      });
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    if (openRouterKey) {
      const result = await extractWithOpenAiCompatibleVision({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: openRouterKey,
        model: "openrouter/free",
        provider: "openrouter-free-vision",
        imageBase64,
        mimeType,
      });
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    if (ocrSpaceKey) {
      const result = await extractWithOcrSpace(
        ocrSpaceKey,
        imageBase64,
        mimeType
      );
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    console.log(
      "OCR provider key not found. Custom secret names present:",
      JSON.stringify(customSecretNames)
    );

    return new Response(
      JSON.stringify({
        ok: false,
        code: "OCR_PROVIDER_NOT_CONFIGURED",
        error:
          "Serviciul Vision/OCR de pe server nu are configurată cheia GEMINI_API_KEY sau OCR_SPACE_API_KEY în Supabase Secrets.",
      } satisfies ScanResultPayload),
      { headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "INTERNAL_ERROR",
        error:
          err instanceof Error ? err.message : "Eroare necunoscută la scanare.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
