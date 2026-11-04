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

// Landing Elements
const chatInput = document.getElementById('aiInput');
const sendChatBtn = document.getElementById('aiSendBtn');
const micBtn = document.getElementById('aiMicBtn');

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

if (openModalBtn) openModalBtn.addEventListener('click', showAuthModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', hideAuthModal);

window.addEventListener('click', (event) => {
    if (event.target === authModal) hideAuthModal();
});

// TAB SWITCH: CREATE ACCOUNT / SIGN IN
function setAuthMode(signUp) {
    isSignUpMode = signUp;
    if (tabSignUp) {
        tabSignUp.classList.toggle('active', signUp);
        tabSignUp.setAttribute('aria-selected', String(signUp));
    }
    if (tabSignIn) {
        tabSignIn.classList.toggle('active', !signUp);
        tabSignIn.setAttribute('aria-selected', String(!signUp));
    }
    if (modalActionTitle) {
        modalActionTitle.innerText = signUp ? "Create an Account" : "Sign In with Email";
    }
    if (emailActionBtn) {
        emailActionBtn.innerText = signUp ? "Sign Up" : "Sign In";
    }
}

if (tabSignUp) tabSignUp.addEventListener('click', () => setAuthMode(true));
if (tabSignIn) tabSignIn.addEventListener('click', () => setAuthMode(false));

function applyAuthState(user) {
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (user) {
        if (openModalBtn) openModalBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'inline-block';
        hideAuthModal();
        
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || "User"));
        if (userNameSpan) userNameSpan.textContent = displayName;

        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = "Ask a question...";
            if (sendChatBtn) sendChatBtn.disabled = false;
            if (micBtn) micBtn.disabled = false;
        }

        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.innerText = "Checkout";
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
        }
    }
}

// EMAIL LOGIC
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
    if (e.key === 'Escape') {
        closeDropdown();
    }
});

if (menuSignOut) {
    menuSignOut.addEventListener('click', () => {
        closeDropdown();
        localStorage.removeItem(SESSION_KEY);
        applyAuthState(null);
        signOut(auth).catch((error) => console.error("Sign Out failed: ", error));
    });
}

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
        });
    });
}

// SESSION INITIALIZATION
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

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'true' || window.location.hash === '#signin' || window.location.hash === '#auth') {
    if (!localStorage.getItem(SESSION_KEY)) {
        showAuthModal();
    }
}

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


// ===== GLOBAL RAZORPAY CHECKOUT FOR HOMEPAGE & ACHAR =====
const API_BASE = "https://grounded-api.theteamgrounded.workers.dev";

function buildItemId(item) {
    const variant = String(item.variant || '').replace(/ \| Unsweetened$/, '');
    return variant ? `${item.name} - ${variant}` : item.name;
}

function setCheckoutBusy(busy) {
    const btn = document.getElementById('checkoutBtn');
    if (btn) btn.disabled = busy;
}

function clearShippingInputErrors() {
    ['shippingFirstName', 'shippingLastName', 'shippingAddress', 'shippingPincode'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.hasShippingListener) {
            el.dataset.hasShippingListener = 'true';
            el.addEventListener('input', () => {
                if (el.value.trim()) {
                    el.classList.remove('input-error');
                }
                const errEl = document.getElementById('shippingError');
                if (errEl && !document.querySelector('.shipping-input.input-error')) {
                    errEl.textContent = '';
                    errEl.style.display = 'none';
                }
            });
        }
    });
}

