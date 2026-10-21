-- =====================================================
-- SISTEMA DE ADMINISTRACIÓN DE CUENTAS DE STREAMING
-- Base de Datos: MySQL / MariaDB (Compatible con cPanel / XAMPP)
-- =====================================================
-- NOTA IMPORTANTE PARA CPANEL / HOSTING:
-- 1. Crea primero la base de datos en cPanel (ej. usuariocpanel_stream).
-- 2. Entra a phpMyAdmin, selecciona dicha base de datos en el menú izquierdo.
-- 3. Ve a la pestaña "Importar", selecciona este archivo y haz clic en "Continuar".
-- =====================================================

-- En servidor local XAMPP puedes descomentar estas dos líneas si no has creado la BD aún:
-- CREATE DATABASE IF NOT EXISTS `stream_manager` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `stream_manager`;

-- 1. TABLA DE ADMINISTRADORES Y USUARIOS
CREATE TABLE IF NOT EXISTS `administradores` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(100) NOT NULL,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `rol` VARCHAR(30) DEFAULT 'admin',
    `rol_id` INT NULL DEFAULT 1,
    `estado` ENUM('activo', 'inactivo') DEFAULT 'activo',
    `telefono` VARCHAR(30) NULL,
    `ultimo_login` DATETIME NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. TABLA DE PLATAFORMAS DE STREAMING
CREATE TABLE IF NOT EXISTS `plataformas` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo` VARCHAR(50) NOT NULL UNIQUE,
    `nombre` VARCHAR(100) NOT NULL,
    `color_hex` VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    `color_secundario` VARCHAR(20) NOT NULL DEFAULT '#1e1b4b',
    `max_perfiles` INT NOT NULL DEFAULT 5,
    `precio_sugerido` DECIMAL(10,2) DEFAULT 0.00,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. TABLA DE CLIENTES / USUARIOS
CREATE TABLE IF NOT EXISTS `clientes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(120) NOT NULL,
    `telefono` VARCHAR(30) NOT NULL,
    `email` VARCHAR(120) NULL,
    `pais_codigo` VARCHAR(10) DEFAULT '+51',
    `notas` TEXT NULL,
    `estado` ENUM('activo', 'inactivo') DEFAULT 'activo',
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. TABLA DE CUENTAS DE STREAMING
CREATE TABLE IF NOT EXISTS `cuentas` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `plataforma_id` INT NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `password` VARCHAR(150) NOT NULL,
    `pin_maestro` VARCHAR(20) NULL,
    `tipo_cuenta` ENUM('por_perfil', 'cuenta_completa') NOT NULL DEFAULT 'por_perfil',
    `cliente_id` INT NULL, -- Asignado si es cuenta_completa
    `proveedor` VARCHAR(100) NULL,
    `costo_compra` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `precio_venta` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `fecha_inicio` DATE NOT NULL,
    `fecha_vencimiento` DATE NOT NULL,
    `max_perfiles` INT NOT NULL DEFAULT 5,
    `estado` ENUM('activa', 'por_vencer', 'vencida', 'suspendida') NOT NULL DEFAULT 'activa',
    `notas` TEXT NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_cuentas_plataforma` FOREIGN KEY (`plataforma_id`) REFERENCES `plataformas`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_cuentas_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. TABLA DE PERFILES POR CUENTA
CREATE TABLE IF NOT EXISTS `perfiles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `cuenta_id` INT NOT NULL,
    `numero_perfil` INT NOT NULL DEFAULT 1,
    `nombre_perfil` VARCHAR(100) NOT NULL,
    `pin_perfil` VARCHAR(20) NULL,
    `ip_mac` VARCHAR(100) NULL,
    `dispositivo` VARCHAR(50) NULL DEFAULT 'tv',
    `cliente_id` INT NULL,
    `precio_mensual` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `fecha_inicio` DATE NULL,
    `fecha_vencimiento` DATE NULL,
    `estado` ENUM('disponible', 'ocupado', 'por_vencer', 'vencido', 'archivado') NOT NULL DEFAULT 'disponible',
    `notas` TEXT NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_perfiles_cuenta` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_perfiles_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. TABLA DE HISTORIAL DE PAGOS / RENOVACIONES
CREATE TABLE IF NOT EXISTS `historial_renovaciones` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tipo` ENUM('cuenta', 'perfil') NOT NULL,
    `cuenta_id` INT NOT NULL,
    `perfil_id` INT NULL,
    `cliente_id` INT NULL,
    `monto` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `fecha_pago` DATE NOT NULL,
    `dias_extendidos` INT NOT NULL DEFAULT 30,
    `metodo_pago` VARCHAR(50) DEFAULT 'Transferencia/Yape/Plin',
    `notas` VARCHAR(255) NULL,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. TABLA DE MIGRACIONES DEL SISTEMA
