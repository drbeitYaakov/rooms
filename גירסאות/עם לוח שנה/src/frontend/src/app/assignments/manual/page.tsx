"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/auth-backend-bridge";
import {
  MAINTENANCE_AFTER_HOURS_MESSAGE,
  shouldShowMaintenanceAlert,
} from "@/lib/afterHoursMaintenance";
import HebrewDateField from "@/components/HebrewDateField";
import { formatHebrewDate } from "@/lib/hebrewDate";
import { getActivityTypeText } from "@/lib/activityDisplay";
import {
  MANUAL_AUDITORIUM_ACTIVITY_OPTIONS,
  RECURRING_ROOM_REQUEST_ACTIVITY_OPTIONS,
} from "@/lib/schedulingActivityOptions";

interface RoomOption {
  id: string;
  room_number: string;
  room_type: string;
}

interface AssignmentListItem {
  id: string;
  title?: string;
  activity_type?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
}

const DEFAULT_ACTIVITY_TYPE = "";

export default function ManualAssignmentPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [formData, setFormData] = useState<{
    room_id: string;
    date: string;
    start_time: string;
    end_time: string;
    activity_type: string;
    assignment_type: "one_time" | "recurring";
    days_of_week: number[];
    end_date: string;
  }>({
    room_id: "",
    date: "",
    start_time: "",
    end_time: "",
    activity_type: DEFAULT_ACTIVITY_TYPE,
    assignment_type: "one_time",
    days_of_week: [],
    end_date: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchRooms();
    void fetchAssignments();
  }, []);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === formData.room_id) || null,
    [formData.room_id, rooms]
  );
  const isSelectedRoomAuditorium = String(selectedRoom?.room_type || "").toUpperCase() === "AUDITORIUM";
  const activityOptions = isSelectedRoomAuditorium
    ? MANUAL_AUDITORIUM_ACTIVITY_OPTIONS
    : RECURRING_ROOM_REQUEST_ACTIVITY_OPTIONS;

  const fetchRooms = async () => {
    try {
      const response = await authenticatedFetch("/api/rooms");
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setRooms(data.data.rooms || []);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  const fetchAssignments = async () => {
    try {
      const response = await authenticatedFetch("/api/assignments");
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setAssignments(data.data.assignments || []);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    }
  };

  const handleRoomChange = (roomId: string) => {
    const nextRoom = rooms.find((room) => room.id === roomId) || null;
    const nextIsAuditorium = String(nextRoom?.room_type || "").toUpperCase() === "AUDITORIUM";

    setFormData((current) => ({
      ...current,
      room_id: roomId,
      activity_type: nextIsAuditorium
        ? (MANUAL_AUDITORIUM_ACTIVITY_OPTIONS.some((option) => option.value === current.activity_type)
            ? current.activity_type
            : DEFAULT_ACTIVITY_TYPE)
        : current.activity_type,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.room_id) {
      alert("אנא בחר חדר");
      setLoading(false);
      return;
    }

    if (!formData.date) {
      alert("אנא בחר תאריך");
      setLoading(false);
      return;
    }

    if (!formData.start_time) {
      alert("אנא בחר שעת התחלה");
      setLoading(false);
      return;
    }

    if (!formData.end_time) {
      alert("אנא בחר שעת סיום");
      setLoading(false);
      return;
    }

    if (formData.assignment_type === "recurring") {
      if (formData.days_of_week.length === 0) {
        alert("אנא בחר לפחות יום אחד בשבוע");
        setLoading(false);
        return;
      }

      if (!formData.end_date) {
        alert("אנא בחר תאריך סיום לשיבוץ התדיר");
        setLoading(false);
        return;
      }
    }

    try {
      const response = await authenticatedFetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          type: formData.assignment_type,
          assignable_id: "manual",
          is_manual: true,
          activity_type: formData.activity_type,
          specific_date: formData.date,
          days_of_week: formData.assignment_type === "recurring" ? formData.days_of_week : [],
          time_slots: [{ start: formData.start_time, end: formData.end_time }],
          date: formData.date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          end_date: formData.end_date || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || errorData.explanation || "שגיאה ביצירת שיבוץ");
        return;
      }

      alert("השיבוץ נוצר בהצלחה!");
      if (
        shouldShowMaintenanceAlert({
          startTime: formData.start_time,
          endTime: formData.end_time,
          isAuditorium: isSelectedRoomAuditorium,
          activityType: formData.activity_type,
        })
      ) {
        alert(MAINTENANCE_AFTER_HOURS_MESSAGE);
      }

      setFormData({
        room_id: "",
        date: "",
        start_time: "",
        end_time: "",
        activity_type: DEFAULT_ACTIVITY_TYPE,
        assignment_type: "one_time",
        days_of_week: [],
        end_date: "",
      });
      await fetchAssignments();
    } catch (error) {
      console.error("Error creating assignment:", error);
      alert("שגיאה ביצירת שיבוץ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <button onClick={() => router.back()} className="mb-4 text-blue-600 hover:text-blue-800">
              חזור
            </button>
            <h1 className="text-2xl font-bold text-gray-900">שיבוץ ידני</h1>
            <p className="text-gray-600">צרי שיבוץ ידני לחדר ולזמן ספציפיים</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">יצירת שיבוץ חדש</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">חדר</label>
                  <select
                    value={formData.room_id}
                    onChange={(e) => handleRoomChange(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="">בחר חדר</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.room_number} - {room.room_type}
                      </option>
                    ))}
                  </select>
                </div>

                <HebrewDateField
                  label="תאריך"
                  value={formData.date}
                  onChange={(value) => setFormData({ ...formData, date: value })}
                  required
                  inputClassName="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">שעת התחלה</label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">שעת סיום</label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">סוג תדירות</label>
                  <select
                    value={formData.assignment_type}
                    onChange={(e) =>
                      setFormData({ ...formData, assignment_type: e.target.value as "one_time" | "recurring" })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="one_time">חד פעמי</option>
                    <option value="recurring">תדיר</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">סוג השיבוץ</label>
                  <select
                    value={formData.activity_type}
                    onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="">בחרו סוג פעילות</option>
                    {activityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isSelectedRoomAuditorium && (
                    <p className="mt-1 text-xs text-amber-700">
                      באולם שיבוץ ידני מוגבל להרצאת שכבה או אירוע באישור הנהלה.
                    </p>
                  )}
                </div>

                {formData.assignment_type === "recurring" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">ימים בשבוע</label>
                      <div className="grid grid-cols-2 gap-2">
                        {["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"].map((day, index) => (
                          <label key={index} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.days_of_week.includes(index)}
                              onChange={(e) => {
                                const newDays = e.target.checked
                                  ? [...formData.days_of_week, index]
                                  : formData.days_of_week.filter((value) => value !== index);
                                setFormData({ ...formData, days_of_week: newDays });
                              }}
                              className="ml-2"
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    </div>

                    <HebrewDateField
                      label="תאריך סיום"
                      value={formData.end_date}
                      onChange={(value) => setFormData({ ...formData, end_date: value })}
                      required={formData.assignment_type === "recurring"}
                      inputClassName="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-blue-500"
                    />
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? "יוצר שיבוץ..." : "צור שיבוץ"}
                </button>
              </form>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold">שיבוצים קיימים</h2>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {assignments.length === 0 ? (
                  <p className="text-gray-500">אין שיבוצים קיימים</p>
                ) : (
                  assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-md border border-gray-200 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">
                            {assignment.title || getActivityTypeText(assignment.activity_type || "")}
                          </p>
                          <p className="text-sm text-gray-600">
                            {formatHebrewDate(assignment.date, { includeWeekday: true }) || assignment.date} |{" "}
                            {assignment.start_time} - {assignment.end_time}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm("למחוק שיבוץ זה?")) {
                              // TODO: Implement delete functionality
                            }
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
