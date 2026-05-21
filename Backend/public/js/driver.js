// ================================================================
//  DRIVER TRACKING PAGE — GPS Geofence Auto Stop Detection
//
//  How it works:
//    1. Every GPS tick → calculate distance to next stop
//    2. If stop has coordinates:
//         - Show proximity bar + distance
//         - GEOFENCE_RADIUS = 50m
//         - Inside radius → button turns green + auto-triggers
//         - Auto-trigger fires only ONCE per stop (autoTriggered flag)
//    3. If stop has NO coordinates:
//         - Show warning note
//         - Button enabled for manual tap at all times
//    4. On arrive (auto or manual) → POST /api/driver/route/stop-reached
//       → server clears waiting + advances current_stop_order
//       → emits route-waiting-updated → panel refreshes live
// ================================================================

const API            = '';
const GEOFENCE_RADIUS = 50;    // metres — bus must be within 50m of stop

// ── Token ─────────────────────────────────────────────────────────
let token = (localStorage.getItem('driver_token') || '').trim();
if (!token) {
  token = (prompt('Paste your Driver JWT token:') || '').trim();
  if (token) localStorage.setItem('driver_token', token);
}
if (!token) {
  document.getElementById('statusText').textContent = 'No token — reload and paste your token.';
  throw new Error('No driver token');
}

// ── State ─────────────────────────────────────────────────────────
let driverInfo      = {};
let currentRouteId  = null;
let nextStopData    = null;   // { stop_id, stop_name, stop_order, stop_lat, stop_lon, waiting_count }
let autoTriggered   = false;  // prevent double-fire per stop
let busLat          = null;
let busLon          = null;

