import { Router } from "express";
import { upload } from "../middleware/upload.js";
import { classifyImage, CORN_CLASSES } from "../services/roboflow.js";

const router = Router();

// GET /api/scan/classes
router.get("/classes", (_req, res) => {
  res.json({
    classes: Object.entries(CORN_CLASSES).map(([slug, def]) => ({
      slug,
      label: def.label,
    })),
  });
});

// POST /api/scan
// multipart/form-data { image: <file> }
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error:
        "No image uploaded. Send it as multipart/form-data field 'image'.",
    });
  }

  try {
    const result = await classifyImage(
      req.file.buffer,
      req.file.mimetype
    );

    return res.json({
      ok: true,
      ...result,
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[scan] inference failed:", err);

    return res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "Inference failed",
    });
  }
});

export default router;