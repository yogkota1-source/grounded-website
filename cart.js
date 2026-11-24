// ============================================================
// GROUNDED SHARED CART
// Loaded on every page (Home, Simply Seeded, ACHAR). The cart lives in
// localStorage ("groundedCart"), so every page and tab sees the same cart.
// ============================================================

const CART_KEY = 'groundedCart';
const TOAST_MS = 2200;
const FREE_SHIPPING_THRESHOLD = 1399;

// The one live cart array. It is only ever mutated in place, never reassigned.
const cart = [];
let toastTimer = null;

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function normalizeCart(raw) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    const list = Array.isArray(parsed) ? parsed : [];
    return list
        .filter(item => item && typeof item.name === 'string')
        .map(item => ({
            name: item.name,
            variant: typeof item.variant === 'string' ? item.variant : '',
            price: Number(item.price) || 0,
            qty: Math.max(1, parseInt(item.qty, 10) || 1)
        }));
}

function loadCart(raw) {
    cart.splice(0, cart.length, ...normalizeCart(raw));
}

function cartCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

function cartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// Quantity of a product. With no variant given, every variant of the name is counted.
function qtyOf(name, variant) {
    return cart
        .filter(item => item.name === name && (variant === undefined || item.variant === variant))
        .reduce((sum, item) => sum + item.qty, 0);
}

function lastIndexOfProduct(name, variant) {
    for (let i = cart.length - 1; i >= 0; i--) {
        if (cart[i].name === name && (variant === undefined || cart[i].variant === variant)) return i;
    }
    return -1;
}

function renderControl(el) {
    const qty = qtyOf(el.dataset.name, el.dataset.variant);
    if (qty === 0) {
        const priceNum = Number(el.dataset.price);
        const label = el.dataset.options
            ? 'Customize &amp; Add'
            : (priceNum > 0 ? `Add to Cart (₹${priceNum.toLocaleString('en-IN')})` : 'Add to Cart');
        el.innerHTML = `<button type="button" class="order-btn ac-add">${label}</button>`;
    } else {
        el.innerHTML =
            '<div class="qty-selector">' +
            '<button type="button" class="qty-btn ac-minus" aria-label="Decrease quantity">&minus;</button>' +
            `<span class="qty-value">${qty}</span>` +
            '<button type="button" class="qty-btn ac-plus" aria-label="Increase quantity">+</button>' +
            '</div>';
    }
}

function updateProgressBar(total) {
    const bar = document.getElementById("shippingBar");
    const text = document.getElementById("shippingText");
    if (!bar || !text) return;
    
    const safeTotal = (typeof total === 'number' && !isNaN(total) && total > 0) ? total : 0;
    
    if (safeTotal >= FREE_SHIPPING_THRESHOLD) {
        bar.style.width = "100%";
        bar.classList.add("unlocked-bar");
        text.classList.add("unlocked-text");
        text.innerText = "🎉 You unlocked FREE Shipping!";
    } else {
        const percentage = Math.max(0, Math.min(100, (safeTotal / FREE_SHIPPING_THRESHOLD) * 100));
        const away = Math.max(0, FREE_SHIPPING_THRESHOLD - safeTotal);
        bar.style.width = percentage + "%";
        bar.classList.remove("unlocked-bar");
        text.classList.remove("unlocked-text");
        text.innerText = `Add ₹${away} more for FREE Shipping!`;
    }
}

function ensureCartModal() {
    let modal = document.getElementById('cartModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cartModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn" onclick="closeCartModal()">&times;</span>
                <h3>Your Cart</h3>
                <div class="progress-container">
                    <div class="progress-bar" id="shippingBar"></div>
                </div>
                <div class="progress-text" id="shippingText">Add ₹1399 more for FREE Shipping!</div>
                <div id="cartItemsList"></div>
                <div class="cart-total-row">
                    <span>Subtotal:</span>
                    <span id="cartTotalDisplay">₹0</span>
                </div>
                <div class="shipping-fields" id="shippingFields">
                    <div class="shipping-row">
                        <input type="text" id="shippingFirstName" class="shipping-input" placeholder="First Name *" maxlength="80" autocomplete="given-name">
                        <input type="text" id="shippingLastName" class="shipping-input" placeholder="Last Name *" maxlength="80" autocomplete="family-name">
                    </div>
                    <input type="text" id="shippingAddress" class="shipping-input" placeholder="Full Delivery Address *" maxlength="300" autocomplete="street-address">
                    <input type="text" id="shippingPincode" class="shipping-input" placeholder="Pincode *" maxlength="10" autocomplete="postal-code">
                    <div class="shipping-error" id="shippingError" style="display: none;"></div>
                </div>
                <button class="pay-btn" id="checkoutBtn" disabled>Sign in to Checkout</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCartModal();
        });
    }
    return modal;
}

