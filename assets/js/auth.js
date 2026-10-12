/**
 * Módulo de Autenticación - StreamManager Pro
 * Maneja el inicio de sesión, verificación de token, demo login y cierre de sesión.
 */

const Auth = {
    init() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Recuperar usuario recordado previamente si existe
        try {
            const savedEmail = localStorage.getItem('sm_remembered_email');
            const emailInput = document.getElementById('login-email');
            const rememberCheck = document.getElementById('login-remember');
            if (savedEmail && emailInput) {
                emailInput.value = savedEmail;
                if (rememberCheck) rememberCheck.checked = true;
            }
        } catch (e) {
            // Ignorar fallos de acceso a localStorage
        }

        const togglePassBtn = document.getElementById('btn-toggle-password');
        if (togglePassBtn) {
            togglePassBtn.addEventListener('click', () => {
                const passInput = document.getElementById('login-password');
                if (passInput) {
                    const isPassword = passInput.type === 'password';
                    passInput.type = isPassword ? 'text' : 'password';
                    togglePassBtn.innerHTML = isPassword 
                        ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
                        : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
                }
            });
        }

        const logoutBtns = document.querySelectorAll('.btn-logout');
        logoutBtns.forEach(btn => {
            btn.addEventListener('click', () => this.handleLogout());
        });
    },

    async checkSession() {
        const token = API.getToken();
        if (!token) {
            this.showLogin();
            return false;
        }

        try {
            const res = await API.get('auth.php', { action: 'check' });
            if (res.authenticated && res.user) {
                API.setUser(res.user);
                this.showApp(res.user);
                return true;
            } else {
                this.showLogin();
                return false;
            }
        } catch (e) {
            console.warn('Sesión no válida o expirada:', e);
            this.showLogin();
            return false;
        }
    },

    async handleLogin(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-login-submit');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            API.showToast('Por favor completa todos los campos', 'warning');
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="spinner"></span> <span>Ingresando...</span>`;
            }

            const res = await API.post('auth.php?action=login', { email, password });
            if (res.success && res.token) {
                // Guardar o borrar correo según checkbox de recordar
                try {
                    const rememberCheck = document.getElementById('login-remember');
                    if (rememberCheck && rememberCheck.checked) {
                        localStorage.setItem('sm_remembered_email', email);
                    } else {
                        localStorage.removeItem('sm_remembered_email');
                    }
                } catch (e) {
                    // Ignorar fallos de localStorage
                }

                API.setToken(res.token);
                API.setUser(res.user);
                API.showToast(res.message || '¡Acceso concedido!', 'success');
                this.showApp(res.user);
                if (window.App && typeof window.App.loadAllData === 'function') {
                    window.App.loadAllData();
                }
            }
        } catch (error) {
            API.showToast(error.message || 'Error al iniciar sesión', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span class="btn-text">Ingresar al Sistema</span> <svg class="btn-arrow-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
            }
        }
    },

    async handleLogout() {
        if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) return;
        try {
            await API.post('auth.php?action=logout');
        } catch (e) {
            // Ignorar
        }
        API.setToken(null);
        API.setUser(null);
        API.showToast('Sesión finalizada', 'info');
        this.showLogin();
    },

    showLogin() {
        const loginView = document.getElementById('view-login');
        const appView = document.getElementById('view-app');
        if (loginView) loginView.classList.remove('hidden');
        if (appView) appView.classList.add('hidden');
    },

    showApp(user) {
        const loginView = document.getElementById('view-login');
        const appView = document.getElementById('view-app');
        if (loginView) loginView.classList.add('hidden');
        if (appView) appView.classList.remove('hidden');

        // Actualizar datos del usuario en la interfaz
        const userNameEls = document.querySelectorAll('.current-user-name');
        userNameEls.forEach(el => el.textContent = user.nombre || 'Administrador');

        const userEmailEls = document.querySelectorAll('.current-user-email');
        userEmailEls.forEach(el => el.textContent = user.email || 'admin@stream.app');

        const userRoleEls = document.querySelectorAll('.current-user-role');
        userRoleEls.forEach(el => el.textContent = user.rol_nombre || 'Rol');

        if (window.App && typeof window.App.applyUIPermissions === 'function') {
            window.App.applyUIPermissions();
        }
    }
};

window.Auth = Auth;
window.showLoginView = () => Auth.showLogin();