CREATE TABLE IF NOT EXISTS `sistema_migraciones` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `migracion` VARCHAR(100) NOT NULL UNIQUE,
    `ejecutado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. TABLA DE ROLES Y PERMISOS MODULARES
CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(50) NOT NULL UNIQUE,
    `descripcion` VARCHAR(255) NULL,
    `permisos` LONGTEXT NOT NULL,
    `es_sistema` TINYINT(1) DEFAULT 0,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. TABLA DE CONFIGURACIÓN DEL SISTEMA
CREATE TABLE IF NOT EXISTS `configuracion` (
    `clave` VARCHAR(50) PRIMARY KEY,
    `valor` TEXT NULL,
    `actualizado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- DATOS INICIALES SEMILLAS (SEED DATA)
-- =====================================================

-- Usuario Admin inicial: admin@stream.app / admin123
-- Hash con password_hash('admin123', PASSWORD_BCRYPT)
INSERT INTO `administradores` (`id`, `nombre`, `email`, `password_hash`, `rol`) 
VALUES (1, 'Administrador Pro', 'admin@stream.app', '$2y$10$wTqXvH/NglXg8UqT9I43vOWcQ1H.s7lMhK6sF1hK9sY.nJ0iL9Q9q', 'admin')
ON DUPLICATE KEY UPDATE `email` = VALUES(`email`);

