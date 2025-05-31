// [Config]
// The following values can be changed to control rotation speed:
const secondsPerRevolution = 240; // Complete a revolution every two minutes
const maxSpinZoom = 5; // Above this zoom level, do not rotate
const slowSpinZoom = 3; // Rotate at intermediate speeds between zoom levels 3 and 5

let userInteracting = false; // User interaction flag
let spinEnabled = true; // Spin enabled flag

const defaultZoom = 2; // Default zoom level
const defaultPitch = 0; // Default pitch level
const defaultBearing = 0; // Default bearing level
const maxMarkerZoom = 8.5; // Maximum zoom level for marker visibility


// [Mapbox initialization]
mapboxgl.accessToken = 'pk.eyJ1IjoibWljaGFsLWsiLCJhIjoiY205MGJxNGM5MGUxcDJrcHk1Z3c1OTRuaSJ9.wNhbZOZFlMWox_I3QbxunQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/michal-k/cmazx0h7z009101sw9nxv7re9',
  projection: 'globe',
  zoom: 2,
  maxZoom: 18,
  minZoom: 2,
  center: [30, 15]
});

function isAnyPopupOpen() {
  return document.querySelector('.mapboxgl-popup') !== null;
}

// [Track markers and locations]
function showTrack(country) {
    const track = trackLocations[country];
    if (track) {
      map.flyTo({ center: [track.lon, track.lat], zoom: track.zoom });
    }
  }