function openCartModal() {
    ensureCartModal();
    let listHTML = '';
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    const shippingFields = document.getElementById("shippingFields");
    if (cart.length === 0) {
        listHTML = '<div style="color: #A0A0A0; text-align: center; margin-top: 80px; font-family: Georgia, serif;"><div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;">🥜</div><p style="font-style: italic; font-size: 1.1rem; margin: 0;">Your pantry is waiting.</p></div>';
        checkoutBtn.style.display = "none";
        if (shippingFields) shippingFields.style.display = "none";
    } else {
        checkoutBtn.style.display = "block";
        if (shippingFields) shippingFields.style.display = "flex";
        const isUserLoggedIn = Boolean(localStorage.getItem('grounded_user'));
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = isUserLoggedIn ? "Checkout" : "Sign In to Checkout";
        cart.forEach((item, index) => {
            listHTML += `
            <div class="cart-item">
                <div class="cart-item-details">
                    <div class="cart-item-title">${escapeHTML(item.name)}</div>
                    <div class="cart-item-variant">${escapeHTML(item.variant)}</div>
                    <div class="cart-qty">
                        <button type="button" onclick="changeCartQty(${index}, -1)" aria-label="Decrease quantity">&minus;</button>
                        <span>${item.qty}</span>
                        <button type="button" onclick="changeCartQty(${index}, 1)" aria-label="Increase quantity">+</button>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="cart-item-price">₹${item.price * item.qty}</div>
                    <button onclick="removeFromCart(${index})" style="background: none; border: none; color: #D9534F; font-size: 1.5rem; font-weight: bold; cursor: pointer; padding: 0; line-height: 1;" title="Remove Item">&times;</button>
                </div>
            </div>`;
        });
    }
    
    const total = cartTotal();
    document.getElementById("cartItemsList").innerHTML = listHTML;
    document.getElementById("cartTotalDisplay").innerText = `₹${total}`;
    document.getElementById("cartTotalDisplay").textContent = `₹${total}`;
    updateProgressBar(total);
    document.getElementById("cartModal").style.display = "flex";
}

function closeCartModal() {
    document.getElementById("cartModal").style.display = "none";
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    openCartModal();
}

function changeCartQty(index, delta) {
    changeQty(index, delta);
    openCartModal();
}

function refreshCartUI() {
    const count = cartCount();
    document.querySelectorAll('#cartCount, .cart-count').forEach(el => { el.innerText = count; });
    document.querySelectorAll('.add-control').forEach(renderControl);
    document.dispatchEvent(new CustomEvent('grounded:cart-changed'));
}

function saveCart() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
        console.error('Failed to save cart to localStorage:', e);
    }
    refreshCartUI();
}

function addToCart(name, variant, price) {
    const existing = cart.find(item => item.name === name && item.variant === variant);
    if (existing) existing.qty += 1;
    else cart.push({ name, variant, price, qty: 1 });
    saveCart();
}

// Changes the quantity of one cart line; at 0 the line is removed.
function changeQty(index, delta) {
    const item = cart[index];
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart.splice(index, 1);
    saveCart();
}

function showToast(message) {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    // Restart the animation if a toast is already showing
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), TOAST_MS);
}

function handleControlClick(button) {
    const el = button.closest('.add-control');
    if (!el) return;
    const { name, variant, price, options, p1, p2 } = el.dataset;

    if (button.classList.contains('ac-minus')) {
        changeQty(lastIndexOfProduct(name, variant), -1);
        return;
    }

    const isFirstAdd = button.classList.contains('ac-add');
    if (options) {
        // Products with texture/sweetener choices open the options modal (simply-seeded.js)
        document.dispatchEvent(new CustomEvent('grounded:open-options', {
            detail: { name, type: options, price1: Number(p1), price2: Number(p2) }
        }));
        return;
    }
    addToCart(name, variant, Number(price));
    if (isFirstAdd) showToast('Added to Cart');
}

document.addEventListener('click', (e) => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const controlBtn = e.target.closest('.ac-add, .ac-plus, .ac-minus');
    if (controlBtn) handleControlClick(controlBtn);
});

// Re-draw cart modal if open and cart changed across tabs
document.addEventListener('grounded:cart-changed', () => {
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.style.display === 'flex') openCartModal();
});

// Keep every open tab/page in sync
window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) {
        loadCart(e.newValue);
        refreshCartUI();
    }
});

let stored = null;
try { stored = localStorage.getItem(CART_KEY); } catch (e) { stored = null; }
loadCart(stored);
refreshCartUI();

// Shipping Details Validation
const BLOCKED_ADDRESS_PATTERNS = [
    /abcdefg/i,
    /asdfgh/i,
    /qwerty/i,
    /test address/i,
    /\bnone\b/i,
    /\bna\b/i,
    /\bnull\b/i
];