-- Plataformas populares
INSERT INTO `plataformas` (`id`, `codigo`, `nombre`, `color_hex`, `color_secundario`, `max_perfiles`, `precio_sugerido`) VALUES
(1, 'netflix', 'Netflix Premium 4K', '#E50914', '#141414', 5, 12.00),
(2, 'disney', 'Disney+ Estándar/Premium', '#0063e5', '#040714', 4, 10.00),
(3, 'max', 'Max (HBO Max)', '#002be7', '#080b1e', 5, 10.00),
(4, 'prime', 'Amazon Prime Video', '#00A8E1', '#0f172a', 6, 8.00),
(5, 'spotify', 'Spotify Familiar', '#1DB954', '#121212', 6, 7.00),
(6, 'youtube', 'YouTube Premium', '#FF0000', '#181818', 5, 8.00),
(7, 'paramount', 'Paramount+', '#0064FF', '#00193c', 4, 8.00),
(8, 'appletv', 'Apple TV+', '#10B981', '#1e293b', 5, 9.00),
(9, 'crunchyroll', 'Crunchyroll Mega Fan', '#F47521', '#1f1307', 4, 7.00)
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- Clientes de ejemplo
INSERT INTO `clientes` (`id`, `nombre`, `telefono`, `email`, `notas`, `estado`) VALUES
(1, 'Carlos Mendoza', '+51987654321', 'carlos.mendoza@gmail.com', 'Cliente puntual, paga por Yape', 'activo'),
(2, 'Valeria Rojas', '+51912345678', 'valeria.rojas@hotmail.com', 'Amiga de Carlos, prefiere Disney y Netflix', 'activo'),
(3, 'Alejandro Gomez', '+51998877665', 'alegomez@yahoo.com', 'Compró cuenta completa Prime Video', 'activo'),
(4, 'Lucia Fernandez', '+51944332211', 'lucia.fer@gmail.com', 'Pide aviso 2 días antes de vencer', 'activo'),
(5, 'Mateo Silva', '+51966554433', 'mateo.silva@outlook.com', 'Perfil Spotify y Max', 'activo')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- Cuentas de ejemplo
INSERT INTO `cuentas` (`id`, `plataforma_id`, `correo`, `password`, `pin_maestro`, `tipo_cuenta`, `cliente_id`, `proveedor`, `costo_compra`, `precio_venta`, `fecha_inicio`, `fecha_vencimiento`, `max_perfiles`, `estado`, `notas`) VALUES
(1, 1, 'net.premium01@digitalstream.net', 'PassNetFlix$2026', '9988', 'por_perfil', NULL, 'Proveedor Mayorista Digital', 28.00, 60.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 28 DAY), 5, 'activa', 'Cuenta con método turco/gift card, no cambiar correo'),
(2, 2, 'disneyplus.latam@digitalstream.net', 'Disn3yM4gic#26', '1122', 'por_perfil', NULL, 'Master Streamers', 20.00, 40.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 4, 'por_vencer', 'Avisar a clientes para recarga de saldo'),
(3, 4, 'prime.alejandro@digitalstream.net', 'AmazonPrime2026!', '4455', 'cuenta_completa', 3, 'Amazon Oficial Anual', 18.00, 30.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 25 DAY), 6, 'activa', 'Venta directa de cuenta completa a Alejandro Gomez'),
(4, 3, 'max.ultra4k@digitalstream.net', 'MaxHboSecure#1', '3344', 'por_perfil', NULL, 'Streaming Latam Hub', 22.00, 50.00, DATE_SUB(CURDATE(), INTERVAL 35 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 5, 'vencida', 'Pendiente renovar con el proveedor')
ON DUPLICATE KEY UPDATE `correo` = VALUES(`correo`);

-- Perfiles de Cuenta 1 (Netflix - 5 perfiles)
INSERT INTO `perfiles` (`id`, `cuenta_id`, `numero_perfil`, `nombre_perfil`, `pin_perfil`, `cliente_id`, `precio_mensual`, `fecha_inicio`, `fecha_vencimiento`, `estado`, `notas`) VALUES
(1, 1, 1, 'Perfil 1 - Carlos', '1234', 1, 12.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 28 DAY), 'ocupado', 'Smart TV Sala'),
(2, 1, 2, 'Perfil 2 - Valeria', '5678', 2, 12.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 28 DAY), 'ocupado', 'Celular y Tablet'),
(3, 1, 3, 'Perfil 3 - Lucía', '9012', 4, 12.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 28 DAY), 'ocupado', 'Laptop Trabajo'),
(4, 1, 4, 'Perfil 4 - Disponible', '0000', NULL, 12.00, NULL, NULL, 'disponible', 'Listo para vender'),
(5, 1, 5, 'Perfil 5 - Disponible', '0000', NULL, 12.00, NULL, NULL, 'disponible', 'Listo para vender')
ON DUPLICATE KEY UPDATE `nombre_perfil` = VALUES(`nombre_perfil`);

-- Perfiles de Cuenta 2 (Disney+ - 4 perfiles, por vencer en 3 días)
INSERT INTO `perfiles` (`id`, `cuenta_id`, `numero_perfil`, `nombre_perfil`, `pin_perfil`, `cliente_id`, `precio_mensual`, `fecha_inicio`, `fecha_vencimiento`, `estado`, `notas`) VALUES
(6, 2, 1, 'Disney 1 - Mateo', '4321', 5, 10.00, DATE_SUB(CURDATE(), INTERVAL 27 DAY), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'por_vencer', 'Le gusta Marvel'),
(7, 2, 2, 'Disney 2 - Carlos M.', '7788', 1, 10.00, DATE_SUB(CURDATE(), INTERVAL 27 DAY), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'por_vencer', 'Niños'),
(8, 2, 3, 'Disney 3 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre'),
(9, 2, 4, 'Disney 4 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre')
ON DUPLICATE KEY UPDATE `nombre_perfil` = VALUES(`nombre_perfil`);

