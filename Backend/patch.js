const fs = require('fs');

const controllerPath = 'c:/Users/patid/OneDrive/Desktop/BusTracking/Backend/controllers/passengerController.js';
let controllerContent = fs.readFileSync(controllerPath, 'utf8');

const quickSearchCode = `// ================================================================
//  PASSENGER: QUICK SEARCH (by route name, bus number, or stop name)
// ================================================================
const quickSearch = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters.',
      });
    }

    const pattern = \`%\${q}%\`;

    const result = await pool.query(
      \`SELECT DISTINCT
              r.id          AS route_id,
              r.route_name,
              r.source,
              r.destination,
              COUNT(DISTINCT s.id)::INTEGER AS total_stops,
              COUNT(DISTINCT b.id)::INTEGER AS active_buses,
              CASE
                WHEN r.route_name ILIKE $1 THEN 'route'
                WHEN EXISTS (SELECT 1 FROM buses bb WHERE bb.route_id = r.id AND bb.bus_number ILIKE $1 AND bb.status = 'ACTIVE') THEN 'bus'
                ELSE 'stop'
              END AS match_type
       FROM   routes r
       LEFT JOIN stops s ON r.id = s.route_id
       LEFT JOIN buses b ON r.id = b.route_id AND b.status = 'ACTIVE'
       WHERE  r.route_name ILIKE $1
          OR  EXISTS (SELECT 1 FROM buses bb WHERE bb.route_id = r.id AND bb.bus_number ILIKE $1 AND bb.status = 'ACTIVE')
          OR  EXISTS (SELECT 1 FROM stops ss WHERE ss.route_id = r.id AND ss.stop_name ILIKE $1)
       GROUP BY r.id
       ORDER BY
         CASE WHEN r.route_name ILIKE $1 THEN 0 ELSE 1 END,
         r.route_name ASC
       LIMIT 20\`,
      [pattern]
    );

    res.status(200).json({
      success: true,
      query: q,
      total: result.rows.length,
      results: result.rows,
    });
  } catch (error) {
    safeErrorResponse(res, error, 'quickSearch');
  }
};

module.exports = {
  quickSearch,`;

controllerContent = controllerContent.replace('module.exports = {', quickSearchCode);
fs.writeFileSync(controllerPath, controllerContent, 'utf8');

const routesPath = 'c:/Users/patid/OneDrive/Desktop/BusTracking/Backend/routes/passengerRoutes.js';
let routesContent = fs.readFileSync(routesPath, 'utf8');

routesContent = routesContent.replace('  getAllRoutes,', '  getAllRoutes,\n  quickSearch,');
routesContent = routesContent.replace('router.get("/routes", getAllRoutes);', 'router.get("/routes", getAllRoutes);\nrouter.get("/quick-search", quickSearch);');

fs.writeFileSync(routesPath, routesContent, 'utf8');
console.log("Done patching.");
