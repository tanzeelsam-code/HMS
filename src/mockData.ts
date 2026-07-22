import { Room, Reservation, HousekeepingTask, DynamicPricingRule, ChannelStatus, PosCharge, HotelMetrics, GuestProfile, MaintenanceWorkOrder, AnomalyItem, GroupBooking, ReviewItem, EsgMetric, PropertyComparison } from './types';

export const INITIAL_ROOMS: Room[] = [
  // Floor 1 - Standard & Deluxe
  { id: '101', number: '101', type: 'Standard King', floor: 1, status: 'Occupied', basePrice: 180, currentPrice: 220, amenities: ['King Bed', 'City View', 'Wi-Fi 6', 'Rain Shower'], currentGuestName: 'Alexander Wright' },
  { id: '102', number: '102', type: 'Standard King', floor: 1, status: 'Vacant Clean', basePrice: 180, currentPrice: 220, amenities: ['King Bed', 'City View', 'Wi-Fi 6'] },
  { id: '103', number: '103', type: 'Standard King', floor: 1, status: 'Vacant Dirty', basePrice: 180, currentPrice: 210, amenities: ['King Bed', 'Garden Access', 'Smart TV'] },
  { id: '104', number: '104', type: 'Deluxe Ocean View', floor: 1, status: 'Occupied', basePrice: 280, currentPrice: 340, amenities: ['Ocean Balcony', 'Nespresso', 'King Bed'], currentGuestName: 'Sophia Martinez' },
  { id: '105', number: '105', type: 'Deluxe Ocean View', floor: 1, status: 'Reserved', basePrice: 280, currentPrice: 340, amenities: ['Ocean Balcony', 'Nespresso', 'Soaking Tub'] },

  // Floor 2 - Deluxe & Executive Suites
  { id: '201', number: '201', type: 'Deluxe Ocean View', floor: 2, status: 'Occupied', basePrice: 290, currentPrice: 350, amenities: ['Private Balcony', 'Ocean View', 'Mini Bar'], currentGuestName: 'David Chen' },
  { id: '202', number: '202', type: 'Deluxe Ocean View', floor: 2, status: 'Vacant Clean', basePrice: 290, currentPrice: 350, amenities: ['Private Balcony', 'Ocean View'] },
  { id: '203', number: '203', type: 'Executive Suite', floor: 2, status: 'Occupied', basePrice: 450, currentPrice: 560, amenities: ['Lounge Area', 'Free Breakfast', 'Butler Service'], currentGuestName: 'Victoria Sterling' },
  { id: '204', number: '204', type: 'Executive Suite', floor: 2, status: 'Vacant Dirty', basePrice: 450, currentPrice: 560, amenities: ['Lounge Area', 'Jacuzzi', 'Workstation'] },
  { id: '205', number: '205', type: 'Executive Suite', floor: 2, status: 'Reserved', basePrice: 450, currentPrice: 560, amenities: ['Lounge Area', 'Panoramic View'] },

  // Floor 3 - Executive & Penthouse/Presidential
  { id: '301', number: '301', type: 'Executive Suite', floor: 3, status: 'Occupied', basePrice: 480, currentPrice: 580, amenities: ['High Floor', 'Skyline View', 'Espresso Bar'], currentGuestName: 'Lord Marcus Vance' },
  { id: '302', number: '302', type: 'Executive Suite', floor: 3, status: 'Vacant Clean', basePrice: 480, currentPrice: 580, amenities: ['High Floor', 'Skyline View'] },
  { id: '303', number: '303', type: 'Presidential Suite', floor: 3, status: 'Occupied', basePrice: 1200, currentPrice: 1450, amenities: ['Private Terrace', 'Plunge Pool', 'Personal Chef Access', 'Helipad Access'], currentGuestName: 'Elena Rostova' },
  { id: '304', number: '304', type: 'Presidential Suite', floor: 3, status: 'Out of Service', basePrice: 1200, currentPrice: 1450, amenities: ['Private Terrace', 'Fireplace', 'Grand Piano'] },
];

