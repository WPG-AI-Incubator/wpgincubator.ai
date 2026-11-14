/* WPG AI Incubator: page behaviour.
   Everything here is an upgrade. With JavaScript off, the forms post to the
   server and come back as ordinary pages. */
(function () {
  'use strict';
  if (!window.fetch || !window.JSON || !document.querySelector) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function postJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: res.ok, status: res.status, data: data || {} };
        });
    });
  }

  /* ---------- Find your room ---------- */
  var panel = document.querySelector('[data-finder]');
  if (panel) {
    (function () {
      var form = panel.querySelector('form');
      var input = panel.querySelector('textarea');
      var button = panel.querySelector('[data-find]');
      var region = panel.querySelector('[data-reply]');
      var card = region.querySelector('[data-card]');
      var msg = region.querySelector('[data-msg]');
      var chips = Array.prototype.slice.call(panel.querySelectorAll('[data-example]'));
      var bandClasses = ['reply__band--dream', 'reply__band--build', 'reply__band--execute'];
      var buttonLabel = button.textContent;
      var busy = false;
      var examples = {};
      try {
        examples = JSON.parse(panel.getAttribute('data-examples')) || {};
      } catch (err) {
        examples = {};
      }

      function slot(name) {
        return card.querySelector('[data-slot="' + name + '"]');
      }

      function press(key) {
        chips.forEach(function (chip) {
          chip.setAttribute('aria-pressed', chip.getAttribute('data-example') === key ? 'true' : 'false');
        });
      }

      function showReply(reply) {
        var band = slot('band');
        var room = reply.room === 'build' || reply.room === 'execute' ? reply.room : 'dream';
        bandClasses.forEach(function (name) {
          band.classList.remove(name);
        });
        band.classList.add('reply__band--' + room);
        ['said', 'word', 'line', 'why', 'bring', 'note'].forEach(function (name) {
          slot(name).textContent = reply[name] || '';
        });
        msg.hidden = true;
        card.hidden = false;
      }

      function showMessage(text) {
        msg.textContent = text;
        card.hidden = true;
        msg.hidden = false;
      }

      /* On a phone the answer sits below the form. Bring it into view. */
      function reveal() {
        var box = region.getBoundingClientRect();
        if (box.top < 0 || box.top > window.innerHeight * 0.7) {
          region.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      }

      function setBusy(on) {
        busy = on;
        region.classList.toggle('is-busy', on);
        if (on) {
          button.setAttribute('aria-disabled', 'true');
          button.textContent = panel.getAttribute('data-busy') || buttonLabel;
        } else {
          button.removeAttribute('aria-disabled');
          button.textContent = buttonLabel;
        }
      }

      chips.forEach(function (chip) {
        chip.addEventListener('click', function (event) {
          var key = chip.getAttribute('data-example');
          if (!examples[key]) return; /* no data: let the form post normally */
          event.preventDefault();
          press(key);
          showReply(examples[key]);
        });
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (busy) return;
        var text = input.value.replace(/\s+/g, ' ').trim();
        press(null);
        if (!text) {
          showMessage(panel.getAttribute('data-empty'));
          input.focus();
          return;
        }
        setBusy(true);
        postJson(form.getAttribute('action'), { text: text })
          .then(function (result) {
            setBusy(false);
            if (result.ok && result.data.room) showReply(result.data);
            else showMessage(result.data.error || panel.getAttribute('data-failed'));
          })
          .catch(function () {
            setBusy(false);
            showMessage(panel.getAttribute('data-failed'));
          })
          .then(reveal);
      });

      /* Ctrl+Enter or Cmd+Enter sends from the text box. Plain Enter still makes a new line. */
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          button.click();
        }
      });
    })();
  }

  /* ---------- Issue alerts ---------- */
  var signup = document.querySelector('[data-subscribe]');
  if (signup) {
    (function () {
      var holder = signup.parentNode;
      var status = holder.querySelector('[data-status]');
      var email = signup.querySelector('input[type="email"]');
      var trap = signup.querySelector('input[name="website"]');
      var button = signup.querySelector('button[type="submit"]');
      var buttonLabel = button.textContent;
      var busy = false;

      function fail(text, fieldProblem) {
        status.textContent = text;
        status.hidden = false;
        if (fieldProblem) email.setAttribute('aria-invalid', 'true');
        email.focus();
      }

      signup.addEventListener('submit', function (event) {
        event.preventDefault();
        if (busy) return;
        busy = true;
        status.hidden = true;
        email.removeAttribute('aria-invalid');
        button.setAttribute('aria-disabled', 'true');
        button.textContent = signup.getAttribute('data-busy') || buttonLabel;
        postJson(signup.getAttribute('action'), { email: email.value, website: trap ? trap.value : '' })
          .then(function (result) {
            if (result.ok && result.data.ok) {
              var done = document.createElement('p');
              done.className = 'news__done';
              done.setAttribute('role', 'status');
              done.setAttribute('tabindex', '-1');
              done.textContent = result.data.message;
              holder.replaceChild(done, signup);
              done.focus();
            } else {
              fail(result.data.error || signup.getAttribute('data-failed'), result.status === 422);
            }
          })
          .catch(function () {
            fail(signup.getAttribute('data-failed'), false);
          })
          .then(function () {
            busy = false;
            button.removeAttribute('aria-disabled');
            button.textContent = buttonLabel;
          });
      });
    })();
  }
})();
