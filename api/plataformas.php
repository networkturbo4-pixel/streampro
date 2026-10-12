<?php
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDBConnection();
$id = isset($_GET['id']) ? intval($_GET['id']) : 0;

// Para operaciones de modificación (POST, PUT, DELETE), requerir autenticación
if (in_array($method, ['POST', 'PUT', 'DELETE'])) {
    requireAuth();
}

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $stmt = $db->prepare("
                SELECT p.*, 
                       (SELECT COUNT(*) FROM cuentas c WHERE c.plataforma_id = p.id) as total_cuentas
                FROM plataformas p
                WHERE p.id = ?
            ");
            $stmt->execute([$id]);
            $plat = $stmt->fetch();
            if (!$plat) {
                jsonError('Plataforma no encontrada.', 404);
            }
            jsonResponse(['success' => true, 'data' => $plat]);
        } else {
            $stmt = $db->query("
                SELECT p.*, 
                       (SELECT COUNT(*) FROM cuentas c WHERE c.plataforma_id = p.id) as total_cuentas
                FROM plataformas p 
                ORDER BY p.nombre ASC
            ");
            $plataformas = $stmt->fetchAll();

            jsonResponse([
                'success' => true,
                'data' => $plataformas
            ]);
        }
        break;

    case 'POST':
        $data = getRequestData();
        $nombre = trim($data['nombre'] ?? '');
        $colorHex = trim($data['color_hex'] ?? '#6366f1');
        $colorSec = trim($data['color_secundario'] ?? '#111827');
        $maxPerfiles = intval($data['max_perfiles'] ?? 5);
        $precioSugerido = floatval($data['precio_sugerido'] ?? 10.00);

        if (empty($nombre)) {
            jsonError('El nombre de la plataforma es obligatorio.', 422);
        }

        if ($maxPerfiles < 1) $maxPerfiles = 1;
        if ($maxPerfiles > 15) $maxPerfiles = 15;

        // Generar código único para la plataforma
        $codigoBase = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $nombre));
        if (empty($codigoBase)) $codigoBase = 'plat';
        $codigo = $codigoBase;
        $counter = 1;

        while (true) {
            $check = $db->prepare("SELECT COUNT(*) as c FROM plataformas WHERE codigo = ?");
            $check->execute([$codigo]);
            if ($check->fetch()['c'] == 0) break;
            $codigo = $codigoBase . $counter++;
        }

        $stmt = $db->prepare("
            INSERT INTO plataformas (codigo, nombre, color_hex, color_secundario, max_perfiles, precio_sugerido)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$codigo, $nombre, $colorHex, $colorSec, $maxPerfiles, $precioSugerido]);

        jsonResponse([
            'success' => true,
            'message' => 'Plataforma agregada exitosamente.',
            'id' => $db->lastInsertId()
        ], 201);
        break;

    case 'PUT':
        if ($id <= 0) jsonError('ID de plataforma no válido.', 422);
        $data = getRequestData();

        $stmt = $db->prepare("SELECT * FROM plataformas WHERE id = ?");
        $stmt->execute([$id]);
        $plat = $stmt->fetch();
        if (!$plat) jsonError('Plataforma no encontrada.', 404);

        $nombre = trim($data['nombre'] ?? $plat['nombre']);
        $colorHex = trim($data['color_hex'] ?? $plat['color_hex']);
        $colorSec = trim($data['color_secundario'] ?? $plat['color_secundario']);
        $maxPerfiles = isset($data['max_perfiles']) ? intval($data['max_perfiles']) : $plat['max_perfiles'];
        $precioSugerido = isset($data['precio_sugerido']) ? floatval($data['precio_sugerido']) : $plat['precio_sugerido'];

        if (empty($nombre)) {
            jsonError('El nombre de la plataforma no puede estar vacío.', 422);
        }

        $update = $db->prepare("
            UPDATE plataformas SET 
                nombre = ?, 
                color_hex = ?, 
                color_secundario = ?, 
                max_perfiles = ?, 
                precio_sugerido = ?
            WHERE id = ?
        ");
        $update->execute([$nombre, $colorHex, $colorSec, $maxPerfiles, $precioSugerido, $id]);

        jsonResponse([
            'success' => true,
            'message' => 'Plataforma actualizada exitosamente.'
        ]);
        break;

    case 'DELETE':
        if ($id <= 0) jsonError('ID de plataforma no válido.', 422);

        // Verificar si existen cuentas usando esta plataforma
        $stmtCheck = $db->prepare("SELECT COUNT(*) as total FROM cuentas WHERE plataforma_id = ?");
        $stmtCheck->execute([$id]);
        $count = $stmtCheck->fetch()['total'] ?? 0;

        if ($count > 0) {
            jsonError("No se puede eliminar la plataforma porque tiene {$count} cuenta(s) asociada(s). Primero elimina o reasigna esas cuentas.", 400);
        }

        $del = $db->prepare("DELETE FROM plataformas WHERE id = ?");
        $del->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Plataforma eliminada correctamente.'
        ]);
        break;

    default:
        jsonError('Método no permitido.', 405);
        break;
}
