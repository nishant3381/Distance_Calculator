// Cache to store coordinates of pincodes so we don't fetch the same pincode twice
const coordCache = {};

// Sleep function to respect OpenStreetMap's usage policy (approx 400ms delay)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches coordinates for a given Indian pincode.
 * Uses OpenStreetMap first, and falls back to a district-level lookup if the exact pincode is missing.
 */
async function getCoordinates(pincode) {
    const cleanPincode = pincode.trim();
    if (!cleanPincode) return null;

    if (coordCache[cleanPincode]) {
        return coordCache[cleanPincode];
    }

    try {
        // 1. Try querying OpenStreetMap directly for the exact pincode
        let response = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleanPincode}&countrycodes=IN&format=json`);
        let data = await response.json();

        if (data && data.length > 0) {
            const result = {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
            coordCache[cleanPincode] = result;
            return result;
        } 
        
        // 2. FALLBACK: If OpenStreetMap doesn't have the pincode (like 249411), query the Postal Directory
        else {
            let fallbackResponse = await fetch(`https://api.postalpincode.in/pincode/${cleanPincode}`);
            let fallbackData = await fallbackResponse.json();
            
            if (fallbackData && fallbackData[0].Status === "Success") {
                // Get the regional District and State for this pincode
                let district = fallbackData[0].PostOffice[0].District;
                let state = fallbackData[0].PostOffice[0].State;
                
                // Geocode the District center instead so the calculation doesn't fail
                let geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${district},${state},India&format=json`);
                let geoData = await geoResponse.json();
                
                if (geoData && geoData.length > 0) {
                    const result = {
                        lat: parseFloat(geoData[0].lat),
                        lon: parseFloat(geoData[0].lon)
                    };
                    coordCache[cleanPincode] = result;
                    return result;
                }
            }
        }
    } catch (error) {
        console.error(`Error fetching coordinates for ${cleanPincode}:`, error);
    }
    return null;
}

/**
 * Haversine formula to calculate straight-line distance between two coordinates
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2); // Returns distance in KM rounded to 2 decimal places
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Core function to handle bulk processing from the textareas
 */
async function processCalculations() {
    const calculateBtn = document.getElementById('calculateBtn');
    const resultsBody = document.getElementById('resultsBody');
    
    // Splits the text by new lines (breaks) instead of commas to easily accept Excel columns
    const sources = document.getElementById('sourcePincodes').value.split(/[\r\n]+/).map(p => p.trim()).filter(Boolean);
    const destinations = document.getElementById('destPincodes').value.split(/[\r\n]+/).map(p => p.trim()).filter(Boolean);

    if (sources.length === 0 || destinations.length === 0) {
        alert('Please enter at least one source and one destination pincode.');
        return;
    }

    // UI State Updating
    calculateBtn.disabled = true;
    calculateBtn.innerText = "Calculating... Please wait...";
    resultsBody.innerHTML = ''; 

    const iterations = Math.max(sources.length, destinations.length);

    for (let i = 0; i < iterations; i++) {
        // Fallback to the last item if columns have mismatched lengths
        const source = sources[i] || sources[sources.length - 1];
        const dest = destinations[i] || destinations[destinations.length - 1];

        // Add a temporary loading row to the table
        const row = document.createElement('tr');
        row.innerHTML = `<td>${source}</td><td>${dest}</td><td colspan="2" style="color: #6b7280;">Processing location...</td>`;
        resultsBody.appendChild(row);

        // Fetch source coordinates
        const sourceCoords = await getCoordinates(source);
        await sleep(400); 
        
        // Fetch destination coordinates
        const destCoords = await getCoordinates(dest);

        // Calculate and display results if both lookups succeeded
        if (sourceCoords && destCoords) {
            const distance = calculateHaversineDistance(sourceCoords.lat, sourceCoords.lon, destCoords.lat, destCoords.lon);
            row.innerHTML = `<td>${source}</td><td>${dest}</td><td><strong>${distance} KM</strong></td><td style="color: green; font-weight: 600;">Success</td>`;
        } else {
            row.innerHTML = `<td>${source}</td><td>${dest}</td><td>--</td><td style="color: #dc2626;">Pincode Not Found</td>`;
        }
        await sleep(400); // Small pause to prevent hitting API limits
    }

    // Reset UI button state
    calculateBtn.disabled = false;
    calculateBtn.innerText = "Calculate Distances";
}