<<<<<<< HEAD
# Mapbox Attribute Module — README

*Version v10-lite (May 21 2025)*

This document explains how to embed **multiple, CMS-driven Mapbox maps** in Webflow (or any HTML page) using nothing but data-attributes—plus **optional pin clustering** and **custom zoom buttons**.

---

## 1  — Prerequisites

```html
<!-- Mapbox GL assets – include ONCE per page -->
<link
  rel="stylesheet"
  href="https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.css">
<script
  src="https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.js"></script>
```

---

# 2  — Global configuration (put in `<head>` **before** the module)

```html
<script>
  /* Required: public access token */
  window.MAPBOX_ACCESS_TOKEN = 'pk.•••';

  /* Optional site-wide defaults */
  window.MapboxDefaults = {
    style: 'mapbox://styles/mapbox/light-v11',
    zoom: 9,
    fitBoundsPadding: 80,
    /* clustering defaults */
    cluster: false,
    clusterRadius: 70,
    clusterColor: '#14b8a6'
  };
</script>
```

---

## 3  — Add the **module script**

```html
<!-- Custom Mapbox Code - (put in before </body>) -->
<script
  src="https://cdn.jsdelivr.net/gh/SimonKefas/custom-mapbox-map@latest/script.js"></script>
```

---

## 4  — Markup cheat-sheet

| Where            | Attribute                      | Value / Purpose                           |
| ---------------- | ------------------------------ | ----------------------------------------- |
| **Map wrapper**  | `data-mapbox`                  | identifies an element as a map            |
|                  | `style="height:400px"`         | give it a height (CSS)                    |
|                  | `data-map-style`               | Mapbox style URL (override)               |
|                  | `data-map-zoom`                | starting zoom (number)                    |
|                  | `data-map-center`              | `lat,lng` to skip auto-fit                |
|                  | `data-map-token`               | override token for this map               |
|                  | `data-map-defaults`            | JSON blob to tweak defaults per map       |
|                  | `data-map-cluster`             | **enable pin clustering**                 |
|                  | `data-map-nav`                 | inject Mapbox’s native zoom buttons       |
| **Pin item**     | `data-pin-lat`, `data-pin-lng` | **required** coordinates                  |
|                  | `data-pin-icon`                | custom icon URL                           |
|                  | `data-pin-popup-align`         | `top` `bottom` `left` `right`…            |
| Inner HTML       | any markup → popup content     |                                           |
| **Zoom buttons** | `data-map-zoom="in"` / `out"`  | triggers `map.zoomIn()` / `map.zoomOut()` |

---

### Example (copy–paste)

```html
<div data-mapbox data-map-style="mapbox://styles/mapbox/dark-v11"
     data-map-cluster style="height:450px">

  <!-- Custom zoom UI -->
  <button class="zoom-btn" data-map-zoom="in">+</button>
  <button class="zoom-btn" data-map-zoom="out">−</button>

  <!-- CMS Collection List items could render exactly like this -->
  <div data-pin-lat="59.9139" data-pin-lng="10.7522"
       data-pin-icon="https://example.com/marker.svg"
       data-pin-popup-align="right">
    <h4>Oslo HQ</h4><p>Grensen 1,<br>0159 Oslo</p>
  </div>

  <div data-pin-lat="60.3913" data-pin-lng="5.3221">
    Bergen office
  </div>
</div>
```

---

## 5  — Feature highlights

* **Cooperative gestures** (Mapbox GL’s best-practice):

  * Desktop — map zooms only with **Ctrl** (Win/Linux) or **⌘ Cmd** (macOS) + scroll; simple left-click drag is enabled.
  * Touch — page scrolls with one finger; map pans/zooms with two fingers.
* **Custom zoom buttons** — just add `data-map-zoom="in|out"`; style any way you like.
* **Optional clustering** — add `data-map-cluster` or set `cluster:true` globally. Clusters are coloured circles that explode on click.
* **Auto-fit** — if no explicit `data-map-center`, the map zooms to fit all pins with padding.
* **Multi-map-safe** — every `[data-mapbox]` runs in its own scope; unlimited maps per page.

---

## 6  — Overriding defaults per map

Need a different cluster colour or radius on a single map? Use the JSON blob:

```html
<div data-mapbox
     data-map-cluster
     data-map-defaults='{
       "clusterColor":"#f59e0b",
       "clusterRadius":90,
       "zoom":6
     }'
     style="height:400px"></div>
```

---

## 7  — Troubleshooting

| Issue                              | Fix                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Map is invisible (0 px height)     | Add an explicit `height` in CSS or inline.                                                         |
| “Missing access token” error       | Ensure `window.MAPBOX_ACCESS_TOKEN` or `data-map-token` is set *before* the module runs.           |
| Pins render but pop-ups don’t open | Confirm inner HTML isn’t empty and there are no JavaScript errors.                                 |
| Custom icon not loading            | Check CORS (icon must allow cross-origin) and that the URL is correct/HTTPS.                       |
| Clustering looks wrong             | Ensure Mapbox GL ≥ v1.12 (clusters need it) and check `clusterRadius` / `clusterMaxZoom` settings. |
=======
# custom-mapbox-map
>>>>>>> 5a159a24f246456d5933ce7635d3f82f95b72c93
