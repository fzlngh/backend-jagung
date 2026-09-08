import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import scanRouter from "./routes/scan.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(morgan("dev"));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: String(process.env.USE_MOCK_INFERENCE || "true").toLowerCase() === "true" ? "mock" : "roboflow",
    roboflowModel: process.env.ROBOFLOW_MODEL_ID || null,
  });
});

app.use("/api/scan", scanRouter);

// Central error handler (also catches Multer errors like "file too large")
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Corn scan backend listening on http://localhost:${PORT}`);
});
