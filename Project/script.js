// [Config]
// Map settings
const defaultZoom = 2; // Default zoom level
const defaultPitch = 0; // Default pitch level
const defaultBearing = 0; // Default bearing level
const maxMarkerZoom = 8.5; // Maximum zoom level for marker visibility
const maxZoom = 18; // Maximum zoom level

// Spin settings
const secondsPerRevolution = 240; // Complete a revolution every two minutes
const maxSpinZoom = 5; // Above this zoom level, do not rotate
const slowSpinZoom = 3; // Rotate at intermediate speeds between zoom levels 3 and 5

// State variables/flags
let userInteracting = false; // User interaction flag
let spinEnabled = true; // Spin enabled flag

// Location data storage
let trackLocations = {}; // Track locations
let markers = []; // Array to store all markers
let popups = [];  // Array to store all popups
const circuits = [];  // Array to store all circuits

// elements
const resetZoom = document.getElementById('reset-zoom');
const spinControl = document.getElementById('spin-control');


// [Mapbox initialization]
mapboxgl.accessToken = 'pk.eyJ1IjoibWljaGFsLWsiLCJhIjoiY205MGJxNGM5MGUxcDJrcHk1Z3c1OTRuaSJ9.wNhbZOZFlMWox_I3QbxunQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/michal-k/cmazx0h7z009101sw9nxv7re9',
  projection: 'globe',
  zoom: defaultZoom,
  maxZoom: maxZoom,
  minZoom: defaultZoom,
  center: [30, 15]
});

// main
map.on('load', () => {
  loadMapData();
  spinGlobe();
  updateResetZoomVisibility();
  updateSpinControlVisibility();
});

// [Map Styling] 
map.on('style.load', () => {
  // Fog/atmosphere settings (default from mapbox docs)
  map.setFog({
  color: 'rgb(186, 210, 235)', // Lower atmosphere
  'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
  'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
  'space-color': 'rgb(11, 11, 25)', // Background color
  'star-intensity': 0.6 // Background star brightness (default 0.35 at low zoooms )
  });

  // Add arrow image to map (used in circuit view)
  // ".svg is not supported when loading images into a style at runtime using map.loadImage()" - mapbox docs
  // converted the svg to base64 which works as the src for the image
  const arrowDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0id2hpdGUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMSIgY2xhc3M9ImJpIGJpLWNhcmV0LXJpZ2h0LWZpbGwiIHZpZXdCb3g9IjAgMCAxNiAxNiI+CiAgPHBhdGggZD0ibTEyLjE0IDguNzUzLTUuNDgyIDQuNzk2Yy0uNjQ2LjU2Ni0xLjY1OC4xMDYtMS42NTgtLjc1M1YzLjIwNGExIDEgMCAwIDEgMS42NTktLjc1M2w1LjQ4IDQuNzk2YTEgMSAwIDAgMSAwIDEuNTA2eiIvPgo8L3N2Zz4K';
  const img = new Image();
  img.src = arrowDataUrl;
  img.onload = () => {
    if (!map.hasImage('arrow-right')) {
      map.addImage('arrow-right', img);
    }
  };
});


// [Helper functions]
// Check if any popup is open
function isAnyPopupOpen() {
  return document.querySelector('.mapboxgl-popup') !== null;
}

// Show track on map
function showTrack(country) {
  const track = trackLocations[country];
  if (track) {
    map.flyTo({ center: [track.lon, track.lat], zoom: track.zoom });
  }
}

// Update visibility of markers and circuits in detailed zoom levels
function updateDetailedView() {
  const currentZoom = map.getZoom();
  const isHidden = currentZoom >= maxMarkerZoom;
  
  // Update markers visibility
  markers.forEach(marker => {
    const el = marker.getElement();
    if (isHidden) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });

  // Update circuit visibility
  for (const country in trackLocations) {
    // For each country, get the layer id of the circuit (circuit-id)
    const layerId = `circuit-${trackLocations[country].id}`;
    const layerIdArrows = layerId + '-arrows';

    // Update circuit view visibility
    map.setLayoutProperty(
      layerId,
      'visibility',
      isHidden ? 'visible' : 'none'  // if isHidden==True, make visible, else hide
    );
    // Update circuit directional arrows visibility
    map.setLayoutProperty(
      layerIdArrows,
      'visibility',
      isHidden ? 'visible' : 'none'  // if isHidden==True, make visible, else hide
    );
  }
}

