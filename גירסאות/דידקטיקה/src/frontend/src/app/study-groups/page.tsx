"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import { formatGregorianDate, formatHebrewDate } from "@/lib/hebrewDate";

interface StudyGroup {
  id: string;
  name: string;
  group_type: "math" | "english" | "didactic" | "other";
  grade_level: string;
  student_count: number;
  needs_projector: boolean;
  is_large_group: boolean;
  assignment_group?: 1 | 2 | null;
  weekly_schedule?: WeeklyScheduleEntry[];
  preferred_room_type?: string;
  homeroom_ids?: string[];
  homeroom_names?: string[];
  created_at: string;
}

interface WeeklyScheduleEntry {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface HomeroomOption {
  id: string;
  display_name: string;
  grade_level: string;
}

interface SchedulingResult {
  success: boolean;
  assignments: ScheduledAssignment[];
  conflicts: SchedulingConflict[];
  warnings: string[];
  unscheduled_groups: StudyGroup[];
  scheduling_window?: {
    start_date: string;
    end_date: string;
  };
  scheduled_groups_summary?: ScheduledGroupSummary[];
}

interface ScheduledAssignment {
  id: string;
  assignable_id: string;
  group_name: string;
  group_type: StudyGroup["group_type"];
  grade_level: string;
  room_id: string;
  room_number: string;
  room_type: string;
  date: string;
  start_time: string;
  end_time: string;
  student_count: number;
}

interface SchedulingConflict {
  message: string;
}

interface ScheduledGroupSummary {
  group_id: string;
  group_name: string;
  group_type: StudyGroup["group_type"];
  grade_level: string;
  total_assignments: number;
  room_numbers: string[];
  dates: string[];
}

interface GradeGroupDefinition {
  id?: string;
  grade_level: string;
  group_number: 1 | 2;
  weekly_schedule: WeeklyScheduleEntry[];
}

interface GroupFormData {
  name: string;
  group_type: StudyGroup["group_type"];
  grade_level: string;
  student_count: number;
  needs_projector: boolean;
  is_large_group: boolean;
  assignment_group: 1 | 2;
  homeroom_ids: string[];
}

const GRADE_OPTIONS = ["א", "ב", "ג", "ד", "ה", "ו"];
const DAY_OPTIONS = [
  { value: 1, label: "ראשון" },
  { value: 2, label: "שני" },
  { value: 3, label: "שלישי" },
  { value: 4, label: "רביעי" },
  { value: 5, label: "חמישי" },
  { value: 6, label: "שישי" },
];

const DEFAULT_GROUP_FORM: GroupFormData = {
  name: "",
  group_type: "math",
  grade_level: "",
  student_count: 1,
  needs_projector: false,
  is_large_group: false,
  assignment_group: 1,
  homeroom_ids: [],
};

const getDayLabel = (dayOfWeek: number) => DAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label || "";

const getFilteredHomerooms = (homerooms: HomeroomOption[], gradeLevel: string) =>
  gradeLevel ? homerooms.filter((homeroom) => homeroom.grade_level === gradeLevel) : homerooms;

const getStudyGroupTypeText = (type: StudyGroup["group_type"]) => {
  const types: Record<StudyGroup["group_type"], string> = {
    math: "מתמטיקה",
    english: "אנגלית",
    didactic: "דידקטי",
    other: "אחר",
  };
  return types[type] || type;
};

export default function StudyGroupsPage() {
  const { data: session } = useSession();
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [homerooms, setHomerooms] = useState<HomeroomOption[]>([]);
  const [gradeGroupDefinitions, setGradeGroupDefinitions] = useState<GradeGroupDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSchedulingModal, setShowSchedulingModal] = useState(false);
  const [schedulingResult, setSchedulingResult] = useState<SchedulingResult | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isSchedulingSelectedGroups, setIsSchedulingSelectedGroups] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudyGroup | null>(null);
  const [showInlineAddRow, setShowInlineAddRow] = useState(false);
  const [showGradeGroupDefinitions, setShowGradeGroupDefinitions] = useState(false);
  const showEditModal = false;
  const setShowEditModal = (_value: boolean) => {};

  const isAdmin = session?.user?.role === "admin";
  const isGroupCoordinator = session?.user?.role === "group_coordinator";
  const canManageGroups = isAdmin || isGroupCoordinator;

  useEffect(() => {
    void Promise.all([fetchStudyGroups(), fetchHomerooms(), fetchGradeGroupDefinitions()]);
  }, []);

  const fetchStudyGroups = async () => {
    try {
      const response = await authenticatedFetch("http://localhost:3001/api/study-groups");
      const data = await response.json();

      if (data.success) {
        setStudyGroups(data.data.study_groups);
      } else {
        console.error("Failed to fetch study groups:", data.error);
      }
    } catch (error) {
      console.error("Error fetching study groups:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHomerooms = async () => {
    try {
      const response = await authenticatedFetch("http://localhost:3001/api/study-groups/classroom-options");
      const data = await response.json();

      if (data.success) {
        setHomerooms(
          data.data.homerooms.map((homeroom: any) => ({
            id: homeroom.id,
            display_name: homeroom.display_name,
            grade_level: homeroom.grade_level || "",
          }))
        );
      } else {
        console.error("Failed to fetch homerooms:", data.error);
      }
    } catch (error) {
      console.error("Error fetching homerooms:", error);
    }
  };

  const fetchGradeGroupDefinitions = async () => {
    try {
      const response = await authenticatedFetch("http://localhost:3001/api/study-groups/group-definitions");
      const data = await response.json();

      if (data.success) {
        setGradeGroupDefinitions(data.data.definitions);
      } else {
        console.error("Failed to fetch grade group definitions:", data.error);
      }
    } catch (error) {
      console.error("Error fetching grade group definitions:", error);
    }
  };

  const handleSaveGradeGroupDefinition = async (definition: GradeGroupDefinition) => {
    try {
      const response = await authenticatedFetch(
        `http://localhost:3001/api/study-groups/group-definitions/${encodeURIComponent(definition.grade_level)}/${definition.group_number}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            weekly_schedule: definition.weekly_schedule,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        await Promise.all([fetchGradeGroupDefinitions(), fetchStudyGroups()]);
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error("Error saving grade group definition:", error);
      alert("אירעה שגיאה בשמירת הגדרת קבוצת השכבה");
    }
  };

  const handleUpdateGroup = async (formData: GroupFormData) => {
    if (!editingGroup) {
      return;
    }

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/study-groups/${editingGroup.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        alert("הקבצה עודכנה בהצלחה!");
        setEditingGroup(null);
        await fetchStudyGroups();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error("Error updating study group:", error);
      alert("אירעה שגיאה בעדכון ההקבצה");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק קבוצה זו?")) {
      return;
    }

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/study-groups/${groupId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        alert("הקבצה נמחקה בהצלחה!");
        await fetchStudyGroups();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error("Error deleting study group:", error);
      alert("אירעה שגיאה במחיקת ההקבצה");
    }
  };

  const handleEditGroup = (groupId: string) => {
    const group = studyGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    setEditingGroup(group);
  };

  const handleScheduleGroups = async () => {
    if (selectedGroups.length === 0) {
      alert("נא לבחור לפחות הקבצה אחת לשיבוץ");
      return;
    }

    setIsSchedulingSelectedGroups(true);

    try {
      const response = await authenticatedFetch("http://localhost:3001/api/study-groups/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_ids: selectedGroups,
          force_schedule: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSchedulingResult(data.data);
        setShowSchedulingModal(true);
      } else {
        alert(`שגיאה בשיבוץ: ${data.error}`);
      }
    } catch (error) {
      console.error("Error scheduling groups:", error);
      alert("אירעה שגיאה בשיבוץ ההקבצות");
    } finally {
      setIsSchedulingSelectedGroups(false);
    }
  };

  const handleExportCalendar = async () => {
    try {
      const response = await authenticatedFetch("http://localhost:3001/api/study-groups/export-calendar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_ids: selectedGroups.length > 0 ? selectedGroups : studyGroups.map((group) => group.id),
          format: "ical",
          start_date: new Date().toISOString().split("T")[0],
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        }),
      });

      const data = await response.json();

      if (data.success) {
        const calendarContent = data.data.calendar_content;
        const blob = new Blob([calendarContent], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `study_groups_calendar_${new Date().toISOString().split("T")[0]}.ics`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        alert("לוח השנה יוצא בהצלחה!");
      } else {
        alert(`שגיאה בייצוא לוח שנה: ${data.error}`);
      }
    } catch (error) {
      console.error("Error exporting calendar:", error);
      alert("אירעה שגיאה בייצוא לוח השנה");
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const getGroupTypeText = (type: string) => {
    const types: Record<string, string> = {
      math: "מתמטיקה",
      english: "אנגלית",
      didactic: "דידקטיקה",
      other: "אחר",
    };
    return types[type] || type;
  };

  const getGroupTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      math: "bg-blue-100 text-blue-800",
      english: "bg-green-100 text-green-800",
      didactic: "bg-purple-100 text-purple-800",
      other: "bg-gray-100 text-gray-800",
    };
    return colors[type] || "bg-gray-100 text-gray-800";
  };

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      א: "bg-red-100 text-red-800",
      ב: "bg-orange-100 text-orange-800",
      ג: "bg-yellow-100 text-yellow-800",
      ד: "bg-green-100 text-green-800",
      ה: "bg-blue-100 text-blue-800",
      ו: "bg-purple-100 text-purple-800",
    };
    return colors[grade] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-lg text-gray-600">טוען...</div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ניהול הקבצות</h1>
              <p className="text-gray-600">ניהול הקבצות, שיבוץ אינטליגנטי ותצוגת לוחות זמנים</p>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
              <StatCard title="כל ההקבצות" value={studyGroups.length} color="bg-blue-500" icon="ק" />
              <StatCard title="הקבצות מתמטיקה" value={studyGroups.filter((group) => group.group_type === "math").length} color="bg-green-500" icon="מ" />
              <StatCard title="הקבצות אנגלית" value={studyGroups.filter((group) => group.group_type === "english").length} color="bg-purple-500" icon="א" />
              <StatCard title="סך התלמידות" value={studyGroups.reduce((sum, group) => sum + group.student_count, 0)} color="bg-orange-500" icon="ת" />
            </div>

            {canManageGroups && (
              <div className="mb-6 rounded-lg bg-white shadow">
                <button
                  type="button"
                  onClick={() => setShowGradeGroupDefinitions((current) => !current)}
                  className="flex w-full items-center justify-between px-4 py-5 text-right sm:px-6"
                >
                  <span className="text-lg font-medium leading-6 text-gray-900">הגדרת קבוצות שכבה</span>
                  <span className="text-xl text-gray-500">{showGradeGroupDefinitions ? "▾" : "▸"}</span>
                </button>
                {showGradeGroupDefinitions && (
                  <GradeGroupDefinitionsPanel
                    gradeOptions={GRADE_OPTIONS}
                    definitions={gradeGroupDefinitions}
                    onSave={handleSaveGradeGroupDefinition}
                  />
                )}
              </div>
            )}

            {canManageGroups && (
              <div className="mb-6 rounded-lg bg-white shadow">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="mb-4 text-lg font-medium leading-6 text-gray-900">פעולות ניהול</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <button
                      onClick={handleScheduleGroups}
                      disabled={selectedGroups.length === 0 || isSchedulingSelectedGroups}
                      className="rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {isSchedulingSelectedGroups ? "משבץ הקבצות..." : `שבץ הקבצות נבחרות (${selectedGroups.length})`}
                    </button>
                    <button onClick={handleExportCalendar} className="rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                      ייצוא לוח שנה
                    </button>
                    <button className="rounded-md bg-purple-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-700">
                      דוח ניצולת
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900">רשימת הקבצות</h2>
                  {canManageGroups && (
                    <button
                      onClick={() => setShowInlineAddRow(true)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xl text-white hover:bg-indigo-700"
                      aria-label="הוספת הקבצה"
                      title="הוספת הקבצה"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        <input
                          type="checkbox"
                          checked={studyGroups.length > 0 && selectedGroups.length === studyGroups.length}
                          onChange={(event) => setSelectedGroups(event.target.checked ? studyGroups.map((group) => group.id) : [])}
                          className="rounded"
                        />
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">שם הקבצה</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">סוג</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">שכבה</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">תלמידות</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">הקבוצה משויכת לכיתות</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">דרישות</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {showInlineAddRow && (
                      <InlineAddGroupRow
                        homerooms={homerooms}
                        onCancel={() => setShowInlineAddRow(false)}
                        onSaved={async () => {
                          setShowInlineAddRow(false);
                          await fetchStudyGroups();
                        }}
                      />
                    )}

                    {studyGroups.map((group) => (
                      editingGroup?.id === group.id ? (
                        <InlineEditGroupRow
                          key={group.id}
                          group={group}
                          homerooms={homerooms}
                          onCancel={() => setEditingGroup(null)}
                          onSubmit={handleUpdateGroup}
                        />
                      ) : (
                      <tr key={group.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleGroupSelection(group.id)} className="rounded" />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{group.name}</div>
                          <div className="text-xs text-gray-500">נוצר: {new Date(group.created_at).toLocaleDateString("he-IL")}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getGroupTypeColor(group.group_type)}`}>{getGroupTypeText(group.group_type)}</span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getGradeColor(group.grade_level)}`}>שכבה {group.grade_level}</span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {group.student_count} תלמידות
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {group.homeroom_names && group.homeroom_names.length > 0 ? group.homeroom_names.join(", ") : "-"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {group.is_large_group && <span className="ml-2 text-orange-600">קבוצה גדולה</span>}
                          {group.needs_projector && <span className="ml-2">מקרן</span>}
                          {group.assignment_group && <span className="ml-2 text-indigo-600">קבוצה {group.assignment_group}</span>}
                          {!group.is_large_group && !group.needs_projector && !group.assignment_group && <span>-</span>}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                          {canManageGroups && (
                            <>
                              <button onClick={() => handleEditGroup(group.id)} className="ml-3 text-indigo-600 hover:text-indigo-900">
                                ערוך
                              </button>
                              <button onClick={() => handleDeleteGroup(group.id)} className="text-red-600 hover:text-red-900">
                                מחק
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showEditModal && editingGroup && (
        <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-96 rounded-md border bg-white p-5 shadow-lg">
            <div className="mt-3">
              <h3 className="mb-4 text-lg font-medium leading-6 text-gray-900">עריכת הקבצה</h3>
              <AddGroupForm
                onSubmit={handleUpdateGroup}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingGroup(null);
                }}
                editingGroup={editingGroup}
                homerooms={homerooms}
              />
            </div>
          </div>
        </div>
      )}

      {showSchedulingModal && schedulingResult && (
        <div className="fixed inset-0 z-50 h-full w-full overflow-y-auto bg-gray-600 bg-opacity-50">
          <div className="relative top-20 mx-auto w-2/3 rounded-md border bg-white p-5 shadow-lg">
            <div className="mt-3">
              <h3 className="mb-4 text-lg font-medium leading-6 text-gray-900">תוצאות שיבוץ</h3>
              <DetailedSchedulingResults result={schedulingResult} />
              <div className="mt-6 flex justify-end">
                <button onClick={() => setShowSchedulingModal(false)} className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                  סגור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}>
              <span className="font-semibold text-white">{icon}</span>
            </div>
          </div>
          <div className="mr-4 w-0 flex-1">
            <dl>
              <dt className="truncate text-sm font-medium text-gray-500">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyScheduleEditor({
  weeklySchedule,
  onChange,
  compact = false,
}: {
  weeklySchedule: WeeklyScheduleEntry[];
  onChange: (weeklySchedule: WeeklyScheduleEntry[]) => void;
  compact?: boolean;
}) {
  const normalizeSchedule = (entries: WeeklyScheduleEntry[]) =>
    [...entries].sort((left, right) => left.day_of_week - right.day_of_week || left.start_time.localeCompare(right.start_time));

  const createDefaultEntry = (dayOfWeek: number, blockIndex: number): WeeklyScheduleEntry => ({
    day_of_week: dayOfWeek,
    start_time: blockIndex === 0 ? "08:00" : "09:00",
    end_time: blockIndex === 0 ? "08:45" : "09:45",
  });

  const getDayEntries = (dayOfWeek: number) =>
    weeklySchedule
      .filter((entry) => entry.day_of_week === dayOfWeek)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));

  const toggleDay = (dayOfWeek: number, enabled: boolean) => {
    if (enabled) {
      if (getDayEntries(dayOfWeek).length > 0) {
        return;
      }

      onChange(normalizeSchedule([...weeklySchedule, createDefaultEntry(dayOfWeek, 0)]));
      return;
    }

    onChange(weeklySchedule.filter((entry) => entry.day_of_week !== dayOfWeek));
  };

  const addTimeBlock = (dayOfWeek: number) => {
    const dayEntries = getDayEntries(dayOfWeek);
    if (dayEntries.length >= 2) {
      return;
    }

    onChange(normalizeSchedule([...weeklySchedule, createDefaultEntry(dayOfWeek, dayEntries.length)]));
  };

  const removeTimeBlock = (dayOfWeek: number, blockIndex: number) => {
    let currentIndex = -1;
    onChange(
      weeklySchedule.filter((entry) => {
        if (entry.day_of_week !== dayOfWeek) {
          return true;
        }

        currentIndex += 1;
        return currentIndex !== blockIndex;
      })
    );
  };

  const updateDayField = (dayOfWeek: number, blockIndex: number, field: "start_time" | "end_time", value: string) => {
    let currentIndex = -1;
    onChange(
      normalizeSchedule(
        weeklySchedule.map((entry) => {
          if (entry.day_of_week !== dayOfWeek) {
            return entry;
          }

          currentIndex += 1;
          return currentIndex === blockIndex ? { ...entry, [field]: value } : entry;
        })
      )
    );
  };

  return (
    <div className={compact ? "space-y-2 text-xs" : "space-y-3"}>
      <div>
        <label className="block text-sm font-medium text-gray-700">ימים ושעות לקבוצה</label>
        <div className="mt-1 space-y-2 rounded-md border border-gray-300 p-3">
          {DAY_OPTIONS.map((day) => {
            const dayEntries = getDayEntries(day.value);
            const hasEntries = dayEntries.length > 0;

            return (
              <div key={day.value} className={compact ? "space-y-2" : "grid grid-cols-[120px_1fr] items-start gap-3"}>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={hasEntries}
                    onChange={(event) => toggleDay(day.value, event.target.checked)}
                    className="rounded"
                  />
                  <span>{day.label}</span>
                </label>
                {hasEntries && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[56px] text-sm text-gray-500">בלוק 1</span>
                    <input
                      type="time"
                      value={dayEntries[0].start_time}
                      onChange={(event) => updateDayField(day.value, 0, "start_time", event.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    />
                    <span className="text-gray-500">עד</span>
                    <input
                      type="time"
                      value={dayEntries[0].end_time}
                      onChange={(event) => updateDayField(day.value, 0, "end_time", event.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    />
                      <button
                        type="button"
                        onClick={() => removeTimeBlock(day.value, 0)}
                        className="rounded-md border border-red-200 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                      >
                        הסר
                      </button>
                    </div>
                    {dayEntries[1] && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[56px] text-sm text-gray-500">בלוק 2</span>
                        <input
                          type="time"
                          value={dayEntries[1].start_time}
                          onChange={(event) => updateDayField(day.value, 1, "start_time", event.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1"
                        />
                    <span className="text-gray-500">-</span>
                        <input
                          type="time"
                          value={dayEntries[1].end_time}
                          onChange={(event) => updateDayField(day.value, 1, "end_time", event.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeTimeBlock(day.value, 1)}
                          className="rounded-md border border-red-200 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                        >
                          הסר
                        </button>
                      </div>
                    )}
                    {dayEntries.length < 2 && (
                      <button
                        type="button"
                        onClick={() => addTimeBlock(day.value)}
                        className="rounded-md border border-indigo-200 px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50"
                      >
                        הוסף בלוק זמן
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AddGroupForm({
  onSubmit,
  onCancel,
  editingGroup,
  homerooms,
}: {
  onSubmit: (data: GroupFormData) => void;
  onCancel: () => void;
  editingGroup: StudyGroup;
  homerooms: HomeroomOption[];
}) {
  const [formData, setFormData] = useState<GroupFormData>({
    name: editingGroup.name,
    group_type: editingGroup.group_type,
    grade_level: editingGroup.grade_level,
    student_count: editingGroup.student_count,
    needs_projector: editingGroup.needs_projector,
    is_large_group: editingGroup.is_large_group,
    assignment_group: editingGroup.assignment_group || 1,
    homeroom_ids: editingGroup.homeroom_ids || [],
  });
  const filteredHomerooms = getFilteredHomerooms(homerooms, formData.grade_level);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...formData,
      name: formData.name.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">שם הקבצה</label>
        <input type="text" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">סוג הקבצה</label>
        <select value={formData.group_type} onChange={(event) => setFormData({ ...formData, group_type: event.target.value as StudyGroup["group_type"] })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
          <option value="math">מתמטיקה</option>
          <option value="english">אנגלית</option>
          <option value="didactic">דידקטיקה</option>
          <option value="other">אחר</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">שכבה</label>
        <select value={formData.grade_level} onChange={(event) => setFormData({ ...formData, grade_level: event.target.value })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
          <option value="">בחר שכבה</option>
          {GRADE_OPTIONS.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">מספר תלמידות</label>
        <input type="number" value={formData.student_count} onChange={(event) => setFormData({ ...formData, student_count: parseInt(event.target.value, 10) || 0 })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" min="1" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">לאילו כיתות אם הקבוצה משויכת</label>
        <div className="mt-1 max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-300 px-3 py-2">
          {filteredHomerooms.length > 0 ? (
            filteredHomerooms.map((homeroom) => (
              <label key={homeroom.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.homeroom_ids.includes(homeroom.id)}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      homeroom_ids: event.target.checked
                        ? [...formData.homeroom_ids, homeroom.id]
                        : formData.homeroom_ids.filter((id) => id !== homeroom.id),
                    })
                  }
                  className="rounded"
                />
                <span>{homeroom.display_name}</span>
              </label>
            ))
          ) : (
            <div className="text-sm text-gray-500">אין כיתות אם זמינות לבחירה</div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-center">
          <input type="checkbox" checked={formData.needs_projector} onChange={(event) => setFormData({ ...formData, needs_projector: event.target.checked })} className="ml-2 rounded" />
          <span className="mr-2 text-sm text-gray-700">נדרש מקרן</span>
        </label>
        <label className="flex items-center">
          <input type="checkbox" checked={formData.is_large_group} onChange={(event) => setFormData({ ...formData, is_large_group: event.target.checked })} className="ml-2 rounded" />
          <span className="mr-2 text-sm text-gray-700">קבוצה גדולה</span>
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">שיוך לקבוצת הקבצות</label>
        <select value={formData.assignment_group} onChange={(event) => setFormData({ ...formData, assignment_group: Number(event.target.value) as 1 | 2 })} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
          <option value={1}>קבוצה 1</option>
          <option value={2}>קבוצה 2</option>
        </select>
      </div>
      <div className="mt-6 flex justify-end space-x-3">
        <button type="button" onClick={onCancel} className="rounded-md bg-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-400">
          ביטול
        </button>
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          שמור
        </button>
      </div>
    </form>
  );
}

function InlineEditGroupRow({
  group,
  homerooms,
  onCancel,
  onSubmit,
}: {
  group: StudyGroup;
  homerooms: HomeroomOption[];
  onCancel: () => void;
  onSubmit: (data: GroupFormData) => Promise<void>;
}) {
  const [formData, setFormData] = useState<GroupFormData>({
    name: group.name,
    group_type: group.group_type,
    grade_level: group.grade_level,
    student_count: group.student_count,
    needs_projector: group.needs_projector,
    is_large_group: group.is_large_group,
    assignment_group: group.assignment_group || 1,
    homeroom_ids: group.homeroom_ids || [],
  });
  const filteredHomerooms = getFilteredHomerooms(homerooms, formData.grade_level);
  const [isSaving, setIsSaving] = useState(false);

  const saveGroup = async () => {
    if (isSaving || formData.name.trim() === "" || formData.student_count <= 0) {
      return;
    }

    try {
      setIsSaving(true);
      await onSubmit({
        ...formData,
        name: formData.name.trim(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className="bg-amber-50">
      <td className="whitespace-nowrap px-6 py-4 align-top">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-700" aria-label="ביטול">
          X
        </button>
      </td>
      <td className="px-6 py-4 align-top">
        <input
          type="text"
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </td>
      <td className="px-6 py-4 align-top">
        <select value={formData.group_type} onChange={(event) => setFormData({ ...formData, group_type: event.target.value as StudyGroup["group_type"] })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="math">מתמטיקה</option>
          <option value="english">אנגלית</option>
          <option value="didactic">דידקטיקה</option>
          <option value="other">אחר</option>
        </select>
      </td>
      <td className="px-6 py-4 align-top">
        <select value={formData.grade_level} onChange={(event) => setFormData({ ...formData, grade_level: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">בחר שכבה</option>
          {GRADE_OPTIONS.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4 align-top">
        <input type="number" value={formData.student_count} onChange={(event) => setFormData({ ...formData, student_count: parseInt(event.target.value, 10) || 0 })} className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm" min="1" />
      </td>
      <td className="px-6 py-4 align-top">
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-gray-300 px-3 py-2 text-sm">
          {filteredHomerooms.length > 0 ? (
            filteredHomerooms.map((homeroom) => (
              <label key={homeroom.id} className="flex items-center gap-2 text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.homeroom_ids.includes(homeroom.id)}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      homeroom_ids: event.target.checked
                        ? [...formData.homeroom_ids, homeroom.id]
                        : formData.homeroom_ids.filter((id) => id !== homeroom.id),
                    })
                  }
                  className="rounded"
                />
                <span>{homeroom.display_name}</span>
              </label>
            ))
          ) : (
            <div className="text-gray-500">אין כיתות אם זמינות</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 align-top">
        <div className="flex flex-col gap-2 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.needs_projector} onChange={(event) => setFormData({ ...formData, needs_projector: event.target.checked })} className="rounded" />
            <span>מקרן</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_large_group} onChange={(event) => setFormData({ ...formData, is_large_group: event.target.checked })} className="rounded" />
            <span>קבוצה גדולה</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">קבוצת הקבצות</label>
          <select value={formData.assignment_group} onChange={(event) => setFormData({ ...formData, assignment_group: Number(event.target.value) as 1 | 2 })} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value={1}>קבוצה 1</option>
            <option value={2}>קבוצה 2</option>
          </select>
        </div>
      </td>
      <td className="px-6 py-4 align-top text-sm text-gray-500">
        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={() => void saveGroup()} disabled={isSaving || formData.name.trim() === "" || formData.student_count <= 0} className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400">
            שמור
          </button>
          <button type="button" onClick={onCancel} className="text-gray-600 hover:text-gray-800">
            ביטול
          </button>
        </div>
      </td>
    </tr>
  );
}

function InlineAddGroupRow({
  homerooms,
  onCancel,
  onSaved,
}: {
  homerooms: HomeroomOption[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [formData, setFormData] = useState<GroupFormData>(DEFAULT_GROUP_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const filteredHomerooms = getFilteredHomerooms(homerooms, formData.grade_level);

  const canSave = formData.name.trim() !== "" && formData.student_count > 0 && formData.grade_level !== "";

  const saveGroup = async () => {
    if (!canSave || isSaving) {
      return;
    }

    try {
      setIsSaving(true);

      const response = await authenticatedFetch("http://localhost:3001/api/study-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        await onSaved();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error("Error adding study group:", error);
      alert("אירעה שגיאה בהוספת ההקבצה");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className="bg-indigo-50">
      <td className="whitespace-nowrap px-6 py-4 align-top">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-700" aria-label="ביטול">
          ×
        </button>
      </td>
      <td className="px-6 py-4 align-top">
        <input
          type="text"
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveGroup();
            }
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="שם ההקבצה"
          autoFocus
        />
      </td>
      <td className="px-6 py-4 align-top">
        <select value={formData.group_type} onChange={(event) => setFormData({ ...formData, group_type: event.target.value as StudyGroup["group_type"] })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="math">מתמטיקה</option>
          <option value="english">אנגלית</option>
          <option value="didactic">דידקטיקה</option>
          <option value="other">אחר</option>
        </select>
      </td>
      <td className="px-6 py-4 align-top">
        <select value={formData.grade_level} onChange={(event) => setFormData({ ...formData, grade_level: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">בחר שכבה</option>
          {GRADE_OPTIONS.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4 align-top">
        <input type="number" value={formData.student_count} onChange={(event) => setFormData({ ...formData, student_count: parseInt(event.target.value, 10) || 0 })} className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm" min="1" />
      </td>
      <td className="px-6 py-4 align-top">
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-gray-300 px-3 py-2 text-sm">
          {filteredHomerooms.length > 0 ? (
            filteredHomerooms.map((homeroom) => (
              <label key={homeroom.id} className="flex items-center gap-2 text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.homeroom_ids.includes(homeroom.id)}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      homeroom_ids: event.target.checked
                        ? [...formData.homeroom_ids, homeroom.id]
                        : formData.homeroom_ids.filter((id) => id !== homeroom.id),
                    })
                  }
                  className="rounded"
                />
                <span>{homeroom.display_name}</span>
              </label>
            ))
          ) : (
            <div className="text-gray-500">אין כיתות אם זמינות</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 align-top">
        <div className="flex flex-col gap-2 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.needs_projector} onChange={(event) => setFormData({ ...formData, needs_projector: event.target.checked })} className="rounded" />
            <span>מקרן</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_large_group} onChange={(event) => setFormData({ ...formData, is_large_group: event.target.checked })} className="rounded" />
            <span>קבוצה גדולה</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">קבוצת הקבצות</label>
          <select value={formData.assignment_group} onChange={(event) => setFormData({ ...formData, assignment_group: Number(event.target.value) as 1 | 2 })} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value={1}>קבוצה 1</option>
            <option value={2}>קבוצה 2</option>
          </select>
        </div>
      </td>
      <td className="px-6 py-4 align-top text-sm text-gray-500">
        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={() => void saveGroup()} disabled={!canSave || isSaving} className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400">
            שמור
          </button>
          <span>{isSaving ? "שומר..." : "השורה תישמר רק בלחיצה על שמור"}</span>
        </div>
      </td>
    </tr>
  );
}

function GradeGroupDefinitionsPanel({
  gradeOptions,
  definitions,
  onSave,
}: {
  gradeOptions: string[];
  definitions: GradeGroupDefinition[];
  onSave: (definition: GradeGroupDefinition) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, WeeklyScheduleEntry[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const getDefinition = (gradeLevel: string, groupNumber: 1 | 2) =>
    definitions.find((definition) => definition.grade_level === gradeLevel && definition.group_number === groupNumber);

  const getDraftKey = (gradeLevel: string, groupNumber: 1 | 2) => `${gradeLevel}-${groupNumber}`;

  const getWeeklySchedule = (gradeLevel: string, groupNumber: 1 | 2) => {
    const draftKey = getDraftKey(gradeLevel, groupNumber);
    if (drafts[draftKey]) {
      return drafts[draftKey];
    }

    return getDefinition(gradeLevel, groupNumber)?.weekly_schedule || [];
  };

  return (
    <div className="mb-6 rounded-lg bg-white shadow">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="mb-4 text-lg font-medium leading-6 text-gray-900">הגדרת קבוצות שכבה</h3>
        <div className="space-y-6">
          {gradeOptions.map((gradeLevel) => (
            <div key={gradeLevel} className="rounded-lg border border-gray-200 p-4">
              <h4 className="mb-4 text-base font-medium text-gray-900">שכבה {gradeLevel}</h4>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[1, 2].map((groupNumber) => {
                  const normalizedGroupNumber = groupNumber as 1 | 2;
                  const draftKey = getDraftKey(gradeLevel, normalizedGroupNumber);
                  const weeklySchedule = getWeeklySchedule(gradeLevel, normalizedGroupNumber);

                  return (
                    <div key={draftKey} className="rounded-md border border-gray-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="font-medium text-gray-900">קבוצה {groupNumber}</h5>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setSavingKey(draftKey);
                              await onSave({
                                id: getDefinition(gradeLevel, normalizedGroupNumber)?.id,
                                grade_level: gradeLevel,
                                group_number: normalizedGroupNumber,
                                weekly_schedule: weeklySchedule,
                              });
                              setDrafts((current) => {
                                const nextDrafts = { ...current };
                                delete nextDrafts[draftKey];
                                return nextDrafts;
                              });
                            } finally {
                              setSavingKey(null);
                            }
                          }}
                          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:bg-gray-400"
                          disabled={savingKey === draftKey}
                        >
                          {savingKey === draftKey ? "שומר..." : "שמור"}
                        </button>
                      </div>
                      <WeeklyScheduleEditor
                        weeklySchedule={weeklySchedule}
                        onChange={(nextWeeklySchedule) =>
                          setDrafts((current) => ({
                            ...current,
                            [draftKey]: nextWeeklySchedule,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchedulingResults({ result }: { result: SchedulingResult }) {
  return (
    <div className="space-y-4">
      <div className={`rounded-md border p-4 ${result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <h4 className={`text-lg font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>{result.success ? "השיבוץ הצליח!" : "השיבוץ נכשל"}</h4>
        <p className={`mt-2 ${result.success ? "text-green-700" : "text-red-700"}`}>
          {result.success ? `${result.assignments.length} הקבצות שובצו בהצלחה` : `${result.unscheduled_groups.length} הקבצות לא שובצו עקב קונפליקטים`}
        </p>
      </div>

      {result.conflicts.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <h4 className="text-lg font-medium text-red-800">קונפליקטים שזוהו:</h4>
          <ul className="mt-2 list-inside list-disc text-red-700">
            {result.conflicts.map((conflict, index) => (
              <li key={index}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <h4 className="text-lg font-medium text-yellow-800">אזהרות:</h4>
          <ul className="mt-2 list-inside list-disc text-yellow-700">
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DetailedSchedulingResults({ result }: { result: SchedulingResult }) {
  const groupedAssignments = result.scheduled_groups_summary ?? [];
  const detailedAssignments = [...result.assignments].sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.start_time.localeCompare(right.start_time) ||
    left.group_name.localeCompare(right.group_name)
  );

  return (
    <div className="space-y-4">
      <div className={`rounded-md border p-4 ${result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
        <h4 className={`text-lg font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
          {result.success ? "השיבוץ הצליח!" : "השיבוץ נכשל"}
        </h4>
        <p className={`mt-2 ${result.success ? "text-green-700" : "text-red-700"}`}>
          {result.success
            ? `${result.assignments.length} מופעי שיבוץ נשמרו עבור ${groupedAssignments.length} הקבצות`
            : `${result.unscheduled_groups.length} הקבצות לא שובצו עקב קונפליקטים`}
        </p>
        {result.scheduling_window && (
          <p className={`mt-2 text-sm ${result.success ? "text-green-800" : "text-red-800"}`}>
            טווח שיבוץ: {formatHebrewDate(result.scheduling_window.start_date, { includeWeekday: true })} עד{" "}
            {formatHebrewDate(result.scheduling_window.end_date, { includeWeekday: true })}
          </p>
        )}
      </div>

      {groupedAssignments.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
          <h4 className="text-lg font-medium text-blue-800">פירוט לפי הקבצה</h4>
          <div className="mt-3 space-y-3">
            {groupedAssignments.map((group) => (
              <div key={group.group_id} className="rounded border border-blue-100 bg-white p-3">
                <div className="font-medium text-gray-900">{group.group_name}</div>
                <div className="mt-1 text-sm text-gray-700">
                  שכבה {group.grade_level} | {getStudyGroupTypeText(group.group_type)} | {group.total_assignments} מופעים
                </div>
                <div className="mt-1 text-sm text-gray-600">חדרים: {group.room_numbers.join(", ")}</div>
                <div className="mt-1 text-sm text-gray-600">
                  תאריכים: {group.dates.map((date) => formatHebrewDate(date, { includeWeekday: true })).join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <h4 className="text-lg font-medium text-red-800">קונפליקטים שזוהו:</h4>
          <ul className="mt-2 list-inside list-disc text-red-700">
            {result.conflicts.map((conflict, index) => (
              <li key={index}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <h4 className="text-lg font-medium text-yellow-800">אזהרות:</h4>
          <ul className="mt-2 list-inside list-disc text-yellow-700">
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {detailedAssignments.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <h4 className="text-lg font-medium text-gray-900">פירוט מלא של השיבוצים</h4>
          <div className="mt-3 max-h-80 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">הקבצה</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">תאריך</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">שעה</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">חדר</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">שכבה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {detailedAssignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-3 py-2 text-gray-900">{assignment.group_name}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <div>{formatHebrewDate(assignment.date, { includeWeekday: true })}</div>
                      <div className="text-xs text-gray-500">{formatGregorianDate(assignment.date)}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{assignment.start_time}-{assignment.end_time}</td>
                    <td className="px-3 py-2 text-gray-700">{assignment.room_number}</td>
                    <td className="px-3 py-2 text-gray-700">{assignment.grade_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
