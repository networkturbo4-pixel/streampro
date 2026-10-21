-- Migración 002: Soporte para estado archivado en perfiles
-- StreamManager Pro

ALTER TABLE `perfiles` MODIFY COLUMN `estado` ENUM('disponible', 'ocupado', 'por_vencer', 'vencido', 'archivado') NOT NULL DEFAULT 'disponible';