// Spin globe
function spinGlobe() {
  const currentZoom = map.getZoom();
  // If spin disabled, user interacting, popup open, or zoom too high, dont spin
  if (!spinEnabled || userInteracting || isAnyPopupOpen() || currentZoom >= maxSpinZoom) return;

  // Calculate distance per second based on zoom level
  let distancePerSecond = 360 / secondsPerRevolution;
  // If zoom is greater than slowSpinZoom, increase distance per second
  if (currentZoom > slowSpinZoom) {
    distancePerSecond *= (maxSpinZoom - currentZoom) / (maxSpinZoom - slowSpinZoom);
  }

  // Get current center of map
  const center = map.getCenter();
  // Subtract distance per second from longitude
  center.lng -= distancePerSecond;
  // Spin globe by easing to the new center
  map.easeTo({
    center: center,
    duration: 1000,
    essential: true, // forces the animation even when reduced motion is enabled
    easing(t) {
      return t;
    } 
  });
}

// create popup element and add handlers
function createPopup(country, name) {
  // Create popup element
  const popup = new mapboxgl.Popup().setHTML(`
    <div class="header">${country} GP</div>
    <div class="body">${name}</div>
    <button class="zoom-to-track">Zoom to Track</button>
  `);

  // Add popup handlers (open, close)
  popup.on('open', () => {
    userInteracting = true;  // User is interacting with the popup
    if (spinEnabled) {  // if spin is enabled, stop spinning
      map.stop();
    }
    spinControl.classList.add('disabled');  // disable spin control

    const button = popup.getElement().querySelector('.zoom-to-track');  // grab zoom to track button
    button.blur();  // if pressed previously, "blurring" removes focus/highlighting so spacebar can function correctly
    button.addEventListener('click', () => {  // on click of button, remove popup and zoom to track
      popup.remove();
      showTrack(country);
    });
  });

  popup.on('close', () => {
    userInteracting = false;  // User stopped interacting with the popup
    spinControl.classList.remove('disabled');  // make spin control interactable again
    if (spinEnabled) {  // if spin is enabled, resume spinning
      spinGlobe();
      updateSpinControl();
    }
  });

  // add popup to popups array and return it
  popups.push(popup); 
  return popup;
}

// create marker and attach popup to it then add to map
function createPOI(country, name, lon, lat) {
  // Create marker element
  const mark = document.createElement('div');  // Each marker gets its own div
  mark.className = 'marker';  // set class name

  // Create popup element
  const popup = createPopup(country, name);

  // Add marker to map
  const marker = new mapboxgl.Marker(mark)
    .setLngLat([lon, lat])
    .setPopup(popup)  // set the created popup to this marker
    .addTo(map);  // add marker to map

  markers.push(marker);  // add marker to markers array 
}


