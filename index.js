function escapeHTML(str) { 
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); 
}

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
    if (input && counter) {
        counter.innerText = `${input.value.length}/300`;
    }
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
    if (!msg) return;

    // --- THE NEW BOUNCER (SECURITY CHECK) ---
    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
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
        const userToken = await window.firebaseAuth.currentUser.getIdToken(true);

        const response = await fetch("https://grounded-api.theteamgrounded.workers.dev/chat", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: msg, 
                persona: "curator", 
                token: userToken
            })
        });
        
        const data = await response.json();
        const botMsgDiv = document.getElementById(loadingId);
        
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

function handleAIKeyPress(e) { if (e.key === 'Enter') sendAIMessage(); }

function toggleStory(btn, sumId, ftId) {
    const summary  = document.getElementById(sumId);
    const fullText = document.getElementById(ftId);
    if (!fullText) return;

    const isExpanded = fullText.classList.contains('expanded');

    // Toggle full text open/closed
    fullText.classList.toggle('expanded', !isExpanded);

    // Hide summary when open, show when closed
    if (summary) summary.classList.toggle('hidden', !isExpanded);

    // Toggle arrow and open state on clicked button
    if (btn) {
        btn.classList.toggle('open', !isExpanded);
        btn.setAttribute('aria-expanded', String(!isExpanded));
    }

    if (!isExpanded) {
        setTimeout(() => {
            const nav = document.querySelector('.top-nav');
            const navHeight = nav ? nav.offsetHeight : 85;
            const headerOffset = navHeight + 60;
            const elementPosition = fullText.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: Math.max(0, offsetPosition),
                behavior: 'smooth'
            });
        }, 180);
    } else {
        setTimeout(() => {
            const nav = document.querySelector('.top-nav');
            const navHeight = nav ? nav.offsetHeight : 85;
            const headerOffset = navHeight + 30;
            const btnPos = btn ? btn.getBoundingClientRect().top : 0;
            const offsetPos = btnPos + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: Math.max(0, offsetPos),
                behavior: 'smooth'
            });
        }, 100);
    }
}

// BACK TO TOP BUTTON LOGIC
function initBackToTop() {
    const backToTopBtn = document.getElementById("back-to-top-btn");
    if (!backToTopBtn) return;
    window.addEventListener('scroll', () => {
        const dynamicThreshold = Math.max(300, window.innerHeight * 0.6);
        if (window.scrollY > dynamicThreshold) { 
            backToTopBtn.style.display = "flex";
        } else {
            backToTopBtn.style.display = "none";
        }
    });
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackToTop);
} else {
    initBackToTop();
}

// Map functions to window for inline onclick attributes
const exposed = {
    toggleAIChat, updateCharCount, speakText, toggleSpeechRecognition,
    stopRecordingUI, sendAIMessage, handleAIKeyPress, toggleStory,
    escapeHTML, initBackToTop
};
Object.assign(window, exposed);

export {
    toggleAIChat, updateCharCount, speakText, toggleSpeechRecognition,
    stopRecordingUI, sendAIMessage, handleAIKeyPress, toggleStory,
    escapeHTML, initBackToTop
};