const BLOCKED_PINCODES = new Set([
    "111111", "222222", "333333", "444444", "555555",
    "666666", "777777", "888888", "999999", "123456",
    "654321", "121212", "100000", "101010"
]);

function isValidName(name) {
    if (typeof name !== "string") return false;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) return false;
    if (!/^[A-Za-z][A-Za-z\s.'-]{1,79}$/.test(trimmed)) return false;
    const letterChars = trimmed.toLowerCase().replace(/[^a-z]/g, "");
    if (letterChars.length < 2) return false;
    if (new Set(letterChars).size < 2) return false;
    return true;
}

function isValidAddress(address) {
    if (typeof address !== "string") return false;
    const trimmed = address.trim();
    if (trimmed.length < 15 || trimmed.length > 250) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;
    const letterCount = trimmed.replace(/[^A-Za-z]/g, "").length;
    if (letterCount < 5) return false;
    for (const pattern of BLOCKED_ADDRESS_PATTERNS) {
        if (pattern.test(trimmed)) return false;
    }
    const nonSpace = trimmed.replace(/\s+/g, "").toLowerCase();
    if (new Set(nonSpace).size <= 1) return false;
    return true;
}

function isValidPincode(pincode) {
    if (typeof pincode !== "string") return false;
    const trimmed = pincode.trim();
    if (!/^[1-9][0-9]{5}$/.test(trimmed)) return false;
    if (BLOCKED_PINCODES.has(trimmed)) return false;
    return true;
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

    if (!fnInput || !lnInput || !addrInput || !pinInput || !errEl) return null;

    const firstName = fnInput.value.trim();
    const lastName = lnInput.value.trim();
    const address = addrInput.value.trim();
    const pincode = pinInput.value.trim();

    fnInput.classList.remove('input-error');
    lnInput.classList.remove('input-error');
    addrInput.classList.remove('input-error');
    pinInput.classList.remove('input-error');
    errEl.textContent = '';
    errEl.style.display = 'none';

    let firstMissing = null;
    let errorMsg = '';

    if (!pincode) {
        pinInput.classList.add('input-error');
        firstMissing = pinInput;
        errorMsg = 'Pincode is required for shipping.';
    } else if (!isValidPincode(pincode)) {
        pinInput.classList.add('input-error');
        firstMissing = pinInput;
        errorMsg = 'Please enter a valid 6-digit Indian PIN code.';
    }

    if (!address) {
        addrInput.classList.add('input-error');
        firstMissing = addrInput;
        errorMsg = 'Full Delivery Address is required for shipping.';
    } else if (!isValidAddress(address)) {
        addrInput.classList.add('input-error');
        firstMissing = addrInput;
        errorMsg = 'Please enter a complete delivery address (min 15 chars, at least 3 words).';
    }

    if (!lastName) {
        lnInput.classList.add('input-error');
        firstMissing = lnInput;
        errorMsg = 'Last Name is required for shipping.';
    } else if (!isValidName(lastName)) {
        lnInput.classList.add('input-error');
        firstMissing = lnInput;
        errorMsg = 'Please enter a valid Last Name (2-80 letters, no digits or repeated characters).';
    }

    if (!firstName) {
        fnInput.classList.add('input-error');
        firstMissing = fnInput;
        errorMsg = 'First Name is required for shipping.';
    } else if (!isValidName(firstName)) {
        fnInput.classList.add('input-error');
        firstMissing = fnInput;
        errorMsg = 'Please enter a valid First Name (2-80 letters, no digits or repeated characters).';
    }

    if (errorMsg) {
        errEl.textContent = errorMsg;
        errEl.style.display = 'block';
        if (firstMissing.scrollIntoView) {
            firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        firstMissing.focus();
        return null;
    }

    return { firstName, lastName, address, pincode };
}

// Expose globals for inline HTML event handlers (e.g. onclick="openCartModal()")
const exposed = {
    cart, escapeHTML, loadCart, cartCount, cartTotal, qtyOf, lastIndexOfProduct, renderControl,
    refreshCartUI, saveCart, addToCart, changeQty, showToast,
    openCartModal, closeCartModal, removeFromCart, changeCartQty, updateProgressBar, ensureCartModal,
    isValidName, isValidAddress, isValidPincode, clearShippingInputErrors, validateShippingDetails,
    BLOCKED_ADDRESS_PATTERNS, BLOCKED_PINCODES
};
Object.assign(window, exposed);

export {
    cart, escapeHTML, loadCart, cartCount, cartTotal, qtyOf, lastIndexOfProduct, renderControl,
    refreshCartUI, saveCart, addToCart, changeQty, showToast,
    openCartModal, closeCartModal, removeFromCart, changeCartQty, updateProgressBar, ensureCartModal,
    isValidName, isValidAddress, isValidPincode, clearShippingInputErrors, validateShippingDetails,
    BLOCKED_ADDRESS_PATTERNS, BLOCKED_PINCODES
};
