import {
    cart, cartTotal, saveCart, addToCart, changeQty, showToast, refreshCartUI
} from './cart.js';

function escapeHTML(str) { 
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); 
}

function moveCarousel(button, direction) { 
    const track = button.parentElement.querySelector('.carousel-track'); 
    const slides = track.children;
    const totalSlides = slides.length || 1;
    let currentSlide = parseInt(track.getAttribute('data-slide')) || 0; 
    currentSlide = (currentSlide + direction + totalSlides) % totalSlides; 
    track.setAttribute('data-slide', currentSlide); 
    track.style.transform = `translateX(-${currentSlide * 100}%)`; 
}

// Category Dropdown Toggle
function toggleCategoryDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const dd = document.getElementById('categoryDropdown');
    if (dd) dd.classList.toggle('open');
}

function closeCategoryDropdown() {
    const dd = document.getElementById('categoryDropdown');
    if (dd) dd.classList.remove('open');
}

document.addEventListener('click', function(e) {
    const dd = document.getElementById('categoryDropdown');
    if (dd && !dd.contains(e.target)) {
        dd.classList.remove('open');
    }
});

// The cart itself (storage, quantities, cross-tab sync) lives in cart.js and is shared by every page.
const FREE_SHIPPING_THRESHOLD = 1399; 

let pendingName = ''; 
let pendingType = '';
let pendingDatePrice = 0; 
let pendingMonkPrice = 0;

const updateCartIcon = refreshCartUI;

// Re-draw the cart modal when the cart changes elsewhere (another tab) while it is open
document.addEventListener('grounded:cart-changed', () => {
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.style.display === 'flex') openCartModal();
});

// Product cards with options (texture / sweetener) ask us to open the options modal
document.addEventListener('grounded:open-options', (e) => {
    openOptionsModal(e.detail.name, e.detail.type, e.detail.price1, e.detail.price2);
});

function openOptionsModal(name, type, price1, price2) { 
    pendingName = name; 
    pendingType = type; 
    pendingDatePrice = price1; 
    pendingMonkPrice = price2; 
    
    document.getElementById("modalSizeText").innerText = name; 
    document.getElementById("texSmooth").checked = true;
    document.getElementById("sweetDate").checked = true;
    
    if (type === 'unsweet' || type === 'cocoa') {
        document.getElementById("sweetenerGroup").style.display = "none";
    } else {
        document.getElementById("sweetenerGroup").style.display = "block";
    }

    // Update monk fruit surcharge badge based on weight in product name
    const badge = document.getElementById("monkPriceBadge");
    if (badge) {
        const surcharge = pendingMonkPrice - pendingDatePrice;
        if (type !== 'unsweet' && surcharge > 0) {
            badge.textContent = `(+ ₹${surcharge})`;
            badge.style.display = "inline";
        } else {
            badge.textContent = "";
            badge.style.display = "none";
        }
    }
    
    updateAddButtonPrice(); 
    document.getElementById("optionsModal").style.display = "flex"; 
}

function updateAddButtonPrice() { 
    let finalPrice;
    if (pendingType === 'unsweet' || pendingType === 'cocoa') {
        finalPrice = pendingDatePrice;
    } else {
        let choiceRadio = document.querySelector('input[name="sweetenerOption"]:checked');
        let choice = choiceRadio ? choiceRadio.value : "date"; 
        finalPrice = (choice === "date") ? pendingDatePrice : pendingMonkPrice; 
    }
    document.getElementById("addToCartBtn").innerText = `Add to Cart (₹${finalPrice})`; 
}

