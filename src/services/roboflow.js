import fetch from "node-fetch";

export const CORN_CLASSES = {
  healthy: {
    label: "Health",
    aliases: [
      "health",
      "healthy",
      "sehat",
    ],
  },

  gray_leaf_spot: {
    label: "Gray Leaf Spot",
    aliases: [
      "gray leaf",
      "gray leaf spot",
      "gray_leaf",
      "gray_leaf_spot",
      "grayleafspot",
    ],
  },

  common_rust: {
    label: "Common Rust",
    aliases: [
      "common rust",
      "common_rust",
      "commonrust",
      "rust",
    ],
  },

  blight: {
    label: "Blight",
    aliases: [
      "blight",
      "northern leaf blight",
      "northern_leaf_blight",
      "bright",
    ],
  },
};

function normalizeLabel(rawLabel) {
  const cleaned = String(rawLabel ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, " ");

  for (const [slug, definition] of Object.entries(CORN_CLASSES)) {
    const matched = definition.aliases.some((alias) => {
      const normalizedAlias = alias
        .toLowerCase()
        .replace(/-/g, "_")
        .replace(/\s+/g, " ");

      return normalizedAlias === cleaned;
    });

    if (matched) {
      return slug;
    }
  }

  return null;
}

export async function classifyImage(imageBuffer, mimetype) {
  const useMock =
    String(process.env.USE_MOCK_INFERENCE || "false").toLowerCase() ===
    "true";

  if (useMock) {
    console.log("[inference] Using mock inference");
    return mockClassify();
  }

  if (!Buffer.isBuffer(imageBuffer)) {
    throw new Error("Invalid image data. Expected a Buffer.");
  }

  const apiKey = process.env.ROBOFLOW_API_KEY;
  const modelId = process.env.ROBOFLOW_MODEL_ID;
  const apiUrl =
    process.env.ROBOFLOW_API_URL || "https://classify.roboflow.com";

  if (!apiKey) {
    throw new Error("ROBOFLOW_API_KEY is not configured.");
  }

  if (!modelId) {
    throw new Error(
      "ROBOFLOW_MODEL_ID is not configured. Example: corn-leaf-disease/3"
    );
  }

  if (!mimetype) {
    throw new Error("Image MIME type is missing.");
  }

  const base64Image = imageBuffer.toString("base64");

  const endpoint =
    `${apiUrl.replace(/\/$/, "")}/` +
    `${modelId}?api_key=${encodeURIComponent(apiKey)}`;

  console.log("[inference] Sending image to Roboflow...");
  console.log(
    "[inference] Endpoint:",
    endpoint.replace(apiKey, "***")
  );

  const controller = new AbortController();

  const timeoutMs = Number(
    process.env.ROBOFLOW_TIMEOUT_MS || 15000
  );

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      body: base64Image,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Roboflow inference request timed out after ${timeoutMs}ms`
      );
    }

    throw new Error(
      `Could not reach Roboflow inference API: ${
        error?.message || error
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Roboflow inference API returned ${response.status}: ${responseText}`
    );
  }

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Roboflow returned invalid JSON: ${responseText}`
    );
  }

  console.log("=== ROBOFLOW RESPONSE ===");
  console.log(JSON.stringify(data, null, 2));

  return normalizeRoboflowResponse(data);
}

function normalizeRoboflowResponse(data) {
  const predictions = data?.predictions;

  if (
    !predictions ||
    typeof predictions !== "object" ||
    Array.isArray(predictions)
  ) {
    throw new Error(
      "Unexpected response shape from Roboflow inference API. Expected predictions object."
    );
  }

  const scores = {
    healthy: 0,
    gray_leaf_spot: 0,
    common_rust: 0,
    blight: 0,
  };

  const unmapped = [];

  for (const [className, prediction] of Object.entries(predictions)) {
    const slug = normalizeLabel(className);

    if (!slug) {
      unmapped.push(className);
      continue;
    }

    let confidence = Number(prediction?.confidence);

    if (!Number.isFinite(confidence)) {
      confidence = 0;
    }

    if (confidence > 1) {
      confidence /= 100;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    scores[slug] = confidence;
  }

  let predictedSlug = null;

  const predictedClasses = Array.isArray(data?.predicted_classes)
    ? data.predicted_classes
    : [];

  if (predictedClasses.length > 0) {
    predictedSlug = normalizeLabel(predictedClasses[0]);
  }

  const top = pickTop(scores);

  if (!predictedSlug) {
    predictedSlug = top.slug;
  }

  const confidence = scores[predictedSlug] ?? top.score;

  return {
    source: "roboflow",

    predictedClass: predictedSlug,

    predictedLabel:
      CORN_CLASSES[predictedSlug]?.label || predictedSlug,

    confidence,

    scores: formatScores(scores),

    imageSize: data?.image || null,

    timingSeconds:
      typeof data?.time === "number"
        ? data.time
        : null,

    inferenceId:
      data?.inference_id || null,

    predictedClasses,

    unmappedLabels:
      unmapped.length > 0
        ? unmapped
        : undefined,
  };
}

function pickTop(scores) {
  let bestSlug = "healthy";
  let bestScore = -Infinity;

  for (const [slug, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }

  return {
    slug: bestSlug,
    score: bestScore,
  };
}

function formatScores(scores) {
  return Object.fromEntries(
    Object.entries(scores).map(([slug, score]) => [
      slug,
      {
        label: CORN_CLASSES[slug].label,
        score,
        percentage: Number((score * 100).toFixed(2)),
      },
    ])
  );
}

function mockClassify() {
  const slugs = Object.keys(CORN_CLASSES);

  const raw = slugs.map(() => Math.random());

  const sum = raw.reduce(
    (total, value) => total + value,
    0
  );

  const scores = {};

  slugs.forEach((slug, index) => {
    scores[slug] = raw[index] / sum;
  });

  const top = pickTop(scores);

  return {
    source: "mock",

    predictedClass: top.slug,

    predictedLabel:
      CORN_CLASSES[top.slug].label,

    confidence: top.score,

    scores: formatScores(scores),

    imageSize: null,

    timingSeconds: 0,

    inferenceId: null,

    predictedClasses: [
      CORN_CLASSES[top.slug].label,
    ],
  };
}