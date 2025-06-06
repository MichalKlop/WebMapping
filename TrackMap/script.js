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

// DOM elements
const resetZoom = document.getElementById('reset-zoom');
const spinControl = document.getElementById('spin-control');
const helpToggle = document.querySelectorAll('.help-toggle');
const helpContent = document.querySelector('.help-content');
const circuitInfo = document.querySelector('.circuit-info');
const flags = document.querySelectorAll('.flag');
const aboutToggle = document.querySelectorAll('.about-toggle');
const aboutContent = document.querySelector('.about-content');


// [Mapbox initialization]
mapboxgl.accessToken = 'pk.eyJ1IjoibWljaGFsLWsiLCJhIjoiY205MGJxNGM5MGUxcDJrcHk1Z3c1OTRuaSJ9.wNhbZOZFlMWox_I3QbxunQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/michal-k/cmazx0h7z009101sw9nxv7re9',
  projection: 'globe',
  zoom: defaultZoom,
  pitch: defaultPitch,
  maxZoom: maxZoom,
  minZoom: defaultZoom,
  center: [30, 15]
});

// [Helper functions]
// Check if any popup is open
function isAnyPopupOpen() {
  return document.querySelector('.mapboxgl-popup') !== null;
}

// Highlight the closest track's flag in flag bar
function updateActiveFlag() {
  // Remove highlight from all flags in flag bar
  document.querySelectorAll('.flag').forEach(flag => {
    flag.classList.remove('active');
  });

  const currentZoom = map.getZoom();  // get current zoom level
  const currentCenter = map.getCenter();  // get current center of map
  
  let closestTrack = null;  // init closest track to null
  let minDistance = Infinity;  // init min distance to infinity

  if (currentZoom < maxMarkerZoom) {  // if zoomed out, don't highlight any flags
    return;
  }
  
  for (const country in trackLocations) {  // for each track,
    const track = trackLocations[country];
    const distance = Math.sqrt(  // calculate distance between track and current center
      Math.pow(currentCenter.lng - track.lon, 2) + 
      Math.pow(currentCenter.lat - track.lat, 2)
    );
    
    if (distance < minDistance) {  // if distance is less than min distance,
      minDistance = distance;  // update min distance
      closestTrack = { country, track };  // update closest track
    }
  }

  // highlight the closest track's flag in flag bar
  const activeFlag = document.querySelector(`.flag[title="${closestTrack.country}"]`);
  activeFlag.classList.add('active');
}

// Show track on map
function showTrack(country) {
  const track = trackLocations[country];
  map.flyTo({ 
    center: [track.lon, track.lat], 
    zoom: track.zoom, 
    pitch: 45 
  });
}

// Update visibility of markers, circuits, and circuit info bar 
function updateDetailedView() {
  const currentZoom = map.getZoom();
  const notHidden = currentZoom >= maxMarkerZoom;
  const currentCenter = map.getCenter();
  
  // Update markers visibility
  markers.forEach(marker => {
    const el = marker.getElement().querySelector('.marker');
    if (notHidden) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });

  // Find the closest circuit to current center
  let closestCircuit = null;  // init closest circuit to null
  let minDistance = Infinity;  // init min distance to infinity
  
  for (const country in trackLocations) {  // for each track,
    const circuit = trackLocations[country];  // get the circuit data
    const layerId = `circuit-${circuit.id}`;  // get the circuit layer id
    const layerIdArrows = layerId + '-arrows';  // get the circuit arrows layer id

    // Update circuit view visibility
    map.setLayoutProperty(
      layerId,  // circuit layer,
      'visibility',  // visibility property
      notHidden ? 'visible' : 'none'  // if notHidden, show the circuit, otherwise hide it
    );
    map.setLayoutProperty(
      layerIdArrows,  // circuit directional arrows layer,
      'visibility',  // visibility property
      notHidden ? 'visible' : 'none'  // if notHidden, show the directional arrows, otherwise hide them
    );

    // If we're zoomed in enough, find the closest circuit
    if (notHidden) {
      const distance = Math.sqrt(  // calculate distance between circuit and current center
        Math.pow(currentCenter.lng - circuit.lon, 2) + 
        Math.pow(currentCenter.lat - circuit.lat, 2)
      );
      
      if (distance < minDistance) {  // if distance is less than min distance,
        minDistance = distance;  // update min distance
        closestCircuit = circuit;  // update closest circuit
      }
    }
  }

  // update circuit info bar if close enough to a circuit. otherwise hide the bar
  if (notHidden) {
    updateCircuitInfo(closestCircuit);
    circuitInfo.classList.add('active');
  } else {
    circuitInfo.classList.remove('active');
  }
}

