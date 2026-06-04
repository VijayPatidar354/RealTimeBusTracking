import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bus, Users, Gauge, Wifi, WifiOff,
  LogOut, ChevronRight, Clock, Flag, Radio,
} from 'lucide-react';
import { useDriverAuth } from '../../context/DriverAuthContext.jsx';
import { socket } from '../../sockets/socket.js';
import {
  getAllWaiting,
  getRouteStops,
  markStopReached,
  updateDriverLocation,
} from '../../services/driverService.js';

// ── Constants ─────────────────────────────────────────────────────
const GEOFENCE_RADIUS = 50;   // metres — must be within this to mark arrived
const MAX_VISUAL_DIST = 500;  // metres — proximity bar 0→100% over this distance

// ── Haversine distance (metres) ───────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R  = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════════
//  DRIVER MAP
//  Isolated component — all Leaflet state lives in refs so React
//  never touches the DOM that Leaflet owns.
//
//  Props:
//    coords        { lat, lon }  — driver's live GPS position
//    nextStop      stop object with stop_lat, stop_lon, stop_name, waiting_count
//    allStops      all stops on route [ { stop_order, stop_lat, stop_lon, stop_name } ]
//    currentStopOrder  integer — stops with stop_order < this are already passed
// ═══════════════════════════════════════════════════════════════════
function DriverMap({ coords, nextStop, allStops, currentStopOrder }) {
  const containerRef     = useRef(null);
  const mapRef           = useRef(null);
  const busMarkerRef     = useRef(null);
  const nextStopRef      = useRef(null);  // yellow next-stop marker
  const geofenceRef      = useRef(null);  // dashed circle
  const passedLineRef    = useRef(null);  // grey polyline — passed stops
  const remainLineRef    = useRef(null);  // blue polyline  — remaining stops
  const stopDotsRef      = useRef([]);    // small circle markers for every stop
  const initialPanRef    = useRef(false); // pan to driver only on first fix

  // ── Init map once ───────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !window.L) return;
    const L   = window.L;
    const map = L.map(containerRef.current, {
      zoomControl:       true,
      attributionControl: true,
    }).setView([10.8231, 78.6872], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current      = null;
      busMarkerRef.current    = null;
      nextStopRef.current     = null;
      geofenceRef.current     = null;
      passedLineRef.current   = null;
      remainLineRef.current   = null;
      stopDotsRef.current     = [];
      initialPanRef.current   = false;
    };
  }, []);

  // ── Draw/update route polyline + stop dots whenever allStops changes ──
  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map || !allStops?.length) return;

    // Filter stops that have coordinates
    const withCoords = allStops.filter(
      (s) => s.stop_lat && s.stop_lon
    );
    if (withCoords.length < 2) return;

    // Remove previous layers
    if (passedLineRef.current)  { map.removeLayer(passedLineRef.current);  passedLineRef.current  = null; }
    if (remainLineRef.current)  { map.removeLayer(remainLineRef.current);  remainLineRef.current  = null; }
    stopDotsRef.current.forEach((d) => map.removeLayer(d));
    stopDotsRef.current = [];

    const passedLatlngs  = [];
    const remainLatlngs  = [];

    withCoords.forEach((s) => {
      const ll      = [parseFloat(s.stop_lat), parseFloat(s.stop_lon)];
      const passed  = s.stop_order < currentStopOrder;

      if (passed) passedLatlngs.push(ll);
      else        remainLatlngs.push(ll);

      // Small circle marker for every stop
      const dot = L.circleMarker(ll, {
        radius:      passed ? 4 : 6,
        color:       passed ? '#374151' : '#3b82f6',
        fillColor:   passed ? '#1f2937' : '#1d4ed8',
        fillOpacity: 1,
        weight:      2,
      })
        .addTo(map)
        .bindPopup(
          `<b>${s.stop_name}</b><br>Stop ${s.stop_order}${passed ? '<br><small style="color:#6b7280">Passed</small>' : ''}`
        );

      stopDotsRef.current.push(dot);
    });

    // Passed segment — grey dashed
    if (passedLatlngs.length >= 2) {
      passedLineRef.current = L.polyline(passedLatlngs, {
        color:     '#374151',
        weight:    4,
        opacity:   0.6,
        dashArray: '6 8',
      }).addTo(map);
    }

    // Remaining segment — blue solid, like Ola/Rapido
    if (remainLatlngs.length >= 2) {
      remainLineRef.current = L.polyline(remainLatlngs, {
        color:   '#3b82f6',
        weight:  5,
        opacity: 0.9,
      }).addTo(map);

      // Fit map to remaining route on first load
      if (!initialPanRef.current && !coords) {
        map.fitBounds(remainLineRef.current.getBounds(), { padding: [40, 40] });
      }
    }
  }, [allStops, currentStopOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update bus marker (🚌) whenever driver GPS changes ──────────
  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map || !coords) return;

    const busIcon = L.divIcon({
      className: '',
      html: `<div style="
        background:#e74c3c;color:#fff;border-radius:50%;
        width:40px;height:40px;display:flex;align-items:center;justify-content:center;
        font-size:22px;box-shadow:0 3px 12px rgba(0,0,0,0.55);
        border:3px solid #fff;user-select:none;">🚌</div>`,
      iconSize:   [40, 40],
      iconAnchor: [20, 20],
    });

    if (!busMarkerRef.current) {
      busMarkerRef.current = L.marker([coords.lat, coords.lon], {
        icon:          busIcon,
        zIndexOffset:  1000,
      }).addTo(map).bindPopup('You are here');

      // Pan to driver on very first GPS fix
      if (!initialPanRef.current) {
        map.setView([coords.lat, coords.lon], 16);
        initialPanRef.current = true;
      }
    } else {
      // Smooth marker move — just update latlng
      busMarkerRef.current.setLatLng([coords.lat, coords.lon]);
    }
  }, [coords]);

  // ── Update next-stop marker + geofence circle ───────────────────
  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    // Remove previous
    if (nextStopRef.current)  { map.removeLayer(nextStopRef.current);  nextStopRef.current  = null; }
    if (geofenceRef.current)  { map.removeLayer(geofenceRef.current);  geofenceRef.current  = null; }

    if (!nextStop?.stop_lat || !nextStop?.stop_lon) return;

    const lat = parseFloat(nextStop.stop_lat);
    const lon = parseFloat(nextStop.stop_lon);

    const stopIcon = L.divIcon({
      className: '',
      html: `<div style="
        background:#f1c40f;color:#1a1a2e;border-radius:50%;
        width:32px;height:32px;display:flex;align-items:center;justify-content:center;
        font-size:16px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,0.45);
        border:2px solid #fff;">🚏</div>`,
      iconSize:   [32, 32],
      iconAnchor: [16, 16],
    });

    nextStopRef.current = L.marker([lat, lon], { icon: stopIcon })
      .addTo(map)
      .bindPopup(
        `<b>Next Stop</b><br>${nextStop.stop_name}<br>` +
        `<small>${nextStop.waiting_count} passenger${nextStop.waiting_count !== 1 ? 's' : ''} waiting</small>`
      );

    // Dashed geofence circle
    geofenceRef.current = L.circle([lat, lon], {
      radius:      GEOFENCE_RADIUS,
      color:       '#f1c40f',
      fillColor:   '#f1c40f',
      fillOpacity: 0.10,
      weight:      2,
      dashArray:   '6 6',
    }).addTo(map);
  }, [nextStop]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />
  );
}