// [Load data and add to map]
// Helper function to load a single circuit and add to map
async function loadCircuit(id) {
  try {
    // Fetch circuit data and decode it as json
    const response = await fetch(`data/circuits/${id}.geojson`);
    const circuitData = await response.json();

    // Calculate bearing for directional arrows
    // (A directional arrow shows which direction the circuit goes when racing)
    // (Only a single arrow is needed for each circuit, but to know which direction it should point, we need to calculate the angle to the next point in the circuit)
    const circuitFeatures = circuitData.features[0];  // get the first feature (circuit)
    const [start, , next] = circuitFeatures.geometry.coordinates;  // get the first point and the next point in the circuit
    const dx = next[0] - start[0];  // calculate the difference in x coordinates
    const dy = next[1] - start[1];  // calculate the difference in y coordinates
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 270) % 360;  // calculate the bearing
    circuitFeatures.properties.bearing = bearing;  // add the bearing to the circuit data

    // Add individual circuit source to map
    const circuitId = `circuit-${id}`; // circuit-id
    map.addSource(circuitId, { 
      type: 'geojson',
      data: circuitData,
      lineMetrics: true // needed for styling
    });

    // Add circuit layer to map
    map.addLayer({
      id: circuitId,
      type: 'line',
      source: circuitId,
      layout: { visibility: 'none' },  // hide circuit layer by default
      paint: {
        'line-color': '#FF1E00',
        'line-width': 3,
        'line-opacity': 0.95,  // slightly transparent
        'line-dasharray': [1, 0.5],  // dash pattern
        'line-gradient': [  // gradient of colors based on line progress (start to finish of circuit)
          "interpolate",
          ["linear"], 
          ["line-progress"],
          0, "#FF1E00",  // red at start
          0.3, "#FF4D4D",
          0.6, "#FF8080",
          0.8, "#FFB3B3",
          1, "#FFFFFF"  // white at end
        ]
      }
    });

    // Add directional arrows layer to map
    map.addLayer({
      id: `${circuitId}-arrows`,  // {circuit-id}-arrows
      type: 'symbol',  // symbol layer
      source: circuitId,  // use the circuit source
      layout: {
        visibility: 'none',  // hide by default
        'symbol-placement': 'point',  // place as a point (not along the line)
        'icon-image': 'arrow-right',  // use the arrow image we added to the map
        'icon-rotate': ['get', 'bearing'],  // rotate the arrow based on the bearing we calculated
        'icon-size': [  // size of the arrow based on zoom level
          'interpolate',
          ['linear'],
          ['zoom'],  
          8.5, 0.1,  // size 0.1 at zoom 8.5
          10, 0.15, 
          12, 0.2,
          14, 0.25,
          16, 0.375, 
          18, 0.5  // size 0.5 at zoom 18 
        ]
      }
    });
  } catch (error) {
    console.debug(`Circuit ${id} not found or error loading:`, error);
  }
}

// Main function to load all data and add to map
async function loadMapData() {
  try {
    // Fetch point data and decode it as json
    const response = await fetch('data/championships/f1-locations-2025.json');
    const data = await response.json();
    
    // Add json data to a dictionary where item's location is the key and the value is the item (all the other data+location)
    trackLocations = data.reduce((dict, item) => {
      // dict is trackLocations, item is the current item in the data array
      dict[item.location] = item;
      return dict; // return the updated dictionary
    }, {});  // initialize the dictionary with an empty object
    console.debug("Track Locations loaded:", trackLocations);

    // Create markers and load circuits
    for (const country in trackLocations) {
      // Get the data for the current country
      const lon = trackLocations[country].lon;
      const lat = trackLocations[country].lat;
      const name = trackLocations[country].name;
      const id = trackLocations[country].id;

      // Load circuits, add to map and circuits array
      circuits.push(loadCircuit(id));

      // Create marker + popup and add to map and markers array
      createPOI(country, name, lon, lat);
    }

    // Wait for all circuits to load before continuing 
    await Promise.all(circuits);
  } catch (error) {
    console.error('Error loading track locations:', error);
  }
}

// [Map controls]
// Navigation control
map.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

// Reset zoom control
function updateResetZoomVisibility() {
  // toggle visibility of reset zoom button when zoom is/isnt default
  const currentZoom = map.getZoom();
  resetZoom.classList.toggle('visible', currentZoom !== defaultZoom);
}

// click handler for reset zoom button
resetZoom.addEventListener('click', () => {
  map.easeTo({ // ease to default zoom, pitch, and bearing
    zoom: defaultZoom,
    pitch: defaultPitch,
    bearing: defaultBearing,
    duration: 1000 // 1 second animation
  });
  resetZoom.blur(); // remove focus from button so spacebar can function correctly
});