function processOptionsAndAdd() { 
    let textureRadio = document.querySelector('input[name="textureOption"]:checked');
    let texture = textureRadio ? textureRadio.value : "Smooth";
    let finalPrice;
    let variantText = texture; 
    
    if (pendingType === 'sweet') {
        let choiceRadio = document.querySelector('input[name="sweetenerOption"]:checked'); 
        let choice = choiceRadio ? choiceRadio.value : "date";
        let sweetenerText = (choice === "date") ? "Date Powder" : "Monk Fruit"; 
        variantText = `${texture} | ${sweetenerText}`;
        finalPrice = (choice === "date") ? pendingDatePrice : pendingMonkPrice; 
    } else if (pendingType === 'cocoa') {
        // Cocoa PB item ids are "<size> Cocoa PB - <texture>", e.g. "250g Cocoa PB - Smooth"
        variantText = texture;
        finalPrice = pendingDatePrice;
    } else {
        variantText = `${texture} | Unsweetened`;
        finalPrice = pendingDatePrice;
    }
    
    addToCart(pendingName, variantText, finalPrice);
    closeModal('optionsModal'); 
    showToast('Added to Cart'); 
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

function openCartModal() { 
    let listHTML = ''; 
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    const shippingFields = document.getElementById("shippingFields");
    if (cart.length === 0) { 
        listHTML = '<div style="color: #A0A0A0; text-align: center; margin-top: 80px; font-family: Georgia, serif;"><div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.3;">🥜</div><p style="font-style: italic; font-size: 1.1rem; margin: 0;">Your pantry is waiting.</p></div>'; 
        if (checkoutBtn) checkoutBtn.style.display = "none"; 
        if (shippingFields) shippingFields.style.display = "none";
    } else { 
        if (checkoutBtn) {
            checkoutBtn.style.display = "block";
            checkoutBtn.disabled = false;
            checkoutBtn.innerText = localStorage.getItem('grounded_user') ? "Checkout" : "Sign In to Checkout";
        }
        if (shippingFields) shippingFields.style.display = "flex"; 
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
    updateProgressBar(total); 
    document.getElementById("cartModal").style.display = "flex"; 
}

function updateProgressBar(total) { 
    let bar = document.getElementById("shippingBar"); 
    let text = document.getElementById("shippingText"); 
    if (!bar || !text) return;
    
    // Safeguard against negative, undefined, or NaN totals
    const safeTotal = (typeof total === 'number' && !isNaN(total) && total > 0) ? total : 0;
    
    if (safeTotal >= FREE_SHIPPING_THRESHOLD) { 
        bar.style.width = "100%"; 
        bar.classList.add("unlocked-bar"); 
        text.classList.add("unlocked-text"); 
        text.innerText = "🎉 You unlocked FREE Shipping!"; 
    } else { 
        let percentage = Math.max(0, Math.min(100, (safeTotal / FREE_SHIPPING_THRESHOLD) * 100)); 
        let away = Math.max(0, FREE_SHIPPING_THRESHOLD - safeTotal); 
        bar.style.width = percentage + "%"; 
        bar.classList.remove("unlocked-bar"); 
        text.classList.remove("unlocked-text"); 
        text.innerText = `Add ₹${away} more for FREE Shipping!`; 
    } 
}

function closeModal(modalId) { 
    const el = document.getElementById(modalId);
    if (el) el.style.display = "none"; 
}

// ===== RAZORPAY CHECKOUT (prices are calculated by the backend only) =====
const API_BASE = "https://grounded-api.theteamgrounded.workers.dev";

// Builds the exact itemId used by the backend price list.
// Unsweetened items are displayed as "<texture> | Unsweetened" but the backend key has no suffix.
function buildItemId(item) {
    const variant = String(item.variant).replace(/ \| Unsweetened$/, '');
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

        // Step 1: ask the backend to create the order
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

        // Step 2: configure Razorpay with the backend's values (key_id comes ONLY from the backend)
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
                // Re-enable the checkout button if the customer closes the payment window
                ondismiss: function () {
                    setCheckoutBusy(false);
                }
            },

            // Step 3: verify the payment with the backend
            handler: async function (response) {
                try {
                    // Fresh token so verification never fails because the first one expired
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

                    // Step 4: user feedback
                    if (verifyData.status === "success") {
                        cart.length = 0;
                        saveCart();
                        closeModal('cartModal');
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

        // Step 5: open the payment modal
        const rzp = new window.Razorpay(options);
        rzp.open();
        modalOpened = true;

    } catch (err) {
        console.error("Checkout error:", err);
        alert("Could not start checkout. Please try again.");
    } finally {
        // Keep the button locked only while the payment window is open
        if (!modalOpened) setCheckoutBusy(false);
    }
}

// Bind to the Checkout button: this is the ONLY checkout flow (single listener)
const razorpayCheckoutBtn = document.getElementById('checkoutBtn');
if (razorpayCheckoutBtn) {
    razorpayCheckoutBtn.addEventListener('click', () => {
        // Only when the button is active; if signed out, open the auth modal
        if (razorpayCheckoutBtn.disabled) return;
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
            document.getElementById('auth-modal').style.display = 'flex';
            return;
        }

        // The live cart that renders the cart UI. Client prices are NOT sent;
        // the backend looks up prices itself from the item id.
        const actualCartData = cart.map(item => ({
            itemId: buildItemId(item),
            quantity: item.qty,
            name: item.name,
            variant: item.variant
        }));
        startCheckout(actualCartData);
    });
}

// --- AI LOGIC (Unchanged except Security Bouncer) ---
function toggleAIChat() {
    const chat = document.getElementById('aiChatWindow');
    if (!chat) return;
    if (chat.style.display === 'flex') {
        chat.style.display = 'none';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
        chat.style.display = 'flex';
    }
}

function updateCharCount() {
    const input = document.getElementById('aiInput');
    const counter = document.getElementById('aiCharCounter');
    if (input && counter) counter.innerText = `${input.value.length}/300`;
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN'; 
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN'; 

    recognition.onstart = function() {
        isRecording = true;
        document.getElementById('micIconSvg').style.display = 'none';
        document.getElementById('voiceVisualizer').style.display = 'flex';
        document.getElementById('aiInput').placeholder = "Listening...";
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const inputField = document.getElementById('aiInput');
        inputField.value = inputField.value ? inputField.value + " " + transcript : transcript;
        updateCharCount();
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        stopRecordingUI();
    };

    recognition.onend = function() {
        stopRecordingUI();
    };
}

function toggleSpeechRecognition() {
    if (!recognition) {
        alert("Sorry, your browser doesn't support voice dictation. Try using Chrome or Safari!");
        return;
    }
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function stopRecordingUI() {
    isRecording = false;
    document.getElementById('micIconSvg').style.display = 'block';
    document.getElementById('voiceVisualizer').style.display = 'none';
    document.getElementById('aiInput').placeholder = "Ask a question...";
}

let aiBusy = false;

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const sendBtn = document.getElementById('aiSendBtn');
    const micBtn = document.getElementById('aiMicBtn');
    const msg = input.value.trim();
    
    if (isRecording && recognition) recognition.stop();
    if(!msg) return;

    // --- THE NEW BOUNCER (SECURITY CHECK) ---
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
        // Not logged in? Open the login modal and stop the function.
        document.getElementById('auth-modal').style.display = 'flex';
        document.getElementById('modal-default-view').style.display = 'block';
        document.getElementById('modal-phone-view').style.display = 'none';
        document.getElementById('modal-otp-view').style.display = 'none';
        return;
    }
    // ----------------------------------------

    if (aiBusy) return;
    aiBusy = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const body = document.getElementById('aiChatBody');
    
    body.innerHTML += `<div class="ai-msg-user">${escapeHTML(msg)}</div>`;
    input.value = ''; 
    updateCharCount();
    body.scrollTop = body.scrollHeight;

    input.disabled = true;
    sendBtn.disabled = true;
    micBtn.disabled = true;

    const loadingId = 'loading-' + Date.now();
    
    body.innerHTML += `
        <div class="ai-msg-bot" id="${loadingId}">
            <div class="ai-msg-content ai-typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    body.scrollTop = body.scrollHeight;

    try {
        // Grab the ultra-fresh VIP token (we already know they are logged in)
        const userToken = await window.firebaseAuth.currentUser.getIdToken(true);

        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: msg, 
                persona: "roaster", 
                token: userToken
            })
        });
        
        const data = await response.json();
        const botMsgDiv = document.getElementById(loadingId);
        
        // If Cloudflare still rejects it (e.g. token expired mid-request)
        if (!response.ok) {
            const backendError = new Error(data.error || "Backend rejected request");
            backendError.status = response.status;
            throw backendError;
        }
        
        if (typeof data.reply === 'string' && data.reply.startsWith('Security Error')) {
            throw new Error("AUTH_REQUIRED");
        }
        
        botMsgDiv.innerHTML = `
            <div class="ai-msg-content"></div>
            <button class="ai-speaker-btn" onclick="speakText(this.previousElementSibling.innerText)" title="Read aloud">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            </button>
        `;
        botMsgDiv.querySelector('.ai-msg-content').textContent = data.reply;
        
    } catch (error) {
        console.error("API Error:", error);
        const isAuthErr = error.status === 401 || error.message === "AUTH_REQUIRED" || (typeof error.message === 'string' && error.message.startsWith("Security Error"));
        document.getElementById(loadingId).innerHTML = `<div class="ai-msg-content">${isAuthErr ? "Your login expired. Please sign in again to continue." : "Something went wrong. Please try again."}</div>`;
        if (isAuthErr) {
            document.getElementById('auth-modal').style.display = 'flex';
            document.getElementById('modal-default-view').style.display = 'block';
            document.getElementById('modal-phone-view').style.display = 'none';
            document.getElementById('modal-otp-view').style.display = 'none';
        }
    } finally {
        aiBusy = false;
        input.disabled = false;
        sendBtn.disabled = false;
        micBtn.disabled = false;
        input.focus();
        body.scrollTop = body.scrollHeight;
    }
}

function handleAIKeyPress(e) { if(e.key === 'Enter') sendAIMessage(); }

// The HTML uses inline onclick/oninput attributes, so these must be global.
const exposed = {
    escapeHTML, moveCarousel, toggleCategoryDropdown, closeCategoryDropdown,
    openOptionsModal, updateAddButtonPrice, processOptionsAndAdd, removeFromCart,
    openCartModal, changeCartQty, closeModal, toggleAIChat, updateCharCount, speakText,
    toggleSpeechRecognition, sendAIMessage, handleAIKeyPress, startCheckout, validateShippingDetails
};
Object.assign(window, exposed);
Object.defineProperty(window, 'cart', {
    get() { return cart; },
    set(c) { cart.splice(0, cart.length, ...c); },
    configurable: true
});

// Another page sent the customer here to check out (?cart=open)
if (new URLSearchParams(window.location.search).get('cart') === 'open') openCartModal();

export {
    cart, escapeHTML, moveCarousel, toggleCategoryDropdown, closeCategoryDropdown, saveCart,
    openOptionsModal, updateAddButtonPrice, processOptionsAndAdd, removeFromCart,
    updateCartIcon, openCartModal, changeCartQty, updateProgressBar, closeModal, buildItemId,
    startCheckout, toggleAIChat, updateCharCount, speakText, toggleSpeechRecognition,
    stopRecordingUI, sendAIMessage, handleAIKeyPress, validateShippingDetails
};
