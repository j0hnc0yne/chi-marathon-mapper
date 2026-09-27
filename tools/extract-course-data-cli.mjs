#!/usr/bin/env node
// Regenerates public/data/course-data.json from the official course map PDF.
//
//   node tools/extract-course-data-cli.mjs            # write the data file
//   node tools/extract-course-data-cli.mjs --check    # fail if it would change
//
// The --check mode is what CI runs: it re-derives the data and compares, so a
// hand-edit to the generated file cannot survive review (COURSE-030).
import { readFileSync, writeFileSync } from "node:fs";
import { extractCourseData, findCoursePath, parseContentStream, parseTextLabels, readPageContent } from "./extract-course-data.mjs";

const SOURCE_PDF = "26-BACM-COURSE-MAP-PRINT.pdf";
const DATA_FILE = "public/data/course-data.json";

// Streets whose real-world coordinate is known, used to place the map. The page
// position of each comes from the map's own printed labels, so this table holds
// only the street's name and the coordinate it is known to sit at. Residuals are
// gated at 1,000 ft (COURSE-023), which catches a mis-paired street.
const EAST_WEST_STREETS = [
  ["35th St.", 41.8312],
  ["33rd  St.", 41.8341],
  ["26th St.", 41.8452],
  ["Cermak Rd.", 41.8527],
  ["18th  St.", 41.8582],
  ["Roosevelt Rd.", 41.8674],
  ["Taylor St.", 41.8693],
  ["Jackson Blvd.", 41.8781],
  ["Adams St.", 41.8796],
  ["Randolph St.", 41.8847],
  ["Grand Ave.", 41.8915],
  ["Division St.", 41.9033],
  ["North Ave.", 41.9106],
  ["Webster Ave.", 41.9215],
  ["Fullerton Dr.", 41.9254],
  ["Diversey Ave.", 41.9327],
];
const NORTH_SOUTH_STREETS = [
  ["Damen Ave.", -87.6773],
  ["Ashland Ave.", -87.6668],
  ["Loomis  St.", -87.6617],
  ["Halsted  St.", -87.6470],
  ["LaSalle St.", -87.6325],
  ["Wentworth Ave.", -87.6320],
  ["Dearborn St.", -87.6296],
  ["State St.", -87.6278],
  ["Michigan Ave.", -87.6244],
  ["Indiana Ave.", -87.6220],
];

// Start and finish on Columbus Drive, at Monroe and at Balbo.
const KNOWN_ENDPOINTS = {
  start: { lat: 41.881, lng: -87.6219 },
  finish: { lat: 41.8709, lng: -87.6215 },
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function findLabel(labels, text, axis) {
  const matches = labels.filter((l) => l.text === text);
  if (matches.length === 0) return null;
  // A street can be labelled several times along its length; the median of
  // those placements is steadier than any single one.
  return median(matches.map((l) => (axis === "eastWest" ? l.y : l.x)));
}

function collectControlPoints(labels) {
  const eastWest = [];
  const northSouth = [];
  for (const [label, lat] of EAST_WEST_STREETS) {
    const pageY = findLabel(labels, label, "eastWest");
    if (pageY !== null) eastWest.push({ label, pageY, lat });
  }
  for (const [label, lng] of NORTH_SOUTH_STREETS) {
    const pageX = findLabel(labels, label, "northSouth");
    if (pageX !== null) northSouth.push({ label, pageX, lng });
  }
  return { eastWest, northSouth };
}

// Every number printed on the map, with where it sits on the page. Which of
// them label miles is decided by the module, against the route it derives.
function collectNumericLabels(labels) {
  return labels
    .filter((label) => /^\d{1,2}$/.test(label.text))
    .map((label) => ({ value: Number(label.text), x: label.x, y: label.y }));
}

const content = readPageContent(readFileSync(SOURCE_PDF));
const pagePath = findCoursePath(parseContentStream(content));
const labels = parseTextLabels(content);
const controlPoints = collectControlPoints(labels);

const existing = JSON.parse(readFileSync(DATA_FILE, "utf8"));
const curated = { viewingSpots: existing.viewingSpots, travelTimeMatrix: existing.travelTimeMatrix };

let written = null;
extractCourseData({
  pagePath,
  curated,
  sourcePdf: SOURCE_PDF,
  controlPoints,
  knownEndpoints: KNOWN_ENDPOINTS,
  printedMileLabels: collectNumericLabels(labels),
  write: (contents) => {
    written = contents;
  },
});

// @spec COURSE-030
if (process.argv.includes("--check")) {
  const current = readFileSync(DATA_FILE, "utf8");
  if (current !== written) {
    console.error(
      `${DATA_FILE} does not match a fresh extraction from ${SOURCE_PDF}.\n` +
        "Re-run: node tools/extract-course-data-cli.mjs",
    );
    process.exit(1);
  }
  console.log(`${DATA_FILE} matches a fresh extraction from ${SOURCE_PDF}.`);
} else {
  writeFileSync(DATA_FILE, written);
  const data = JSON.parse(written);
  console.log(
    `Wrote ${DATA_FILE}: ${data.routeGeometry.length} route points, ` +
      `${data.mileMarkers.length} mile markers, ${data.viewingSpots.length} viewing spots.`,
  );
}
