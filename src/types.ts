export type RoomType = 'Standard King' | 'Deluxe Ocean View' | 'Executive Suite' | 'Presidential Suite';

export type RoomStatus = 'Vacant Clean' | 'Occupied' | 'Vacant Dirty' | 'Reserved' | 'Out of Service';

export interface Room {
  id: string;
  number: string;
  type: RoomType;
  floor: number;
  status: RoomStatus;
  basePrice?: number;
  currentPrice?: number;
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
  category: 'Room Charge' | 'Tax' | 'F&B Restaurant' | 'Spa & Wellness' | 'Minibar' | 'Other Income' | 'Payment';
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
  checkIn: string;
  checkOut: string;
  actualCheckOut?: string;
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
  businessDate: string;
  occupancyRate: number;
  financialMetricsAvailable: boolean;
  adr: number;
  revPar: number;
  totalRevenue: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  dirtyRooms: number;
}

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
  safetyCritical?: boolean;
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

export interface GroupBooking {
  id: string;
  groupName: string;
  companyName: string;
  contactPerson: string;
  contactEmail: string;
  roomsAllocated: number;
  roomsPickedUp: number;
  startDate: string;
  endDate: string;
  releaseDate?: string;
  status: 'Definite Block' | 'Tentative Hold' | 'Released';
  groupRate: number;
  banquetCateringTotal: number;
  totalValue: number;
}

export interface ReviewItem {
  id: string;
  source: 'Google Reviews' | 'Booking.com' | 'TripAdvisor' | 'Expedia';
  guestName: string;
  rating: number;
  date: string;
  reviewText: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  aiDraftedResponse?: string;
  responseText?: string;
  respondedAt?: string;
  responded: boolean;
}

export interface EsgMetric {
  date: string;
  carbonPerOccupiedRoomKg: number;
  energyKwhSaved: number;
  hvacAutoSetbacksTriggered: number;
  waterConsumptionLiters: number;
  renewableEnergyPercentage: number;
  source?: string;
}

export interface PropertyComparison {
  id?: string;
  code?: string;
  propertyName: string;
  totalRooms: number;
  occupancyRate: number;
  adr: number;
  revPar: number;
  totalRevenue: number;
  goppar: number;
  timezone?: string;
  currency?: string;
  locale?: string;
  businessDate?: string;
  source?: string;
}

// ERP & AI Types
export interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  balance: number;
}

export interface JournalLine {
  id?: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  source: string;
  lines: JournalLine[];
}

export interface AnomalyAlert {
  id?: string;
  severity: 'High' | 'Medium' | 'Low' | 'high' | 'medium' | 'low';
  title?: string;
  detail?: string;
  message: string;
}

export interface NightAuditSummary {
  date?: string;
  businessDate?: string;
  totalRoomRevenue: number;
  totalTax?: number;
  totalPosRevenue?: number;
  auditedBy?: string;
  reservationsProcessed?: number;
  foliosPosted: number;
  foliosSkipped?: number;
  alreadyRan?: boolean;
  journalEntryId: string | null;
  ranAt: string;
}

export interface PricingForecast {
  roomType: string;
  date: string;
  predictedDemand: number;
  recommendedPrice: number;
  recommendedRate: number;
  baseRate: number;
  demandMultiplier: number;
  occupancyForecast: number;
  reasoning: string[];
}

export interface DemandForecastDay {
  date: string;
  occupancyPct: number;
  demandIndex: number;
  expectedOccupancy: number;
  arrivals: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  status: 'Active' | 'On Leave' | 'Terminated';
  shift: string;
  hourlyRate: number;
}

export interface Shift {
  id: string;
  employeeName: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  department: string;
  start: string;
  end: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stockQty: number;
  onHand: number;
  unit: string;
  minReorderLevel: number;
  parLevel: number;
  unitPrice: number;
  costPerUnit: number;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contactEmail: string;
  phone: string;
  contact: string;
  rating: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorName: string;
  date: string;
  orderDate: string;
  itemName: string;
  qty: number;
  unitCost: number;
  totalAmount: number;
  status: 'Pending' | 'Approved' | 'Delivered' | 'Received' | 'Open';
}

export interface CopilotResponse {
  answer?: string;
  reply?: string;
  actions?: string[];
}
