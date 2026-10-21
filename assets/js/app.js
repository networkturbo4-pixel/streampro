/**
 * Aplicación Principal - StreamManager Pro
 * Maneja estado reactivo, renderizado de vistas, filtros, modales y acciones rápidas.
 */

const App = {
    state: {
        currentView: 'dashboard',
        plataformas: [],
        cuentas: [],
        perfiles: [],
        selectedPerfiles: new Set(),
        clientes: [],
        dashboard: null,
        users: [],
        roles: [],
        settings: {},
        configTab: 'usuarios',
        otaStatus: null,
        filtros: {
            plataforma_id: 0,
            estado: 'todas',
            search: ''
        }
    },

    async init() {
        this.setupNavigation();
        this.setupEventListeners();

        // Verificar sesión y cargar datos iniciales
        const isAuth = await Auth.checkSession();
        if (isAuth) {
            this.applyUIPermissions();
            await this.loadAllData();
        }

        // Verificar si se abrió mediante un acceso directo PWA o hash
        const initialHash = window.location.hash.replace('#', '');
        const validViews = ['dashboard', 'cuentas', 'perfiles', 'clientes', 'plataformas', 'alertas', 'configuracion'];
        if (initialHash && validViews.includes(initialHash)) {
            if (this.can(initialHash, 'ver')) {
                this.switchView(initialHash);
            }
        }

        window.addEventListener('hashchange', () => {
            const h = window.location.hash.replace('#', '');
            if (h && validViews.includes(h) && h !== this.state.currentView) {
                if (this.can(h, 'ver')) {
                    this.switchView(h);
                }
            }
        });
    },

    setupNavigation() {
        // Enlaces de navegación desktop
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.switchView(view);
            });
        });

        // Enlaces de navegación mobile
        const mobileLinks = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item[data-view]');
        mobileLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.switchView(view);
            });
        });
    },

    setupEventListeners() {
        // Buscador global
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            let timeout = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.state.filtros.search = e.target.value.trim();
                    this.renderCurrentView();
                }, 250);
            });
        }

        // Filtro por estado
        const statusFilter = document.getElementById('filter-status');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.state.filtros.estado = e.target.value;
                this.renderCurrentView();
            });
        }

        // Botón "+ Nueva Cuenta"
        const btnNewAccount = document.getElementById('btn-new-account');
        if (btnNewAccount) {
            btnNewAccount.addEventListener('click', () => this.openAccountModal());
        }

        // Botón "+ Nuevo Cliente"
        const btnNewClient = document.getElementById('btn-new-client');
        if (btnNewClient) {
            btnNewClient.addEventListener('click', () => this.openClientModal());
        }

        // Cerrar modales con botones de cerrar o backdrop
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal-overlay');
                if (modal) this.closeModal(modal.id);
            });
        });

        // Formularios
        const formCuenta = document.getElementById('form-cuenta');
        if (formCuenta) {
            formCuenta.addEventListener('submit', (e) => this.handleSaveAccount(e));
        }

        const formPerfil = document.getElementById('form-asignar-perfil');
        if (formPerfil) {
            formPerfil.addEventListener('submit', (e) => this.handleSaveAssignProfile(e));
        }

        // Listener para cambio en el selector de cliente en el modal de asignación
        const assignClienteSelect = document.getElementById('assign-cliente-id');
        if (assignClienteSelect) {
            assignClienteSelect.addEventListener('change', (e) => {
                const quickFields = document.getElementById('new-client-quick-fields');
                const isNew = e.target.value === 'new';
                if (quickFields) {
                    quickFields.style.display = isNew ? 'flex' : 'none';
                }
                const newCliNombre = document.getElementById('new-cli-nombre');
                const newCliTel = document.getElementById('new-cli-telefono');
                if (newCliNombre) {
                    newCliNombre.required = isNew;
                    if (isNew) setTimeout(() => newCliNombre.focus(), 60);
                }
                if (newCliTel) {
                    newCliTel.required = isNew;
                }
            });
        }

        // Detectores de fechas en asignación de perfil para alerta en tiempo real
        const assignFechaInicio = document.getElementById('assign-fecha-inicio');
        if (assignFechaInicio) {
            assignFechaInicio.addEventListener('change', () => this.checkAssignConflict());
        }
        const assignFechaVenc = document.getElementById('assign-fecha-venc');
        if (assignFechaVenc) {
            assignFechaVenc.addEventListener('input', () => this.checkAssignConflict());
            assignFechaVenc.addEventListener('change', () => this.checkAssignConflict());
        }

        const formCliente = document.getElementById('form-cliente');
        if (formCliente) {
            formCliente.addEventListener('submit', (e) => this.handleSaveClient(e));
        }

        // Toggle para tipo de cuenta en modal cuenta
        const selectTipoCuenta = document.getElementById('cuenta-tipo');
        if (selectTipoCuenta) {
            selectTipoCuenta.addEventListener('change', (e) => {
                const isCompleta = e.target.value === 'cuenta_completa';
                const clientGroup = document.getElementById('group-cliente-cuenta');
                const perfilesGroup = document.getElementById('group-max-perfiles');
                if (clientGroup) clientGroup.style.display = isCompleta ? 'block' : 'none';
                if (perfilesGroup) perfilesGroup.style.display = isCompleta ? 'none' : 'block';
            });
        }

        // Botón "+ Nueva Plataforma"
        const btnNewPlatform = document.getElementById('btn-new-platform');
        if (btnNewPlatform) {
            btnNewPlatform.addEventListener('click', () => this.openPlatformModal());
        }

        // Formulario Plataforma
        const formPlataforma = document.getElementById('form-plataforma');
        if (formPlataforma) {
            formPlataforma.addEventListener('submit', (e) => this.handleSavePlatform(e));
        }

        // Sincronizar Color Picker y campo de texto
        const colorPicker = document.getElementById('plataforma-color-picker');
        const colorInput = document.getElementById('plataforma-color');
        if (colorPicker && colorInput) {
            colorPicker.addEventListener('input', (e) => {
                colorInput.value = e.target.value;
            });
            colorInput.addEventListener('input', (e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    colorPicker.value = e.target.value;
                }
            });
        }

        // =========================================================
        // ACCIONES MASIVAS Y CHECKBOXES (PERFILES / PANTALLAS)
        // =========================================================
        const checkAllPerfiles = document.getElementById('check-all-perfiles');
        if (checkAllPerfiles) {
            checkAllPerfiles.addEventListener('change', (e) => {
                this.toggleSelectAllPerfiles(e.target.checked);
            });
        }

        const btnBulkEdit = document.getElementById('btn-bulk-edit');
        if (btnBulkEdit) {
            btnBulkEdit.addEventListener('click', () => this.openBulkEditPerfilesModal());
        }

        const btnBulkArchive = document.getElementById('btn-bulk-archive');
        if (btnBulkArchive) {
            btnBulkArchive.addEventListener('click', () => this.handleBulkArchivePerfiles());
        }

        const btnBulkDelete = document.getElementById('btn-bulk-delete');
        if (btnBulkDelete) {
            btnBulkDelete.addEventListener('click', () => this.handleBulkDeletePerfiles());
        }

        const btnBulkDeselect = document.getElementById('btn-bulk-deselect');
        if (btnBulkDeselect) {
            btnBulkDeselect.addEventListener('click', () => this.clearSelectedPerfiles());
        }

        // Toggles y campos en modal de edición masiva
        ['precio', 'pin', 'dispositivo', 'venc', 'notas'].forEach(field => {
            const chk = document.getElementById(`bulk-chk-${field}`);
            const grp = document.getElementById(`bulk-group-${field}`);
            if (chk && grp) {
                chk.addEventListener('change', () => {
                    grp.style.display = chk.checked ? 'block' : 'none';
                    const card = chk.closest('.bulk-field-card');
                    if (card) card.classList.toggle('active', chk.checked);
                });
            }
        });

        // Radios de modo de vencimiento
        document.querySelectorAll('input[name="bulk_venc_mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isDias = e.target.value === 'dias';
                const boxDias = document.getElementById('bulk-box-dias');
                const boxFecha = document.getElementById('bulk-box-fecha');
                if (boxDias) boxDias.style.display = isDias ? 'block' : 'none';
                if (boxFecha) boxFecha.style.display = isDias ? 'none' : 'block';
            });
        });

        // Formulario de edición masiva
        const formBulkEdit = document.getElementById('form-bulk-edit-perfiles');
        if (formBulkEdit) {
            formBulkEdit.addEventListener('submit', (e) => this.handleSaveBulkEditPerfiles(e));
        }

        // =========================================================
        // MÓDULO CONFIGURACIÓN, USUARIOS, ROLES Y GITHUB OTA
        // =========================================================
        // Pestañas de configuración
        document.querySelectorAll('.config-tab-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = btn.getAttribute('data-tab');
                this.switchConfigTab(tab);
            });
        });

        // Buscador de usuarios en tiempo real
        const searchUsers = document.getElementById('search-users-input');
        if (searchUsers) {
            searchUsers.addEventListener('input', () => {
                this.renderUsersList();
            });
        }

        // Botón "+ Nuevo Usuario"
        const btnNewUser = document.getElementById('btn-new-user');
        if (btnNewUser) {
            btnNewUser.addEventListener('click', () => this.openUserModal());
        }

        // Botón "+ Nuevo Rol"
        const btnNewRole = document.getElementById('btn-new-role');
        if (btnNewRole) {
            btnNewRole.addEventListener('click', () => this.openRoleModal());
        }

        // Formularios de usuarios y roles
        const formUsuario = document.getElementById('form-usuario');
        if (formUsuario) {
            formUsuario.addEventListener('submit', (e) => this.handleSaveUser(e));
        }

        const formRol = document.getElementById('form-rol');
        if (formRol) {
            formRol.addEventListener('submit', (e) => this.handleSaveRole(e));
        }

        // Controles masivos de matriz de permisos
        const btnCheckAllPerms = document.getElementById('btn-perm-check-all');
        if (btnCheckAllPerms) {
            btnCheckAllPerms.addEventListener('click', () => {
                document.querySelectorAll('#modal-rol input[type="checkbox"]').forEach(cb => cb.checked = true);
            });
        }

        const btnUncheckAllPerms = document.getElementById('btn-perm-uncheck-all');
        if (btnUncheckAllPerms) {
            btnUncheckAllPerms.addEventListener('click', () => {
                document.querySelectorAll('#modal-rol input[type="checkbox"]').forEach(cb => cb.checked = false);
            });
        }

        // Formulario de parámetros generales
        const formSystemSettings = document.getElementById('form-system-settings');
        if (formSystemSettings) {
            formSystemSettings.addEventListener('submit', (e) => this.handleSaveSettings(e));
        }

        // Acciones GitHub OTA
        const btnCheckGithub = document.getElementById('btn-check-github');
        if (btnCheckGithub) {
            btnCheckGithub.addEventListener('click', () => this.checkGitHubUpdate());
        }

        const btnApplyGithub = document.getElementById('btn-apply-github');
        if (btnApplyGithub) {
            btnApplyGithub.addEventListener('click', () => this.applyGitHubUpdate());
        }

        const btnClearOtaLogs = document.getElementById('btn-clear-ota-logs');
        if (btnClearOtaLogs) {
            btnClearOtaLogs.addEventListener('click', () => {
                const logsBody = document.getElementById('ota-console-logs');
                if (logsBody) {
                    logsBody.innerHTML = '<div class="log-line text-muted">[Consola reiniciada] Presiona "Comprobar Actualizaciones" o "Instalar" para iniciar.</div>';
                }
            });
        }
    },

    switchView(viewName) {
        if (!this.can(viewName, 'ver')) {
            API.showToast(`No tienes permisos de acceso para la sección: ${viewName}`, 'warning');
            return;
        }

        this.state.currentView = viewName;

        // Actualizar sidebar activo
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-view') === viewName);
        });

        // Actualizar mobile nav activo
        document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-view') === viewName);
        });

        // Ocultar todas las secciones y mostrar la activa
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
        const activeSec = document.getElementById(`view-${viewName}`);
        if (activeSec) {
            activeSec.classList.remove('hidden');
        }

        // Ocultar buscador global y filtros de plataformas en vista de Configuración
        const toolbar = document.querySelector('.toolbar-bar');
        const platFilters = document.getElementById('platform-filters');
        if (toolbar) toolbar.style.display = (viewName === 'configuracion') ? 'none' : '';
        if (platFilters) platFilters.style.display = (viewName === 'configuracion') ? 'none' : '';

        // Título de la página
        const titles = {
            dashboard: 'Resumen General',
            cuentas: 'Cuentas de Streaming',
            perfiles: 'Perfiles y Pantallas',
            clientes: 'Directorio de Clientes',
            plataformas: 'Catálogo de Plataformas',
            alertas: 'Alertas y Vencimientos',
            configuracion: 'Configuración del Sistema'
        };
        const titleEl = document.getElementById('top-page-title');
        if (titleEl) titleEl.textContent = titles[viewName] || 'StreamManager Pro';

        if (window.location.hash !== '#' + viewName && history.replaceState) {
            history.replaceState(null, null, '#' + viewName);
        }

        this.renderCurrentView();
        this.updateBulkPerfilesBar();
    },

    async loadAllData() {
        try {
            const [platRes, dashRes, cuentasRes, perfilesRes, clientesRes] = await Promise.all([
                API.get('plataformas.php'),
                API.get('dashboard.php'),
                API.get('cuentas.php'),
                API.get('perfiles.php'),
                API.get('clientes.php')
            ]);

            if (platRes.success) this.state.plataformas = platRes.data || [];
            if (dashRes.success) this.state.dashboard = dashRes.data || null;
            if (cuentasRes.success) this.state.cuentas = cuentasRes.data || [];
            if (perfilesRes.success) this.state.perfiles = perfilesRes.data || [];
            if (clientesRes.success) this.state.clientes = clientesRes.data || [];

            // Guardar copia local en caché para soporte offline
            try {
                localStorage.setItem('stream_cache_data', JSON.stringify({
                    plataformas: this.state.plataformas,
                    dashboard: this.state.dashboard,
                    cuentas: this.state.cuentas,
                    perfiles: this.state.perfiles,
                    clientes: this.state.clientes,
                    timestamp: Date.now()
                }));
            } catch (e) {}

            this.applyUIPermissions();
            this.renderPlatformFilterBar();
            this.renderCurrentView();
            this.updateBadgeCounters();
        } catch (error) {
            console.error('Error cargando datos:', error);
            const localCache = localStorage.getItem('stream_cache_data');
            if (localCache) {
                try {
                    const parsed = JSON.parse(localCache);
                    this.state.plataformas = parsed.plataformas || [];
                    this.state.dashboard = parsed.dashboard || null;
                    this.state.cuentas = parsed.cuentas || [];
                    this.state.perfiles = parsed.perfiles || [];
                    this.state.clientes = parsed.clientes || [];
                    this.applyUIPermissions();
                    this.renderPlatformFilterBar();
                    this.renderCurrentView();
                    this.updateBadgeCounters();
                    if (!navigator.onLine) {
                        API.showToast('Cargados datos locales guardados (Modo Offline)', 'info');
                        return;
                    }
                } catch (e) {}
            }
            if (navigator.onLine) {
                API.showToast('Error cargando información del sistema', 'error');
            }
        }
    },

    updateBadgeCounters() {
        const totalAlerts = this.state.dashboard?.alertas?.total_alertas || 0;
        document.querySelectorAll('.alert-badge-count').forEach(el => {
            el.textContent = totalAlerts;
            el.style.display = totalAlerts > 0 ? 'inline-block' : 'none';
        });
    },

    renderPlatformFilterBar() {
        const bar = document.getElementById('platform-filters');
        if (!bar) return;

        let html = `
            <div class="platform-pill ${this.state.filtros.plataforma_id === 0 ? 'active' : ''}" data-plat="0">
                <span class="dot" style="background:#6366f1;"></span>
                <span>Todas</span>
            </div>
        `;

        this.state.plataformas.forEach(p => {
            const isActive = this.state.filtros.plataforma_id === parseInt(p.id);
            html += `
                <div class="platform-pill ${isActive ? 'active' : ''}" data-plat="${p.id}">
                    <span class="dot" style="background:${p.color_hex};"></span>
                    <span>${p.nombre.split(' ')[0]}</span>
                </div>
            `;
        });

        bar.innerHTML = html;

        bar.querySelectorAll('.platform-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const platId = parseInt(pill.getAttribute('data-plat'));
                this.state.filtros.plataforma_id = platId;
                this.renderPlatformFilterBar();
                this.renderCurrentView();
            });
        });
    },

    renderCurrentView() {
        switch (this.state.currentView) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'cuentas':
                this.renderCuentas();
                break;
            case 'perfiles':
                this.renderPerfiles();
                break;
            case 'clientes':
                this.renderClientes();
                break;
            case 'plataformas':
                this.renderPlataformas();
                break;
            case 'alertas':
                this.renderAlertas();
                break;
            case 'configuracion':
                this.renderConfiguracion();
                break;
        }
    },

    // -------------------------------------------------------------
    // RENDER: DASHBOARD
    // -------------------------------------------------------------
    renderDashboard() {
        const d = this.state.dashboard;
        if (!d) return;

        // Estadísticas Cuentas
        const elCuentas = document.getElementById('dash-cuentas-total');
        if (elCuentas) elCuentas.textContent = d.cuentas.total;
        const elCuentasSub = document.getElementById('dash-cuentas-sub');
        if (elCuentasSub) elCuentasSub.textContent = `${d.cuentas.activas} activas | ${d.cuentas.por_vencer} por vencer`;

        // Estadísticas Perfiles
        const elPerfiles = document.getElementById('dash-perfiles-total');
        if (elPerfiles) elPerfiles.textContent = `${d.perfiles.ocupados} / ${d.perfiles.total}`;
        const elPerfilesSub = document.getElementById('dash-perfiles-sub');
        if (elPerfilesSub) elPerfilesSub.textContent = `${d.perfiles.disponibles} libres para vender`;
        const elPerfilesBar = document.getElementById('dash-perfiles-bar');
        if (elPerfilesBar) {
            const pct = d.perfiles.total > 0 ? (d.perfiles.ocupados / d.perfiles.total) * 100 : 0;
            elPerfilesBar.style.width = `${pct}%`;
            elPerfilesBar.style.backgroundColor = pct > 80 ? '#10b981' : '#6366f1';
        }

        // Finanzas
        const elGanancia = document.getElementById('dash-ganancia-total');
        if (elGanancia) elGanancia.textContent = `S/ ${d.finanzas.ganancia.toFixed(2)}`;
        const elFinanzasSub = document.getElementById('dash-finanzas-sub');
        if (elFinanzasSub) elFinanzasSub.textContent = `Ingresos: S/ ${d.finanzas.ingresos.toFixed(2)} | Costo: S/ ${d.finanzas.costos.toFixed(2)}`;

        // Alertas
        const elAlertas = document.getElementById('dash-alertas-total');
        if (elAlertas) elAlertas.textContent = d.alertas.total_alertas;

        // Render Grilla Plataformas en Dashboard
        const platGrid = document.getElementById('dash-plataformas-grid');
        if (platGrid && d.plataformas) {
            platGrid.innerHTML = d.plataformas.map(p => `
                <div class="stat-card" style="border-top: 3px solid ${p.color_hex};">
                    <div class="stat-card-top">
                        <span style="font-weight: 800; color: #fff; font-size: 0.95rem;">${p.nombre}</span>
                        <span class="stat-card-tag" style="background: ${p.color_hex}22; color: ${p.color_hex};">
                            ${p.total_cuentas} cuentas
                        </span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <div style="font-size: 1.4rem; font-weight: 800; color: #fff;">${p.perfiles_ocupados || 0} <span style="font-size:0.85rem; color:var(--text-muted);">/ ${p.total_perfiles || 0} perfiles</span></div>
                            <div style="font-size: 0.78rem; color: var(--text-secondary);">Pantallas ocupadas</div>
                        </div>
                        <button class="btn-card-act" style="flex:unset; padding: 6px 12px;" onclick="App.filterByPlatformAndGo(${p.id})">
                            Ver
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Render Alertas Urgentes en Dashboard
        const alertList = document.getElementById('dash-urgent-alerts');
        if (alertList) {
            const cuentasAlert = d.alertas?.cuentas || [];
            const perfilesAlert = d.alertas?.perfiles || [];
            const allAlerts = [...cuentasAlert.map(c => ({ ...c, _isCuenta: true })), ...perfilesAlert.map(p => ({ ...p, _isPerfil: true }))];

            if (allAlerts.length === 0) {
                alertList.innerHTML = `
                    <div style="text-align: center; padding: 26px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color); width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">
                        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#10b981" stroke-width="2" style="margin-bottom:8px;"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                        <div style="font-weight: 700; color:#fff; font-size:1rem;">¡Todo al día!</div>
                        <div style="font-size: 0.82rem; margin-top:4px;">No hay cuentas ni perfiles próximos a vencer en los siguientes 4 días.</div>
                    </div>
                `;
            } else {
                alertList.innerHTML = allAlerts.slice(0, 5).map(item => this.buildAlertCardHTML(item)).join('');
            }
        }
    },

    filterByPlatformAndGo(platId) {
        this.state.filtros.plataforma_id = platId;
        this.renderPlatformFilterBar();
        this.switchView('cuentas');
    },

    // -------------------------------------------------------------
    // RENDER: CUENTAS
    // -------------------------------------------------------------
    renderCuentas() {
        const container = document.getElementById('cuentas-list-container');
        if (!container) return;

        let filtered = this.state.cuentas.filter(c => {
            if (this.state.filtros.plataforma_id > 0 && parseInt(c.plataforma_id) !== this.state.filtros.plataforma_id) return false;
            if (this.state.filtros.estado !== 'todas' && c.estado !== this.state.filtros.estado) return false;
            if (this.state.filtros.search) {
                const s = this.state.filtros.search.toLowerCase();
                const matchCorreo = c.correo?.toLowerCase().includes(s);
                const matchPlat = c.plataforma_nombre?.toLowerCase().includes(s);
                const matchClient = c.cliente_completo_nombre?.toLowerCase().includes(s);
                const matchProfiles = c.perfiles?.some(pf => pf.cliente_nombre?.toLowerCase().includes(s) || pf.nombre_perfil?.toLowerCase().includes(s));
                if (!matchCorreo && !matchPlat && !matchClient && !matchProfiles) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.5;"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                    <p style="font-weight:700; color:#fff; font-size:1.05rem;">No se encontraron cuentas de streaming</p>
                    <p style="font-size:0.85rem; margin-top:4px;">Prueba ajustando los filtros o registra una nueva cuenta.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(c => this.buildAccountCardHTML(c)).join('');
    },

    getDeviceBadgeHTML(device) {
        const dev = (device || 'tv').toLowerCase();
        switch (dev) {
            case 'android':
                return `
                    <span class="slot-device-tag android" title="Dispositivo: Móvil Android">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        <span>Android</span>
                    </span>
                `;
            case 'iphone':
                return `
                    <span class="slot-device-tag iphone" title="Dispositivo: iPhone / iPad">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="4" ry="4"/><circle cx="12" cy="18" r="1"/></svg>
                        <span>iPhone/iPad</span>
                    </span>
                `;
            case 'pc':
                return `
                    <span class="slot-device-tag pc" title="Dispositivo: PC / Laptop">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        <span>PC / Laptop</span>
                    </span>
                `;
            case 'tv':
            default:
                return `
                    <span class="slot-device-tag tv" title="Dispositivo: Smart TV / TV Box">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                        <span>Smart TV</span>
                    </span>
                `;
        }
    },

    getDeviceLabel(device) {
        const dev = (device || 'tv').toLowerCase();
        switch (dev) {
            case 'android': return 'Móvil / Tablet Android';
            case 'iphone': return 'iPhone / iPad (iOS)';
            case 'pc': return 'PC / Laptop (Navegador Web)';
            case 'tv':
            default: return 'Smart TV / TV Box / Firestick';
        }
    },

    selectDeviceType(type) {
        const input = document.getElementById('assign-dispositivo');
        if (input) input.value = type;

        document.querySelectorAll('.device-card').forEach(card => {
            if (card.getAttribute('data-device') === type) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    },

    buildAccountCardHTML(c) {
        const isCompleta = c.tipo_cuenta === 'cuenta_completa';
        const perfiles = c.perfiles || [];
        const totalSlots = perfiles.length;
        const occupiedSlots = perfiles.filter(p => p.cliente_id).length;
        const availableSlots = totalSlots - occupiedSlots;

        // Calcular días restantes de forma segura para zona horaria local
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const parts = c.fecha_vencimiento ? c.fecha_vencimiento.split('-') : ['2026', '12', '31'];
        const vencDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const diffTime = vencDate - today;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let daysTagClass = 'good';
        let daysText = `${diffDays}d restantes`;
        if (diffDays < 0) {
            daysTagClass = 'urgent';
            daysText = `Venció hace ${Math.abs(diffDays)}d`;
        } else if (diffDays <= 3) {
            daysTagClass = 'warning';
            daysText = `¡Vence en ${diffDays}d!`;
        }

        // Indicador visual de slots (puntitos de capacidad interactivos estilo app)
        const dotsHTML = perfiles.map(p => {
            const isOcc = !!p.cliente_id;
            return `<span class="profile-dot ${isOcc ? 'occupied' : 'empty'}" title="${p.nombre_perfil}: ${isOcc ? (p.cliente_nombre || 'Ocupado') : 'Disponible'}"></span>`;
        }).join('');

        return `
            <div class="account-card" id="account-card-${c.id}">
                <!-- Header con Plataforma, Tipo y Estado -->
                <div class="card-top-header">
                    <div class="card-top-platform">
                        <span class="platform-badge-brand" style="background: ${c.color_hex};">
                            ${c.plataforma_nombre}
                        </span>
                        <span class="account-type-pill">
                            ${isCompleta ? 'Cuenta Completa' : `${totalSlots} Pantallas`}
                        </span>
                    </div>
                    <div class="card-top-status">
                        <span class="status-badge ${c.estado}">
                            ${c.estado.replace('_', ' ')}
                        </span>
                    </div>
                </div>

                <!-- Credenciales Maestras Compactas y Profesionales -->
                <div class="credentials-box">
                    <div class="cred-row">
                        <div class="cred-label-group">
                            <span class="cred-label">CORREO / USUARIO</span>
                        </div>
                        <div class="cred-value">
                            <span class="cred-text-user truncate" title="${c.correo}">${c.correo}</span>
                            <button type="button" class="btn-copy-mini" title="Copiar Usuario/Correo" onclick="App.copyText('${c.correo}', 'Usuario/correo copiado')">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                        </div>
                    </div>

                    <div class="cred-row">
                        <div class="cred-label-group">
                            <span class="cred-label">CONTRASEÑA</span>
                        </div>
                        <div class="cred-value">
                            <span id="pass-field-${c.id}" class="cred-text-pass" data-pass="${c.password}">••••••••</span>
                            <button type="button" class="btn-copy-mini" title="Mostrar/Ocultar" onclick="App.togglePasswordVisibility(${c.id})">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <button type="button" class="btn-copy-mini" title="Copiar Contraseña" onclick="App.copyText('${c.password}', 'Contraseña copiada')">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                        </div>
                    </div>

                    <div class="cred-meta-row">
                        <div class="cred-meta-left">
                            ${c.pin_maestro ? `
                                <span class="cred-pin-badge" title="PIN Maestro de la Cuenta">
                                    <span>PIN:</span> <strong>${c.pin_maestro}</strong>
                                </span>
                            ` : `
                                <span class="cred-pin-badge empty">Sin PIN maestro</span>
                            `}
                        </div>
                        <div class="cred-meta-right">
                            <span class="cred-due-label">Vence: <strong>${c.fecha_vencimiento}</strong></span>
                            <span class="days-tag ${daysTagClass}">${daysText}</span>
                        </div>
                    </div>
                </div>

                <!-- Sección: Tipo de Cuenta (Completa vs Por Perfiles) -->
                ${isCompleta ? `
                    <div class="account-complete-card">
                        <div class="complete-header-line">
                            <div class="complete-icon-box">👑</div>
                            <div class="complete-info-box truncate">
                                <div class="complete-badge-label">Cuenta Completa Asignada</div>
                                <div class="complete-client-name truncate">${c.cliente_completo_nombre || 'Sin cliente asignado'}</div>
                            </div>
                        </div>
                        ${c.cliente_completo_telefono ? `
                            <button type="button" class="btn-complete-wa" onclick="App.sendWhatsAppCredentialsCuenta(${c.id})">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                <span>Enviar WhatsApp a Cliente</span>
                            </button>
                        ` : ''}
                    </div>
                ` : `
                    <!-- Shelf de Perfiles / Pantallas Rediseñado -->
                    <div class="profiles-shelf">
                        <div class="profiles-shelf-header">
                            <div class="shelf-title-left">
                                <span class="shelf-label">PANTALLAS</span>
                                <span class="shelf-count">(${occupiedSlots}/${totalSlots})</span>
                                <div class="shelf-dots-bar" title="${occupiedSlots} ocupadas, ${availableSlots} libres">
                                    ${dotsHTML}
                                </div>
                            </div>
                            <button type="button" class="btn-add-slot-chip" onclick="App.openAddSlotModal(${c.id})" title="Añadir nueva pantalla o slot a esta cuenta">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                <span>+ Slot</span>
                            </button>
                        </div>

                        <div class="profiles-shelf-list">
                            ${perfiles.map(pf => {
                                const isOccupied = !!pf.cliente_id;
                                let diffDaysPf = null;
                                if (isOccupied && pf.fecha_vencimiento) {
                                    const pfParts = pf.fecha_vencimiento.split('-');
                                    const pfDate = new Date(parseInt(pfParts[0]), parseInt(pfParts[1]) - 1, parseInt(pfParts[2]));
                                    diffDaysPf = Math.round((pfDate - today) / (1000 * 60 * 60 * 24));
                                }

                                const isConflict = isOccupied && c.fecha_vencimiento && pf.fecha_vencimiento && (c.fecha_vencimiento < pf.fecha_vencimiento);
                                let diffConflict = 0;
                                if (isConflict) {
                                    const cDate = new Date(c.fecha_vencimiento);
                                    const pfDate = new Date(pf.fecha_vencimiento);
                                    diffConflict = Math.round((pfDate - cDate) / (1000 * 60 * 60 * 24));
                                }

                                return `
                                    <div class="slot-item-card ${isConflict ? 'has-conflict' : ''} ${isOccupied ? 'is-occupied' : 'is-free'}">
                                        <!-- Línea 1: Identificador + PIN + Dispositivo + Acciones -->
                                        <div class="slot-item-header">
                                            <div class="slot-identity truncate">
                                                <span class="slot-pill-num ${isOccupied ? 'occupied' : 'free'}">${pf.numero_perfil}</span>
                                                <strong class="slot-title truncate">${pf.nombre_perfil}</strong>
                                                ${pf.pin_perfil ? `<span class="slot-pin-chip" title="PIN de pantalla">🔑 ${pf.pin_perfil}</span>` : ''}
                                                ${isOccupied && pf.dispositivo ? this.getDeviceBadgeHTML(pf.dispositivo) : ''}
                                            </div>
                                            <div class="slot-actions-group">
                                                ${isOccupied ? `
                                                    <button type="button" class="btn-slot-circle wa" title="Enviar WhatsApp a ${pf.cliente_nombre || 'Cliente'}" onclick="App.sendWhatsAppCredentialsPerfil(${pf.id})">
                                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                    </button>
                                                    <button type="button" class="btn-slot-circle del" title="Liberar este perfil" onclick="App.liberarPerfil(${pf.id})">
                                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                    </button>
                                                ` : `
                                                    <button type="button" class="btn-slot-assign-pill" onclick="App.openAssignModal(${pf.id})" title="Asignar este perfil a un cliente">
                                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                        <span>Asignar</span>
                                                    </button>
                                                `}
                                            </div>
                                        </div>

                                        <!-- Línea 2: Cliente / Estado + Fechas y Vencimiento -->
                                        <div class="slot-item-details">
                                            ${isOccupied ? `
                                                <div class="slot-user-row truncate">
                                                    <span class="slot-user-name truncate">
                                                        👤 <strong>${pf.cliente_nombre || 'Cliente'}</strong>
                                                    </span>
                                                    ${pf.ip_mac ? `<span class="slot-mac-chip truncate" title="${pf.ip_mac}">MAC: ${pf.ip_mac}</span>` : ''}
                                                </div>
                                                <div class="slot-meta-row">
                                                    <span class="slot-due-pill ${diffDaysPf !== null && diffDaysPf <= 3 ? 'warn' : ''}">
                                                        ⏳ ${pf.fecha_vencimiento ? pf.fecha_vencimiento.substring(5) : '—'} 
                                                        ${diffDaysPf !== null ? `<span class="slot-days-sub">(${diffDaysPf >= 0 ? `${diffDaysPf}d` : `vencido`})</span>` : ''}
                                                    </span>
                                                </div>
                                            ` : `
                                                <div class="slot-free-row">
                                                    <span class="slot-free-label">✨ Disponible para venta</span>
                                                    <span class="slot-vigencia-pill">Vigencia cuenta: <strong>${diffDays > 0 ? `${diffDays}d` : 'Vencida'}</strong></span>
                                                </div>
                                            `}
                                        </div>

                                        <!-- Línea 3: Alerta Compacta de Desfase de Vencimiento -->
                                        ${isConflict ? `
                                            <div class="slot-conflict-strip" title="La cuenta maestra vence ${diffConflict} días antes de lo contratado por el cliente">
                                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                                <span>Cuenta vence <strong>${diffConflict}d antes</strong> que cliente</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `}

                <!-- Botones de Acción de la Cuenta -->
                <div class="card-bottom-bar">
                    <button type="button" class="btn-card-act renew" onclick="App.renovarCuenta(${c.id})" title="Extender vigencia 30 días">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        <span>Renovar +30d</span>
                    </button>
                    <button type="button" class="btn-card-act" onclick="App.openEditAccountModal(${c.id})" title="Editar datos de cuenta">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>Editar</span>
                    </button>
                    <button type="button" class="btn-card-act danger" onclick="App.eliminarCuenta(${c.id})" title="Eliminar cuenta">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    },

    togglePasswordVisibility(cuentaId) {
        const field = document.getElementById(`pass-field-${cuentaId}`);
        if (!field) return;
        const pass = field.getAttribute('data-pass');
        if (field.textContent === '••••••••') {
            field.textContent = pass;
        } else {
            field.textContent = '••••••••';
        }
    },

    // -------------------------------------------------------------
    // RENDER: PERFILES (TABLA EN DESKTOP / CARDS EN MÓVIL)
    // -------------------------------------------------------------
    getFilteredPerfiles() {
        return this.state.perfiles.filter(p => {
            if (this.state.filtros.plataforma_id > 0 && parseInt(p.plataforma_id) !== this.state.filtros.plataforma_id) return false;
            
            if (this.state.filtros.estado === 'archivado') {
                if (p.estado !== 'archivado') return false;
            } else if (this.state.filtros.estado === 'todas') {
                // En vista "todas", excluir los archivados para mantener limpia la lista de perfiles de trabajo activo
                if (p.estado === 'archivado') return false;
            } else if (p.estado !== this.state.filtros.estado) {
                return false;
            }

            if (this.state.filtros.search) {
                const s = this.state.filtros.search.toLowerCase();
                const matchName = p.nombre_perfil?.toLowerCase().includes(s);
                const matchCorreo = p.cuenta_correo?.toLowerCase().includes(s);
                const matchClient = p.cliente_nombre?.toLowerCase().includes(s);
                const matchTel = p.cliente_telefono?.toLowerCase().includes(s);
                const matchPlat = p.plataforma_nombre?.toLowerCase().includes(s);
                const matchMac = p.ip_mac?.toLowerCase().includes(s);
                const matchDev = p.dispositivo?.toLowerCase().includes(s);
                if (!matchName && !matchCorreo && !matchClient && !matchTel && !matchPlat && !matchMac && !matchDev) return false;
            }
            return true;
        });
    },

    renderPerfiles() {
        const tbody = document.getElementById('perfiles-table-body');
        if (!tbody) return;

        const filtered = this.getFilteredPerfiles();

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row-card">
                    <td colspan="7">
                        <div class="empty-state-box">
                            <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.6;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                            <div style="font-weight:700; color:#fff; font-size:1.05rem;">No se encontraron perfiles o pantallas</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Prueba ajustando los filtros o el buscador.</div>
                        </div>
                    </td>
                </tr>
            `;
            this.updateBulkPerfilesBar();
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        tbody.innerHTML = filtered.map(p => {
            const isChecked = this.state.selectedPerfiles.has(parseInt(p.id));

            // Calcular días restantes de vencimiento si tiene fecha asignada
            let daysBadge = '';
            if (p.fecha_vencimiento && p.estado !== 'archivado') {
                const parts = p.fecha_vencimiento.split('-');
                const vencDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                const diffDays = Math.round((vencDate - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    daysBadge = `<span class="days-pill urgent">Venció hace ${Math.abs(diffDays)}d</span>`;
                } else if (diffDays <= 3) {
                    daysBadge = `<span class="days-pill warning">Vence en ${diffDays}d</span>`;
                } else {
                    daysBadge = `<span class="days-pill good">${diffDays}d restantes</span>`;
                }
            } else if (p.estado === 'archivado') {
                daysBadge = `<span class="days-pill" style="background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.3);">Archivado</span>`;
            }

            return `
                <tr class="profile-table-row ${isChecked ? 'is-selected' : ''}" data-profile-id="${p.id}">
                    <!-- Checkbox de selección masiva -->
                    <td class="td-checkbox" data-label="Seleccionar">
                        <label class="custom-chk-table" title="Seleccionar perfil #${p.numero_perfil}">
                            <input type="checkbox" class="check-perfil" value="${p.id}" ${isChecked ? 'checked' : ''} onchange="App.handleTogglePerfilCheck(${p.id}, this.checked)">
                            <span class="chk-box"></span>
                        </label>
                    </td>

                    <!-- Cabecera del Perfil (En móvil es la cabecera superior del Card) -->
                    <td data-label="Perfil" class="td-profile-header">
                        <div class="profile-info-cell">
                            <span class="platform-mini-pill" style="background: ${p.color_hex || '#6366f1'}20; color: ${p.color_hex || '#818cf8'}; border: 1px solid ${p.color_hex || '#6366f1'}45;">
                                <span class="dot" style="background:${p.color_hex || '#6366f1'};"></span>
                                <span>${p.plataforma_nombre}</span>
                            </span>
                            <div class="profile-name-text">
                                <span class="slot-num">#${p.numero_perfil}</span>
                                <span class="slot-title">${p.nombre_perfil}</span>
                            </div>
                        </div>
                    </td>

                    <!-- Cuenta Maestra y PIN -->
                    <td data-label="Cuenta" class="td-account">
                        <div class="account-cell-content">
                            <div class="account-email-wrap">
                                <span class="account-email truncate">${p.cuenta_correo}</span>
                                <button class="btn-copy-mini" title="Copiar correo" onclick="App.copyText('${p.cuenta_correo}', 'Correo copiado')">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </button>
                            </div>
                            <div class="pin-badge-wrap">
                                ${p.pin_perfil ? `<span class="badge-pin">🔒 PIN: <strong>${p.pin_perfil}</strong></span>` : `<span class="badge-pin-none">Sin PIN</span>`}
                            </div>
                        </div>
                    </td>

                    <!-- Cliente Asignado -->
                    <td data-label="Cliente" class="td-client">
                        ${p.cliente_nombre ? `
                            <div class="client-cell-content">
                                <span class="client-name">${p.cliente_nombre}</span>
                                <a href="https://wa.me/${p.cliente_telefono?.replace(/[^0-9]/g, '')}" target="_blank" class="client-phone-link" title="Abrir WhatsApp">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                    <span>${p.cliente_telefono}</span>
                                </a>
                                <div class="client-device-mac-badges">
                                    ${this.getDeviceBadgeHTML(p.dispositivo)}
                                    ${p.ip_mac ? `
                                        <div class="badge-mac-ip" title="Dirección MAC / IP del dispositivo">
                                            🌐 MAC/IP: <strong>${p.ip_mac}</strong>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : `
                            <span class="badge-available">✨ Disponible para venta</span>
                        `}
                    </td>

                    <!-- Precio y Vencimiento -->
                    <td data-label="Precio / Vence" class="td-pricing">
                        <div class="pricing-cell-content">
                            <span class="price-val">S/ ${parseFloat(p.precio_mensual || 0).toFixed(2)}</span>
                            <div class="date-and-badge">
                                <span class="due-date">📅 Ingreso: <strong>${p.fecha_inicio || '—'}</strong></span>
                                <span class="due-date">⏳ Vence: <strong>${p.fecha_vencimiento || '—'}</strong></span>
                                ${daysBadge}
                            </div>
                            ${(p.cuenta_vencimiento && p.fecha_vencimiento && p.cuenta_vencimiento < p.fecha_vencimiento && p.estado !== 'archivado') ? `
                                <div class="slot-conflict-tag mini" title="¡Conflicto! La cuenta principal vence el ${p.cuenta_vencimiento} antes de la fecha contratada por el cliente">
                                    <span>⚠️ Cuenta vence antes (${p.cuenta_vencimiento})</span>
                                </div>
                            ` : ''}
                        </div>
                    </td>

                    <!-- Estado -->
                    <td data-label="Estado" class="td-status">
                        <span class="status-badge ${p.estado}">
                            ${p.estado.replace('_', ' ')}
                        </span>
                    </td>

                    <!-- Acciones Rápidas (Pie de Card en móvil) -->
                    <td data-label="Acciones" class="td-actions">
                        <div class="actions-cell-content">
                            ${p.estado === 'archivado' ? `
                                <button class="btn-slot-action" title="Desarchivar este perfil" onclick="App.desarchivarPerfil(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                                    <span class="mobile-action-text">Desarchivar</span>
                                </button>
                                ${p.cliente_id ? `
                                    <button class="btn-slot-action liberate-btn" title="Liberar Perfil" onclick="App.liberarPerfil(${p.id})">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        <span class="mobile-action-text">Liberar</span>
                                    </button>
                                ` : ''}
                            ` : p.cliente_id ? `
                                <button class="btn-slot-action wa" title="Enviar WhatsApp" onclick="App.sendWhatsAppCredentialsPerfil(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                    <span class="mobile-action-text">WhatsApp</span>
                                </button>
                                <button class="btn-slot-action renew-btn" title="Renovar +30d" onclick="App.renovarPerfil(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                    <span class="mobile-action-text">Renovar</span>
                                </button>
                                <button class="btn-slot-action liberate-btn" title="Liberar Perfil" onclick="App.liberarPerfil(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    <span class="mobile-action-text">Liberar</span>
                                </button>
                            ` : `
                                <button class="btn-slot-action assign-btn" onclick="App.openAssignModal(${p.id})">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
                                    <span>Asignar a Cliente</span>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.updateBulkPerfilesBar();
    },

    // -------------------------------------------------------------
    // ACCIONES MASIVAS: PERFILES Y PANTALLAS
    // -------------------------------------------------------------
    handleTogglePerfilCheck(id, isChecked) {
        id = parseInt(id);
        if (isChecked) {
            this.state.selectedPerfiles.add(id);
        } else {
            this.state.selectedPerfiles.delete(id);
        }
        const row = document.querySelector(`.profile-table-row[data-profile-id="${id}"]`);
        if (row) {
            row.classList.toggle('is-selected', isChecked);
        }
        this.updateBulkPerfilesBar();
    },

    toggleSelectAllPerfiles(checked) {
        const visible = this.getFilteredPerfiles();
        if (checked) {
            visible.forEach(p => this.state.selectedPerfiles.add(parseInt(p.id)));
        } else {
            visible.forEach(p => this.state.selectedPerfiles.delete(parseInt(p.id)));
        }
        this.renderPerfiles();
    },

    clearSelectedPerfiles() {
        this.state.selectedPerfiles.clear();
        this.renderPerfiles();
    },

    updateBulkPerfilesBar() {
        const bar = document.getElementById('perfiles-bulk-bar');
        const countEl = document.getElementById('bulk-selected-count');
        const archiveText = document.getElementById('bulk-archive-text');
        const checkAll = document.getElementById('check-all-perfiles');
        const selectedCount = this.state.selectedPerfiles.size;

        if (countEl) countEl.textContent = selectedCount;

        // Actualizar estado del checkbox principal de cabecera
        if (checkAll) {
            const visible = this.getFilteredPerfiles();
            const visibleSelectedCount = visible.filter(p => this.state.selectedPerfiles.has(parseInt(p.id))).length;
            if (visible.length === 0 || visibleSelectedCount === 0) {
                checkAll.checked = false;
                checkAll.indeterminate = false;
            } else if (visibleSelectedCount === visible.length) {
                checkAll.checked = true;
                checkAll.indeterminate = false;
            } else {
                checkAll.checked = false;
                checkAll.indeterminate = true;
            }
        }

        if (!bar) return;

        if (selectedCount > 0 && this.state.currentView === 'perfiles') {
            bar.classList.remove('hidden');

            // Si todos los seleccionados están archivados, cambiar texto a Desarchivar
            const allArchived = Array.from(this.state.selectedPerfiles).every(id => {
                const p = this.state.perfiles.find(item => item.id == id);
                return p && p.estado === 'archivado';
            });

            if (archiveText) {
                archiveText.textContent = allArchived ? 'Desarchivar' : 'Archivar';
            }

            // Permisos de usuario
            const btnDelete = document.getElementById('btn-bulk-delete');
            if (btnDelete) btnDelete.style.display = this.can('perfiles', 'eliminar') ? '' : 'none';

            const btnEdit = document.getElementById('btn-bulk-edit');
            if (btnEdit) btnEdit.style.display = this.can('perfiles', 'editar') ? '' : 'none';

            const btnArchive = document.getElementById('btn-bulk-archive');
            if (btnArchive) btnArchive.style.display = this.can('perfiles', 'editar') ? '' : 'none';
        } else {
            bar.classList.add('hidden');
        }
    },

    async handleBulkDeletePerfiles() {
        if (!this.can('perfiles', 'eliminar')) {
            API.showToast('No tienes permiso para eliminar perfiles', 'warning');
            return;
        }
        const count = this.state.selectedPerfiles.size;
        if (count === 0) return;

        if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente los ${count} perfiles seleccionados?\n\nEsta acción no se puede deshacer.`)) {
            return;
        }

        const ids = Array.from(this.state.selectedPerfiles);
        try {
            const res = await API.post('perfiles.php?action=bulk_delete', { ids });
            API.showToast(res.message || 'Perfiles eliminados correctamente', 'info');
            this.state.selectedPerfiles.clear();
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async handleBulkArchivePerfiles() {
        if (!this.can('perfiles', 'editar')) {
            API.showToast('No tienes permiso para editar perfiles', 'warning');
            return;
        }
        const count = this.state.selectedPerfiles.size;
        if (count === 0) return;

        const allArchived = Array.from(this.state.selectedPerfiles).every(id => {
            const p = this.state.perfiles.find(item => item.id == id);
            return p && p.estado === 'archivado';
        });

        const actionText = allArchived ? 'desarchivar' : 'archivar';
        if (!confirm(`¿Deseas ${actionText} los ${count} perfiles seleccionados?`)) {
            return;
        }

        const ids = Array.from(this.state.selectedPerfiles);
        try {
            const res = await API.post('perfiles.php?action=bulk_archive', {
                ids,
                archivar: !allArchived
            });
            API.showToast(res.message || `Perfiles ${allArchived ? 'desarchivados' : 'archivados'} exitosamente`, 'success');
            this.state.selectedPerfiles.clear();
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async desarchivarPerfil(perfilId) {
        try {
            const res = await API.post('perfiles.php?action=bulk_archive', {
                ids: [perfilId],
                archivar: false
            });
            API.showToast(res.message || 'Perfil desarchivado y restaurado', 'success');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    openBulkEditPerfilesModal() {
        if (!this.can('perfiles', 'editar')) {
            API.showToast('No tienes permiso para editar perfiles', 'warning');
            return;
        }
        const count = this.state.selectedPerfiles.size;
        if (count === 0) return;

        const countEl = document.getElementById('bulk-edit-count');
        if (countEl) countEl.textContent = count;

        const form = document.getElementById('form-bulk-edit-perfiles');
        if (form) form.reset();

        ['precio', 'pin', 'dispositivo', 'venc', 'notas'].forEach(field => {
            const grp = document.getElementById(`bulk-group-${field}`);
            const chk = document.getElementById(`bulk-chk-${field}`);
            if (grp) grp.style.display = 'none';
            if (chk) {
                chk.checked = false;
                const card = chk.closest('.bulk-field-card');
                if (card) card.classList.remove('active');
            }
        });

        const boxDias = document.getElementById('bulk-box-dias');
        const boxFecha = document.getElementById('bulk-box-fecha');
        if (boxDias) boxDias.style.display = 'block';
        if (boxFecha) boxFecha.style.display = 'none';

        this.openModal('modal-bulk-edit-perfiles');
    },

    async handleSaveBulkEditPerfiles(e) {
        e.preventDefault();
        if (this._isSavingBulkEdit) return;

        const count = this.state.selectedPerfiles.size;
        if (count === 0) {
            API.showToast('No hay perfiles seleccionados', 'warning');
            return;
        }

        const fields = {};

        if (document.getElementById('bulk-chk-precio')?.checked) {
            const p = document.getElementById('bulk-val-precio')?.value;
            if (p === '' || isNaN(parseFloat(p))) {
                API.showToast('Ingresa un precio mensual válido', 'warning');
                return;
            }
            fields.precio_mensual = parseFloat(p);
        }

        if (document.getElementById('bulk-chk-pin')?.checked) {
            fields.pin_perfil = document.getElementById('bulk-val-pin')?.value.trim();
        }

        if (document.getElementById('bulk-chk-dispositivo')?.checked) {
            fields.dispositivo = document.getElementById('bulk-val-dispositivo')?.value;
        }

        if (document.getElementById('bulk-chk-venc')?.checked) {
            const mode = document.querySelector('input[name="bulk_venc_mode"]:checked')?.value || 'dias';
            if (mode === 'dias') {
                const d = parseInt(document.getElementById('bulk-val-dias')?.value);
                if (!d || d < 1) {
                    API.showToast('Ingresa los días a extender válidos', 'warning');
                    return;
                }
                fields.dias_adicionales = d;
            } else {
                const f = document.getElementById('bulk-val-fecha')?.value;
                if (!f) {
                    API.showToast('Selecciona una fecha de vencimiento fija', 'warning');
                    return;
                }
                fields.fecha_vencimiento = f;
            }
        }

        if (document.getElementById('bulk-chk-notas')?.checked) {
            fields.notas = document.getElementById('bulk-val-notas')?.value.trim();
        }

        if (Object.keys(fields).length === 0) {
            API.showToast('Marca al menos una casilla para indicar qué campo deseas cambiar', 'warning');
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-bulk-edit');
        const origText = btnSubmit ? btnSubmit.innerHTML : 'Aplicar Cambios';

        this._isSavingBulkEdit = true;
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px;"></span> Aplicando...`;
        }

        try {
            const ids = Array.from(this.state.selectedPerfiles);
            const res = await API.post('perfiles.php?action=bulk_edit', { ids, fields });
            API.showToast(res.message || 'Perfiles actualizados exitosamente', 'success');
            this.closeModal('modal-bulk-edit-perfiles');
            this.state.selectedPerfiles.clear();
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            this._isSavingBulkEdit = false;
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = origText;
            }
        }
    },

    // -------------------------------------------------------------
    // RENDER: CLIENTES
    // -------------------------------------------------------------
    renderClientes() {
        const container = document.getElementById('clientes-grid');
        if (!container) return;

        let filtered = this.state.clientes.filter(cl => {
            if (this.state.filtros.search) {
                const s = this.state.filtros.search.toLowerCase();
                const matchName = cl.nombre?.toLowerCase().includes(s);
                const matchTel = cl.telefono?.toLowerCase().includes(s);
                const matchEmail = cl.email?.toLowerCase().includes(s);
                if (!matchName && !matchTel && !matchEmail) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color); width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">
                    No hay clientes registrados o que coincidan con la búsqueda.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(cl => {
            const cleanPhone = cl.telefono?.replace(/[^0-9]/g, '');
            const initials = cl.nombre?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

            return `
                <div class="client-card">
                    <div class="client-card-header">
                        <div class="client-avatar-large">${initials}</div>
                        <div class="client-info-box">
                            <div class="client-name">${cl.nombre}</div>
                            <a href="https://wa.me/${cleanPhone}" target="_blank" class="client-phone-link">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                ${cl.telefono}
                            </a>
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        <div>📧 ${cl.email || 'Sin correo registrado'}</div>
                        <div style="margin-top:4px;">📊 <strong>${cl.total_perfiles || 0}</strong> pantallas | <strong>${cl.total_cuentas_completas || 0}</strong> cuentas completas</div>
                        ${cl.notas ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px; font-style:italic;">📝 "${cl.notas}"</div>` : ''}
                    </div>
                    <div style="display:flex; gap:8px; margin-top:auto; padding-top:12px; border-top:1px solid var(--border-color);">
                        <button class="btn-card-act wa" onclick="window.open('https://wa.me/${cleanPhone}', '_blank')">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                            WhatsApp
                        </button>
                        <button class="btn-card-act" onclick="App.openEditClientModal(${cl.id})">
                            Editar
                        </button>
                        <button class="btn-card-act" style="color:#f87171; flex:unset; padding: 8px 12px;" onclick="App.eliminarCliente(${cl.id})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    // -------------------------------------------------------------
    // RENDER: PLATAFORMAS (CATÁLOGO / EDITAR / ELIMINAR)
    // -------------------------------------------------------------
    renderPlataformas() {
        const container = document.getElementById('plataformas-catalog-grid');
        if (!container) return;

        let filtered = this.state.plataformas.filter(p => {
            if (this.state.filtros.search) {
                const s = this.state.filtros.search.toLowerCase();
                const matchName = p.nombre?.toLowerCase().includes(s);
                const matchCode = p.codigo?.toLowerCase().includes(s);
                if (!matchName && !matchCode) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color); width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">
                    No hay plataformas que coincidan con la búsqueda.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(p => {
            const totalCuentas = parseInt(p.total_cuentas || 0);

            return `
                <div class="account-card" style="border-top: 4px solid ${p.color_hex};">
                    <div class="card-top-header">
                        <span class="platform-badge-brand" style="background: ${p.color_hex};">
                            ${p.nombre}
                        </span>
                        <span class="status-badge ${totalCuentas > 0 ? 'activa' : 'disponible'}">
                            ${totalCuentas} ${totalCuentas === 1 ? 'cuenta' : 'cuentas'}
                        </span>
                    </div>

                    <div class="credentials-box" style="gap:10px;">
                        <div class="cred-row">
                            <span class="cred-label">COLOR IDENTIFICADOR</span>
                            <div class="cred-value" style="display:flex; align-items:center; gap:8px;">
                                <span style="width:16px; height:16px; border-radius:4px; background:${p.color_hex}; display:inline-block; border:1px solid rgba(255,255,255,0.2);"></span>
                                <code>${p.color_hex}</code>
                            </div>
                        </div>
                        <div class="cred-row">
                            <span class="cred-label">PANTALLAS POR CUENTA</span>
                            <div class="cred-value">
                                <span>Hasta <strong>${p.max_perfiles}</strong> perfiles</span>
                            </div>
                        </div>
                        <div class="cred-row">
                            <span class="cred-label">PRECIO SUGERIDO</span>
                            <div class="cred-value">
                                <span style="color:#34d399; font-weight:700;">S/ ${parseFloat(p.precio_sugerido || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="card-bottom-bar" style="margin-top:auto; padding-top:12px;">
                        <button class="btn-card-act" onclick="App.openPlatformModal(${p.id})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Editar
                        </button>
                        <button class="btn-card-act" style="color:#f87171;" onclick="App.eliminarPlataforma(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${totalCuentas})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    // -------------------------------------------------------------
    // RENDER: ALERTAS Y VENCIMIENTOS
    // -------------------------------------------------------------
    renderAlertas() {
        const container = document.getElementById('alertas-full-list');
        if (!container) return;

        const d = this.state.dashboard;
        const cuentasAlert = d?.alertas?.cuentas || [];
        const perfilesAlert = d?.alertas?.perfiles || [];
        const allAlerts = [...cuentasAlert.map(c => ({ ...c, _isCuenta: true })), ...perfilesAlert.map(p => ({ ...p, _isPerfil: true }))];

        if (allAlerts.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">
                    <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#10b981" stroke-width="2" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                    <h3 style="color:#fff; font-size:1.15rem; font-weight:800;">¡No hay vencimientos próximos!</h3>
                    <p style="margin-top:6px; font-size:0.85rem; line-height: 1.4;">Todas tus cuentas y perfiles asignados tienen más de 4 días de vigencia activa.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = allAlerts.map(item => this.buildAlertCardHTML(item)).join('');
    },

    buildAlertCardHTML(item) {
        const isExpired = item.dias_restantes < 0;
        const diasTxt = isExpired ? `Venció hace ${Math.abs(item.dias_restantes)} días` : (item.dias_restantes === 0 ? '¡Vence HOY!' : `Vence en ${item.dias_restantes} días`);
        const itemType = item._isCuenta ? 'CUENTA' : 'PERFIL';

        return `
            <div class="alert-banner-item ${isExpired ? 'expired' : ''}">
                <div class="alert-item-left">
                    <div class="alert-icon-wrap" style="background:${item.color_hex}22; color:${item.color_hex};">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <div>
                        <div class="alert-item-title">
                            [${itemType}] ${item.plataforma_nombre} - ${item._isCuenta ? item.correo : item.nombre_perfil}
                        </div>
                        <div class="alert-item-sub">
                            ${item.cliente_nombre ? `Cliente: <strong>${item.cliente_nombre}</strong> (${item.cliente_telefono}) | ` : ''}
                            Vencimiento: <strong>${item.fecha_vencimiento}</strong> (${diasTxt})
                        </div>
                    </div>
                </div>
                <div class="alert-actions">
                    ${item.cliente_telefono ? `
                        <button class="btn-slot-action wa" onclick="App.sendWhatsAppReminder(${item.id}, ${item._isCuenta ? "'cuenta'" : "'perfil'"})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                            Cobrar por WhatsApp
                        </button>
                    ` : ''}
                    <button class="btn-slot-action" onclick="${item._isCuenta ? `App.renovarCuenta(${item.id})` : `App.renovarPerfil(${item.id})`}">
                        Renovar +30d
                    </button>
                </div>
            </div>
        `;
    },

    // -------------------------------------------------------------
    // WHATSAPP MESSAGING ENGINES
    // -------------------------------------------------------------
    sendWhatsAppCredentialsPerfil(perfilId) {
        const pf = this.state.perfiles.find(p => p.id == perfilId);
        if (!pf || !pf.cliente_telefono) {
            API.showToast('Este perfil no tiene un cliente con teléfono asignado.', 'warning');
            return;
        }

        const cleanPhone = pf.cliente_telefono.replace(/[^0-9]/g, '');
        const devLabel = this.getDeviceLabel(pf.dispositivo);
        const message = 
`🎬 *ACCESO STREAMING - ${pf.plataforma_nombre?.toUpperCase()}*

Hola *${pf.cliente_nombre}*, aquí tienes los datos de acceso a tu perfil:

📺 *Plataforma:* ${pf.plataforma_nombre}
📧 *Usuario / Correo:* ${pf.cuenta_correo}
🔑 *Contraseña:* ${pf.cuenta_password}
👤 *Perfil:* ${pf.nombre_perfil}
${pf.pin_perfil ? `🔒 *PIN de Perfil:* ${pf.pin_perfil}\n` : ''}📱 *Dispositivo Autorizado:* ${devLabel}
${pf.ip_mac ? `🌐 *Identificador / MAC-IP:* ${pf.ip_mac}\n` : ''}📅 *Vencimiento:* ${pf.fecha_vencimiento}

⚠️ *Reglas de uso:*
• Uso exclusivo en 1 solo dispositivo (${devLabel}).
• No modificar usuario ni contraseñas.
• No ingresar a perfiles de otros usuarios.
¡Disfruta tu entretenimiento al máximo! ✨`;

        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        API.showToast('Abriendo WhatsApp con las credenciales...', 'success');
    },

    sendWhatsAppCredentialsCuenta(cuentaId) {
        const c = this.state.cuentas.find(item => item.id == cuentaId);
        if (!c || !c.cliente_completo_telefono) {
            API.showToast('Esta cuenta no tiene cliente con teléfono asignado.', 'warning');
            return;
        }

        const cleanPhone = c.cliente_completo_telefono.replace(/[^0-9]/g, '');
        const message = 
`🎬 *CUENTA COMPLETA - ${c.plataforma_nombre?.toUpperCase()}*

Hola *${c.cliente_completo_nombre}*, aquí tienes los accesos para tu cuenta completa:

📺 *Plataforma:* ${c.plataforma_nombre}
📧 *Correo:* ${c.correo}
🔑 *Contraseña:* ${c.password}
${c.pin_maestro ? `🔒 *PIN Maestro:* ${c.pin_maestro}\n` : ''}📅 *Vence:* ${c.fecha_vencimiento}

¡Gracias por tu preferencia! 🎉`;

        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        API.showToast('Abriendo WhatsApp...', 'success');
    },

    sendWhatsAppReminder(itemId, tipo) {
        let item = null;
        if (tipo === 'perfil') {
            item = this.state.perfiles.find(p => p.id == itemId);
        } else {
            item = this.state.cuentas.find(c => c.id == itemId);
        }

        const phone = tipo === 'perfil' ? item?.cliente_telefono : item?.cliente_completo_telefono;
        const nombre = tipo === 'perfil' ? item?.cliente_nombre : item?.cliente_completo_nombre;

        if (!phone) {
            API.showToast('No hay teléfono de cliente disponible.', 'warning');
            return;
        }

        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const message = 
`👋 Hola *${nombre}*, te saludamos de *StreamManager*.

Te recordamos que tu suscripción de *${item.plataforma_nombre}* vence el *${item.fecha_vencimiento}*.

Si deseas renovar tu servicio para continuar disfrutando sin interrupciones, respóndenos a este mensaje. 🍿✨`;

        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    },

    copyText(text, successMsg = 'Copiado al portapapeles') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                API.showToast(successMsg, 'success', 2000);
            }).catch(() => {
                this.fallbackCopyText(text, successMsg);
            });
        } else {
            this.fallbackCopyText(text, successMsg);
        }
    },

    fallbackCopyText(text, successMsg) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            API.showToast(successMsg, 'success', 2000);
        } catch (err) {
            API.showToast('No se pudo copiar automáticamente', 'error');
        }
        document.body.removeChild(textArea);
    },

    // -------------------------------------------------------------
    // MODALS MANAGEMENT
    // -------------------------------------------------------------
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    },

    openAccountModal() {
        const form = document.getElementById('form-cuenta');
        if (form) form.reset();
        document.getElementById('cuenta-id').value = '';
        document.getElementById('modal-cuenta-title').textContent = 'Registrar Nueva Cuenta';

        // Llenar select de plataformas
        const platSelect = document.getElementById('cuenta-plataforma');
        if (platSelect) {
            platSelect.innerHTML = this.state.plataformas.map(p => `
                <option value="${p.id}">${p.nombre} (Máx ${p.max_perfiles} perfiles)</option>
            `).join('');
        }

        // Llenar select de clientes
        const cliSelect = document.getElementById('cuenta-cliente');
        if (cliSelect) {
            cliSelect.innerHTML = `<option value="">-- Seleccionar Cliente --</option>` + this.state.clientes.map(cl => `
                <option value="${cl.id}">${cl.nombre} (${cl.telefono})</option>
            `).join('');
        }

        // Fechas por defecto
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        document.getElementById('cuenta-fecha-inicio').value = today;
        document.getElementById('cuenta-fecha-venc').value = nextMonth;

        document.getElementById('group-cliente-cuenta').style.display = 'none';
        document.getElementById('group-max-perfiles').style.display = 'block';

        this.openModal('modal-cuenta');
    },

    openEditAccountModal(cuentaId) {
        const c = this.state.cuentas.find(item => item.id == cuentaId);
        if (!c) return;

        this.openAccountModal();
        document.getElementById('modal-cuenta-title').textContent = 'Editar Cuenta de Streaming';
        document.getElementById('cuenta-id').value = c.id;
        document.getElementById('cuenta-plataforma').value = c.plataforma_id;
        document.getElementById('cuenta-correo').value = c.correo;
        document.getElementById('cuenta-password').value = c.password;
        document.getElementById('cuenta-pin').value = c.pin_maestro || '';
        document.getElementById('cuenta-tipo').value = c.tipo_cuenta;
        document.getElementById('cuenta-costo').value = c.costo_compra;
        document.getElementById('cuenta-precio').value = c.precio_venta;
        document.getElementById('cuenta-proveedor').value = c.proveedor || '';
        document.getElementById('cuenta-fecha-inicio').value = c.fecha_inicio;
        document.getElementById('cuenta-fecha-venc').value = c.fecha_vencimiento;
        document.getElementById('cuenta-notas').value = c.notas || '';

        const isCompleta = c.tipo_cuenta === 'cuenta_completa';
        document.getElementById('group-cliente-cuenta').style.display = isCompleta ? 'block' : 'none';
        document.getElementById('group-max-perfiles').style.display = isCompleta ? 'none' : 'block';
        if (c.cliente_id) document.getElementById('cuenta-cliente').value = c.cliente_id;
    },

    useMasterAccountPin() {
        const c = this.state._assigningCuenta;
        const pf = this.state._assigningPerfil;
        const masterPin = c?.pin_maestro || pf?.cuenta_pin_maestro || '';
        if (!masterPin) {
            this.showToast('Esta cuenta principal no tiene PIN maestro configurado', 'warning');
            return;
        }
        const pinInput = document.getElementById('assign-perfil-pin');
        if (pinInput) {
            pinInput.value = masterPin;
            pinInput.focus();
            this.showToast(`PIN maestro "${masterPin}" aplicado al perfil`, 'success');
        }
    },

    openAssignModal(perfilId) {
        if (!perfilId) {
            API.showToast('ID de perfil inválido', 'error');
            return;
        }

        // Buscar en this.state.perfiles con comparación flexible
        let pf = (this.state.perfiles || []).find(p => p.id == perfilId);

        // Si no se encuentra en la lista general de perfiles, buscar en las cuentas cargadas
        if (!pf && this.state.cuentas) {
            for (const acc of this.state.cuentas) {
                if (acc.perfiles && Array.isArray(acc.perfiles)) {
                    const found = acc.perfiles.find(p => p.id == perfilId);
                    if (found) {
                        pf = {
                            ...found,
                            cuenta_id: found.cuenta_id || acc.id,
                            cuenta_correo: acc.correo,
                            cuenta_pin_maestro: acc.pin_maestro,
                            cuenta_vencimiento: acc.fecha_vencimiento,
                            plataforma_id: acc.plataforma_id,
                            plataforma_nombre: acc.plataforma_nombre,
                            color_hex: acc.color_hex
                        };
                        break;
                    }
                }
            }
        }

        if (!pf) {
            console.error('Perfil no encontrado para ID:', perfilId, this.state.perfiles);
            API.showToast('No se encontró el perfil seleccionado en memoria.', 'error');
            return;
        }

        // Cuenta a la que pertenece el perfil
        const c = (this.state.cuentas || []).find(item => item.id == pf.cuenta_id) || {
            id: pf.cuenta_id,
            plataforma_id: pf.plataforma_id,
            plataforma_nombre: pf.plataforma_nombre,
            color_hex: pf.color_hex,
            correo: pf.cuenta_correo,
            fecha_vencimiento: pf.cuenta_vencimiento,
            pin_maestro: pf.cuenta_pin_maestro || ''
        };
        this.state._assigningCuenta = c;
        this.state._assigningPerfil = pf;
        this.state._basePerfilPrecio = parseFloat(pf.precio_mensual || 12.00);

        const form = document.getElementById('form-asignar-perfil');
        if (form) form.reset();

        document.getElementById('assign-perfil-id').value = pf.id;
        document.getElementById('assign-perfil-nombre').value = pf.nombre_perfil || '';
        document.getElementById('assign-perfil-pin').value = pf.pin_perfil || '0000';
        document.getElementById('assign-ip-mac').value = pf.ip_mac || '';
        document.getElementById('assign-precio').value = (parseFloat(pf.precio_mensual) || 12.00).toFixed(2);
        document.getElementById('assign-notas').value = pf.notas || '';

        // Configurar botón "Usar PIN Cuenta Principal"
        const masterPin = c.pin_maestro || pf.cuenta_pin_maestro || '';
        const btnMasterPin = document.getElementById('btn-use-master-pin');
        const labelMasterPin = document.getElementById('label-use-master-pin-text');
        if (btnMasterPin && labelMasterPin) {
            if (masterPin) {
                labelMasterPin.textContent = `Usar PIN Cuenta (${masterPin})`;
                btnMasterPin.style.display = 'inline-flex';
                btnMasterPin.title = `Aplicar PIN maestro "${masterPin}" de la cuenta`;
            } else {
                labelMasterPin.textContent = `Sin PIN en cuenta`;
                btnMasterPin.style.display = 'none';
            }
        }

        // Seleccionar dispositivo
        this.selectDeviceType(pf.dispositivo || 'tv');

        // Resumen de la cuenta maestra en el modal
        this.renderAssignModalAccountSummary();

        const cliSelect = document.getElementById('assign-cliente-id');
        if (cliSelect) {
            cliSelect.innerHTML = `
                <option value="">-- Seleccionar Cliente Existente --</option>
                <option value="new">+ Crear Nuevo Cliente Rápido...</option>
            ` + (this.state.clientes || []).map(cl => `
                <option value="${cl.id}">${this.escapeHtml(cl.nombre)} (${this.escapeHtml(cl.telefono || 'Sin WhatsApp')})</option>
            `).join('');
            cliSelect.value = '';
        }

        const quickFields = document.getElementById('new-client-quick-fields');
        if (quickFields) quickFields.style.display = 'none';
        const newCliNombre = document.getElementById('new-cli-nombre');
        const newCliTel = document.getElementById('new-cli-telefono');
        if (newCliNombre) {
            newCliNombre.value = '';
            newCliNombre.required = false;
        }
        if (newCliTel) {
            newCliTel.value = '';
            newCliTel.required = false;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('assign-fecha-inicio').value = todayStr;

        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        document.getElementById('assign-fecha-venc').value = nextMonth;

        // Actualizar texto del botón de vencimiento de cuenta
        const btnChipDue = document.getElementById('btn-chip-account-due');
        if (btnChipDue && c.fecha_vencimiento) {
            btnChipDue.textContent = `Hasta vencer cuenta (${c.fecha_vencimiento})`;
        }

        // Chequear conflicto de fechas inicial
        this.checkAssignConflict();

        this.openModal('modal-asignar-perfil');
    },

    renderAssignModalAccountSummary() {
        const summaryBox = document.getElementById('assign-account-info-box');
        const c = this.state._assigningCuenta;
        const pf = this.state._assigningPerfil;
        if (!summaryBox || !c) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let diffDaysCuenta = 0;
        if (c.fecha_vencimiento) {
            const parts = c.fecha_vencimiento.split('-');
            const vencDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            diffDaysCuenta = Math.round((vencDate - today) / (1000 * 60 * 60 * 24));
        }

        let daysText = `${diffDaysCuenta} días restantes`;
        let daysClass = diffDaysCuenta > 3 ? 'good' : (diffDaysCuenta > 0 ? 'warning' : 'urgent');
        if (diffDaysCuenta <= 0) daysText = '¡Cuenta Vencida!';

        summaryBox.innerHTML = `
            <div class="summary-card-inner" style="border-left: 4px solid ${c.color_hex || '#6366f1'};">
                <div class="summary-top-line">
                    <span class="platform-mini-pill" style="background:${c.color_hex || '#6366f1'}22; color:${c.color_hex || '#818cf8'};">
                        <span class="dot" style="background:${c.color_hex || '#6366f1'};"></span>
                        <span>${c.plataforma_nombre || pf?.plataforma_nombre || 'Streaming'}</span>
                    </span>
                    <span class="summary-user truncate">👤 ${c.correo || pf?.cuenta_correo || ''}</span>
                </div>
                <div class="summary-bottom-line">
                    <span>Vigencia Cuenta Maestra: <strong style="color:#fff;">${c.fecha_vencimiento || pf?.cuenta_vencimiento}</strong></span>
                    <span class="days-tag ${daysClass}">${daysText}</span>
                </div>
            </div>
        `;
    },

    setAssignDuration(days) {
        const inicioEl = document.getElementById('assign-fecha-inicio');
        const vencEl = document.getElementById('assign-fecha-venc');
        const baseDate = inicioEl?.value ? new Date(inicioEl.value + 'T00:00:00') : new Date();
        baseDate.setDate(baseDate.getDate() + days);
        vencEl.value = baseDate.toISOString().split('T')[0];
        this.checkAssignConflict();
    },

    setAssignDurationToAccountDue() {
        const c = this.state._assigningCuenta;
        if (!c || !c.fecha_vencimiento) return;
        const vencEl = document.getElementById('assign-fecha-venc');
        vencEl.value = c.fecha_vencimiento;
        this.checkAssignConflict();
    },

    checkAssignConflict() {
        const conflictBox = document.getElementById('assign-conflict-warning');
        if (!conflictBox) return;

        const c = this.state._assigningCuenta;
        const vencVal = document.getElementById('assign-fecha-venc')?.value;

        if (!c || !c.fecha_vencimiento || !vencVal) {
            conflictBox.style.display = 'none';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const cDate = new Date(c.fecha_vencimiento + 'T00:00:00');
        const clientDate = new Date(vencVal + 'T00:00:00');

        const diffDaysCuenta = Math.round((cDate - today) / (1000 * 60 * 60 * 24));
        const diffDaysCliente = Math.round((clientDate - today) / (1000 * 60 * 60 * 24));
        const diffConflict = Math.round((clientDate - cDate) / (1000 * 60 * 60 * 24));

        conflictBox.style.display = 'block';

        if (diffConflict > 0) {
            // Conflicto: La cuenta expira antes que el cliente
            conflictBox.className = 'conflict-alert-box alert-danger';

            const basePrice = this.state._basePerfilPrecio || parseFloat(document.getElementById('assign-precio')?.value) || 12.0;
            const validDays = Math.max(0, diffDaysCuenta);
            const propPrice = Math.max(0, ((basePrice / 30) * validDays)).toFixed(2);

            // Sugerencia si existe otra cuenta de la misma plataforma con >= 30 días y slots libres
            let alternativeNotice = '';
            if (c.plataforma_id) {
                const altAcc = this.state.cuentas.find(acc => 
                    parseInt(acc.plataforma_id) === parseInt(c.plataforma_id) &&
                    acc.id !== c.id &&
                    acc.perfiles &&
                    acc.perfiles.some(p => !p.cliente_id) &&
                    (new Date(acc.fecha_vencimiento + 'T00:00:00') - today) >= (30 * 24 * 60 * 60 * 1000)
                );

                if (altAcc) {
                    const freeSlot = altAcc.perfiles.find(p => !p.cliente_id);
                    const altDays = Math.round((new Date(altAcc.fecha_vencimiento + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
                    alternativeNotice = `
                        <div class="conflict-alternative-box">
                            <div class="alt-title">💡 Sugerencia de Cuenta Alternativa:</div>
                            <div class="alt-text">Tienes la cuenta <strong>${altAcc.correo}</strong> con <strong>${altDays} días restantes</strong> y slots libres.</div>
                            <button type="button" class="btn-alt-switch" onclick="App.openAssignModal(${freeSlot.id})">
                                🔀 Asignar en esa cuenta (${altAcc.correo})
                            </button>
                        </div>
                    `;
                }
            }

            conflictBox.innerHTML = `
                <div class="conflict-header-row">
                    <div class="conflict-icon">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </div>
                    <div class="conflict-content">
                        <div class="conflict-title">⚠️ Desfase detectado: Cuenta maestra vence ${diffConflict} días ANTES que el cliente</div>
                        <div class="conflict-desc">
                            La cuenta maestra vence el <strong>${c.fecha_vencimiento}</strong> (${diffDaysCuenta} días restantes), pero el perfil vencería el <strong>${vencVal}</strong> (${diffDaysCliente} días). Si no se renueva con tu proveedor, el cliente perderá el acceso a mitad de mes.
                        </div>
                    </div>
                </div>

                <div class="conflict-solutions-actions">
                    <div class="solutions-header">Elige cómo deseas controlar el desfase:</div>
                    <button type="button" class="btn-conflict-action renew" onclick="App.quickRenewMasterAccountFromModal()">
                        <div class="action-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </div>
                        <div class="action-text">
                            <strong>Opción 1: Extender Cuenta Maestra +30 días</strong>
                            <small>Renueva la cuenta en el sistema para que dure ${diffDaysCuenta + 30} días y cubra el mes completo.</small>
                        </div>
                    </button>

                    <button type="button" class="btn-conflict-action proportional" onclick="App.adjustToAccountRemainingDays(${validDays}, '${propPrice}')">
                        <div class="action-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        </div>
                        <div class="action-text">
                            <strong>Opción 2: Cobro Proporcional (${validDays} días por S/ ${propPrice})</strong>
                            <small>Ajusta el vencimiento del cliente a la fecha de la cuenta (${c.fecha_vencimiento}) con precio prorrateado.</small>
                        </div>
                    </button>
                </div>

                ${alternativeNotice}
            `;
        } else {
            // Seguro: La cuenta cubre todo el periodo
            conflictBox.className = 'conflict-alert-box alert-success';
            conflictBox.innerHTML = `
                <div class="conflict-header-row">
                    <div class="conflict-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div class="conflict-content">
                        <div class="conflict-title">✅ Vigencia Cubierta</div>
                        <div class="conflict-desc">
                            La cuenta maestra (vence el <strong>${c.fecha_vencimiento}</strong>) cubre con total seguridad los <strong>${diffDaysCliente} días</strong> contratados por el cliente.
                        </div>
                    </div>
                </div>
            `;
        }
    },

    async quickRenewMasterAccountFromModal() {
        const c = this.state._assigningCuenta;
        if (!c || !c.id) {
            API.showToast('No se encontró la cuenta maestra asociada.', 'error');
            return;
        }

        try {
            const res = await API.post(`cuentas.php?action=renovar&id=${c.id}`, { dias: 30, sincronizar_perfiles: false });
            API.showToast(res.message || 'Cuenta maestra renovada +30 días', 'success');

            // Actualizar cuenta en estado local
            if (res.nueva_fecha) {
                c.fecha_vencimiento = res.nueva_fecha;
            }
            const foundAcc = this.state.cuentas.find(item => item.id == c.id);
            if (foundAcc && res.nueva_fecha) {
                foundAcc.fecha_vencimiento = res.nueva_fecha;
            }

            // Actualizar vista resumen en el modal
            this.renderAssignModalAccountSummary();

            // Actualizar botón chip
            const btnChipDue = document.getElementById('btn-chip-account-due');
            if (btnChipDue && c.fecha_vencimiento) {
                btnChipDue.textContent = `Hasta vencer cuenta (${c.fecha_vencimiento})`;
            }

            // Re-evaluar conflicto
            this.checkAssignConflict();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    adjustToAccountRemainingDays(days, propPrice) {
        const c = this.state._assigningCuenta;
        if (!c || !c.fecha_vencimiento) return;

        const vencEl = document.getElementById('assign-fecha-venc');
        if (vencEl) vencEl.value = c.fecha_vencimiento;

        const precioEl = document.getElementById('assign-precio');
        if (precioEl && propPrice) {
            precioEl.value = propPrice;
        }

        this.checkAssignConflict();
        API.showToast(`Ajustado a ${days} días restantes (Vence: ${c.fecha_vencimiento}) por S/ ${propPrice}`, 'info');
    },

    openClientModal() {
        const form = document.getElementById('form-cliente');
        if (form) form.reset();
        document.getElementById('cliente-id').value = '';
        document.getElementById('modal-cliente-title').textContent = 'Registrar Nuevo Cliente';
        this.openModal('modal-cliente');
    },

    openEditClientModal(clientId) {
        const cl = this.state.clientes.find(item => item.id == clientId);
        if (!cl) return;

        this.openClientModal();
        document.getElementById('modal-cliente-title').textContent = 'Editar Cliente';
        document.getElementById('cliente-id').value = cl.id;
        document.getElementById('cliente-nombre').value = cl.nombre;
        document.getElementById('cliente-telefono').value = cl.telefono;
        document.getElementById('cliente-email').value = cl.email || '';
        document.getElementById('cliente-notas').value = cl.notas || '';
    },

    openAddSlotModal(cuentaId) {
        const nombre = prompt('Ingresa el nombre para el nuevo perfil (Ej: Perfil 5 o Kids):', 'Nuevo Perfil');
        if (!nombre) return;
        const pin = prompt('PIN de perfil (opcional, ej: 1234):', '0000') || '';

        API.post('perfiles.php', {
            cuenta_id: cuentaId,
            nombre_perfil: nombre,
            pin_perfil: pin,
            precio_mensual: 12.00
        }).then(res => {
            API.showToast(res.message, 'success');
            this.loadAllData();
        }).catch(err => {
            API.showToast(err.message, 'error');
        });
    },

    // -------------------------------------------------------------
    // FORM SUBMIT HANDLERS
    // -------------------------------------------------------------
    async handleSaveAccount(e) {
        e.preventDefault();
        if (this._isSavingAccount) return;

        const id = document.getElementById('cuenta-id').value;
        const data = {
            plataforma_id: document.getElementById('cuenta-plataforma').value,
            correo: document.getElementById('cuenta-correo').value.trim(),
            password: document.getElementById('cuenta-password').value,
            pin_maestro: document.getElementById('cuenta-pin').value.trim(),
            tipo_cuenta: document.getElementById('cuenta-tipo').value,
            cliente_id: document.getElementById('cuenta-cliente').value || null,
            costo_compra: document.getElementById('cuenta-costo').value,
            precio_venta: document.getElementById('cuenta-precio').value,
            proveedor: document.getElementById('cuenta-proveedor').value.trim(),
            max_perfiles: document.getElementById('cuenta-max-perfiles').value,
            fecha_inicio: document.getElementById('cuenta-fecha-inicio').value,
            fecha_vencimiento: document.getElementById('cuenta-fecha-venc').value,
            notas: document.getElementById('cuenta-notas').value.trim()
        };

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const origBtnText = submitBtn ? submitBtn.innerHTML : 'Guardar Cuenta';

        this._isSavingAccount = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></span> Guardando...`;
        }

        try {
            if (id) {
                await API.put(`cuentas.php?id=${id}`, data);
                API.showToast('Cuenta actualizada exitosamente', 'success');
            } else {
                await API.post('cuentas.php', data);
                API.showToast('Cuenta y perfiles creados exitosamente', 'success');
            }
            this.closeModal('modal-cuenta');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            this._isSavingAccount = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origBtnText;
            }
        }
    },

    async handleSaveAssignProfile(e) {
        e.preventDefault();
        if (this._isSavingAssign) return;

        const perfilId = document.getElementById('assign-perfil-id').value;
        const clienteSelect = document.getElementById('assign-cliente-id').value;

        const data = {
            perfil_id: perfilId,
            nombre_perfil: document.getElementById('assign-perfil-nombre').value.trim(),
            pin_perfil: document.getElementById('assign-perfil-pin').value.trim(),
            ip_mac: document.getElementById('assign-ip-mac').value.trim(),
            dispositivo: document.getElementById('assign-dispositivo')?.value || 'tv',
            precio_mensual: document.getElementById('assign-precio').value,
            fecha_inicio: document.getElementById('assign-fecha-inicio').value,
            fecha_vencimiento: document.getElementById('assign-fecha-venc').value,
            notas: document.getElementById('assign-notas').value.trim()
        };

        if (clienteSelect === 'new') {
            data.nuevo_cliente_nombre = document.getElementById('new-cli-nombre').value.trim();
            data.nuevo_cliente_telefono = document.getElementById('new-cli-telefono').value.trim();
            if (!data.nuevo_cliente_nombre || !data.nuevo_cliente_telefono) {
                API.showToast('Ingresa nombre y WhatsApp del nuevo cliente', 'warning');
                document.getElementById('new-cli-nombre')?.focus();
                return;
            }
        } else {
            data.cliente_id = clienteSelect;
            if (!data.cliente_id) {
                API.showToast('Selecciona un cliente para asignar el perfil', 'warning');
                document.getElementById('assign-cliente-id')?.focus();
                return;
            }
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const origBtnText = submitBtn ? submitBtn.innerHTML : 'Guardar Asignación';

        this._isSavingAssign = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></span> Asignando...`;
        }

        try {
            const res = await API.post('perfiles.php?action=asignar', data);
            API.showToast(res.message || 'Perfil asignado con éxito', 'success');
            this.closeModal('modal-asignar-perfil');
            await this.loadAllData();

            // Preguntar si desea enviar WhatsApp de inmediato
            if (confirm('¿Deseas enviar las credenciales de acceso por WhatsApp al cliente ahora?')) {
                this.sendWhatsAppCredentialsPerfil(parseInt(perfilId));
            }
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            this._isSavingAssign = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origBtnText;
            }
        }
    },

    async handleSaveClient(e) {
        e.preventDefault();
        if (this._isSavingClient) return;

        const id = document.getElementById('cliente-id').value;
        const data = {
            nombre: document.getElementById('cliente-nombre').value.trim(),
            telefono: document.getElementById('cliente-telefono').value.trim(),
            email: document.getElementById('cliente-email').value.trim(),
            notas: document.getElementById('cliente-notas').value.trim()
        };

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const origBtnText = submitBtn ? submitBtn.innerHTML : 'Guardar Cliente';

        this._isSavingClient = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></span> Guardando...`;
        }

        try {
            if (id) {
                await API.put(`clientes.php?id=${id}`, data);
                API.showToast('Cliente actualizado correctamente', 'success');
            } else {
                await API.post('clientes.php', data);
                API.showToast('Cliente registrado con éxito', 'success');
            }
            this.closeModal('modal-cliente');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            this._isSavingClient = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origBtnText;
            }
        }
    },

    // -------------------------------------------------------------
    // QUICK ACTIONS: RENOVAR, LIBERAR, ELIMINAR
    // -------------------------------------------------------------
    async renovarCuenta(cuentaId) {
        if (!confirm('¿Deseas renovar esta cuenta por +30 días adicionales?')) return;
        try {
            const res = await API.post(`cuentas.php?action=renovar&id=${cuentaId}`, { dias: 30, sincronizar_perfiles: true });
            API.showToast(res.message, 'success');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async renovarPerfil(perfilId) {
        if (!confirm('¿Deseas renovar este perfil por +30 días adicionales?')) return;
        try {
            const res = await API.post(`perfiles.php?action=renovar`, { perfil_id: perfilId, dias: 30 });
            API.showToast(res.message, 'success');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async liberarPerfil(perfilId) {
        if (!confirm('¿Estás seguro de liberar este perfil? El cliente será desvinculado y quedará disponible para la venta.')) return;
        try {
            const res = await API.post(`perfiles.php?action=liberar`, { perfil_id: perfilId });
            API.showToast(res.message, 'info');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async eliminarCuenta(cuentaId) {
        if (!confirm('¿Estás completamente seguro de eliminar esta cuenta? Se eliminarán también todos sus perfiles asociados.')) return;
        try {
            const res = await API.delete(`cuentas.php?id=${cuentaId}`);
            API.showToast(res.message, 'info');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async eliminarCliente(clienteId) {
        if (!confirm('¿Eliminar este cliente? Los perfiles que tenga asignados quedarán liberados.')) return;
        try {
            const res = await API.delete(`clientes.php?id=${clienteId}`);
            API.showToast(res.message, 'info');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    // -------------------------------------------------------------
    // GESTIÓN DE PLATAFORMAS (CREAR, EDITAR, ELIMINAR)
    // -------------------------------------------------------------
    openPlatformModal(platformId = null) {
        const form = document.getElementById('form-plataforma');
        if (form) form.reset();

        const idInput = document.getElementById('plataforma-id');
        const titleEl = document.getElementById('modal-plataforma-title');
        const colorPicker = document.getElementById('plataforma-color-picker');
        const colorInput = document.getElementById('plataforma-color');

        if (platformId) {
            const p = this.state.plataformas.find(item => item.id == platformId);
            if (!p) return;
            titleEl.textContent = 'Editar Plataforma';
            idInput.value = p.id;
            document.getElementById('plataforma-nombre').value = p.nombre;
            colorPicker.value = p.color_hex || '#6366f1';
            colorInput.value = p.color_hex || '#6366f1';
            document.getElementById('plataforma-max-perfiles').value = p.max_perfiles;
            document.getElementById('plataforma-precio').value = p.precio_sugerido;
        } else {
            titleEl.textContent = 'Registrar Nueva Plataforma';
            idInput.value = '';
            colorPicker.value = '#6366f1';
            colorInput.value = '#6366f1';
            document.getElementById('plataforma-max-perfiles').value = 5;
            document.getElementById('plataforma-precio').value = '10.00';
        }

        this.openModal('modal-plataforma');
    },

    async handleSavePlatform(e) {
        e.preventDefault();
        if (this._isSavingPlatform) return;

        const id = document.getElementById('plataforma-id').value;
        const data = {
            nombre: document.getElementById('plataforma-nombre').value.trim(),
            color_hex: document.getElementById('plataforma-color').value.trim(),
            max_perfiles: parseInt(document.getElementById('plataforma-max-perfiles').value) || 5,
            precio_sugerido: parseFloat(document.getElementById('plataforma-precio').value) || 0
        };

        if (!data.nombre) {
            API.showToast('El nombre de la plataforma es obligatorio', 'warning');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const origBtnText = submitBtn ? submitBtn.innerHTML : 'Guardar Plataforma';

        this._isSavingPlatform = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></span> Guardando...`;
        }

        try {
            if (id) {
                await API.put(`plataformas.php?id=${id}`, data);
                API.showToast('Plataforma actualizada exitosamente', 'success');
            } else {
                await API.post('plataformas.php', data);
                API.showToast('Plataforma agregada al catálogo', 'success');
            }
            this.closeModal('modal-plataforma');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        } finally {
            this._isSavingPlatform = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origBtnText;
            }
        }
    },

    async eliminarPlataforma(platformId, nombre, totalCuentas) {
        if (totalCuentas > 0) {
            alert(`⚠️ No se puede eliminar "${nombre}" porque tiene ${totalCuentas} cuenta(s) asociada(s).\n\nPara eliminar esta plataforma, primero elimina o reasigna sus cuentas en la pestaña "Cuentas".`);
            return;
        }

        if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente la plataforma "${nombre}"?`)) {
            return;
        }

        try {
            const res = await API.delete(`plataformas.php?id=${platformId}`);
            API.showToast(res.message || 'Plataforma eliminada', 'info');
            await this.loadAllData();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    // =============================================================
    // SISTEMA DE PERMISOS MODULARES Y CONTROL DE ACCESO
    // =============================================================
    can(modulo, accion = 'ver') {
        const user = API.getUser();
        if (!user) return true;

        // Super Administrador (id 1, rol_id 1, rol 'admin', o nombre 'Super Administrador')
        if (parseInt(user.id) === 1 || parseInt(user.rol_id) === 1 || user.rol === 'admin' || user.rol_nombre === 'Super Administrador') {
            return true;
        }

        const perms = user.permisos;
        if (!perms || typeof perms !== 'object') {
            return false;
        }

        if (perms[modulo]) {
            if (typeof perms[modulo] === 'boolean') {
                return perms[modulo];
            }
            if (typeof perms[modulo] === 'object') {
                return !!perms[modulo][accion];
            }
        }

        return false;
    },

    applyUIPermissions() {
        const user = API.getUser();
        if (!user) return;

        // Nombres, emails y roles en encabezado / sidebar
        document.querySelectorAll('.current-user-name').forEach(el => el.textContent = user.nombre || 'Administrador');
        document.querySelectorAll('.current-user-email').forEach(el => el.textContent = user.email || '');
        document.querySelectorAll('.current-user-role').forEach(el => el.textContent = user.rol_nombre || 'Rol');

        // Navegación Sidebar y Mobile según permiso 'ver'
        document.querySelectorAll('[data-view]').forEach(el => {
            const view = el.getAttribute('data-view');
            if (view) {
                const allowed = this.can(view, 'ver');
                el.style.display = allowed ? '' : 'none';
            }
        });

        // Botones de acción principales en top bar
        const btnNewAccount = document.getElementById('btn-new-account');
        if (btnNewAccount) btnNewAccount.style.display = this.can('cuentas', 'crear') ? '' : 'none';

        const btnNewClient = document.getElementById('btn-new-client');
        if (btnNewClient) btnNewClient.style.display = this.can('clientes', 'crear') ? '' : 'none';

        const btnNewPlatform = document.getElementById('btn-new-platform');
        if (btnNewPlatform) btnNewPlatform.style.display = this.can('plataformas', 'crear') ? '' : 'none';

        // Pestañas del módulo de Configuración
        const tabUsers = document.querySelector('.config-tab-btn[data-tab="usuarios"]');
        if (tabUsers) tabUsers.style.display = this.can('configuracion', 'usuarios') ? '' : 'none';

        const tabRoles = document.querySelector('.config-tab-btn[data-tab="roles"]');
        if (tabRoles) tabRoles.style.display = this.can('configuracion', 'roles') ? '' : 'none';

        const tabAjustes = document.querySelector('.config-tab-btn[data-tab="ajustes"]');
        if (tabAjustes) tabAjustes.style.display = this.can('configuracion', 'ajustes') ? '' : 'none';

        const tabOta = document.querySelector('.config-tab-btn[data-tab="actualizaciones"]');
        if (tabOta) tabOta.style.display = this.can('configuracion', 'actualizaciones') ? '' : 'none';
    },

    // =============================================================
    // MÓDULO CONFIGURACIÓN: RESUMEN, TABS Y VISTAS
    // =============================================================
    async renderConfiguracion() {
        if (!this.can('configuracion', 'ver')) {
            API.showToast('No tienes permisos para acceder a Configuración', 'warning');
            this.switchView('dashboard');
            return;
        }

        await this.loadConfigSummary();

        // Determinar primera pestaña con permiso si la actual no está permitida
        let tab = this.state.configTab || 'usuarios';
        if (!this.can('configuracion', tab)) {
            const allowedTabs = ['usuarios', 'roles', 'ajustes', 'actualizaciones'].filter(t => this.can('configuracion', t));
            tab = allowedTabs[0] || 'usuarios';
        }

        this.switchConfigTab(tab);
    },

    async loadConfigSummary() {
        try {
            const res = await API.get('configuracion.php', { action: 'get_summary' });
            if (res.success) {
                this.state.users = res.users || [];
                this.state.roles = res.roles || [];
                this.state.settings = res.settings || {};

                // Contadores en pestañas
                const uCountEl = document.getElementById('count-users-tab');
                if (uCountEl) uCountEl.textContent = this.state.users.length;

                const rCountEl = document.getElementById('count-roles-tab');
                if (rCountEl) rCountEl.textContent = this.state.roles.length;

                // Versión del sistema
                const sysVer = res.settings?.sistema_version || res.system?.version || '2.7.0';
                const otaVer = document.getElementById('ota-current-version-label');
                if (otaVer) otaVer.textContent = `v${sysVer}`;
                const topSub = document.getElementById('top-page-subtitle');
                if (topSub) topSub.textContent = `StreamManager Cloud v${sysVer}`;
            }
        } catch (error) {
            console.error('Error cargando resumen de configuración:', error);
            API.showToast('No se pudo cargar la información de configuración', 'error');
        }
    },

    switchConfigTab(tabName) {
        if (!this.can('configuracion', tabName)) {
            API.showToast(`No tienes permisos para la sección: ${tabName}`, 'warning');
            return;
        }

        this.state.configTab = tabName;

        // Actualizar botones de pestaña
        document.querySelectorAll('.config-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });

        // Actualizar paneles
        document.querySelectorAll('.config-tab-panel').forEach(panel => {
            panel.classList.add('hidden');
            panel.classList.remove('active');
        });

        const activePanel = document.getElementById(`config-panel-${tabName}`);
        if (activePanel) {
            activePanel.classList.remove('hidden');
            activePanel.classList.add('active');
        }

        this.renderConfigTab(tabName);
    },

    renderConfigTab(tabName) {
        switch (tabName) {
            case 'usuarios':
                this.renderUsersList();
                break;
            case 'roles':
                this.renderRolesList();
                break;
            case 'ajustes':
                this.renderSettingsForm();
                break;
            case 'actualizaciones':
                this.renderOTASection();
                break;
        }
    },

    // =============================================================
    // GESTIÓN DE USUARIOS
    // =============================================================
    renderUsersList() {
        const container = document.getElementById('users-cards-grid');
        if (!container) return;

        const searchTerm = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
        const users = this.state.users || [];

        const filtered = users.filter(u => {
            if (!searchTerm) return true;
            const n = (u.nombre || '').toLowerCase();
            const e = (u.email || '').toLowerCase();
            const r = (u.rol_nombre || '').toLowerCase();
            const t = (u.telefono || '').toLowerCase();
            return n.includes(searchTerm) || e.includes(searchTerm) || r.includes(searchTerm) || t.includes(searchTerm);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted); margin-bottom:12px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                    <h4 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">No se encontraron usuarios</h4>
                    <p style="color:var(--text-muted); font-size:0.85rem;">Prueba con otro término de búsqueda o crea un nuevo usuario.</p>
                </div>
            `;
            return;
        }

        const currentUserId = API.getUser()?.id;

        container.innerHTML = filtered.map(u => {
            const initials = u.nombre ? u.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U';
            const isSelf = (parseInt(u.id) === parseInt(currentUserId));
            const isMaster = (parseInt(u.id) === 1);
            const isActive = (u.estado === 'activo');

            return `
                <div class="user-card ${!isActive ? 'inactive' : ''}">
                    <div class="user-card-header">
                        <div class="user-avatar-circle">${initials}</div>
                        <div class="user-info-text">
                            <div class="user-info-name truncate">${this.escapeHtml(u.nombre)} ${isSelf ? '<span class="user-tag-you" style="font-size:0.65rem; background:#6366f1; color:#fff; padding:1px 5px; border-radius:4px; margin-left:4px;">Tú</span>' : ''}</div>
                            <div class="user-info-email truncate">${this.escapeHtml(u.email)}</div>
                        </div>
                    </div>

                    <div class="user-badges-row">
                        <span class="badge-user-role">
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span>${this.escapeHtml(u.rol_nombre || 'Sin Rol')}</span>
                        </span>
                        <span class="badge-user-status ${isActive ? 'activo' : 'inactivo'}">
                            ${isActive ? '● Activo' : '○ Inactivo'}
                        </span>
                    </div>

                    ${u.telefono ? `
                    <div style="font-size:0.78rem; color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
                        <span>📱 WhatsApp:</span>
                        <a href="https://wa.me/${u.telefono.replace(/\D/g, '')}" target="_blank" style="color:#38bdf8; text-decoration:none;">
                            ${this.escapeHtml(u.telefono)}
                        </a>
                    </div>` : ''}

                    <div class="user-card-footer">
                        <span>Acceso: <strong>${u.ultimo_login ? u.ultimo_login.substring(0, 16) : 'Nunca'}</strong></span>
                        <div class="user-card-actions">
                            <button type="button" class="btn-card-act" onclick="App.openUserModal(${u.id})">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                <span>Editar</span>
                            </button>
                            ${!isMaster && !isSelf ? `
                            <button type="button" class="btn-card-act" style="color:#f87171;" onclick="App.deleteUser(${u.id}, '${this.escapeHtml(u.nombre)}')">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    openUserModal(userId = null) {
        const form = document.getElementById('form-usuario');
        if (form) form.reset();

        const roleSelect = document.getElementById('usuario-rol-id');
        if (roleSelect) {
            roleSelect.innerHTML = (this.state.roles || []).map(r => `
                <option value="${r.id}">${this.escapeHtml(r.nombre)}</option>
            `).join('');
        }

        const idInput = document.getElementById('usuario-id');
        const passInput = document.getElementById('usuario-password');
        const passLabel = document.getElementById('label-usuario-password');
        const passHint = document.getElementById('hint-usuario-password');
        const modalTitle = document.getElementById('modal-usuario-title');

        if (userId) {
            const u = (this.state.users || []).find(item => parseInt(item.id) === parseInt(userId));
            if (!u) return;

            idInput.value = u.id;
            document.getElementById('usuario-nombre').value = u.nombre || '';
            document.getElementById('usuario-email').value = u.email || '';
            document.getElementById('usuario-telefono').value = u.telefono || '';
            document.getElementById('usuario-rol-id').value = u.rol_id || 1;
            document.getElementById('usuario-estado').value = u.estado || 'activo';

            passInput.value = '';
            passInput.required = false;
            if (passLabel) passLabel.innerHTML = 'Nueva Contraseña (Opcional)';
            if (passHint) passHint.textContent = 'Dejar en blanco para mantener la contraseña actual.';
            if (modalTitle) modalTitle.textContent = `Editar Usuario: ${u.nombre}`;
        } else {
            idInput.value = '';
            passInput.value = '';
            passInput.required = true;
            if (passLabel) passLabel.innerHTML = 'Contraseña de Acceso *';
            if (passHint) passHint.textContent = 'Asigna una contraseña segura para el acceso al sistema.';
            if (modalTitle) modalTitle.textContent = 'Registrar Nuevo Usuario';
        }

        this.openModal('modal-usuario');
    },

    async handleSaveUser(e) {
        e.preventDefault();
        const id = document.getElementById('usuario-id').value;
        const nombre = document.getElementById('usuario-nombre').value.trim();
        const email = document.getElementById('usuario-email').value.trim();
        const password = document.getElementById('usuario-password').value;
        const telefono = document.getElementById('usuario-telefono').value.trim();
        const rol_id = document.getElementById('usuario-rol-id').value;
        const estado = document.getElementById('usuario-estado').value;

        if (!nombre || !email) {
            API.showToast('Nombre y correo electrónico son requeridos', 'warning');
            return;
        }

        if (!id && !password) {
            API.showToast('Debes ingresar una contraseña para el nuevo usuario', 'warning');
            return;
        }

        try {
            const res = await API.post('configuracion.php?action=save_user', {
                id: id || undefined,
                nombre,
                email,
                password: password || undefined,
                telefono,
                rol_id: parseInt(rol_id),
                estado
            });

            API.showToast(res.message || 'Usuario guardado exitosamente', 'success');
            this.closeModal('modal-usuario');
            await this.loadConfigSummary();
            this.renderUsersList();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async deleteUser(userId, userName) {
        if (!confirm(`¿Estás seguro de eliminar al usuario "${userName}"?\nEsta acción no se puede deshacer.`)) {
            return;
        }

        try {
            const res = await API.post('configuracion.php?action=delete_user', { id: userId });
            API.showToast(res.message || 'Usuario eliminado', 'info');
            await this.loadConfigSummary();
            this.renderUsersList();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    // =============================================================
    // GESTIÓN DE ROLES Y PERMISOS
    // =============================================================
    renderRolesList() {
        const container = document.getElementById('roles-cards-grid');
        if (!container) return;

        const roles = this.state.roles || [];

        if (roles.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="grid-column:1/-1; padding:40px; text-align:center;">
                    <p style="color:var(--text-muted);">No hay roles configurados en la base de datos.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = roles.map(r => {
            const isMasterRole = (r.id === 1 || r.es_sistema == 1);
            const perms = r.permisos || {};

            const moduleBadges = [];
            if (perms.dashboard?.ver) moduleBadges.push('Dashboard');
            if (perms.cuentas?.ver) {
                const count = ['ver', 'crear', 'editar', 'eliminar'].filter(a => perms.cuentas[a]).length;
                moduleBadges.push(`Cuentas (${count}/4)`);
            }
            if (perms.perfiles?.ver) {
                const count = ['ver', 'crear', 'editar', 'eliminar'].filter(a => perms.perfiles[a]).length;
                moduleBadges.push(`Perfiles (${count}/4)`);
            }
            if (perms.clientes?.ver) {
                const count = ['ver', 'crear', 'editar', 'eliminar'].filter(a => perms.clientes[a]).length;
                moduleBadges.push(`Clientes (${count}/4)`);
            }
            if (perms.plataformas?.ver) {
                const count = ['ver', 'crear', 'editar', 'eliminar'].filter(a => perms.plataformas[a]).length;
                moduleBadges.push(`Plataformas (${count}/4)`);
            }
            if (perms.alertas?.ver) moduleBadges.push('Alertas');
            if (perms.configuracion?.ver) moduleBadges.push('Configuración');

            return `
                <div class="role-card">
                    <div class="role-card-header">
                        <div>
                            <div class="role-card-name">${this.escapeHtml(r.nombre)} ${isMasterRole ? '<span class="role-badge-system" style="font-size:0.65rem; background:rgba(99,102,241,0.2); color:#a5b4fc; padding:2px 6px; border-radius:4px; margin-left:6px;">Sistema</span>' : ''}</div>
                            <p class="role-card-desc">${this.escapeHtml(r.descripcion || 'Sin descripción')}</p>
                        </div>
                    </div>

                    <div class="role-card-chips">
                        ${moduleBadges.length > 0 ? moduleBadges.map(b => `<span class="role-perm-chip">${b}</span>`).join('') : '<span class="text-muted" style="font-size:0.75rem;">Sin permisos habilitados</span>'}
                    </div>

                    <div class="role-card-footer">
                        <span style="font-size:0.78rem; color:var(--text-muted);">👥 ${r.usuarios_count || 0} usuario(s)</span>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="btn-card-act" onclick="App.openRoleModal(${r.id})">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                <span>Permisos</span>
                            </button>
                            ${!isMasterRole ? `
                            <button type="button" class="btn-card-act" style="color:#f87171;" onclick="App.deleteRole(${r.id}, '${this.escapeHtml(r.nombre)}', ${r.usuarios_count || 0})">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    openRoleModal(roleId = null) {
        const form = document.getElementById('form-rol');
        if (form) form.reset();

        const idInput = document.getElementById('rol-id');
        const modalTitle = document.getElementById('modal-rol-title');

        if (roleId) {
            const r = (this.state.roles || []).find(item => parseInt(item.id) === parseInt(roleId));
            if (!r) return;

            idInput.value = r.id;
            document.getElementById('rol-nombre').value = r.nombre || '';
            document.getElementById('rol-descripcion').value = r.descripcion || '';
            if (modalTitle) modalTitle.textContent = `Editar Rol: ${r.nombre}`;

            const perms = r.permisos || {};
            document.querySelectorAll('#modal-rol input[type="checkbox"]').forEach(cb => {
                const match = cb.name.match(/perm\[(.*?)\]\[(.*?)\]/);
                if (match) {
                    const mod = match[1];
                    const act = match[2];
                    cb.checked = !!(perms[mod] && perms[mod][act]);
                }
            });
        } else {
            idInput.value = '';
            if (modalTitle) modalTitle.textContent = 'Registrar Nuevo Rol';
            document.querySelectorAll('#modal-rol input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            const dashCheck = document.querySelector('#modal-rol input[name="perm[dashboard][ver]"]');
            if (dashCheck) dashCheck.checked = true;
        }

        this.openModal('modal-rol');
    },

    async handleSaveRole(e) {
        e.preventDefault();
        const id = document.getElementById('rol-id').value;
        const nombre = document.getElementById('rol-nombre').value.trim();
        const descripcion = document.getElementById('rol-descripcion').value.trim();

        if (!nombre) {
            API.showToast('El nombre del rol es obligatorio', 'warning');
            return;
        }

        const permisos = {};
        document.querySelectorAll('#modal-rol input[type="checkbox"]').forEach(cb => {
            const match = cb.name.match(/perm\[(.*?)\]\[(.*?)\]/);
            if (match) {
                const mod = match[1];
                const act = match[2];
                if (!permisos[mod]) permisos[mod] = {};
                permisos[mod][act] = cb.checked;
            }
        });

        try {
            const res = await API.post('configuracion.php?action=save_role', {
                id: id || undefined,
                nombre,
                descripcion,
                permisos
            });

            API.showToast(res.message || 'Rol guardado exitosamente', 'success');
            this.closeModal('modal-rol');

            const currentUser = API.getUser();
            if (currentUser && parseInt(currentUser.rol_id) === parseInt(id)) {
                await Auth.checkSession();
                this.applyUIPermissions();
            }

            await this.loadConfigSummary();
            this.renderRolesList();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    async deleteRole(roleId, roleName, usersCount) {
        if (usersCount > 0) {
            alert(`⚠️ No se puede eliminar el rol "${roleName}" porque tiene ${usersCount} usuario(s) asignado(s).\n\nReasigna primero a esos usuarios a otro rol en la pestaña "Usuarios".`);
            return;
        }

        if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el rol "${roleName}"?`)) {
            return;
        }

        try {
            const res = await API.post('configuracion.php?action=delete_role', { id: roleId });
            API.showToast(res.message || 'Rol eliminado correctamente', 'info');
            await this.loadConfigSummary();
            this.renderRolesList();
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    // =============================================================
    // PARÁMETROS GENERALES DE CONFIGURACIÓN
    // =============================================================
    renderSettingsForm() {
        const s = this.state.settings || {};
        const val = (k, def = '') => (s[k] !== undefined && s[k] !== null) ? s[k] : def;

        const setInput = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        };

        setInput('cfg-empresa-nombre', val('empresa_nombre', 'StreamManager Pro'));
        setInput('cfg-empresa-telefono', val('empresa_telefono', ''));
        setInput('cfg-empresa-moneda', val('empresa_moneda', 'PEN'));
        setInput('cfg-empresa-simbolo', val('empresa_simbolo', 'S/'));
        setInput('cfg-dias-alerta', val('dias_alerta_vencimiento', '3'));
        setInput('cfg-github-repo', val('github_repo', 'networkturbo4-pixel/streampro'));
        setInput('cfg-github-branch', val('github_branch', 'main'));
        setInput('cfg-github-token', val('github_token', ''));

        const verLabel = document.getElementById('ota-current-version-label');
        if (verLabel) verLabel.textContent = `v${val('sistema_version', '2.7.0')}`;
    },

    async handleSaveSettings(e) {
        e.preventDefault();
        const data = {
            empresa_nombre: document.getElementById('cfg-empresa-nombre')?.value.trim() || '',
            empresa_telefono: document.getElementById('cfg-empresa-telefono')?.value.trim() || '',
            empresa_moneda: document.getElementById('cfg-empresa-moneda')?.value || 'PEN',
            empresa_simbolo: document.getElementById('cfg-empresa-simbolo')?.value.trim() || 'S/',
            dias_alerta_vencimiento: parseInt(document.getElementById('cfg-dias-alerta')?.value) || 3,
            github_repo: document.getElementById('cfg-github-repo')?.value.trim() || 'networkturbo4-pixel/streampro',
            github_branch: document.getElementById('cfg-github-branch')?.value.trim() || 'main',
            github_token: document.getElementById('cfg-github-token')?.value.trim() || ''
        };

        try {
            const res = await API.post('configuracion.php?action=save_settings', data);
            API.showToast(res.message || 'Configuración guardada exitosamente', 'success');
            if (res.settings) {
                this.state.settings = res.settings;
            }
        } catch (error) {
            API.showToast(error.message, 'error');
        }
    },

    // =============================================================
    // ACTUALIZADOR GITHUB OTA Y CONSOLA DE MIGRACIONES
    // =============================================================
    renderOTASection() {
        const s = this.state.settings || {};
        const setInput = (id, v) => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = v;
        };

        setInput('cfg-github-repo', s.github_repo || 'networkturbo4-pixel/streampro');
        setInput('cfg-github-branch', s.github_branch || 'main');
        setInput('cfg-github-token', s.github_token || '');

        const ver = s.sistema_version || '2.7.0';
        const verLabel = document.getElementById('ota-current-version-label');
        if (verLabel) verLabel.textContent = `v${ver}`;
    },

    appendOTALog(text, type = 'info') {
        const consoleBody = document.getElementById('ota-console-logs');
        if (!consoleBody) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', { hour12: false });

        let colorClass = 'text-muted';
        let prefix = '[INFO]';
        if (type === 'success') {
            colorClass = 'success';
            prefix = '[ÉXITO]';
        } else if (type === 'warn') {
            colorClass = 'warning';
            prefix = '[AVISO]';
        } else if (type === 'error') {
            colorClass = 'error';
            prefix = '[ERROR]';
        } else if (type === 'cyan') {
            colorClass = 'cyan';
            prefix = '[OTA]';
        }

        const line = document.createElement('div');
        line.className = `log-line ${colorClass}`;
        line.textContent = `[${timeStr}] ${prefix} ${text}`;
        consoleBody.appendChild(line);

        consoleBody.scrollTop = consoleBody.scrollHeight;
    },

    async checkGitHubUpdate() {
        const btn = document.getElementById('btn-check-github');
        const statusBox = document.getElementById('ota-status-box');
        const statusContent = document.getElementById('ota-status-content');

        const repo = document.getElementById('cfg-github-repo')?.value.trim() || 'networkturbo4-pixel/streampro';
        const branch = document.getElementById('cfg-github-branch')?.value.trim() || 'main';
        const token = document.getElementById('cfg-github-token')?.value.trim() || '';

        try {
            await API.post('configuracion.php?action=save_settings', {
                github_repo: repo,
                github_branch: branch,
                github_token: token
            });
        } catch(e) {}

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid rgba(255,255,255,0.2); border-top-color:#fff; display:inline-block; vertical-align:middle; border-radius:50%; animation:spin 0.8s linear infinite;"></span> <span>Verificando...</span>`;
            }

            this.appendOTALog(`Consultando repositorio: https://github.com/${repo} (Rama: ${branch})...`, 'cyan');

            const res = await API.get('configuracion.php', { action: 'check_update' });

            if (!res.success) {
                this.appendOTALog(`Fallo en verificación: ${res.message || 'Error de conexión'}`, 'error');
                API.showToast(res.message || 'Error al conectar con GitHub', 'error');
                return;
            }

            this.state.otaStatus = res;

            if (statusBox) statusBox.style.display = 'block';

            if (res.status === 'empty_or_not_found') {
                this.appendOTALog(res.message, 'warn');
                if (statusContent) {
                    statusContent.innerHTML = `
                        <div class="ota-status-inner warn">
                            <div class="ota-status-icon">⚠️</div>
                            <div>
                                <strong style="color:#fbbf24; font-size:1rem;">Repositorio conectado (${this.escapeHtml(repo)})</strong>
                                <p style="margin:4px 0 6px 0; color:#e2e8f0; font-size:0.86rem;">${this.escapeHtml(res.message)}</p>
                                <small class="text-muted">Rama monitoreada: <code>${this.escapeHtml(branch)}</code> | Versión actual instalada: <code>v${this.escapeHtml(res.current_version)}</code></small>
                            </div>
                        </div>
                    `;
                }
                API.showToast('Repositorio conectado. Sin nuevos commits.', 'info');
                return;
            }

            if (res.update_available && res.remote_commit) {
                const c = res.remote_commit;
                this.appendOTALog(`¡Nueva versión detectada! Commit: ${c.short_sha} por ${c.author}: "${c.message}"`, 'success');
                if (statusContent) {
                    statusContent.innerHTML = `
                        <div class="ota-status-inner alert">
                            <div class="ota-status-icon">🚀</div>
                            <div style="flex:1;">
                                <strong style="color:#38bdf8; font-size:1rem;">¡Actualización disponible en GitHub!</strong>
                                <p style="margin:4px 0 8px 0; color:#e2e8f0; font-size:0.88rem;"><strong>Commit [${this.escapeHtml(c.short_sha)}]:</strong> ${this.escapeHtml(c.message)}</p>
                                <div style="font-size:0.78rem; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                                    <span>Autor: <strong style="color:#fff;">${this.escapeHtml(c.author)}</strong></span>
                                    <span>Fecha: <strong style="color:#fff;">${c.date ? c.date.substring(0, 10) : ''}</strong></span>
                                    <span>Versión actual: <strong>v${this.escapeHtml(res.current_version)}</strong></span>
                                </div>
                            </div>
                        </div>
                    `;
                }
                API.showToast('¡Nueva actualización disponible en GitHub!', 'success');
            } else {
                this.appendOTALog(`Sistema al día. Último commit verificado: ${res.last_commit || 'v' + res.current_version}`, 'success');
                if (statusContent) {
                    statusContent.innerHTML = `
                        <div class="ota-status-inner success">
                            <div class="ota-status-icon">✅</div>
                            <div>
                                <strong style="color:#10b981; font-size:1rem;">Sistema Actualizado</strong>
                                <p style="margin:4px 0 6px 0; color:#e2e8f0; font-size:0.86rem;">Tu instalación de StreamManager Pro tiene sincronizados los cambios más recientes de la rama <code>${this.escapeHtml(branch)}</code>.</p>
                                <small class="text-muted">Versión activa: <code>v${this.escapeHtml(res.current_version)}</code> | Commit: <code>${this.escapeHtml(res.last_commit)}</code></small>
                            </div>
                        </div>
                    `;
                }
                API.showToast('El sistema ya está actualizado', 'info');
            }

        } catch (error) {
            this.appendOTALog(`Error en la comprobación: ${error.message}`, 'error');
            API.showToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Comprobar Actualizaciones</span>`;
            }
        }
    },

    async applyGitHubUpdate() {
        if (!confirm('⚠️ ¿Deseas aplicar la actualización desde GitHub?\n\n- Se sincronizarán los archivos del sistema.\n- Se ejecutarán automáticamente migraciones de base de datos pendientes si existen.\n- Tus cuentas, clientes, perfiles y contraseñas NO serán borrados ni modificados.')) {
            return;
        }

        const btn = document.getElementById('btn-apply-github');
        const targetSha = this.state.otaStatus?.remote_commit?.sha || '';

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border:2px solid rgba(255,255,255,0.2); border-top-color:#fff; display:inline-block; vertical-align:middle; border-radius:50%; animation:spin 0.8s linear infinite;"></span> <span>Instalando...</span>`;
            }

            this.appendOTALog('Iniciando proceso de actualización y migración segura...', 'cyan');

            const res = await API.post('configuracion.php?action=apply_update', { sha: targetSha });

            if (res.logs && Array.isArray(res.logs)) {
                res.logs.forEach(l => {
                    const type = l.includes('Error') ? 'error' : (l.includes('Aviso') ? 'warn' : (l.includes('exitosamente') || l.includes('correctamente') ? 'success' : 'info'));
                    this.appendOTALog(l, type);
                });
            }

            if (res.success) {
                this.appendOTALog('¡Actualización completada exitosamente! Recargando aplicación...', 'success');
                API.showToast(res.message || 'Actualización aplicada exitosamente', 'success');

                if (res.new_version) {
                    const verLabel = document.getElementById('ota-current-version-label');
                    if (verLabel) verLabel.textContent = `v${res.new_version}`;
                }

                setTimeout(() => {
                    window.location.reload();
                }, 2500);
            } else {
                this.appendOTALog(`Fallo en la actualización: ${res.message || 'Error desconocido'}`, 'error');
                API.showToast(res.message || 'Error al aplicar actualización', 'error');
            }

        } catch (error) {
            this.appendOTALog(`Error crítico durante la actualización: ${error.message}`, 'error');
            API.showToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Instalar y Aplicar Actualización</span>`;
            }
        }
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

window.App = App;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
    App.init();
});
