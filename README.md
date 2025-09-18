# Comic AI Editor

Un editor de cómics impulsado por IA que permite crear series, personajes y episodios con generación automática de imágenes usando Google Gemini.

## 🚀 Despliegue en Railway

### Prerrequisitos

1. **Cuenta de Railway**: [railway.app](https://railway.app)
2. **Proyecto de Firebase** configurado
3. **Clave de API de Google Gemini**

### Configuración de Variables de Entorno

En Railway, configura estas variables de entorno en tu proyecto:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=tu_api_key_de_firebase
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id

# Gemini API Configuration
VITE_GEMINI_API_KEY=tu_clave_de_gemini
```

### Despliegue

1. **Conectar repositorio**:
   ```bash
   # Railway detectará automáticamente el proyecto de Node.js
   # y usará el start.sh para el despliegue
   ```

2. **Variables de entorno**: Configurar en Railway Dashboard → Variables

3. **Deploy automático**: Cada push al repositorio principal activará un nuevo despliegue

### Estructura del Proyecto

```
comic-editor/
├── src/
│   ├── App.jsx          # Componente principal
│   ├── main.jsx         # Punto de entrada
│   └── index.css        # Estilos globales
├── public/
├── package.json         # Dependencias y scripts
├── vite.config.js       # Configuración de Vite
├── start.sh            # Script de inicio para Railway
├── railway.json        # Configuración de Railway
└── .env               # Variables de entorno (local)
```

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Construir para producción
npm run build

# Vista previa de producción
npm run preview
```

## 🔧 Configuración de Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilitar Authentication con Email/Password
3. Crear Firestore Database
4. Configurar reglas de seguridad

## 🎨 Características

- ✅ Creación de series de cómics
- ✅ Generación de personajes con IA
- ✅ Creación de episodios y paneles
- ✅ Generación automática de imágenes en 16:9
- ✅ Autenticación de usuarios
- ✅ Vista pública para compartir cómics
- ✅ Selección inteligente de imágenes
- ✅ Reintentos automáticos en fallos
- ✅ Edición de estilos de serie

## 📦 Dependencias Principales

- **React 18** - Framework frontend
- **Vite** - Build tool y dev server
- **Firebase** - Backend y autenticación
- **Google Gemini** - Generación de imágenes
- **Tailwind CSS** - Estilos
- **Railway** - Plataforma de despliegue

## 🚀 URL de Producción

Después del despliegue, Railway proporcionará una URL como:
`https://comic-editor-production.up.railway.app`

## 📝 Notas

- El proyecto incluye un `.gitignore` completo
- Las variables de entorno están protegidas
- El build se optimiza automáticamente para producción
- Soporte para vista pública sin autenticación
