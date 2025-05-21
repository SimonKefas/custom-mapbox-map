(function () {
  /* ---------- Helpers ---------- */
  const toCoords = (str) => {
    if (!str) return null;
    const p = String(str).split(/,|\s/).map(Number).filter((n) => !isNaN(n));
    return p.length === 2 ? [p[1], p[0]] : null; // Mapbox = [lng,lat]
  };
  const json = (str) => {
    try { return str ? JSON.parse(str) : null; }
    catch { console.warn("Mapbox module: invalid JSON", str); return null; }
  };

  /* ---------- Global defaults ---------- */
  const GLOBAL = Object.assign(
    {
      token:
        window.MAPBOX_ACCESS_TOKEN ||
        document.documentElement.dataset.mapboxToken ||
        "",
      style:
        document.documentElement.dataset.mapboxStyle ||
        "mapbox://styles/mapbox/streets-v12",
      zoom: 12,
      center: null,
      fitBoundsPadding: 60,
      fitBoundsMaxZoom: 14,            // NEW
      /* clustering */
      cluster: false,
      clusterRadius: 50,
      clusterMaxZoom: 14,
      clusterColor: "#3b82f6",
      clusterTextColor: "#ffffff",
      clusterTextSize: 12,
    },
    window.MapboxDefaults || {}
  );

  if (typeof mapboxgl === "undefined") {
    console.error("[Mapbox module] Mapbox GL JS not loaded");
    return;
  }

  /* ---------- Init every map ---------- */
  document.querySelectorAll("[data-mapbox]").forEach(($map, midx) => {
    const LOCAL = Object.assign({}, GLOBAL, json($map.dataset.mapDefaults) || {});
    const token = $map.dataset.mapToken || LOCAL.token;
    if (!token) {
      console.error("[Mapbox module] Missing access token");
      return;
    }
    mapboxgl.accessToken = token;

    /* ensure relative positioning for custom pop-ups */
    if (getComputedStyle($map).position === "static") $map.style.position = "relative";

    const map = new mapboxgl.Map({
      container: $map,
      style: $map.dataset.mapStyle || LOCAL.style,
      center: toCoords($map.dataset.mapCenter) || LOCAL.center || [0, 0],
      zoom: parseFloat($map.dataset.mapZoom || LOCAL.zoom),
      cooperativeGestures: true,
    });
    map.scrollZoom.enable({ around: "pointer" });

    /* ---------- Zoom controls ---------- */
    const hookZoomButtons = () => {
      const zin  = $map.querySelectorAll('[data-map-zoom="in"]');
      const zout = $map.querySelectorAll('[data-map-zoom="out"]');
      zin.forEach(b  => b.addEventListener("click", e => { e.preventDefault(); map.zoomIn(); }));
      zout.forEach(b => b.addEventListener("click", e => { e.preventDefault(); map.zoomOut(); }));
      return zin.length || zout.length;
    };
    const hasCustomZoom = hookZoomButtons();
    if (!hasCustomZoom && $map.hasAttribute("data-map-nav")) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    }

    /* ---------- Pins ---------- */
    const pinEls = Array.from($map.querySelectorAll("[data-pin-lat][data-pin-lng]"));
    if (!pinEls.length) return;

    const clusterOn      = $map.hasAttribute("data-map-cluster") || LOCAL.cluster;
    const useCustomPopup = $map.dataset.mapPopup === "custom";

    /* --- helper: build DOM popup that keeps author classes intact --- */
    const buildCustomPopup = (templateEl, lngLat, align = "bottom") => {
      const wrapper = templateEl.cloneNode(true);  // keeps combo-classes / children
      Object.assign(wrapper.style, {
        position: "absolute",
        pointerEvents: "auto",
        zIndex: 5,
      });
      /* anchor ↔ transform map */
      const xform = {
        bottom: "translate(-50%, -100%)",
        top: "translate(-50%, 0)",
        left: "translate(-100%, -50%)",
        right: "translate(0, -50%)",
        "top-left": "translate(-100%, 0)",
        "top-right": "translate(0, 0)",
        "bottom-left": "translate(-100%, -100%)",
        "bottom-right": "translate(0, -100%)",
      };
      wrapper.style.transform = xform[align] || xform.bottom;

      /* close button */
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = "×";
      btn.setAttribute("aria-label", "Close popup");
      Object.assign(btn.style, {
        position: "absolute", top: "4px", right: "6px",
        background: "none", border: "none", font: "inherit",
        fontSize: "1.25rem", cursor: "pointer", lineHeight: 1,
      });
      btn.addEventListener("click", () => wrapper.remove());
      wrapper.appendChild(btn);

      /* place + track */
      const place = () => {
        const pt = map.project(lngLat);
        wrapper.style.left = pt.x + "px";
        wrapper.style.top  = pt.y + "px";
      };
      place();
      map.on("move", place);
      return wrapper;
    };

    /* ---------- A) Cluster mode ---------- */
    if (clusterOn) {
      const features = pinEls.map((p, n) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            parseFloat(p.dataset.pinLng),
            parseFloat(p.dataset.pinLat),
          ],
        },
        properties: {
          popupHTML: p.innerHTML.trim(),
          iconURL: p.dataset.pinIcon || null,
          align: (p.dataset.pinPopupAlign || "bottom").toLowerCase(),
          id: `f_${midx}_${n}`,
        },
      }));

      map.on("load", () => {
        const srcId = `pins-${midx}`;
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features },
          cluster: true,
          clusterRadius: LOCAL.clusterRadius,
          clusterMaxZoom: LOCAL.clusterMaxZoom,
        });

        /* clusters */
        map.addLayer({
          id: `clusters-${midx}`,
          type: "circle",
          source: srcId,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": LOCAL.clusterColor,
            "circle-radius": [
              "step", ["get", "point_count"],
              15, 10, 20, 30, 25,
            ],
            "circle-opacity": 0.85,
          },
        });
        map.addLayer({
          id: `cluster-count-${midx}`,
          type: "symbol",
          source: srcId,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count"],
            "text-font": ["Open Sans Bold"],
            "text-size": LOCAL.clusterTextSize,
          },
          paint: { "text-color": LOCAL.clusterTextColor },
        });

        /* unclustered points (default icon) */
        const dot = "default-dot";
        if (!map.hasImage(dot)) {
          const c = document.createElement("canvas");
          c.width = c.height = 32;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI * 2); ctx.fill();
          map.addImage(dot, c, { pixelRatio: 2 });
        }
        map.addLayer({
          id: `unclustered-${midx}`,
          type: "symbol",
          source: srcId,
          filter: ["!has", "point_count"],
          layout: { "icon-image": dot, "icon-size": 1 },
        });

        /* cluster click → zoom in */
        map.on("click", `clusters-${midx}`, (e) => {
          const cid = e.features[0].properties.cluster_id;
          map.getSource(srcId).getClusterExpansionZoom(cid, (err, z) => {
            if (err) return;
            map.easeTo({ center: e.features[0].geometry.coordinates, zoom: z });
          });
        });

        /* point click → popup */
        map.on("click", `unclustered-${midx}`, (e) => {
          const f = e.features[0];
          const lngLat = f.geometry.coordinates;
          if (useCustomPopup) {
            $map.querySelectorAll(".wf-map-popup").forEach(el => el.remove());
            const tpl = document.createElement("div");
            tpl.innerHTML = f.properties.popupHTML;
            const popEl = buildCustomPopup(tpl, lngLat, f.properties.align);
            popEl.classList.add("wf-map-popup");
            $map.appendChild(popEl);
          } else {
            new mapboxgl.Popup({
              anchor: f.properties.align,
              closeButton: true,
            })
              .setLngLat(lngLat)
              .setHTML(f.properties.popupHTML)
              .addTo(map);
          }
        });

        /* auto-fit */
        if (!toCoords($map.dataset.mapCenter)) {
          const b = new mapboxgl.LngLatBounds();
          features.forEach(f => b.extend(f.geometry.coordinates));
          const maxZ = parseFloat($map.dataset.mapMaxzoom || LOCAL.fitBoundsMaxZoom);
          map.fitBounds(b, { padding: LOCAL.fitBoundsPadding, maxZoom: maxZ });
        }
      });
    }

    /* ---------- B) Simple markers ---------- */
    else {
      const bounds = new mapboxgl.LngLatBounds();
      pinEls.forEach(p => {
        const lat = parseFloat(p.dataset.pinLat);
        const lng = parseFloat(p.dataset.pinLng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        const iconURL = p.dataset.pinIcon;
        const mOpts = {};
        if (iconURL) {
          const img = document.createElement("img");
          img.src = iconURL;
          img.style.width = "30px";
          mOpts.element = img;
        }
        const marker = new mapboxgl.Marker(mOpts).setLngLat([lng, lat]).addTo(map);
        bounds.extend([lng, lat]);

        if (!p.innerHTML.trim()) return;
        const align = (p.dataset.pinPopupAlign || "bottom").toLowerCase();

        if (useCustomPopup) {
          marker.getElement().addEventListener("click", () => {
            $map.querySelectorAll(".wf-map-popup").forEach(el => el.remove());
            const popEl = buildCustomPopup(p, [lng, lat], align);
            popEl.classList.add("wf-map-popup");
            $map.appendChild(popEl);
          });
        } else {
          const pop = new mapboxgl.Popup({
            anchor: align,
            closeButton: true,
          }).setHTML(p.innerHTML);
          marker.setPopup(pop);
        }
      });

      if (!toCoords($map.dataset.mapCenter)) {
        const maxZ = parseFloat($map.dataset.mapMaxzoom || LOCAL.fitBoundsMaxZoom);
        map.fitBounds(bounds, { padding: LOCAL.fitBoundsPadding, maxZoom: maxZ });
      }
    }
  });
})();