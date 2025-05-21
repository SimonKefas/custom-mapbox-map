(function () {
  /* ───────── Helpers ───────── */
  const toCoords = (str) => {
    if (!str) return null;
    const p = String(str).split(/,|\s/).map(Number).filter(n => !isNaN(n));
    return p.length === 2 ? [p[1], p[0]] : null;          /* [lng,lat] */
  };
  const json = (str) => { try { return str ? JSON.parse(str) : null; }
    catch { console.warn('[Mapbox] Bad JSON →', str); return null; } };
  const gap2offset = (anchor, g) => {
    const A = anchor.toLowerCase();
    const sign = (cond) => (cond ? -g : g);
    return {
      bottom:        [0, -g],
      top:           [0,  g],
      left:          [ g, 0],
      right:         [-g, 0],
      'bottom-left': [ g,-g],
      'bottom-right':[-g,-g],
      'top-left':    [ g, g],
      'top-right':   [-g, g],
    }[A] || [0, -g];                                    /* default bottom */
  };

  /* ───────── Global defaults ───────── */
  const GLOBAL = Object.assign({
    token : window.MAPBOX_ACCESS_TOKEN ||
            document.documentElement.dataset.mapboxToken || '',
    style : document.documentElement.dataset.mapboxStyle ||
            'mapbox://styles/mapbox/streets-v12',
    zoom  : 12,
    center: null,
    fitBoundsPadding : 60,
    fitBoundsMaxZoom : 14,
    initialCenterStrategy : 'first',       /* 'first' | 'mean' */
    popupGap  : 8,                         /* NEW default gap px */
    popupZIndex : 3,                       /* keep under Mapbox prompt (4) */
    /* clustering */
    cluster : false,
    clusterRadius : 50,
    clusterMaxZoom: 14,
    clusterColor : '#3b82f6',
    clusterTextColor: '#ffffff',
    clusterTextSize : 12,
  }, window.MapboxDefaults || {});

  if (typeof mapboxgl === 'undefined') {
    console.error('[Mapbox] Mapbox GL JS not loaded'); return;
  }

  /* ───────── Initialise every map ───────── */
  document.querySelectorAll('[data-mapbox]').forEach(($map, midx) => {
    const LOCAL = Object.assign({}, GLOBAL, json($map.dataset.mapDefaults)||{});

    /* per-map gap / z-index overrides */
    if ($map.dataset.mapPopupGap)
      LOCAL.popupGap = Number($map.dataset.mapPopupGap)||LOCAL.popupGap;
    if ($map.dataset.mapPopupZindex)
      LOCAL.popupZIndex = Number($map.dataset.mapPopupZindex)||LOCAL.popupZIndex;

    const token = $map.dataset.mapToken || LOCAL.token;
    if (!token){ console.error('[Mapbox] Missing access token'); return;}
    mapboxgl.accessToken = token;

    /* gather pins first (smart centre calculation) */
    const pinEls = Array.from($map.querySelectorAll('[data-pin-lat][data-pin-lng]'));
    const pinCoords = pinEls.map(p=>[
      parseFloat(p.dataset.pinLng),
      parseFloat(p.dataset.pinLat)]).filter(c=>!isNaN(c[0])&&!isNaN(c[1]));

    let fallbackCenter=null;
    if(!($map.dataset.mapCenter||LOCAL.center)&&pinCoords.length){
      const strat=($map.dataset.mapInitial||LOCAL.initialCenterStrategy).toLowerCase();
      fallbackCenter=strat==='mean'
        ? pinCoords.reduce((a,c)=>[a[0]+c[0],a[1]+c[1]],[0,0])
          .map(s=>s/pinCoords.length)
        : pinCoords[0];
    }

    if(getComputedStyle($map).position==='static') $map.style.position='relative';

    /* ───────── Build map ───────── */
    const map = new mapboxgl.Map({
      container : $map,
      style     : $map.dataset.mapStyle || LOCAL.style,
      center    : toCoords($map.dataset.mapCenter) ||
                  LOCAL.center || fallbackCenter || [0,0],
      zoom      : parseFloat($map.dataset.mapZoom || LOCAL.zoom),
      cooperativeGestures:true,
    });
    map.scrollZoom.enable({around:'pointer'});

    /* ── Zoom buttons / NavigationControl ── */
    const customZoom = (()=>{const zIn=$map.querySelectorAll('[data-map-zoom=\"in\"]');
      const zOut=$map.querySelectorAll('[data-map-zoom=\"out\"]');
      zIn.forEach(b=>b.addEventListener('click',e=>{e.preventDefault();map.zoomIn();}));
      zOut.forEach(b=>b.addEventListener('click',e=>{e.preventDefault();map.zoomOut();}));
      return zIn.length||zOut.length;})();
    if(!customZoom && $map.hasAttribute('data-map-nav'))
      map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');

    /* ───────── Popup builder ───────── */
    const buildPopup = (tmpl, lngLat, align='bottom', gapPx=LOCAL.popupGap) => {
      const wrap = tmpl.cloneNode(true);
      Object.assign(wrap.style,{
        position:'absolute',pointerEvents:'auto',zIndex:LOCAL.popupZIndex
      });
      /* anchor transform + auto gap */
      const xform = {
        bottom:'translate(-50%, -100%)',
        top   :'translate(-50%, 0)',
        left  :'translate(-100%, -50%)',
        right :'translate(0, -50%)',
        'top-left':'translate(-100%,0)',
        'top-right':'translate(0,0)',
        'bottom-left':'translate(-100%,-100%)',
        'bottom-right':'translate(0,-100%)'
      }[align] || 'translate(-50%, -100%)';
      const [ox,oy] = gap2offset(align,gapPx);
      wrap.style.transform = `${xform} translate(${ox}px, ${oy}px)`;

      const btn=document.createElement('button');
      btn.type='button';btn.innerHTML='×';btn.setAttribute('aria-label','Close popup');
      Object.assign(btn.style,{
        position:'absolute',top:'4px',right:'6px',background:'none',border:'none',
        font:'inherit',fontSize:'1.25rem',cursor:'pointer',lineHeight:1});
      btn.addEventListener('click',()=>wrap.remove());
      wrap.appendChild(btn);

      const place=()=>{const pt=map.project(lngLat);
        wrap.style.left=pt.x+'px';wrap.style.top=pt.y+'px';};
      place(); map.on('move',place);
      return wrap;
    };

    /* ───────── Process pins (cluster vs simple) ───────── */
    const clusterOn=$map.hasAttribute('data-map-cluster')||LOCAL.cluster;
    const useCustomPopup=$map.dataset.mapPopup==='custom';

    /* ---------- CLUSTER MODE ---------- */
    if(clusterOn){
      const feats=pinEls.map((p,i)=>({
        type:'Feature',
        geometry:{type:'Point',coordinates:[
          parseFloat(p.dataset.pinLng),parseFloat(p.dataset.pinLat)]},
        properties:{
          html:p.innerHTML.trim(),
          align:(p.dataset.pinPopupAlign||'bottom').toLowerCase(),
          gap:Number(p.dataset.pinPopupGap)||LOCAL.popupGap,
          id:`f_${midx}_${i}`
        }
      }));

      map.on('load',()=>{
        const src=`pins-${midx}`;
        map.addSource(src,{
          type:'geojson',
          data:{type:'FeatureCollection',features:feats},
          cluster:true,clusterRadius:LOCAL.clusterRadius,
          clusterMaxZoom:LOCAL.clusterMaxZoom
        });

        map.addLayer({id:`clusters-${midx}`,type:'circle',source:src,
          filter:['has','point_count'],
          paint:{'circle-color':LOCAL.clusterColor,
            'circle-radius':['step',['get','point_count'],15,10,20,30,25],
            'circle-opacity':0.85}});
        map.addLayer({id:`count-${midx}`,type:'symbol',source:src,
          filter:['has','point_count'],
          layout:{'text-field':['get','point_count'],'text-font':['Open Sans Bold'],
                  'text-size':LOCAL.clusterTextSize},
          paint:{'text-color':LOCAL.clusterTextColor}});

        const dot='default-dot';
        if(!map.hasImage(dot)){
          const c=document.createElement('canvas');c.width=c.height=32;
          const ctx=c.getContext('2d');ctx.fillStyle='#3b82f6';
          ctx.beginPath();ctx.arc(16,16,10,0,Math.PI*2);ctx.fill();
          map.addImage(dot,c,{pixelRatio:2});
        }
        map.addLayer({id:`pts-${midx}`,type:'symbol',source:src,
          filter:['!has','point_count'],
          layout:{'icon-image':dot,'icon-size':1}});

        map.on('click',`clusters-${midx}`,(e)=>{
          const cid=e.features[0].properties.cluster_id;
          map.getSource(src).getClusterExpansionZoom(cid,(err,z)=>{
            if(err)return;map.easeTo({center:e.features[0].geometry.coordinates,zoom:z});
          });
        });

        map.on('click',`pts-${midx}`,(e)=>{
          const f=e.features[0], ll=f.geometry.coordinates;
          if(useCustomPopup){
            $map.querySelectorAll('.wf-map-popup').forEach(el=>el.remove());
            const t=document.createElement('div'); t.innerHTML=f.properties.html;
            const el=buildPopup(t,ll,f.properties.align,f.properties.gap);
            el.classList.add('wf-map-popup');$map.appendChild(el);
          }else{
            new mapboxgl.Popup({
              anchor:f.properties.align,closeButton:true,
              offset:gap2offset(f.properties.align,f.properties.gap)
            }).setLngLat(ll).setHTML(f.properties.html).addTo(map);
          }
        });

        if(!toCoords($map.dataset.mapCenter)){
          const b=new mapboxgl.LngLatBounds();
          feats.forEach(f=>b.extend(f.geometry.coordinates));
          map.fitBounds(b,{padding:LOCAL.fitBoundsPadding,
            maxZoom:parseFloat($map.dataset.mapMaxzoom||LOCAL.fitBoundsMaxZoom)});
        }
      });
    }

    /* ---------- SIMPLE MARKERS ---------- */
    else{
      const bounds=new mapboxgl.LngLatBounds();
      pinEls.forEach(p=>{
        const lat=parseFloat(p.dataset.pinLat), lng=parseFloat(p.dataset.pinLng);
        if(Number.isNaN(lat)||Number.isNaN(lng)) return;
        const iconURL=p.dataset.pinIcon, mOpts={};
        if(iconURL){const img=document.createElement('img');img.src=iconURL;
          img.style.width='30px';mOpts.element=img;}
        const marker=new mapboxgl.Marker(mOpts).setLngLat([lng,lat]).addTo(map);
        bounds.extend([lng,lat]);

        if(!p.innerHTML.trim()) return;
        const align=(p.dataset.pinPopupAlign||'bottom').toLowerCase();
        const gap=Number(p.dataset.pinPopupGap)||LOCAL.popupGap;

        if(useCustomPopup){
          marker.getElement().addEventListener('click',()=>{
            $map.querySelectorAll('.wf-map-popup').forEach(el=>el.remove());
            const el=buildPopup(p,[lng,lat],align,gap);
            el.classList.add('wf-map-popup');$map.appendChild(el);
          });
        }else{
          marker.setPopup(
            new mapboxgl.Popup({
              anchor:align,closeButton:true,
              offset:gap2offset(align,gap)
            }).setHTML(p.innerHTML)
          );
        }
      });

      if(!toCoords($map.dataset.mapCenter)){
        map.fitBounds(bounds,{padding:LOCAL.fitBoundsPadding,
          maxZoom:parseFloat($map.dataset.mapMaxzoom||LOCAL.fitBoundsMaxZoom)});
      }
    }
  });
})();