function validateShippingDetails() {
    clearShippingInputErrors();
    const fnInput = document.getElementById('shippingFirstName');
    const lnInput = document.getElementById('shippingLastName');
    const addrInput = document.getElementById('shippingAddress');
    const pinInput = document.getElementById('shippingPincode');
    const errEl = document.getElementById('shippingError');

    const firstName = fnInput ? fnInput.value.trim() : '';
    const lastName = lnInput ? lnInput.value.trim() : '';
    const address = addrInput ? addrInput.value.trim() : '';
    const pincode = pinInput ? pinInput.value.trim() : '';

    [fnInput, lnInput, addrInput, pinInput].forEach(el => {
        if (el) el.classList.remove('input-error');
    });
    if (errEl) {
        errEl.textContent = '';
        errEl.style.display = 'none';
    }

    let firstMissing = null;
    let errorMsg = '';

    if (!pincode) {
        if (pinInput) pinInput.classList.add('input-error');
        firstMissing = pinInput || true;
        errorMsg = 'Pincode is required for shipping.';
    }
    if (!address) {
        if (addrInput) addrInput.classList.add('input-error');
        firstMissing = addrInput || true;
        errorMsg = 'Full Delivery Address is required for shipping.';
    }
    if (!lastName) {
        if (lnInput) lnInput.classList.add('input-error');
        firstMissing = lnInput || true;
        errorMsg = 'Last Name is required for shipping.';
    }
    if (!firstName) {
        if (fnInput) fnInput.classList.add('input-error');
        firstMissing = fnInput || true;
        errorMsg = 'First Name is required for shipping.';
    }

    if (firstMissing) {
        if (errEl) {
            errEl.textContent = errorMsg;
            errEl.style.display = 'block';
        }
        if (firstMissing !== true && typeof firstMissing.scrollIntoView === 'function') {
            firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (firstMissing !== true && typeof firstMissing.focus === 'function') {
            firstMissing.focus();
        }
        return null;
    }

    return { firstName, lastName, address, pincode };
}

async function startCheckout(cartItems) {
    let modalOpened = false;
    setCheckoutBusy(true);
    try {
        if (!cartItems || cartItems.length === 0) {
            alert("Your cart is empty! Please add a jar to checkout.");
            return;
        }

        const currentUser = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!currentUser) {
            alert("Please sign in to checkout.");
            return;
        }

        // Strict Shipping Validation
        const customer = validateShippingDetails();
        if (!customer) return;

        const userToken = await currentUser.getIdToken();

        const orderRes = await fetch(`${API_BASE}/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cart: cartItems,
                customer: customer,
                token: userToken
            })
        });
        const orderData = await orderRes.json();

        if (orderData.error) {
            alert(orderData.error);
            return;
        }

        const { key_id, amount, currency, order_id } = orderData;
        const options = {
            key: key_id,
            amount: amount,
            currency: currency,
            order_id: order_id,
            name: "Grounded",
            description: "Store Purchase",
            theme: { color: "#000000" },
            modal: {
                ondismiss: function () {
                    setCheckoutBusy(false);
                }
            },
            handler: async function (response) {
                try {
                    const freshToken = await window.firebaseAuth.currentUser.getIdToken(true);
                    const verifyRes = await fetch(`${API_BASE}/verify-payment`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            token: freshToken
                        })
                    });
                    const verifyData = await verifyRes.json();

                    if (verifyData.status === "success") {
                        if (window.cart) window.cart.length = 0;
                        if (typeof window.saveCart === 'function') window.saveCart();
                        if (typeof window.closeCartModal === 'function') window.closeCartModal();
                        document.querySelectorAll('.shipping-input').forEach(el => { el.value = ''; });
                        alert("Payment Successful! Order confirmed.");
                    } else {
                        alert("Payment verification failed. If money was deducted, please contact support.");
                    }
                } catch (verifyErr) {
                    console.error("Verification error:", verifyErr);
                    alert("Payment verification failed. If money was deducted, please contact support.");
                } finally {
                    setCheckoutBusy(false);
                }
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        modalOpened = true;

    } catch (err) {
        console.error("Checkout error:", err);
        alert("Could not start checkout. Please try again.");
    } finally {
        if (!modalOpened) setCheckoutBusy(false);
    }
}

document.addEventListener('click', (e) => {
    const btn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('#checkoutBtn') : null;
    if (!btn || btn.disabled) return;

    const isUserLoggedIn = Boolean(
        (window.firebaseAuth && window.firebaseAuth.currentUser) ||
        localStorage.getItem(SESSION_KEY)
    );

    if (!isUserLoggedIn) {
        showAuthModal();
        return;
    }

    const items = (window.cart || []).map(item => ({
        itemId: buildItemId(item),
        quantity: item.qty,
        name: item.name,
        variant: item.variant
    }));
    startCheckout(items);
});

export {
    auth, googleProvider, SESSION_KEY, setAuthMode, applyAuthState,
    showAuthModal, hideAuthModal, closeDropdown, toggleDropdown,
    buildItemId, setCheckoutBusy, startCheckout, validateShippingDetails
};

