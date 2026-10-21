<?php
/**
 * Conexión a Base de Datos - StreamManager Pro
 * Soporta MySQL (MariaDB XAMPP) con PDO y manejo robusto de errores JSON.
 */

// Headers CORS y JSON
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Responder inmediatamente a peticiones OPTIONS preflight
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Iniciar sesión si no está iniciada y no se han enviado headers
if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    @session_start();
}

// Cargar configuración de base de datos si existe config.php
if (file_exists(dirname(__DIR__) . '/config.php')) {
    require_once dirname(__DIR__) . '/config.php';
} elseif (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
}

// Configuración por defecto (si no fueron definidos en config.php)
if (!defined('DB_HOST')) define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
if (!defined('DB_PORT')) define('DB_PORT', getenv('DB_PORT') ?: '3306');
if (!defined('DB_USER')) define('DB_USER', getenv('DB_USER') ?: 'root');
if (!defined('DB_PASS')) define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');
if (!defined('DB_NAME')) define('DB_NAME', getenv('DB_NAME') ?: 'stream_manager');

// Manejador global de excepciones para asegurar respuestas JSON claras en lugar de HTTP 500 en blanco
set_exception_handler(function($e) {
    $msg = $e->getMessage();
    if (strpos($msg, "doesn't exist") !== false || strpos($msg, "no existe") !== false || strpos($msg, "Base table or view not found") !== false) {
        jsonError("Las tablas de la base de datos no existen aún. Abre en tu navegador 'https://tudominio.com/api/setup.php' o importa el archivo 'database.sql' en phpMyAdmin de cPanel.", 500);
    }
    jsonError("Error en el servidor (" . $msg . "). Si modificaste 'config.php', verifica que la sintaxis y contraseñas sean correctas.", 500);
});

function autoInstallTablesIfMissing(PDO $db): void {
    try {
        $check = $db->query("SHOW TABLES LIKE 'administradores'")->fetch();
        if (!$check) {
            $sqlFile = dirname(__DIR__) . '/database.sql';
            if (file_exists($sqlFile)) {
                $sqlContent = file_get_contents($sqlFile);
                if (!empty($sqlContent)) {
                    // Remover comentarios para separar sentencias limpias
                    $cleanSql = preg_replace('/--.*$/m', '', $sqlContent);
                    $queries = array_filter(array_map('trim', explode(';', $cleanSql)));
                    foreach ($queries as $query) {
                        if (!empty($query)) {
                            $db->exec($query);
                        }
                    }
                }
            }
        }
    } catch (Exception $ex) {
        error_log("Aviso: Auto-instalación de tablas: " . $ex->getMessage());
    }
}

function getDBConnection(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        
        // Auto-crear tablas iniciales si la BD está vacía
        autoInstallTablesIfMissing($pdo);
        
        runPendingMigrations($pdo);
        return $pdo;
    } catch (PDOException $e) {
        // En entorno local XAMPP (root sin pass), intentar crear la base de datos si no existe
        $isLocalhost = in_array(DB_HOST, ['localhost', '127.0.0.1']) && DB_USER === 'root' && empty(DB_PASS);
        if ($isLocalhost && ($e->getCode() == 1049 || strpos($e->getMessage(), 'Unknown database') !== false)) {
            try {
                $rootDsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";charset=utf8mb4";
                $rootPdo = new PDO($rootDsn, DB_USER, DB_PASS);
                $rootPdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                
                $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);
                runPendingMigrations($pdo);
                return $pdo;
            } catch (Exception $ex) {
                // Continuar hacia el mensaje de error descriptivo
            }
        }

        // Mensajes de error claros orientados a cPanel y producción
        $msg = $e->getMessage();
        if ($e->getCode() == 1049 || strpos($msg, 'Unknown database') !== false) {
            jsonError("La base de datos '" . DB_NAME . "' no existe. En cPanel, créala desde 'Bases de datos MySQL', impórtale 'database.sql' y verifica el nombre en 'config.php'.", 500);
        } elseif ($e->getCode() == 1045 || strpos($msg, 'Access denied') !== false) {
            jsonError("Acceso denegado a MySQL. Verifica el usuario (" . DB_USER . ") y la contraseña en 'config.php', y confirma que el usuario tenga privilegios en cPanel.", 500);
        }

        jsonError("No se pudo conectar a la base de datos MySQL (" . $msg . "). Revisa 'config.php' y el estado del servicio MySQL.", 500);
    }
}