export const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'res-101',
    code: 'GH-8821',
    guestName: 'Alexander Wright',
    guestEmail: 'alex.wright@corp.com',
    guestPhone: '+1 (555) 234-5678',
    vipTier: 'Platinum',
    roomNumber: '101',
    roomType: 'Standard King',
    checkIn: '2026-07-20',
    checkOut: '2026-07-24',
    nights: 4,
    guestsCount: 2,
    status: 'Checked-In',
    channel: 'Direct Web',
    totalAmount: 880,
    paidAmount: 880,
    contactlessCheckInCompleted: true,
    folioItems: [
      { id: 'f-1', date: '2026-07-20', description: 'Room Charge (101)', category: 'Room Charge', amount: 220, postedBy: 'System Auto' },
      { id: 'f-2', date: '2026-07-20', description: 'Occupancy Tax & Resort Fee', category: 'Tax', amount: 35, postedBy: 'System Auto' },
      { id: 'f-3', date: '2026-07-21', description: 'Savor Dinner - Wagyu & Wine', category: 'F&B Restaurant', amount: 145, postedBy: 'POS Terminal 1' },
      { id: 'f-4', date: '2026-07-20', description: 'Advance Card Payment', category: 'Payment', amount: -880, postedBy: 'Stripe Gateway' },
    ],
    specialRequests: 'High floor preferred, extra feather pillows'
  },
  {
    id: 'res-104',
    code: 'GH-9034',
    guestName: 'Sophia Martinez',
    guestEmail: 'sophia.m@designs.io',
    guestPhone: '+1 (555) 876-5432',
    vipTier: 'Gold',
    roomNumber: '104',
    roomType: 'Deluxe Ocean View',
    checkIn: '2026-07-21',
    checkOut: '2026-07-25',
    nights: 4,
    guestsCount: 1,
    status: 'Checked-In',
    channel: 'Booking.com',
    totalAmount: 1360,
    paidAmount: 680,
    contactlessCheckInCompleted: true,
    folioItems: [
      { id: 'f-10', date: '2026-07-21', description: 'Room Charge (104)', category: 'Room Charge', amount: 340, postedBy: 'System Auto' },
      { id: 'f-11', date: '2026-07-21', description: 'Serenity Spa - Swedish Massage', category: 'Spa & Wellness', amount: 180, postedBy: 'Spa POS' },
      { id: 'f-12', date: '2026-07-21', description: 'Deposit Payment', category: 'Payment', amount: -680, postedBy: 'Front Desk' },
    ],
    specialRequests: 'Quiet room away from elevators'
  },
  {
    id: 'res-203',
    code: 'GH-9112',
    guestName: 'Victoria Sterling',
    guestEmail: 'v.sterling@global.co',
    guestPhone: '+44 7700 900123',
    vipTier: 'Platinum',
    roomNumber: '203',
    roomType: 'Executive Suite',
    checkIn: '2026-07-21',
    checkOut: '2026-07-26',
    nights: 5,
    guestsCount: 2,
    status: 'Checked-In',
    channel: 'Direct Web',
    totalAmount: 2800,
    paidAmount: 2800,
    contactlessCheckInCompleted: true,
    folioItems: [
      { id: 'f-20', date: '2026-07-21', description: 'Room Charge (203)', category: 'Room Charge', amount: 560, postedBy: 'System Auto' },
      { id: 'f-21', date: '2026-07-21', description: 'Full Stay Pre-payment', category: 'Payment', amount: -2800, postedBy: 'Direct Engine' },
    ],
    specialRequests: 'Airport transfer arranged, VIP welcome champagne in room'
  },
  {
    id: 'res-105',
    code: 'GH-9200',
    guestName: 'Liam Hemsworth',
    guestEmail: 'liam.h@cinema.org',
    guestPhone: '+1 (555) 444-9988',
    vipTier: 'Silver',
    roomNumber: '105',
    roomType: 'Deluxe Ocean View',
    checkIn: '2026-07-21',
    checkOut: '2026-07-23',
    nights: 2,
    guestsCount: 2,
    status: 'Confirmed',
    channel: 'Airbnb',
    totalAmount: 680,
    paidAmount: 680,
    contactlessCheckInCompleted: false,
    folioItems: [],
    specialRequests: 'Late arrival expected around 9:00 PM'
  },
  {
    id: 'res-303',
    code: 'GH-9999',
    guestName: 'Elena Rostova',
    guestEmail: 'elena.rostova@venture.com',
    guestPhone: '+33 6 12 34 56 78',
    vipTier: 'Platinum',
    roomNumber: '303',
    roomType: 'Presidential Suite',
    checkIn: '2026-07-19',
    checkOut: '2026-07-26',
    nights: 7,
    guestsCount: 3,
    status: 'Checked-In',
    channel: 'Direct Web',
    totalAmount: 10150,
    paidAmount: 10150,
    contactlessCheckInCompleted: true,
    folioItems: [
      { id: 'f-30', date: '2026-07-19', description: 'Room Charge (303)', category: 'Room Charge', amount: 1450, postedBy: 'System Auto' },
      { id: 'f-31', date: '2026-07-20', description: 'Horizon Bar Private Tasting', category: 'F&B Restaurant', amount: 650, postedBy: 'Bar POS' },
      { id: 'f-32', date: '2026-07-19', description: 'Amex Centurion Payment', category: 'Payment', amount: -10150, postedBy: 'System' },
    ],
    specialRequests: 'Private security clearance required for helicopter landing'
  }
];

