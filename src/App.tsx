import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
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
import { GroupBookingBoard } from './components/GroupBookingBoard';
import { ReputationBoard } from './components/ReputationBoard';
import { EsgDashboard } from './components/EsgDashboard';
import { MultiPropertyAnalytics } from './components/MultiPropertyAnalytics';
import { MigrationWizard } from './components/MigrationWizard';
import { AccountingDashboard } from './components/AccountingDashboard';
import { ProcurementBoard } from './components/ProcurementBoard';
import { HrBoard } from './components/HrBoard';
import { BookingModal } from './components/BookingModal';
import { FolioModal } from './components/FolioModal';
import { LoginScreen } from './components/LoginScreen';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { OperationsOverview } from './components/OperationsOverview';

import { api, getStoredUser, logout, restoreSession, ApiError, AuthUser, AUTH_EXPIRED_EVENT } from './api';
import {
  Room,
  Reservation,
  FolioItem,
  HousekeepingTask,
  PosCharge,
  GuestProfile,
  MaintenanceWorkOrder,
  HotelMetrics,
  DynamicPricingRule,
  ChannelStatus,
  GroupBooking,
  ReviewItem,
  EsgMetric,
  PropertyComparison,
} from './types';

type Notice = { tone: 'success' | 'error'; message: string };
const isPublicBookingLocation = () => window.location.pathname === '/book' || window.location.hash === '#book';

const BookingEngine = lazy(() => import('./components/BookingEngine').then((module) => ({
  default: module.BookingEngine,
})));
const WorkflowStudio = lazy(() => import('./components/WorkflowStudio').then((module) => ({
  default: module.WorkflowStudio,
})));
const PlatformControlCenter = lazy(() => import('./components/PlatformControlCenter').then((module) => ({
  default: module.PlatformControlCenter,
})));
const AccessAdministration = lazy(() => import('./components/AccessAdministration').then((module) => ({
  default: module.AccessAdministration,
})));
const DeveloperPortal = lazy(() => import('./components/DeveloperPortal').then((module) => ({
  default: module.DeveloperPortal,
})));

const ModuleLoading = () => (
  <div className="surface-panel min-h-64 flex flex-col items-center justify-center gap-4 text-sm font-semibold text-gray-400" role="status">
    <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-amber-300 animate-spin" />
    Preparing workspace…
  </div>
);