// ── Map ───────────────────────────────────────────────────────────
const map = L.map('map').setView([10.8231, 78.6872], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const busIcon = L.divIcon({
  className: '',
  html: `<div style="background:#e74c3c;color:#fff;border-radius:50%;
    width:36px;height:36px;display:flex;align-items:center;justify-content:center;
    font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:3px solid #fff;">🚌</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18]
});

// Geofence circle drawn on map for the next stop
let stopCircle  = null;
let stopMarker  = null;
let myMarker    = null;

// ================================================================
//  HAVERSINE DISTANCE — returns metres between two lat/lon points
// ================================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R   = 6371000; // Earth radius in metres
  const φ1  = lat1 * Math.PI / 180;
  const φ2  = lat2 * Math.PI / 180;
  const Δφ  = (lat2 - lat1) * Math.PI / 180;
  const Δλ  = (lon2 - lon1) * Math.PI / 180;
  const a   = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ================================================================
//  GEOFENCE CHECK
//  Called on every GPS tick.
//  Updates proximity bar, enables/disables button, auto-triggers.
// ================================================================
function checkGeofence(lat, lon) {
  if (!nextStopData) return;

  const hasCoords = nextStopData.stop_lat != null && nextStopData.stop_lon != null;

  if (!hasCoords) {
    // No coordinates — manual mode
    document.getElementById('proximityBar').style.display  = 'none';
    document.getElementById('noCoordsNote').style.display  = 'block';
    document.getElementById('arriveBtn').disabled          = false;
    document.getElementById('geoNote').textContent         = 'Manual confirmation required';
    return;
  }

  document.getElementById('noCoordsNote').style.display  = 'none';
  document.getElementById('proximityBar').style.display  = 'flex';

  const dist    = haversineDistance(lat, lon,
                    parseFloat(nextStopData.stop_lat),
                    parseFloat(nextStopData.stop_lon));
  const distRounded = Math.round(dist);

  // ── Proximity bar fill (0% at 500m, 100% at 0m) ──────────────
  const maxVisualDist = 500;
  const fillPct       = Math.max(0, Math.min(100, (1 - dist / maxVisualDist) * 100));
  const fillEl        = document.getElementById('proxFill');
  fillEl.style.width  = `${fillPct}%`;

  // Colour by proximity
  fillEl.className = 'prox-fill';
  if (dist <= GEOFENCE_RADIUS)       fillEl.classList.add('inside');
  else if (dist <= GEOFENCE_RADIUS * 4) fillEl.classList.add('near');

  // Distance label
  document.getElementById('proxDist').textContent =
    dist < 1000 ? `${distRounded}m` : `${(dist/1000).toFixed(1)}km`;

  const btn = document.getElementById('arriveBtn');

  if (dist <= GEOFENCE_RADIUS) {
    // ── INSIDE GEOFENCE ────────────────────────────────────────
    document.getElementById('proxStatus').textContent  = '✅ At stop';
    document.getElementById('geoNote').textContent     = `Within ${GEOFENCE_RADIUS}m geofence`;
    btn.disabled   = false;
    btn.textContent = '✅ Mark Arrived';

    // Auto-trigger once per stop
    if (!autoTriggered) {
      autoTriggered = true;
      btn.classList.add('auto-trigger');
      btn.textContent = '⚡ Auto-detecting...';

      // Short delay so driver can see it happening
      setTimeout(() => {
        markArrived();
      }, 1500);
    }

  } else {
    // ── OUTSIDE GEOFENCE ───────────────────────────────────────
    document.getElementById('proxStatus').textContent = `${GEOFENCE_RADIUS}m`;
    document.getElementById('geoNote').textContent    =
      `Get within ${GEOFENCE_RADIUS}m of stop`;
    btn.disabled    = true;
    btn.textContent = 'Mark Arrived';
    btn.classList.remove('auto-trigger');
  }
}

// ================================================================
//  MARK ARRIVED — called by auto-trigger or manual button tap
// ================================================================
async function markArrived() {
  if (!nextStopData) return;

  const btn = document.getElementById('arriveBtn');
  btn.disabled    = true;
  btn.textContent = 'Processing...';

  try {
    const res = await fetch(`${API}/api/driver/route/stop-reached`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ stop_id: nextStopData.stop_id })
    });
    const data = await res.json();

    if (data.success) {
      flashMessage(`✅ Reached: ${nextStopData.stop_name}`, '#2ecc71');

      // Clear geofence visuals
      removeStopVisuals();

      if (data.trip_status === 'completed') {
        showTripComplete();
      } else {
        // Panel will update via route-waiting-updated socket event
        // Reset auto-trigger for the new next stop
        autoTriggered = false;
      }
    } else {
      flashMessage(`❌ ${data.message}`, '#e74c3c');
      btn.disabled    = false;
      btn.textContent = 'Mark Arrived';
      autoTriggered   = false;
    }
  } catch (e) {
    flashMessage('❌ Network error', '#e74c3c');
    btn.disabled    = false;
    btn.textContent = 'Mark Arrived';
    autoTriggered   = false;
  }
}

// Manual button click
function manualArrive() {
  markArrived();
}

// ================================================================
//  DRAW GEOFENCE CIRCLE on map for next stop
// ================================================================
function drawStopGeofence(lat, lon, name) {
  removeStopVisuals();

  stopMarker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: `<div style="background:#f1c40f;color:#1a1a2e;border-radius:50%;
        width:28px;height:28px;display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.4);
        border:2px solid #fff;">🚏</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14]
    })
  }).addTo(map).bindPopup(`<b>Next Stop</b><br>${name}`);

  stopCircle = L.circle([lat, lon], {
    radius:      GEOFENCE_RADIUS,
    color:       '#f1c40f',
    fillColor:   '#f1c40f',
    fillOpacity: 0.12,
    weight:      2,
    dashArray:   '5,5'
  }).addTo(map);
}

function removeStopVisuals() {
  if (stopCircle) { map.removeLayer(stopCircle); stopCircle = null; }
  if (stopMarker) { map.removeLayer(stopMarker); stopMarker = null; }
}

// ================================================================
//  LOAD ALL UPCOMING STOPS
// ================================================================
async function loadAllWaiting() {
  try {
    const res  = await fetch(`${API}/api/driver/route/all-waiting`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) return;

    currentRouteId = data.route_id;
    document.getElementById('infoRoute').textContent = data.route_name || '—';

    if (data.trip_status === 'completed') {
      showTripComplete();
      return;
    }

    renderPanel(data.stops);

  } catch (e) {
    console.error('loadAllWaiting error:', e);
  }
}

