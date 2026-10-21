<?php
require_once __DIR__ . '/db.php';

requireAuth();
$db = getDBConnection();
syncExpirationStates($db);

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = isset($_GET['id']) ? intval($_GET['id']) : 0;

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $stmt = $db->prepare("
                SELECT pf.*, c.correo as cuenta_correo, c.password as cuenta_password, c.pin_maestro as cuenta_pin_maestro,
                       c.fecha_vencimiento as cuenta_vencimiento,
                       p.nombre as plataforma_nombre, p.codigo as plataforma_codigo, p.color_hex,
                       cl.nombre as cliente_nombre, cl.telefono as cliente_telefono, cl.email as cliente_email
                FROM perfiles pf
                JOIN cuentas c ON pf.cuenta_id = c.id
                JOIN plataformas p ON c.plataforma_id = p.id
                LEFT JOIN clientes cl ON pf.cliente_id = cl.id
                WHERE pf.id = ?
            ");
            $stmt->execute([$id]);
            $perfil = $stmt->fetch();
            if (!$perfil) jsonError('Perfil no encontrado.', 404);
            jsonResponse(['success' => true, 'data' => $perfil]);
        } else {
            $cuentaId = isset($_GET['cuenta_id']) ? intval($_GET['cuenta_id']) : 0;
            $clienteId = isset($_GET['cliente_id']) ? intval($_GET['cliente_id']) : 0;
            $estado = trim($_GET['estado'] ?? '');
            $search = trim($_GET['search'] ?? '');

            $sql = "
                SELECT pf.*, c.correo as cuenta_correo, c.password as cuenta_password, c.pin_maestro as cuenta_pin_maestro,
                       c.fecha_vencimiento as cuenta_vencimiento,
                       p.nombre as plataforma_nombre, p.codigo as plataforma_codigo, p.color_hex,
                       cl.nombre as cliente_nombre, cl.telefono as cliente_telefono, cl.email as cliente_email,
                       DATEDIFF(pf.fecha_vencimiento, CURDATE()) as dias_restantes
                FROM perfiles pf
                JOIN cuentas c ON pf.cuenta_id = c.id
                JOIN plataformas p ON c.plataforma_id = p.id
                LEFT JOIN clientes cl ON pf.cliente_id = cl.id
                WHERE 1=1
            ";
            $params = [];

            if ($cuentaId > 0) {
                $sql .= " AND pf.cuenta_id = ?";
                $params[] = $cuentaId;
            }

            if ($clienteId > 0) {
                $sql .= " AND pf.cliente_id = ?";
                $params[] = $clienteId;
            }

            if (!empty($estado) && $estado !== 'todos') {
                $sql .= " AND pf.estado = ?";
                $params[] = $estado;
            }

            if (!empty($search)) {
                $sql .= " AND (pf.nombre_perfil LIKE ? OR c.correo LIKE ? OR cl.nombre LIKE ? OR cl.telefono LIKE ? OR pf.pin_perfil LIKE ?)";
                $wildcard = "%$search%";
                $params = array_merge($params, [$wildcard, $wildcard, $wildcard, $wildcard, $wildcard]);
            }

            $sql .= " ORDER BY pf.cuenta_id ASC, pf.numero_perfil ASC";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $perfiles = $stmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $perfiles]);
        }
        break;

    case 'POST':
        $data = getRequestData();

        // 1. Asignar perfil a un cliente
        if ($action === 'asignar') {
            $perfilId = intval($data['perfil_id'] ?? $id);
            if ($perfilId <= 0) jsonError('ID de perfil inválido.', 422);

            $clienteId = !empty($data['cliente_id']) ? intval($data['cliente_id']) : 0;

            // Soporte para crear cliente nuevo al vuelo si se ingresa nombre y teléfono
            if ($clienteId <= 0 && !empty($data['nuevo_cliente_nombre'])) {
                $nuevoNombre = trim($data['nuevo_cliente_nombre']);
                $nuevoTel = trim($data['nuevo_cliente_telefono'] ?? '');
                $nuevoEmail = trim($data['nuevo_cliente_email'] ?? '');

                $insertCli = $db->prepare("INSERT INTO clientes (nombre, telefono, email) VALUES (?, ?, ?)");
                $insertCli->execute([$nuevoNombre, $nuevoTel, $nuevoEmail]);
                $clienteId = $db->lastInsertId();
            }

            if ($clienteId <= 0) {
                jsonError('Debes seleccionar o crear un cliente.', 422);
            }

            $precioMensual = floatval($data['precio_mensual'] ?? 0);
            $pinPerfil = trim($data['pin_perfil'] ?? '');
            $ipMac = isset($data['ip_mac']) ? trim($data['ip_mac']) : null;
            $dispositivo = in_array($data['dispositivo'] ?? '', ['tv', 'android', 'iphone', 'pc', 'otro']) ? $data['dispositivo'] : 'tv';
            $nombrePerfil = trim($data['nombre_perfil'] ?? '');
            $fechaInicio = !empty($data['fecha_inicio']) ? $data['fecha_inicio'] : date('Y-m-d');
            $fechaVencimiento = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : null;
            if ($fechaVencimiento && !empty($fechaInicio)) {
                $calcDays = round((strtotime($fechaVencimiento) - strtotime($fechaInicio)) / 86400);
                $dias = $calcDays > 0 ? $calcDays : 30;
            } else {
                $dias = isset($data['dias']) ? intval($data['dias']) : 30;
                $fechaVencimiento = date('Y-m-d', strtotime($fechaInicio . " + $dias days"));
            }
            $notas = trim($data['notas'] ?? '');

            // Determinar estado según fecha
            $estado = 'ocupado';
            $diasDiff = (strtotime($fechaVencimiento) - strtotime(date('Y-m-d'))) / 86400;
            if ($diasDiff < 0) $estado = 'vencido';
            elseif ($diasDiff <= 3) $estado = 'por_vencer';

            $update = $db->prepare("
                UPDATE perfiles SET 
                    cliente_id = ?,
                    nombre_perfil = CASE WHEN ? != '' THEN ? ELSE nombre_perfil END,
                    pin_perfil = ?,
                    ip_mac = ?,
                    dispositivo = ?,
                    precio_mensual = ?,
                    fecha_inicio = ?,
                    fecha_vencimiento = ?,
                    estado = ?,
                    notas = ?
                WHERE id = ?
            ");
            $update->execute([
                $clienteId, $nombrePerfil, $nombrePerfil,
                $pinPerfil, $ipMac, $dispositivo, $precioMensual, $fechaInicio, $fechaVencimiento,
                $estado, $notas, $perfilId
            ]);

            // Registrar en historial
            $db->prepare("INSERT INTO historial_renovaciones (tipo, cuenta_id, perfil_id, cliente_id, monto, fecha_pago, dias_extendidos, notas)
                          SELECT 'perfil', cuenta_id, ?, ?, ?, CURDATE(), ?, 'Asignación de perfil' FROM perfiles WHERE id = ?")
               ->execute([$perfilId, $clienteId, $precioMensual, $dias, $perfilId]);

            jsonResponse([
                'success' => true,
                'message' => '¡Perfil asignado al cliente con éxito!',
                'cliente_id' => $clienteId
            ]);
        }

        // 2. Liberar perfil (volver a estado disponible)
        if ($action === 'liberar') {
            $perfilId = intval($data['perfil_id'] ?? $id);
            if ($perfilId <= 0) jsonError('ID de perfil inválido.', 422);

            $update = $db->prepare("
                UPDATE perfiles SET 
                    cliente_id = NULL,
                    fecha_inicio = NULL,
                    fecha_vencimiento = NULL,
                    ip_mac = NULL,
                    dispositivo = 'tv',
                    estado = 'disponible',
                    notas = NULL
                WHERE id = ?
            ");
            $update->execute([$perfilId]);

            jsonResponse([
                'success' => true,
                'message' => 'Perfil liberado y marcado como disponible.'
            ]);
        }

        // 3. Renovar perfil (+30 días o personalizados)
        if ($action === 'renovar') {
            $perfilId = intval($data['perfil_id'] ?? $id);
            if ($perfilId <= 0) jsonError('ID de perfil inválido.', 422);

            $stmt = $db->prepare("SELECT * FROM perfiles WHERE id = ?");
            $stmt->execute([$perfilId]);
            $perfil = $stmt->fetch();
            if (!$perfil) jsonError('Perfil no encontrado.', 404);

            $dias = isset($data['dias']) ? intval($data['dias']) : 30;
            $monto = isset($data['monto']) ? floatval($data['monto']) : floatval($perfil['precio_mensual']);

            $fechaBase = (!empty($perfil['fecha_vencimiento']) && strtotime($perfil['fecha_vencimiento']) > time()) 
                         ? $perfil['fecha_vencimiento'] 
                         : date('Y-m-d');
            $nuevaFecha = date('Y-m-d', strtotime($fechaBase . " + $dias days"));

            $update = $db->prepare("
                UPDATE perfiles SET 
                    fecha_vencimiento = ?,
                    estado = 'ocupado'
                WHERE id = ?
            ");
            $update->execute([$nuevaFecha, $perfilId]);

            // Historial
            if ($perfil['cliente_id']) {
                $db->prepare("INSERT INTO historial_renovaciones (tipo, cuenta_id, perfil_id, cliente_id, monto, fecha_pago, dias_extendidos, notas)
                              VALUES ('perfil', ?, ?, ?, ?, CURDATE(), ?, 'Renovación de perfil (+30 días)')")
                   ->execute([$perfil['cuenta_id'], $perfilId, $perfil['cliente_id'], $monto, $dias]);
            }

            jsonResponse([
                'success' => true,
                'message' => "Perfil renovado exitosamente hasta el {$nuevaFecha}.",
                'nueva_fecha' => $nuevaFecha
            ]);
        }

        // 4. Acciones Masivas: Eliminar múltiples perfiles
        if ($action === 'bulk_delete') {
            $ids = isset($data['ids']) && is_array($data['ids']) ? array_map('intval', $data['ids']) : [];
            $ids = array_values(array_filter($ids, function($v) { return $v > 0; }));
            if (empty($ids)) jsonError('No se indicaron perfiles para eliminar.', 422);

            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $del = $db->prepare("DELETE FROM perfiles WHERE id IN ($placeholders)");
            $del->execute($ids);
            $deletedCount = $del->rowCount();

            jsonResponse([
                'success' => true,
                'message' => "Se eliminaron {$deletedCount} perfil(es) correctamente.",
                'deleted_count' => $deletedCount
            ]);
        }

        // 5. Acciones Masivas: Archivar / Desarchivar múltiples perfiles
        if ($action === 'bulk_archive') {
            $ids = isset($data['ids']) && is_array($data['ids']) ? array_map('intval', $data['ids']) : [];
            $ids = array_values(array_filter($ids, function($v) { return $v > 0; }));
            if (empty($ids)) jsonError('No se indicaron perfiles para archivar.', 422);

            $archivar = isset($data['archivar']) ? (bool)$data['archivar'] : true;
            $placeholders = implode(',', array_fill(0, count($ids), '?'));

            if ($archivar) {
                $stmt = $db->prepare("UPDATE perfiles SET estado = 'archivado' WHERE id IN ($placeholders)");
                $stmt->execute($ids);
                $affected = $stmt->rowCount();
                $msg = "Se archivaron {$affected} perfil(es) correctamente.";
            } else {
                // Desarchivar: restaurar estado según asignación y vencimiento
                $stmt = $db->prepare("
                    UPDATE perfiles SET 
                        estado = CASE 
                            WHEN cliente_id IS NULL THEN 'disponible'
                            WHEN fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURDATE() THEN 'vencido'
                            WHEN fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 3 DAY) THEN 'por_vencer'
                            ELSE 'ocupado'
                        END
                    WHERE id IN ($placeholders)
                ");
                $stmt->execute($ids);
                $affected = $stmt->rowCount();
                syncExpirationStates($db);
                $msg = "Se desarchivaron y restauraron {$affected} perfil(es) correctamente.";
            }

            jsonResponse([
                'success' => true,
                'message' => $msg,
                'affected_count' => $affected
            ]);
        }

        // 6. Acciones Masivas: Edición masiva de perfiles
        if ($action === 'bulk_edit') {
            $ids = isset($data['ids']) && is_array($data['ids']) ? array_map('intval', $data['ids']) : [];
            $ids = array_values(array_filter($ids, function($v) { return $v > 0; }));
            if (empty($ids)) jsonError('No se indicaron perfiles para editar.', 422);

            $fields = $data['fields'] ?? [];
            if (empty($fields) || !is_array($fields)) {
                jsonError('No se proporcionaron campos para actualizar.', 422);
            }

            $setClauses = [];
            $setParams = [];

            if (isset($fields['precio_mensual']) && $fields['precio_mensual'] !== '') {
                $setClauses[] = "precio_mensual = ?";
                $setParams[] = floatval($fields['precio_mensual']);
            }

            if (isset($fields['pin_perfil']) && $fields['pin_perfil'] !== '') {
                $setClauses[] = "pin_perfil = ?";
                $setParams[] = trim($fields['pin_perfil']);
            }

            if (!empty($fields['dispositivo']) && in_array($fields['dispositivo'], ['tv', 'android', 'iphone', 'pc', 'otro'])) {
                $setClauses[] = "dispositivo = ?";
                $setParams[] = $fields['dispositivo'];
            }

            if (!empty($fields['fecha_vencimiento'])) {
                $setClauses[] = "fecha_vencimiento = ?";
                $setParams[] = $fields['fecha_vencimiento'];
            }

            if (!empty($fields['dias_adicionales']) && intval($fields['dias_adicionales']) > 0) {
                $diasAdd = intval($fields['dias_adicionales']);
                $setClauses[] = "fecha_vencimiento = CASE 
                    WHEN fecha_vencimiento IS NOT NULL AND fecha_vencimiento > CURDATE() 
                        THEN DATE_ADD(fecha_vencimiento, INTERVAL {$diasAdd} DAY) 
                    ELSE DATE_ADD(CURDATE(), INTERVAL {$diasAdd} DAY) 
                END";
            }

            if (isset($fields['notas']) && $fields['notas'] !== '') {
                $setClauses[] = "notas = ?";
                $setParams[] = trim($fields['notas']);
            }

            if (empty($setClauses)) {
                jsonError('No se seleccionó ningún campo válido para aplicar a los perfiles seleccionados.', 422);
            }

            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $sql = "UPDATE perfiles SET " . implode(', ', $setClauses) . " WHERE id IN ($placeholders)";
            $stmt = $db->prepare($sql);
            $stmt->execute(array_merge($setParams, $ids));
            $affected = $stmt->rowCount();

            syncExpirationStates($db);

            jsonResponse([
                'success' => true,
                'message' => "Se actualizaron {$affected} perfil(es) exitosamente.",
                'affected_count' => $affected
            ]);
        }

        // 7. Agregar un nuevo slot de perfil a una cuenta
        $cuentaId = intval($data['cuenta_id'] ?? 0);
        if ($cuentaId <= 0) jsonError('ID de cuenta requerido para agregar perfil.', 422);

        $stmtNum = $db->prepare("SELECT COALESCE(MAX(numero_perfil), 0) + 1 as next_num FROM perfiles WHERE cuenta_id = ?");
        $stmtNum->execute([$cuentaId]);
        $nextNum = $stmtNum->fetch()['next_num'];

        $nombre = trim($data['nombre_perfil'] ?? "Perfil $nextNum");
        $pin = trim($data['pin_perfil'] ?? '0000');
        $precio = floatval($data['precio_mensual'] ?? 0);

        $stmtIns = $db->prepare("
            INSERT INTO perfiles (cuenta_id, numero_perfil, nombre_perfil, pin_perfil, estado, precio_mensual)
            VALUES (?, ?, ?, ?, 'disponible', ?)
        ");
        $stmtIns->execute([$cuentaId, $nextNum, $nombre, $pin, $precio]);

        jsonResponse([
            'success' => true,
            'message' => 'Nuevo perfil agregado a la cuenta.',
            'id' => $db->lastInsertId()
        ], 201);
        break;

    case 'PUT':
        if ($id <= 0) jsonError('ID de perfil inválido.', 422);
        $data = getRequestData();

        $stmt = $db->prepare("SELECT * FROM perfiles WHERE id = ?");
        $stmt->execute([$id]);
        $perfil = $stmt->fetch();
        if (!$perfil) jsonError('Perfil no encontrado.', 404);

        $nombre = isset($data['nombre_perfil']) ? trim($data['nombre_perfil']) : $perfil['nombre_perfil'];
        $pin = isset($data['pin_perfil']) ? trim($data['pin_perfil']) : $perfil['pin_perfil'];
        $ipMac = isset($data['ip_mac']) ? trim($data['ip_mac']) : $perfil['ip_mac'];
        $dispositivo = isset($data['dispositivo']) ? $data['dispositivo'] : ($perfil['dispositivo'] ?? 'tv');
        $precio = isset($data['precio_mensual']) ? floatval($data['precio_mensual']) : $perfil['precio_mensual'];
        $notas = isset($data['notas']) ? trim($data['notas']) : $perfil['notas'];
        $fechaVenc = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : $perfil['fecha_vencimiento'];

        $update = $db->prepare("
            UPDATE perfiles SET 
                nombre_perfil = ?,
                pin_perfil = ?,
                ip_mac = ?,
                dispositivo = ?,
                precio_mensual = ?,
                fecha_vencimiento = ?,
                notas = ?
            WHERE id = ?
        ");
        $update->execute([$nombre, $pin, $ipMac, $dispositivo, $precio, $fechaVenc, $notas, $id]);

        jsonResponse([
            'success' => true,
            'message' => 'Perfil actualizado exitosamente.'
        ]);
        break;

    case 'DELETE':
        if ($id <= 0) jsonError('ID de perfil inválido.', 422);

        $del = $db->prepare("DELETE FROM perfiles WHERE id = ?");
        $del->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Perfil eliminado.'
        ]);
        break;

    default:
        jsonError('Método no permitido.', 405);
        break;
}
