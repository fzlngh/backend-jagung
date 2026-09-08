import multer from "multer";

const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Only JPG or PNG images are allowed."));
    }

    cb(null, true);
  },
});