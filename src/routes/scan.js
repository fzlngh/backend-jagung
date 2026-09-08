import { Router } from "express";
import fs from "fs";
import { upload } from "../middleware/upload.js";
import { classifyImage, CORN_CLASSES } from "../services/roboflow.js";

const router = Router();

// GET /api/scan/classes -> the 4 classes the model recognizes, for the UI
router.get("/classes", (_req, res) => {
  res.json({
    classes: Object.entries(CORN_CLASSES).map(([slug, def]) => ({
      slug,
      label: def.label,
    })),
  });
});

// POST /api/scan -> multipart/form-data { image: <file> }
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded. Send it as multipart/form-data field 'image'." });
  }

  const { path: filePath, mimetype } = req.file;

  try {
    const result = await classifyImage(filePath, mimetype);
    res.json({
      ok: true,
      ...result,
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[scan] inference failed:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  } finally {
    // Clean up the temp upload regardless of outcome
    fs.unlink(filePath, () => {});
  }
});

export default router;
