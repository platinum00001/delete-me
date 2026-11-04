/* Delete Me — static, client-only. All data lives in localStorage on this device. */
(function () {
  "use strict";
  var KEY_PROFILE = "dm.profile.v1", KEY_STATUS = "dm.status.v1", KEY_ENABLED = "dm.enabled.v1";
  var LIST_FIELDS = ["aliases", "emails", "phones", "addresses", "usernames"];
  var STATUS_LABEL = { not_started: "Not started", opened: "Opened", submitted: "Submitted", confirmed: "Confirmed" };
  var CAT_LABEL = { people_search: "People search", public_records: "Public records", credit_offers: "Credit offers",
    marketing: "Marketing mail", telemarketing: "Telemarketing", data_broker: "Data broker" };
  var CATALOG = (window.DM_CATALOG || []).slice();

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoDate(d) { var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day; }
  function addDays(n) { var d = today(); d.setDate(d.getDate() + n); return isoDate(d); }

  var profile = load(KEY_PROFILE, {});
  var status = load(KEY_STATUS, {});     // id -> {status, recheck, updated}
  var enabled = load(KEY_ENABLED, {});   // id -> bool (overrides catalog default)

  function isEnabled(b) { return enabled.hasOwnProperty(b.id) ? !!enabled[b.id] : b.enabled !== false; }
  function st(b) { return (status[b.id] && status[b.id].status) || "not_started"; }
  function isDue(b) { var s = status[b.id]; return !!(s && s.recheck && s.recheck <= isoDate(today())); }
  function hasProfile() { return !!((profile.full_name || "").trim() || (profile.emails || []).length); }

  function setStatus(id, s) {
    var rec = status[id] || {};
    rec.status = s; rec.updated = new Date().toISOString();
    if (s === "submitted") rec.recheck = addDays(30);
    else if (s === "confirmed") rec.recheck = addDays(90);
    else if (s === "not_started") rec.recheck = "";
    status[id] = rec; save(KEY_STATUS, status);
  }

  /* ---------- request text ---------- */
  function detailsText() {
    var p = profile, out = [];
    out.push("Full name: " + (p.full_name || ""));
    if (p.aliases && p.aliases.length) out.push("Aliases: " + p.aliases.join(", "));
    if (p.emails && p.emails.length) out.push("Emails: " + p.emails.join(", "));
    if (p.phones && p.phones.length) out.push("Phones: " + p.phones.join(", "));
    if (p.addresses && p.addresses.length) out.push("Addresses: " + p.addresses.join(" | "));
    if (p.usernames && p.usernames.length) out.push("Usernames: " + p.usernames.join(", "));
    if (p.dob) out.push("Date of birth: " + p.dob);
    return out.join("\n");
  }
  function emailBody(brokerName) {
    var p = profile, name = p.full_name || "[Your Name]", L = [];
    L.push("Hello " + brokerName + " Privacy Team,", "",
      "I am requesting that you delete my personal information and opt me out of the sale or sharing of my data, " +
      "and remove me from all of your public listings and people-search results.", "", "My details:");
    L.push("- Full name: " + (p.full_name || "(not provided)"));
    if (p.aliases && p.aliases.length) L.push("- Aliases / previous names: " + p.aliases.join(", "));
    if (p.emails && p.emails.length) L.push("- Email addresses: " + p.emails.join(", "));
    if (p.phones && p.phones.length) L.push("- Phone numbers: " + p.phones.join(", "));
    if (p.addresses && p.addresses.length) L.push("- Addresses: " + p.addresses.join("; "));
    if (p.usernames && p.usernames.length) L.push("- Usernames: " + p.usernames.join(", "));
    L.push("", "Please confirm in writing when the removal is complete.", "", "Thank you,", name);
    return L.join("\n");
  }
  function mailtoFor(b) {
    var url = b.opt_out_url || "", subject = "Opt-out / deletion request — " + (profile.full_name || "privacy");
    var body = encodeURIComponent(emailBody(b.name));
    if (url.indexOf("mailto:") === 0) {
      var hasSubj = /[?&]subject=/i.test(url);
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + (hasSubj ? "" : "subject=" + encodeURIComponent(subject) + "&") + "body=" + body;
    }
    return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + body;
  }
  function isEmailBroker(b) { return b.method === "email" || (b.opt_out_url || "").indexOf("mailto:") === 0; }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); return ok;
  }
  function openLink(url) {
    if (url.indexOf("mailto:") === 0) { window.location.href = url; return true; }
    window.open(url, "_blank", "noopener,noreferrer");
    return true; // with noopener, window.open returns null even on success
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    $$("#tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.id === "tab-" + name); });
    window.scrollTo(0, 0);
  }
  $$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest && e.target.closest("[data-goto]");
    if (g) { e.preventDefault(); showTab(g.dataset.goto); }
  });

  /* ---------- profile form ---------- */
  var form = $("#profile-form");
  function fillForm() {
    form.full_name.value = profile.full_name || ""; form.dob.value = profile.dob || "";
    LIST_FIELDS.forEach(function (f) { form[f].value = (profile[f] || []).join("\n"); });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var p = { full_name: form.full_name.value.trim(), dob: form.dob.value.trim() };
    LIST_FIELDS.forEach(function (f) { p[f] = form[f].value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean); });
    profile = p; save(KEY_PROFILE, profile);
    $("#save-msg").textContent = "Saved in this browser ✓ (" + new Date().toLocaleTimeString() + ")";
    render();
  });

  /* ---------- export / import / clear ---------- */
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $("#btn-export").addEventListener("click", function () {
    download("delete-me-backup-" + isoDate(today()) + ".json",
      JSON.stringify({ app: "delete-me", version: 1, exported: new Date().toISOString(), profile: profile, status: status, enabled: enabled }, null, 2),
      "application/json");
  });
  $("#file-import").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || typeof d !== "object" || (!d.profile && !d.status)) throw new Error("Not a Delete Me backup");
        profile = d.profile || {}; status = d.status || {}; enabled = d.enabled || {};
        save(KEY_PROFILE, profile); save(KEY_STATUS, status); save(KEY_ENABLED, enabled);
        fillForm(); render(); alert("Backup imported.");
      } catch (err) { alert("Could not import: " + err.message); }
      e.target.value = "";
    };
    r.readAsText(f);
  });
  $("#btn-clear").addEventListener("click", function () {
    if (!confirm("Erase your info and all progress from this browser? This cannot be undone (export a backup first if you want one).")) return;
    [KEY_PROFILE, KEY_STATUS, KEY_ENABLED].forEach(function (k) { localStorage.removeItem(k); });
    profile = {}; status = {}; enabled = {}; fillForm(); render();
    $("#save-msg").textContent = "All data cleared from this browser.";
  });

  /* ---------- .ics weekly reminder ---------- */
  $("#btn-ics").addEventListener("click", function () {
    var d = today(), dow = d.getDay(), add = (8 - dow) % 7 || 7; d.setDate(d.getDate() + add); // next Monday
    var ymd = isoDate(d).replace(/-/g, ""), stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var url = location.href.split("#")[0];
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Delete Me//Weekly re-check//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT", "UID:delete-me-weekly-" + stamp + "@delete-me", "DTSTAMP:" + stamp,
      "DTSTART:" + ymd + "T090000", "DTEND:" + ymd + "T091500", "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "SUMMARY:Delete Me — weekly data broker re-check",
      "DESCRIPTION:Open Delete Me and press Delete all to re-check brokers that are due: " + url,
      "URL:" + url,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Delete Me weekly re-check", "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
    download("delete-me-weekly-reminder.ics", ics, "text/calendar");
  });

  /* ---------- dashboard ---------- */
  function render() {
    var on = CATALOG.filter(isEnabled), counts = { not_started: 0, opened: 0, submitted: 0, confirmed: 0 }, due = 0;
    on.forEach(function (b) { counts[st(b)]++; if (isDue(b)) due++; });
    var done = counts.submitted + counts.confirmed;
    $("#stats").innerHTML = [["Enabled", on.length, ""], ["Not started", counts.not_started, "s-not_started"],
      ["Opened", counts.opened, "s-opened"], ["Submitted", counts.submitted, "s-submitted"],
      ["Confirmed", counts.confirmed, "s-confirmed"], ["Re-check due", due, "s-due"]].map(function (x) {
      return '<div class="stat ' + x[2] + '"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + "</div></div>"; }).join("");
    var pct = on.length ? Math.round((counts.confirmed + counts.submitted * 0.5) / on.length * 100) : 0;
    $("#progress-bar").style.width = pct + "%";
    $("#progress-text").textContent = done + " of " + on.length + " requests sent · " + counts.confirmed + " confirmed · " + pct + "% complete";
    $("#hero-sub").innerHTML = hasProfile()
      ? "Ready, " + esc((profile.full_name || "").split(" ")[0] || "friend") + ". Press <strong>Delete all</strong> to walk through " + queue().length + " remaining opt-out" + (queue().length === 1 ? "" : "s") + "."
      : 'Start by filling in <a href="#" data-goto="info">your info</a> (stored only in this browser), then press Delete all.';

    var q = ($("#filter").value || "").toLowerCase(), fs = $("#filter-status").value;
    var html = CATALOG.filter(function (b) {
      if (q && (b.name + " " + b.category + " " + b.notes).toLowerCase().indexOf(q) < 0) return false;
      if (fs === "due") return isDue(b);
      if (fs && st(b) !== fs) return false;
      return true;
    }).map(function (b) {
      var s = st(b), rec = status[b.id] || {}, en = isEnabled(b);
      return '<div class="broker' + (en ? "" : " disabled") + (isDue(b) ? " due" : "") + '" data-id="' + esc(b.id) + '">' +
        '<div class="b-main"><label class="sw" title="Include in Delete all"><input type="checkbox" class="b-en"' + (en ? " checked" : "") + '><span></span></label>' +
        '<div><div class="b-name">' + esc(b.name) + ' <span class="tag">' + esc(CAT_LABEL[b.category] || b.category) + '</span>' +
        (isEmailBroker(b) ? ' <span class="tag">email</span>' : "") + (isDue(b) ? ' <span class="tag due-tag">re-check due</span>' : "") + "</div>" +
        '<div class="muted small">' + esc(b.notes) + "</div></div></div>" +
        '<div class="b-ctl">' +
        '<select class="b-st" aria-label="Status for ' + esc(b.name) + '">' + Object.keys(STATUS_LABEL).map(function (k) {
          return '<option value="' + k + '"' + (k === s ? " selected" : "") + ">" + STATUS_LABEL[k] + "</option>"; }).join("") + "</select>" +
        '<label class="small muted rc">Re-check <input type="date" class="b-rc" value="' + esc(rec.recheck || "") + '"></label>' +
        '<button class="btn small-btn b-open">Open</button></div></div>';
    }).join("");
    $("#broker-list").innerHTML = html || '<p class="muted">No brokers match.</p>';
  }
  $("#filter").addEventListener("input", render);
  $("#filter-status").addEventListener("change", render);
  $("#broker-list").addEventListener("change", function (e) {
    var row = e.target.closest(".broker"); if (!row) return; var id = row.dataset.id;
    if (e.target.classList.contains("b-en")) { enabled[id] = e.target.checked; save(KEY_ENABLED, enabled); }
    else if (e.target.classList.contains("b-st")) setStatus(id, e.target.value);
    else if (e.target.classList.contains("b-rc")) { status[id] = status[id] || { status: "not_started" }; status[id].recheck = e.target.value; save(KEY_STATUS, status); }
    render();
  });
  $("#broker-list").addEventListener("click", function (e) {
    if (!e.target.classList.contains("b-open")) return;
    var b = byId(e.target.closest(".broker").dataset.id); doOpen(b, false);
  });
  function byId(id) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i]; return null; }

  /* ---------- Delete all wizard ---------- */
  function queue() {
    return CATALOG.filter(function (b) {
      if (!isEnabled(b)) return false; var s = st(b);
      return s === "not_started" || s === "opened" || isDue(b);
    });
  }
  var wq = [], wi = 0;
  function toast(msg) { var t = $("#wz-toast"); t.textContent = msg; clearTimeout(toast._t); toast._t = setTimeout(function () { t.textContent = ""; }, 4000); }
  function doOpen(b, viaEmail) {
    var url = viaEmail || isEmailBroker(b) ? mailtoFor(b) : b.opt_out_url;
    copy(detailsText());
    openLink(url);
    if (st(b) === "not_started" || isDue(b)) setStatus(b.id, "opened");
    render();
    return url;
  }
  function wzShow() {
    if (wi >= wq.length) {
      $("#wizard").hidden = true; render();
      alert("All done for now! Check your inbox for verification emails, then mark those brokers Confirmed. Come back weekly to re-check.");
      return;
    }
    var b = wq[wi];
    $("#wz-count").textContent = "Broker " + (wi + 1) + " of " + wq.length;
    $("#wz-title").textContent = b.name;
    $("#wz-meta").textContent = (CAT_LABEL[b.category] || b.category) + " · status: " + STATUS_LABEL[st(b)] + (isDue(b) ? " · re-check due" : "");
    $("#wz-notes").textContent = b.notes || "";
    $("#wz-open").textContent = isEmailBroker(b) ? "✉️ Copy details & open prefilled email" : "↗ Copy details & open opt-out page";
    $("#wz-email").hidden = isEmailBroker(b);
    $("#wz-copy").textContent = detailsText();
    $("#wizard").hidden = false;
  }
  $("#btn-delete-all").addEventListener("click", function () {
    if (!hasProfile()) { alert("Add your info first (name and at least one email) — it's saved only in this browser."); showTab("info"); return; }
    wq = queue(); wi = 0;
    if (!wq.length) { alert("Nothing to do — every enabled broker is submitted or confirmed and not yet due for a re-check."); return; }
    wzShow();
    // One click starts it: open the first broker right away (this click is the user gesture).
    doOpen(wq[0], false); toast("Opened " + wq[0].name + " in a new tab. Your details are on the clipboard.");
    $("#wz-meta").textContent = (CAT_LABEL[wq[0].category] || "") + " · status: Opened";
  });
  $("#wz-open").addEventListener("click", function () { var b = wq[wi]; doOpen(b, false); toast("Opened. Paste your details into the form."); wzShow(); });
  $("#wz-email").addEventListener("click", function () { var b = wq[wi]; doOpen(b, true); toast("Opened a prefilled email — add the broker's privacy address and send."); wzShow(); });
  $("#wz-recopy").addEventListener("click", function () { copy(detailsText()); toast("Copied."); });
  function advance(newStatus) { if (newStatus) setStatus(wq[wi].id, newStatus); wi++; render(); wzShow(); }
  $("#wz-skip").addEventListener("click", function () { advance(null); });
  $("#wz-submitted").addEventListener("click", function () { advance("submitted"); });
  $("#wz-confirmed").addEventListener("click", function () { advance("confirmed"); });
  $("#wz-close").addEventListener("click", function () { $("#wizard").hidden = true; render(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#wizard").hidden) { $("#wizard").hidden = true; render(); } });

  fillForm(); render();
})();
