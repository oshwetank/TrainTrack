const fs = require('fs');

const data = JSON.parse(fs.readFileSync('schedules.json', 'utf8'));

// We wipe trains and build anew.
data.trains = { western: [], central: [], harbour: [], trans_harbour: [] };

function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTimeStr(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Generate Western line trains
const wStopsFast = ["CCG", "BCL", "DDR", "BA", "ADH", "BVI", "VR", "DRD"];
const wStopsSlow = data.stations.western.map(s => s.code);
let trainCounter = 90000;

function createTrain(line, name, type, direction, stopsArr, startTimeStr, travelTimePerStop = 3) {
  trainCounter++;
  const t = {
    trainNo: String(trainCounter),
    name: name,
    type: type,
    line: line,
    direction: direction,
    from: stopsArr[0],
    to: stopsArr[stopsArr.length - 1],
    departures: [],
    stops: stopsArr
  };
  
  let currentMins = parseTime(startTimeStr);
  
  // platforms for major stations
  const platforms = {
    "CCG": Math.floor(Math.random()*4)+1,
    "BCL": Math.floor(Math.random()*7)+1,
    "DDR": Math.floor(Math.random()*8)+1,
    "BA": Math.floor(Math.random()*6)+1,
    "ADH": Math.floor(Math.random()*4)+1,
    "BVI": Math.floor(Math.random()*4)+1,
    "VR": Math.floor(Math.random()*4)+1,
    "CSMT": Math.floor(Math.random()*18)+1,
    "DR": Math.floor(Math.random()*7)+1,
    "TNA": Math.floor(Math.random()*7)+1,
    "KYN": Math.floor(Math.random()*7)+1
  };
  
  stopsArr.forEach(st => {
    const dep = { station: st, time: formatTimeStr(currentMins) };
    if (platforms[st]) dep.platform = platforms[st];
    t.departures.push(dep);
    currentMins += travelTimePerStop;
  });
  
  data.trains[line].push(t);
}

// 1. Western (50 trains)
// 15 Fast Trains
const wFastTimes = ["06:05", "06:35", "07:10", "07:45", "08:15", "09:00", "17:30", "18:05", "19:15", "20:30", "21:45", "23:00", "00:15", "10:00", "11:00"];
wFastTimes.forEach(time => createTrain("western", "Virar Fast", "Fast", "Down", wStopsFast.slice(0, 7), time, 5));

// 20 Slow Trains
const wSlowTimes = [];
for (let i = 0; i < 20; i++) {
  wSlowTimes.push(formatTimeStr(parseTime("07:00") + i * 10));
}
wSlowTimes.forEach(time => createTrain("western", "Borivali Slow", "Slow", "Down", wStopsSlow.slice(0, wStopsSlow.indexOf("BVI")+1), time, 3));

// 5 AC Trains
for (let i = 0; i < 5; i++) {
  createTrain("western", "Virar AC", "AC", "Down", wStopsFast.slice(0, 7), formatTimeStr(parseTime("08:30") + i * 60), 5);
}

// 10 Ladies Special
for (let i = 0; i < 10; i++) {
  createTrain("western", "Churchgate Ladies", "Ladies", "Up", wStopsSlow.slice(0, wStopsSlow.indexOf("BVI")+1).reverse(), formatTimeStr(parseTime("08:00") + i * 15), 3);
}

// 2. Central (50 trains)
const cStopsSlow = data.stations.central.map(s => s.code);
const cStopsFast = cStopsSlow.filter(s => !["MSD", "SNRD", "CHG", "CRY", "PR"].includes(s));

const cFastTimes = ["06:10", "06:40", "07:15", "07:50", "08:20", "09:10", "17:35", "18:10", "19:20", "20:35", "21:50", "23:05", "00:20", "10:10", "11:10"];
cFastTimes.forEach(time => createTrain("central", "Kalyan Fast", "Fast", "Down", cStopsFast.filter(s=>cStopsFast.indexOf(s) <= cStopsFast.indexOf("KYN")), time, 4));

const cSlowTimes = [];
for (let i = 0; i < 20; i++) {
  cSlowTimes.push(formatTimeStr(parseTime("07:05") + i * 10));
}
cSlowTimes.forEach(time => createTrain("central", "Kasara Slow", "Slow", "Down", cStopsSlow.filter(s=>cStopsSlow.indexOf(s) <= cStopsSlow.indexOf("KSRA")), time, 3));

// 5 AC
for (let i = 0; i < 5; i++) {
  createTrain("central", "Kalyan AC", "AC", "Down", cStopsFast.filter(s=>cStopsFast.indexOf(s) <= cStopsFast.indexOf("KYN")), formatTimeStr(parseTime("08:40") + i * 60), 4);
}

// 10 Ladies
for (let i = 0; i < 10; i++) {
  createTrain("central", "CSMT Ladies", "Ladies", "Up", cStopsSlow.slice(0, cStopsSlow.indexOf("KYN")+1).reverse(), formatTimeStr(parseTime("08:05") + i * 15), 3);
}

// 3. Harbour (30 trains)
const hStopsSlow = data.stations.harbour.map(s => s.code);
// CSMT -> Panvel
for (let i = 0; i < 15; i++) {
  createTrain("harbour", "Panvel Slow", "Slow", "Down", hStopsSlow.filter(s=>hStopsSlow.indexOf(s) <= hStopsSlow.indexOf("PNVL") && s.indexOf("_H") === -1 && !["KHAP", "MNSV", "TRGR", "GVHN"].includes(s)), formatTimeStr(parseTime("06:00") + i * 30), 4);
}
// CSMT -> Vashi
for (let i = 0; i < 15; i++) {
  createTrain("harbour", "Vashi Slow", "Slow", "Down", hStopsSlow.filter(s=>hStopsSlow.indexOf(s) <= hStopsSlow.indexOf("VSH") && s.indexOf("_H") === -1), formatTimeStr(parseTime("06:15") + i * 30), 4);
}

// 4. Trans-Harbour (20 trains)
const thStopsSlow = data.stations.trans_harbour.map(s => s.code);
for (let i = 0; i < 20; i++) {
  createTrain("trans_harbour", "Panvel Slow", "Slow", "Down", thStopsSlow, formatTimeStr(parseTime("06:00") + i * 20), 4);
}

fs.writeFileSync('schedules.json', JSON.stringify(data, null, 2));
console.log("Generated schedules.json with ", Object.values(data.trains).flat().length, " trains.");