// ═══════════════════════════════════════════════════════════════════
//  DRIVER DASHBOARD
// ═══════════════════════════════════════════════════════════════════
export default function DriverDashboard() {
  const { driver, token, logout, isAuthenticated, restoring } = useDriverAuth();
  const navigate = useNavigate();

  // ── State ────────────────────────────────────────────────────────
  const [leafletReady,      setLeafletReady]      = useState(!!window.L);
  const [stops,             setStops]             = useState([]);      // upcoming stops
  const [allRouteStops,     setAllRouteStops]      = useState([]);      // full route for polyline
  const [currentStopOrder,  setCurrentStopOrder]   = useState(1);
  const [nextStop,          setNextStop]           = useState(null);
  const [tripDone,          setTripDone]           = useState(false);
  const [routeName,         setRouteName]          = useState('');
  const [speed,             setSpeed]             = useState(null);
  const [etaStops,          setEtaStops]          = useState([]);
  const [connected,         setConnected]          = useState(socket.connected);
  const [gpsStatus,         setGpsStatus]          = useState('Waiting for GPS...');
  const [gpsError,          setGpsError]           = useState(false);
  const [coords,            setCoords]             = useState(null);
  const [distance,          setDistance]           = useState(null);
  const [arriving,          setArriving]           = useState(false);
  const [marking,           setMarking]            = useState(false);
  const [toast,             setToast]              = useState(null);

  const coordsRef        = useRef(null);
  const markingRef       = useRef(false);

  // ── Load Leaflet dynamically ──────────────────────────────────────
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const css    = document.createElement('link');
    css.rel      = 'stylesheet';
    css.href     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script    = document.createElement('script');
    script.src      = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload   = () => setLeafletReady(true);
    script.onerror  = () => console.error('Failed to load Leaflet');
    document.head.appendChild(script);
  }, []);

  // ── Auth guard ────────────────────────────────────────────────────
  useEffect(() => {
    if (!restoring && !isAuthenticated) navigate("/driver/login");
  }, [restoring, isAuthenticated, navigate]);

  // ── Toast helper ──────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load upcoming stops (waiting panel) ───────────────────────────
  const loadStops = useCallback(async () => {
    try {
      const data = await getAllWaiting(token);
      if (!data.success) return;
      setRouteName(data.route_name || '');
      if (data.trip_status === 'completed') { setTripDone(true); return; }
      setTripDone(false);
      const arr  = data.stops || [];
      setStops(arr);
      setCurrentStopOrder(data.current_stop_order ?? 1);
      const next = arr.find((s) => s.is_next_stop) || null;
      setNextStop(next);
    } catch (err) {
      showToast(err.message || 'Could not load stops', 'error');
    }
  }, [token, showToast]);

  // ── Load full route stops for polyline (once on mount) ────────────
  const loadRouteStops = useCallback(async () => {
    try {
      const data = await getRouteStops(token);
      if (data.success) {
        setAllRouteStops(data.stops || []);
        setCurrentStopOrder(data.current_stop_order ?? 1);
      }
    } catch (_) { /* non-critical — map still works without polyline */ }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStops();
      loadRouteStops();
    }
  }, [isAuthenticated, loadStops, loadRouteStops]);

  // ── Socket ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!driver?.id) return;

    const onConnect = () => {
      setConnected(true);
      socket.emit('join:driver', { driverId: driver.id });
    };
    const onDisconnect = () => setConnected(false);

    const onRouteWaiting = (data) => {
      const arr  = data.stops || [];
      setStops(arr);
      setCurrentStopOrder(data.current_stop_order ?? 1);
      const next = arr.find((s) => s.is_next_stop) || null;
      setNextStop(next);
      setTripDone(false);
    };

    const onNextStop = (data) => {
      setNextStop((prev) =>
        prev ? { ...prev, stop_name: data.next_stop_name, waiting_count: data.waiting_count } : prev
      );
    };

    const onWaitingUpdated = (data) => {
      setStops((prev) =>
        prev.map((s) =>
          s.stop_id === data.stop_id ? { ...s, waiting_count: data.total_waiting } : s
        )
      );
      setNextStop((prev) =>
        prev && prev.stop_id === data.stop_id
          ? { ...prev, waiting_count: data.total_waiting }
          : prev
      );
    };

    const onTripCompleted = (data) => {
      setTripDone(true);
      setStops([]);
      setNextStop(null);
      setEtaStops([]);
      setSpeed(null);
      setCurrentStopOrder((prev) => prev + 999);
      if (data?.auto_reversed) {
        // Backend already assigned reverse route — brief pause then reload
        showToast(`🔄 Return trip: ${data.next_route_name}`, 'success');
      } else {
        showToast('🏁 Trip completed!', 'success');
      }
    };

    const onBusRouteAssigned = (data) => {
      setEtaStops([]);
      setTripDone(false);          // clear trip done so panel shows new route
      setCurrentStopOrder(1);
      loadStops();
      loadRouteStops();
      if (data?.auto_reversed) {
        showToast(`🚌 Now running: ${data.route_name}`, 'success');
      }
    };

    const onEtaUpdated = (data) => {
      setSpeed(data.current_speed_kmph ?? null);
      setEtaStops(data.upcoming_stops || []);
    };

    socket.on('connect',               onConnect);
    socket.on('disconnect',            onDisconnect);
    socket.on('route-waiting-updated', onRouteWaiting);
    socket.on('next-stop-updated',     onNextStop);
    socket.on('waiting:updated',       onWaitingUpdated);
    socket.on('trip:completed',        onTripCompleted);
    socket.on('bus:route_assigned',    onBusRouteAssigned);
    socket.on('eta-updated',           onEtaUpdated);

    if (!socket.connected) socket.connect();
    else onConnect();

    return () => {
      socket.off('connect',               onConnect);
      socket.off('disconnect',            onDisconnect);
      socket.off('route-waiting-updated', onRouteWaiting);
      socket.off('next-stop-updated',     onNextStop);
      socket.off('waiting:updated',       onWaitingUpdated);
      socket.off('trip:completed',        onTripCompleted);
      socket.off('bus:route_assigned',    onBusRouteAssigned);
      socket.off('eta-updated',           onEtaUpdated);
    };
  }, [driver?.id, loadStops, loadRouteStops, showToast]);

  // ── GPS watch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported');
      setGpsError(true);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        coordsRef.current = { lat: latitude, lon: longitude };
        setGpsStatus(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setGpsError(false);
        try {
          await updateDriverLocation({ latitude, longitude, token });
        } catch (_) { /* silent */ }
      },
      (err) => { setGpsStatus(`GPS error: ${err.message}`); setGpsError(true); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isAuthenticated, token]);

  // ── Geofence check ────────────────────────────────────────────────
  useEffect(() => {
    if (!coords || !nextStop?.stop_lat || !nextStop?.stop_lon) {
      setDistance(null); setArriving(false); return;
    }
    const dist   = haversineDistance(
      coords.lat, coords.lon,
      parseFloat(nextStop.stop_lat), parseFloat(nextStop.stop_lon)
    );
    setDistance(Math.round(dist));
    const inside = dist <= GEOFENCE_RADIUS;
    setArriving(inside);

  }, [coords, nextStop]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark arrived ──────────────────────────────────────────────────
  const triggerMarkArrived = useCallback(async () => {
    const stop = nextStop;
    if (!stop || markingRef.current) return;
    markingRef.current = true;
    setMarking(true);
    try {
      const c    = coordsRef.current;
      const data = await markStopReached({
        stopId:    stop.stop_id,
        latitude:  c?.lat,
        longitude: c?.lon,
        token,
      });
      if (data.success) {
        showToast(`✅ Reached: ${stop.stop_name}`, 'success');
        // Advance polyline — the passed segment grows by one stop
        setCurrentStopOrder((prev) => prev + 1);
        if (data.trip_status === 'completed') setTripDone(true);
      }
    } catch (err) {
      showToast(err.message || 'Could not mark stop', 'error');
    } finally {
      markingRef.current = false;
      setMarking(false);
    }
  }, [nextStop, token, showToast]);

  const handleMarkArrived = () => triggerMarkArrived();
  const handleLogout      = () => { logout(); navigate('/driver/login'); };

  // ── ETA helper ────────────────────────────────────────────────────
  const getEta = (stopOrder) => {
    const found = etaStops.find((s) => s.stop_order === stopOrder);
    return found ? `${found.eta_minutes} min` : null;
  };

  // ── Derived UI ────────────────────────────────────────────────────
  const proxPct   = distance != null
    ? Math.max(0, Math.min(100, (1 - distance / MAX_VISUAL_DIST) * 100))
    : 0;
  const proxColor = arriving ? '#22c55e' : proxPct > 60 ? '#f1c40f' : '#e74c3c';
  const canArrive = !tripDone && nextStop && (arriving || !nextStop.stop_lat);

  if (restoring) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d0f14", color:"#6b7280", fontSize:13 }}>
      Restoring session...
    </div>
  );
  if (!isAuthenticated) return null;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d0f14', color:'#fff', overflow:'hidden', fontFamily:'system-ui,sans-serif' }}>

      {/* ══ TOP BAR ═══════════════════════════════════════════════ */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        gap:12, padding:'10px 16px', flexShrink:0,
        borderBottom:'1px solid rgba(255,255,255,0.08)',
        background:'rgba(17,20,28,0.95)', backdropFilter:'blur(8px)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'#2563eb', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Bus size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, lineHeight:1.2 }}>{driver?.driver_name || 'Driver'}</div>
            <div style={{ fontSize:11, color:'#6b7280' }}>{driver?.bus_number || 'No bus'}{routeName ? ` · ${routeName}` : ''}</div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {speed != null ? (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.08)' }}>
              <Gauge size={13} color="#f59e0b" />
              <span style={{ fontSize:12, fontWeight:700, color:'#f59e0b' }}>{speed} km/h</span>
            </div>
          ) : null}

          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, border:`1px solid ${gpsError ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: gpsError ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', maxWidth:200, overflow:'hidden' }}>
            <Radio size={11} color={gpsError ? '#ef4444' : '#22c55e'} />
            <span style={{ fontSize:11, color: gpsError ? '#ef4444' : '#22c55e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{gpsStatus}</span>
          </div>

          {connected ? <Wifi size={15} color="#22c55e" /> : <WifiOff size={15} color="#ef4444" />}

          <button onClick={handleLogout}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, cursor:'pointer', border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'#9ca3af', fontSize:12 }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor='rgba(239,68,68,0.4)'; e.currentTarget.style.color='#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.color='#9ca3af'; }}
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      {/* ══ BODY ══════════════════════════════════════════════════ */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* ── SIDE PANEL ───────────────────────────────────────── */}
        <aside style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:12, overflowY:'auto', overflowX:'hidden', padding:14, borderRight:'1px solid rgba(255,255,255,0.07)', background:'rgba(15,17,24,0.7)' }}>

          {tripDone ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:'28px 16px', textAlign:'center', borderRadius:14, border:'1px solid rgba(34,197,94,0.25)', background:'rgba(34,197,94,0.07)' }}>
              <Flag size={30} color="#22c55e" />
              <div style={{ fontSize:15, fontWeight:700, color:'#22c55e' }}>Trip Completed</div>
              <div style={{ fontSize:12, color:'#6b7280' }}>All stops have been reached.</div>
            </div>
          ) : (
            <>
              {/* NEXT STOP CARD */}
              {nextStop ? (
                <div style={{ borderRadius:14, border:'1px solid rgba(241,196,15,0.2)', background:'rgba(241,196,15,0.06)', padding:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                    <ChevronRight size={13} color="#f1c40f" />
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'#f1c40f' }}>Next Stop</span>
                  </div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:8 }}>{nextStop.stop_name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <Users size={13} color="#22c55e" />
                    <span style={{ fontSize:13, color:'#22c55e' }}>{nextStop.waiting_count} {nextStop.waiting_count === 1 ? 'passenger' : 'passengers'} waiting</span>
                  </div>
                  {getEta(nextStop.stop_order) ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                      <Clock size={13} color="#38bdf8" />
                      <span style={{ fontSize:13, color:'#38bdf8' }}>{getEta(nextStop.stop_order)}</span>
                    </div>
                  ) : null}

                  {/* Proximity bar */}
                  {nextStop.stop_lat ? (
                    <div style={{ marginTop:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280', marginBottom:4 }}>
                        <span>{distance != null ? (distance < 1000 ? `${distance}m` : `${(distance/1000).toFixed(1)}km`) : '—'}</span>
                        <span>{GEOFENCE_RADIUS}m geofence</span>
                      </div>
                      <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:3, width:`${proxPct}%`, background:proxColor, transition:'width 0.5s, background 0.5s' }} />
                      </div>
                      <div style={{ marginTop:4, fontSize:11, textAlign:'center', color: arriving ? '#22c55e' : '#6b7280', fontWeight: arriving ? 700 : 400 }}>
                        {arriving ? '✅ Within geofence — arriving' : `Get within ${GEOFENCE_RADIUS}m of stop`}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop:10, padding:'6px 10px', borderRadius:8, border:'1px solid rgba(245,158,11,0.2)', background:'rgba(245,158,11,0.08)', fontSize:11, color:'#f59e0b' }}>
                      ⚠ Stop has no GPS coordinates — manual mode
                    </div>
                  )}

                  <button onClick={handleMarkArrived} disabled={!canArrive || marking}
                    style={{ marginTop:12, width:'100%', padding:'11px 0', borderRadius:10, border:'none', fontSize:13, fontWeight:700, cursor: canArrive && !marking ? 'pointer' : 'not-allowed', transition:'all 0.2s',
                      background: marking ? 'rgba(255,255,255,0.08)' : arriving ? '#22c55e' : canArrive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                      color: marking ? '#4b5563' : arriving ? '#0d0f14' : canArrive ? '#fff' : '#374151',
                      animation: arriving && !marking ? 'pulse 1.6s ease-in-out infinite' : 'none',
                    }}>
                    {marking ? 'Processing...' : arriving ? '⚡ Mark Arrived' : 'Mark Arrived'}
                  </button>
                </div>
              ) : (
                <div style={{ borderRadius:14, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)', padding:16, textAlign:'center', fontSize:13, color:'#4b5563' }}>
                  No upcoming stops
                </div>
              )}

              {/* UPCOMING STOPS LIST */}
              {stops.length > 0 ? (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'#4b5563', marginBottom:8 }}>Upcoming Stops</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {stops.map((stop) => {
                      const isNext     = stop.is_next_stop;
                      const hasWaiting = stop.waiting_count > 0;
                      const eta        = getEta(stop.stop_order);
                      return (
                        <div key={stop.stop_order} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background: isNext ? 'rgba(241,196,15,0.08)' : 'rgba(255,255,255,0.03)', border: isNext ? '1px solid rgba(241,196,15,0.15)' : '1px solid transparent' }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: isNext ? '#f1c40f' : '#374151', boxShadow: isNext ? '0 0 6px #f1c40f88' : 'none' }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight: isNext ? 700 : 400, color: isNext ? '#f1c40f' : '#d1d5db', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{stop.stop_name}</div>
                            {eta ? <div style={{ fontSize:11, color:'#38bdf8' }}>⏱ {eta}</div> : null}
                          </div>
                          <div style={{ flexShrink:0, minWidth:24, textAlign:'center', padding:'2px 7px', borderRadius:20, fontSize:11, fontWeight:700, background: hasWaiting ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)', color: hasWaiting ? '#ef4444' : '#4b5563', border:`1px solid ${hasWaiting ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                            {stop.waiting_count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </aside>

        {/* ── MAP ──────────────────────────────────────────────── */}
        <main style={{ flex:1, position:'relative', minWidth:0, minHeight:0 }}>
          {leafletReady ? (
            <DriverMap
              coords={coords}
              nextStop={nextStop}
              allStops={allRouteStops}
              currentStopOrder={currentStopOrder}
            />
          ) : (
            <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#374151', gap:8 }}>
              <Bus size={40} color="#1f2937" />
              <span style={{ fontSize:13 }}>Loading map...</span>
            </div>
          )}

          {/* Arriving flash overlay */}
          {arriving && !marking ? (
            <div style={{ position:'absolute', top:16, left:'50%', transform:'translateX(-50%)', background:'#22c55e', color:'#0d0f14', padding:'8px 20px', borderRadius:20, fontSize:13, fontWeight:700, boxShadow:'0 4px 16px rgba(34,197,94,0.4)', animation:'pulse 1.6s ease-in-out infinite', zIndex:1000, whiteSpace:'nowrap' }}>
              ⚡ Arriving at {nextStop?.stop_name}
            </div>
          ) : null}

          {/* Map legend */}
          <div style={{ position:'absolute', bottom:24, right:14, background:'rgba(13,15,20,0.88)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 12px', fontSize:11, color:'#9ca3af', display:'flex', flexDirection:'column', gap:5, zIndex:500, backdropFilter:'blur(6px)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:24, height:4, borderRadius:2, background:'#3b82f6' }} />
              <span>Remaining route</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:24, height:3, borderRadius:2, background:'#374151', borderTop:'2px dashed #374151' }} />
              <span>Passed stops</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:14 }}>🚌</span><span>Your bus</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:14 }}>🚏</span><span>Next stop</span>
            </div>
          </div>
        </main>
      </div>

      {/* ══ TOAST ════════════════════════════════════════════════ */}
      {toast ? (
        <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', padding:'11px 22px', borderRadius:12, zIndex:9999, fontSize:13, fontWeight:600, whiteSpace:'nowrap', boxShadow:'0 6px 24px rgba(0,0,0,0.4)', background: toast.type === 'error' ? '#ef4444' : '#22c55e', color: toast.type === 'error' ? '#fff' : '#0d0f14', animation:'slideUp 0.2s ease' }}>
          {toast.msg}
        </div>
      ) : null}

      {/* ══ GLOBAL STYLES ════════════════════════════════════════ */}
      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.65} }
        @keyframes slideUp { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .leaflet-top   { z-index:400!important }
        .leaflet-pane  { z-index:300!important }
        aside::-webkit-scrollbar       { width:4px }
        aside::-webkit-scrollbar-track { background:transparent }
        aside::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1);border-radius:2px }
      `}</style>
    </div>
  );
}
