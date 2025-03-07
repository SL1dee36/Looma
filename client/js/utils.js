// --- START OF FILE js/utils.js --- (Corrected)

// Determine the base URL for API calls
const API_BASE_URL = window.location.protocol === "file:"
    ? ""  // Local development
    : ""; // Use relative URLs when deployed or through the tunnel

function getAccessToken() {
    return localStorage.getItem('accessToken');
}

function setAccessToken(token) {
    localStorage.setItem('accessToken', token);
}

function clearAccessToken() {
    localStorage.removeItem('accessToken');
}

function isLoggedIn() {
    return !!getAccessToken(); // Double negation converts null/undefined to false, string to true
}

function getUsername() {
    return localStorage.getItem('username');
}

function setUsername(username) {
    localStorage.setItem('username', username);
}

function clearUsername() {
    localStorage.removeItem('username');
}

// Redirect to a given URL
function redirectTo(url) {
    window.location.href = url;
}

// Fetch with authorization header and error handling
async function authFetch(url, options = {}) {
    const token = getAccessToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }), // Add token if logged in
        ...options.headers, // Allow overriding headers
    };

    const fullUrl = `${API_BASE_URL}${url}`; // Construct the full URL
    const response = await fetch(fullUrl, { ...options, headers });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'An error occurred'); // Handle server errors
    }

    return response; // Or response.json() if you expect JSON
}
// --- END OF FILE js/utils.js ---