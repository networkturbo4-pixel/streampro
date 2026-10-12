-- Migración 001: Módulo de Configuración, Roles, Permisos, Usuarios y Ajustes de Sistema
-- StreamManager Pro

-- 1. Tabla de Control de Migraciones
CREATE TABLE IF NOT EXISTS `sistema_migraciones` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `migracion` VARCHAR(100) NOT NULL UNIQUE,
    `ejecutado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tabla de Roles con Permisos Modulares
CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(60) NOT NULL UNIQUE,
    `descripcion` VARCHAR(255) NULL,
    `permisos` LONGTEXT NOT NULL,
    `es_sistema` TINYINT(1) DEFAULT 0,
    `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabla de Configuración y Parámetros del Sistema
CREATE TABLE IF NOT EXISTS `configuracion` (
    `clave` VARCHAR(60) PRIMARY KEY,
    `valor` TEXT NULL,
    `actualizado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Inserción de Roles por Defecto
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

-- 5. Inserción de Parámetros de Configuración Iniciales
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
