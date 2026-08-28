'use strict';

const BUS_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED',
});

const BUS_STATUS_VALUES = Object.freeze(Object.values(BUS_STATUSES));

function normalizeBusStatus(status) {
  return typeof status === 'string' ? status.trim().toUpperCase() : '';
}

function validateBusStatus(status) {
  const normalized = normalizeBusStatus(status);
  if (!normalized) return 'status is required';
  if (!BUS_STATUS_VALUES.includes(normalized)) {
    return `status must be one of: ${BUS_STATUS_VALUES.join(', ')}`;
  }
  return null;
}

function busNotActiveResponse(res, bus) {
  return res.status(403).json({
    success: false,
    message: `Bus ${bus.bus_number || bus.bus_id || ''} is ${bus.status}. Only ACTIVE buses can operate.`,
    bus_status: bus.status,
  });
}

module.exports = {
  BUS_STATUSES,
  BUS_STATUS_VALUES,
  normalizeBusStatus,
  validateBusStatus,
  busNotActiveResponse,
};
