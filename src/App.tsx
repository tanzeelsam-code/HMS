import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { TapeChart } from './components/TapeChart';
import { ReservationsList } from './components/ReservationsList';
import { HousekeepingBoard } from './components/HousekeepingBoard';
import { GuestPortalSimulator } from './components/GuestPortalSimulator';
import { AiRevenueManager } from './components/AiRevenueManager';
import { ChannelManager } from './components/ChannelManager';
import { PosPosting } from './components/PosPosting';
import { FinancialAnalytics } from './components/FinancialAnalytics';
import { StaffCopilot } from './components/StaffCopilot';
import { GuestCdp } from './components/GuestCdp';
import { MaintenanceBoard } from './components/MaintenanceBoard';
import { BookingModal } from './components/BookingModal';
import { FolioModal } from './components/FolioModal';

import { 
  INITIAL_ROOMS, 
  INITIAL_RESERVATIONS, 
  INITIAL_HOUSEKEEPING, 
  INITIAL_DYNAMIC_PRICING, 
  INITIAL_CHANNELS, 
  INITIAL_POS_CHARGES, 
  INITIAL_METRICS,
  INITIAL_GUEST_PROFILES,
  INITIAL_MAINTENANCE_ORDERS 
} from './mockData';
import { Room, Reservation, FolioItem, HousekeepingTask, PosCharge, GuestProfile, MaintenanceWorkOrder } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tape-chart');
  const [selectedProperty, setSelectedProperty] = useState('Aura Luxury Resort & Spa (Main Property)');

  // Main State
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTask[]>(INITIAL_HOUSEKEEPING);
  const [dynamicRules, setDynamicRules] = useState(INITIAL_DYNAMIC_PRICING);
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const [posCharges, setPosCharges] = useState<PosCharge[]>(INITIAL_POS_CHARGES);
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>(INITIAL_GUEST_PROFILES);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceWorkOrder[]>(INITIAL_MAINTENANCE_ORDERS);

  // Modals
  const [selectedReservationForFolio, setSelectedReservationForFolio] = useState<Reservation | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingRoomNumber, setBookingRoomNumber] = useState<string | undefined>(undefined);

  // Handlers
  const handleCheckIn = (resId: string) => {
    setReservations(prev => prev.map(r => {
      if (r.id === resId) {
        setRooms(rms => rms.map(rm => rm.number === r.roomNumber ? { ...rm, status: 'Occupied', currentGuestName: r.guestName } : rm));
        return { ...r, status: 'Checked-In' };
      }
      return r;
    }));
  };

  const handleCheckOut = (resId: string) => {
    setReservations(prev => prev.map(r => {
      if (r.id === resId) {
        setRooms(rms => rms.map(rm => rm.number === r.roomNumber ? { ...rm, status: 'Vacant Dirty', currentGuestName: undefined } : rm));
        
        const newTask: HousekeepingTask = {
          id: `hk-${Date.now()}`,
          roomNumber: r.roomNumber,
          roomType: r.roomType,
          floor: parseInt(r.roomNumber[0]),
          taskType: 'Full Clean',
          status: 'Pending',
          assignedTo: 'Unassigned',
          priority: 'Urgent',
          etaMinutes: 30
        };
        setHousekeepingTasks(prevHk => [newTask, ...prevHk]);

        return { ...r, status: 'Checked-Out' };
      }
      return r;
    }));
  };

  const handleCompleteHousekeepingTask = (taskId: string) => {
    setHousekeepingTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        setRooms(rms => rms.map(rm => rm.number === t.roomNumber ? { ...rm, status: 'Vacant Clean' } : rm));
        return { ...t, status: 'Completed' };
      }
      return t;
    }));
  };

  const handleUpdateRoomStatus = (roomNumber: string, status: Room['status']) => {
    setRooms(prev => prev.map(r => r.number === roomNumber ? { ...r, status } : r));
  };

  const handleSaveNewReservation = (newRes: Reservation) => {
    setReservations(prev => [newRes, ...prev]);
    setRooms(prev => prev.map(r => r.number === newRes.roomNumber ? { ...r, status: 'Reserved' } : r));
    setIsBookingModalOpen(false);
  };

  const handleAddFolioItem = (resId: string, item: FolioItem) => {
    setReservations(prev => prev.map(r => {
      if (r.id === resId) {
        const updatedItems = [...r.folioItems, item];
        const updatedRes = { ...r, folioItems: updatedItems };
        if (selectedReservationForFolio && selectedReservationForFolio.id === resId) {
          setSelectedReservationForFolio(updatedRes);
        }
        return updatedRes;
      }
      return r;
    }));
  };

  const handleAddPosCharge = (charge: PosCharge) => {
    setPosCharges(prev => [charge, ...prev]);
    const matchingRes = reservations.find(r => r.roomNumber === charge.roomNumber && r.status === 'Checked-In');
    if (matchingRes) {
      handleAddFolioItem(matchingRes.id, {
        id: `f-pos-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        description: `${charge.outlet} - Charge`,
        category: 'F&B Restaurant',
        amount: charge.total,
        postedBy: 'POS Terminal'
      });
    }
  };

  const handleExecuteCopilotCommand = (actionType: string) => {
    if (actionType === 'ASSIGN_VIPS') {
      alert("AI Copilot: VIP arrivals allocated to high floor suite inventory.");
    } else if (actionType === 'CLEAN_FLOOR1') {
      setHousekeepingTasks(prev => prev.map(t => t.floor === 1 ? { ...t, status: 'In-Progress', assignedTo: 'Maria Santos' } : t));
    }
  };

  const handleAddMaintenanceOrder = (order: MaintenanceWorkOrder) => {
    setMaintenanceOrders(prev => [order, ...prev]);
  };

  const handleResolveMaintenanceOrder = (orderId: string) => {
    setMaintenanceOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Resolved' } : o));
  };

  const handleToggleAutoApply = (ruleId: string) => {
    setDynamicRules(prev => prev.map(r => r.id === ruleId ? { ...r, autoApply: !r.autoApply } : r));
  };

  const handleApplyRecommendedRate = (ruleId: string) => {
    const targetRule = dynamicRules.find(r => r.id === ruleId);
    if (!targetRule) return;

    setRooms(prev => prev.map(r => r.type === targetRule.roomType ? { ...r, currentPrice: targetRule.recommendedRate } : r));
    alert(`Applied AI recommended rate ($${targetRule.recommendedRate}) to all ${targetRule.roomType} inventory!`);
  };

  const handleTriggerSync = (channelId: string) => {
    setChannels(prev => prev.map(c => c.id === channelId || channelId === 'all' ? { ...c, lastSync: 'Just now' } : c));
  };

  const handleRunNightAudit = () => {
    alert("Running Automated Daily Financial Audit...\n\n✓ Room charges & taxes posted to 12 active folios.\n✓ Credit card batch settlement submitted.\n✓ Daily USALI Revenue Report generated.");
  };

  const pendingArrivalsCount = reservations.filter(r => r.status === 'Confirmed').length;
  const dirtyRoomsCount = rooms.filter(r => r.status === 'Vacant Dirty').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-gray-100">
      {/* Top Bar */}
      <Navbar
        metrics={metrics}
        onOpenNewBooking={() => {
          setBookingRoomNumber(undefined);
          setIsBookingModalOpen(true);
        }}
        onRunNightAudit={handleRunNightAudit}
        selectedProperty={selectedProperty}
        setSelectedProperty={setSelectedProperty}
      />

      {/* Main Layout Container */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingArrivalsCount={pendingArrivalsCount}
          dirtyRoomsCount={dirtyRoomsCount}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-[1600px] mx-auto w-full">
          {activeTab === 'tape-chart' && (
            <TapeChart
              rooms={rooms}
              reservations={reservations}
              onSelectReservation={(res) => setSelectedReservationForFolio(res)}
              onOpenNewBooking={(roomNum) => {
                setBookingRoomNumber(roomNum);
                setIsBookingModalOpen(true);
              }}
            />
          )}

          {activeTab === 'staff-copilot' && (
            <StaffCopilot
              rooms={rooms}
              reservations={reservations}
              tasks={housekeepingTasks}
              onExecuteCommand={handleExecuteCopilotCommand}
            />
          )}

          {activeTab === 'guest-cdp' && (
            <GuestCdp
              profiles={guestProfiles}
            />
          )}

          {activeTab === 'reservations' && (
            <ReservationsList
              reservations={reservations}
              onSelectReservation={(res) => setSelectedReservationForFolio(res)}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onOpenNewBooking={() => {
                setBookingRoomNumber(undefined);
                setIsBookingModalOpen(true);
              }}
            />
          )}

          {activeTab === 'housekeeping' && (
            <HousekeepingBoard
              tasks={housekeepingTasks}
              rooms={rooms}
              onCompleteTask={handleCompleteHousekeepingTask}
              onUpdateRoomStatus={handleUpdateRoomStatus}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceBoard
              orders={maintenanceOrders}
              onAddOrder={handleAddMaintenanceOrder}
              onResolveOrder={handleResolveMaintenanceOrder}
            />
          )}

          {activeTab === 'guest-portal' && (
            <GuestPortalSimulator />
          )}

          {activeTab === 'ai-revenue' && (
            <AiRevenueManager
              rules={dynamicRules}
              onToggleAutoApply={handleToggleAutoApply}
              onApplyRecommendedRate={handleApplyRecommendedRate}
            />
          )}

          {activeTab === 'channel-manager' && (
            <ChannelManager
              channels={channels}
              onTriggerSync={handleTriggerSync}
            />
          )}

          {activeTab === 'pos-charges' && (
            <PosPosting
              charges={posCharges}
              rooms={rooms}
              onAddPosCharge={handleAddPosCharge}
            />
          )}

          {activeTab === 'analytics' && (
            <FinancialAnalytics
              metrics={metrics}
              onRunNightAudit={handleRunNightAudit}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {isBookingModalOpen && (
        <BookingModal
          rooms={rooms}
          initialRoomNumber={bookingRoomNumber}
          onClose={() => setIsBookingModalOpen(false)}
          onSaveReservation={handleSaveNewReservation}
        />
      )}

      {selectedReservationForFolio && (
        <FolioModal
          reservation={selectedReservationForFolio}
          onClose={() => setSelectedReservationForFolio(null)}
          onAddFolioItem={handleAddFolioItem}
        />
      )}
    </div>
  );
};

export default App;
