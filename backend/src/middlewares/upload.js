const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

// Em produção, define UPLOADS_PATH para um volume persistente (ex: /data/uploads no Railway)
const UPLOADS_ROOT = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, '../../../uploads');

// Garante que os diretórios existam ao iniciar
['avatars', 'registros', 'logos', 'assinaturas'].forEach(sub => {
  const dir = path.join(UPLOADS_ROOT, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: path.join(UPLOADS_ROOT, subfolder),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

function imageFilter(_req, file, cb) {
  if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(Object.assign(new Error('Formato inválido. Use JPG, PNG ou WebP.'), { status: 400 }));
}

const avatarUpload = multer({
  storage:    makeStorage('avatars'),
  limits:     { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
});

const registroUpload = multer({
  storage:    makeStorage('registros'),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

const logoUpload = multer({
  storage:    makeStorage('logos'),
  limits:     { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFilter,
});

module.exports = { avatarUpload, registroUpload, logoUpload, UPLOADS_ROOT };