const FullScreenLoading: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#070b12] text-gray-100 gap-5">
    <div className="w-14 h-14 rounded-2xl bg-[#d6aa50] flex items-center justify-center text-[#090d14] font-black text-xl tracking-tighter shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      N
    </div>
    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium" role="status">
      <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" />
      {label}
    </div>
  </div>
);

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser());
  const [authReady, setAuthReady] = useState(false);
  const [publicBooking, setPublicBooking] = useState(isPublicBookingLocation());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reservationSearch, setReservationSearch] = useState('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const selectedProperty = 'Nexus Luxury Resort & Spa (Main Property)';

  // Live API-backed property state.
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTask[]>([]);
  const [dynamicRules, setDynamicRules] = useState<DynamicPricingRule[]>([]);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [posCharges, setPosCharges] = useState<PosCharge[]>([]);
  const [metrics, setMetrics] = useState<HotelMetrics | null>(null);
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceWorkOrder[]>([]);

  const [groupBookings, setGroupBookings] = useState<GroupBooking[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [esgMetric, setEsgMetric] = useState<EsgMetric | null>(null);
  const [portfolio, setPortfolio] = useState<PropertyComparison[]>([]);

  const [selectedReservationForFolio, setSelectedReservationForFolio] = useState<Reservation | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingRoomNumber, setBookingRoomNumber] = useState<string | undefined>();
  const [bookingStartDate, setBookingStartDate] = useState<string | undefined>();
  const currentRole = currentUser?.role;
  const canReadReservations = ['General Manager', 'Front Desk', 'Finance'].includes(currentRole || '');
  const canReadPricing = ['General Manager', 'Finance'].includes(currentRole || '');
  const canReadChannels = ['General Manager', 'Front Desk', 'Finance'].includes(currentRole || '');
  const canReadPos = ['General Manager', 'Front Desk', 'Finance'].includes(currentRole || '');
  const canReadGuests = ['General Manager', 'Front Desk', 'Finance'].includes(currentRole || '');
  const canReadCommercial = ['General Manager', 'Front Desk'].includes(currentRole || '');
  const canReadPortfolio = ['General Manager', 'Finance'].includes(currentRole || '');

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleExpiredSession = () => setCurrentUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  useEffect(() => {
    const handleLocationChange = () => setPublicBooking(isPublicBookingLocation());
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((user) => { if (active) setCurrentUser(user); })
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  const handleAuthError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      logout();
      setCurrentUser(null);
      setNotice({ tone: 'error', message: 'Your session expired. Please sign in again.' });
      return true;
    }
    return false;
  }, []);

  const perform = useCallback(async (fn: () => Promise<void>, successMessage?: string) => {
    try {
      await fn();
      if (successMessage) setNotice({ tone: 'success', message: successMessage });
      return true;
    } catch (err) {
      if (!handleAuthError(err)) {
        setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Operation failed' });
      }
      return false;
    }
  }, [handleAuthError]);

  const refreshRooms = useCallback(async () => setRooms(await api.get<Room[]>('/rooms')), []);
  const refreshReservations = useCallback(async () => {
    const list = await api.get<Reservation[]>('/reservations');
    setReservations(list);
    setSelectedReservationForFolio((previous) =>
      previous ? list.find((reservation) => reservation.id === previous.id) || null : null,
    );
  }, []);
  const refreshHousekeeping = useCallback(async () => {
    setHousekeepingTasks(await api.get<HousekeepingTask[]>('/housekeeping'));
  }, []);
  const refreshMetrics = useCallback(async () => setMetrics(await api.get<HotelMetrics>('/metrics')), []);

  const refreshOperationalData = useCallback(async () => {
    await Promise.all([
      refreshRooms(),
      ...(canReadReservations ? [refreshReservations()] : []),
      refreshHousekeeping(),
      refreshMetrics(),
    ]);
  }, [canReadReservations, refreshRooms, refreshReservations, refreshHousekeeping, refreshMetrics]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [rms, rez, hk, rules, chs, pos, met, guests, maint, groups, reputation, esg, properties] = await Promise.all([
        api.get<Room[]>('/rooms'),
        canReadReservations ? api.get<Reservation[]>('/reservations') : Promise.resolve([]),
        api.get<HousekeepingTask[]>('/housekeeping'),
        canReadPricing ? api.get<DynamicPricingRule[]>('/pricing-rules') : Promise.resolve([]),
        canReadChannels ? api.get<ChannelStatus[]>('/channels') : Promise.resolve([]),
        canReadPos ? api.get<PosCharge[]>('/pos-charges') : Promise.resolve([]),
        api.get<HotelMetrics>('/metrics'),
        canReadGuests ? api.get<GuestProfile[]>('/guests') : Promise.resolve([]),
        api.get<MaintenanceWorkOrder[]>('/maintenance'),
        canReadCommercial ? api.get<GroupBooking[]>('/groups') : Promise.resolve([]),
        canReadCommercial ? api.get<ReviewItem[]>('/reputation/reviews') : Promise.resolve([]),
        canReadPortfolio ? api.get<EsgMetric>('/esg/metrics') : Promise.resolve(null),
        canReadPortfolio ? api.get<PropertyComparison[]>('/portfolio/properties') : Promise.resolve([]),
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
      setGroupBookings(groups);
      setReviews(reputation);
      setEsgMetric(esg);
      setPortfolio(properties);
    } catch (err) {
      if (!handleAuthError(err)) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load property data');
      }
    } finally {
      setLoading(false);
    }
  }, [canReadChannels, canReadCommercial, canReadGuests, canReadPortfolio, canReadPos, canReadPricing, canReadReservations, handleAuthError]);

  useEffect(() => {
    if (currentUser && !currentUser.mustChangePassword) void loadAll();
  }, [currentUser, loadAll]);

  const handleCheckIn = (reservationId: string) => perform(async () => {
    await api.post(`/reservations/${reservationId}/check-in`);
    await Promise.all([refreshRooms(), refreshReservations(), refreshMetrics()]);
  }, 'Guest checked in and room status updated.');

  const handleCheckOut = (reservationId: string) => perform(async () => {
    try {
      await api.post(`/reservations/${reservationId}/check-out`);
    } finally {
      // Checkout may post missing room nights and then return 409 while the
      // guest settles the updated folio, so refresh after both outcomes.
      await refreshOperationalData();
    }
  }, 'Guest checked out and a housekeeping task was created.');

  const handleCancelReservation = (reservationId: string) => perform(async () => {
    await api.post(`/reservations/${reservationId}/cancel`);
    await Promise.all([refreshReservations(), refreshRooms(), refreshMetrics()]);
  }, 'Reservation cancelled, local folio reversed, and room inventory released.');

  const handleNoShowReservation = (reservationId: string) => perform(async () => {
    await api.post(`/reservations/${reservationId}/no-show`);
    await Promise.all([refreshReservations(), refreshRooms(), refreshMetrics()]);
  }, 'Reservation marked No-Show, local folio reversed, and room inventory released.');

  const handleCompleteHousekeepingTask = (taskId: string) => perform(async () => {
    await api.patch(`/housekeeping/${taskId}`, { status: 'Completed' });
    await Promise.all([refreshHousekeeping(), refreshRooms(), refreshMetrics()]);
  }, 'Housekeeping task completed.');

  const handleUpdateRoomStatus = (roomNumber: string, status: Room['status']) => perform(async () => {
    const activeCleaningTask = status === 'Vacant Clean'
      ? housekeepingTasks.find((task) => task.roomNumber === roomNumber
        && task.taskType !== 'Maintenance Inspect'
        && ['Pending', 'In-Progress'].includes(task.status))
      : undefined;
    if (activeCleaningTask) {
      await api.patch(`/housekeeping/${activeCleaningTask.id}`, { status: 'Completed' });
    } else {
      await api.patch(`/rooms/${roomNumber}`, { status });
    }
    await Promise.all([refreshHousekeeping(), refreshRooms(), refreshMetrics()]);
  }, `Room ${roomNumber} marked ${status}.`);

  const handleSaveNewReservation = (newReservation: Reservation) => perform(async () => {
    const paymentAmount = -newReservation.folioItems
      .filter((item) => item.category === 'Payment')
      .reduce((sum, item) => sum + item.amount, 0);
    await api.post('/reservations', {
      guestName: newReservation.guestName,
      guestEmail: newReservation.guestEmail,
      guestPhone: newReservation.guestPhone,
      vipTier: newReservation.vipTier,
      roomNumber: newReservation.roomNumber,
      roomType: newReservation.roomType,
      checkIn: newReservation.checkIn,
      checkOut: newReservation.checkOut,
      guestsCount: newReservation.guestsCount,
      channel: newReservation.channel,
      totalAmount: newReservation.totalAmount,
      paymentAmount,
      specialRequests: newReservation.specialRequests,
    });
    await Promise.all([refreshReservations(), refreshRooms(), refreshMetrics()]);
    setIsBookingModalOpen(false);
  }, `Reservation created for ${newReservation.guestName}.`);

  const handleAddFolioItem = (reservationId: string, item: FolioItem) => perform(async () => {
    const updated = await api.post<Reservation>(`/reservations/${reservationId}/folio-items`, {
      description: item.description,
      category: item.category,
      amount: item.amount,
    });
    setReservations((previous) => previous.map((reservation) => (
      reservation.id === reservationId ? updated : reservation
    )));
    setSelectedReservationForFolio((previous) => (
      previous?.id === reservationId ? updated : previous
    ));
    await refreshMetrics();
  }, 'Folio entry posted.');

  const handleAddPosCharge = (charge: PosCharge) => perform(async () => {
    await api.post('/pos-charges', {
      requestId: charge.id,
      roomNumber: charge.roomNumber,
      outlet: charge.outlet,
      items: charge.items,
    });
    const [updatedCharges] = await Promise.all([
      api.get<PosCharge[]>('/pos-charges'),
      refreshReservations(),
      refreshMetrics(),
    ]);
    setPosCharges(updatedCharges);
  }, 'POS charge posted to the in-house folio.');

  const handleAddMaintenanceOrder = (order: MaintenanceWorkOrder) => perform(async () => {
    await api.post('/maintenance', {
      requestId: order.id,
      roomNumber: order.roomNumber,
      issueDescription: order.issueDescription,
      category: order.category,
      priority: order.priority,
      reportedBy: order.reportedBy,
      assignedEngineer: order.assignedEngineer,
      slaMinutes: order.slaMinutes,
      safetyCritical: order.safetyCritical,
    });
    setMaintenanceOrders(await api.get<MaintenanceWorkOrder[]>('/maintenance'));
  }, `Maintenance work order opened for room ${order.roomNumber}.`);

  const handleResolveMaintenanceOrder = (orderId: string) => perform(async () => {
    const updated = await api.patch<MaintenanceWorkOrder>(`/maintenance/${orderId}/resolve`);
    setMaintenanceOrders((previous) => previous.map((order) => order.id === orderId ? updated : order));
  }, 'Maintenance work order resolved.');

  const handleToggleAutoApply = (ruleId: string) => perform(async () => {
    const rule = dynamicRules.find((candidate) => candidate.id === ruleId);
    if (!rule) return;
    const updated = await api.patch<DynamicPricingRule>(`/pricing-rules/${ruleId}`, {
      autoApply: !rule.autoApply,
    });
    setDynamicRules((previous) => previous.map((candidate) => candidate.id === ruleId ? updated : candidate));
  });

  const handleApplyRecommendedRate = (ruleId: string) => perform(async () => {
    const targetRule = dynamicRules.find((rule) => rule.id === ruleId);
    if (!targetRule) return;
    await api.post(`/pricing-rules/${ruleId}/apply`);
    await refreshRooms();
  }, 'Recommended rates applied to available inventory.');

  const handleTriggerSync = (channelId: string) => perform(async () => {
    setChannels(await api.post<ChannelStatus[]>('/channels/sync', { id: channelId }));
  }, channelId === 'all' ? 'All demo sync timestamps updated.' : 'Demo sync timestamp updated.');

  const handleRunNightAudit = () => perform(async () => {
    const summary = await api.post<{
      foliosPosted: number;
      foliosSkipped?: number;
      totalRoomRevenue: number;
    }>('/night-audit');
    await Promise.all([refreshReservations(), refreshMetrics()]);
    setNotice({
      tone: 'success',
      message: `Night audit complete: ${summary.foliosPosted} folio(s) posted, ${summary.foliosSkipped || 0} already posted, $${summary.totalRoomRevenue.toFixed(2)} revenue.`,
    });
  });

  const handleAddGroup = (group: GroupBooking) => perform(async () => {
    const created = await api.post<GroupBooking>('/groups', {
      propertyId: 'prop-main',
      groupName: group.groupName,
      companyName: group.companyName,
      contactPerson: group.contactPerson,
      contactEmail: group.contactEmail,
      roomsAllocated: group.roomsAllocated,
      startDate: group.startDate,
      endDate: group.endDate,
      releaseDate: group.releaseDate,
      status: group.status,
      groupRate: group.groupRate,
      banquetCateringTotal: group.banquetCateringTotal,
    });
    setGroupBookings((previous) => [created, ...previous]);
  }, `Group block created for ${group.groupName}.`);

  const handleRespondToReview = (reviewId: string, responseText: string) => perform(async () => {
    const updated = await api.post<ReviewItem>(`/reputation/reviews/${reviewId}/respond`, { responseText });
    setReviews((previous) => previous.map((review) => review.id === reviewId ? updated : review));
  }, 'Response saved. It will publish after a review-platform connector is configured.');

  const handleHvacSetback = () => perform(async () => {
    await api.post('/esg/actions/hvac-setback', { target: 'Eligible vacant rooms' });
  }, 'HVAC setback request queued. Device execution awaits a building-management connector.');

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Local cleanup still signs out if the server is unavailable.
    } finally {
      logout();
      setCurrentUser(null);
      setMetrics(null);
    }
  };

  if (publicBooking) {
    return (
      <div className="min-h-screen bg-[#070b12] p-3 sm:p-6 lg:p-8">
        <Suspense fallback={<ModuleLoading />}>
          <BookingEngine
            propertyName="Nexus Luxury Resort & Spa"
            locationLabel="Copenhagen, Denmark"
            onExit={() => {
              window.history.pushState({}, '', '/');
              setPublicBooking(false);
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (!authReady) {
    return <FullScreenLoading label="Restoring your secure session" />;
  }

  if (!currentUser) {
    return <LoginScreen
      onBookStay={() => {
        window.history.pushState({}, '', '/book');
        setPublicBooking(true);
      }}
      onLogin={(user) => {
        setActiveTab('overview');
        setCurrentUser(user);
      }}
    />;
  }

  if (currentUser.mustChangePassword) {
    return (
      <ChangePasswordScreen
        user={currentUser}
        onChanged={setCurrentUser}
        onLogout={() => { void handleLogout(); }}
      />
    );
  }

  if (loading && !metrics) {
    return <FullScreenLoading label="Loading live property data" />;
  }

  if (loadError && !metrics) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070b12] text-gray-100 gap-5 p-6">
        <div className="surface-panel max-w-lg p-8 text-center">
          <p className="text-lg font-semibold text-gray-100">We could not load the property workspace</p>
          <p className="mt-2 text-sm text-rose-300" role="alert">{loadError}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void loadAll()} className="btn-primary">Retry</button>
          <button onClick={() => void handleLogout()} className="btn-secondary">Sign out</button>
        </div>
      </div>
    );
  }

  const pendingArrivalsCount = reservations.filter((reservation) => reservation.status === 'Confirmed').length;
  const dirtyRoomsCount = rooms.filter((room) => room.status === 'Vacant Dirty').length;
  const canManageReservations = ['General Manager', 'Front Desk'].includes(currentUser.role);

  return (
    <div className="app-shell min-h-screen flex flex-col text-gray-100">
      {metrics && (
        <Navbar
          metrics={metrics}
          onOpenNewBooking={() => {
            setBookingRoomNumber(undefined);
            setBookingStartDate(undefined);
            setIsBookingModalOpen(true);
          }}
          onRunNightAudit={handleRunNightAudit}
          onSearch={(query) => {
            setReservationSearch(query);
            setActiveTab('reservations');
          }}
          onLogout={handleLogout}
          selectedProperty={selectedProperty}
          userName={currentUser.name}
          userRole={currentUser.role}
        />
      )}

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`fixed right-5 top-24 z-50 max-w-md rounded-xl border px-4 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
            notice.tone === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/95 border-rose-500/40 text-rose-200'
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="workspace-frame flex flex-1 flex-col md:flex-row">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingArrivalsCount={pendingArrivalsCount}
          dirtyRoomsCount={dirtyRoomsCount}
          userRole={currentUser.role}
        />

        <main className="workspace-main flex-1 w-full" data-workspace={activeTab}>
          <div className="workspace-view">
          {activeTab === 'overview' && metrics && (
            <OperationsOverview
              userName={currentUser.name}
              userRole={currentUser.role}
              metrics={metrics}
              rooms={rooms}
              reservations={reservations}
              housekeepingTasks={housekeepingTasks}
              maintenanceOrders={maintenanceOrders}
              onNavigate={setActiveTab}
              onOpenNewBooking={() => {
                setBookingRoomNumber(undefined);
                setBookingStartDate(undefined);
                setIsBookingModalOpen(true);
              }}
              onSearchReservations={() => {
                setReservationSearch('');
                setActiveTab('reservations');
              }}
            />
          )}

          {activeTab === 'tape-chart' && (
            <TapeChart
              rooms={rooms}
              reservations={reservations}
              onSelectReservation={setSelectedReservationForFolio}
              onOpenNewBooking={(roomNumber, startDate) => {
                setBookingRoomNumber(roomNumber);
                setBookingStartDate(startDate);
                setIsBookingModalOpen(true);
              }}
              canCreateReservation={canManageReservations}
              businessDate={metrics?.businessDate}
            />
          )}

          {activeTab === 'staff-copilot' && (
            <StaffCopilot
              onDataChanged={refreshOperationalData}
              onNavigate={setActiveTab}
              userName={currentUser.name}
              userRole={currentUser.role}
            />
          )}

          {activeTab === 'workflow-studio' && (
            <Suspense fallback={<ModuleLoading />}><WorkflowStudio /></Suspense>
          )}

          {activeTab === 'platform-control' && (
            <Suspense fallback={<ModuleLoading />}>
              <PlatformControlCenter user={currentUser} />
            </Suspense>
          )}

          {activeTab === 'access-admin' && (
            <Suspense fallback={<ModuleLoading />}>
              <AccessAdministration user={currentUser} />
            </Suspense>
          )}

          {activeTab === 'developer-portal' && (
            <Suspense fallback={<ModuleLoading />}><DeveloperPortal /></Suspense>
          )}

          {activeTab === 'guest-cdp' && <GuestCdp profiles={guestProfiles} />}

          {activeTab === 'groups' && (
            <GroupBookingBoard groups={groupBookings} onAddGroup={handleAddGroup} />
          )}

          {activeTab === 'reputation' && (
            <ReputationBoard
              reviews={reviews}
              onRespondToReview={handleRespondToReview}
            />
          )}

          {activeTab === 'reservations' && (
            <ReservationsList
              reservations={reservations}
              onSelectReservation={setSelectedReservationForFolio}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onCancel={handleCancelReservation}
              onNoShow={handleNoShowReservation}
              onOpenNewBooking={() => {
                setBookingRoomNumber(undefined);
                setBookingStartDate(undefined);
                setIsBookingModalOpen(true);
              }}
              initialSearchTerm={reservationSearch}
              canManageReservations={canManageReservations}
              businessDate={metrics?.businessDate}
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

          {activeTab === 'esg' && esgMetric && (
            <EsgDashboard metric={esgMetric} onTriggerHvacSetback={() => { void handleHvacSetback(); }} />
          )}

          {activeTab === 'multi-property' && (
            <MultiPropertyAnalytics properties={portfolio} />
          )}

          {activeTab === 'migration' && (
            <MigrationWizard onCommitImport={(count) => {
              setNotice({ tone: 'success', message: `${count} guest contracts validated for import.` });
            }} />
          )}

          {activeTab === 'guest-portal' && <GuestPortalSimulator />}

          {activeTab === 'ai-revenue' && (
            <AiRevenueManager
              rules={dynamicRules}
              onToggleAutoApply={handleToggleAutoApply}
              onApplyRecommendedRate={handleApplyRecommendedRate}
            />
          )}

          {activeTab === 'channel-manager' && (
            <ChannelManager channels={channels} onTriggerSync={handleTriggerSync} />
          )}

          {activeTab === 'pos-charges' && (
            <PosPosting
              charges={posCharges}
              rooms={rooms}
              reservations={reservations}
              onAddPosCharge={handleAddPosCharge}
            />
          )}

          {activeTab === 'analytics' && metrics && (
            <FinancialAnalytics metrics={metrics} onRunNightAudit={handleRunNightAudit} />
          )}

          {activeTab === 'accounting' && (
            <AccountingDashboard
              metrics={metrics}
              onDataChanged={async () => {
                await Promise.all([refreshReservations(), refreshMetrics()]);
              }}
            />
          )}

          {activeTab === 'procurement' && <ProcurementBoard />}
          {activeTab === 'hr' && <HrBoard />}
          </div>
        </main>
      </div>

      {isBookingModalOpen && (
        <BookingModal
          rooms={rooms}
          reservations={reservations}
          initialRoomNumber={bookingRoomNumber}
          initialCheckIn={bookingStartDate}
          businessDate={metrics?.businessDate}
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