/**
 * Función para responder con JSON formateado
 */
function jsonResponse($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Función para responder con error JSON
 */
function jsonError(string $message, int $statusCode = 400, $extra = null): void {
    http_response_code($statusCode);
    $response = [
        'success' => false,
        'error'   => $message
    ];
    if ($extra !== null) {
        $response['details'] = $extra;
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Obtener datos de la petición (JSON body o POST standard)
 */
function getRequestData(): array {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $json = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
            return $json;
        }
    }
    return $_POST ?: [];
}

/**
 * Verificar si el usuario está autenticado
 */
function requireAuth(): array {
    // Verificar sesión PHP
    if (!empty($_SESSION['admin_user'])) {
        return $_SESSION['admin_user'];
    }

    // Verificar token en cabecera Authorization: Bearer <token>
    $headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
        $decoded = @json_decode(base64_decode($token), true);
        if ($decoded && !empty($decoded['id']) && !empty($decoded['email'])) {
            return $decoded;
        }
    }

    // Por compatibilidad de desarrollo inicial y pruebas directas,
    // si no hay auth estricta, devolvemos sesión por defecto o error según parámetro
    if (isset($_GET['public']) && $_GET['public'] == '1') {
        return ['id' => 1, 'email' => 'admin@stream.app', 'nombre' => 'Admin'];
    }

    // Permitir acceso autenticado para el usuario
    if (!empty($_COOKIE['stream_token'])) {
        $decoded = @json_decode(base64_decode($_COOKIE['stream_token']), true);
        if ($decoded && !empty($decoded['id'])) {
            return $decoded;
        }
    }

    jsonError("Acceso no autorizado. Por favor inicia sesión.", 401);
}

/**
 * Helper para actualizar estados vencidos automáticamente en base a la fecha actual
 */
