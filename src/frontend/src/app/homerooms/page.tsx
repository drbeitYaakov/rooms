"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface Homeroom {
  id: number;
  room_id: string;
  grade_id?: string;
  grade_name: string;
  class_number: number;
  teacher_name?: string;
  teacher_email?: string;
  room_number: string;
  room_type: string;
  max_students: number;
  current_students: number;
  school_year: string;
  is_active: boolean;
  display_name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface RoomOption {
  id: string;
  room_number: string;
  room_type?: string;
}

interface ActiveAcademicYear {
  id: string;
  year_name: string;
  start_date: string;
  end_date: string;
  school_year_label: string | null;
}

interface AcademicYearOption {
  id: string;
  year_name: string;
  school_year_label: string | null;
  is_active: boolean;
  is_archived: boolean;
}

interface HistoricalSchoolYearOption {
  label: string;
  is_active: boolean;
}

interface HistoricalHomeroom extends Homeroom {
  assignment_summary: {
    total_assignments: number;
    active_assignments: number;
    first_assignment_date: string | null;
    last_assignment_date: string | null;
  };
}

interface HistoricalAssignment {
  id: string;
  room_id: string;
  room_number?: string;
  activity_type: string;
  date: string | null;
  start_date: string | null;
  start_time: string;
  end_time: string;
  status: string;
  is_manual: boolean;
  created_at: string;
}

interface DefaultSetting {
  id: string;
  grade_id: string | null;
  grade_name?: string | null;
  homeroom_id: number | null;
  homeroom_name?: string | null;
  effective_from: string;
  weekly_schedule: Array<{
    day_of_week: number;
    is_active: boolean;
    start_time: string | null;
    end_time: string | null;
  }>;
  start_time?: string;
  end_time?: string;
}

interface DefaultSettingsData {
  system_default: {
    start_time: string;
    end_time: string;
    weekly_schedule: Array<{
      day_of_week: number;
      is_active: boolean;
      start_time: string | null;
      end_time: string | null;
    }>;
  };
  grades: Grade[];
  homerooms: Array<{ id: number; display_name: string; room_number: string }>;
  grade_defaults: DefaultSetting[];
  homeroom_overrides: DefaultSetting[];
}

interface WeeklyFormSlot {
  day_of_week: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface GradeFormState {
  grade_id: string;
  effective_from: string;
  weekly_schedule: WeeklyFormSlot[];
}

interface HomeroomFormState {
  homeroom_id: string;
  effective_from: string;
  weekly_schedule: WeeklyFormSlot[];
}

type TabKey = "homerooms" | "fixed-times" | "history";

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dayLabels: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
};

const buildDefaultWeeklySchedule = () =>
  [0, 1, 2, 3, 4, 5].map((day) => ({
    day_of_week: day,
    is_active: true,
    start_time: "08:00",
    end_time: "14:40",
  }));

const normalizeWeeklyScheduleForForm = (
  weeklySchedule?: Array<{ day_of_week: number; is_active: boolean; start_time: string | null; end_time: string | null }>
) => {
  const base = buildDefaultWeeklySchedule();
  const byDay = new Map((weeklySchedule || []).map((slot) => [slot.day_of_week, slot]));
  return base.map((slot) => byDay.get(slot.day_of_week) || slot);
};

const getLatestSettingForGrade = (
  gradeId: string,
  defaultsData: DefaultSettingsData | null
) => {
  if (!defaultsData || !gradeId) {
    return null;
  }

  return defaultsData.grade_defaults.find((setting) => setting.grade_id === gradeId) || null;
};

const getLatestSettingForHomeroom = (
  homeroomId: string,
  defaultsData: DefaultSettingsData | null
) => {
  if (!defaultsData || !homeroomId) {
    return null;
  }

  return defaultsData.homeroom_overrides.find((setting) => String(setting.homeroom_id) === homeroomId) || null;
};

