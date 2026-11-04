import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBKZz6FNizCDMf8LnG7-n9a0H26MU8ZN_I",
    authDomain: "grounded-store.firebaseapp.com",
    projectId: "grounded-store",
    storageBucket: "grounded-store.firebasestorage.app",
    messagingSenderId: "110467572354",
    appId: "1:110467572354:web:86747ada335b7289e38a9b",
    measurementId: "G-HB8L303TNC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
window.firebaseAuth = auth;
const googleProvider = new GoogleAuthProvider();

const SESSION_KEY = 'grounded_user';

// UI Elements
const authModal = document.getElementById('auth-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const userProfile = document.getElementById('user-profile');
const userNameSpan = document.getElementById('user-name');
const userMenuBtn = document.getElementById('user-menu-btn');
const userDropdownMenu = document.getElementById('user-dropdown-menu');
const menuSignOut = document.getElementById('menu-sign-out');
const menuSwitchAccount = document.getElementById('menu-switch-account');

// Modal Views
const defaultView = document.getElementById('modal-default-view');
const phoneView = document.getElementById('modal-phone-view');
const otpView = document.getElementById('modal-otp-view');

// Buttons & Inputs
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const emailActionBtn = document.getElementById('email-action-btn');
const tabSignUp = document.getElementById('tab-signup');
const tabSignIn = document.getElementById('tab-signin');
const modalActionTitle = document.getElementById('modal-action-title');

const btnGoogle = document.getElementById('btn-google');
const btnPhone = document.getElementById('btn-phone');

const phoneInput = document.getElementById('phone-number');
const sendOtpBtn = document.getElementById('send-code-btn');
const otpInput = document.getElementById('otp-code');
const verifyOtpBtn = document.getElementById('verify-code-btn');

// Store Elements
const chatInput = document.getElementById('aiInput');
const sendChatBtn = document.getElementById('aiSendBtn');
const micBtn = document.getElementById('aiMicBtn');
const checkoutBtn = document.getElementById('checkoutBtn');

// State Tracker
let isSignUpMode = true;

// Setup invisible reCAPTCHA for Phone Auth
if (document.getElementById('recaptcha-container')) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { 'size': 'invisible' });
}

function showAuthModal() {
    if (authModal) {
        authModal.style.display = 'flex';
        if (defaultView) defaultView.style.display = 'block';
        if (phoneView) phoneView.style.display = 'none';
        if (otpView) otpView.style.display = 'none';
    }
}

function hideAuthModal() {
    if (authModal) authModal.style.display = 'none';
}

// MODAL LOGIC
if (openModalBtn) openModalBtn.addEventListener('click', showAuthModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', hideAuthModal);

window.addEventListener('click', (event) => {
    if (event.target === authModal) hideAuthModal();
});

// TAB SWITCH: CREATE ACCOUNT / SIGN IN
function setAuthMode(signUp) {
    isSignUpMode = signUp;
    if (tabSignUp) { tabSignUp.classList.toggle('active', signUp); tabSignUp.setAttribute('aria-selected', String(signUp)); }
    if (tabSignIn) { tabSignIn.classList.toggle('active', !signUp); tabSignIn.setAttribute('aria-selected', String(!signUp)); }
    if (modalActionTitle) modalActionTitle.innerText = signUp ? "Create an Account" : "Sign In with Email";
    if (emailActionBtn) emailActionBtn.innerText = signUp ? "Sign Up" : "Sign In";
}
if (tabSignUp) tabSignUp.addEventListener('click', () => setAuthMode(true));
if (tabSignIn) tabSignIn.addEventListener('click', () => setAuthMode(false));

// EMAIL LOGIC (Sign In & Sign Up)
if (emailActionBtn) {
    emailActionBtn.addEventListener('click', () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!email || !password) {
            return alert("Please enter both email and password.");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return alert("Please enter a valid email address (e.g., yourname@domain.com).");
        }

        if (password.length < 6) {
            return alert("Password must be at least 6 characters long.");
        }
        
        emailActionBtn.innerText = "Processing...";
        
        if (isSignUpMode) {
            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    const userData = {
                        uid: user.uid,
                        displayName: user.displayName || email.split('@')[0],
                        email: user.email
                    };
                    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                    applyAuthState(userData);
                    hideAuthModal();
                })
                .catch((error) => {
                    alert("Sign Up failed: " + error.message);
                    emailActionBtn.innerText = "Sign Up";
                });
        } else {
            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    const userData = {
                        uid: user.uid,
                        displayName: user.displayName || email.split('@')[0],
                        email: user.email
                    };
                    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                    applyAuthState(userData);
                    hideAuthModal();
                })
                .catch((error) => {
                    alert("Login failed: " + error.message);
                    emailActionBtn.innerText = "Sign In";
                });
        }
    });
}

// GOOGLE LOGIC
if (btnGoogle) {
    btnGoogle.addEventListener('click', () => {
        signInWithPopup(auth, googleProvider)
            .then((result) => {
                const user = result.user;
                const userData = {
                    uid: user.uid,
                    displayName: user.displayName || user.email.split('@')[0],
                    email: user.email
                };
                localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                applyAuthState(userData);
                hideAuthModal();
            })
            .catch((error) => console.error("Google Login failed: ", error));
    });
}

// PHONE NAVIGATION LOGIC
if (btnPhone) {
    btnPhone.addEventListener('click', () => {
        defaultView.style.display = 'none';
        phoneView.style.display = 'block';
    });
}