export const INITIAL_HOUSEKEEPING: HousekeepingTask[] = [
  { id: 'hk-1', roomNumber: '103', roomType: 'Standard King', floor: 1, taskType: 'Full Clean', status: 'In-Progress', assignedTo: 'Maria Santos', priority: 'High', etaMinutes: 15 },
  { id: 'hk-2', roomNumber: '204', roomType: 'Executive Suite', floor: 2, taskType: 'Full Clean', status: 'Pending', assignedTo: 'Carlos Rivera', priority: 'Urgent', etaMinutes: 35 },
  { id: 'hk-3', roomNumber: '304', roomType: 'Presidential Suite', floor: 3, taskType: 'Maintenance Inspect', status: 'In-Progress', assignedTo: 'Engineering (John D.)', priority: 'Urgent', etaMinutes: 45 },
  { id: 'hk-4', roomNumber: '102', roomType: 'Standard King', floor: 1, taskType: 'Touch-up', status: 'Inspected', assignedTo: 'Anna Kowalski', priority: 'Normal', etaMinutes: 0 },
];

export const INITIAL_DYNAMIC_PRICING: DynamicPricingRule[] = [
  { id: 'dp-1', roomType: 'Standard King', baseRate: 180, recommendedRate: 220, demandFactor: 1.22, competitorAvgRate: 205, occupancyTrigger: 75, autoApply: true },
  { id: 'dp-2', roomType: 'Deluxe Ocean View', baseRate: 280, recommendedRate: 340, demandFactor: 1.21, competitorAvgRate: 325, occupancyTrigger: 80, autoApply: true },
  { id: 'dp-3', roomType: 'Executive Suite', baseRate: 450, recommendedRate: 560, demandFactor: 1.24, competitorAvgRate: 540, occupancyTrigger: 85, autoApply: false },
  { id: 'dp-4', roomType: 'Presidential Suite', baseRate: 1200, recommendedRate: 1450, demandFactor: 1.21, competitorAvgRate: 1400, occupancyTrigger: 90, autoApply: false },
];

export const INITIAL_CHANNELS: ChannelStatus[] = [
  { id: 'ch-1', name: 'Direct Web', logo: '🌐', connected: true, activeListings: 14, commissionRate: 0, lastSync: '10 seconds ago', syncLatency: '12ms', bookingsThisMonth: 84 },
  { id: 'ch-2', name: 'Booking.com', logo: '🏨', connected: true, activeListings: 14, commissionRate: 15, lastSync: '1 min ago', syncLatency: '140ms', bookingsThisMonth: 128 },
  { id: 'ch-3', name: 'Airbnb', logo: '🏠', connected: true, activeListings: 10, commissionRate: 14, lastSync: '3 mins ago', syncLatency: '210ms', bookingsThisMonth: 42 },
  { id: 'ch-4', name: 'Expedia', logo: '✈️', connected: true, activeListings: 14, commissionRate: 18, lastSync: '5 mins ago', syncLatency: '180ms', bookingsThisMonth: 66 },
  { id: 'ch-5', name: 'Agoda', logo: '🌏', connected: true, activeListings: 12, commissionRate: 16, lastSync: '8 mins ago', syncLatency: '320ms', bookingsThisMonth: 29 },
];

