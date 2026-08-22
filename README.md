# Latrode

Tienda en línea de ropa para Colombia, con panel administrativo completo, pasarela de pagos (Wompi), autenticación (email/password + Google OAuth), y notificaciones por email y Telegram.

---

## Requisitos

- **Go** 1.22+ (compilación del backend)
- **PostgreSQL** 14+ (base de datos)
- **Node.js** no es necesario — el frontend es HTML/CSS/JS puro sin bundler

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd latrode
```

### 2. Configurar la base de datos

```bash
# Crear la base de datos
createdb -U postgres latrode

# Ejecutar el schema completo (tablas + datos iniciales)
psql -U postgres -h localhost -d latrode < database/schema.sql

# Aplicar migraciones adicionales (002 a 009)
for f in backend/migrations/0*_*.up.sql; do
  psql -U postgres -h localhost -d latrode < "$f"
done
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus datos reales
```

**Mínimo necesario:**

| Variable       | Descripción                      |
| -------------- | -------------------------------- |
| `DB_HOST`        | Host de PostgreSQL               |
| `DB_PORT`        | Puerto (default: 5432)           |
| `DB_USER`        | Usuario de PostgreSQL            |
| `DB_PASS`        | Contraseña de PostgreSQL         |
| `DB_NAME`        | Nombre de la base (default: latrode) |
| `SECRET_KEY`     | Clave secreta para sesiones      |
| `FRONTEND_PATH`  | Ruta a archivos del frontend (default: `../frontend`) |

**Opcionales:**

| Variable             | Descripción                         |
| -------------------- | ----------------------------------- |
| `PORT`                 | Puerto del servidor (default: 8080) |
| `APP_ENV`              | `production` para cookies seguras     |
| `ALLOWED_ORIGIN`      | Restringir CORS a un dominio         |
| `GOOGLE_CLIENT_ID`    | OAuth de Google (login con Google)   |
| `GOOGLE_CLIENT_SECRET`| OAuth de Google                      |
| `GOOGLE_REDIRECT_URL` | URL de callback OAuth                |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Envío de emails (confirmación de pedido, recuperación de contraseña) |
| `TG_BOT_TOKEN` | Token del bot de Telegram |
| `TG_CHAT_ID` | Chat ID de Telegram para notificaciones |
| `WOMPI_PUBLIC_KEY` | Llave pública de Wompi |
| `WOMPI_SECRET_KEY` | Llave secreta de Wompi |
| `WOMPI_INTEGRITY_KEY` | Llave de integridad de Wompi |
| `WOMPI_EVENTS_KEY` | Llave de verificación de webhooks |
| `WOMPI_SANDBOX` | `true` para sandbox, `false` para producción |

### 4. Compilar y ejecutar

```bash
cd backend/
go build -o server ./cmd/server/
./server
```

El servidor arranca en `http://localhost:8080`.

**Con scripts automáticos:**

```bash
# Producción
./start.sh
```

---

## Estructura del proyecto

```
latrode-fusion/
├── .env                    # Variables de entorno (no commitear)
├── .env.example            # Template de variables de entorno
├── start.sh                # Build + run (producción)
├── start-test.sh           # Build + run (sandbox Wompi)
│
├── backend/
│   ├── cmd/server/main.go         # Punto de entrada
│   ├── internal/
│   │   ├── config/                # Loader de .env
│   │   ├── database/              # Conexión PostgreSQL + migraciones
│   │   ├── email/                 # Servicio SMTP + cola de emails
│   │   ├── handlers/              # HTTP handlers (9 archivos)
│   │   ├── middleware/            # Auth, CORS, CSRF, gzip, rate-limit
│   │   ├── models/                # Modelos de datos
│   │   ├── repository/            # Acceso a base de datos (6 repos)
│   │   └── wompi/                 # Cliente de pagos Wompi
│   ├── migrations/                # 9 migraciones SQL (up + down)
│   ├── go.mod / go.sum
│   └── server                     # Binario compilado
│
├── database/
│   └── schema.sql                 # Schema completo + datos iniciales
│
├── frontend/
│   ├── index.html                 # Tienda principal (SPA)
│   ├── js/app.js                  # Lógica de la tienda
│   ├── js/api.js                  # Cliente API
│   ├── css/styles.css             # Estilos (dark mode incluido)
│   ├── admin/
│   │   ├── index.html             # Panel administrativo
│   │   ├── js/admin.js            # Lógica del admin
│   │   └── css/admin.css          # Estilos del admin
│   └── assets/
│       ├── font/                  # Fuentes Exo2, Montserrat
│       ├── icons/                 # 32 iconos SVG
│       └── img/                   # Imágenes de productos
```

