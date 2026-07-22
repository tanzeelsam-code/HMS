import React, { useCallback, useEffect, useState } from 'react';
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
import { AccountingDashboard } from './components/AccountingDashboard';
import { ProcurementBoard } from './components/ProcurementBoard';
import { HrBoard } from './components/HrBoard';
import { BookingModal } from './components/BookingModal';
import { FolioModal } from './components/FolioModal';
import { LoginScreen } from './components/LoginScreen';

import { api, getStoredUser, logout, ApiError, AuthUser } from './api';
import {
  Room, Reservation, FolioItem, HousekeepingTask, PosCharge, GuestProfile,
  MaintenanceWorkOrder, HotelMetrics, DynamicPricingRule, ChannelStatus
} from './types';

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('tape-chart');
  const [selectedProperty, setSelectedProperty] = useState('Nexus Luxury Resort & Spa (Main Property)');

  // Main State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTask[]>([]);
  const [dynamicRules, setDynamicRules] = useState<DynamicPricingRule[]>([]);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [posCharges, setPosCharges] = useState<PosCharge[]>([]);
  const [metrics, setMetrics] = useState<HotelMetrics | null>(null);
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceWorkOrder[]>([]);

  // Modals
  const [selectedReservationForFolio, setSelectedReservationForFolio] = useState<Reservation | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingRoomNumber, setBookingRoomNumber] = useState<string | undefined>(undefined);

  // Force logout when the API rejects the session
  const handleAuthError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setUser(null);
      return true;
    }
    return false;
  }, []);

  const runHandler = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      if (!handleAuthError(err)) {
        alert(err instanceof Error ? err.message : 'Operation failed');
      }
    }
  }, [handleAuthError]);

  // Refetch helpers
  const refreshRooms = useCallback(async () => setRooms(await api.get<Room[]>('/rooms')), []);
  const refreshReservations = useCallback(async () => {
    const list = await api.get<Reservation[]>('/reservations');
    setReservations(list);
    setSelectedReservationForFolio(prev => prev ? (list.find(r => r.id === prev.id) || null) : null);
  }, []);
  const refreshHousekeeping = useCallback(async () => setHousekeepingTasks(await api.get<HousekeepingTask[]>('/housekeeping')), []);
  const refreshMetrics = useCallback(async () => setMetrics(await api.get<HotelMetrics>('/metrics')), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [rms, rez, hk, rules, chs, pos, met, guests, maint] = await Promise.all([
        api.get<Room[]>('/rooms'),
        api.get<Reservation[]>('/reservations'),
        api.get<HousekeepingTask[]>('/housekeeping'),
        api.get<DynamicPricingRule[]>('/pricing-rules'),
        api.get<ChannelStatus[]>('/channels'),
        api.get<PosCharge[]>('/pos-charges'),
        api.get<HotelMetrics>('/metrics'),
        api.get<GuestProfile[]>('/guests'),
        api.get<MaintenanceWorkOrder[]>('/maintenance'),
      ]);
      setRooms(rms);
      setReservations(rez);
      setHousekeepingTasks(hk);
      setDynamicRules(rules);
      setChannels(chs);
      setPosCharges(pos);
      setMetrics(met);
      setGuestProfiles(guests);
      setMaintenanceOrders(maint);
    } catch (err) {
      if (!handleAuthError(err)) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load property data');
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  // Handlers
  const handleCheckIn = (resId: string) => runHandler(async () => {
    await api.post(`/reservations/${resId}/check-in`);
    await Promise.all([refreshRooms(), refreshReservations(), refreshMetrics()]);
  });

  const handleCheckOut = (resId: string) => runHandler(async () => {
    await api.post(`/reservations/${resId}/check-out`);
    await Promise.all([refreshRooms(), refreshReservations(), refreshHousekeeping(), refreshMetrics()]);
  });

  const handleCompleteHousekeepingTask = (taskId: string) => runHandler(async () => {
    await api.patch(`/housekeeping/${taskId}`, { status: 'Completed' });
    await Promise.all([refreshHousekeeping(), refreshRooms(), refreshMetrics()]);
  });

  const handleUpdateRoomStatus = (roomNumber: string, status: Room['status']) => runHandler(async () => {
    await api.patch(`/rooms/${roomNumber}`, { status });
    await Promise.all([refreshRooms(), refreshMetrics()]);
  });

  const handleSaveNewReservation = (newRes: Reservation) => runHandler(async () => {
    await api.post('/reservations', {
      guestName: newRes.guestName,
      guestEmail: newRes.guestEmail,
      guestPhone: newRes.guestPhone,
      vipTier: newRes.vipTier,
      roomNumber: newRes.roomNumber,
      roomType: newRes.roomType,
      checkIn: newRes.checkIn,
      checkOut: newRes.checkOut,
      guestsCount: newRes.guestsCount,
      channel: newRes.channel,
      totalAmount: newRes.totalAmount,
      paidAmount: newRes.paidAmount,
      specialRequests: newRes.specialRequests,
    });
    // Keep the room marked Reserved on the tape chart (server leaves room status untouched)
    await api.patch(`/rooms/${newRes.roomNumber}`, { status: 'Reserved' });
    await Promise.all([refreshReservations(), refreshRooms(), refreshMetrics()]);
    setIsBookingModalOpen(false);
  });

  const handleAddFolioItem = (resId: string, item: FolioItem) => runHandler(async () => {
    const updated = await api.post<Reservation>(`/reservations/${resId}/folio-items`, {
      description: item.description,
      category: item.category,
      amount: item.amount,
      postedBy: item.postedBy,
    });
    setReservations(prev => prev.map(r => (r.id === resId ? updated : r)));
    setSelectedReservationForFolio(prev => (prev && prev.id === resId ? updated : prev));
    await refreshMetrics();
  });

  const handleAddPosCharge = (charge: PosCharge) => runHandler(async () => {
    await api.post('/pos-charges', {
      roomNumber: charge.roomNumber,
      outlet: charge.outlet,
      items: charge.items,
      total: charge.total,
    });
    // Server auto-posts to the matching in-house folio — refetch both collections
    await Promise.all([
      (async () => setPosCharges(await api.get<PosCharge[]>('/pos-charges')))(),
      refreshReservations(),
      refreshMetrics(),
    ]);
  });

  const handleCopilotDataChanged = useCallback(async () => {
    try {
      await Promise.all([refreshRooms(), refreshReservations(), refreshHousekeeping(), refreshMetrics()]);
    } catch (err) {
      handleAuthError(err);
    }
  }, [refreshRooms, refreshReservations, refreshHousekeeping, refreshMetrics, handleAuthError]);

  const handleAddMaintenanceOrder = (order: MaintenanceWorkOrder) => runHandler(async () => {
    await api.post('/maintenance', {
      roomNumber: order.roomNumber,
      issueDescription: order.issueDescription,
      category: order.category,
      priority: order.priority,
      reportedBy: order.reportedBy,
      assignedEngineer: order.assignedEngineer,
      slaMinutes: order.slaMinutes,
    });
    setMaintenanceOrders(await api.get<MaintenanceWorkOrder[]>('/maintenance'));
  });

  const handleResolveMaintenanceOrder = (orderId: string) => runHandler(async () => {
    const updated = await api.patch<MaintenanceWorkOrder>(`/maintenance/${orderId}/resolve`);
    setMaintenanceOrders(prev => prev.map(o => (o.id === orderId ? updated : o)));
  });

  const handleToggleAutoApply = (ruleId: string) => runHandler(async () => {
    const rule = dynamicRules.find(r => r.id === ruleId);
    if (!rule) return;
    const updated = await api.patch<DynamicPricingRule>(`/pricing-rules/${ruleId}`, { autoApply: !rule.autoApply });
    setDynamicRules(prev => prev.map(r => (r.id === ruleId ? updated : r)));
  });

  const handleApplyRecommendedRate = (ruleId: string) => runHandler(async () => {
    const targetRule = dynamicRules.find(r => r.id === ruleId);
    if (!targetRule) return;
    await api.post(`/pricing-rules/${ruleId}/apply`);
    await refreshRooms();
    alert(`Applied AI recommended rate ($${targetRule.recommendedRate}) to all ${targetRule.roomType} inventory!`);
  });

  const handleTriggerSync = (channelId: string) => runHandler(async () => {
    const updated = await api.post<ChannelStatus[]>('/channels/sync', { id: channelId });
    setChannels(updated);
  });

  const handleRunNightAudit = () => runHandler(async () => {
    const summary = await api.post<{
      foliosPosted: number;
      totalRoomRevenue: number;
      journalEntryId: string | null;
      ranAt: string;
    }>('/night-audit');
    await Promise.all([refreshReservations(), refreshMetrics()]);
    alert(
      `Automated Daily Financial Audit complete.\n\n` +
      `✓ Room charges posted to ${summary.foliosPosted} active folio(s).\n` +
      `✓ Total room revenue posted: $${summary.totalRoomRevenue}.\n` +
      `✓ GL journal entry: ${summary.journalEntryId || 'none (no in-house guests)'}.\n` +
      `✓ Ran at: ${new Date(summary.ranAt).toLocaleString()}`
    );
  });

  const handleLogout = () => {
    logout();
    setUser(null);
  };

  // ---- Auth gate ----
  if (!user) {
    return <LoginScreen onLogin={(u) => setUser(u)} />;
  }

  if (loading && !metrics) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-gray-100 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl tracking-tighter animate-pulse-glow">
          A
        </div>
        <p className="text-sm text-gray-400 font-medium">Loading live property data…</p>
      </div>
    );
  }

  if (loadError && !metrics) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-gray-100 gap-4 p-4">
        <p className="text-sm text-rose-300 font-semibold">{loadError}</p>
        <div className="flex gap-3">
          <button onClick={loadAll} className="btn-primary text-xs px-4 py-2">Retry</button>
          <button onClick={handleLogout} className="btn-secondary text-xs px-4 py-2">Sign Out</button>
        </div>
      </div>
    );
  }

  const pendingArrivalsCount = reservations.filter(r => r.status === 'Confirmed').length;
  const dirtyRoomsCount = rooms.filter(r => r.status === 'Vacant Dirty').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-gray-100">
      {/* Top Bar */}
      {metrics && (
        <Navbar
          metrics={metrics}
          onOpenNewBooking={() => {
            setBookingRoomNumber(undefined);
            setIsBookingModalOpen(true);
          }}
          onRunNightAudit={handleRunNightAudit}
          selectedProperty={selectedProperty}
          setSelectedProperty={setSelectedProperty}
          userName={user.name}
          userRole={user.role}
        />
      )}

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
              onDataChanged={handleCopilotDataChanged}
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

          {activeTab === 'analytics' && metrics && (
            <FinancialAnalytics
              metrics={metrics}
              onRunNightAudit={handleRunNightAudit}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingDashboard
              metrics={metrics}
            />
          )}

          {activeTab === 'procurement' && (
            <ProcurementBoard />
          )}

          {activeTab === 'hr' && (
            <HrBoard />
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
