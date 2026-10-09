#!/usr/bin/env bash
set -e
echo "Arreglando backend/package.json (el anterior borró las dependencias ya instaladas)"

cat > backend/package.json << 'EOF_PKG'
{
  "name": "mesas-sillas-backend",
  "version": "1.0.0",
  "description": "API REST para gestión de mesas y sillas",
  "main": "server.js",
  "private": true,
  "license": "ISC",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "dotenv": "^18.0.5",
    "express": "^5.2.1",
    "express-session": "^1.19.0",
    "nodemailer": "^10.0.16",
    "pg": "^8.23.1"
  }
}
EOF_PKG
echo "✔ backend/package.json corregido"

(cd backend && npm install)
echo "✔ dependencias reinstaladas"

node backend/migrar.js
echo "✔ migración aplicada"

echo ""
echo "Ahora sí: cd backend && npm run dev"