---

## Arquitectura

### Backend (Go)

Arquitectura en capas: **Handler → Repository → database.DB → PostgreSQL**

- **Sin framework** — usa `net/http` nativo de Go 1.22+ con routing por `ServeMux`
- **Solo 2 dependencias**: `lib/pq` (driver PostgreSQL) y `golang.org/x/crypto` (bcrypt)
- **Middleware**: Gzip, logging, rate-limit, CSRF (double-submit cookie), CORS, auth por sesión
- **Base de datos**: PostgreSQL con conexiones manejadas por pool
- **Paginación**: Backend calcula `finalPrice` = precio base + IVA + comisión + envío

### Frontend (HTML/JS/CSS)

- **SPA vanilla** — sin frameworks, sin bundler, sin build step
- **Tienda** (`index.html` + `app.js`): catálogo, búsqueda, carrito, checkout, pedidos, favoritos, perfil
- **Admin** (`admin/index.html` + `admin.js`): dashboard, pedidos, productos, pagos, usuarios, settings, logs
- **Dark mode**: CSS `prefers-color-scheme` + toggle manual
- **Mobile-first**: diseño responsive

### Base de datos (PostgreSQL)

16 tablas:

| Tabla                | Descripción                                  |
| -------------------- | -------------------------------------------- |
| `users`                | Usuarios con roles (admin/cliente)           |
| `sessions`             | Sesiones de autenticación (7 días TTL)       |
| `products`             | Productos con búsqueda full-text en español  |
| `product_colors`       | Variantes de color por producto              |
| `inventory`            | Stock por color + talla (UNIQUE)             |
| `cart_items`           | Items del carrito                            |
| `favorites`            | Favoritos del usuario                        |
| `orders`               | Pedidos con estado y datos de envío          |
| `order_items`          | Detalle de items del pedido                  |
| `payment_methods`      | Métodos de pago (habilitados/deshabilitados) |
| `settings`             | Configuración clave-valor del sitio          |
| `password_reset_codes` | Códigos de recuperación de contraseña        |
| `activity_logs`        | Registro de actividad del admin              |
| `email_queue`          | Cola de envío de emails                      |
| `email_daily_count`    | Contador diario de emails (max 500/día)      |
| `schema_migrations`    | Migraciones aplicadas                        |

---

## Funcionalidades

### Tienda
- Catálogo de productos con búsqueda full-text (español)
- Variantes de color con imagen propia
- Selección de talla y color
- Precio dinámico con IVA, comisión y envío configurables
- Paginación infinita con infinite scroll
- Lazy loading de imágenes (IntersectionObserver + thumbnails)

### Carrito y checkout
- Carrito persistente por usuario
- Selección de cantidad
- Checkout con formulario de envío (nombre, teléfono, dirección, ciudad, código postal, país)
- Métodos de pago: Contra Entrega, Nequi, DaviPlata, Transferencia Bancolombia

### Pedidos
- Seguimiento de estado del pedido
- Cancelación dentro de 2 horas (restaura stock y items al carrito)
- Imágenes específicas por color en pedidos

### Autenticación
- Registro y login con email/contraseña
- Login con Google OAuth2
- Recuperación de contraseña por código de email
- Sesiones basadas en cookie + header `X-Session-Id`

### Panel administrativo
- Dashboard con estadísticas (ingresos, pedidos, clientes, productos top)
- Gestión de pedidos con filtros y actualización de estado
- CRUD de productos con subida de imágenes (drag-and-drop, max 5MB)
- Gestión de colores e inventario por producto
- Gestión de usuarios
- Habilitar/deshabilitar métodos de pago
- Configuración del sitio (IVA, comisión, envío, datos de contacto)
- Registro de actividad (audit trail)

### Pagos (Wompi)
- Integración con Nequi, DaviPlata y Bancolombia
- Webhook para confirmación asíncrona
- Modo sandbox para pruebas
- Verificación de integridad con SHA256

### Notificaciones
- Email de confirmación de pedido (HTML templates)
- Email de recuperación de contraseña
- Cola de emails con reintento (max 3 intentos)
- Notificaciones Telegram al recibir un pedido

### Seguridad
- Protección CSRF (double-submit cookie)
- Rate limiting por IP (10/min auth, 3/min password reset)
- Límite de tamaño de body (5MB)
- Cookies seguras en producción (httpOnly, secure, SameSite)
- Gzip en respuestas

---

## API

Todas las rutas comienzan con `/api/v1/`.

