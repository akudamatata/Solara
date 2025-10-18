(function () {
    const overlay = document.getElementById('authOverlay');
    const mainContainer = document.getElementById('mainContainer');
    const form = document.getElementById('authForm');
    const passwordInput = document.getElementById('authPassword');
    const errorMessage = document.getElementById('authError');
    const message = document.getElementById('authMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    if (!overlay || !mainContainer || !form || !passwordInput || !errorMessage || !message || !submitButton) {
        document.body.classList.remove('auth-locked');
        return;
    }

    let checking = false;
    const promptMessage = '站点已设置访问密码，请输入以继续访问。';

    mainContainer.setAttribute('aria-hidden', 'true');

    const toBoolean = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
        }
        return Boolean(value);
    };

    const setOverlayState = (state) => {
        if (!overlay) return;
        if (state === 'hidden') {
            overlay.hidden = true;
            overlay.dataset.state = '';
        } else {
            overlay.hidden = false;
            overlay.dataset.state = state;
        }
    };

    const setBusy = (isBusy) => {
        checking = isBusy;
        form.classList.toggle('is-busy', isBusy);
        passwordInput.disabled = isBusy;
        submitButton.disabled = isBusy;
    };

    const lockApp = () => {
        document.body.classList.remove('auth-ready');
        document.body.classList.add('auth-locked');
        mainContainer.setAttribute('aria-hidden', 'true');
    };

    const showError = (text) => {
        if (!text) {
            errorMessage.textContent = '';
            errorMessage.hidden = true;
            return;
        }
        errorMessage.textContent = text;
        errorMessage.hidden = false;
    };

    const unlockApp = () => {
        document.body.classList.remove('auth-locked');
        document.body.classList.add('auth-ready');
        mainContainer.removeAttribute('aria-hidden');
        setOverlayState('hidden');
    };

    const showPrompt = (text) => {
        lockApp();
        message.textContent = text || promptMessage;
        setOverlayState('form');
    };

    const focusPasswordInput = () => {
        window.setTimeout(() => {
            passwordInput.focus({ preventScroll: true });
        }, 50);
    };

    const checkStatus = async () => {
        showError('');

        try {
            const response = await fetch('/auth', { credentials: 'include' });
            if (response.status === 404) {
                unlockApp();
                return;
            }

            const payload = await response
                .clone()
                .json()
                .catch(() => null);

            if (!response.ok) {
                throw new Error('AUTH_STATUS_ERROR');
            }

            if (!payload || typeof payload !== 'object') {
                unlockApp();
                return;
            }

            const passwordRequired = toBoolean(payload.passwordRequired);
            const authenticated = toBoolean(payload.authenticated);

            if (!passwordRequired || authenticated) {
                unlockApp();
                return;
            }

            showPrompt();
            focusPasswordInput();
        } catch (error) {
            console.error('[Solara] Failed to verify password status.', error);
            showPrompt('无法连接到验证服务，请稍后重试。');
            focusPasswordInput();
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (checking) return;

        const password = passwordInput.value.trim();
        if (!password) {
            showError('请输入访问密码。');
            focusPasswordInput();
            return;
        }

        showError('');
        setBusy(true);
        showPrompt();

        try {
            const response = await fetch('/auth', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }),
            });

            const payload = await response.json().catch(() => ({}));
            const { authenticated, error: authError } = payload;

            if (!response.ok || !authenticated) {
                showPrompt();
                const errorText =
                    typeof authError === 'string' && authError.trim()
                        ? authError.trim()
                        : '密码不正确，请重试。';
                showError(errorText);
                focusPasswordInput();
                passwordInput.select();
                return;
            }

            unlockApp();
        } catch (error) {
            console.error('[Solara] Failed to authenticate.', error);
            showPrompt('验证过程中出现问题，请稍后重试。');
            showError('验证过程中出现问题，请稍后重试。');
            focusPasswordInput();
        } finally {
            setBusy(false);
        }
    });

    checkStatus();
})();