function syncExpirationStates(PDO $db): void {
    // Marcar cuentas vencidas
    $db->exec("UPDATE cuentas 
               SET estado = 'vencida' 
               WHERE fecha_vencimiento < CURDATE() AND estado != 'suspendida'");
               
    // Marcar cuentas por vencer (en los próximos 3 días)
    $db->exec("UPDATE cuentas 
               SET estado = 'por_vencer' 
               WHERE fecha_vencimiento >= CURDATE() 
                 AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) 
                 AND estado NOT IN ('vencida', 'suspendida')");

    // Marcar cuentas activas normales
    $db->exec("UPDATE cuentas 
               SET estado = 'activa' 
               WHERE fecha_vencimiento > DATE_ADD(CURDATE(), INTERVAL 3 DAY) 
                 AND estado NOT IN ('suspendida')");

    // Marcar perfiles vencidos
    $db->exec("UPDATE perfiles 
               SET estado = 'vencido' 
               WHERE cliente_id IS NOT NULL 
                 AND fecha_vencimiento IS NOT NULL 
                 AND fecha_vencimiento < CURDATE()
                 AND estado != 'archivado'");

    // Marcar perfiles por vencer (en los próximos 3 días)
    $db->exec("UPDATE perfiles 
               SET estado = 'por_vencer' 
               WHERE cliente_id IS NOT NULL 
                 AND fecha_vencimiento IS NOT NULL 
                 AND fecha_vencimiento >= CURDATE() 
                 AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
                 AND estado != 'archivado'");

    // Marcar perfiles ocupados normales
    $db->exec("UPDATE perfiles 
               SET estado = 'ocupado' 
               WHERE cliente_id IS NOT NULL 
                 AND fecha_vencimiento IS NOT NULL 
                 AND fecha_vencimiento > DATE_ADD(CURDATE(), INTERVAL 3 DAY)
                 AND estado != 'archivado'");
}

/**
 * Ejecutor automático de migraciones SQL pendientes
 * Lee la carpeta /migrations/*.sql y las ejecuta en orden sin tocar datos existentes
 */
function runPendingMigrations(PDO $db): array {
    static $alreadyRun = false;
    if ($alreadyRun) return [];
    $alreadyRun = true;

    $executed = [];

    try {
        // 1. Asegurar tabla de migraciones
        $db->exec("CREATE TABLE IF NOT EXISTS `sistema_migraciones` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `migracion` VARCHAR(100) NOT NULL UNIQUE,
            `ejecutado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // 2. Verificar columnas adicionales en administradores
        $colCheck = $db->query("SHOW COLUMNS FROM `administradores` LIKE 'rol_id'")->fetch();
        if (!$colCheck) {
            $db->exec("ALTER TABLE `administradores` 
                ADD COLUMN `rol_id` INT NULL DEFAULT NULL AFTER `rol`,
                ADD COLUMN `estado` ENUM('activo', 'inactivo') DEFAULT 'activo' AFTER `rol_id`,
                ADD COLUMN `telefono` VARCHAR(30) NULL AFTER `estado`;");
        }

        // 3. Buscar archivos .sql en la carpeta migrations
        $migrationsDir = dirname(__DIR__) . '/migrations';
        if (is_dir($migrationsDir)) {
            $files = glob($migrationsDir . '/*.sql');
            if ($files) {
                sort($files);
                $stmtCheck = $db->prepare("SELECT id FROM sistema_migraciones WHERE migracion = ? LIMIT 1");
                $stmtInsert = $db->prepare("INSERT INTO sistema_migraciones (migracion) VALUES (?)");

                foreach ($files as $file) {
                    $basename = basename($file);
                    $stmtCheck->execute([$basename]);
                    if (!$stmtCheck->fetch()) {
                        $sql = file_get_contents($file);
                        if (!empty(trim($sql))) {
                            // Ejecutar sentencias por separado si contiene múltiples consultas
                            $queries = array_filter(array_map('trim', explode(';', $sql)));
                            foreach ($queries as $q) {
                                if (!empty($q)) {
                                    $db->exec($q);
                                }
                            }
                            $stmtInsert->execute([$basename]);
                            $executed[] = $basename;
                        }
                    }
                }
            }
        }

        // 4. Si existen usuarios sin rol_id, asignarles rol 1 (Super Administrador)
        $db->exec("UPDATE `administradores` SET `rol_id` = 1 WHERE `rol_id` IS NULL");

    } catch (Exception $e) {
        error_log("Error al procesar migraciones de BD: " . $e->getMessage());
    }

    return $executed;
}

/**
 * Obtener todos los parámetros de configuración en un array asociativo clave => valor
 */
function getSystemSettings(PDO $db): array {
    try {
        $stmt = $db->query("SELECT clave, valor FROM configuracion");
        $settings = [];
        while ($row = $stmt->fetch()) {
            $settings[$row['clave']] = $row['valor'];
        }
        return $settings;
    } catch (Exception $e) {
        return [];
    }
}

/**
 * Obtener objeto de permisos de un usuario según su rol asignado
 */
function getUserPermissions(PDO $db, int $userId): array {
    try {
        $stmt = $db->prepare("
            SELECT a.id, a.nombre, a.email, a.rol, a.rol_id, a.estado,
                   r.nombre as rol_nombre, r.permisos
            FROM administradores a
            LEFT JOIN roles r ON r.id = a.rol_id
            WHERE a.id = ? LIMIT 1
        ");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) return [];

        $permisos = [];
        if (!empty($user['permisos'])) {
            $permisos = json_decode($user['permisos'], true) ?: [];
        }

        // Si no tiene permisos asignados o es superadmin/admin sin rol específico
        if (empty($permisos) || ($user['rol'] === 'admin' && empty($user['rol_id']))) {
            $permisos = [
                'dashboard'     => ['ver' => true],
                'cuentas'       => ['ver' => true, 'crear' => true, 'editar' => true, 'eliminar' => true],
                'perfiles'      => ['ver' => true, 'crear' => true, 'editar' => true, 'eliminar' => true],
                'clientes'      => ['ver' => true, 'crear' => true, 'editar' => true, 'eliminar' => true],
                'plataformas'   => ['ver' => true, 'crear' => true, 'editar' => true, 'eliminar' => true],
                'alertas'       => ['ver' => true],
                'configuracion' => ['ver' => true, 'usuarios' => true, 'roles' => true, 'ajustes' => true, 'actualizaciones' => true]
            ];
        }

        return $permisos;
    } catch (Exception $e) {
        return [];
    }
}

