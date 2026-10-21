<?php
/**
 * StreamManager Pro - Archivo de Configuración de Base de Datos
 *
 * ============================================================================
 * GUÍA RÁPIDA PARA CPANEL / HOSTING COMPARTIDO:
 * ============================================================================
 * 1. Accede a tu cPanel -> "Bases de datos MySQL".
 * 2. Crea una base de datos (por ejemplo: usuariocpanel_stream).
 * 3. Crea un usuario MySQL y su contraseña (por ejemplo: usuariocpanel_admin).
 * 4. Asigna el usuario a la base de datos y marca "TODOS LOS PRIVILEGIOS".
 * 5. Coloca los valores correspondientes en las constantes de abajo.
 * ============================================================================
 */

// Host de la base de datos (en la gran mayoría de servidores cPanel es 'localhost')
define('DB_HOST', 'localhost');

// Puerto MySQL (por defecto es 3306)
define('DB_PORT', '3306');

// Nombre exacto de la base de datos creada en cPanel
define('DB_NAME', 'stream_manager');

// Usuario asignado a la base de datos en cPanel
define('DB_USER', 'root');

// Contraseña del usuario MySQL
define('DB_PASS', '');

// Entorno de ejecución: 'production' o 'development'
define('ENVIRONMENT', 'production');
