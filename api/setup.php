<?php
/**
 * Asistente de Verificación y Configuración de Base de Datos
 * StreamManager Pro
 */
header('Content-Type: text/html; charset=utf-8');

$status = [];
$error = null;

try {
    require_once __DIR__ . '/db.php';
    header('Content-Type: text/html; charset=utf-8');
    $db = getDBConnection();
    $status[] = "✔ Conexión exitosa a MySQL (" . DB_HOST . ":" . DB_PORT . " - Base de Datos: " . DB_NAME . ")";

    // Verificar si se solicita reiniciar o instalar
    if (isset($_GET['install']) || isset($_POST['install'])) {
        $sql = file_get_contents(__DIR__ . '/../database.sql');
        if (!$sql) {
            throw new Exception("No se encontró el archivo database.sql");
        }
        $cleanSql = preg_replace('/--.*$/m', '', $sql);
        $queries = array_filter(array_map('trim', explode(';', $cleanSql)));
        foreach ($queries as $q) {
            if (!empty($q)) {
                $db->exec($q);
            }
        }
        $status[] = "✔ Tablas y datos iniciales instalados correctamente desde database.sql.";
    }

    // Verificar conteos
    $tablas = ['administradores', 'plataformas', 'cuentas', 'perfiles', 'clientes', 'historial_renovaciones', 'roles', 'configuracion'];
    foreach ($tablas as $t) {
        try {
            $res = $db->query("SELECT COUNT(*) as c FROM `$t`")->fetch();
            $status[] = "✔ Tabla `{$t}`: {$res['c']} registros encontrados.";
        } catch (Exception $te) {
            $status[] = "⚠ Tabla `{$t}` aún no existe. Importa database.sql en phpMyAdmin.";
        }
    }

} catch (Exception $e) {
    $error = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StreamManager Pro - Asistente de Base de Datos</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #090d16;
            --card: #111827;
            --border: #1f293d;
            --accent: #6366f1;
            --accent-glow: rgba(99, 102, 241, 0.3);
            --text: #f3f4f6;
            --text-dim: #94a3b8;
            --success: #10b981;
            --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .setup-card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            max-width: 600px;
            width: 100%;
            padding: 32px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
        }
        .badge {
            display: inline-block;
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 0.85rem;
            font-weight: 700;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
        }
        h1 { font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
        p { color: var(--text-dim); font-size: 0.95rem; }
        .log-box {
            background: #030712;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin: 20px 0;
            font-family: monospace;
            font-size: 0.88rem;
            line-height: 1.6;
        }
        .log-item {
            color: #34d399;
            margin-bottom: 6px;
        }
        .error-box {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
            padding: 14px;
            border-radius: 10px;
            margin: 20px 0;
            font-size: 0.9rem;
        }
        .actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            flex-wrap: wrap;
        }
        .btn {
            flex: 1;
            padding: 12px 20px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            transition: all 0.2s ease;
            border: none;
        }
        .btn-primary {
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: white;
            box-shadow: 0 4px 15px var(--accent-glow);
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(99,102,241,0.5);
        }
        .btn-secondary {
            background: #1e293b;
            color: #e2e8f0;
            border: 1px solid #334155;
        }
        .btn-secondary:hover {
            background: #334155;
        }
    </style>
</head>
<body>
    <div class="setup-card">
        <div class="header">
            <span class="badge">SISTEMA STREAM MANAGER PRO</span>
            <h1>Verificación de Base de Datos</h1>
            <p>Diagnóstico y estado del motor SQL MySQL / MariaDB en XAMPP</p>
        </div>

        <?php if ($error): ?>
            <div class="error-box">
                <strong> Error detectado:</strong><br>
                <?= htmlspecialchars($error) ?>
            </div>
            <p style="font-size:0.85rem; color:#94a3b8; margin-top:8px;">
                💡 <strong>Solución:</strong> Asegúrate de que el módulo MySQL en el panel de control de XAMPP esté en verde (iniciado).
            </p>
        <?php else: ?>
            <div class="log-box">
                <?php foreach ($status as $s): ?>
                    <div class="log-item"><?= htmlspecialchars($s) ?></div>
                <?php endforeach; ?>
            </div>
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; padding: 14px; font-size: 0.9rem; color: #a7f3d0; margin-bottom: 20px;">
                ✓ ¡Todo listo! La base de datos está operando al 100%. Las credenciales por defecto son:<br>
                <strong>Usuario:</strong> admin@stream.app<br>
                <strong>Contraseña:</strong> admin123
            </div>
        <?php endif; ?>

        <div class="actions">
            <a href="../index.html" class="btn btn-primary">Ir a la Aplicación →</a>
            <a href="setup.php?install=1" class="btn btn-secondary" onclick="return confirm('¿Deseas recargar la estructura inicial de la base de datos?');">Reinstalar / Semillas SQL</a>
        </div>
    </div>
</body>
</html>
