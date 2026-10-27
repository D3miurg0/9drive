# 9Drive Secure: fork con seguridad corregida + app de escritorio

Fork de [zenhosta/9drive](https://github.com/zenhosta/9drive) (Apache-2.0) que corrige dos fallos graves de seguridad y añade una app de escritorio para **macOS y Windows**. La versión web original (Docker / MySQL) sigue funcionando igual.

## Qué se ha corregido

### 1. Archivos públicos con permiso de edición
La versión original añadía el permiso `anyone` + `writer` a **cada archivo subido** y cada vez que se abría un archivo. Cualquiera con el enlace podía editarlo o borrarlo.

- Las subidas (normales y reanudables) ya **no cambian los permisos**: los archivos quedan privados.
- Abrir un archivo (`/files/:id/view-url`) ya no lo hace público.
- “Hacer público” es una acción explícita y ahora es de **solo lectura** (`reader`).
- Nueva ruta `DELETE /files/:id/public-permission` para revocar el enlace público.
- **Limpieza de archivos antiguos** (para instancias que ya usaban la versión original):
  ```bash
  cd backend
  npm run security:revoke-public -- --dry   # solo informa
  npm run security:revoke-public            # los vuelve privados
  ```

### 2. Sin roles de administrador
Cualquier usuario podía descargar o restaurar la base de datos, cambiar el OAuth global de Google o ejecutar `update.sh` en el servidor.

- Nuevo campo `users.role`. La **primera cuenta creada es admin**. La migración de MySQL convierte en admin a la cuenta más antigua.
- Todas las rutas de `/system` exigen ser admin.
- **Registro cerrado**: tras la primera cuenta, nadie más puede registrarse (ni con email ni con Google) salvo que tenga una invitación pendiente o se active `ALLOW_PUBLIC_REGISTRATION=true`.
- La restauración solo acepta archivos SQLite válidos. Backup/restore desde la interfaz solo existe en la versión de escritorio (para MySQL usa `mysqldump`).
- La interfaz oculta los ajustes de administrador a los usuarios normales.
- Dar admin a otra cuenta: `npm run security:make-admin -- correo@ejemplo.com`

## Versión web (servidor propio): actualizar desde la original

```bash
git pull
cd backend && npm ci && npx prisma migrate deploy && npm run build
npm run security:revoke-public          # recomendado una vez
```
Con Docker: `docker compose up -d --build`. Nueva variable: `ALLOW_PUBLIC_REGISTRATION` (por defecto `false`).

## App de escritorio (macOS y Windows)

Ejecuta el backend real en tu equipo, accesible **solo desde tu ordenador** (`localhost:47821`), con una base de datos SQLite en tu perfil de usuario. No hace falta MySQL, Docker ni Node.js.

### Obtener los instaladores (sin instalar nada)
1. Sube este fork a tu cuenta de GitHub.
2. Pestaña **Actions** → **Build desktop apps** → **Run workflow**.
3. Al terminar (~10–15 min), descarga los artefactos:
   - `9drive-windows` → `9Drive-1.0.0-windows-setup.exe`
   - `9drive-macos-apple-silicon` → `.dmg` para Mac M1/M2/M3/M4
   - `9drive-macos-intel` → `.dmg` para Mac Intel
4. Si creas una etiqueta (`git tag v1.0.0 && git push --tags`), los instaladores se adjuntan a una *Release*.

Los instaladores **no están firmados**:
- **Windows**: SmartScreen → “Más información” → “Ejecutar de todas formas”.
- **macOS**: clic derecho → Abrir. Si dice que “está dañada”: `xattr -cr /Applications/9Drive.app`

### Configurar Google la primera vez
1. Abre la app y crea tu cuenta (será la de administrador).
2. En Google Cloud Console crea un cliente OAuth de tipo **Aplicación web** y activa la Google Drive API.
3. Añade este URI de redirección autorizado:
   `http://localhost:47821/api/connected-accounts/google/callback`
4. En la app: **Settings → Google OAuth Credentials**, pega el Client ID y el Client Secret.
5. Conecta tus cuentas de Drive.

Recomendado: inicia sesión con email y contraseña; usa Google para conectar las cuentas de Drive. Si Google bloquea el inicio de sesión dentro de la app, abre un *issue*.

### Datos y registros
| | Ubicación |
|---|---|
| macOS | `~/Library/Application Support/9Drive/` |
| Windows | `%APPDATA%\9Drive\` |

Ahí están `9drive.db` (base de datos), `config.json` (claves generadas en tu equipo) y `logs/backend.log`. Desinstalar no borra estos datos.

### Compilar en tu propio equipo
Necesitas Node.js 22.
```bash
node desktop/scripts/prepare.mjs
cd desktop && npm ci
npm start          # probar
npm run dist       # crear el instalador del sistema actual
```
Nota: `prepare.mjs` genera el cliente Prisma para SQLite. Para volver a trabajar en la versión web, ejecuta `npx prisma generate` en `backend/`.

## Cómo está hecho
- `desktop/main.cjs`: Electron. Arranca el backend con el Node.js incluido en Electron, migra la base de datos (`prisma db push`, que se niega a aplicar cambios con pérdida de datos), espera a `/api/health` y abre la ventana. Solo las páginas de inicio de sesión de Google se abren dentro de la app; el resto de enlaces se abre en el navegador.
- `desktop/scripts/make-sqlite-schema.mjs`: deriva el esquema SQLite del de MySQL (una sola fuente de verdad).
- `backend/src/server.ts`: si se define `FRONTEND_DIST`, sirve la interfaz y la API (`/api`) desde el mismo origen, como hace nginx en la versión Docker.
- `.github/workflows/desktop.yml`: comprueba que la versión web compila y genera los instaladores en Windows, Mac Apple Silicon y Mac Intel.

## Limitaciones conocidas
- La app de escritorio no se ha probado aún de extremo a extremo; la primera ejecución del workflow es la prueba real.
- Las actualizaciones se hacen instalando una versión nueva (no hay actualización automática).
- Las condiciones de uso de Google pueden no permitir repartir archivos entre varias cuentas para sumar espacio.
