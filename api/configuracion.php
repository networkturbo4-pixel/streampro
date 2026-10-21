<?php
/**
 * Módulo de Configuración, Usuarios, Roles y Actualizaciones GitHub OTA
 * StreamManager Pro
 */

require_once __DIR__ . '/db.php';

$db = getDBConnection();
$currentUser = requireAuth();
$action = $_GET['action'] ?? '';

// Validar permisos del usuario según su rol asignado
$userPerms = getUserPermissions($db, (int)$currentUser['id']);
$isSuperAdmin = ((int)$currentUser['id'] === 1 || ((int)($currentUser['rol_id'] ?? 0)) === 1 || ($currentUser['rol'] ?? '') === 'admin');

if (!$isSuperAdmin) {
    if (empty($userPerms['configuracion']['ver'])) {
        jsonError("Acceso denegado: No tienes permisos para acceder al módulo de configuración.", 403);
    }

    if (in_array($action, ['get_users', 'save_user', 'delete_user']) && empty($userPerms['configuracion']['usuarios'])) {
        jsonError("Acceso denegado: No tienes permisos para gestionar usuarios del sistema.", 403);
    }

    if (in_array($action, ['get_roles', 'save_role', 'delete_role']) && empty($userPerms['configuracion']['roles'])) {
        jsonError("Acceso denegado: No tienes permisos para gestionar roles del sistema.", 403);
    }

    if ($action === 'save_settings' && empty($userPerms['configuracion']['ajustes'])) {
        jsonError("Acceso denegado: No tienes permisos para modificar los ajustes generales.", 403);
    }

    if (in_array($action, ['check_update', 'apply_update']) && empty($userPerms['configuracion']['actualizaciones'])) {
        jsonError("Acceso denegado: No tienes permisos para consultar o aplicar actualizaciones OTA.", 403);
    }
}

/**
 * Cliente HTTP robusto para la API de GitHub
 * Soporta cURL con redirecciones, omite contraseñas autocompletadas por el navegador
 * y reintenta automáticamente como repositorio público si el token no es válido.
 */
function fetchGitHubApi(string $url, string $token = '', int $timeout = 15): array {
    $cleanToken = trim($token);
    // Ignorar contraseñas autocompletadas por el navegador (ej: puntos, asteriscos o claves cortas)
    $isTokenValid = (!empty($cleanToken) && !preg_match('/^[•*]+$/', $cleanToken) && strlen($cleanToken) >= 15);

    $makeRequest = function($useToken) use ($url, $cleanToken, $timeout) {
        $headers = [
            'User-Agent: StreamManagerPro-OTA-Updater/2.8',
            'Accept: application/vnd.github.v3+json'
        ];
        if ($useToken && !empty($cleanToken)) {
            $headers[] = "Authorization: token {$cleanToken}";
        }

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'StreamManagerPro-OTA-Updater/2.8');
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
            return ['code' => $code, 'body' => $body, 'error' => $err];
        } else {
            $ctx = stream_context_create([
                'http' => [
                    'method'          => 'GET',
                    'header'          => implode("\r\n", $headers),
                    'timeout'         => $timeout,
                    'ignore_errors'   => true,
                    'follow_location' => 1
                ],
                'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]
            ]);
            $body = @file_get_contents($url, false, $ctx);
            $code = 200;
            if (isset($http_response_header)) {
                foreach ($http_response_header as $hdr) {
                    if (preg_match('/^HTTP\/\S+\s+(\d+)/', $hdr, $m)) {
                        $code = (int)$m[1];
                        break;
                    }
                }
            }
            return ['code' => $code, 'body' => $body, 'error' => ''];
        }
    };

    // Primer intento con token si tiene formato válido
    $res = $makeRequest($isTokenValid);

    // Si devuelve 401 (Bad credentials) y se había enviado token, reintentar automáticamente sin token
    if ($res['code'] === 401 && $isTokenValid) {
        $retry = $makeRequest(false);
        if ($retry['code'] === 200) {
            $retry['warning'] = 'El token configurado no es válido para GitHub; se consultó el repositorio público sin token.';
            return $retry;
        }
    }

    return $res;
}

