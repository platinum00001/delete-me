(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.json();
  }

  function applyFilters() {
    const enabledOnly = $("#filter-enabled") && $("#filter-enabled").checked;
    const incompleteOnly = $("#filter-incomplete") && $("#filter-incomplete").checked;
    $all("#targets-table tbody tr").forEach(function (row) {
      const enabled = row.getAttribute("data-enabled") === "1";
      const status = row.getAttribute("data-status");
      let show = true;
      if (enabledOnly && !enabled) show = false;
      if (incompleteOnly && status === "completed") show = false;
      row.style.display = show ? "" : "none";
      row.classList.toggle("dim", !enabled);
    });
  }

  async function setStatus(id, status) {
    await postJSON("/api/targets/" + encodeURIComponent(id) + "/status", { status: status });
    const row = document.querySelector('tr[data-id="' + id + '"]');
    if (row) {
      row.setAttribute("data-status", status);
      const sel = row.querySelector(".status-select");
      if (sel) sel.value = status;
    }
    applyFilters();
  }

  async function openTarget(id) {
    const row = document.querySelector('tr[data-id="' + id + '"]');
    if (!row) return;
    const method = row.getAttribute("data-method");
    const url = row.getAttribute("data-url") || "";

    if (method === "email" || url.indexOf("mailto:") === 0) {
      const data = await fetch("/api/email-body/" + encodeURIComponent(id)).then(function (r) { return r.json(); });
      const dlg = $("#email-dialog");
      $("#email-title").textContent = "Email — " + (data.target || id);
      $("#email-body").value = data.body;
      $("#email-mailto").href = data.mailto;
      if (dlg && typeof dlg.showModal === "function") dlg.showModal();
      else window.location.href = data.mailto;
    } else if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    await setStatus(id, "opened");
  }

  const deleteBtn = $("#btn-delete-all");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function () {
      deleteBtn.disabled = true;
      const progress = $("#progress");
      progress.classList.remove("hidden");
      progress.innerHTML = "Starting Delete all…";
      try {
        const result = await postJSON("/api/run-delete-all", { open_browser: false });
        const actions = result.actions || [];
        let html = "<strong>" + result.summary + "</strong><ul>";
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          html += "<li><strong>" + a.name + "</strong> — " + a.action + "</li>";
        }
        html += "</ul><p class='hint'>Opening opt-out pages (limited concurrency)… Check your email for verification links.</p>";
        progress.innerHTML = html;

        // Open web URLs with a small delay; show mailto via dialog for email targets
        const web = actions.filter(function (a) { return a.action === "open_url" && a.url; });
        const mail = actions.filter(function (a) { return a.action === "mailto"; });

        for (let i = 0; i < web.length; i++) {
          await new Promise(function (r) { setTimeout(r, i === 0 ? 0 : 400); });
          window.open(web[i].url, "_blank", "noopener,noreferrer");
          const row = document.querySelector('tr[data-id="' + web[i].id + '"]');
          if (row) {
            row.setAttribute("data-status", "opened");
            const sel = row.querySelector(".status-select");
            if (sel) sel.value = "opened";
          }
        }

        if (mail.length) {
          const first = mail[0];
          const data = await fetch("/api/email-body/" + encodeURIComponent(first.id)).then(function (r) { return r.json(); });
          const dlg = $("#email-dialog");
          $("#email-title").textContent = "Email templates (" + mail.length + ") — showing " + first.name;
          let combined = data.body;
          if (mail.length > 1) {
            combined += "\n\n---\nOther email targets queued: " + mail.map(function (m) { return m.name; }).join(", ");
          }
          $("#email-body").value = combined;
          $("#email-mailto").href = data.mailto;
          if (dlg && typeof dlg.showModal === "function") dlg.showModal();
        }

        applyFilters();
      } catch (err) {
        progress.innerHTML = "<strong>Failed:</strong> " + (err.message || err);
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  $all(".toggle-enabled").forEach(function (cb) {
    cb.addEventListener("change", async function () {
      const id = cb.getAttribute("data-id");
      await postJSON("/api/targets/" + encodeURIComponent(id) + "/enabled", { enabled: cb.checked });
      const row = document.querySelector('tr[data-id="' + id + '"]');
      if (row) row.setAttribute("data-enabled", cb.checked ? "1" : "0");
      applyFilters();
    });
  });

  $all(".status-select").forEach(function (sel) {
    sel.addEventListener("change", async function () {
      await setStatus(sel.getAttribute("data-id"), sel.value);
    });
  });

  $all(".open-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openTarget(btn.getAttribute("data-id"));
    });
  });

  $all(".mark-done").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      await setStatus(btn.getAttribute("data-id"), "completed");
    });
  });

  const fe = $("#filter-enabled");
  const fi = $("#filter-incomplete");
  if (fe) fe.addEventListener("change", applyFilters);
  if (fi) fi.addEventListener("change", applyFilters);
  applyFilters();

  const copyBtn = $("#copy-email");
  if (copyBtn) {
    copyBtn.addEventListener("click", async function () {
      const ta = $("#email-body");
      try {
        await navigator.clipboard.writeText(ta.value);
        copyBtn.textContent = "Copied";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
      } catch (e) {
        ta.select();
        document.execCommand("copy");
      }
    });
  }
})();
