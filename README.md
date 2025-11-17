# wspbot
# 📱 WhatsApp Messaging Bot

Sistema profesional de mensajería masiva de WhatsApp con autenticación JWT, gestión multi-usuario y envío inteligente de mensajes personalizados.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![React](https://img.shields.io/badge/react-18.2.0-61dafb.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🌟 Características Principales

- ✅ **Autenticación Segura** - Sistema JWT con roles de usuario (admin/usuario)
- 📱 **Conexión WhatsApp** - Integración con Baileys v7 (última versión estable)
- 📤 **Envío Masivo** - Mensajes personalizados con emojis aleatorios
- 🖼️ **Soporte de Imágenes** - Envío de mensajes con imágenes adjuntas
- ⏱️ **Delays Inteligentes** - Sistema anti-ban con delays progresivos
- 👥 **Multi-Usuario** - Sesiones independientes por usuario
- 📊 **Panel Administrativo** - Gestión completa de usuarios y estadísticas
- 🔍 **Verificación DNI** - Integración con API central para validación
- 📈 **Historial de Mensajes** - Tracking completo de envíos
- 🎨 **UI Moderna** - Interfaz responsiva con Tailwind CSS

## 🛠️ Tecnologías Utilizadas

### **Backend**
- **Node.js** v14+ - Runtime de JavaScript
- **Express.js** v4.18+ - Framework web minimalista
- **@whiskeysockets/baileys** v7+ - Librería WhatsApp Web API (ESM)
- **SQL Server** - Base de datos empresarial
- **mssql** v10+ - Driver SQL Server para Node.js
- **JWT (jsonwebtoken)** - Autenticación basada en tokens
- **bcryptjs** - Hash seguro de contraseñas
- **dotenv** - Gestión de variables de entorno
- **cors** - Control de acceso cross-origin

### **Frontend**
- **React** v18.2 - Librería de UI
- **React Router DOM** v6.26 - Enrutamiento SPA
- **Axios** - Cliente HTTP
- **Tailwind CSS** v3.3 - Framework CSS utility-first
- **Lucide React** - Iconos modernos
- **React Hot Toast** - Notificaciones elegantes
- **React QR Code** - Generación de códigos QR

### **Arquitectura**
- **ESM/CommonJS Híbrida** - Backend CommonJS con imports dinámicos ESM
- **REST API** - Arquitectura RESTful
- **JWT Stateless** - Autenticación sin estado
- **Multi-tenant** - Sesiones aisladas por usuario

## 📋 Requisitos Previos

- **Node.js** >= 14.0.0
- **SQL Server** (Express, Developer o Enterprise)
- **npm** o **yarn**
- **Windows** (configurado para PowerShell)

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/whatsapp-bot.git
cd whatsapp-bot
```

### 2. Configurar Backend

```bash
cd backend
npm install
```

Crear archivo `.env`:
```env
NODE_ENV=production
PORT=3001

# Base de datos
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=botwsp
DB_SERVER=localhost\SQLEXPRESS
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# URLs
BACKEND_HOST=localhost
FRONTEND_URL=http://localhost:3000

# JWT Secret
JWT_SECRET=tu_secreto_jwt_muy_seguro

# Límites
DAILY_MESSAGE_LIMIT=200

# Opcional: Skip table creation si las tablas ya existen
SKIP_TABLE_CREATION=false
```

### 3. Configurar Frontend

```bash
cd frontend
npm install
```

Opcional: Actualizar `package.json` proxy si es necesario:
```json
{
  "proxy": "http://localhost:3001"
}
```

### 4. Inicializar Base de Datos

Las tablas se crean automáticamente al iniciar el backend por primera vez (si `SKIP_TABLE_CREATION=false`).

Tablas creadas:
- `usuarios` - Gestión de usuarios y credenciales
- `historial_mensajes` - Log de todos los envíos

## 🎮 Uso

### Iniciar Backend
```bash
cd backend
node src/server.js
```

### Iniciar Frontend
```bash
cd frontend
npm start
```

La aplicación estará disponible en:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001

## 📱 Flujo de Uso

### 1. Primer Acceso (Setup Inicial)
- Accede a http://localhost:3000
- Completa el formulario de configuración inicial
- Ingresa el token de la API central
- Verifica tu DNI
- Crea tu usuario administrador

### 2. Login
- Ingresa con tus credenciales
- Serás redirigido al dashboard

### 3. Conectar WhatsApp
1. Haz clic en **"Conectar WhatsApp"**
2. Escanea el código QR con tu teléfono
3. Haz clic en **"Conectar"** nuevamente
4. Espera la confirmación de conexión

### 4. Enviar Mensajes Masivos
1. Ve a la sección **"Envío Masivo"**
2. Ingresa los números (formato: uno por línea)
3. Escribe tu mensaje
4. Opcional: Adjunta una imagen
5. Haz clic en **"Enviar Mensajes"**
6. Monitorea el progreso en tiempo real

### 5. Ver Historial
- Accede a **"Historial de Mensajes"**
- Filtra por fecha y destinatario
- Descarga reportes

### 6. Panel Admin (solo administradores)
- Gestiona usuarios
- Cambia roles
- Resetea contraseñas
- Visualiza estadísticas globales

## 🔧 Características Técnicas

### Envío Inteligente
- **Delays progresivos:**
  - 8-15 segundos entre mensajes individuales
  - 1 minuto cada 10 mensajes
  - 2 minutos cada 25 mensajes
  - 5 minutos cada 50 mensajes

### Personalización
- Emojis aleatorios por mensaje
- Formato automático de números internacionales (Perú +51, México +52)
- Verificación de números registrados en WhatsApp

### Seguridad
- Hash de contraseñas con bcrypt (10 rounds)
- Tokens JWT con expiración de 24 horas
- Middleware de autenticación en todas las rutas
- Validación de roles (admin/usuario)
- CORS configurado para orígenes específicos

### Sesiones WhatsApp
- Sesiones aisladas por usuario
- Auto-logout después de envíos masivos
- Limpieza automática de credenciales en errores 401/428
- Persistencia de credenciales con Baileys multi-file auth

## 🐛 Solución de Problemas

### Error 515 (Stream Errored)
- **Causa:** Incompatibilidad ESM/CommonJS
- **Solución:** El sistema usa dynamic imports - ya resuelto en v1.0

### Error 401 (Unauthorized)
- **Causa:** Credenciales corruptas
- **Solución:** Sistema limpia automáticamente - reconectar con QR

### Error 428 (Precondition Required)
- **Causa:** device-index faltante
- **Solución:** Baileys v7 persiste correctamente - reconectar

### Backend no inicia
```bash
# Verificar que SQL Server esté corriendo
# Verificar credenciales en .env
# Verificar puerto 3001 no esté en uso
netstat -ano | findstr :3001
```

### Frontend no conecta al backend
- Verificar proxy en `frontend/package.json`
- Verificar CORS en `backend/src/server.js`
- Verificar variables de entorno

## 📁 Estructura del Proyecto

```
whatsapp-bot/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── adminController.js
│   │   │   ├── authController.js
│   │   │   └── whatsappController.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── models/
│   │   │   ├── database.js
│   │   │   └── Usuario.js
│   │   ├── routes/
│   │   │   ├── admin.js
│   │   │   ├── auth.js
│   │   │   └── whatsapp.js
│   │   ├── services/
│   │   │   └── WhatsAppServiceBaileys.js
│   │   └── server.js
│   ├── baileys_sessions/
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminStats.js
│   │   │   ├── BulkMessaging.js
│   │   │   ├── Dashboard.js
│   │   │   ├── FirstSetup.js
│   │   │   ├── Login.js
│   │   │   ├── MessageHistory.js
│   │   │   ├── UserManagement.js
│   │   │   ├── UserStats.js
│   │   │   └── WhatsAppConnection.js
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── hooks/
│   │   │   └── useDNIVerification.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   ├── build/
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

## 🔐 Variables de Entorno

### Backend (.env)
| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Ambiente de ejecución | `production` |
| `PORT` | Puerto del servidor | `3001` |
| `DB_USER` | Usuario SQL Server | `sa` |
| `DB_PASSWORD` | Contraseña SQL Server | `MyPass123$` |
| `DB_NAME` | Nombre de la BD | `botwsp` |
| `DB_SERVER` | Servidor SQL | `localhost\SQLEXPRESS` |
| `BACKEND_HOST` | Host del backend | `localhost` |
| `FRONTEND_URL` | URL del frontend | `http://localhost:3000` |
| `JWT_SECRET` | Secret para tokens | `mi_secreto_seguro` |
| `DAILY_MESSAGE_LIMIT` | Límite diario de mensajes | `200` |
| `CENTRAL_API_URL` | API de validación DNI | `http://api.example.com` |
| `CENTRAL_API_TOKEN` | Token de API central | `token123` |

## 📊 API Endpoints

### Auth
- `POST /api/auth/setup` - Configuración inicial
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/validate-token` - Validar token JWT
- `POST /api/auth/verify-dni` - Verificar DNI con API central

### WhatsApp
- `POST /api/whatsapp/initialize` - Inicializar sesión WhatsApp
- `GET /api/whatsapp/status` - Estado de conexión
- `GET /api/whatsapp/qr` - Obtener código QR
- `POST /api/whatsapp/connect` - Conectar después de QR
- `POST /api/whatsapp/send-bulk` - Envío masivo
- `POST /api/whatsapp/disconnect` - Desconectar sesión
- `DELETE /api/whatsapp/clear-session` - Limpiar credenciales

### Admin
- `GET /api/admin/users` - Listar usuarios
- `POST /api/admin/users` - Crear usuario
- `PUT /api/admin/users/:id` - Actualizar usuario
- `DELETE /api/admin/users/:id` - Eliminar usuario
- `PUT /api/admin/users/:id/role` - Cambiar rol
- `POST /api/admin/users/:id/reset-password` - Resetear contraseña
- `GET /api/admin/message-history` - Historial global

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea tu rama de features (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 👨‍💻 Autor

**Tu Nombre**
- GitHub: [@tu-usuario](https://github.com/tu-usuario)
- Email: tu-email@example.com

## 🙏 Agradecimientos

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [React](https://react.dev/) - Librería UI
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS
- [Express.js](https://expressjs.com/) - Framework web

## 📞 Soporte

Si encuentras algún problema o tienes preguntas:

1. Revisa la sección de [Issues](https://github.com/tu-usuario/whatsapp-bot/issues)
2. Crea un nuevo issue si es necesario
3. Contacta al equipo de desarrollo

---

⭐ Si este proyecto te fue útil, considera darle una estrella en GitHub!

envio masivo mensajes wsp
LOGIN
<img width="1680" height="1011" alt="login" src="https://github.com/user-attachments/assets/cc06efb3-6f7b-4ce7-a3f1-d87ad7c6bf46" />
MAIN
<img width="1680" height="965" alt="main" src="https://github.com/user-attachments/assets/2ac3bb2b-c031-4e60-972c-cca887faadc3" />
ENVIO MASIVO
<img width="1680" height="966" alt="envio masivo" src="https://github.com/user-attachments/assets/58d08bed-f3bb-4051-9f49-679055e3d54b" />
ESTADISTICAS
<img width="1680" height="1007" alt="estadisticas" src="https://github.com/user-attachments/assets/811ff8c1-d498-43b8-9c03-f42222d27cbf" />
HISTORIAL
<img width="1680" height="965" alt="hist" src="https://github.com/user-attachments/assets/9da9b625-cd46-4244-8b42-1da9de1a29b9" />
