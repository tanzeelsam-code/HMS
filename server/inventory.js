// Shared room-type inventory accounting for transient reservations and
// unassigned group room blocks. A group block consumes the same room-type
// quantity on every night in its [arrival, departure) interval.
import { db, tx } from './db.js';

export const ACTIVE_GROUP_STATUSES = Object.freeze(['Tentative Hold', 'Definite Block']);
const ACTIVE_RESERVATION_STATUSES = Object.freeze(['Confirmed', 'Checked-In']);

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

function mainPropertyRoomTypes(propertyId) {
  if (propertyId !== 'prop-main') return [];
  return db.prepare(`
    SELECT type AS room_type, COUNT(*) AS capacity, MIN(currentPrice) AS minimum_rate
    FROM rooms
    WHERE status != 'Out of Service'
    GROUP BY type
    ORDER BY minimum_rate, room_type
  `).all().map((row) => ({
    roomType: row.room_type,
    capacity: Number(row.capacity),
    minimumRate: Number.isFinite(row.minimum_rate) ? row.minimum_rate : Number.POSITIVE_INFINITY,
  }));
}

function overlappingReservations(checkIn, checkOut) {
  return db.prepare(`
    SELECT COALESCE(rm.type, rez.roomType) AS room_type,
      rez.checkIn AS start_date, rez.checkOut AS end_date
    FROM reservations rez
    LEFT JOIN rooms rm ON rm.number = rez.roomNumber
    WHERE rez.status IN (?, ?)
      AND rez.checkIn < ? AND rez.checkOut > ?
  `).all(...ACTIVE_RESERVATION_STATUSES, checkOut, checkIn)
    .filter((row) => row.room_type && row.start_date && row.end_date);
}

function overlappingGroupAllocations(propertyId, checkIn, checkOut, excludeGroupId) {
  return db.prepare(`
    SELECT block.room_type, block.rooms_allocated,
      group_record.start_date, group_record.end_date
    FROM group_room_blocks block
    JOIN group_bookings group_record ON group_record.id = block.group_booking_id
    WHERE group_record.property_id = ?
      AND group_record.status IN (?, ?)
      AND group_record.start_date < ? AND group_record.end_date > ?
      AND (? IS NULL OR group_record.id != ?)
  `).all(
    propertyId,
    ...ACTIVE_GROUP_STATUSES,
    checkOut,
    checkIn,
    excludeGroupId,
    excludeGroupId,
  );
}

/**
 * Return the lowest room-type inventory remaining on any night of a stay.
 * Boundaries where a reservation/block begins are sufficient because usage
 * can only rise at those points; departures release inventory.
 */
export function getRoomTypeAvailability({
  propertyId = 'prop-main', checkIn, checkOut, excludeGroupId = null,
}) {
  const roomTypes = mainPropertyRoomTypes(propertyId);
  if (roomTypes.length === 0) return [];

  const reservations = overlappingReservations(checkIn, checkOut);
  const groupBlocks = overlappingGroupAllocations(
    propertyId,
    checkIn,
    checkOut,
    excludeGroupId,
  );
  const boundaries = new Set([checkIn]);
  for (const interval of [...reservations, ...groupBlocks]) {
    if (interval.start_date > checkIn && interval.start_date < checkOut) {
      boundaries.add(interval.start_date);
    }
  }

  return roomTypes.map((roomType) => {
    let minimumAvailable = roomType.capacity;
    for (const date of boundaries) {
      const reserved = reservations.reduce((count, reservation) => (
        reservation.room_type === roomType.roomType
          && overlaps(reservation.start_date, reservation.end_date, date, checkOut)
          && reservation.start_date <= date
          ? count + 1
          : count
      ), 0);
      const blocked = groupBlocks.reduce((count, block) => (
        block.room_type === roomType.roomType
          && overlaps(block.start_date, block.end_date, date, checkOut)
          && block.start_date <= date
          ? count + Number(block.rooms_allocated)
          : count
      ), 0);
      minimumAvailable = Math.min(minimumAvailable, roomType.capacity - reserved - blocked);
    }
    return {
      ...roomType,
      available: Math.max(0, minimumAvailable),
      oversoldBy: Math.max(0, -minimumAvailable),
    };
  });
}

export function planGroupRoomTypeAllocation({
  propertyId, startDate, endDate, roomsAllocated, excludeGroupId = null,
}) {
  const inventory = getRoomTypeAvailability({
    propertyId,
    checkIn: startDate,
    checkOut: endDate,
    excludeGroupId,
  });
  let remaining = roomsAllocated;
  const allocations = [];
  for (const roomType of inventory) {
    const quantity = Math.min(remaining, roomType.available);
    if (quantity > 0) {
      allocations.push({ roomType: roomType.roomType, roomsAllocated: quantity });
      remaining -= quantity;
    }
    if (remaining === 0) break;
  }
  return {
    allocations,
    availableTotal: inventory.reduce((sum, roomType) => sum + roomType.available, 0),
    unallocated: remaining,
    inventory,
  };
}

export function replaceGroupRoomTypeAllocations(groupId, allocations) {
  db.prepare('DELETE FROM group_room_blocks WHERE group_booking_id = ?').run(groupId);
  const insert = db.prepare(`
    INSERT INTO group_room_blocks (group_booking_id, room_type, rooms_allocated)
    VALUES (?, ?, ?)
  `);
  for (const allocation of allocations) {
    insert.run(groupId, allocation.roomType, allocation.roomsAllocated);
  }
}

// Existing installations predate per-room-type group allocations. Backfill
// active records deterministically so their contracted inventory is honored
// before any public availability is returned.
function backfillGroupRoomTypeAllocations() {
  const groups = db.prepare(`
    SELECT group_record.*, COALESCE(SUM(block.rooms_allocated), 0) AS allocated_by_type
    FROM group_bookings group_record
    LEFT JOIN group_room_blocks block ON block.group_booking_id = group_record.id
    WHERE group_record.status IN (?, ?)
    GROUP BY group_record.id
    HAVING COALESCE(SUM(block.rooms_allocated), 0) != group_record.rooms_allocated
    ORDER BY group_record.created_at, group_record.id
  `).all(...ACTIVE_GROUP_STATUSES);
  if (groups.length === 0) return;

  tx(() => {
    for (const group of groups) {
      const plan = planGroupRoomTypeAllocation({
        propertyId: group.property_id,
        startDate: group.start_date,
        endDate: group.end_date,
        roomsAllocated: group.rooms_allocated,
        excludeGroupId: group.id,
      });
      if (plan.unallocated > 0 && plan.inventory.length > 0) {
        const fallbackType = plan.inventory[0].roomType;
        const fallback = plan.allocations.find((item) => item.roomType === fallbackType);
        if (fallback) fallback.roomsAllocated += plan.unallocated;
        else plan.allocations.unshift({ roomType: fallbackType, roomsAllocated: plan.unallocated });
        console.warn(
          `[inventory] legacy group ${group.id} exceeds modeled availability by ${plan.unallocated}; preserving the committed block`,
        );
      }
      replaceGroupRoomTypeAllocations(group.id, plan.allocations);
    }
  });
}

backfillGroupRoomTypeAllocations();
