/**
 * PWA Manager - StreamManager Pro
 * Maneja registro de Service Worker, instalación en dispositivo (Android, Windows, Mac, iOS),
 * detección de conectividad online/offline y actualizaciones de versión.
 */

const PWA = {
    deferredPrompt: null,
    isStandalone: false,
    isIOS: false,

    init() {
        this.detectPlatform();
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupConnectivityWatch();
        this.checkInitialDisplayMode();
    },

    detectPlatform() {
        const ua = window.navigator.userAgent.toLowerCase();
        this.isIOS = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                            window.navigator.standalone === true || 
                            document.referrer.includes('android-app://');

        if (this.isStandalone) {
            document.documentElement.classList.add('pwa-standalone');
        }
    },

    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('PWA: Service Worker no soportado en este navegador.');
            return;
        }

        try {
            // El Service Worker se registra relativo a la ubicación actual
            const registration = await navigator.serviceWorker.register('./sw.js', {
                scope: './'
            });

            console.log('PWA: Service Worker registrado exitosamente con scope:', registration.scope);

            // Escuchar si hay una actualización pendiente
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.showUpdateBanner(newWorker);
                    }
                });
            });

            // Recargar cuando el nuevo worker tome el control
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });

            // Verificar actualizaciones periódicamente
            setInterval(() => {
                registration.update().catch(() => {});
            }, 60 * 60 * 1000); // Cada 1 hora

        } catch (error) {
            console.warn('PWA: Error al registrar el Service Worker:', error);
        }
    },

    setupInstallPrompt() {
        // Evento nativo de instalación en Chrome, Edge y navegadores Chromium
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButtons();
        });

        // Evento cuando la aplicación ya fue instalada
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.hideInstallButtons();
            if (typeof API !== 'undefined' && API.showToast) {
                API.showToast('¡StreamManager Pro instalado correctamente!', 'success');
            }
        });

        // Configurar botones de instalación existentes en la interfaz
        this.bindInstallButtons();
    },

    bindInstallButtons() {
        const installBtns = document.querySelectorAll('.btn-pwa-install');
        installBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.promptInstall();
            });
        });
    },

    promptInstall() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('PWA: El usuario aceptó la instalación.');
                } else {
                    console.log('PWA: El usuario canceló la instalación.');
                }
                this.deferredPrompt = null;
            });
        } else if (this.isIOS && !this.isStandalone) {
            this.showIOSInstallModal();
        } else {
            // Ya está instalada o navegador no soporta prompt programático
            if (typeof API !== 'undefined' && API.showToast) {
                API.showToast('La aplicación ya está instalada o puedes añadirla desde el menú de tu navegador.', 'info');
            }
        }
    },

    showInstallButtons() {
        if (this.isStandalone) return;

        const installElements = document.querySelectorAll('.pwa-install-trigger');
        installElements.forEach(el => {
            el.style.display = 'inline-flex';
            el.classList.remove('hidden');
        });
    },

    hideInstallButtons() {
        const installElements = document.querySelectorAll('.pwa-install-trigger');
        installElements.forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
    },

    checkInitialDisplayMode() {
        if (this.isStandalone) {
            this.hideInstallButtons();
        } else if (this.isIOS) {
            // En iOS Safari, podemos mostrar el botón de ayuda para añadir a inicio
            this.showInstallButtons();
        }
    },

    setupConnectivityWatch() {
        const updateNetworkStatus = () => {
            const isOnline = navigator.onLine;
            this.toggleNetworkBadge(isOnline);

            if (isOnline) {
                if (typeof API !== 'undefined' && API.showToast) {
                    API.showToast('Conexión a internet restablecida', 'success', 2500);
                }
                // Si la app principal está inicializada, recargar datos en segundo plano
                if (typeof App !== 'undefined' && typeof App.loadAllData === 'function') {
                    App.loadAllData().catch(() => {});
                }
            } else {
                if (typeof API !== 'undefined' && API.showToast) {
                    API.showToast('Sin conexión a internet. Modo offline activado.', 'error', 4000);
                }
            }
        };

        window.addEventListener('online', updateNetworkStatus);
        window.addEventListener('offline', updateNetworkStatus);

        // Estado inicial
        if (!navigator.onLine) {
            this.toggleNetworkBadge(false);
        }
    },

    toggleNetworkBadge(isOnline) {
        let badge = document.getElementById('pwa-network-badge');
        if (!badge) {
            const container = document.querySelector('.top-navbar .top-actions') || document.body;
            badge = document.createElement('div');
            badge.id = 'pwa-network-badge';
            badge.className = 'pwa-network-badge';
            container.insertBefore(badge, container.firstChild);
        }

        if (isOnline) {
            badge.className = 'pwa-network-badge online';
            badge.innerHTML = `
                <span class="pwa-badge-dot"></span>
                <span>En Línea</span>
            `;
            setTimeout(() => {
                badge.style.display = 'none';
            }, 3000);
        } else {
            badge.style.display = 'inline-flex';
            badge.className = 'pwa-network-badge offline';
            badge.innerHTML = `
                <span class="pwa-badge-dot blink"></span>
                <span>Modo Offline</span>
            `;
        }
    },

    showUpdateBanner(worker) {
        let updateBar = document.getElementById('pwa-update-bar');
        if (!updateBar) {
            updateBar = document.createElement('div');
            updateBar.id = 'pwa-update-bar';
            updateBar.className = 'pwa-update-bar animate-fade-in';
            updateBar.innerHTML = `
                <div class="pwa-update-content">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                    <span>Nueva versión de StreamManager Pro disponible</span>
                </div>
                <div class="pwa-update-actions">
                    <button id="btn-pwa-reload" class="btn-update-now">Actualizar</button>
                    <button id="btn-pwa-dismiss" class="btn-update-dismiss" title="Cerrar">&times;</button>
                </div>
            `;
            document.body.appendChild(updateBar);

            document.getElementById('btn-pwa-reload').addEventListener('click', () => {
                worker.postMessage({ action: 'skipWaiting' });
            });

            document.getElementById('btn-pwa-dismiss').addEventListener('click', () => {
                updateBar.remove();
            });
        }
    },

    showIOSInstallModal() {
        let modal = document.getElementById('modal-ios-install');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-ios-install';
            modal.className = 'modal-overlay active animate-fade-in';
            modal.innerHTML = `
                <div class="modal-container" style="max-width: 400px; text-align: center;">
                    <div class="modal-header" style="justify-content: flex-end; padding-bottom: 0; border-bottom: none;">
                        <button class="btn-close-modal" onclick="document.getElementById('modal-ios-install').remove()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding-top: 5px;">
                        <img src="assets/icons/icon-192x192.png" width="68" height="68" style="border-radius: 16px; margin: 0 auto 16px; box-shadow: 0 8px 24px rgba(99,102,241,0.3);" alt="StreamPRO">
                        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 8px;">Instalar StreamManager PRO</h3>
                        <p style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.5; margin-bottom: 20px;">
                            Instala esta aplicación en tu iPhone o iPad para usarla a pantalla completa como una app nativa:
                        </p>
                        <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; text-align: left; font-size: 0.85rem; display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">1</div>
                                <span>Pulsa el botón <strong>Compartir</strong> (icono <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; display: inline-block;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>) en Safari.</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">2</div>
                                <span>Desliza hacia abajo y toca <strong>"Añadir a pantalla de inicio"</strong>.</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">3</div>
                                <span>Toca <strong>Añadir</strong> en la esquina superior derecha.</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="justify-content: center;">
                        <button type="button" class="btn-action-primary" style="width: 100%; justify-content: center;" onclick="document.getElementById('modal-ios-install').remove()">¡Entendido!</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PWA.init());
} else {
    PWA.init();
}

window.PWA = PWA;
