export type RoomType = 'Standard King' | 'Deluxe Ocean View' | 'Executive Suite' | 'Presidential Suite';

export type RoomStatus = 'Vacant Clean' | 'Occupied' | 'Vacant Dirty' | 'Reserved' | 'Out of Service';

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  floor: number;
  status: RoomStatus;
  basePrice: number;
  currentPrice: number;
  amenities: string[];
  currentGuestId?: string;
  currentGuestName?: string;
}

export type BookingStatus = 'Confirmed' | 'Checked-In' | 'Checked-Out' | 'Cancelled' | 'No-Show';
export type OTAChannel = 'Direct Web' | 'Booking.com' | 'Airbnb' | 'Expedia' | 'Agoda';

export interface FolioItem {
  id: string;
  date: string;
  description: string;
  category: 'Room Charge' | 'Tax' | 'F&B Restaurant' | 'Spa & Wellness' | 'Minibar' | 'Payment';
  amount: number;
  postedBy: string;
}

export interface Reservation {
  id: string;
  code: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  vipTier: 'Member' | 'Silver' | 'Gold' | 'Platinum';
  roomNumber: string;
  roomType: RoomType;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  guestsCount: number;
  status: BookingStatus;
  channel: OTAChannel;
  totalAmount: number;
  paidAmount: number;
  folioItems: FolioItem[];
  specialRequests?: string;
  contactlessCheckInCompleted?: boolean;
}

export interface HousekeepingTask {
  id: string;
  roomNumber: string;
  roomType: RoomType;
  floor: number;
  taskType: 'Full Clean' | 'Touch-up' | 'Deep Clean' | 'Maintenance Inspect';
  status: 'Pending' | 'In-Progress' | 'Completed' | 'Inspected';
  assignedTo: string;
  priority: 'High' | 'Normal' | 'Urgent';
  etaMinutes: number;
}

export interface DynamicPricingRule {
  id: string;
  roomType: RoomType;
  baseRate: number;
  recommendedRate: number;
  demandFactor: number;
  competitorAvgRate: number;
  occupancyTrigger: number;
  autoApply: boolean;
}

export interface ChannelStatus {
  id: string;
  name: OTAChannel;
  logo: string;
  connected: boolean;
  activeListings: number;
  commissionRate: number;
  lastSync: string;
  syncLatency: string;
  bookingsThisMonth: number;
}

export interface PosCharge {
  id: string;
  time: string;
  roomNumber: string;
  guestName: string;
  outlet: 'Savor Fine Dining' | 'Horizon Lounge & Bar' | 'Serenity Spa' | 'In-Room Dining';
  items: { name: string; price: number; qty: number }[];
  total: number;
  status: 'Posted to Room' | 'Settled Card' | 'Pending';
}

export interface HotelMetrics {
  occupancyRate: number;
  adr: number;
  revPar: number;
  totalRevenue: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  dirtyRooms: number;
}

// --- NEW V2 CDP & CMMS & ANOMALY MODELS ---

export interface GuestProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  vipTier: 'Member' | 'Silver' | 'Gold' | 'Platinum';
  totalStays: number;
  totalNights: number;
  lifetimeSpend: number;
  preferredRoomType: RoomType;
  dietaryPreferences: string[];
  notes: string;
  lastStayDate: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  roomNumber: string;
  issueDescription: string;
  category: 'Plumbing' | 'Electrical' | 'HVAC / AC' | 'Furniture' | 'Door Lock';
  priority: 'Urgent' | 'High' | 'Normal';
  status: 'Open' | 'In-Progress' | 'Resolved';
  reportedBy: string;
  assignedEngineer: string;
  slaMinutes: number;
  reportedTime: string;
}

export interface AnomalyItem {
  id: string;
  type: 'Unposted Room Rate' | 'Duplicate Folio Charge' | 'Unpaid Balance Check-out' | 'Manual Discount Variance';
  severity: 'High' | 'Medium' | 'Low';
  description: string;
  roomNumber: string;
  amount: number;
  actionRequired: string;
}

// --- ERP (GL / Inventory / Procurement / HR) & AI MODELS ---

export interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  source: string;
  lines: JournalLine[];
}

export interface NightAuditSummary {
  foliosPosted: number;
  totalRoomRevenue: number;
  journalEntryId: string | null;
  ranAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  onHand: number;
  parLevel: number;
  costPerUnit: number;
}

export interface Vendor {
  id: string;
  name: string;
  contact: string;
  category: string;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  itemId: string;
  qty: number;
  unitCost: number;
  status: 'Open' | 'Received';
  orderDate: string;
  vendorName?: string;
  itemName?: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  shift: string;
  hourlyRate: number;
  status: 'Active' | 'On Leave' | 'Terminated';
}

export interface Shift {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  employeeName?: string;
}

export interface AnomalyAlert {
  severity: 'High' | 'Medium' | 'Low';
  message: string;
}

export interface PricingForecast {
  roomType: RoomType;
  baseRate: number;
  recommendedRate: number;
  demandMultiplier: number;
  occupancyForecast: number; // % over next 14 days
  reasoning: string[];
}

export interface DemandForecastDay {
  date: string; // YYYY-MM-DD
  expectedOccupancy: number; // %
  arrivals: number;
}

export interface CopilotResponse {
  reply: string;
  actions: string[];
}