let trackLocations = {}; // Track locations
let markers = []; // Array to store all markers
let popups = [];  // Array to store all popups

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
      const { lon, lat, name, id } = trackLocations[country];
      console.debug("Creating marker for:", country);
      const el = document.createElement('div');
      el.className = 'marker';
      const popup = new mapboxgl.Popup().setHTML(`
        <div class="titillium-web-bold">${country} GP</div>
        <div class="titillium-web-regular">${name}</div>
        <button class="zoom-to-track">Zoom to Track</button>
      `);

      // Load circuit GeoJSON if available
      if (id) {
        fetch(`data/circuits/${id}.geojson`)
          .then(response => response.json())
          .then(circuitData => {
            // Add source for this circuit
            const sourceId = `circuit-${id}`;
            map.addSource(sourceId, {
              type: 'geojson',
              data: circuitData,
              lineMetrics: true
            });

            // Add layer for this circuit
            map.addLayer({
              id: sourceId,
              type: 'line',
              source: sourceId,
              layout: {
                visibility: 'none' // Initially hidden
              },
              paint: {
                'line-color': '#FF1E00',
                'line-width': 3,
                'line-opacity': 0.95,
                'line-dasharray': [1, 0.5],
                'line-gradient': [
                  "interpolate",
                  ["linear"],
                  ["line-progress"],
                  0, "#FF1E00",     // F1 Red
                  0.3, "#FF4D4D",   // Lighter Red
                  0.6, "#FF8080",   // Even Lighter Red
                  0.8, "#FFB3B3",   // Very Light Red
                  1, "#FFFFFF"      // White
                ]
              }
            });

            // Add directional arrows layer
            map.addLayer({
              id: `${sourceId}-arrows`,
              type: 'symbol',
              source: sourceId,
              layout: {
                visibility: 'none', // Initially hidden
                'symbol-placement': 'line',
                'symbol-spacing': 10000, // Space between arrows in pixels
                'icon-image': 'arrow-right', // We'll need to add this icon
                'icon-size': 1.5,
                'icon-allow-overlap': false,
                'icon-ignore-placement': true
              }
            });
          })
          .catch(error => console.debug(`Circuit ${id} not found or error loading:`, error));
      }

      popup.on('open', () => {
        userInteracting = true;
        if (spinEnabled) {
          map.stop(); // Stop any ongoing spin
        }
        spinControl.classList.add('disabled');
        const button = document.querySelector('.zoom-to-track');
        if (button) {
          button.blur(); // Prevent button from staying focused
          button.addEventListener('click', () => {
            showTrack(country);
            map.once('moveend', () => popup.remove());
          });
        }
      });

      popup.on('close', () => {
        userInteracting = false;
        spinControl.classList.remove('disabled');
        if (spinEnabled) {
          spinGlobe(); // Resume spin
          updateSpinControl(); // Update button state immediately
          if (isAnyPopupOpen()) {
            popups.forEach(popup => popup.remove());
          }
        } 
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);
      markers.push(marker); // Store marker reference
      popups.push(popup);
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
  
  // Update markers
  markers.forEach(marker => {
    const el = marker.getElement();
    if (isHidden) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });

  // Update circuit layers
  for (const country in trackLocations) {
    const { id } = trackLocations[country];
    if (id) {
      const layerId = `circuit-${id}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          isHidden ? 'visible' : 'none'
        );
        // Update arrows layer visibility
        map.setLayoutProperty(
          `${layerId}-arrows`,
          'visibility',
          isHidden ? 'visible' : 'none'
        );
      }
    }
  }
}


// Spin globe
function spinGlobe() {
  const zoom = map.getZoom();
  if (!spinEnabled || userInteracting || isAnyPopupOpen() || zoom >= maxSpinZoom) return;

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
      pitch: defaultPitch,
      bearing: defaultBearing,
      duration: 1000
    });
    // Prevent the button from receiving focus
    resetZoom.blur();
});

// Spin control
const spinControl = document.getElementById('spin-control');

// Update spin control visibility based on zoom level
function updateSpinControlVisibility() { 
  const zoom = map.getZoom();
  if (zoom >= maxSpinZoom) {
    spinControl.classList.add('hidden');
    spinControl.classList.remove('disabled');
  } else {
    spinControl.classList.remove('hidden');
  }
}
updateSpinControlVisibility();

// Update spin control
function updateSpinControl() {
  const isActuallySpinning = spinEnabled && !userInteracting && !isAnyPopupOpen() && map.getZoom() < maxSpinZoom;
  if (isActuallySpinning) {
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
  // Prevent the button from receiving focus
  spinControl.blur();
});

document.addEventListener('keypress', function(event) {
  if (event.code === 'Space' && map.getZoom() < maxSpinZoom) {
    spinEnabled = !spinEnabled;
    updateSpinControl();
    if (spinEnabled) spinGlobe();
    else map.stop();
  }
});


// User interaction handling
['mousedown', 'dragstart', 'zoomstart'].forEach(event => {
  map.on(event, () => {
    userInteracting = true;
    updateSpinControl();
    spinControl.classList.add('disabled');
  });
});

['scrollZoom', 'wheel'].forEach(event => {
  map.on(event, () => {
    userInteracting = true;
    updateSpinControl();
    // Check if we're at minimum zoom and reset if so
    if (map.getZoom() <= map.getMinZoom()) {
      userInteracting = false;
      if (spinEnabled) spinGlobe();
    }
  });
});

['mouseup', 'dragend', 'zoomend'].forEach(event => {
  map.on(event, () => {
    userInteracting = false;
    if (spinEnabled) spinGlobe();
    updateSpinControl();
    spinControl.classList.remove('disabled');
  });
});

map.on('moveend', () => {
  if (!userInteracting && spinEnabled) spinGlobe();
  updateSpinControl();
});

map.on('zoom', () => {
  updateMarkersVisibility();
  updateResetZoomVisibility();
  updateSpinControlVisibility();
  updateSpinControl();
})

// Add this near the top of the file, after map initialization
map.on('load', () => {
  // Create a custom arrow SVG
  const arrowSvg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12H19M19 12L12 5M19 12L12 19" 
        stroke="#000" 
        stroke-width="4" 
        stroke-linecap="round" 
        stroke-linejoin="round"
        fill="none"/>
      <path d="M5 12H19M19 12L12 5M19 12L12 19" 
        stroke="#FF1E00" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round"
        fill="none"/>
    </svg>
  `;
  
  // Convert SVG to data URL
  const arrowDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(arrowSvg);
  
  // Create an image element
  const img = new Image();
  img.onload = () => {
    if (!map.hasImage('arrow-right')) {
      map.addImage('arrow-right', img);
    }
  };
  img.src = arrowDataUrl;
});

