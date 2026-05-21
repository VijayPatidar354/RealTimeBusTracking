// ================================================================
//  PASSENGER LIVE MAP
//
//  Flow:
//    1. Page loads → GET /api/passenger/buses/live → draw all buses
//    2. Socket connects → joins route rooms for all visible routes
//    3. bus:location_updated → moves the matching marker in real-time
//    4. waiting:updated     → refreshes sidebar waiting counts
//    5. stop:reached        → shows a toast notification
//    6. Sidebar bus card click → map flies to that bus
// ================================================================

const API = '';   // same origin

// ── Map ───────────────────────────────────────────────────────────
const map = L.map('map').setView([10.8231, 78.6872], 13);  // Tiruchirappalli centre
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Icons
function makeBusIcon(busNumber, color = '#3498db') {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      color:#fff;
      border-radius:50%;
      width:38px;height:38px;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      border:3px solid #fff;
      text-align:center;line-height:1;
    ">${busNumber}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20]
  });
}

// ── State ─────────────────────────────────────────────────────────
const busMarkers  = {};   // bus_id → L.marker
const busData     = {};   // bus_id → bus object
const routeColors = {};   // route_id → color
const colorPalette = ['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22'];
let   colorIndex  = 0;

function getRouteColor(routeId) {
  if (!routeColors[routeId]) {
    routeColors[routeId] = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
  }
  return routeColors[routeId];
}

// ── Socket ────────────────────────────────────────────────────────
const socket = io();
const joinedRoutes = new Set();

socket.on('connect', () => {
  document.getElementById('statusDot').classList.add('connected');
  document.getElementById('statusText').textContent = 'Connected — live updates active';

  // Re-join all route rooms after reconnect
  joinedRoutes.forEach(routeId => {
    socket.emit('join:route', { routeId });
  });
});

socket.on('disconnect', () => {
  document.getElementById('statusDot').classList.remove('connected');
  document.getElementById('statusText').textContent = 'Reconnecting...';
});

// ── REAL-TIME: bus location ───────────────────────────────────────
socket.on('bus:location_updated', (data) => {
  const { bus_number, route_id } = data;

  // Normalise key and coordinates.
  // bus_id from the socket is a JS number; object keys are always strings,
  // but being explicit avoids any implicit-coercion mismatch with keys
  // created during the initial REST load (where pg returns ints as numbers).
  const bus_id = String(data.bus_id);
  // parseFloat guarantees Leaflet always receives a true JS number even if
  // the value arrives as a numeric string (pg NUMERIC columns over REST).
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);

  if (isNaN(lat) || isNaN(lng)) return; // malformed payload — skip silently

  if (busMarkers[bus_id]) {
    // ── Move existing marker ──────────────────────────────────────
    busMarkers[bus_id].setLatLng([lat, lng]);
  } else {
    // ── First event for this bus — create marker ──────────────────
    const color  = getRouteColor(route_id);
    const marker = L.marker([lat, lng], { icon: makeBusIcon(bus_number, color) })
      .addTo(map)
      .bindPopup(buildPopup(busData[bus_id] || { bus_number, route_id }));
    busMarkers[bus_id] = marker;
  }

  // Keep busData in sync so flyToBus() always has fresh coordinates
  if (busData[bus_id]) {
    busData[bus_id].latitude  = lat;
    busData[bus_id].longitude = lng;
  }

  // Update sidebar card location line
  const locationEl = document.getElementById(`bus-loc-${bus_id}`);
  if (locationEl) {
    locationEl.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  updateBusCount();
});

// ── REAL-TIME: waiting updated ────────────────────────────────────
socket.on('waiting:updated', (data) => {
  // Only toast when count > 0 (new passenger waiting).
  // count=0 is emitted by the server on stop:reached to reset UI — 
  // that scenario already shows its own toast via stop:reached.
  if (data.total_waiting > 0) {
    showToast(`🧍 ${data.total_waiting} waiting at ${data.stop_name}`);
  }
});

// ── REAL-TIME: stop reached ───────────────────────────────────────
socket.on('stop:reached', (data) => {
  showToast(`✅ Bus arrived at ${data.stop_name} — waiting cleared`);
});

// ── REAL-TIME: bus route assigned ────────────────────────────────
socket.on('bus:route_assigned', (data) => {
  showToast(`🚌 Bus ${data.bus_number} assigned to ${data.route_name}`);
  // Refresh the live bus list
  loadLiveBuses();
});

