(function () {
  /* -------- Helpers -------- */
  const toCoords = (str) => {
    if (!str) return null;
    const p = String(str)
      .split(/,|\s/)
      .map(Number)
      .filter((n) => !isNaN(n));
    return p.length === 2 ? [p[1], p[0]] : null; // Mapbox expects [lng,lat]
  };
  const json = (str) => {
    try {
      return str ? JSON.parse(str) : null;
    } catch (e) {
      console.warn("Mapbox module: invalid JSON", str);
      return null;
    }
  };

  /* -------- Global defaults -------- */
  const GLOBAL_DEFAULTS = Object.assign(
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
      /* ---- clustering ---- */
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

  /* -------- Init every map -------- */
  document.querySelectorAll("[data-mapbox]").forEach(($map, idx) => {
    const LOCAL = Object.assign({}, GLOBAL_DEFAULTS, json($map.dataset.mapDefaults) || {});
    const token = $map.dataset.mapToken || LOCAL.token;
    if (!token) {
      console.error("[Mapbox module] Missing access token");
      return;
    }
    mapboxgl.accessToken = token;

    /* Ensure overlays position correctly */
    if (getComputedStyle($map).position === "static") $map.style.position = "relative";

    const map = new mapboxgl.Map({
      container: $map,
      style: $map.dataset.mapStyle || LOCAL.style,
      center: toCoords($map.dataset.mapCenter) || LOCAL.center || [0, 0],
      zoom: parseFloat($map.dataset.mapZoom || LOCAL.zoom),
      cooperativeGestures: true, // Ctrl/⌘ + wheel & 2-finger pan
    });
    map.scrollZoom.enable({ around: "pointer" }); // pointer-centric zoom

    /* -------- Custom zoom buttons -------- */
    const hookZoomButtons = () => {
      const zin = $map.querySelectorAll('[data-map-zoom="in"]');
      const zout = $map.querySelectorAll('[data-map-zoom="out"]');
      zin.forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); map.zoomIn(); }));
      zout.forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); map.zoomOut(); }));
      return zin.length || zout.length;
    };
    const hasCustomBtns = hookZoomButtons();

    if (!hasCustomBtns && $map.hasAttribute("data-map-nav")) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    }

    /* -------- Pins -------- */
    const pinEls = Array.from($map.querySelectorAll("[data-pin-lat][data-pin-lng]"));
    if (!pinEls.length) return;

    const clusterOn = $map.hasAttribute("data-map-cluster") || LOCAL.cluster;

    /** -------------------------------------------
     *  A) CLUSTER MODE  → use GeoJSON source/layers
     * ------------------------------------------- */
    if (clusterOn) {
      const features = pinEls.map((p, n) => {
        const lat = parseFloat(p.dataset.pinLat);
        const lng = parseFloat(p.dataset.pinLng);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            popup: p.innerHTML.trim(),
            icon: p.dataset.pinIcon || null,
            id: `f_${idx}_${n}`,
          },
        };
      });

      map.on("load", () => {
        const srcId = `pins-${idx}`;
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features },
          cluster: true,
          clusterRadius: LOCAL.clusterRadius,
          clusterMaxZoom: LOCAL.clusterMaxZoom,
        });

        /* clusters */
        map.addLayer({
          id: `clusters-${idx}`,
          type: "circle",
          source: srcId,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": LOCAL.clusterColor,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              15,
              10,
              20,
              30,
              25,
            ],
            "circle-opacity": 0.85,
          },
        });
        map.addLayer({
          id: `cluster-count-${idx}`,
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

        /* unclustered points – load custom icons if needed */
        const uniqIcons = [...new Set(features.map((f) => f.properties.icon).filter(Boolean))];
        const defaultName = "default-dot";
        const ensureDefault = () => {
          if (map.hasImage(defaultName)) return;
          const c = document.createElement("canvas");
          c.width = c.height = 32;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI * 2); ctx.fill();
          map.addImage(defaultName, c, { pixelRatio: 2 });
        };

        let toLoad = uniqIcons.length || 0;
        const finalize = () => {
          map.addLayer({
            id: `unclustered-${idx}`,
            type: "symbol",
            source: srcId,
            filter: ["!has", "point_count"],
            layout: { "icon-image": ["get", "img"], "icon-size": 1 },
          });

          map.on("click", `unclustered-${idx}`, (e) => {
            const f = e.features[0];
            new mapboxgl.Popup()
              .setLngLat(f.geometry.coordinates)
              .setHTML(f.properties.popup)
              .addTo(map);
          });

          /* cluster click → zoom in */
          map.on("click", `clusters-${idx}`, (e) => {
            const cid = e.features[0].properties.cluster_id;
            map.getSource(srcId).getClusterExpansionZoom(cid, (err, z) => {
              if (err) return;
              map.easeTo({ center: e.features[0].geometry.coordinates, zoom: z });
            });
          });
        };

        if (!uniqIcons.length) {
          ensureDefault();
          features.forEach((f) => (f.properties.img = defaultName));
          finalize();
        } else {
          ensureDefault();
          uniqIcons.forEach((url, i) => {
            map.loadImage(url, (err, img) => {
              const name = err ? defaultName : `img-${idx}-${i}`;
              if (!err) map.addImage(name, img);
              features
                .filter((f) => f.properties.icon === url)
                .forEach((f) => (f.properties.img = name));
              if (--toLoad === 0) finalize();
            });
          });
        }

        /* auto-fit */
        if (!toCoords($map.dataset.mapCenter)) {
          const b = new mapboxgl.LngLatBounds();
          features.forEach((f) => b.extend(f.geometry.coordinates));
          map.fitBounds(b, { padding: LOCAL.fitBoundsPadding });
        }
      });
    }

    /** -------------------------------------------
     *  B) NON-CLUSTER MODE  → keep simple Markers
     * ------------------------------------------- */
    else {
      const bounds = new mapboxgl.LngLatBounds();
      pinEls.forEach((p) => {
        const lat = parseFloat(p.dataset.pinLat);
        const lng = parseFloat(p.dataset.pinLng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        const iconUrl = p.dataset.pinIcon;
        const mOpts = {};
        if (iconUrl) {
          const img = document.createElement("img");
          img.src = iconUrl;
          img.style.width = "30px";
          mOpts.element = img;
        }
        const marker = new mapboxgl.Marker(mOpts).setLngLat([lng, lat]).addTo(map);
        if (p.innerHTML.trim()) {
          const pop = new mapboxgl.Popup({ anchor: p.dataset.pinPopupAlign || "bottom" })
            .setHTML(p.innerHTML);
          marker.setPopup(pop);
        }
        bounds.extend([lng, lat]);
      });
      if (!toCoords($map.dataset.mapCenter)) {
        map.fitBounds(bounds, { padding: LOCAL.fitBoundsPadding });
      }
    }
  });
})();