### Públicas
| Método | Ruta                   | Descripción                   |
| ------ | ---------------------- | ----------------------------- |
| GET    | `/products`              | Listar productos (paginado)   |
| GET    | `/products/{id}`         | Detalle de producto           |
| GET    | `/payment-methods`       | Métodos de pago habilitados   |
| GET    | `/settings`              | Configuración pública         |
| POST   | `/payments/webhook`      | Webhook de Wompi              |
| GET    | `/auth/google/login`     | Login con Google              |
| GET    | `/auth/google/callback`  | Callback de Google OAuth      |
| GET    | `/health`                | Health check                  |

### Autenticadas
| Método | Ruta                      | Descripción                   |
| ------ | ------------------------- | ----------------------------- |
| POST   | `/auth/register`            | Registrar usuario             |
| POST   | `/auth/login`               | Login                         |
| POST   | `/auth/logout`              | Logout                        |
| POST   | `/auth/forgot-password`     | Enviar código de recuperación |
| POST   | `/auth/verify-reset-code`   | Verificar código              |
| POST   | `/auth/reset-password`      | Restablecer contraseña        |
| GET    | `/auth/profile`             | Obtener perfil                |
| PUT    | `/auth/profile`             | Actualizar perfil             |
| POST   | `/auth/set-password`        | Establecer contraseña         |
| GET    | `/cart`                     | Ver carrito                   |
| POST   | `/cart`                     | Agregar al carrito            |
| PUT    | `/cart/{id}`                | Actualizar cantidad           |
| DELETE | `/cart/{id}`                | Eliminar del carrito          |
| DELETE | `/cart`                     | Vaciar carrito                |
| GET    | `/favorites`                | Listar favoritos              |
| POST   | `/favorites`                | Agregar a favoritos           |
| DELETE | `/favorites/{id}`           | Eliminar de favoritos         |
| POST   | `/orders`                   | Crear pedido                  |
| POST   | `/orders/{id}/cancel`       | Cancelar pedido               |
| GET    | `/orders/my`                | Mis pedidos                   |
| GET    | `/orders/{id}`              | Detalle de pedido             |
| POST   | `/payments/create-nequi`    | Pago Nequi                    |
| POST   | `/payments/create-daviplata`| Pago DaviPlata                |
| POST   | `/payments/create-bancolombia-transfer` | Transferencia Bancolombia |
| GET    | `/payments/status`          | Consultar estado de pago      |

### Admin (`/api/v1/admin/`)
| Método | Ruta                           | Descripción                   |
| ------ | ------------------------------ | ----------------------------- |
| GET    | `/dashboard/stats`               | Estadísticas del dashboard    |
| GET    | `/orders`                        | Listar todos los pedidos      |
| PUT    | `/orders/{id}/status`            | Actualizar estado del pedido  |
| GET    | `/products`                      | Listar todos los productos    |
| POST   | `/products`                      | Crear producto                |
| PUT    | `/products/{id}`                 | Actualizar producto           |
| DELETE | `/products/{id}`                 | Eliminar producto             |
| GET    | `/users`                         | Listar usuarios               |
| GET    | `/payment-methods`               | Métodos de pago               |
| PUT    | `/payment-methods/{id}`          | Habilitar/deshabilitar método |
| GET    | `/settings`                      | Configuración completa        |
| PUT    | `/settings`                      | Actualizar configuración      |
| GET    | `/logs`                          | Logs de actividad             |
| POST   | `/upload`                        | Subir imagen de producto      |

---

## Datos de prueba

El schema inicial crea un usuario admin:

- **Email**: `latrode.co@gmail.com`
- **Contraseña**: `admin123`

Y 4 métodos de pago habilitados: Contra Entrega, Nequi, DaviPlata, Bancolombia.

---

## Variables de entorno de Wompi (sandbox)

Las llaves de sandbox están pre-configuradas en `start-test.sh`:

```
WOMPI_PUBLIC_KEY=pub_test_c5d6c01e43e24dffaa30bc78ef20e48c
WOMPI_SECRET_KEY=prv_test_01c38e2b09df628e891be0e151a131495341620a83c6
WOMPI_INTEGRITY_KEY=test_integrity_ekDDTWRD7Y1HO9ZNX1VTHMPGV23SXBGN
WOMPI_EVENTS_KEY=test_eventskey_m6u8Kt2Eg2q1gDx1D6u8Kt2Eg2q1
```

---

## Producción

```bash
export APP_ENV=production
export ALLOWED_ORIGIN=https://tu-dominio.com
export SECRET_KEY=<clave-muy-segura>
# ... demás variables

cd backend/
go build -o server ./cmd/server/
./server
```

El binario sirve tanto la API como los archivos estáticos del frontend. No se necesita nginx ni reverse proxy para el frontend.

---

## Licencia

Privado — Todos los derechos reservados.
