/**
 * SVG Pedigree Viewer
 *
 * Usage: call initViewer("path/to/file.svg") after the DOM is ready.
 * The HTML page must contain the expected element IDs
 * (viewport, svg-container, controls buttons, search-box, etc.).
 */

function initViewer(svgFile) {
  "use strict";

  /* ── Configuration ── */
  const ZOOM_STEP = 1.3;
  const PAN_STEP  = 200;          // px per arrow-button click
  const MIN_ZOOM  = 0.02;
  const MAX_ZOOM  = 10;

  /* ── State ── */
  let scale = 1;
  let tx = 0, ty = 0;            // translation in screen px
  let svgW = 8186, svgH = 2980;  // updated once SVG loads

  const viewport  = document.getElementById("viewport");
  const container = document.getElementById("svg-container");

  /* ── Load SVG inline via fetch + DOMParser (proper SVG namespace) ── */
  let svgEl = null;

  fetch(svgFile)
    .then(r => r.text())
    .then(text => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "image/svg+xml");
      const errNode = xmlDoc.querySelector("parsererror");
      if (errNode) {
        console.error("SVG parse error:", errNode.textContent);
        container.textContent = "SVG parse error – see console.";
        return;
      }
      // Import the SVG element into our document (preserves SVG namespace)
      svgEl = document.importNode(xmlDoc.documentElement, true);
      container.appendChild(svgEl);

      const vb = svgEl.viewBox.baseVal;
      if (vb && vb.width) { svgW = vb.width; svgH = vb.height; }
      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      svgEl.setAttribute("width",  svgW);
      svgEl.setAttribute("height", svgH);
      svgEl.style.display = "block";

      zoomToFit();
    })
    .catch(err => {
      console.error("Failed to load SVG:", err);
      container.textContent = "Failed to load SVG. Try serving via a local web server.";
    });

  /* ── Transform helper ── */
  function applyTransform() {
    container.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  /* ── Zoom helpers ── */
  function zoomAroundCenter(newScale) {
    newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const cx = (vw / 2 - tx) / scale;
    const cy = (vh / 2 - ty) / scale;
    scale = newScale;
    tx = vw / 2 - cx * scale;
    ty = vh / 2 - cy * scale;
    applyTransform();
  }

  function zoomToFit() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    scale = Math.min(vw / svgW, vh / svgH) * 0.98;
    tx = (vw - svgW * scale) / 2;
    ty = (vh - svgH * scale) / 2;
    applyTransform();
  }

  function zoomTo100() {
    zoomAroundCenter(1);
  }

  /* ── Button wiring ── */
  document.getElementById("btn-zin").onclick   = () => zoomAroundCenter(scale * ZOOM_STEP);
  document.getElementById("btn-zout").onclick  = () => zoomAroundCenter(scale / ZOOM_STEP);
  document.getElementById("btn-z100").onclick  = zoomTo100;
  document.getElementById("btn-zfit").onclick  = zoomToFit;
  document.getElementById("btn-up").onclick    = () => { ty += PAN_STEP; applyTransform(); };
  document.getElementById("btn-down").onclick  = () => { ty -= PAN_STEP; applyTransform(); };
  document.getElementById("btn-left").onclick  = () => { tx += PAN_STEP; applyTransform(); };
  document.getElementById("btn-right").onclick = () => { tx -= PAN_STEP; applyTransform(); };

  /* ── Mouse pan ── */
  let dragging = false, lastX, lastY;
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    viewport.classList.add("grabbing");
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", e => {
    if (!dragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });
  viewport.addEventListener("pointerup",     () => { dragging = false; viewport.classList.remove("grabbing"); });
  viewport.addEventListener("pointercancel", () => { dragging = false; viewport.classList.remove("grabbing"); });

  /* ── Touch pinch zoom and pan ── */
  let touches = [];
  let lastDistance = 0;
  let lastTouchCenterX = 0, lastTouchCenterY = 0;

  function getTouchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenter(touchList) {
    let sumX = 0, sumY = 0;
    for (const t of touchList) {
      sumX += t.clientX;
      sumY += t.clientY;
    }
    return { x: sumX / touchList.length, y: sumY / touchList.length };
  }

  viewport.addEventListener("touchstart", e => {
    if (e.touches.length >= 1) {
      e.preventDefault();
      touches = Array.from(e.touches);
      if (touches.length === 2) {
        lastDistance = getTouchDistance(touches[0], touches[1]);
        const center = getTouchCenter(touches);
        lastTouchCenterX = center.x;
        lastTouchCenterY = center.y;
      }
    }
  }, { passive: false });

  viewport.addEventListener("touchmove", e => {
    if (e.touches.length < 1) return;
    e.preventDefault();
    touches = Array.from(e.touches);

    if (touches.length === 2) {
      // Pinch zoom
      const currentDistance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches);
      const zoomFactor = currentDistance / lastDistance;
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * zoomFactor));

      // Zoom toward the touch center point
      const rect = viewport.getBoundingClientRect();
      const cx = (center.x - rect.left - tx) / scale;
      const cy = (center.y - rect.top - ty) / scale;
      scale = newScale;
      tx = (center.x - rect.left) - cx * scale;
      ty = (center.y - rect.top) - cy * scale;
      applyTransform();

      lastDistance = currentDistance;
      lastTouchCenterX = center.x;
      lastTouchCenterY = center.y;
    } else if (touches.length === 1) {
      // Single finger pan
      if (!dragging) {
        dragging = true;
        lastX = touches[0].clientX;
        lastY = touches[0].clientY;
      }
      tx += touches[0].clientX - lastX;
      ty += touches[0].clientY - lastY;
      lastX = touches[0].clientX;
      lastY = touches[0].clientY;
      applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener("touchend", e => {
    if (e.touches.length === 0) {
      touches = [];
      lastDistance = 0;
      dragging = false;
    } else {
      touches = Array.from(e.touches);
      if (touches.length === 1) {
        lastX = touches[0].clientX;
        lastY = touches[0].clientY;
      }
    }
  }, { passive: false });

  /* ── Mouse wheel zoom ── */
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    let newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * dir));

    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sx = (mx - tx) / scale;
    const sy = (my - ty) / scale;
    scale = newScale;
    tx = mx - sx * scale;
    ty = my - sy * scale;
    applyTransform();
  }, { passive: false });

  /* ── Keyboard shortcuts ── */
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    switch (e.key) {
      case "+": case "=": zoomAroundCenter(scale * ZOOM_STEP); break;
      case "-": case "_": zoomAroundCenter(scale / ZOOM_STEP); break;
      case "0":           zoomToFit(); break;
      case "1":           zoomTo100(); break;
      case "ArrowUp":     ty += PAN_STEP; applyTransform(); e.preventDefault(); break;
      case "ArrowDown":   ty -= PAN_STEP; applyTransform(); e.preventDefault(); break;
      case "ArrowLeft":   tx += PAN_STEP; applyTransform(); e.preventDefault(); break;
      case "ArrowRight":  tx -= PAN_STEP; applyTransform(); e.preventDefault(); break;
      case "f":           if (e.ctrlKey) { e.preventDefault(); document.getElementById("search-input").focus(); } break;
    }
  });

  /* ═══════════════ Search ═══════════════ */
  const searchInput = document.getElementById("search-input");
  const searchInfo  = document.getElementById("search-info");
  let matches = [];
  let matchIdx = -1;
  let highlightEls = [];

  function clearHighlights() {
    highlightEls.forEach(el => el.remove());
    highlightEls = [];
    matches = [];
    matchIdx = -1;
    searchInfo.textContent = "";
  }

  function doSearch() {
    clearHighlights();
    const query = searchInput.value.trim().toLowerCase();
    if (!query || !svgEl) {
      if (!svgEl) console.warn("Search: SVG not loaded yet");
      return;
    }

    const textEls = svgEl.querySelectorAll("text, tspan");
    const seen = new Set();
    for (const el of textEls) {
      if (el.textContent.toLowerCase().includes(query) && !seen.has(el)) {
        matches.push(el);
        seen.add(el);
        if (el.localName === "text") {
          el.querySelectorAll("tspan").forEach(ts => seen.add(ts));
        }
      }
    }
    const tspanSet = new Set(matches.filter(m => m.localName === "tspan"));
    matches = matches.filter(m => {
      if (m.localName === "text") {
        const childTspans = m.querySelectorAll("tspan");
        for (const ts of childTspans) {
          if (tspanSet.has(ts)) return false;
        }
      }
      return true;
    });

    if (matches.length === 0) {
      searchInfo.textContent = "0 / 0";
      return;
    }

    // Create highlight rectangles (transformed to SVG root coordinate space)
    const rootSvg = svgEl;
    for (const m of matches) {
      try {
        const bbox = m.getBBox();
        const ctm = m.getCTM();
        const pt1 = rootSvg.createSVGPoint();
        const pt2 = rootSvg.createSVGPoint();
        pt1.x = bbox.x; pt1.y = bbox.y;
        pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
        const tp1 = pt1.matrixTransform(ctm);
        const tp2 = pt2.matrixTransform(ctm);
        const rx = Math.min(tp1.x, tp2.x);
        const ry = Math.min(tp1.y, tp2.y);
        const rw = Math.abs(tp2.x - tp1.x);
        const rh = Math.abs(tp2.y - tp1.y);

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x",      rx - 4);
        rect.setAttribute("y",      ry - 2);
        rect.setAttribute("width",  rw + 8);
        rect.setAttribute("height", rh + 4);
        rect.setAttribute("rx", 3);
        rect.setAttribute("class", "search-highlight");
        if (!document.getElementById("_search_style")) {
          const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
          style.id = "_search_style";
          style.textContent = ".search-highlight{stroke:#ff2222;stroke-width:3;fill:rgba(255,50,50,.15);pointer-events:none}";
          rootSvg.prepend(style);
        }
        rootSvg.appendChild(rect);
        highlightEls.push(rect);
      } catch (_) { /* skip elements without bbox */ }
    }

    matchIdx = 0;
    goToMatch();
  }

  function goToMatch() {
    if (matches.length === 0) return;
    matchIdx = ((matchIdx % matches.length) + matches.length) % matches.length;
    searchInfo.textContent = `${matchIdx + 1} / ${matches.length}`;

    highlightEls.forEach((el, i) => {
      el.setAttribute("stroke-width", i === matchIdx ? "5" : "3");
      el.setAttribute("stroke", i === matchIdx ? "#0066ff" : "#ff2222");
      el.setAttribute("fill", i === matchIdx ? "rgba(0,100,255,.2)" : "rgba(255,50,50,.15)");
    });

    try {
      const bbox = matches[matchIdx].getBBox();
      const ctm = matches[matchIdx].getCTM();
      const pt = svgEl.createSVGPoint();
      pt.x = bbox.x + bbox.width / 2;
      pt.y = bbox.y + bbox.height / 2;
      const tp = pt.matrixTransform(ctm);
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      tx = vw / 2 - tp.x * scale;
      ty = vh / 2 - tp.y * scale;
      applyTransform();
    } catch (_) {}
  }

  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length === 0) {
        doSearch();
      } else {
        if (e.shiftKey) { matchIdx--; } else { matchIdx++; }
        goToMatch();
      }
    }
    if (e.key === "Escape") {
      clearHighlights();
      searchInput.value = "";
      searchInput.blur();
    }
  });
  searchInput.addEventListener("input", doSearch);
  document.getElementById("search-next").onclick  = () => { matchIdx++; goToMatch(); };
  document.getElementById("search-prev").onclick  = () => { matchIdx--; goToMatch(); };
  document.getElementById("search-clear").onclick = () => { clearHighlights(); searchInput.value = ""; };
}
