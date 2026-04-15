const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter for allowed types
const allowedExtensions = ['.pdf', '.ppt', '.pptx', '.zip', '.rar', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif'];
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * @route POST /api/media/upload
 * @desc Upload a file and return its metadata
 * @access Private
 */
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileData = {
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    extension: path.extname(req.file.originalname).toLowerCase(),
    mimeType: req.file.mimetype
  };

  res.json({ file: fileData });
});

module.exports = router;
