// --- START OF FILE js/auth.js ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    if (isLoggedIn()) {
        redirectTo('index.html');
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = ''; // Clear previous error

        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await authFetch('https://g0tqrn67-5000.euw.devtunnels.ms/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            setAccessToken(data.access_token);
            setUsername(username); // Store username
            redirectTo('index.html');
        } catch (error) {
            loginError.textContent = error.message;
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';

        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            const response = await fetch('https://g0tqrn67-5000.euw.devtunnels.ms/auth/register', {  // No authFetch for registration
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });
            const data = await response.json();
            if (response.status === 201) {
              //Auto-login
              const loginResponse = await authFetch('https://g0tqrn67-5000.euw.devtunnels.ms/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
               });
                const loginData = await loginResponse.json();
                setAccessToken(loginData.access_token);
                setUsername(username); // Store username
                redirectTo('index.html');
            }
            else {
              registerError.textContent = data.message;
            }

        } catch (error) {
            registerError.textContent = error.message;
        }
    });
});

// --- END OF FILE js/auth.js ---