// Update circuit info bar with circuit data
function updateCircuitInfo(circuit) {
  circuitInfo.querySelector('.circuit-name').textContent = circuit.name;
  circuitInfo.querySelector('.first-gp').textContent = circuit.firstgp;
  circuitInfo.querySelector('.laps').textContent = circuit.laps;
  circuitInfo.querySelector('.length').textContent = `${(circuit.length / 1000).toFixed(3)} km`;  // format length to 3 decimal places
  circuitInfo.querySelector('.altitude').textContent = `${circuit.altitude} m`;
  circuitInfo.querySelector('.lap-record .time').textContent = circuit.lap_record;
  circuitInfo.querySelector('.lap-record .holder').textContent = circuit.record_holder;
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

// Helper function to get country code from country name
function getCountryCode(country) {
  // dictionary where the key is the country name and the value is the country code
  const countryMap = {  
    'Australian': 'au',
    'Chinese': 'cn',
    'Japanese': 'jp',
    'Bahrain': 'bh',
    'Saudi Arabian': 'sa',
    'Miami': 'us',
    'Emilia Romagna': 'it',
    'Monaco': 'mc',
    'Spanish': 'es',
    'Canadian': 'ca',
    'Austrian': 'at',
    'British': 'gb',
    'Belgian': 'be',
    'Hungarian': 'hu',
    'Dutch': 'nl',
    'Italian': 'it',
    'Azerbaijan': 'az',
    'Singapore': 'sg',
    'United States': 'us',
    'Mexico City': 'mx',
    'Sao Paulo': 'br',
    'Las Vegas': 'us',
    'Qatar': 'qa',
    'Abu Dhabi': 'ae'
  };
  const code = countryMap[country] || 'un';  // if country is not found, use united nations as fallback
  if (code === 'un') {
    console.debug(`Using fallback flag for country: ${country}`);
  }
  return code;
}

// [Data loading functions]
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
        'icon-rotation-alignment': 'map',  // align rotation with the map
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
    const response = await fetch('data/championships/f1_2025.json');
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
      const region = trackLocations[country].country;
      const id = trackLocations[country].id;
      const firstgp = trackLocations[country].firstgp;
      const altitude = trackLocations[country].altitude;
      const length = trackLocations[country].length;
      const laps = trackLocations[country].laps;
      const lap_record = trackLocations[country].lap_record;
      const record_holder = trackLocations[country].record_holder;

      // Load circuits, add to map and circuits array
      circuits.push(loadCircuit(id));

      // Create marker + popup and add to map and markers array
      createPOI(country, region, name, lon, lat, firstgp, laps, length, altitude, lap_record, record_holder);
    }

    // Wait for all circuits to load before continuing (load at the same time)
    await Promise.all(circuits);
  } catch (error) {
    console.error('Error loading track locations:', error);
  }
}

