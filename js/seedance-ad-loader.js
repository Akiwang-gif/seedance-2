/**
 * Loads /ads-snippet.html (banner units only) into #seedance-ad-root.
 * Scripts run in order so atOptions + invoke.js pairs stay correct.
 */
(function () {
    function ensureStyle() {
        if (document.getElementById('seedance-ad-slot-style')) return;
        var st = document.createElement('style');
        st.id = 'seedance-ad-slot-style';
        st.textContent =
            '.seedance-ad-slot{margin:1.25rem auto;max-width:728px;padding:0 1rem;text-align:center;min-height:0}';
        document.head.appendChild(st);
    }

    function appendParsedSequential(container, html) {
        var text = String(html || '').trim();
        if (!text) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = text;
        var nodes = Array.prototype.slice.call(tmp.childNodes);

        function step(i) {
            if (i >= nodes.length) return;
            var node = nodes[i];

            if (node.nodeType === 3) {
                if (!String(node.textContent || '').trim()) {
                    step(i + 1);
                    return;
                }
                container.appendChild(node);
                step(i + 1);
                return;
            }

            if (node.nodeType === 8) {
                container.appendChild(node);
                step(i + 1);
                return;
            }

            if (node.nodeName !== 'SCRIPT') {
                container.appendChild(node);
                step(i + 1);
                return;
            }

            var s = document.createElement('script');
            var hasSrc = node.src && String(node.src).length > 0;

            if (hasSrc) {
                for (var j = 0; j < node.attributes.length; j++) {
                    var a = node.attributes[j];
                    s.setAttribute(a.name, a.value);
                }
                if (!s.referrerPolicy) {
                    s.referrerPolicy = 'strict-origin-when-cross-origin';
                }
                s.async = false;
                s.onload = function () {
                    step(i + 1);
                };
                s.onerror = function () {
                    step(i + 1);
                };
                container.appendChild(s);
            } else {
                s.textContent = node.textContent;
                container.appendChild(s);
                step(i + 1);
            }
        }

        step(0);
    }

    function run() {
        ensureStyle();
        var el = document.getElementById('seedance-ad-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'seedance-ad-root';
            el.className = 'seedance-ad-slot';
            document.body.appendChild(el);
        }
        fetch('/ads-snippet.html', { cache: 'no-store' })
            .then(function (r) {
                return r.ok ? r.text() : '';
            })
            .then(function (html) {
                appendParsedSequential(el, html);
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
