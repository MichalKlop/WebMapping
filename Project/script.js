// [Config]
// The following values can be changed to control rotation speed:
const secondsPerRevolution = 240; // Complete a revolution every two minutes
const maxSpinZoom = 5; // Above this zoom level, do not rotate
const slowSpinZoom = 3; // Rotate at intermediate speeds between zoom levels 3 and 5

let userInteracting = false; // User interaction flag
let spinEnabled = true; // Spin enabled flag

const defaultZoom = 2; // Default zoom level
const maxMarkerZoom = 13; // Maximum zoom level for marker visibility


// [Mapbox initialization]
mapboxgl.accessToken = 'pk.eyJ1IjoibWljaGFsLWsiLCJhIjoiY205MGJxNGM5MGUxcDJrcHk1Z3c1OTRuaSJ9.wNhbZOZFlMWox_I3QbxunQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/satellite-v9',
  projection: 'globe',
  zoom: 2,
  center: [30, 15]
});


// [Track markers and locations]
function showTrack(country) {
    const track = trackLocations[country];
    if (track) {
      map.flyTo({ center: [track.lon, track.lat], zoom: track.zoom });
    }
  }

let trackLocations = {}; // Track locations
let markers = []; // Array to store all markers

fetch('data/championships/f1-locations-2025.json')
  .then(response => response.json())
  .then(data => {
    trackLocations = data.reduce((acc, item) => {
      acc[item.location] = item;
      return acc;
    }, {});

    console.debug("Track Locations loaded:", trackLocations);

    // Create markers
    for (const country in trackLocations) {
      const { lon, lat, name } = trackLocations[country];
      console.debug("Creating marker for:", country);
      const el = document.createElement('div');
      el.className = 'marker';
      const marker = new mapboxgl.Marker(el)
        .setLngLat([lon, lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<strong>${country} GP</strong><br>${name}<br><button onclick="showTrack('${country}')">Zoom to Track</button>`
          )
        )
        .addTo(map);
      markers.push(marker); // Store marker reference
    }
  })
  .catch(error => console.error('Error loading track locations:', error));

  
// [Map styling] 
// fog/atmosphere
map.on('style.load', () => {
    map.setFog({
    color: 'rgb(186, 210, 235)', // Lower atmosphere
    'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
    'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
    'space-color': 'rgb(11, 11, 25)', // Background color
    'star-intensity': 0.6 // Background star brightness (default 0.35 at low zoooms )
    });
});

// Marker visibility
function updateMarkersVisibility() {
  const zoom = map.getZoom();
  const isHidden = zoom >= maxMarkerZoom;
  markers.forEach(marker => {
    const el = marker.getElement();
    if (isHidden) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });
}
updateMarkersVisibility();

// Spin globe
function spinGlobe() {
  const zoom = map.getZoom();
  if (!spinEnabled || userInteracting || zoom >= maxSpinZoom) return;

  let distancePerSecond = 360 / secondsPerRevolution;
  if (zoom > slowSpinZoom) {
    distancePerSecond *= (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
  }

  const center = map.getCenter();
  center.lng -= distancePerSecond;
  map.easeTo({ center, duration: 1000, easing: (n) => n, essential: true });
}
spinGlobe();


// [Map controls]
// Navigation control
map.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

// Reset zoom control
const resetZoom = document.getElementById('reset-zoom');
function updateResetZoomVisibility() {
  const currentZoom = map.getZoom();
  if (currentZoom !== defaultZoom) {
    resetZoom.classList.add('visible');
  } else {
    resetZoom.classList.remove('visible');
  }
}
updateResetZoomVisibility();

// Add click handler for reset zoom button
resetZoom.addEventListener('click', () => {
    map.easeTo({
      zoom: defaultZoom,
      duration: 1000
    });
});

// Spin control
const spinControl = document.getElementById('spin-control');

// Update spin control visibility based on zoom level
function updateSpinControlVisibility() { 
  const zoom = map.getZoom();
  if (zoom >= maxSpinZoom) {
    spinControl.classList.add('hidden');
  } else {
    spinControl.classList.remove('hidden');
  }
}
updateSpinControlVisibility();

// Update spin control
function updateSpinControl() {
  if (spinEnabled) {
    spinControl.innerHTML = '<i class="bi bi-pause-fill"></i> Stop Rotation';
  } else {
    spinControl.innerHTML = '<i class="bi bi-play-fill"></i> Resume Rotation';
  }
}

// Spin control click handler
spinControl.addEventListener('click', () => {
  spinEnabled = !spinEnabled;
  updateSpinControl();
  if (spinEnabled) spinGlobe();
  else map.stop();
});


// User interaction handling
['mousedown', 'dragstart', 'zoomstart', 'wheel'].forEach(event => {
  map.on(event, () => userInteracting = true);
});

['mouseup', 'dragend', 'zoomend'].forEach(event => {
  map.on(event, () => {
    userInteracting = false;
    if (spinEnabled) spinGlobe();
  });
});

map.on('moveend', () => {
  if (!userInteracting && spinEnabled) spinGlobe();
});

map.on('zoom', () => {
  updateMarkersVisibility();
  updateResetZoomVisibility();
  updateSpinControlVisibility();
})