// create popup element and add handlers
function createPopup(country, region, name, firstgp, laps, length, altitude, lap_record, record_holder) {
  // Create popup element with offset to point to edge of marker
  const popup = new mapboxgl.Popup(
    { 
      offset: 15,  // offset to point to edge of marker
      maxWidth: '300px'
    }
  ).setHTML(`
    <div class="header">${region} Grand Prix</div>
    <div class="body">
      <div class="circuit-name">${name}</div>
      <div class="circuit-details">
        <div class="detail-item">
          <i class="bi bi-trophy"></i>
          <span class="label">First Grand Prix:</span>
          <span class="value">${firstgp}</span>
        </div>
        <div class="detail-item">
          <i class="fa-solid fa-flag-checkered"></i>
          <span class="label">Laps:</span>
          <span class="value">${laps}</span>
        </div>
        <div class="detail-item">
          <i class="bi bi-rulers"></i>
          <span class="label">Length:</span>
          <span class="value">${(length / 1000).toFixed(3)} km</span>
        </div>
        <div class="detail-item">
          <i class="fa-solid fa-mountain"></i>
          <span class="label">Altitude:</span>
          <span class="value">${altitude} m</span>
        </div>
        <div class="detail-item">
          <i class="bi bi-stopwatch"></i>
          <span class="label">Lap Record:</span>
          <span class="value lap-record">
            <span class="time">${lap_record}</span>
            <span class="holder">${record_holder}</span>
          </span>
        </div>
      </div>
      <button class="zoom-to-track">View Track Layout <i class="bi bi-arrow-right"></i></button>
    </div>
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
function createPOI(country, region, name, lon, lat, firstgp, laps, length, altitude, lap_record, record_holder) {
  // Create wrapper element
  const wrapper = document.createElement('div');
  wrapper.className = 'marker-wrapper';

  // Create marker element
  const mark = document.createElement('div');
  mark.className = 'marker';

  // Set country flag as background
  const countryCode = getCountryCode(region);
  mark.style.backgroundImage = `url('https://flagcdn.com/w80/${countryCode}.png')`;

  // Set flag background position for specific countries (to show the flag in the middle of the marker)
  if (['Melbourne', 'Shanghai', 'Sakhir', 'Miami', 'Austin', 'Las Vegas', 'Lusail', 'Yas Marina'].includes(country)) {
    mark.style.backgroundPosition = '25% center';
  }

  // Add marker to wrapper
  wrapper.appendChild(mark);

  // Create popup element
  const popup = createPopup(country, region, name, firstgp, laps, length, altitude, lap_record, record_holder);

  // Add marker to map
  const marker = new mapboxgl.Marker(wrapper)
    .setLngLat([lon, lat])
    .setPopup(popup)
    .addTo(map);

  markers.push(marker);
}

// [Map controls]
// Navigation control
const navControl = new mapboxgl.NavigationControl({
  visualizePitch: true  // show pitch indicator
});
document.getElementById('nav-control-container').appendChild(navControl.onAdd(map));

// Reset zoom control
function updateResetZoomVisibility() {
  // toggle visibility of reset zoom button when zoom is/isnt default
  const currentZoom = map.getZoom();
  resetZoom.classList.toggle('visible', currentZoom !== defaultZoom);
}

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

// [Event Handlers]
// User interaction handling
['mousedown', 'touchstart', 'dragstart', 'zoomstart'].forEach(event => {  // when user starts interacting with map
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

['mouseup', 'touchend', 'dragend', 'zoomend'].forEach(event => {  // when user stops interacting with map
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
  updateActiveFlag(); // Update active flag based on current view
});

map.on('zoom', () => {  // whenever user zooms, check if we need to update visibility of page elements
  updateDetailedView();  // update detailed view
  updateResetZoomVisibility();  // update reset zoom visibility
  updateSpinControlVisibility();  // update spin control visibility
  updateSpinControl();  // update spin control
  updateActiveFlag(); // Update active flag state
})

// Help section toggle
helpToggle.forEach(toggle => {
  toggle.addEventListener('click', () => {
    helpContent.classList.toggle('active');
    toggle.blur(); // Remove focus so spacebar can function correctly
  });
});

// Close help when clicking outside
document.addEventListener('click', (event) => {
  if (!event.target.closest('.help-box') && helpContent.classList.contains('active')) {
    helpContent.classList.remove('active');
  }
});

// About section toggle
aboutToggle.forEach(toggle => {
  toggle.addEventListener('click', () => {
    aboutContent.classList.toggle('active');
    toggle.blur(); // Remove focus so spacebar can function correctly
  });
});

// Close about when clicking outside
document.addEventListener('click', (event) => {
  if (!event.target.closest('.about-box') && aboutContent.classList.contains('active')) {
    aboutContent.classList.remove('active');
  }
});

// Add hover event listeners to flags
flags.forEach(flag => {
  flag.addEventListener('mouseenter', () => {  // on hover,
    const country = flag.getAttribute('title');  // get the country name
    const circuit = trackLocations[country];  
    updateCircuitInfo(circuit);  // update the circuit info bar
    circuitInfo.classList.add('active');  
  });

  flag.addEventListener('mouseleave', () => {  // on exit hover,
    const notHidden = map.getZoom() >= maxMarkerZoom;
    // If we're zoomed in close to a circuit, find and show that circuit's info
    if (notHidden) {
      const currentCenter = map.getCenter();  // get the current center of the map
      let closestCircuit = null;  // init closest circuit to null
      let minDistance = Infinity;  // init min distance to infinity
      
      for (const country in trackLocations) {  // for each track,
        const circuit = trackLocations[country];
        const distance = Math.sqrt(  // calculate distance between circuit and current center
          Math.pow(currentCenter.lng - circuit.lon, 2) + 
          Math.pow(currentCenter.lat - circuit.lat, 2)
        );
        
        if (distance < minDistance) {  // if distance is less than min distance,
          minDistance = distance;  // update min distance
          closestCircuit = circuit;  // update closest circuit
        }
      }
      
      updateCircuitInfo(closestCircuit);  // update the circuit info bar
      circuitInfo.classList.add('active');  // show the circuit info bar
    } else {  // if not zoomed in close enough to a circuit, hide the circuit info bar
      circuitInfo.classList.remove('active');
    }
  });
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

// [Main initialization]
map.on('load', () => {
  loadMapData();
  spinGlobe();
  updateResetZoomVisibility();
  updateSpinControlVisibility();
});

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