// Update spin control visibility based on zoom level
function updateSpinControlVisibility() { 
  const zoom = map.getZoom();
  if (zoom >= maxSpinZoom) {  // if zoom is greater than maxSpinZoom, hide spin control
    spinControl.classList.add('hidden');
    spinControl.classList.remove('disabled');
  } else {  // if zoom is less than maxSpinZoom, show spin control
    spinControl.classList.remove('hidden');
  }
}

// Update spin control
function updateSpinControl() {
  // if spin enabled and user not interacting and no open popups and zoom is less than maxSpinZoom,
  const isActuallySpinning = spinEnabled && !userInteracting && !isAnyPopupOpen() && map.getZoom() < maxSpinZoom;
  if (isActuallySpinning) {  // then show stop rotation
    spinControl.innerHTML = '<i class="bi bi-pause-fill"></i> Stop Rotation';
  } else {  // else show resume rotation
    spinControl.innerHTML = '<i class="bi bi-play-fill"></i> Resume Rotation';
  }
}

// Spin control click handler
spinControl.addEventListener('click', () => {
  spinEnabled = !spinEnabled;  // toggle spin enabled
  updateSpinControl();  // update spin control
  if (spinEnabled) spinGlobe();  // if spin enabled, spin globe
  else map.stop();  // else stop spinning
  spinControl.blur();  // remove focus so spacebar can function correctly
});

// keyboard down handler for spin control
document.addEventListener('keydown', function(event) {
  if (event.code === 'Space' && map.getZoom() < maxSpinZoom) {  // if spacebar is pressed down and zoom is less than maxSpinZoom
    spinEnabled = !spinEnabled;  // toggle spin enabled
    updateSpinControl();  // update spin control
    if (spinEnabled) spinGlobe();  // if spin enabled, spin globe
    else map.stop();  // else stop spinning
    spinControl.classList.add('active');  // add active class to spin control
  }
});
document.addEventListener('keyup', function(event) {  // spacebar is let go
  if (event.code === 'Space') {
    spinControl.classList.remove('active');  // remove active class from spin control
  }
});

// [Event Handlers]
// User interaction handling
['mousedown', 'dragstart', 'zoomstart'].forEach(event => {  // when user starts interacting with map
  map.on(event, () => {
    userInteracting = true;  // set user interacting to true
    updateSpinControl();  // update spin control
    spinControl.classList.add('disabled');  // turn off spin control interaction
  });
});

['scrollZoom', 'wheel'].forEach(event => {  // when user scrolls or zooms
  map.on(event, () => {
    userInteracting = true;  // set user interacting to true
    updateSpinControl();  // update spin control
    // Check if we're at minimum zoom and reset interaction flag and spin globe (if enabled)
    if (map.getZoom() <= map.getMinZoom()) {
      userInteracting = false;
      if (spinEnabled) spinGlobe();
    }
  });
});

['mouseup', 'dragend', 'zoomend'].forEach(event => {  // when user stops interacting with map
  map.on(event, () => {
    if (!isAnyPopupOpen()) {  // if no popups are open
      userInteracting = false;  // set user interacting to false
      if (spinEnabled) spinGlobe();  // if spin enabled, spin globe
      updateSpinControl();  // update spin control
      spinControl.classList.remove('disabled');  // remove disabled class from spin control (can be pressed)
    }
  });
});

// map events
map.on('moveend', () => {  // when user stops moving the map
  if (!userInteracting && !isAnyPopupOpen() && spinEnabled) spinGlobe();  // if user not interacting and no popups are open and spin enabled, spin globe
  updateSpinControl();  // update spin control
});

map.on('zoom', () => {  // whenever user zooms, check if we need to update visibility of page elements
  updateDetailedView();  // update detailed view
  updateResetZoomVisibility();  // update reset zoom visibility
  updateSpinControlVisibility();  // update spin control visibility
  updateSpinControl();  // update spin control
})