// ================================================================
//  RENDER PANEL
// ================================================================
function renderPanel(stops) {
  if (!stops || stops.length === 0) { showTripComplete(); return; }

  document.getElementById('tripCompleteBanner').style.display = 'none';

  const next = stops.find(s => s.is_next_stop);

  if (next) {
    nextStopData = next;   // store for geofence use

    document.getElementById('nsName').textContent    = next.stop_name;
    document.getElementById('nsWaiting').textContent =
      `${next.waiting_count} passenger${next.waiting_count !== 1 ? 's' : ''} waiting`;
    document.getElementById('nextStopSummary').style.display = 'block';

    // Draw geofence if coordinates available
    if (next.stop_lat != null && next.stop_lon != null) {
      drawStopGeofence(parseFloat(next.stop_lat), parseFloat(next.stop_lon), next.stop_name);
    } else {
      removeStopVisuals();
    }

    // Re-run geofence check with last known bus position
    if (busLat !== null) checkGeofence(busLat, busLon);

  } else {
    document.getElementById('nextStopSummary').style.display = 'none';
    nextStopData = null;
    removeStopVisuals();
  }

  // Upcoming list
  const listEl = document.getElementById('upcomingList');
  listEl.innerHTML = stops.map(stop => {
    const isNext     = stop.is_next_stop;
    const hasWaiting = stop.waiting_count > 0;
    return `
      <div class="stop-row" id="stop-row-${stop.stop_order}">
        <div class="stop-dot ${isNext ? 'next' : 'later'}"></div>
        <div class="stop-info">
          <div class="${isNext ? 'sname next-label' : 'sname'}">${stop.stop_name}</div>
        </div>
        <span class="stop-eta" id="stop-eta-${stop.stop_order}"></span>
        <div class="${hasWaiting ? 'stop-badge has-waiting' : 'stop-badge no-waiting'}"
             id="stop-badge-${stop.stop_order}">
          ${stop.waiting_count}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('upcomingSection').style.display = 'block';

  // Re-apply any existing ETA data to the newly rendered stops
  applyDriverETAs();
}

function showTripComplete() {
  nextStopData = null;
  driverETAStops = [];   // clear ETA data on trip completion
  removeStopVisuals();
  document.getElementById('nextStopSummary').style.display  = 'none';
  document.getElementById('upcomingSection').style.display  = 'none';
  document.getElementById('tripCompleteBanner').style.display = 'block';
  document.getElementById('speedDisplay').style.display = 'none';
}

// ── Profile ───────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const res  = await fetch(`${API}/api/driver/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
      // Invalid token — clear it so next refresh prompts for a new one
      if (res.status === 401) {
        localStorage.removeItem('driver_token');
        document.getElementById('statusText').textContent =
          'Session expired — reload and paste a fresh token.';
        return;
      }
      throw new Error(data.message);
    }
    driverInfo = data.driver;
    document.getElementById('infoName').textContent = driverInfo.driver_name || '—';
    document.getElementById('infoBus').textContent  = driverInfo.bus_number  || 'Not assigned';

    // ── Show persisted speed immediately on load ──────────────────
    // Priority: realtime (eta-updated) → persisted DB → 30 km/h
    // This ensures speed is NEVER blank after a page refresh.
    const persistedSpeed = driverInfo.current_speed_kmph || 30;
    const speedDisplay   = document.getElementById('speedDisplay');
    const speedValue     = document.getElementById('speedValue');
    if (speedDisplay && speedValue && persistedSpeed) {
      speedValue.textContent = persistedSpeed;
      speedDisplay.style.display = 'flex';
    }

    socket.emit('join:driver', { driverId: driverInfo.id });
    loadAllWaiting();
  } catch (e) {
    document.getElementById('statusText').textContent = 'Profile load failed: ' + e.message;
  }
}

// ── Socket ────────────────────────────────────────────────────────
// Pass the JWT token in the handshake so the server can verify identity.
// The server's io.use() middleware reads socket.handshake.auth.token.
const socket = io({ auth: { token } });

socket.on('connect', () => {
  document.getElementById('statusDot').classList.add('connected');
  document.getElementById('statusText').textContent = 'Connected — GPS active';
  if (driverInfo.id) socket.emit('join:driver', { driverId: driverInfo.id });
});

socket.on('disconnect', () => {
  document.getElementById('statusDot').classList.remove('connected');
  document.getElementById('statusText').textContent = 'Disconnected — reconnecting...';
});

socket.on('route-waiting-updated', (data) => {
  autoTriggered = false;   // reset for new stop
  renderPanel(data.stops);
});

socket.on('next-stop-updated', (data) => {
  // Quick-update the next-stop summary box.
  // Full panel re-render comes from route-waiting-updated which is always
  // emitted alongside this event — no need for an extra loadAllWaiting() call.
  document.getElementById('nsName').textContent    = data.next_stop_name;
  document.getElementById('nsWaiting').textContent =
    `${data.waiting_count} passenger${data.waiting_count !== 1 ? 's' : ''} waiting`;
});

