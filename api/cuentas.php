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
            // Obtener cuenta individual con sus perfiles
            $stmt = $db->prepare("
                SELECT c.*, p.nombre as plataforma_nombre, p.codigo as plataforma_codigo, 
                       p.color_hex, p.color_secundario,
                       cl.nombre as cliente_completo_nombre, cl.telefono as cliente_completo_telefono
                FROM cuentas c
                JOIN plataformas p ON c.plataforma_id = p.id
                LEFT JOIN clientes cl ON c.cliente_id = cl.id
                WHERE c.id = ?
            ");
            $stmt->execute([$id]);
            $cuenta = $stmt->fetch();

            if (!$cuenta) {
                jsonError('Cuenta no encontrada.', 404);
            }

            // Obtener perfiles de esta cuenta
            $stmtPerf = $db->prepare("
                SELECT pf.*, cl.nombre as cliente_nombre, cl.telefono as cliente_telefono, cl.email as cliente_email
                FROM perfiles pf
                LEFT JOIN clientes cl ON pf.cliente_id = cl.id
                WHERE pf.cuenta_id = ?
                ORDER BY pf.numero_perfil ASC
            ");
            $stmtPerf->execute([$id]);
            $cuenta['perfiles'] = $stmtPerf->fetchAll();

            jsonResponse(['success' => true, 'data' => $cuenta]);
        } else {
            // Listar cuentas con filtros
            $plataformaId = isset($_GET['plataforma_id']) ? intval($_GET['plataforma_id']) : 0;
            $estado = trim($_GET['estado'] ?? '');
            $tipo = trim($_GET['tipo_cuenta'] ?? '');
            $search = trim($_GET['search'] ?? '');

            $sql = "
                SELECT c.*, p.nombre as plataforma_nombre, p.codigo as plataforma_codigo, 
                       p.color_hex, p.color_secundario,
                       cl.nombre as cliente_completo_nombre, cl.telefono as cliente_completo_telefono,
                       (SELECT COUNT(*) FROM perfiles pf WHERE pf.cuenta_id = c.id) as total_perfiles_creados,
                       (SELECT COUNT(*) FROM perfiles pf WHERE pf.cuenta_id = c.id AND pf.cliente_id IS NOT NULL) as perfiles_ocupados
                FROM cuentas c
                JOIN plataformas p ON c.plataforma_id = p.id
                LEFT JOIN clientes cl ON c.cliente_id = cl.id
                WHERE 1=1
            ";
            $params = [];

            if ($plataformaId > 0) {
                $sql .= " AND c.plataforma_id = ?";
                $params[] = $plataformaId;
            }

            if (!empty($estado) && $estado !== 'todas') {
                $sql .= " AND c.estado = ?";
                $params[] = $estado;
            }

            if (!empty($tipo)) {
                $sql .= " AND c.tipo_cuenta = ?";
                $params[] = $tipo;
            }

            if (!empty($search)) {
                $sql .= " AND (c.correo LIKE ? OR c.proveedor LIKE ? OR cl.nombre LIKE ? OR c.notas LIKE ?)";
                $wildcard = "%$search%";
                $params = array_merge($params, [$wildcard, $wildcard, $wildcard, $wildcard]);
            }

            $sql .= " ORDER BY c.fecha_vencimiento ASC, c.id DESC";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $cuentas = $stmt->fetchAll();

            // Adjuntar perfiles para cada cuenta
            foreach ($cuentas as &$cuenta) {
                $stmtPerf = $db->prepare("
                    SELECT pf.*, cl.nombre as cliente_nombre, cl.telefono as cliente_telefono
                    FROM perfiles pf
                    LEFT JOIN clientes cl ON pf.cliente_id = cl.id
                    WHERE pf.cuenta_id = ?
                    ORDER BY pf.numero_perfil ASC
                ");
                $stmtPerf->execute([$cuenta['id']]);
                $cuenta['perfiles'] = $stmtPerf->fetchAll();
            }

            jsonResponse(['success' => true, 'data' => $cuentas]);
        }
        break;

    case 'POST':
        $data = getRequestData();

        if ($action === 'renovar') {
            // Renovar cuenta por N días
            $dias = isset($data['dias']) ? intval($data['dias']) : 30;
            if ($id <= 0) jsonError('ID de cuenta requerido.', 400);

            $stmt = $db->prepare("SELECT * FROM cuentas WHERE id = ?");
            $stmt->execute([$id]);
            $cuenta = $stmt->fetch();
            if (!$cuenta) jsonError('Cuenta no encontrada.', 404);

            // Calcular nueva fecha: si ya venció, sumar desde hoy; si aún está vigente, sumar a la fecha de vencimiento
            $fechaBase = strtotime($cuenta['fecha_vencimiento']) > time() ? $cuenta['fecha_vencimiento'] : date('Y-m-d');
            $nuevaFecha = date('Y-m-d', strtotime($fechaBase . " + $dias days"));

            $update = $db->prepare("UPDATE cuentas SET fecha_vencimiento = ?, estado = 'activa' WHERE id = ?");
            $update->execute([$nuevaFecha, $id]);

            // Si se solicita, sincronizar también la fecha de vencimiento de sus perfiles
            if (!empty($data['sincronizar_perfiles'])) {
                $db->prepare("UPDATE perfiles SET fecha_vencimiento = ?, estado = CASE WHEN cliente_id IS NOT NULL THEN 'ocupado' ELSE 'disponible' END WHERE cuenta_id = ?")
                   ->execute([$nuevaFecha, $id]);
            }

            // Registrar en historial
            $monto = floatval($data['monto'] ?? $cuenta['costo_compra']);
            $db->prepare("INSERT INTO historial_renovaciones (tipo, cuenta_id, monto, fecha_pago, dias_extendidos, notas) VALUES ('cuenta', ?, ?, CURDATE(), ?, ?)")
               ->execute([$id, $monto, $dias, "Renovación de cuenta {$cuenta['correo']} (+{$dias} días)"]);

            jsonResponse([
                'success' => true,
                'message' => "Cuenta renovada exitosamente hasta el {$nuevaFecha} (+{$dias} días).",
                'nueva_fecha' => $nuevaFecha
            ]);
        }

        // Crear nueva cuenta
        $plataformaId = intval($data['plataforma_id'] ?? 0);
        $correo = trim($data['correo'] ?? '');
        $password = trim($data['password'] ?? '');
        $pinMaestro = trim($data['pin_maestro'] ?? '');
        $tipoCuenta = in_array($data['tipo_cuenta'] ?? '', ['por_perfil', 'cuenta_completa']) ? $data['tipo_cuenta'] : 'por_perfil';
        $clienteId = !empty($data['cliente_id']) ? intval($data['cliente_id']) : null;
        $proveedor = trim($data['proveedor'] ?? '');
        $costoCompra = floatval($data['costo_compra'] ?? 0);
        $precioVenta = floatval($data['precio_venta'] ?? 0);
        $fechaInicio = !empty($data['fecha_inicio']) ? $data['fecha_inicio'] : date('Y-m-d');
        $fechaVencimiento = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : date('Y-m-d', strtotime('+30 days'));
        $maxPerfiles = intval($data['max_perfiles'] ?? 5);
        $notas = trim($data['notas'] ?? '');

        if ($plataformaId <= 0 || empty($correo) || empty($password)) {
            jsonError('Debes seleccionar la plataforma, ingresar usuario o correo y contraseña de la cuenta.', 422);
        }

        if ($maxPerfiles < 1) $maxPerfiles = 5;

        // Determinar estado inicial
        $estado = 'activa';
        $diasDiff = (strtotime($fechaVencimiento) - strtotime(date('Y-m-d'))) / 86400;
        if ($diasDiff < 0) $estado = 'vencida';
        elseif ($diasDiff <= 3) $estado = 'por_vencer';

        $stmt = $db->prepare("
            INSERT INTO cuentas (plataforma_id, correo, password, pin_maestro, tipo_cuenta, cliente_id, proveedor, costo_compra, precio_venta, fecha_inicio, fecha_vencimiento, max_perfiles, estado, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $plataformaId, $correo, $password, $pinMaestro, $tipoCuenta, $clienteId,
            $proveedor, $costoCompra, $precioVenta, $fechaInicio, $fechaVencimiento,
            $maxPerfiles, $estado, $notas
        ]);
        $newCuentaId = $db->lastInsertId();

        // Si es por perfiles, auto-generar los slots de perfiles
        if ($tipoCuenta === 'por_perfil') {
            $insertPerf = $db->prepare("
                INSERT INTO perfiles (cuenta_id, numero_perfil, nombre_perfil, pin_perfil, estado, precio_mensual)
                VALUES (?, ?, ?, ?, 'disponible', ?)
            ");
            // Obtener precio sugerido de la plataforma
            $platStmt = $db->prepare("SELECT precio_sugerido FROM plataformas WHERE id = ?");
            $platStmt->execute([$plataformaId]);
            $platData = $platStmt->fetch();
            $precioPerfil = $platData ? floatval($platData['precio_sugerido']) : 0.00;

            for ($i = 1; $i <= $maxPerfiles; $i++) {
                $nombrePerfil = "Perfil $i";
                $insertPerf->execute([$newCuentaId, $i, $nombrePerfil, '0000', $precioPerfil]);
            }
        }

        jsonResponse([
            'success' => true,
            'message' => 'Cuenta registrada exitosamente con sus perfiles configurados.',
            'id' => $newCuentaId
        ], 201);
        break;

    case 'PUT':
        if ($id <= 0) jsonError('ID de cuenta requerido para actualizar.', 400);
        $data = getRequestData();

        $stmt = $db->prepare("SELECT * FROM cuentas WHERE id = ?");
        $stmt->execute([$id]);
        $cuenta = $stmt->fetch();
        if (!$cuenta) jsonError('Cuenta no encontrada.', 404);

        $plataformaId = intval($data['plataforma_id'] ?? $cuenta['plataforma_id']);
        $correo = trim($data['correo'] ?? $cuenta['correo']);
        $password = trim($data['password'] ?? $cuenta['password']);
        $pinMaestro = isset($data['pin_maestro']) ? trim($data['pin_maestro']) : $cuenta['pin_maestro'];
        $tipoCuenta = in_array($data['tipo_cuenta'] ?? '', ['por_perfil', 'cuenta_completa']) ? $data['tipo_cuenta'] : $cuenta['tipo_cuenta'];
        $clienteId = isset($data['cliente_id']) ? (!empty($data['cliente_id']) ? intval($data['cliente_id']) : null) : $cuenta['cliente_id'];
        $proveedor = isset($data['proveedor']) ? trim($data['proveedor']) : $cuenta['proveedor'];
        $costoCompra = isset($data['costo_compra']) ? floatval($data['costo_compra']) : $cuenta['costo_compra'];
        $precioVenta = isset($data['precio_venta']) ? floatval($data['precio_venta']) : $cuenta['precio_venta'];
        $fechaInicio = !empty($data['fecha_inicio']) ? $data['fecha_inicio'] : $cuenta['fecha_inicio'];
        $fechaVencimiento = !empty($data['fecha_vencimiento']) ? $data['fecha_vencimiento'] : $cuenta['fecha_vencimiento'];
        $notas = isset($data['notas']) ? trim($data['notas']) : $cuenta['notas'];
        $estado = isset($data['estado']) ? trim($data['estado']) : $cuenta['estado'];

        $update = $db->prepare("
            UPDATE cuentas SET 
                plataforma_id = ?, correo = ?, password = ?, pin_maestro = ?, 
                tipo_cuenta = ?, cliente_id = ?, proveedor = ?, costo_compra = ?, 
                precio_venta = ?, fecha_inicio = ?, fecha_vencimiento = ?, 
                estado = ?, notas = ?
            WHERE id = ?
        ");
        $update->execute([
            $plataformaId, $correo, $password, $pinMaestro,
            $tipoCuenta, $clienteId, $proveedor, $costoCompra,
            $precioVenta, $fechaInicio, $fechaVencimiento,
            $estado, $notas, $id
        ]);

        jsonResponse([
            'success' => true,
            'message' => 'Cuenta actualizada correctamente.'
        ]);
        break;

    case 'DELETE':
        if ($id <= 0) jsonError('ID de cuenta requerido para eliminar.', 400);

        // Perfiles se eliminan en cascada por foreign key
        $del = $db->prepare("DELETE FROM cuentas WHERE id = ?");
        $del->execute([$id]);

        jsonResponse([
            'success' => true,
            'message' => 'Cuenta eliminada exitosamente junto con sus perfiles.'
        ]);
        break;

    default:
        jsonError('Método HTTP no soportado.', 405);
        break;
}
