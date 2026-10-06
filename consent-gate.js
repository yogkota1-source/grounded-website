(function () {
    var KEY = 'grounded_terms_accepted';
    try { if (localStorage.getItem(KEY) === 'yes') return; } catch (e) {}

    var overlay = document.createElement('div');
    overlay.className = 'consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'consent-title');
    overlay.innerHTML =
        '<div class="consent-modal">' +
            '<h2 id="consent-title">Welcome to Grounded</h2>' +
            '<p>Everything we make is handcrafted in a home kitchen. Before you browse or order, please review and accept our policies.</p>' +
            '<label class="consent-check">' +
                '<input type="checkbox" id="consent-checkbox">' +
                '<span>I have read and agree to the ' +
                '<a href="terms-of-service.html" target="_blank" rel="noopener">Terms of Service</a>, ' +
                '<a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>, and ' +
                '<a href="refund-policy.html" target="_blank" rel="noopener">Refund &amp; Cancellation Policy</a>.</span>' +
            '</label>' +
            '<button type="button" class="consent-btn" id="consent-btn" disabled>Continue to Website</button>' +
        '</div>';

    function mount() {
        document.body.appendChild(overlay);
        document.body.classList.add('consent-locked');
        var box = document.getElementById('consent-checkbox');
        var btn = document.getElementById('consent-btn');
        box.addEventListener('change', function () { btn.disabled = !box.checked; });
        btn.addEventListener('click', function () {
            if (!box.checked) return;
            try { localStorage.setItem(KEY, 'yes'); } catch (e) {}
            overlay.classList.add('fade-out');
            document.body.classList.remove('consent-locked');
            setTimeout(function () { overlay.remove(); }, 450);
        });
    }

    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();

