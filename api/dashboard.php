<?php
require_once __DIR__ . '/db.php';

requireAuth();
$db = getDBConnection();

// Sincronizar estados antes de calcular métricas
syncExpirationStates($db);

// 1. Estadísticas de Cuentas
$cuentasStats = $db->query("
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'activa' THEN 1 ELSE 0 END) as activas,
        SUM(CASE WHEN estado = 'por_vencer' THEN 1 ELSE 0 END) as por_vencer,
        SUM(CASE WHEN estado = 'vencida' THEN 1 ELSE 0 END) as vencidas,
        SUM(costo_compra) as total_costo
    FROM cuentas
")->fetch();

// 2. Estadísticas de Perfiles
$perfilesStats = $db->query("
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'disponible' THEN 1 ELSE 0 END) as disponibles,
        SUM(CASE WHEN estado = 'ocupado' THEN 1 ELSE 0 END) as ocupados,
        SUM(CASE WHEN estado = 'por_vencer' THEN 1 ELSE 0 END) as por_vencer,
        SUM(CASE WHEN estado = 'vencido' THEN 1 ELSE 0 END) as vencidos,
        SUM(CASE WHEN cliente_id IS NOT NULL THEN precio_mensual ELSE 0 END) as total_ingreso_perfiles
    FROM perfiles
")->fetch();

// 3. Ingresos de Cuentas Completas
$cuentasCompletasIngreso = $db->query("
    SELECT COALESCE(SUM(precio_venta), 0) as total_ingreso_cuentas
    FROM cuentas
    WHERE tipo_cuenta = 'cuenta_completa' AND estado != 'suspendida'
")->fetch();

// 4. Total Clientes
$clientesStats = $db->query("
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) as activos
    FROM clientes
")->fetch();

// 5. Cuentas y perfiles con vencimiento próximo o vencidos (Alertas prioritarias)
$alertasCuentas = $db->query("
    SELECT 
        c.id, c.correo, c.tipo_cuenta, c.fecha_vencimiento, c.estado,
        p.nombre as plataforma_nombre, p.color_hex, p.codigo as plataforma_codigo,
        DATEDIFF(c.fecha_vencimiento, CURDATE()) as dias_restantes
    FROM cuentas c
    JOIN plataformas p ON c.plataforma_id = p.id
    WHERE c.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 4 DAY)
    ORDER BY c.fecha_vencimiento ASC
    LIMIT 10
")->fetchAll();

$alertasPerfiles = $db->query("
    SELECT 
        pf.id, pf.nombre_perfil, pf.pin_perfil, pf.precio_mensual, pf.fecha_vencimiento, pf.estado,
        c.correo as cuenta_correo,
        cl.nombre as cliente_nombre, cl.telefono as cliente_telefono,
        p.nombre as plataforma_nombre, p.color_hex, p.codigo as plataforma_codigo,
        DATEDIFF(pf.fecha_vencimiento, CURDATE()) as dias_restantes
    FROM perfiles pf
    JOIN cuentas c ON pf.cuenta_id = c.id
    JOIN plataformas p ON c.plataforma_id = p.id
    LEFT JOIN clientes cl ON pf.cliente_id = cl.id
    WHERE pf.cliente_id IS NOT NULL 
      AND pf.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 4 DAY)
    ORDER BY pf.fecha_vencimiento ASC
    LIMIT 15
")->fetchAll();

// 6. Distribución por Plataformas
$plataformasDist = $db->query("
    SELECT 
        p.id, p.nombre, p.codigo, p.color_hex,
        COUNT(DISTINCT c.id) as total_cuentas,
        COUNT(DISTINCT pf.id) as total_perfiles,
        SUM(CASE WHEN pf.cliente_id IS NOT NULL THEN 1 ELSE 0 END) as perfiles_ocupados
    FROM plataformas p
    LEFT JOIN cuentas c ON p.id = c.plataforma_id
    LEFT JOIN perfiles pf ON c.id = pf.cuenta_id
    GROUP BY p.id
    ORDER BY total_cuentas DESC, p.id ASC
")->fetchAll();

$ingresosTotales = floatval($perfilesStats['total_ingreso_perfiles'] ?? 0) + floatval($cuentasCompletasIngreso['total_ingreso_cuentas'] ?? 0);
$costosTotales = floatval($cuentasStats['total_costo'] ?? 0);
$gananciaNeta = $ingresosTotales - $costosTotales;

jsonResponse([
    'success' => true,
    'data' => [
        'cuentas' => [
            'total'      => intval($cuentasStats['total'] ?? 0),
            'activas'    => intval($cuentasStats['activas'] ?? 0),
            'por_vencer' => intval($cuentasStats['por_vencer'] ?? 0),
            'vencidas'   => intval($cuentasStats['vencidas'] ?? 0),
        ],
        'perfiles' => [
            'total'       => intval($perfilesStats['total'] ?? 0),
            'disponibles' => intval($perfilesStats['disponibles'] ?? 0),
            'ocupados'    => intval($perfilesStats['ocupados'] ?? 0),
            'por_vencer'  => intval($perfilesStats['por_vencer'] ?? 0),
            'vencidos'    => intval($perfilesStats['vencidos'] ?? 0),
        ],
        'clientes' => [
            'total'   => intval($clientesStats['total'] ?? 0),
            'activos' => intval($clientesStats['activos'] ?? 0),
        ],
        'finanzas' => [
            'ingresos' => round($ingresosTotales, 2),
            'costos'   => round($costosTotales, 2),
            'ganancia' => round($gananciaNeta, 2),
        ],
        'alertas' => [
            'cuentas'  => $alertasCuentas,
            'perfiles' => $alertasPerfiles,
            'total_alertas' => count($alertasCuentas) + count($alertasPerfiles)
        ],
        'plataformas' => $plataformasDist
    ]
]);