export const INITIAL_POS_CHARGES: PosCharge[] = [
  { id: 'pos-101', time: '20:15 PM', roomNumber: '101', guestName: 'Alexander Wright', outlet: 'Savor Fine Dining', items: [{ name: 'A5 Wagyu Ribeye', price: 95, qty: 1 }, { name: 'Barolo 2018', price: 50, qty: 1 }], total: 145, status: 'Posted to Room' },
  { id: 'pos-102', time: '19:40 PM', roomNumber: '104', guestName: 'Sophia Martinez', outlet: 'Serenity Spa', items: [{ name: 'Deep Tissue Massage 90m', price: 180, qty: 1 }], total: 180, status: 'Posted to Room' },
  { id: 'pos-103', time: '18:10 PM', roomNumber: '303', guestName: 'Elena Rostova', outlet: 'Horizon Lounge & Bar', items: [{ name: 'Dom Pérignon 2012', price: 450, qty: 1 }, { name: 'Caviar Service', price: 200, qty: 1 }], total: 650, status: 'Posted to Room' },
];

export const INITIAL_METRICS: HotelMetrics = {
  occupancyRate: 85.7,
  adr: 384.50,
  revPar: 329.50,
  totalRevenue: 14850,
  arrivalsToday: 3,
  departuresToday: 2,
  inHouseGuests: 12,
  dirtyRooms: 2
};

export const INITIAL_GUEST_PROFILES: GuestProfile[] = [
  {
    id: 'cdp-1',
    name: 'Alexander Wright',
    email: 'alex.wright@corp.com',
    phone: '+1 (555) 234-5678',
    vipTier: 'Platinum',
    totalStays: 8,
    totalNights: 26,
    lifetimeSpend: 8450,
    preferredRoomType: 'Standard King',
    dietaryPreferences: ['Gluten-Free', 'High Protein', 'Perrier Water'],
    notes: 'Prefers high floor quiet rooms. Always requests extra feather pillows & late checkout.',
    lastStayDate: '2026-07-20'
  },
  {
    id: 'cdp-2',
    name: 'Elena Rostova',
    email: 'elena.rostova@venture.com',
    phone: '+33 6 12 34 56 78',
    vipTier: 'Platinum',
    totalStays: 14,
    totalNights: 52,
    lifetimeSpend: 48900,
    preferredRoomType: 'Presidential Suite',
    dietaryPreferences: ['Organic Vegan', 'Dom Pérignon 2012'],
    notes: 'VVIP Ultra High Net Worth guest. Requires private security clearance & direct helipad protocol.',
    lastStayDate: '2026-07-19'
  },
  {
    id: 'cdp-3',
    name: 'Sophia Martinez',
    email: 'sophia.m@designs.io',
    phone: '+1 (555) 876-5432',
    vipTier: 'Gold',
    totalStays: 4,
    totalNights: 12,
    lifetimeSpend: 4200,
    preferredRoomType: 'Deluxe Ocean View',
    dietaryPreferences: ['Oat Milk Latte', 'Fresh Fruit Platter'],
    notes: 'Design executive. Enjoys Serenity Spa deep tissue massage treatments.',
    lastStayDate: '2026-07-21'
  }
];

export const INITIAL_MAINTENANCE_ORDERS: MaintenanceWorkOrder[] = [
  {
    id: 'maint-304',
    roomNumber: '304',
    issueDescription: 'AC HVAC compressor pressure leak & noise vibration in ceiling unit',
    category: 'HVAC / AC',
    priority: 'Urgent',
    status: 'In-Progress',
    reportedBy: 'Housekeeping (Maria S.)',
    assignedEngineer: 'John Depta (Lead HVAC Eng)',
    slaMinutes: 45,
    reportedTime: '14:20 PM'
  },
  {
    id: 'maint-103',
    roomNumber: '103',
    issueDescription: 'NFC Bluetooth Door lock low battery warning alert (12% remaining)',
    category: 'Door Lock',
    priority: 'High',
    status: 'Open',
    reportedBy: 'System IoT Monitor',
    assignedEngineer: 'Alex Tech',
    slaMinutes: 90,
    reportedTime: '16:05 PM'
  }
];

