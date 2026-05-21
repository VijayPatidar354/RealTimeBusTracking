// ================================================================
//  HAVERSINE DISTANCE — Shared Utility
//  utils/haversine.js
//
//  Returns the great-circle distance in METRES between two
//  WGS-84 coordinate pairs using the Haversine formula.
//
//  Centralised here so every module imports from one place
//  instead of maintaining duplicate copies.
//
//  Usage:
//    const { haversineDistance } = require('../utils/haversine');
//    const metres = haversineDistance(lat1, lon1, lat2, lon2);
// ================================================================

'use strict';

/**
 * @param {number} lat1  Latitude of point A  (decimal degrees)
 * @param {number} lon1  Longitude of point A (decimal degrees)
 * @param {number} lat2  Latitude of point B  (decimal degrees)
 * @param {number} lon2  Longitude of point B (decimal degrees)
 * @returns {number}     Distance in metres
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R  = 6371000; // Earth radius in metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
               Math.cos(φ1)   * Math.cos(φ2) *
               Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { haversineDistance };
