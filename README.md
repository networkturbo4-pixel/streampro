# 🎬 StreamManager PRO
> **Sistema Profesional de Gestión y Administración de Cuentas Streaming**
> Desarrollado con HTML5, CSS3 Moderno, JavaScript ES6+, PHP 8 y Base de Datos SQL (MySQL / MariaDB en XAMPP).

---

## 🌟 Características Principales

1. **Gestión Dual de Modalidades de Venta**:
   - **Por Perfiles / Pantallas**: Divide una cuenta en 4, 5 o más perfiles independientes (Netflix, Disney+, Max, etc.), asigna cada pantalla a un cliente distinto con su PIN propio, precio personalizado y fecha de vencimiento individual.
   - **Cuenta Completa**: Asigna la totalidad de la cuenta (correo, contraseña y PIN maestro) a un único cliente con un solo clic.

2. **Login Moderno y Seguro**:
   - Diseño estilo **Fintech / SaaS Dark Glassmorphism** con efectos visuales dinámicos.
   - Botón de alternar visibilidad de contraseña.
   - Botón de **Acceso Rápido Demo** con credenciales de administrador precargadas.
   - Autenticación con Token Bearer y sesiones persistentes protegidas.

3. **Catálogo Completo de Plataformas (Crear, Editar y Eliminar)**:
   - Administra todos los servicios de streaming ofrecidos.
   - Crea nuevas plataformas (ej. Crunchyroll, Apple TV, Tidal, IPTV, Canva Pro, etc.).
   - Edita el nombre, color hexadecimal distintivo de marca, cantidad de perfiles máximos y precio mensual sugerido.
   - Protección inteligente al eliminar: previene la eliminación accidental si una plataforma todavía tiene cuentas activas vinculadas.

4. **Interfaz Móvil First (App Profesional)**:
   - **Barra de Navegación Inferior Flotante (Mobile Tab Bar)** optimizada para uso con el pulgar en teléfonos móviles (iOS y Android).
   - Sidebar retráctil profesional para pantallas de escritorio.
   - Búsqueda reactiva en tiempo real por correo, cliente, teléfono, PIN o plataforma.
   - Filtros rápidos por plataforma (Netflix, Disney+, Max, Amazon Prime, Spotify, YouTube, etc.) y por estado (Activas, Por Vencer, Vencidas, Disponibles).

4. **Integración con WhatsApp con 1 Clic**:
   - **Envío de Credenciales**: Genera automáticamente el mensaje formateado con emojis, usuario, clave, perfil, PIN y fecha de vencimiento, abriendo directamente WhatsApp Web o la App de WhatsApp.
   - **Recordatorios de Cobro / Renovación**: Envía recordatorios personalizados a clientes cuyas suscripciones vencen en menos de 4 días.

5. **Panel Financiero y Analítica en Tiempo Real**:
   - Métricas clave: Cuentas Activas, Pantallas Disponibles vs Ocupadas (con barra visual de porcentaje).
   - Cálculo automático de **Ingresos Proyectados**, **Costos de Adquisición** y **Ganancia Neta Mensual**.
   - Centro de Alertas prioritarias de vencimiento.

6. **Base de Datos SQL Relacional**:
   - Script completo `database.sql` con tablas estructuradas, llaves foráneas (`FOREIGN KEY`), índices e integridad referencial (`ON DELETE CASCADE` / `SET NULL`).
   - Sincronizador automático de estados vencidos y por vencer.
   - Asistente web visual `api/setup.php` para diagnóstico o reinstalación rápida en cualquier momento.

---

## 🚀 Cómo Ejecutar en XAMPP

### Opción A: Desde el Servidor Apache de XAMPP (Recomendado)
1. Abre el **XAMPP Control Panel** (`xampp-control.exe`).
2. Inicia los módulos **Apache** y **MySQL** (ambos deben estar en verde).
3. Abre tu navegador web e ingresa a:
   ```
   http://localhost/APP%20STREAM/
   ```
   o directamente:
   ```
   http://localhost/APP%20STREAM/index.html
   ```

### Opción B: Con el Servidor Integrado de PHP
Si prefieres no usar Apache, puedes ejecutar el servidor integrado desde la consola:
```powershell
& "C:\xampp\php\php.exe" -S localhost:8000
```
Luego abre en tu navegador:
```
http://localhost:8000
```

---

## 🔑 Credenciales de Acceso por Defecto

- **Usuario / Correo:** `admin@stream.app`
- **Contraseña:** `admin123`

*(También puedes pulsar el botón **"⚡ Cargar Credenciales de Administrador"** en la pantalla de inicio de sesión para ingresar en 1 segundo).*

---

## 🗄️ Estructura de la Base de Datos SQL (`database.sql`)

El sistema utiliza la base de datos `stream_manager` en MySQL con las siguientes tablas:

1. `administradores`: Usuarios con acceso al panel administrativo, contraseñas encriptadas con BCRYPT.
2. `plataformas`: Catálogo de servicios de streaming (Netflix, Disney+, Max, Prime Video, Spotify, YouTube Premium, etc.) con sus colores de marca y límites de pantallas.
3. `clientes`: Directorio de clientes con nombres, números de WhatsApp y notas de seguimiento.
4. `cuentas`: Cuentas maestras de streaming con proveedor, costo, fechas y estado.
5. `perfiles`: Pantallas individuales asignadas a clientes o disponibles para la venta.
6. `historial_renovaciones`: Registro de pagos y extensiones de suscripción de 30 días.

---

## 🛠️ Herramienta de Diagnóstico
Si necesitas verificar el estado de la conexión a la base de datos o restaurar los datos semilla, ingresa a:
```
http://localhost/APP%20STREAM/api/setup.php
```
o
```
http://localhost:8000/api/setup.php
```

---

## 📱 Progressive Web App (PWA) e Instalación

StreamManager PRO es una **Progressive Web App (PWA) de nivel de producción**. Puedes instalarla y ejecutarla como una aplicación nativa en Windows, Mac, Linux, Android e iOS.

### Ventajas de la PWA:
- **Instalable con 1 Clic**: Botón nativo de instalación integrado en el Sidebar y en la barra superior.
- **Acceso Directo**: Se ejecuta en su propia ventana independiente sin barras de navegador (`standalone`), con icono oficial en tu escritorio o pantalla de inicio.
- **Soporte Offline**: Service Worker inteligente (`sw.js`) con estrategias de caché (Stale-While-Revalidate, Network-First y fallback a `offline.html`).
- **Persistencia Local de Datos**: Si pierdes la conexión, puedes seguir consultando tus plataformas, cuentas, perfiles y clientes.
- **Atajos de Aplicación (App Shortcuts)**: Acceso rápido desde el icono en tu sistema operativo a "Cuentas", "Perfiles", "Clientes" y "Alertas".
- **Detección Automática de Conectividad**: Indicador dinámico de estado de red (En Línea / Modo Offline) en tiempo real.
- **Notificación de Actualizaciones**: Alerta instantánea en pantalla cuando hay una nueva versión disponible.

### Cómo instalarla en tus dispositivos:
- **En Google Chrome / Microsoft Edge (PC / Mac)**: Haz clic en el botón **"Instalar App"** en el panel o en el icono de instalación en la barra de direcciones del navegador.
- **En Android**: Pulsa en **"Instalar App"** en el menú o selecciona *"Añadir a la pantalla de inicio"* desde las opciones de Chrome.
- **En iOS (iPhone / iPad)**: Abre el sistema en Safari, pulsa el botón **Compartir** (icono cuadrado con flecha hacia arriba) y selecciona **"Añadir a pantalla de inicio"**.