export const INITIAL_ANOMALIES: AnomalyItem[] = [
  {
    id: 'anom-1',
    type: 'Unposted Room Rate',
    severity: 'High',
    description: 'Room #105 confirmed arrival has no room charge posted to folio for tonight.',
    roomNumber: '105',
    amount: 340,
    actionRequired: 'Post Room Charge to Folio'
  },
  {
    id: 'anom-2',
    type: 'Manual Discount Variance',
    severity: 'Medium',
    description: 'Manual 25% rate override applied on Room #203 without Manager PIN record.',
    roomNumber: '203',
    amount: 140,
    actionRequired: 'Review Audit Override Log'
  }
];

// --- NEW V3 SEED DATA ---

export const INITIAL_GROUP_BOOKINGS: GroupBooking[] = [
  {
    id: 'grp-1',
    groupName: 'Global AI Summit 2026',
    companyName: 'Apex Innovations Corp',
    contactPerson: 'David Vance',
    contactEmail: 'd.vance@apexinnovations.io',
    roomsAllocated: 12,
    roomsPickedUp: 10,
    startDate: '2026-08-10',
    endDate: '2026-08-15',
    status: 'Definite Block',
    groupRate: 290,
    banquetCateringTotal: 14500,
    totalValue: 31900
  },
  {
    id: 'grp-2',
    groupName: 'International Cardiology Symposium',
    companyName: 'MedTech Global Forum',
    contactPerson: 'Dr. Sarah Jenkins',
    contactEmail: 's.jenkins@medtechforum.org',
    roomsAllocated: 8,
    roomsPickedUp: 5,
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    status: 'Tentative Hold',
    groupRate: 310,
    banquetCateringTotal: 9800,
    totalValue: 22200
  }
];

export const INITIAL_REVIEWS: ReviewItem[] = [
  {
    id: 'rev-1',
    source: 'Google Reviews',
    guestName: 'Marcus Brody',
    rating: 5,
    date: 'Yesterday',
    reviewText: 'Exceptional stay! The contactless digital key unlocked Room 303 in seconds. Savor Fine Dining Wagyu steak was 10/10.',
    sentiment: 'Positive',
    aiDraftedResponse: 'Dear Marcus, Thank you for your glowing 5-star review! We are delighted that you enjoyed your stay in Suite 303, the effortless NFC digital key, and the Wagyu at Savor Fine Dining. We look forward to welcoming you back to NexusHOS properties soon!',
    responded: false
  },
  {
    id: 'rev-2',
    source: 'Booking.com',
    guestName: 'Claire Bennet',
    rating: 4,
    date: '3 days ago',
    reviewText: 'Beautiful ocean view and spotless suite. Wi-Fi was fast. Minor wait during afternoon check-in queue.',
    sentiment: 'Neutral',
    aiDraftedResponse: 'Dear Claire, Thank you for sharing your experience. We are thrilled you loved the ocean balcony views and fiber Wi-Fi! We appreciate your feedback regarding check-in timing and are implementing mobile self check-in options to ensure instant arrivals.',
    responded: false
  }
];

export const INITIAL_ESG_METRICS: EsgMetric = {
  date: '2026-07-21',
  carbonPerOccupiedRoomKg: 11.4,
  energyKwhSaved: 480,
  hvacAutoSetbacksTriggered: 14,
  waterConsumptionLiters: 1420,
  renewableEnergyPercentage: 68
};

export const INITIAL_PORTFOLIO_COMPARISON: PropertyComparison[] = [
  { propertyName: 'Nexus Luxury Resort & Spa (Main Property)', totalRooms: 14, occupancyRate: 85.7, adr: 384.50, revPar: 329.50, totalRevenue: 14850, goppar: 215.40 },
  { propertyName: 'Nexus Boutique Suites & Villas', totalRooms: 20, occupancyRate: 92.0, adr: 450.00, revPar: 414.00, totalRevenue: 24840, goppar: 288.10 },
  { propertyName: 'Nexus Grand Executive Hotel', totalRooms: 45, occupancyRate: 78.4, adr: 260.00, revPar: 203.80, totalRevenue: 27513, goppar: 142.30 }
];
