const fs = require('fs');

const data = JSON.parse(fs.readFileSync('schedules.json', 'utf8'));

// 1. Add route[] to all trains
const lineRoutes = {};
for (const line in data.stations) {
    lineRoutes[line] = data.stations[line].map(s => s.code);
}

for (const line in data.trains) {
    data.trains[line].forEach(t => {
        // Keep halts as stops 
        if(!t.halts) t.halts = [...t.stops];
        
        let fullLine = lineRoutes[t.line || line];
        if (fullLine && t.stops && t.stops.length >= 2) {
            const stat1 = fullLine.indexOf(t.stops[0]);
            const stat2 = fullLine.indexOf(t.stops[t.stops.length - 1]);
            if (stat1 !== -1 && stat2 !== -1) {
                const min = Math.min(stat1, stat2);
                const max = Math.max(stat1, stat2);
                let route = fullLine.slice(min, max + 1);
                if (stat1 > stat2) {
                    route = route.reverse();
                }
                t.route = route;
            } else {
                t.route = [...t.stops];
            }
        } else {
            t.route = t.stops ? [...t.stops] : [];
        }
    });
}

// 2. Add Western Line Extension to western stations
const westernExt = [
{ "code": "VTN", "name": "Vaitarna", "zone": 5 },
{ "code": "SAP", "name": "Saphale", "zone": 5 },
{ "code": "KLV", "name": "Kelve Road", "zone": 5 },
{ "code": "PLG", "name": "Palghar", "zone": 5 },
{ "code": "UMR", "name": "Umroli", "zone": 6 },
{ "code": "BSR", "name": "Boisar", "zone": 6 },
{ "code": "VGN", "name": "Vangaon", "zone": 6 },
{ "code": "DHR", "name": "Dahanu Road", "zone": 6 }
];
// Append if not there
westernExt.forEach(st => {
    if (!data.stations.western.find(x => x.code === st.code)) {
        data.stations.western.push(st);
    }
});

// Refresh line routes because we added stations
lineRoutes['western'] = data.stations['western'].map(s => s.code);

// Add 3 Western Line Trains
const westernTrains = [
{ "number": "90101", "name": "Virar - Dahanu Local", "type": "Local", "line": "western", "route": ["VR", "VTN", "SAP", "KLV", "PLG", "UMR", "BSR", "VGN", "DHR"], "halts": ["VR", "VTN", "SAP", "KLV", "PLG", "UMR", "BSR", "VGN", "DHR"], "stops": ["VR", "VTN", "SAP", "KLV", "PLG", "UMR", "BSR", "VGN", "DHR"], "departure": { "time": "06:15", "platform": 2 }, "to": "DHR" },
{ "number": "90102", "name": "Virar - Palghar Local", "type": "Local", "line": "western", "route": ["VR", "VTN", "SAP", "KLV", "PLG"], "halts": ["VR", "VTN", "SAP", "KLV", "PLG"], "stops": ["VR", "VTN", "SAP", "KLV", "PLG"], "departure": { "time": "07:30", "platform": 1 }, "to": "PLG" },
{ "number": "90103", "name": "Dahanu - Virar Local", "type": "Local", "line": "western", "route": ["DHR", "VGN", "BSR", "UMR", "PLG", "KLV", "SAP", "VTN", "VR"], "halts": ["DHR", "VGN", "BSR", "UMR", "PLG", "KLV", "SAP", "VTN", "VR"], "stops": ["DHR", "VGN", "BSR", "UMR", "PLG", "KLV", "SAP", "VTN", "VR"], "departure": { "time": "08:00", "platform": 1 }, "to": "VR" }
];
data.trains.western.push(...westernTrains);

// 3. Complete Harbour Line Goregaon Route
const harbourExt = [
{ "code": "GRD", "name": "Goregaon", "zone": 3 },
{ "code": "RAM", "name": "Ram Mandir", "zone": 3 },
{ "code": "JOG", "name": "Jogeshwari", "zone": 3 },
{ "code": "AVRD", "name": "Andheri (Harbour)", "zone": 2 },
{ "code": "VLPR", "name": "Vile Parle (Harbour)", "zone": 2 }
];
if(!data.stations.harbour) data.stations.harbour = [];
harbourExt.forEach(st => {
    if (!data.stations.harbour.find(x => x.code === st.code)) {
        data.stations.harbour.push(st);
    }
});

const harbourTrains = [
{ "number": "96001", "name": "Panvel - Goregaon Local", "type": "Local", "line": "harbour", "route": ["PNVL", "KLW", "SION", "KLA", "VVH", "MAH", "BNDN", "VLPR", "AVRD", "JOG", "RAM", "GRD"], "halts": ["PNVL", "KLW", "SION", "KLA", "VVH", "MAH", "BNDN", "VLPR", "AVRD", "JOG", "RAM", "GRD"], "stops": ["PNVL", "KLW", "SION", "KLA", "VVH", "MAH", "BNDN", "VLPR", "AVRD", "JOG", "RAM", "GRD"], "departure": { "time": "07:30", "platform": 1 }, "to": "GRD" }
];
data.trains.harbour.push(...harbourTrains);

fs.writeFileSync('schedules.json', JSON.stringify(data, null, 2));
console.log('JSON Updates complete.');
