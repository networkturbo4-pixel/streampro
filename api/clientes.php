<?php
require_once __DIR__ . '/db.php';

requireAuth();
$db = getDBConnection();

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($id > 0) {
            // Detalle de cliente con sus cuentas y perfiles activos
            $stmt = $db->prepare("SELECT * FROM clientes WHERE id = ?");
            $stmt->execute([$id]);
            $cliente = $stmt->fetch();
            if (!$cliente) jsonError('Cliente no encontrado.', 404);

            // Obtener perfiles asignados
            $stmtP = $db->prepare("
                SELECT pf.*, c.correo as cuenta_correo, c.password as cuenta_password,
                       p.nombre as plataforma_nombre, p.color_hex, p.codigo as plataforma_codigo
                FROM perfiles pf
                JOIN cuentas c ON pf.cuenta_id = c.id
                JOIN plataformas p ON c.plataforma_id = p.id
                WHERE pf.cliente_id = ?
                ORDER BY pf.fecha_vencimiento ASC
            ");
            $stmtP->execute([$id]);
            $cliente['perfiles'] = $stmtP->fetchAll();

            // Obtener cuentas completas asignadas
            $stmtC = $db->prepare("
                SELECT c.*, p.nombre as plataforma_nombre, p.color_hex, p.codigo as plataforma_codigo
                FROM cuentas c
                JOIN plataformas p ON c.plataforma_id = p.id
                WHERE c.cliente_id = ?
                ORDER BY c.fecha_vencimiento ASC
            ");
            $stmtC->execute([$id]);
            $cliente['cuentas_completas'] = $stmtC->fetchAll();

            jsonResponse(['success' => true, 'data' => $cliente]);
        } else {
            // Listar todos los clientes
            $search = trim($_GET['search'] ?? '');
            $sql = "
                SELECT cl.*,
                    (SELECT COUNT(*) FROM perfiles pf WHERE pf.cliente_id = cl.id) as total_perfiles,
                    (SELECT COUNT(*) FROM cuentas c WHERE c.cliente_id = cl.id) as total_cuentas_completas
                FROM clientes cl
                WHERE 1=1
            ";
            $params = [];
            if (!empty($search)) {
                $sql .= " AND (cl.nombre LIKE ? OR cl.telefono LIKE ? OR cl.email LIKE ? OR cl.notas LIKE ?)";
                $wildcard = "%$search%";
                $params = [$wildcard, $wildcard, $wildcard, $wildcard];
            }
            $sql .= " ORDER BY cl.id DESC";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $clientes = $stmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $clientes]);
        }
        break;

    case 'POST':
        $data = getRequestData();
        $nombre = trim($data['nombre'] ?? '');
        $telefono = trim($data['telefono'] ?? '');
        $email = trim($data['email'] ?? '');
        $notas = trim($data['notas'] ?? '');
        $estado = in_array($data['estado'] ?? '', ['activo', 'inactivo']) ? $data['estado'] : 'activo';

        if (empty($nombre) || empty($telefono)) {
            jsonError('Nombre y teléfono (WhatsApp) son obligatorios.', 422);
        }

        $stmt = $db->prepare("INSERT INTO clientes (nombre, telefono, email, notas, estado) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$nombre, $telefono, $email, $notas, $estado]);

        jsonResponse([
            'success' => true,
            'message' => 'Cliente registrado exitosamente.',
            'id' => $db->lastInsertId()
        ], 201);
        break;

    case 'PUT':
        if ($id <= 0) jsonError('ID de cliente inválido.', 422);
        $data = getRequestData();

        $stmt = $db->prepare("SELECT * FROM clientes WHERE id = ?");
        $stmt->execute([$id]);
        $cliente = $stmt->fetch();
        if (!$cliente) jsonError('Cliente no encontrado.', 404);

        $nombre = trim($data['nombre'] ?? $cliente['nombre']);
        $telefono = trim($data['telefono'] ?? $cliente['telefono']);
        $email = isset($data['email']) ? trim($data['email']) : $cliente['email'];
        $notas = isset($data['notas']) ? trim($data['notas']) : $cliente['notas'];
        $estado = in_array($data['estado'] ?? '', ['activo', 'inactivo']) ? $data['estado'] : $cliente['estado'];

        $update = $db->prepare("UPDATE clientes SET nombre = ?, telefono = ?, email = ?, notas = ?, estado = ? WHERE id = ?");
        $update->execute([$nombre, $telefono, $email, $notas, $estado, $id]);

        jsonResponse([
            'success' => true,
            'message' => 'Cliente actualizado con éxito.'
        ]);
        break;

    case 'DELETE':
        if ($id <= 0) jsonError('ID de cliente inválido.', 422);

        // Desvincular perfiles asignados a este cliente
        $db->prepare("UPDATE perfiles SET cliente_id = NULL, estado = 'disponible', fecha_inicio = NULL, fecha_vencimiento = NULL WHERE cliente_id = ?")->execute([$id]);
        $db->prepare("UPDATE cuentas SET cliente_id = NULL WHERE cliente_id = ?")->execute([$id]);

        $del = $db->prepare("DELETE FROM clientes WHERE id = ?");
        $del->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Cliente eliminado y sus perfiles asignados han sido liberados.'
        ]);
        break;

    default:
        jsonError('Método no permitido.', 405);
        break;
}
