"use strict";

const pointFromLatLon = `ST_SetSRID(ST_MakePoint($2::DOUBLE PRECISION, $1::DOUBLE PRECISION), 4326)::geography`;

function pointExpression(latPlaceholder, lonPlaceholder) {
  return `ST_SetSRID(ST_MakePoint(${lonPlaceholder}::DOUBLE PRECISION, ${latPlaceholder}::DOUBLE PRECISION), 4326)::geography`;
}

/**
 * Build a parameterised ST_DWithin expression.
 * Checks whether a geometry column is within `radiusPlaceholder` metres
 * of a passenger coordinate supplied via `latPlaceholder` / `lonPlaceholder`.
 *
 * Example:
 *   dWithinExpression('s.location', '$1', '$2', '$3')
 *   → "ST_DWithin(s.location, ST_SetSRID(ST_MakePoint($2::DOUBLE PRECISION, $1::DOUBLE PRECISION), 4326)::geography, $3)"
 */
function dWithinExpression(
  geomColumn,
  latPlaceholder,
  lonPlaceholder,
  radiusPlaceholder,
) {
  return `ST_DWithin(${geomColumn}, ${pointExpression(latPlaceholder, lonPlaceholder)}, ${radiusPlaceholder})`;
}

/**
 * Build a parameterised ST_Distance expression.
 * Returns distance in metres between a geometry column and a passenger coordinate.
 */
function distanceExpression(geomColumn, latPlaceholder, lonPlaceholder) {
  return `ST_Distance(${geomColumn}, ${pointExpression(latPlaceholder, lonPlaceholder)})`;
}

module.exports = {
  pointFromLatLon,
  pointExpression,
  dWithinExpression,
  distanceExpression,
};