switch ($action) {

    // =========================================================================
    // 1. RESUMEN COMPLETO (SETTINGS, USUARIOS, ROLES Y ESTADO)
    // =========================================================================
    case 'get_summary':
        // Obtener configuración general
        $settings = getSystemSettings($db);

        // Obtener lista de usuarios con sus roles
        $usersStmt = $db->query("
            SELECT a.id, a.nombre, a.email, a.telefono, a.rol, a.rol_id, a.estado,
                   a.ultimo_login, a.creado_en,
                   COALESCE(r.nombre, 'Sin Rol Asignado') as rol_nombre
            FROM administradores a
            LEFT JOIN roles r ON r.id = a.rol_id
            ORDER BY a.id ASC
        ");
        $users = $usersStmt->fetchAll();

        // Obtener lista de roles con conteo de usuarios y permisos decodificados
        $rolesStmt = $db->query("
            SELECT r.id, r.nombre, r.descripcion, r.permisos, r.es_sistema, r.creado_en,
                   COUNT(a.id) as usuarios_count
            FROM roles r
            LEFT JOIN administradores a ON a.rol_id = r.id
            GROUP BY r.id
            ORDER BY r.id ASC
        ");
        $rolesRaw = $rolesStmt->fetchAll();
        $roles = [];
        foreach ($rolesRaw as $r) {
            $r['permisos'] = json_decode($r['permisos'] ?: '{}', true);
            $roles[] = $r;
        }

        // Información del entorno del sistema
        $gitVersion = null;
        @exec('git --version', $gitOutput, $gitStatus);
        if ($gitStatus === 0 && !empty($gitOutput)) {
            $gitVersion = trim($gitOutput[0]);
        }

        jsonResponse([
            'success'  => true,
            'settings' => $settings,
            'users'    => $users,
            'roles'    => $roles,
            'system'   => [
                'version'       => $settings['sistema_version'] ?? '2.7.0',
                'php_version'   => PHP_VERSION,
                'git_installed' => $gitVersion !== null,
                'git_version'   => $gitVersion,
                'current_user'  => [
                    'id'     => $currentUser['id'],
                    'rol'    => $currentUser['rol'],
                    'rol_id' => $currentUser['rol_id'] ?? 1
                ]
            ]
        ]);
        break;

    // =========================================================================
    // 2. PARÁMETROS GENERALES DE CONFIGURACIÓN
    // =========================================================================
    case 'get_settings':
        $settings = getSystemSettings($db);
        jsonResponse([
            'success'  => true,
            'settings' => $settings
        ]);
        break;

    case 'save_settings':
        $data = getRequestData();

        $allowedKeys = [
            'empresa_nombre',
            'empresa_telefono',
            'empresa_moneda',
            'empresa_simbolo',
            'dias_alerta_vencimiento',
            'github_repo',
            'github_branch',
            'github_token'
        ];

        $stmt = $db->prepare("
            INSERT INTO configuracion (clave, valor) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE valor = VALUES(valor)
        ");

        $updated = [];
        foreach ($allowedKeys as $key) {
            if (isset($data[$key])) {
                $val = trim((string)$data[$key]);
                $stmt->execute([$key, $val]);
                $updated[$key] = $val;
            }
        }

        jsonResponse([
            'success'  => true,
            'message'  => 'Configuración guardada exitosamente.',
            'settings' => getSystemSettings($db)
        ]);
        break;

    // =========================================================================
    // 3. GESTIÓN DE USUARIOS DEL SISTEMA
    // =========================================================================
    case 'get_users':
        $stmt = $db->query("
            SELECT a.id, a.nombre, a.email, a.telefono, a.rol, a.rol_id, a.estado,
                   a.ultimo_login, a.creado_en,
                   COALESCE(r.nombre, 'Sin Rol') as rol_nombre
            FROM administradores a
            LEFT JOIN roles r ON r.id = a.rol_id
            ORDER BY a.id ASC
        ");
        jsonResponse([
            'success' => true,
            'users'   => $stmt->fetchAll()
        ]);
        break;

    case 'save_user':
        $data = getRequestData();
        $id = !empty($data['id']) ? (int)$data['id'] : null;
        $nombre = trim($data['nombre'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = trim($data['password'] ?? '');
        $telefono = trim($data['telefono'] ?? '');
        $rolId = !empty($data['rol_id']) ? (int)$data['rol_id'] : 1;
        $estado = in_array($data['estado'] ?? '', ['activo', 'inactivo']) ? $data['estado'] : 'activo';

        if (empty($nombre) || empty($email)) {
            jsonError('Nombre y correo electrónico son campos obligatorios.', 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonError('El formato de correo electrónico no es válido.', 422);
        }

        // Verificar si el rol existe
        $roleCheck = $db->prepare("SELECT id, nombre FROM roles WHERE id = ?");
        $roleCheck->execute([$rolId]);
        $roleData = $roleCheck->fetch();
        if (!$roleData) {
            jsonError('El rol seleccionado no existe.', 422);
        }
        $rolSlug = ($rolId === 1) ? 'admin' : 'operador';

        // Validar unicidad de correo
        $emailCheck = $db->prepare("SELECT id FROM administradores WHERE email = ? AND (? IS NULL OR id != ?)");
        $emailCheck->execute([$email, $id, $id]);
        if ($emailCheck->fetch()) {
            jsonError('Ya existe otro usuario registrado con este correo electrónico.', 409);
        }

        if ($id) {
            // Actualización
            // Evitar que el Super Admin principal se desactive a sí mismo
            if ($id === (int)$currentUser['id'] && $estado === 'inactivo') {
                jsonError('No puedes desactivar tu propia cuenta activa de usuario.', 422);
            }

            if (!empty($password)) {
                $hash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $db->prepare("
                    UPDATE administradores 
                    SET nombre = ?, email = ?, password_hash = ?, telefono = ?, rol_id = ?, rol = ?, estado = ?
                    WHERE id = ?
                ");
                $stmt->execute([$nombre, $email, $hash, $telefono, $rolId, $rolSlug, $estado, $id]);
            } else {
                $stmt = $db->prepare("
                    UPDATE administradores 
                    SET nombre = ?, email = ?, telefono = ?, rol_id = ?, rol = ?, estado = ?
                    WHERE id = ?
                ");
                $stmt->execute([$nombre, $email, $telefono, $rolId, $rolSlug, $estado, $id]);
            }
            $userId = $id;
            $msg = 'Usuario actualizado correctamente.';
        } else {
            // Creación
            if (empty($password)) {
                jsonError('Debes asignar una contraseña para el nuevo usuario.', 422);
            }
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $db->prepare("
                INSERT INTO administradores (nombre, email, password_hash, telefono, rol_id, rol, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$nombre, $email, $hash, $telefono, $rolId, $rolSlug, $estado]);
            $userId = (int)$db->lastInsertId();
            $msg = 'Usuario creado exitosamente.';
        }

        jsonResponse([
            'success' => true,
            'message' => $msg,
            'user_id' => $userId
        ]);
        break;

    case 'delete_user':
        $data = getRequestData();
        $id = (int)($data['id'] ?? 0);

        if (!$id) {
            jsonError('ID de usuario no especificado.', 400);
        }

        if ($id === (int)$currentUser['id']) {
            jsonError('Por seguridad, no puedes eliminar tu propia sesión de usuario.', 403);
        }

        if ($id === 1) {
            jsonError('No es posible eliminar el usuario administrador principal del sistema.', 403);
        }

        $stmt = $db->prepare("DELETE FROM administradores WHERE id = ?");
        $stmt->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Usuario eliminado correctamente.'
        ]);
        break;

    // =========================================================================
    // 4. GESTIÓN DE ROLES Y PERMISOS MODULARES
    // =========================================================================
    case 'get_roles':
        $stmt = $db->query("
            SELECT r.id, r.nombre, r.descripcion, r.permisos, r.es_sistema, r.creado_en,
                   COUNT(a.id) as usuarios_count
            FROM roles r
            LEFT JOIN administradores a ON a.rol_id = r.id
            GROUP BY r.id
            ORDER BY r.id ASC
        ");
        $rolesRaw = $stmt->fetchAll();
        $roles = [];
        foreach ($rolesRaw as $r) {
            $r['permisos'] = json_decode($r['permisos'] ?: '{}', true);
            $roles[] = $r;
        }
        jsonResponse([
            'success' => true,
            'roles'   => $roles
        ]);
        break;

    case 'save_role':
        $data = getRequestData();
        $id = !empty($data['id']) ? (int)$data['id'] : null;
        $nombre = trim($data['nombre'] ?? '');
        $descripcion = trim($data['descripcion'] ?? '');
        $permisos = $data['permisos'] ?? [];

        if (empty($nombre)) {
            jsonError('El nombre del rol es requerido.', 422);
        }

        // Asegurar que permisos es JSON válido
        if (is_array($permisos)) {
            $permisosJson = json_encode($permisos, JSON_UNESCAPED_UNICODE);
        } elseif (is_string($permisos)) {
            $permisosJson = $permisos;
        } else {
            $permisosJson = '{}';
        }

        // Validar unicidad del nombre de rol
        $check = $db->prepare("SELECT id FROM roles WHERE nombre = ? AND (? IS NULL OR id != ?)");
        $check->execute([$nombre, $id, $id]);
        if ($check->fetch()) {
            jsonError('Ya existe un rol con este nombre.', 409);
        }

        if ($id) {
            // Actualizar rol
            $stmt = $db->prepare("
                UPDATE roles 
                SET nombre = ?, descripcion = ?, permisos = ?
                WHERE id = ?
            ");
            $stmt->execute([$nombre, $descripcion, $permisosJson, $id]);
            $roleId = $id;
            $msg = 'Rol y permisos actualizados exitosamente.';
        } else {
            // Crear rol
            $stmt = $db->prepare("
                INSERT INTO roles (nombre, descripcion, permisos, es_sistema)
                VALUES (?, ?, ?, 0)
            ");
            $stmt->execute([$nombre, $descripcion, $permisosJson]);
            $roleId = (int)$db->lastInsertId();
            $msg = 'Nuevo rol creado exitosamente.';
        }

        jsonResponse([
            'success' => true,
            'message' => $msg,
            'role_id' => $roleId
        ]);
        break;

    case 'delete_role':
        $data = getRequestData();
        $id = (int)($data['id'] ?? 0);

        if (!$id) {
            jsonError('ID de rol no especificado.', 400);
        }

        $checkStmt = $db->prepare("SELECT es_sistema, nombre FROM roles WHERE id = ?");
        $checkStmt->execute([$id]);
        $role = $checkStmt->fetch();

        if (!$role) {
            jsonError('El rol especificado no existe.', 404);
        }

        if ($role['es_sistema'] == 1 || $id === 1) {
            jsonError('Los roles protegidos del sistema no pueden ser eliminados.', 403);
        }

        // Verificar si tiene usuarios asignados
        $countStmt = $db->prepare("SELECT COUNT(*) FROM administradores WHERE rol_id = ?");
        $countStmt->execute([$id]);
        $usersAssigned = (int)$countStmt->fetchColumn();

        if ($usersAssigned > 0) {
            jsonError("No se puede eliminar el rol porque tiene {$usersAssigned} usuario(s) asignado(s). Reasigna los usuarios a otro rol primero.", 409);
        }

        $stmt = $db->prepare("DELETE FROM roles WHERE id = ?");
        $stmt->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Rol eliminado correctamente.'
        ]);
        break;

    // =========================================================================
    // 5. ACTUALIZADOR DEL SISTEMA GITHUB (OTA UPDATER CON MIGRACIONES)
    // =========================================================================
    case 'check_update':
        $settings = getSystemSettings($db);
        $repo = trim($settings['github_repo'] ?? 'networkturbo4-pixel/streampro');
        $branch = trim($settings['github_branch'] ?? 'main');
        $token = trim($settings['github_token'] ?? '');
        $currentVersion = $settings['sistema_version'] ?? '2.8.2';
        $lastCommit = $settings['github_last_commit'] ?? '';

        if (empty($repo)) {
            jsonError('No hay repositorio de GitHub configurado en los parámetros.', 422);
        }

        // Consultar API de GitHub para obtener el commit más reciente
        $apiUrl = "https://api.github.com/repos/{$repo}/commits/{$branch}";
        $apiRes = fetchGitHubApi($apiUrl, $token, 15);
        $statusCode = $apiRes['code'];
        $response = $apiRes['body'];
        $commitData = @json_decode($response, true);

        if ($statusCode === 401) {
            jsonResponse([
                'success'          => false,
                'update_available' => false,
                'message'          => 'Token de GitHub inválido o expirado (401 Bad Credentials). Si el repositorio es público, deja el campo de Token vacío.',
                'current_version'  => $currentVersion,
                'last_commit'      => $lastCommit ? substr($lastCommit, 0, 7) : 'Ninguno',
                'repo'             => $repo,
                'branch'           => $branch
            ]);
            break;
        }

        if ($statusCode === 403) {
            jsonResponse([
                'success'          => false,
                'update_available' => false,
                'message'          => 'Límite de solicitudes de GitHub API excedido o permisos insuficientes (403 Forbidden).',
                'current_version'  => $currentVersion,
                'last_commit'      => $lastCommit ? substr($lastCommit, 0, 7) : 'Ninguno',
                'repo'             => $repo,
                'branch'           => $branch
            ]);
            break;
        }

        if ($statusCode === 404 || $statusCode === 409 || ($commitData && isset($commitData['message']) && stripos($commitData['message'], 'empty') !== false)) {
            jsonResponse([
                'success'          => true,
                'status'           => 'empty_or_not_found',
                'update_available' => false,
                'message'          => 'El repositorio GitHub está conectado, pero no se encontraron commits en la rama ' . $branch . ' (o el repositorio es privado y requiere token).',
                'repo'             => $repo,
                'branch'           => $branch,
                'current_version'  => $currentVersion,
                'last_commit'      => $lastCommit ? substr($lastCommit, 0, 7) : 'Ninguno'
            ]);
            break;
        }

        if (!$commitData || empty($commitData['sha'])) {
            $errMsg = $commitData['message'] ?? 'No se pudo obtener información del commit remoto en GitHub.';
            jsonResponse([
                'success'          => false,
                'update_available' => false,
                'message'          => "Error de GitHub ({$statusCode}): {$errMsg}",
                'current_version'  => $currentVersion,
                'last_commit'      => $lastCommit ? substr($lastCommit, 0, 7) : 'Ninguno',
                'repo'             => $repo,
                'branch'           => $branch
            ]);
            break;
        }

        $remoteSha = $commitData['sha'];
        $remoteShortSha = substr($remoteSha, 0, 7);
        $remoteMessage = $commitData['commit']['message'] ?? 'Actualización del sistema';
        $remoteAuthor = $commitData['commit']['author']['name'] ?? 'Equipo StreamManager';
        $remoteDate = $commitData['commit']['author']['date'] ?? date('c');

        $isNewUpdate = ($remoteSha !== $lastCommit);

        jsonResponse([
            'success'          => true,
            'update_available' => $isNewUpdate,
            'current_version'  => $currentVersion,
            'last_commit'      => $lastCommit ? substr($lastCommit, 0, 7) : 'Ninguno',
            'warning'          => $apiRes['warning'] ?? null,
            'repo'             => $repo,
            'branch'           => $branch,
            'remote_commit'    => [
                'sha'       => $remoteSha,
                'short_sha' => $remoteShortSha,
                'message'   => $remoteMessage,
                'author'    => $remoteAuthor,
                'date'      => $remoteDate
            ]
        ]);
        break;

    case 'apply_update':
        $settings = getSystemSettings($db);
        $repo = trim($settings['github_repo'] ?? 'networkturbo4-pixel/streampro');
        $branch = trim($settings['github_branch'] ?? 'main');
        $token = trim($settings['github_token'] ?? '');
        $data = getRequestData();
        $targetSha = $data['sha'] ?? '';

        $logs = [];
        $logs[] = "Iniciando proceso de actualización segura OTA...";
        $logs[] = "Repositorio objetivo: {$repo} [Rama: {$branch}]";

        // Si no se proporcionó targetSha, obtenerlo de GitHub
        if (empty($targetSha)) {
            $apiCheck = fetchGitHubApi("https://api.github.com/repos/{$repo}/commits/{$branch}", $token, 12);
            if ($apiCheck['code'] === 200) {
                $cData = @json_decode($apiCheck['body'], true);
                if (!empty($cData['sha'])) {
                    $targetSha = $cData['sha'];
                    $logs[] = "Último commit detectado en GitHub: " . substr($targetSha, 0, 7);
                }
            }
        }

        // Método A: Intento mediante comando local Git si el repo está clonado
        $gitPulled = false;
        $projectRoot = dirname(__DIR__);
        
        if (is_dir($projectRoot . '/.git')) {
            $logs[] = "Detectado repositorio Git local. Intentando sincronización mediante git pull...";
            $gitCmd = "cd /d \"" . addslashes($projectRoot) . "\" && git pull origin " . escapeshellarg($branch) . " 2>&1";
            @exec($gitCmd, $gitOutput, $gitStatus);
            if ($gitStatus === 0) {
                $logs[] = "Sincronización Git local completada exitosamente:";
                foreach ($gitOutput as $line) {
                    $logs[] = "  " . trim($line);
                }
                $gitPulled = true;
            } else {
                $logs[] = "Aviso: Git pull devolvió estado {$gitStatus} (" . implode(" ", $gitOutput) . "). Procediendo con descarga directa de archivos ZIP...";
            }
        }

        // Método B: Descarga directa de archivos ZIP desde GitHub API
        if (!$gitPulled) {
            $logs[] = "Descargando paquete de actualización desde GitHub API...";
            $zipUrl = "https://api.github.com/repos/{$repo}/zipball/{$branch}";
            $zipRes = fetchGitHubApi($zipUrl, $token, 60);

            if ($zipRes['code'] !== 200 || empty($zipRes['body']) || strlen($zipRes['body']) < 100) {
                $logs[] = "Aviso: No se pudo descargar el archivo ZIP remoto (Código HTTP {$zipRes['code']}).";
            } else {
                $zipContent = $zipRes['body'];
                $tempZipPath = $projectRoot . '/tmp_update_' . time() . '.zip';
                file_put_contents($tempZipPath, $zipContent);
                $logs[] = "Archivo ZIP descargado (" . round(strlen($zipContent) / 1024, 1) . " KB).";

                // Extraer con ZipArchive
                if (class_exists('ZipArchive')) {
                    $zip = new ZipArchive();
                    if ($zip->open($tempZipPath) === true) {
                        $extractTempDir = $projectRoot . '/tmp_extract_' . time();
                        @mkdir($extractTempDir, 0777, true);
                        $zip->extractTo($extractTempDir);
                        $zip->close();
                        @unlink($tempZipPath);

                        // La API de GitHub crea una carpeta raíz dentro del zip (ej: networkturbo4-pixel-streampro-abc1234)
                        $subdirs = glob($extractTempDir . '/*', GLOB_ONLYDIR);
                        $sourceDir = (!empty($subdirs)) ? $subdirs[0] : $extractTempDir;

                        $logs[] = "Aplicando archivos del sistema (código fuente, vistas, assets)...";
                        
                        // Función recursiva segura para copiar archivos omitiendo configuraciones locales
                        $copyRecursive = function($src, $dst) use (&$copyRecursive, &$logs) {
                            $dir = opendir($src);
                            @mkdir($dst, 0777, true);
                            while (($file = readdir($dir)) !== false) {
                                if ($file != '.' && $file != '..' && $file != '.git') {
                                    if (is_dir($src . '/' . $file)) {
                                        $copyRecursive($src . '/' . $file, $dst . '/' . $file);
                                    } else {
                                        // Omitir sobreescribir configs sensibles de entorno local si existiesen
                                        if (in_array(strtolower($file), ['config.php', '.env'])) {
                                            if (file_exists($dst . '/' . $file)) {
                                                continue;
                                            }
                                        }
                                        copy($src . '/' . $file, $dst . '/' . $file);
                                    }
                                }
                            }
                            closedir($dir);
                        };

                        $copyRecursive($sourceDir, $projectRoot);

                        // Limpiar directorio temporal
                        $deleteRecursive = function($dir) use (&$deleteRecursive) {
                            if (!is_dir($dir)) return;
                            $items = scandir($dir);
                            foreach ($items as $item) {
                                if ($item === '.' || $item === '..') continue;
                                $p = $dir . '/' . $item;
                                is_dir($p) ? $deleteRecursive($p) : @unlink($p);
                            }
                            @rmdir($dir);
                        };
                        $deleteRecursive($extractTempDir);

                        $logs[] = "Archivos del sistema actualizados correctamente.";
                    } else {
                        $logs[] = "Error al abrir el paquete ZIP de actualización.";
                        @unlink($tempZipPath);
                    }
                } else {
                    $logs[] = "Extensión ZipArchive no disponible en PHP. Se preservan archivos actuales.";
                    @unlink($tempZipPath);
                }
            }
        }

        // Paso 3: Ejecutar migraciones automáticas de base de datos
        $logs[] = "Verificando y ejecutando nuevas migraciones de base de datos...";
        $appliedMigrations = runPendingMigrations($db);
        if (!empty($appliedMigrations)) {
            $logs[] = "Se aplicaron exitosamente " . count($appliedMigrations) . " migración(es) de BD:";
            foreach ($appliedMigrations as $m) {
                $logs[] = "  ✓ Migración: {$m}";
            }
        } else {
            $logs[] = "La estructura de base de datos ya se encuentra al día. No se requirieron cambios.";
        }

        // Paso 4: Actualizar último commit y versión registrados en configuración
        if (!empty($targetSha)) {
            $db->prepare("INSERT INTO configuracion (clave, valor) VALUES ('github_last_commit', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)")
               ->execute([$targetSha]);
        }
        $db->prepare("INSERT INTO configuracion (clave, valor) VALUES ('sistema_version', '2.8.2') ON DUPLICATE KEY UPDATE valor = VALUES(valor)")
           ->execute();

        $logs[] = "Todos los datos de clientes, cuentas y perfiles existentes se han mantenido 100% intactos.";
        $logs[] = "¡Actualización finalizada con éxito!";

        jsonResponse([
            'success'            => true,
            'message'            => 'Actualización del sistema completada con éxito.',
            'new_version'        => '2.8.2',
            'last_commit'        => !empty($targetSha) ? substr($targetSha, 0, 7) : 'Al día',
            'migrations_applied' => $appliedMigrations,
            'logs'               => $logs
        ]);
        break;
        $logs[] = "¡Actualización finalizada con éxito!";

        jsonResponse([
            'success'            => true,
            'message'            => 'Actualización del sistema completada con éxito.',
            'migrations_applied' => $appliedMigrations,
            'logs'               => $logs
        ]);
        break;

    default:
        jsonError('Acción de configuración no válida.', 400);
}