// ── Load all live buses ───────────────────────────────────────────
async function loadLiveBuses() {
  try {
    const res  = await fetch(`${API}/api/passenger/buses/live`);
    const data = await res.json();

    if (!data.success) return;

    data.buses.forEach(bus => {
      // Normalise key to String — matches the socket handler's String(data.bus_id)
      const busId = String(bus.bus_id);
      busData[busId] = bus;

      const color = getRouteColor(bus.route_id);

      // Place or update marker; parseFloat so Leaflet always gets a true number
      if (bus.latitude && bus.longitude) {
        const lat = parseFloat(bus.latitude);
        const lng = parseFloat(bus.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          if (busMarkers[busId]) {
            busMarkers[busId].setLatLng([lat, lng]);
          } else {
            busMarkers[busId] = L.marker(
              [lat, lng],
              { icon: makeBusIcon(bus.bus_number, color) }
            )
            .addTo(map)
            .bindPopup(buildPopup(bus));
          }
        }
      }

      // Join route room
      if (!joinedRoutes.has(bus.route_id)) {
        joinedRoutes.add(bus.route_id);
        socket.emit('join:route', { routeId: bus.route_id });
      }
    });

    renderSidebar(data.buses);
    updateBusCount();

  } catch (e) {
    console.error('Failed to load live buses:', e);
  }
}

// ── Sidebar ───────────────────────────────────────────────────────
function renderSidebar(buses) {
  const list = document.getElementById('busList');

  if (!buses.length) {
    list.innerHTML = '<div style="color:#666;font-size:13px">No buses online</div>';
    return;
  }

  list.innerHTML = buses.map(bus => {
    const color = getRouteColor(bus.route_id);
    const hasLoc = bus.latitude && bus.longitude;
    return `
      <div class="bus-card" onclick="flyToBus(${bus.bus_id})">
        <div class="bus-number" style="color:${color}">${bus.bus_number}</div>
        <div class="bus-meta">
          ${bus.route_name || 'Unknown route'}
          ${bus.driver_name ? `· ${bus.driver_name}` : ''}
        </div>
        <div class="bus-location" id="bus-loc-${bus.bus_id}">
          ${hasLoc
            ? `📍 ${Number(bus.latitude).toFixed(5)}, ${Number(bus.longitude).toFixed(5)}`
            : '📍 Location not yet available'}
        </div>
      </div>
    `;
  }).join('');
}

function flyToBus(busId) {
  const bus = busData[String(busId)];
  if (bus && bus.latitude && bus.longitude) {
    map.flyTo([parseFloat(bus.latitude), parseFloat(bus.longitude)], 16, { duration: 1 });
    if (busMarkers[String(busId)]) busMarkers[String(busId)].openPopup();
    loadRouteStops(bus.route_id, bus.route_name);
  } else {
    showToast('📍 Location not yet available for this bus');
  }
}

// ── Stop strip (bottom bar) ───────────────────────────────────────
async function loadRouteStops(routeId, routeName) {
  try {
    const res  = await fetch(`${API}/api/passenger/routes/${routeId}`);
    const data = await res.json();
    if (!data.success) return;

    const stops = data.route.stops;
    document.getElementById('stopListTitle').textContent = routeName || 'Stops';

    const body = stops.map((stop, i) => {
      const isFirst = i === 0;
      const isLast  = i === stops.length - 1;
      const cls     = isFirst ? 'first' : isLast ? 'last' : '';
      const connector = isLast ? '' : '<div class="stop-connector"></div>';
      return `
        <div style="display:flex;flex-direction:column">
          <div class="stop-track">
            <div class="stop-circle ${cls}"></div>
            <span class="stop-name">${stop.stop_name}</span>
          </div>
          ${connector}
        </div>
      `;
    }).join('');

    document.getElementById('stopListBody').innerHTML = body;
    document.getElementById('stopList').style.display = 'block';

  } catch (e) {
    console.error('Failed to load stops:', e);
  }
}

// ── Popup builder ─────────────────────────────────────────────────
function buildPopup(bus) {
  return `
    <div style="min-width:140px">
      <b style="font-size:14px">🚌 ${bus.bus_number}</b><br>
      <span style="color:#666;font-size:12px">${bus.bus_type || ''}</span><br>
      <span style="font-size:12px">Route: ${bus.route_name || bus.route_id || '—'}</span><br>
      ${bus.driver_name ? `<span style="font-size:12px">Driver: ${bus.driver_name}</span>` : ''}
    </div>
  `;
}

// ── Bus count ─────────────────────────────────────────────────────
function updateBusCount() {
  const count = Object.keys(busMarkers).length;
  document.getElementById('busCountText').textContent =
    count ? `${count} bus${count > 1 ? 'es' : ''} online` : '';
}

// ── Toast notification ────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:rgba(26,26,46,0.95);color:#fff;
    padding:10px 20px;border-radius:8px;font-size:13px;
    box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:9999;
    animation:fadeOut 3s forwards;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Fade-out animation
const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { 0%{opacity:1} 70%{opacity:1} 100%{opacity:0} }`;
document.head.appendChild(style);

// ── Init ──────────────────────────────────────────────────────────
loadLiveBuses();
