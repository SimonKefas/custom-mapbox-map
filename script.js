(function () {
  /* ───────── Helpers ───────── */
  const toCoords = (str) => {
    if (!str) return null;
    const p = String(str).split(/,|\s/).map(Number).filter(n => !isNaN(n));
    return p.length === 2 ? [p[1], p[0]] : null;          /* [lng,lat] */
  };
  const json = (str) => { try { return str ? JSON.parse(str) : null; }
    catch { console.warn('[Mapbox] Bad JSON →', str); return null; } };
  const parsePair = (str, def = [0, 0]) => {
    if (!str) return def;
    const p = str.split(/,|\s/).map(Number).filter(n => !isNaN(n));
    return p.length === 2 ? p : def;
  };

  /* ───────── Global defaults ───────── */
  const GLOBAL = Object.assign({
    token  : window.MAPBOX_ACCESS_TOKEN ||
             document.documentElement.dataset.mapboxToken || '',
    style  : document.documentElement.dataset.mapboxStyle ||
             'mapbox://styles/mapbox/streets-v12',
    zoom   : 12,
    center : null,
    fitBoundsPadding : 60,
    fitBoundsMaxZoom : 14,
    initialCenterStrategy : 'first',          /* 'first' | 'mean' */
    /* popup */
    popupOffset : [0, -8],                    /* [pxX, pxY] extra shift */
    popupZIndex : 3,                          /* below Mapbox gesture prompt (z-index 4)*/
    /* clustering */
    cluster          : false,
    clusterRadius    : 50,
    clusterMaxZoom   : 14,
    clusterColor     : '#3b82f6',
    clusterTextColor : '#ffffff',
    clusterTextSize  : 12,
  }, window.MapboxDefaults || {});

  if (typeof mapboxgl === 'undefined') {
    console.error('[Mapbox] Mapbox GL JS not loaded'); return;
  }

  /* ───────── Initialise every map ───────── */
  document.querySelectorAll('[data-mapbox]').forEach(($map, midx) => {
    const LOCAL = Object.assign({}, GLOBAL, json($map.dataset.mapDefaults)||{});

    /* per-map overrides */
    if ($map.dataset.mapPopupOffset)
      LOCAL.popupOffset = parsePair($map.dataset.mapPopupOffset, LOCAL.popupOffset);
    if ($map.dataset.mapPopupZindex)
      LOCAL.popupZIndex = Number($map.dataset.mapPopupZindex)||LOCAL.popupZIndex;

    const token = $map.dataset.mapToken || LOCAL.token;
    if (!token) { console.error('[Mapbox] Missing access token'); return; }
    mapboxgl.accessToken = token;

    /* gather pins BEFORE building the map (for smart start centre) */
    const pinEls = Array.from($map.querySelectorAll('[data-pin-lat][data-pin-lng]'));
    const pinCoords = pinEls.map(p => [
      parseFloat(p.dataset.pinLng),
      parseFloat(p.dataset.pinLat)
    ]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

    let fallbackCenter = null;
    if (!($map.dataset.mapCenter || LOCAL.center) && pinCoords.length) {
      const strat = ($map.dataset.mapInitial || LOCAL.initialCenterStrategy).toLowerCase();
      if (strat === 'mean') {
        const sum = pinCoords.reduce((a,c)=>[a[0]+c[0], a[1]+c[1]],[0,0]);
        fallbackCenter = [sum[0]/pinCoords.length, sum[1]/pinCoords.length];
      } else fallbackCenter = pinCoords[0];                       /* 'first' */
    }

    if (getComputedStyle($map).position === 'static') $map.style.position = 'relative';

    /* ───────── Build map ───────── */
    const map = new mapboxgl.Map({
      container : $map,
      style     : $map.dataset.mapStyle || LOCAL.style,
      center    : toCoords($map.dataset.mapCenter) ||
                  LOCAL.center || fallbackCenter || [0,0],
      zoom      : parseFloat($map.dataset.mapZoom || LOCAL.zoom),
      cooperativeGestures : true,
    });
    map.scrollZoom.enable({ around:'pointer' });

    /* ── Zoom buttons / NavigationControl ── */
    const customZoomBtns = (() => {
      const zin  = $map.querySelectorAll('[data-map-zoom="in"]');
      const zout = $map.querySelectorAll('[data-map-zoom="out"]');
      zin .forEach(b=>b.addEventListener('click',e=>{e.preventDefault();map.zoomIn();}));
      zout.forEach(b=>b.addEventListener('click',e=>{e.preventDefault();map.zoomOut();}));
      return zin.length || zout.length;
    })();
    if (!customZoomBtns && $map.hasAttribute('data-map-nav'))
      map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');

    /* ───────── Popup builder ───────── */
    const buildPopup = (tmpl, lngLat, align = 'bottom', offsetPair=[0,0]) => {
      const wrap = tmpl.cloneNode(true);      /* keeps ALL author classes/markup */
      Object.assign(wrap.style, {
        position:'absolute',
        pointerEvents:'auto',
        zIndex: LOCAL.popupZIndex,
      });

      /* anchor base transform */
      const tf = {
        bottom:'translate(-50%, -100%)',
        top:   'translate(-50%, 0)',
        left:  'translate(-100%, -50%)',
        right: 'translate(0, -50%)',
        'top-left':'translate(-100%,0)',
        'top-right':'translate(0,0)',
        'bottom-left':'translate(-100%,-100%)',
        'bottom-right':'translate(0,-100%)',
      }[align] || 'translate(-50%, -100%)';

      /* add user offset */
      const [ox, oy] = offsetPair;
      wrap.style.transform = `${tf} translate(${ox}px, ${oy}px)`;

      /* close × */
      const btn = document.createElement('button');
      btn.type='button'; btn.innerHTML='×'; btn.setAttribute('aria-label','Close popup');
      Object.assign(btn.style,{
        position:'absolute',top:'4px',right:'6px',background:'none',
        border:'none',font:'inherit',fontSize:'1.25rem',cursor:'pointer',lineHeight:1
      });
      btn.addEventListener('click',()=>wrap.remove());
      wrap.appendChild(btn);

      const place = ()=>{ const pt = map.project(lngLat);
        wrap.style.left = pt.x+'px'; wrap.style.top = pt.y+'px'; };
      place(); map.on('move', place);
      return wrap;
    };

    /* ───────── Pin processing (cluster vs markers) ───────── */
    const clusterOn      = $map.hasAttribute('data-map-cluster') || LOCAL.cluster;
    const useCustomPopup = $map.dataset.mapPopup === 'custom';

    /* ---------- CLUSTER MODE ---------- */
    if (clusterOn) {
      const feats = pinEls.map((p,i)=>({
        type:'Feature',
        geometry:{type:'Point',coordinates:[
          parseFloat(p.dataset.pinLng),parseFloat(p.dataset.pinLat)]},
        properties:{
          html : p.innerHTML.trim(),
          align: (p.dataset.pinPopupAlign||'bottom').toLowerCase(),
          offset: parsePair(p.dataset.pinPopupOffset, LOCAL.popupOffset),
          id:`f_${midx}_${i}`
        }
      }));

      map.on('load',()=>{
        const srcId=`pins-${midx}`;
        map.addSource(srcId,{
          type:'geojson',
          data:{type:'FeatureCollection',features:feats},
          cluster:true,
          clusterRadius:LOCAL.clusterRadius,
          clusterMaxZoom:LOCAL.clusterMaxZoom
        });

        map.addLayer({
          id:`clusters-${midx}`, type:'circle', source:srcId,
          filter:['has','point_count'],
          paint:{
            'circle-color':LOCAL.clusterColor,
            'circle-radius':['step',['get','point_count'],15,10,20,30,25],
            'circle-opacity':0.85}
        });
        map.addLayer({
          id:`cluster-count-${midx}`, type:'symbol', source:srcId,
          filter:['has','point_count'],
          layout:{'text-field':['get','point_count'],'text-font':['Open Sans Bold'],
                  'text-size':LOCAL.clusterTextSize},
          paint:{'text-color':LOCAL.clusterTextColor}
        });

        /* default icon for unclustered points */
        const dot='default-dot';
        if(!map.hasImage(dot)){
          const c=document.createElement('canvas');c.width=c.height=32;
          const ctx=c.getContext('2d');ctx.fillStyle='#3b82f6';
          ctx.beginPath();ctx.arc(16,16,10,0,Math.PI*2);ctx.fill();
          map.addImage(dot,c,{pixelRatio:2});
        }
        map.addLayer({
          id:`pts-${midx}`,type:'symbol',source:srcId,
          filter:['!has','point_count'],
          layout:{'icon-image':dot,'icon-size':1}
        });

        map.on('click',`clusters-${midx}`,(e)=>{
          const cid=e.features[0].properties.cluster_id;
          map.getSource(srcId).getClusterExpansionZoom(cid,(err,z)=>{
            if(err) return;
            map.easeTo({center:e.features[0].geometry.coordinates,zoom:z});
          });
        });

        map.on('click',`pts-${midx}`,(e)=>{
          const f=e.features[0], ll=f.geometry.coordinates;
          if(useCustomPopup){
            $map.querySelectorAll('.wf-map-popup').forEach(el=>el.remove());
            const tmp=document.createElement('div'); tmp.innerHTML=f.properties.html;
            const el=buildPopup(tmp,ll,f.properties.align,
                                f.properties.offset);
            el.classList.add('wf-map-popup'); $map.appendChild(el);
          }else{
            new mapboxgl.Popup({anchor:f.properties.align,closeButton:true})
              .setLngLat(ll).setHTML(f.properties.html).addTo(map);
          }
        });

        if (!toCoords($map.dataset.mapCenter)){
          const b=new mapboxgl.LngLatBounds();
          feats.forEach(f=>b.extend(f.geometry.coordinates));
          const mz=parseFloat($map.dataset.mapMaxzoom||LOCAL.fitBoundsMaxZoom);
          map.fitBounds(b,{padding:LOCAL.fitBoundsPadding,maxZoom:mz});
        }
      });
    }

    /* ---------- SIMPLE MARKERS ---------- */
    else {
      const bounds=new mapboxgl.LngLatBounds();
      pinEls.forEach(p=>{
        const lat=parseFloat(p.dataset.pinLat), lng=parseFloat(p.dataset.pinLng);
        if(Number.isNaN(lat)||Number.isNaN(lng)) return;
        const iconURL=p.dataset.pinIcon, mOpts={};
        if(iconURL){const img=document.createElement('img'); img.src=iconURL;
          img.style.width='30px'; mOpts.element=img;}
        const marker=new mapboxgl.Marker(mOpts).setLngLat([lng,lat]).addTo(map);
        bounds.extend([lng,lat]);

        if(!p.innerHTML.trim()) return;
        const align=(p.dataset.pinPopupAlign||'bottom').toLowerCase();
        const offsetPair=parsePair(p.dataset.pinPopupOffset, LOCAL.popupOffset);

        if(useCustomPopup){
          marker.getElement().addEventListener('click',()=>{
            $map.querySelectorAll('.wf-map-popup').forEach(el=>el.remove());
            const el=buildPopup(p,[lng,lat],align,offsetPair);
            el.classList.add('wf-map-popup'); $map.appendChild(el);
          });
        }else{
          const pop=new mapboxgl.Popup({anchor:align,closeButton:true,offset:offsetPair})
            .setHTML(p.innerHTML);
          marker.setPopup(pop);
        }
      });

      if (!toCoords($map.dataset.mapCenter)){
        const mz=parseFloat($map.dataset.mapMaxzoom||LOCAL.fitBoundsMaxZoom);
        map.fitBounds(bounds,{padding:LOCAL.fitBoundsPadding,maxZoom:mz});
      }
    }
  });
})();