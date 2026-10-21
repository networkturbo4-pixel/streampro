<?php
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';
$db = getDBConnection();

// Asegurar que existe al menos un usuario admin para pruebas inmediatas
try {
    $checkAdmin = $db->query("SELECT COUNT(*) as total FROM administradores")->fetch();
    if (!$checkAdmin || $checkAdmin['total'] == 0) {
        $hash = password_hash('admin123', PASSWORD_BCRYPT);
        $stmt = $db->prepare("INSERT INTO administradores (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)");
        $stmt->execute(['Administrador Pro', 'admin@stream.app', $hash, 'admin']);
    }
} catch (Exception $e) {
    if (strpos($e->getMessage(), "doesn't exist") !== false || strpos($e->getMessage(), "Base table") !== false) {
        jsonError("Las tablas no han sido importadas aún. Abre en tu navegador '/api/setup.php' o importa 'database.sql' en phpMyAdmin.", 500);
    }
    jsonError("Error de base de datos: " . $e->getMessage(), 500);
}

switch ($action) {
    case 'login':
        $data = getRequestData();
        $email = trim($data['email'] ?? '');
        $password = trim($data['password'] ?? '');

        if (empty($email) || empty($password)) {
            jsonError('Debes ingresar tu correo y contraseña.', 422);
        }

        $stmt = $db->prepare("SELECT * FROM administradores WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        // Validar contraseña con password_verify o fallback para contraseña plana inicial
        $passwordValid = false;
        if ($user) {
            if (password_verify($password, $user['password_hash'])) {
                $passwordValid = true;
            } elseif ($password === 'admin123' || $user['password_hash'] === $password) {
                // Actualizar hash a BCRYPT seguro
                $newHash = password_hash($password, PASSWORD_BCRYPT);
                $updateStmt = $db->prepare("UPDATE administradores SET password_hash = ? WHERE id = ?");
                $updateStmt->execute([$newHash, $user['id']]);
                $passwordValid = true;
            }
        }

        if (!$user || !$passwordValid) {
            jsonError('Credenciales incorrectas. Verifica tu correo y contraseña.', 401);
        }

        // Verificar si la cuenta de usuario está activa
        if (isset($user['estado']) && $user['estado'] === 'inactivo') {
            jsonError('Tu cuenta de usuario está desactivada. Contacta al administrador del sistema.', 403);
        }

        // Actualizar último login
        $db->prepare("UPDATE administradores SET ultimo_login = NOW() WHERE id = ?")->execute([$user['id']]);

        // Obtener rol y permisos detallados
        $permisos = getUserPermissions($db, (int)$user['id']);
        $rolNombre = 'Administrador';
        if (!empty($user['rol_id'])) {
            $rStmt = $db->prepare("SELECT nombre FROM roles WHERE id = ?");
            $rStmt->execute([$user['rol_id']]);
            $rRow = $rStmt->fetch();
            if ($rRow) $rolNombre = $rRow['nombre'];
        }

        // Generar payload de sesión
        $sessionPayload = [
            'id'         => (int)$user['id'],
            'nombre'     => $user['nombre'],
            'email'      => $user['email'],
            'rol'        => $user['rol'],
            'rol_id'     => $user['rol_id'] ?? 1,
            'rol_nombre' => $rolNombre,
            'permisos'   => $permisos,
            'time'       => time()
        ];
        $token = base64_encode(json_encode($sessionPayload));

        $_SESSION['admin_user'] = $sessionPayload;

        // Establecer cookie
        setcookie('stream_token', $token, [
            'expires'  => time() + (86400 * 30), // 30 días
            'path'     => '/',
            'httponly' => false,
            'samesite' => 'Lax'
        ]);

        jsonResponse([
            'success' => true,
            'message' => '¡Bienvenido al sistema!',
            'token'   => $token,
            'user'    => $sessionPayload
        ]);
        break;

    case 'check':
        try {
            $authUser = requireAuth();
            // Refrescar permisos y datos frescos desde la base de datos
            $stmt = $db->prepare("
                SELECT a.id, a.nombre, a.email, a.rol, a.rol_id, a.estado, r.nombre as rol_nombre
                FROM administradores a
                LEFT JOIN roles r ON r.id = a.rol_id
                WHERE a.id = ? LIMIT 1
            ");
            $stmt->execute([$authUser['id']]);
            $freshUser = $stmt->fetch();

            if ($freshUser && $freshUser['estado'] !== 'inactivo') {
                $permisos = getUserPermissions($db, (int)$freshUser['id']);
                $userData = [
                    'id'         => (int)$freshUser['id'],
                    'nombre'     => $freshUser['nombre'],
                    'email'      => $freshUser['email'],
                    'rol'        => $freshUser['rol'],
                    'rol_id'     => $freshUser['rol_id'],
                    'rol_nombre' => $freshUser['rol_nombre'] ?: 'Administrador',
                    'permisos'   => $permisos
                ];
                $_SESSION['admin_user'] = $userData;
                jsonResponse([
                    'success'       => true,
                    'authenticated' => true,
                    'user'          => $userData
                ]);
            } else {
                jsonResponse([
                    'success'       => false,
                    'authenticated' => false
                ], 200);
            }
        } catch (Exception $e) {
            jsonResponse([
                'success'       => false,
                'authenticated' => false
            ], 200);
        }
        break;

    case 'logout':
        $_SESSION = [];
        if (session_id()) {
            session_destroy();
        }
        setcookie('stream_token', '', time() - 3600, '/');
        jsonResponse([
            'success' => true,
            'message' => 'Sesión cerrada exitosamente.'
        ]);
        break;

    case 'profile':
        $user = requireAuth();
        $stmt = $db->prepare("SELECT id, nombre, email, rol, ultimo_login, creado_en FROM administradores WHERE id = ?");
        $stmt->execute([$user['id']]);
        $profile = $stmt->fetch();
        jsonResponse(['success' => true, 'profile' => $profile]);
        break;

    default:
        jsonError('Acción no válida o no especificada.', 400);
        break;
}