if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', () => {
        const rawNumber = phoneInput.value.trim();
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(rawNumber)) {
            return alert("Please enter a valid 10-digit Indian mobile number.");
        }

        const fullPhoneNumber = "+91" + rawNumber;
        sendOtpBtn.innerText = "SENDING...";
        
        signInWithPhoneNumber(auth, fullPhoneNumber, window.recaptchaVerifier)
            .then((confirmationResult) => {
                window.confirmationResult = confirmationResult;
                phoneView.style.display = 'none';
                otpView.style.display = 'block';
            }).catch((error) => {
                alert("Error: " + error.message); 
                sendOtpBtn.innerText = "SEND OTP";
            });
    });
}

if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', () => {
        const code = otpInput.value.trim();
        if (!/^\d{6}$/.test(code)) {
            return alert("Please enter a valid 6-digit OTP code.");
        }
        verifyOtpBtn.innerText = "VERIFYING...";

        window.confirmationResult.confirm(code).then((result) => {
            const user = result.user;
            const userData = {
                uid: user.uid,
                displayName: user.displayName || user.phoneNumber || "User",
                phoneNumber: user.phoneNumber
            };
            localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
            applyAuthState(userData);
            hideAuthModal();
        }).catch((error) => {
            alert("Invalid OTP code.");
            verifyOtpBtn.innerText = "VERIFY";
        });
    });
}

// DROPDOWN MENU LOGIC
function closeDropdown() {
    if (userDropdownMenu) userDropdownMenu.classList.remove('show');
    if (userMenuBtn) {
        userMenuBtn.classList.remove('active');
        userMenuBtn.setAttribute('aria-expanded', 'false');
    }
}

function toggleDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!userDropdownMenu) return;
    const isOpen = userDropdownMenu.classList.contains('show');
    if (isOpen) {
        closeDropdown();
    } else {
        userDropdownMenu.classList.add('show');
        if (userMenuBtn) {
            userMenuBtn.classList.add('active');
            userMenuBtn.setAttribute('aria-expanded', 'true');
        }
    }
}

if (userMenuBtn) userMenuBtn.addEventListener('click', toggleDropdown);

document.addEventListener('click', (e) => {
    if (userProfile && !userProfile.contains(e.target)) {
        closeDropdown();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
});

// GLOBAL SIGN OUT OPTION
if (menuSignOut) {
    menuSignOut.addEventListener('click', () => {
        closeDropdown();
        localStorage.removeItem(SESSION_KEY);
        applyAuthState(null);
        signOut(auth).catch((error) => console.error("Sign Out failed: ", error));
    });
}

// SIGN IN WITH ANOTHER ACCOUNT (Direct on Store Page)
if (menuSwitchAccount) {
    menuSwitchAccount.addEventListener('click', () => {
        closeDropdown();
        localStorage.removeItem(SESSION_KEY);
        applyAuthState(null);
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        signOut(auth).then(() => {
            showAuthModal();
        }).catch((error) => {
            console.error("Sign out before switch failed: ", error);
            showAuthModal();
        });
    });
}

function applyAuthState(user) {
    if (user) {
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || "User"));
        if (openModalBtn) openModalBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'inline-block';
        if (userNameSpan) userNameSpan.textContent = displayName;
        hideAuthModal();
        
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = "Ask The Roaster a question...";
            if (sendChatBtn) sendChatBtn.disabled = false;
            if (micBtn) micBtn.disabled = false;
        }
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.innerText = "Checkout";
            checkoutBtn.onclick = null;
        }
    } else {
        if (openModalBtn) openModalBtn.style.display = 'block';
        if (userProfile) userProfile.style.display = 'none';
        closeDropdown();

        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (otpInput) otpInput.value = '';
        if (emailActionBtn) emailActionBtn.innerText = isSignUpMode ? "Sign Up" : "Sign In";
        if (sendOtpBtn) sendOtpBtn.innerText = "SEND OTP";
        if (verifyOtpBtn) verifyOtpBtn.innerText = "VERIFY";

        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = "Please sign in to chat...";
            if (sendChatBtn) sendChatBtn.disabled = true;
            if (micBtn) micBtn.disabled = true;
        }
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.innerText = "Sign In to Checkout";
            checkoutBtn.onclick = () => {
                showAuthModal();
            };
        }
    }
}

// Immediately apply shared session from localStorage
try {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
        applyAuthState(JSON.parse(savedSession));
    } else {
        applyAuthState(null);
    }
} catch(e) {
    applyAuthState(null);
}

// Check URL parameters for direct modal open
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'true' || window.location.hash === '#signin' || window.location.hash === '#auth') {
    if (!localStorage.getItem(SESSION_KEY)) {
        showAuthModal();
    }
}

// Sync with Firebase auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || "User"));
        const userData = {
            uid: user.uid,
            displayName: displayName,
            email: user.email,
            phoneNumber: user.phoneNumber
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
        applyAuthState(userData);
    } else {
        if (!localStorage.getItem(SESSION_KEY)) {
            applyAuthState(null);
        }
    }
});

// Cross-tab / cross-page synchronization via Storage Event
window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY) {
        try {
            const sessionData = e.newValue ? JSON.parse(e.newValue) : null;
            applyAuthState(sessionData);
        } catch(err) {
            applyAuthState(null);
        }
    }
});

export {
    auth, googleProvider, SESSION_KEY, setAuthMode, applyAuthState,
    showAuthModal, hideAuthModal, closeDropdown, toggleDropdown
};
