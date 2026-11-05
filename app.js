(function () {
  "use strict";

  var nf = function (cur, dec) {
    return new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(cur);
  };
  var parse = function (v) {
    if (typeof v !== "string") return Number(v) || 0;
    var s = v.trim().replace(/\s/g, "");
    // Accept "1.520,50", "1520.50" or "1520,5"
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.520" = mil quinientos veinte
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? n : 0;
  };
  var $ = function (id) { return document.getElementById(id); };
  var save = function (k, v) { try { localStorage.setItem("alamano." + k, v); } catch (e) {} };
  var load = function (k) { try { return localStorage.getItem("alamano." + k); } catch (e) { return null; } };

  function fetchRate(url, pick) {
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(pick);
  }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  /* ---------- Argentina ---------- */
  // Pure function: all amounts in ARS.
  function calcAR(usd, rate, iibbPct, sellos) {
    var base = usd * rate;
    var iva = base * 0.21;
    var iibb = base * (iibbPct / 100);
    var sel = sellos ? (base + iva + iibb) * 0.012 : 0;
    var total = base + iva + iibb + sel;
    return { base: base, iva: iva, iibb: iibb, sellos: sel, total: total, perUsd: usd > 0 ? total / usd : rate * (1.21 + iibbPct / 100) };
  }

  function initAR() {
    var usd = $("ar-usd"), rate = $("ar-rate"), prov = $("ar-prov"), other = $("ar-other"), otherWrap = $("ar-other-wrap"), sellos = $("ar-sellos");
    var p = load("ar.prov"); if (p && prov.querySelector('option[value="' + p + '"]')) prov.value = p;

    function render() {
      var pct = prov.value === "otra" ? parse(other.value) : parse(prov.value);
      otherWrap.hidden = prov.value !== "otra";
      var r = calcAR(parse(usd.value), parse(rate.value), pct, sellos.checked);
      $("ar-o-base").textContent = "$ " + nf(r.base, 2);
      $("ar-o-iva").textContent = "$ " + nf(r.iva, 2);
      $("ar-o-iibb-k").textContent = "Percepción IIBB " + nf(pct, pct % 1 ? 1 : 0) + "%";
      $("ar-o-iibb").textContent = "$ " + nf(r.iibb, 2);
      $("ar-row-sellos").hidden = !sellos.checked;
      $("ar-o-sellos").textContent = "$ " + nf(r.sellos, 2);
      $("ar-o-total").textContent = "$ " + nf(r.total, 2);
      $("ar-o-per").textContent = "$ " + nf(r.perUsd, 2);
      $("ar-o-pct").textContent = nf((r.base > 0 ? (r.total / r.base - 1) : (0.21 + pct / 100)) * 100, 1) + "%";
      save("ar.prov", prov.value);
    }
    [usd, rate, other].forEach(function (el) { el.addEventListener("input", render); });
    [prov, sellos].forEach(function (el) { el.addEventListener("change", render); });
    document.querySelectorAll("[data-usd]").forEach(function (b) {
      b.addEventListener("click", function () { usd.value = b.getAttribute("data-usd"); render(); });
    });
    render();

    fetchRate("https://dolarapi.com/v1/dolares/oficial", function (d) { return d; })
      .then(function (d) {
        if (!d || !d.venta) throw new Error("sin dato");
        rate.value = String(d.venta).replace(".", ",");
        var st = $("ar-rate-status");
        st.textContent = "Dólar oficial (venta) en vivo · actualizado " + fmtDate(d.fechaActualizacion);
        st.classList.add("live");
        render();
      })
      .catch(function () { /* keep the reference value; the status line already says so */ });
  }

  /* ---------- México ---------- */
  function calcMX(mode, amount, rate, feePct) {
    if (mode === "mxn") {
      var total = amount;
      var base = total / 1.16;
      return { converted: total, fee: 0, total: total, iva: total - base, base: base };
    }
    var conv = amount * rate;
    var fee = conv * (feePct / 100);
    return { converted: conv, fee: fee, total: conv + fee, iva: null, base: null };
  }

  function initMX() {
    var mode = "mxn";
    var amount = $("mx-amount"), rate = $("mx-rate"), fee = $("mx-fee");
    var bMxn = $("mx-mode-mxn"), bUsd = $("mx-mode-usd");

    function render() {
      var r = calcMX(mode, parse(amount.value), parse(rate.value), parse(fee.value));
      var usdMode = mode === "usd";
      $("mx-cur").textContent = usdMode ? "USD" : "MXN";
      $("mx-usd-fields").hidden = !usdMode;
      $("mx-mxn-rows").hidden = usdMode;
      $("mx-usd-rows").hidden = !usdMode;
      bMxn.setAttribute("aria-pressed", String(!usdMode));
      bUsd.setAttribute("aria-pressed", String(usdMode));
      if (usdMode) {
        $("mx-o-conv").textContent = "$ " + nf(r.converted, 2);
        $("mx-o-fee-k").textContent = "Comisión del banco " + nf(parse(fee.value), 1) + "%";
        $("mx-o-fee").textContent = "$ " + nf(r.fee, 2);
      } else {
        $("mx-o-base").textContent = "$ " + nf(r.base, 2);
        $("mx-o-iva").textContent = "$ " + nf(r.iva, 2);
      }
      $("mx-o-total").textContent = "$ " + nf(r.total, 2) + " MXN";
      $("mx-o-note").innerHTML = usdMode
        ? "Si la tienda cobra en dólares, tu banco convierte y puede sumar una <b>comisión por compra en el extranjero</b>. Revisa el porcentaje en el contrato de tu tarjeta."
        : "De lo que pagas, <b>$ " + nf(r.iva, 2) + "</b> son IVA. En Steam y PlayStation Store el precio en pesos ya lo incluye.";
    }
    function setMode(m) {
      mode = m;
      amount.value = m === "usd" ? "59.99" : "999";
      render();
    }
    bMxn.addEventListener("click", function () { setMode("mxn"); });
    bUsd.addEventListener("click", function () { setMode("usd"); });
    [amount, rate, fee].forEach(function (el) { el.addEventListener("input", render); });
    document.querySelectorAll("[data-mxn]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (mode !== "mxn") { mode = "mxn"; }
        amount.value = b.getAttribute("data-mxn"); render();
      });
    });
    render();

    fetchRate("https://mx.dolarapi.com/v1/cotizaciones/usd", function (d) { return d; })
      .then(function (d) {
        if (!d || !d.venta) throw new Error("sin dato");
        rate.value = String(d.venta);
        var st = $("mx-rate-status");
        st.textContent = "Tipo de cambio en vivo · actualizado " + fmtDate(d.fechaActualizacion);
        st.classList.add("live");
        render();
      })
      .catch(function () {});
  }

  var page = document.body ? document.body.getAttribute("data-page") : null;
  var el = document.querySelector("[data-page]");
  if (el) page = el.getAttribute("data-page");
  if (page === "ar") initAR();
  if (page === "mx") initMX();

  // Expose pure functions for testing
  window.ALaMano = { calcAR: calcAR, calcMX: calcMX, parse: parse };
})();