-- Perfiles de Cuenta 4 (Max - Vencida)
INSERT INTO `perfiles` (`id`, `cuenta_id`, `numero_perfil`, `nombre_perfil`, `pin_perfil`, `cliente_id`, `precio_mensual`, `fecha_inicio`, `fecha_vencimiento`, `estado`, `notas`) VALUES
(10, 4, 1, 'Max 1 - Mateo S.', '1111', 5, 10.00, DATE_SUB(CURDATE(), INTERVAL 35 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'vencido', 'Avisar renovación'),
(11, 4, 2, 'Max 2 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre'),
(12, 4, 3, 'Max 3 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre'),
(13, 4, 4, 'Max 4 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre'),
(14, 4, 5, 'Max 5 - Disponible', '0000', NULL, 10.00, NULL, NULL, 'disponible', 'Libre')
ON DUPLICATE KEY UPDATE `nombre_perfil` = VALUES(`nombre_perfil`);

-- Inserción de Roles por Defecto
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `permisos`, `es_sistema`) VALUES
(1, 'Super Administrador', 'Control total y absoluto sobre todos los módulos, usuarios, finanzas y actualizaciones.', 
'{"dashboard":{"ver":true},"cuentas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"perfiles":{"ver":true,"crear":true,"editar":true,"eliminar":true},"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},"plataformas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"alertas":{"ver":true},"configuracion":{"ver":true,"usuarios":true,"roles":true,"ajustes":true,"actualizaciones":true}}', 1),
(2, 'Administrador Operativo', 'Gestión completa de cuentas, clientes y usuarios, sin acceso a actualizaciones del sistema.', 
'{"dashboard":{"ver":true},"cuentas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"perfiles":{"ver":true,"crear":true,"editar":true,"eliminar":true},"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":true},"plataformas":{"ver":true,"crear":true,"editar":true,"eliminar":true},"alertas":{"ver":true},"configuracion":{"ver":true,"usuarios":true,"roles":true,"ajustes":true,"actualizaciones":false}}', 1),
(3, 'Vendedor / Operador', 'Venta y asignación de perfiles, registro de clientes y visualización de alertas. Sin acceso a ajustes.', 
'{"dashboard":{"ver":true},"cuentas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"perfiles":{"ver":true,"crear":true,"editar":true,"eliminar":false},"clientes":{"ver":true,"crear":true,"editar":true,"eliminar":false},"plataformas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"alertas":{"ver":true},"configuracion":{"ver":false,"usuarios":false,"roles":false,"ajustes":false,"actualizaciones":false}}', 1),
(4, 'Soporte y Monitoreo', 'Visualización de datos de clientes, perfiles y cuentas para resolver incidencias de clientes.', 
'{"dashboard":{"ver":true},"cuentas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"perfiles":{"ver":true,"crear":false,"editar":false,"eliminar":false},"clientes":{"ver":true,"crear":false,"editar":false,"eliminar":false},"plataformas":{"ver":true,"crear":false,"editar":false,"eliminar":false},"alertas":{"ver":true},"configuracion":{"ver":false,"usuarios":false,"roles":false,"ajustes":false,"actualizaciones":false}}', 1)
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- Inserción de Parámetros de Configuración Iniciales
INSERT INTO `configuracion` (`clave`, `valor`) VALUES
('empresa_nombre', 'StreamManager Pro'),
('empresa_telefono', '+51 987 654 321'),
('empresa_moneda', 'USD'),
('empresa_simbolo', '$'),
('dias_alerta_vencimiento', '3'),
('github_repo', 'networkturbo4-pixel/streampro'),
('github_branch', 'main'),
('github_token', ''),
('sistema_version', '2.7.0'),
('github_last_commit', '')
ON DUPLICATE KEY UPDATE `clave` = VALUES(`clave`);

-- Registro de Migración Inicial
INSERT INTO `sistema_migraciones` (`migracion`) VALUES 
('001_create_roles_and_config.sql')
ON DUPLICATE KEY UPDATE `migracion` = VALUES(`migracion`);