socket.on('waiting:updated', (data) => {
  const badge = document.getElementById(`stop-badge-${data.stop_order}`);
  if (badge) {
    badge.textContent = data.total_waiting;
    badge.className   = data.total_waiting > 0 ? 'stop-badge has-waiting' : 'stop-badge no-waiting';
    if (nextStopData && data.stop_id === nextStopData.stop_id) {
      document.getElementById('nsWaiting').textContent =
        `${data.total_waiting} passenger${data.total_waiting !== 1 ? 's' : ''} waiting`;
      if (nextStopData) nextStopData.waiting_count = data.total_waiting;
    }
  }
});

socket.on('stop:reached', (data) => {
  flashMessage(`✅ Reached: ${data.stop_name} — ${data.passengers_reset} cleared`, '#2ecc71');
});

socket.on('trip:completed', () => {
  showTripComplete();
  flashMessage('🏁 Trip completed!', '#f1c40f');
});

socket.on('bus:route_assigned', () => {
  autoTriggered = false;
  driverETAStops = [];   // reset ETA on route reassignment
  loadAllWaiting();
});

// ── ETA STATE & HANDLER ──────────────────────────────────────────
let driverETAStops = [];   // upcoming_stops from eta-updated event

socket.on('eta-updated', (data) => {
  driverETAStops = data.upcoming_stops || [];

  // ── Update speed display ──────────────────────────────────────
  const speedDisplay = document.getElementById('speedDisplay');
  const speedValue   = document.getElementById('speedValue');
  if (speedDisplay && speedValue) {
    speedValue.textContent = data.current_speed_kmph || 0;
    speedDisplay.style.display = 'flex';
  }

  // ── Update next stop ETA in summary box ────────────────────────
  if (nextStopData && data.upcoming_stops) {
    const nextETA = data.upcoming_stops.find(s => s.stop_order === nextStopData.stop_order);
    if (nextETA) {
      const etaLabel = document.getElementById('nsETA');
      if (etaLabel) {
        etaLabel.textContent = `⏱ ${nextETA.eta_minutes} min`;
        etaLabel.style.display = 'inline';
      }
    }
  }

  // ── Update ETA labels beside each stop ─────────────────────────
  applyDriverETAs();
});

// Helper: apply ETA labels to rendered stop rows
function applyDriverETAs() {
  for (const stop of driverETAStops) {
    const etaEl = document.getElementById(`stop-eta-${stop.stop_order}`);
    if (etaEl) {
      etaEl.textContent = `⏱ ${stop.eta_minutes} min`;
    }
  }
}

// ================================================================
//  GPS WATCH — sends location to server + runs geofence check
// ================================================================
async function sendLocation(latitude, longitude) {
  busLat = latitude;
  busLon = longitude;

  // ── Geofence check every GPS tick ────────────────────────────
  checkGeofence(latitude, longitude);

  // ── Update server + move map marker ──────────────────────────
  try {
    const res = await fetch(`${API}/api/driver/update-location`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ latitude, longitude })
    });
    const data = await res.json();
    if (data.success) {
      if (!myMarker) {
        myMarker = L.marker([latitude, longitude], { icon: busIcon })
          .addTo(map)
          .bindPopup(`<b>${driverInfo.driver_name || 'You'}</b><br>${driverInfo.bus_number || ''}`);
        map.setView([latitude, longitude], 16);
      } else {
        myMarker.setLatLng([latitude, longitude]);
      }
      document.getElementById('coordText').textContent =
        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
  } catch (e) {
    console.error('Location update failed:', e);
  }
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
    (err) => { document.getElementById('statusText').textContent = 'GPS error: ' + err.message; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
} else {
  document.getElementById('statusText').textContent = 'Geolocation not supported';
}

// ── Flash ─────────────────────────────────────────────────────────
function flashMessage(msg, color = '#2ecc71') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
    background:${color};color:#1a1a2e;font-weight:600;
    padding:10px 20px;border-radius:8px;font-size:13px;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:9999;
    animation:fadeOut 3s forwards;white-space:nowrap;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const style = document.createElement('style');
style.textContent = `@keyframes fadeOut{0%{opacity:1}70%{opacity:1}100%{opacity:0}}`;
document.head.appendChild(style);

// ── Init ──────────────────────────────────────────────────────────
loadProfile();