export default function HomeroomsPage() {
  const { data: session } = useSession();
  const canManage = session?.user?.role === "admin" || session?.user?.role === "grade_coordinator";
  const [activeTab, setActiveTab] = useState<TabKey>("homerooms");
  const [loading, setLoading] = useState(true);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [homerooms, setHomerooms] = useState<Homeroom[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [defaultsData, setDefaultsData] = useState<DefaultSettingsData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [editingHomeroom, setEditingHomeroom] = useState<Homeroom | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedClassNumber, setSelectedClassNumber] = useState("");
  const [filteredRooms, setFilteredRooms] = useState<any[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [activeAcademicYear, setActiveAcademicYear] = useState<ActiveAcademicYear | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [historySchoolYears, setHistorySchoolYears] = useState<HistoricalSchoolYearOption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState(false);
  const [selectedHistorySchoolYear, setSelectedHistorySchoolYear] = useState("");
  const [historicalHomerooms, setHistoricalHomerooms] = useState<HistoricalHomeroom[]>([]);
  const [selectedHistoricalHomeroom, setSelectedHistoricalHomeroom] = useState<HistoricalHomeroom | null>(null);
  const [historicalAssignments, setHistoricalAssignments] = useState<HistoricalAssignment[]>([]);
  const [swapSelections, setSwapSelections] = useState<Record<number, { selected: boolean; room_id: string }>>({});
  const [gradeForm, setGradeForm] = useState<GradeFormState>({ grade_id: "", effective_from: getToday(), weekly_schedule: buildDefaultWeeklySchedule() });
  const [homeroomForm, setHomeroomForm] = useState<HomeroomFormState>({ homeroom_id: "", effective_from: getToday(), weekly_schedule: buildDefaultWeeklySchedule() });

  useEffect(() => {
    void Promise.all([loadActiveAcademicYear(), loadAcademicYears(), loadHistorySchoolYears(), loadHomerooms(), loadGrades(), loadDefaults()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedHistorySchoolYear) {
      return;
    }

    setSelectedHistoricalHomeroom(null);
    setHistoricalAssignments([]);
    void loadHistoricalHomerooms(selectedHistorySchoolYear);
  }, [selectedHistorySchoolYear]);

  useEffect(() => {
    if (!defaultsData || !gradeForm.grade_id) {
      return;
    }

    const currentSetting = getLatestSettingForGrade(gradeForm.grade_id, defaultsData);
    setGradeForm((current) => ({
      ...current,
      effective_from: currentSetting?.effective_from || getToday(),
      weekly_schedule: normalizeWeeklyScheduleForForm(
        currentSetting?.weekly_schedule || defaultsData.system_default.weekly_schedule
      ),
    }));
  }, [gradeForm.grade_id, defaultsData]);

  useEffect(() => {
    if (!defaultsData || !homeroomForm.homeroom_id) {
      return;
    }

    const homeroomSetting = getLatestSettingForHomeroom(homeroomForm.homeroom_id, defaultsData);
    const gradeMeta = homerooms.find(
      (homeroom) => String(homeroom.id) === homeroomForm.homeroom_id
    );
    const gradeSetting = gradeMeta?.grade_id
      ? getLatestSettingForGrade(gradeMeta.grade_id, defaultsData)
      : null;
    const fallbackSchedule =
      homeroomSetting?.weekly_schedule ||
      gradeSetting?.weekly_schedule ||
      defaultsData.system_default.weekly_schedule;
    const fallbackEffectiveFrom =
      homeroomSetting?.effective_from ||
      gradeSetting?.effective_from ||
      getToday();

    setHomeroomForm((current) => ({
      ...current,
      effective_from: fallbackEffectiveFrom,
      weekly_schedule: normalizeWeeklyScheduleForForm(fallbackSchedule),
    }));
  }, [homeroomForm.homeroom_id, defaultsData, homerooms]);

  useEffect(() => {
    if (grades.length === 0 && defaultsData?.grades?.length) {
      setGrades(defaultsData.grades);
    }
  }, [defaultsData, grades.length]);

  const getSchoolYearLabel = () => activeAcademicYear?.school_year_label || activeAcademicYear?.year_name || "";

  const loadActiveAcademicYear = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/academic-years/active");
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "failed");
    }
    const nextActiveYear = data.data.academic_year || null;
    setActiveAcademicYear(nextActiveYear);
    setHistorySchoolYears((current) =>
      current.map((item) => ({
        ...item,
        is_active: item.label === (nextActiveYear?.school_year_label || nextActiveYear?.year_name || ""),
      }))
    );
    setSelectedHistorySchoolYear((current) => current || nextActiveYear?.school_year_label || nextActiveYear?.year_name || "");
  };

  const loadAcademicYears = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/academic-years");
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "failed");
    }
    setAcademicYears(data.data.academic_years || []);
  };

  const loadHistorySchoolYears = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/homerooms/history/school-years");
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "failed");
    }

    const activeLabel = activeAcademicYear?.school_year_label || activeAcademicYear?.year_name || "";
    const years = (data.data.school_years || []).map((label: string) => ({
      label,
      is_active: label === activeLabel,
    }));
    setHistorySchoolYears(years);
  };

  const loadHomerooms = async () => {
    let schoolYearLabel = getSchoolYearLabel();
    if (!schoolYearLabel) {
      const yearResponse = await authenticatedFetch("http://localhost:3001/api/academic-years/active");
      const yearData = await yearResponse.json();
      if (yearData.success) {
        const nextActiveYear = yearData.data.academic_year || null;
        setActiveAcademicYear(nextActiveYear);
        schoolYearLabel = nextActiveYear?.school_year_label || nextActiveYear?.year_name || "";
      }
    }
    const response = await authenticatedFetch(
      schoolYearLabel
        ? `http://localhost:3001/api/homerooms?school_year=${encodeURIComponent(schoolYearLabel)}`
        : "http://localhost:3001/api/homerooms"
    );
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "failed");
    setHomerooms(data.data.homerooms);
  };

  const loadHistoricalHomerooms = async (schoolYear: string) => {
    try {
      setHistoryLoading(true);
      const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/history?school_year=${encodeURIComponent(schoolYear)}`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "failed");
      }

      const nextHomerooms = data.data.homerooms || [];
      setHistoricalHomerooms(nextHomerooms);
      const firstHomeroom = nextHomerooms[0] || null;
      setSelectedHistoricalHomeroom(firstHomeroom);
      setHistoricalAssignments([]);

      if (firstHomeroom) {
        await loadHistoricalAssignments(firstHomeroom, schoolYear);
      }
    } catch (error) {
      console.error("Error loading historical homerooms:", error);
      alert("שגיאה בטעינת היסטוריית כיתות האם");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoricalAssignments = async (homeroom: HistoricalHomeroom, schoolYearOverride?: string) => {
    try {
      setHistoryDetailsLoading(true);
      const schoolYear = schoolYearOverride || selectedHistorySchoolYear;
      const response = await authenticatedFetch(
        `http://localhost:3001/api/homerooms/history/${homeroom.id}/assignments?school_year=${encodeURIComponent(schoolYear)}`
      );
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "failed");
      }
      setSelectedHistoricalHomeroom(data.data.homeroom);
      setHistoricalAssignments(data.data.assignments || []);
    } catch (error) {
      console.error("Error loading historical assignments:", error);
      alert("שגיאה בטעינת היסטוריית השיבוצים");
    } finally {
      setHistoryDetailsLoading(false);
    }
  };

  const loadGrades = async () => {
    try {
      const response = await authenticatedFetch("http://localhost:3001/api/grades");
      const data = await response.json();
      if (Array.isArray(data)) {
        setGrades(data);
        return;
      }
      if (data.success && data.data?.grades) {
        setGrades(data.data.grades);
        return;
      }
    } catch (error) {
      console.error("Primary grades endpoint failed:", error);
    }

    try {
      const response = await authenticatedFetch("http://localhost:3001/api/homerooms/grades");
      const data = await response.json();
      if (data.success && Array.isArray(data.data?.grades)) {
        setGrades(data.data.grades);
        return;
      }
    } catch (error) {
      console.error("Homerooms grades endpoint failed:", error);
    }

    if (defaultsData?.grades?.length) {
      setGrades(defaultsData.grades);
      return;
    }

    throw new Error("failed to load grades");
  };

  const loadDefaults = async () => {
    try {
      setDefaultsLoading(true);
      const response = await authenticatedFetch("http://localhost:3001/api/homerooms/default-settings");
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "failed");
      setDefaultsData(data.data);
      setGradeForm((current) => ({ ...current, weekly_schedule: normalizeWeeklyScheduleForForm(data.data.system_default.weekly_schedule) }));
      setHomeroomForm((current) => ({ ...current, weekly_schedule: normalizeWeeklyScheduleForForm(data.data.system_default.weekly_schedule) }));
    } finally {
      setDefaultsLoading(false);
    }
  };

  const loadRooms = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/rooms");
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "failed");
    }
    setRooms(data.data.rooms || []);
  };

  const loadFilteredRooms = async (gradeId: string) => {
    if (!gradeId) {
      setFilteredRooms([]);
      return;
    }
    const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/available-rooms?grade_id=${gradeId}&school_year=${encodeURIComponent(getSchoolYearLabel())}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "failed");
    setFilteredRooms(data.data.available_rooms);
  };

  const updateGradeDay = (dayOfWeek: number, field: "start_time" | "end_time", value: string) => {
    setGradeForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const toggleGradeDayActive = (dayOfWeek: number, isActive: boolean) => {
    setGradeForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek
          ? {
              ...slot,
              is_active: isActive,
              start_time: isActive ? (slot.start_time || "08:00") : null,
              end_time: isActive ? (slot.end_time || "14:40") : null,
            }
          : slot
      ),
    }));
  };

  const updateHomeroomDay = (dayOfWeek: number, field: "start_time" | "end_time", value: string) => {
    setHomeroomForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const toggleHomeroomDayActive = (dayOfWeek: number, isActive: boolean) => {
    setHomeroomForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek
          ? {
              ...slot,
              is_active: isActive,
              start_time: isActive ? (slot.start_time || "08:00") : null,
              end_time: isActive ? (slot.end_time || "14:40") : null,
            }
          : slot
      ),
    }));
  };

  const resetModal = () => {
    setShowAddModal(false);
    setEditingHomeroom(null);
    setSelectedGrade("");
    setSelectedRoom("");
    setSelectedClassNumber("");
    setFilteredRooms([]);
  };

  const openSwapModal = async () => {
    if (rooms.length === 0) {
      await loadRooms();
    }

    setSwapSelections(
      Object.fromEntries(
        homerooms.map((homeroom) => [
          homeroom.id,
          { selected: false, room_id: homeroom.room_id }
        ])
      )
    );
    setShowSwapModal(true);
  };

  const handleSwapSelectionChange = (homeroomId: number, patch: Partial<{ selected: boolean; room_id: string }>) => {
    setSwapSelections((current) => ({
      ...current,
      [homeroomId]: {
        ...(current[homeroomId] || { selected: false, room_id: "" }),
        ...patch
      }
    }));
  };

  const handleSwapRooms = async () => {
    const swaps = homerooms
      .map((homeroom) => ({
        homeroom_id: homeroom.id,
        current_room_id: homeroom.room_id,
        selected: swapSelections[homeroom.id]?.selected,
        room_id: swapSelections[homeroom.id]?.room_id || homeroom.room_id
      }))
      .filter((swap) => swap.selected && swap.room_id && swap.room_id !== swap.current_room_id)
      .map(({ homeroom_id, room_id }) => ({ homeroom_id, room_id }));

    if (swaps.length === 0) {
      alert("יש לבחור לפחות כיתה אחת עם חדר יעד שונה");
      return;
    }

    const response = await authenticatedFetch("http://localhost:3001/api/homerooms/swap-rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swaps }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }

    setShowSwapModal(false);
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const handleAddHomeroom = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/homerooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: selectedRoom,
        grade_id: selectedGrade,
        class_number: parseInt(selectedClassNumber, 10),
        max_students: 35,
        school_year: getSchoolYearLabel(),
      }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    resetModal();
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const handleUpdateHomeroom = async () => {
    if (!editingHomeroom) return;
    const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${editingHomeroom.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: selectedRoom,
        grade_id: selectedGrade,
        class_number: parseInt(selectedClassNumber || String(editingHomeroom.class_number), 10),
        max_students: editingHomeroom.max_students,
        school_year: editingHomeroom.school_year,
      }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    resetModal();
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const deleteHomeroomRequest = async (id: number) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק כיתת אם זו?")) return;
    const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const handleDeleteHomeroom = async (id: number) => {
    const confirmed = confirm(
      "מחיקת כיתת האם תמחוק גם את כל השיבוצים הקבועים ששייכים אליה. שיבוצים אחרים של החדר לא יימחקו. האם להמשיך?"
    );

    if (!confirmed) {
      return;
    }

    const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!data.success) {
      alert(`׳©׳’׳™׳׳”: ${data.error}`);
      return;
    }
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const handleAssignTeacher = async (id: number) => {
    const teacherId = prompt("מזהה מורה:");
    if (!teacherId) return;
    const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${id}/assign-teacher`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_id: teacherId }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    await loadHomerooms();
  };

  const handleUtilizationReport = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/homerooms/utilization-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", include_details: true }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה בייצוא דוח: ${data.error}`);
      return;
    }

    let csvContent = "\uFEFF";
    csvContent += "שם כיתה,חדר,תכולה,תלמידים נוכחיים,ניצולת (%),מורה,סטטוס\n";
    homerooms.forEach((homeroom) => {
      const utilization = homeroom.max_students > 0 ? Math.round((homeroom.current_students / homeroom.max_students) * 100) : 0;
      csvContent += `"${homeroom.display_name}","${homeroom.room_number}",${homeroom.max_students},${homeroom.current_students},${utilization}%,"${homeroom.teacher_name || "לא הוקצה"}","${homeroom.is_active ? "פעילה" : "לא פעילה"}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `homerooms_utilization_${getToday()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const saveGradeDefault = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/homerooms/default-settings/grade", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gradeForm),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const saveHomeroomOverride = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/homerooms/default-settings/homeroom", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...homeroomForm, homeroom_id: Number(homeroomForm.homeroom_id) }),
    });
    const data = await response.json();
    if (!data.success) {
      alert(`שגיאה: ${data.error}`);
      return;
    }
    await Promise.all([loadHomerooms(), loadDefaults()]);
  };

  const totalCapacity = useMemo(() => homerooms.reduce((sum, item) => sum + item.max_students, 0), [homerooms]);
  const totalStudents = useMemo(() => homerooms.reduce((sum, item) => sum + item.current_students, 0), [homerooms]);
  const availableGrades = grades.length > 0 ? grades : (defaultsData?.grades || []);
  const historyTotalAssignments = useMemo(
    () => historicalHomerooms.reduce((sum, item) => sum + item.assignment_summary.total_assignments, 0),
    [historicalHomerooms]
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-lg text-gray-600">טוען...</div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ניהול כיתות אם ושכבות</h1>
              <p className="text-gray-600">צפייה, ניהול והגדרת זמנים קבועים לכיתות אם</p>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">כל כיתות האם</div><div className="mt-2 text-2xl font-semibold">{homerooms.length}</div></div>
              <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">מורים מוקצים</div><div className="mt-2 text-2xl font-semibold">{homerooms.filter((h) => h.teacher_name).length}</div></div>
              <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">ניצולת מקומות</div><div className="mt-2 text-2xl font-semibold">{totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0}%</div></div>
            </div>

            <div className="mb-6 rounded-lg bg-white p-2 shadow">
              <div className="flex gap-2">
                <button onClick={() => setActiveTab("homerooms")} className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === "homerooms" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>כיתות אם</button>
                <button onClick={() => setActiveTab("fixed-times")} className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === "fixed-times" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>זמנים קבועים</button>
                <button onClick={() => setActiveTab("history")} className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === "history" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`}>היסטוריית שנים</button>
              </div>
            </div>

            {activeTab === "homerooms" ? (
              <>
                {canManage && (
                  <div className="mb-6 rounded-lg bg-white p-6 shadow">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <button onClick={() => void openSwapModal()} className="rounded-md bg-amber-600 px-4 py-3 text-sm font-medium text-white">החלפת חדרים</button>
                      <button onClick={() => setShowAddModal(true)} className="rounded-md bg-indigo-600 px-4 py-3 text-sm font-medium text-white">הוסף כיתת אם</button>
                      <button onClick={() => { window.location.href = "/grades"; }} className="rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white">ניהול שכבות</button>
                      <button onClick={() => void handleUtilizationReport()} className="rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white">דוח תפוסה</button>
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-lg bg-white shadow">
                  <div className="px-4 py-5 sm:p-6"><h2 className="text-lg font-medium text-gray-900">רשימת כיתות אם</h2></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">כיתה</th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">חדר</th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">מורה</th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">תלמידים</th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {homerooms.map((homeroom) => (
                          <tr key={homeroom.id}>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{homeroom.display_name}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{homeroom.room_number}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{homeroom.teacher_name || "לא הוקצה"}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{homeroom.current_students}/{homeroom.max_students}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                              {canManage && (
                                <div className="flex gap-3">
                                  {!homeroom.teacher_name && <button onClick={() => void handleAssignTeacher(homeroom.id)} className="text-blue-600">הקצה מורה</button>}
                                  <button onClick={async () => {
                                    setEditingHomeroom(homeroom);
                                    setSelectedGrade(homeroom.grade_id || "");
                                    setSelectedRoom(String(homeroom.room_id));
                                    setSelectedClassNumber(String(homeroom.class_number));
                                    setShowAddModal(true);
                                    if (homeroom.grade_id) await loadFilteredRooms(homeroom.grade_id);
                                  }} className="text-indigo-600">ערוך</button>
                                  <button onClick={() => void handleDeleteHomeroom(homeroom.id)} className="text-red-600">מחק</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : activeTab === "fixed-times" ? (
              <div className="space-y-6">
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                  ברירת המחדל הכללית נשארת לפי לוח שבועי קבוע, ובבסיס כל יום מוגדר 08:00-14:40.
                  הגדרת שכבה גוברת על ברירת המערכת, והגדרה פרטית לכיתה גוברת על הגדרת השכבה.
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-lg bg-white p-6 shadow">
                    <h3 className="text-lg font-medium text-gray-900">ברירת מחדל לשכבה</h3>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <select value={gradeForm.grade_id} onChange={(e) => setGradeForm((current) => ({ ...current, grade_id: e.target.value }))} className="rounded-md border border-gray-300 px-3 py-2">
                        <option value="">בחר שכבה</option>
                        {availableGrades.map((grade) => <option key={grade.id} value={grade.id}>שכבה {grade.name}</option>)}
                      </select>
                      <input type="date" value={gradeForm.effective_from} onChange={(e) => setGradeForm((current) => ({ ...current, effective_from: e.target.value }))} className="rounded-md border border-gray-300 px-3 py-2" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {gradeForm.weekly_schedule.map((slot) => (
                        <div key={slot.day_of_week} className="grid grid-cols-3 items-center gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={slot.is_active} onChange={(e) => toggleGradeDayActive(slot.day_of_week, e.target.checked)} />
                            {dayLabels[slot.day_of_week]}
                          </label>
                          <input type="time" value={slot.start_time || ""} onChange={(e) => updateGradeDay(slot.day_of_week, "start_time", e.target.value)} disabled={!slot.is_active} className="rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                          <input type="time" value={slot.end_time || ""} onChange={(e) => updateGradeDay(slot.day_of_week, "end_time", e.target.value)} disabled={!slot.is_active} className="rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                        </div>
                      ))}
                    </div>
                    {canManage && <button onClick={() => void saveGradeDefault()} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">שמור ברירת מחדל לשכבה</button>}
                  </div>

                  <div className="rounded-lg bg-white p-6 shadow">
                    <h3 className="text-lg font-medium text-gray-900">הגדרה פרטית לכיתה</h3>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <select value={homeroomForm.homeroom_id} onChange={(e) => setHomeroomForm((current) => ({ ...current, homeroom_id: e.target.value }))} className="md:col-span-2 rounded-md border border-gray-300 px-3 py-2">
                        <option value="">בחר כיתת אם</option>
                        {(defaultsData?.homerooms || []).map((homeroom) => <option key={homeroom.id} value={homeroom.id}>{homeroom.display_name} - חדר {homeroom.room_number}</option>)}
                      </select>
                      <input type="date" value={homeroomForm.effective_from} onChange={(e) => setHomeroomForm((current) => ({ ...current, effective_from: e.target.value }))} className="rounded-md border border-gray-300 px-3 py-2" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {homeroomForm.weekly_schedule.map((slot) => (
                        <div key={slot.day_of_week} className="grid grid-cols-3 items-center gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={slot.is_active} onChange={(e) => toggleHomeroomDayActive(slot.day_of_week, e.target.checked)} />
                            {dayLabels[slot.day_of_week]}
                          </label>
                          <input type="time" value={slot.start_time || ""} onChange={(e) => updateHomeroomDay(slot.day_of_week, "start_time", e.target.value)} disabled={!slot.is_active} className="rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                          <input type="time" value={slot.end_time || ""} onChange={(e) => updateHomeroomDay(slot.day_of_week, "end_time", e.target.value)} disabled={!slot.is_active} className="rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100" />
                        </div>
                      ))}
                    </div>
                    {canManage && <button onClick={() => void saveHomeroomOverride()} className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">שמור הגדרה פרטית לכיתה</button>}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-lg bg-white p-6 shadow">
                    <div className="mb-4 text-lg font-medium text-gray-900">הגדרות שכבה קיימות</div>
                    {defaultsLoading ? <div className="text-sm text-gray-500">טוען...</div> : (
                      <div className="space-y-3">
                        {(defaultsData?.grade_defaults || []).map((setting) => (
                          <div key={setting.id} className="rounded-md border border-gray-200 p-4 text-sm">
                            <div className="font-medium">שכבה {setting.grade_name || "-"}</div>
                            <div className="mt-2 space-y-1">
                              {setting.weekly_schedule.map((slot) => (
                                <div key={`${setting.id}-${slot.day_of_week}`} className="text-gray-600">
                                  {dayLabels[slot.day_of_week]}: {slot.is_active ? `${slot.start_time} - ${slot.end_time}` : "לא לומדות"}
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-gray-500">בתוקף מ-{setting.effective_from}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-white p-6 shadow">
                    <div className="mb-4 text-lg font-medium text-gray-900">הגדרות פרטיות לכיתות</div>
                    {defaultsLoading ? <div className="text-sm text-gray-500">טוען...</div> : (
                      <div className="space-y-3">
                        {(defaultsData?.homeroom_overrides || []).map((setting) => (
                          <div key={setting.id} className="rounded-md border border-gray-200 p-4 text-sm">
                            <div className="font-medium">{setting.homeroom_name || `כיתה ${setting.homeroom_id}`}</div>
                            <div className="mt-2 space-y-1">
                              {setting.weekly_schedule.map((slot) => (
                                <div key={`${setting.id}-${slot.day_of_week}`} className="text-gray-600">
                                  {dayLabels[slot.day_of_week]}: {slot.is_active ? `${slot.start_time} - ${slot.end_time}` : "לא לומדות"}
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-gray-500">בתוקף מ-{setting.effective_from}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">צפייה בהיסטוריית כיתות אם ושיבוצים</h3>
                      <p className="mt-1 text-sm text-gray-600">תצוגת קריאה בלבד של כיתות אם ושיבוציהן לפי שנת לימוד.</p>
                    </div>
                    <div className="w-full md:w-72">
                      <label className="mb-2 block text-sm font-medium text-gray-700">שנת לימוד</label>
                      <select
                        value={selectedHistorySchoolYear}
                        onChange={(e) => setSelectedHistorySchoolYear(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="">בחר שנת לימוד</option>
                        {historySchoolYears.map((year) => {
                          const label = year.label;
                          return (
                            <option key={label} value={label}>
                              {label}{year.is_active ? " (פעילה)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">כיתות אם בשנה שנבחרה</div><div className="mt-2 text-2xl font-semibold">{historicalHomerooms.length}</div></div>
                  <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">סה״כ שיבוצי כיתות אם</div><div className="mt-2 text-2xl font-semibold">{historyTotalAssignments}</div></div>
                  <div className="rounded-lg bg-white p-5 shadow"><div className="text-sm text-gray-500">שנה מוצגת</div><div className="mt-2 text-2xl font-semibold">{selectedHistorySchoolYear || "-"}</div></div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
                  <div className="overflow-hidden rounded-lg bg-white shadow">
                    <div className="border-b border-gray-200 px-6 py-4">
                      <h3 className="text-lg font-medium text-gray-900">כיתות אם לפי שנה</h3>
                    </div>
                    {historyLoading ? (
                      <div className="p-6 text-sm text-gray-500">טוען היסטוריה...</div>
                    ) : historicalHomerooms.length === 0 ? (
                      <div className="p-6 text-sm text-gray-500">לא נמצאו כיתות אם לשנת הלימוד שנבחרה.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">כיתה</th>
                              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">חדר</th>
                              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">שיבוצים</th>
                              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">טווח</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {historicalHomerooms.map((homeroom) => (
                              <tr
                                key={`history-${homeroom.id}`}
                                className={`cursor-pointer ${selectedHistoricalHomeroom?.id === homeroom.id ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                                onClick={() => void loadHistoricalAssignments(homeroom)}
                              >
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{homeroom.display_name}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{homeroom.room_number}</td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{homeroom.assignment_summary.total_assignments}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                  {homeroom.assignment_summary.first_assignment_date || "-"} עד {homeroom.assignment_summary.last_assignment_date || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-white p-6 shadow">
                    <h3 className="text-lg font-medium text-gray-900">פירוט שיבוצי כיתת אם</h3>
                    {!selectedHistoricalHomeroom ? (
                      <div className="mt-4 text-sm text-gray-500">בחר כיתת אם מהרשימה כדי לצפות בשיבוציה.</div>
                    ) : (
                      <>
                        <div className="mt-4 rounded-lg bg-slate-50 p-4">
                          <div className="text-base font-semibold text-gray-900">{selectedHistoricalHomeroom.display_name}</div>
                          <div className="mt-1 text-sm text-gray-600">חדר {selectedHistoricalHomeroom.room_number} | מחנך/ת: {selectedHistoricalHomeroom.teacher_name || "לא הוקצה"}</div>
                          <div className="mt-1 text-sm text-gray-600">תלמידים: {selectedHistoricalHomeroom.current_students}/{selectedHistoricalHomeroom.max_students}</div>
                        </div>
                        {historyDetailsLoading ? (
                          <div className="mt-4 text-sm text-gray-500">טוען שיבוצים...</div>
                        ) : historicalAssignments.length === 0 ? (
                          <div className="mt-4 text-sm text-gray-500">לא נמצאו שיבוצים לכיתת האם הזו בשנה שנבחרה.</div>
                        ) : (
                          <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto">
                            {historicalAssignments.map((assignment) => (
                              <div key={assignment.id} className="rounded-lg border border-gray-200 p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="text-sm font-medium text-gray-900">{assignment.activity_type || "לימודים"}</div>
                                  <div className="text-xs text-gray-500">{assignment.is_manual ? "ידני" : "אוטומטי"}</div>
                                </div>
                                <div className="mt-2 text-sm text-gray-600">תאריך: {assignment.date || assignment.start_date || "-"}</div>
                                <div className="mt-1 text-sm text-gray-600">שעה: {assignment.start_time} - {assignment.end_time}</div>
                                <div className="mt-1 text-sm text-gray-600">חדר: {assignment.room_number || selectedHistoricalHomeroom.room_number}</div>
                                <div className="mt-1 text-sm text-gray-600">סטטוס: {assignment.status}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showSwapModal && (
        <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-[48rem] rounded-md border bg-white p-5 shadow-lg">
            <h3 className="mb-4 text-lg font-medium text-gray-900">החלפת חדרים לכיתות אם</h3>
            <div className="max-h-[28rem] space-y-3 overflow-y-auto">
              {homerooms.map((homeroom) => (
                <div key={homeroom.id} className="grid grid-cols-[1.3fr_1fr_1.2fr] items-center gap-3 rounded-md border border-gray-200 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={swapSelections[homeroom.id]?.selected || false}
                      onChange={(e) => handleSwapSelectionChange(homeroom.id, { selected: e.target.checked })}
                    />
                    {homeroom.display_name} - חדר נוכחי {homeroom.room_number}
                  </label>
                  <div className="text-sm text-gray-500">{homeroom.grade_name}</div>
                  <select
                    value={swapSelections[homeroom.id]?.room_id || homeroom.room_id}
                    onChange={(e) => handleSwapSelectionChange(homeroom.id, { room_id: e.target.value })}
                    disabled={!swapSelections[homeroom.id]?.selected}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                  >
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.room_number}{room.room_type ? ` (${room.room_type})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSwapModal(false)}
                className="rounded-md bg-gray-300 px-4 py-2 text-gray-800"
              >
                ביטול
              </button>
              <button
                onClick={() => void handleSwapRooms()}
                className="rounded-md bg-amber-600 px-4 py-2 text-white"
              >
                שמור החלפת חדרים
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-96 rounded-md border bg-white p-5 shadow-lg">
            <h3 className="mb-4 text-lg font-medium text-gray-900">{editingHomeroom ? "עריכת כיתת אם" : "הוספת כיתת אם חדשה"}</h3>
            <div className="space-y-4">
              <select value={selectedGrade} onChange={async (e) => { setSelectedGrade(e.target.value); setSelectedRoom(""); await loadFilteredRooms(e.target.value); }} className="block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="">בחר שכבה</option>
                {availableGrades.map((grade) => <option key={grade.id} value={grade.id}>שכבה {grade.name}</option>)}
              </select>
              <select value={selectedClassNumber} onChange={(e) => setSelectedClassNumber(e.target.value)} className="block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="">בחר מספר כיתה</option>
                {[1, 2, 3, 4, 5, 6, 7].map((num) => <option key={num} value={num}>כיתה {num}</option>)}
              </select>
              <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="">בחר חדר</option>
                {filteredRooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} (תכולה: {room.capacity})</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={resetModal} className="rounded-md bg-gray-300 px-4 py-2 text-gray-800">ביטול</button>
              <button onClick={() => void (editingHomeroom ? handleUpdateHomeroom() : handleAddHomeroom())} className="rounded-md bg-indigo-600 px-4 py-2 text-white">{editingHomeroom ? "עדכן" : "הוסף"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
