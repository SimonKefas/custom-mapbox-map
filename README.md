# Mapbox Attribute Module — README

*Version v1.0.0 (May 22 2025)*

Embed **multiple, CMS-driven Mapbox maps** in Webflow (or any HTML page) using nothing but data-attributes.
Key extras in v1:

* **Custom pop-ups** that clone your CMS element intact (`data-map-popup="custom"`).
* **Auto-fit zoom cap** (`fitBoundsMaxZoom` / `data-map-maxzoom`) so single-pin maps don’t zoom too far.
* Everything from earlier builds: cooperative gestures, optional clustering, custom zoom buttons, etc.

---

## 1 — Prerequisites

```html
<!-- Mapbox GL assets – include ONCE per page -->
<link rel="stylesheet"
      href="https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.css">
<script src="https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.js"></script>
```

---

## 2 — Global configuration (in `<head>` **before** the module)

```html
<script>
  /* Required */
  window.MAPBOX_ACCESS_TOKEN = 'pk.•••';

  /* Optional site-wide defaults */
  window.MapboxDefaults = {
    style: 'mapbox://styles/mapbox/light-v11',
    zoom: 9,
    fitBoundsPadding: 80,
    fitBoundsMaxZoom: 13,        // NEW
    /* clustering defaults */
    cluster: false,
    clusterRadius: 70,
    clusterColor: '#14b8a6'
  };
</script>
```

---

## 3 — Add the **module script before </body>**

```html
<script src="https://cdn.jsdelivr.net/gh/SimonKefas/custom-mapbox-map@latest/script.js"></script>
```

*(Or paste the raw script directly.)*

---

## 4 — Markup cheat-sheet

| Where            | Attribute                       | Purpose / Example                                                                 |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| **Map wrapper**  | `data-mapbox`                   | identifies an element as a map                                                    |
|                  | `style="height:400px"`          | set a height (CSS)                                                                |
|                  | `data-map-style`                | style URL override                                                                |
|                  | `data-map-zoom`                 | starting zoom                                                                     |
|                  | `data-map-center="lat,lng"`     | skip auto-fit                                                                     |
|                  | `data-map-maxzoom="12"`         | **cap** auto-fit zoom (NEW)                                                       |
|                  | `data-map-token`                | per-map token                                                                     |
|                  | `data-map-defaults='{…}'`       | JSON overrides                                                                    |
|                  | `data-map-cluster`              | enable clustering                                                                 |
|                  | `data-map-nav`                  | inject native zoom buttons                                                        |
|                  | `data-map-popup="custom"`       | use **custom** pop-ups (NEW)                                                      |
| **Pin item**     | `data-pin-lat` & `data-pin-lng` | **required** coords                                                               |
|                  | `data-pin-icon`                 | custom marker icon                                                                |
|                  | `data-pin-popup-align="left"`   | anchor (top, bottom, left, right, ­etc.) — works in custom & native pop-ups (NEW) |
| Inner HTML       | becomes pop-up body             |                                                                                   |
| **Zoom buttons** | `data-map-zoom="in"` / `out`    | triggers zoomIn / zoomOut                                                         |

---

### Example

```html
<div data-mapbox data-map-style="mapbox://styles/mapbox/dark-v11"
     data-map-popup="custom"
     data-map-cluster
     style="height:450px">

  <!-- Custom zoom UI -->
  <button class="zoom-btn" data-map-zoom="in">+</button>
  <button class="zoom-btn" data-map-zoom="out">−</button>

  <!-- CMS item 1 -->
  <div data-pin-lat="59.9139" data-pin-lng="10.7522"
       data-pin-icon="https://example.com/marker.svg"
       data-pin-popup-align="right"
       class="card card--purple">
    <h4>Oslo HQ</h4>
    <p>Gaustadalléen 21<br>0349 Oslo</p>
  </div>

  <!-- CMS item 2 -->
  <div data-pin-lat="60.3913" data-pin-lng="5.3221">
    Bergen office
  </div>
</div>
```

*When `data-map-popup="custom"` is present the module clones each pin element exactly, keeping all combo classes (`card card--purple` above). A small “×” button is appended for closing.*

---

## 5 — Feature highlights

* **Cooperative gestures** – Mapbox’s best-practice input model.

  * Desktop: hold **Ctrl** (Win/Linux) or **⌘** (macOS) while scrolling to zoom; drag-pan always on.
  * Touch: one-finger scroll moves the page; two-finger pan/zoom moves the map.
* **Custom zoom buttons** – any element with `data-map-zoom="in|out"`; or native buttons via `data-map-nav`.
* **Optional clustering** – attribute or global default; clusters explode on click.
* **Custom pop-ups** – clone the CMS element untouched, support all anchors, fully styleable.
* **Auto-fit with max zoom** – prevents “street-level” zoom when there’s only one pin.
* **Multi-map safe** – unlimited `[data-mapbox]` instances per page.

---

## 6 — Per-map overrides (JSON blob)

```html
<div data-mapbox
     data-map-defaults='{
       "fitBoundsMaxZoom": 11,
       "clusterColor": "#f59e0b",
       "clusterRadius": 90,
       "zoom": 6
     }'
     style="height:400px"></div>
```

---

## 7 — Troubleshooting

| Issue                       | Fix                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Map invisible (0 px height) | Give the wrapper a height in CSS/inline.                                                                 |
| “Missing access token”      | Ensure the token is defined *before* the module runs (`window.MAPBOX_ACCESS_TOKEN` or `data-map-token`). |
| Pop-ups don’t appear        | Confirm inner HTML isn’t empty and check console for JS errors.                                          |
| Custom marker icon missing  | Check HTTPS URL + CORS.                                                                                  |
| Clusters act weird          | Use Mapbox GL ≥ v1.12 and verify `clusterRadius` / `clusterMaxZoom`.                                     |
| Auto-fit zooms too close    | Lower `fitBoundsMaxZoom` globally, per-map JSON, or `data-map-maxzoom`.                                  |

---

Happy mapping! Feel free to reach out for extras like heatmaps, style pickers, or lazy-loaded placeholder images.